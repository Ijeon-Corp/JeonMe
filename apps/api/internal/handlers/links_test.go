package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/jeonme/api/internal/database"
)

// fakeAuth mensimulasikan middleware.AuthRequired tanpa perlu JWT sungguhan --
// userID diambil langsung dari header test "X-Test-UserID", supaya handler
// links.go bisa diuji terisolasi dari alur login.
func fakeAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("userID", c.GetHeader("X-Test-UserID"))
		c.Next()
	}
}

// registerTestUser mendaftarkan satu user lewat AuthHandler.Register sungguhan
// (bukan insert manual) supaya baris "pages" ikut terbuat sesuai alur asli.
func registerTestUser(t *testing.T, auth *AuthHandler) (userID string) {
	t.Helper()
	router := gin.New()
	router.POST("/register", auth.Register)

	suffix := uuid.NewString()[:8]
	rec := doJSON(t, router, http.MethodPost, "/register", map[string]any{
		"email": "links-" + suffix + "@example.com", "password": "password123", "username": "links" + suffix,
		"consent_accepted": true,
	}, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("gagal setup user test: status %d, body %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode response register: %v", err)
	}
	return resp.ID
}

func newTestLinksHandler(t *testing.T) (*LinksHandler, *AuthHandler) {
	t.Helper()
	dbURL := mustEnv(t, "DATABASE_URL")
	redisURL := mustEnv(t, "REDIS_URL")

	db, err := database.NewPostgresPool(dbURL)
	if err != nil {
		t.Fatalf("gagal konek database test: %v", err)
	}
	t.Cleanup(db.Close)

	rdb, err := database.NewRedisClient(redisURL)
	if err != nil {
		t.Fatalf("gagal konek redis test: %v", err)
	}
	t.Cleanup(func() { rdb.Close() })

	return NewLinksHandler(db, nil, rdb, nil), NewAuthHandler(db, rdb, "test-secret", "test")
}

// Alur inti CRUD tautan: buat, muncul di List berurutan, lalu bisa diedit.
func TestLinksCreateListUpdate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/links", links.List)
	g.POST("/links", links.Create)
	g.PATCH("/links/:id", links.Update)

	headers := map[string]string{"X-Test-UserID": userID}

	createRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Website Saya", "url": "https://example.com",
	}, headers)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create gagal: status %d, body %s", createRec.Code, createRec.Body.String())
	}

	var created linkItem
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created link: %v", err)
	}
	if !created.IsActive {
		t.Fatalf("tautan baru seharusnya is_active=true")
	}

	listRec := doJSON(t, router, http.MethodGet, "/links", nil, headers)
	var items []linkItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode list: %v", err)
	}
	if len(items) != 1 || items[0].ID != created.ID {
		t.Fatalf("List = %+v, ekspektasi tepat 1 tautan yang baru dibuat", items)
	}

	updateRec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{
		"is_active": false,
	}, headers)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update gagal: status %d, body %s", updateRec.Code, updateRec.Body.String())
	}
}

// Kepemilikan HARUS ditegakkan: user B tidak boleh bisa mengedit/menghapus
// tautan milik user A hanya dengan menebak ID tautan.
func TestLinks_OwnershipEnforced(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userA := registerTestUser(t, auth)
	userB := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/links", links.Create)
	g.PATCH("/links/:id", links.Update)
	g.DELETE("/links/:id", links.Delete)

	createRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Punya A", "url": "https://a.example.com",
	}, map[string]string{"X-Test-UserID": userA})
	var created linkItem
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created link: %v", err)
	}

	// userB mencoba mengedit tautan milik userA -- harus ditolak.
	updateRec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]string{
		"title": "Dibajak",
	}, map[string]string{"X-Test-UserID": userB})
	if updateRec.Code != http.StatusNotFound {
		t.Fatalf("update lintas-akun = %d, ekspektasi %d (ditolak)", updateRec.Code, http.StatusNotFound)
	}

	// userB mencoba menghapus tautan milik userA -- harus ditolak.
	deleteRec := doJSON(t, router, http.MethodDelete, "/links/"+created.ID, nil, map[string]string{"X-Test-UserID": userB})
	if deleteRec.Code != http.StatusNotFound {
		t.Fatalf("delete lintas-akun = %d, ekspektasi %d (ditolak)", deleteRec.Code, http.StatusNotFound)
	}
}

// Permintaan langsung pengguna, 20 Agustus 2026: "di bagian link bio di
// blok nya tambahkan fungsi duplicate". Duplikat harus menyalin field
// (judul diberi akhiran " (Salinan)", URL sama persis) dan muncul sebagai
// baris KEDUA (posisi lebih besar dari aslinya) -- BUKAN menyisip tepat
// setelah aslinya, ditaruh di paling akhir.
func TestLinksDuplicate_CopiesFieldsAndAppendsAtEnd(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/links", links.Create)
	g.POST("/links/:id/duplicate", links.Duplicate)
	g.GET("/links", links.List)
	headers := map[string]string{"X-Test-UserID": userID}

	createRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Website Saya", "url": "https://example.com",
	}, headers)
	var created linkItem
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created link: %v", err)
	}

	dupRec := doJSON(t, router, http.MethodPost, "/links/"+created.ID+"/duplicate", nil, headers)
	if dupRec.Code != http.StatusCreated {
		t.Fatalf("duplicate gagal: status %d, body %s", dupRec.Code, dupRec.Body.String())
	}
	var dupResp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(dupRec.Body.Bytes(), &dupResp); err != nil {
		t.Fatalf("gagal decode respons duplicate: %v", err)
	}
	if dupResp.ID == created.ID {
		t.Fatal("ID hasil duplicate sama dengan aslinya, ekspektasi baris baru")
	}

	listRec := doJSON(t, router, http.MethodGet, "/links", nil, headers)
	var items []linkItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode list: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("jumlah tautan = %d, ekspektasi 2 (asli + duplikat)", len(items))
	}
	// List terurut per position ASC -- duplikat (posisi lebih besar) harus
	// jadi item KEDUA, bukan pertama.
	original, duplicate := items[0], items[1]
	if original.ID != created.ID {
		t.Fatalf("item pertama = %q, ekspektasi tautan asli %q (posisi tidak berubah)", original.ID, created.ID)
	}
	if duplicate.ID != dupResp.ID {
		t.Fatalf("item kedua = %q, ekspektasi duplikat %q (posisi paling akhir)", duplicate.ID, dupResp.ID)
	}
	if duplicate.Title != "Website Saya (Salinan)" {
		t.Errorf("judul duplikat = %q, ekspektasi %q", duplicate.Title, "Website Saya (Salinan)")
	}
	if duplicate.URL != created.URL {
		t.Errorf("URL duplikat = %q, ekspektasi sama dengan asli %q", duplicate.URL, created.URL)
	}
	if !duplicate.IsActive {
		t.Error("duplikat seharusnya is_active=true (menyalin status aslinya)")
	}
}

func TestLinksDuplicate_OwnershipEnforced(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userA := registerTestUser(t, auth)
	userB := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/links", links.Create)
	g.POST("/links/:id/duplicate", links.Duplicate)

	createRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Punya A", "url": "https://a.example.com",
	}, map[string]string{"X-Test-UserID": userA})
	var created linkItem
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created link: %v", err)
	}

	dupRec := doJSON(t, router, http.MethodPost, "/links/"+created.ID+"/duplicate", nil, map[string]string{"X-Test-UserID": userB})
	if dupRec.Code != http.StatusNotFound {
		t.Fatalf("duplicate lintas-akun = %d, ekspektasi %d (ditolak)", dupRec.Code, http.StatusNotFound)
	}
}

// Permintaan langsung pengguna, 20 Agustus 2026: "tambahkan juga sensitive
// content supaya nanti tampil ke user ketika mau akses" -- lock_type
// "sensitive" TIDAK butuh field tambahan apa pun (beda dari "age"/"code"),
// pola sama dengan "subscribe".
func TestLinksUpdate_AcceptsSensitiveLockTypeWithoutExtraFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/links", links.Create)
	g.PATCH("/links/:id", links.Update)
	g.GET("/links", links.List)
	headers := map[string]string{"X-Test-UserID": userID}

	createRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Konten Dewasa", "url": "https://example.com/sensitif",
	}, headers)
	var created linkItem
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created link: %v", err)
	}

	updateRec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{
		"lock_type": "sensitive",
	}, headers)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("set lock_type=sensitive gagal: status %d, body %s", updateRec.Code, updateRec.Body.String())
	}

	listRec := doJSON(t, router, http.MethodGet, "/links", nil, headers)
	var items []linkItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode list: %v", err)
	}
	if len(items) != 1 || items[0].LockType != "sensitive" {
		t.Fatalf("items = %+v, ekspektasi 1 tautan dengan lock_type=sensitive", items)
	}
}

// Unlock untuk lock_type="sensitive" harus SELALU berhasil tanpa verifikasi
// apa pun (murni klik persetujuan) -- pola sama persis dengan "age".
func TestLinksUnlock_SensitiveLockType_SucceedsWithoutVerification(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/links", links.Create)
	g.PATCH("/links/:id", links.Update)
	router.POST("/links/:id/unlock", links.Unlock)
	headers := map[string]string{"X-Test-UserID": userID}

	createRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Konten Dewasa", "url": "https://example.com/sensitif",
	}, headers)
	var created linkItem
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created link: %v", err)
	}
	doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"lock_type": "sensitive"}, headers)

	// Unlock PUBLIK -- SENGAJA tanpa header X-Test-UserID (pengunjung
	// halaman publik tidak login), body kosong (tidak ada code/email/whatsapp
	// yang perlu dikirim untuk "sensitive").
	unlockRec := doJSON(t, router, http.MethodPost, "/links/"+created.ID+"/unlock", map[string]any{}, nil)
	if unlockRec.Code != http.StatusOK {
		t.Fatalf("unlock sensitive gagal: status %d, body %s", unlockRec.Code, unlockRec.Body.String())
	}
	var unlockResp struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(unlockRec.Body.Bytes(), &unlockResp); err != nil {
		t.Fatalf("gagal decode respons unlock: %v", err)
	}
	if unlockResp.URL != created.URL {
		t.Errorf("url hasil unlock = %q, ekspektasi %q", unlockResp.URL, created.URL)
	}
}

// Blok "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
// file pdf download". Pola SAMA PERSIS dengan blok "gallery"/"audio" --
// dibuat DULU dengan block_data kosong (file_url diisi setelahnya lewat
// UploadFile, tidak diuji di sini karena butuh object storage sungguhan,
// pola sama seperti audio/gallery yang juga tidak punya test upload
// terpisah) -- test ini memastikan oneof binding & validateBlockData
// benar-benar menerima block_type "file" tanpa field tambahan apa pun.
func TestLinksCreateBlock_AcceptsFileBlockType(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/blocks", links.CreateBlock)
	g.GET("/links", links.List)
	headers := map[string]string{"X-Test-UserID": userID}

	createRec := doJSON(t, router, http.MethodPost, "/blocks", map[string]any{
		"block_type": "file", "title": "Download E-book Gratis",
	}, headers)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("buat blok file gagal: status %d, body %s", createRec.Code, createRec.Body.String())
	}

	listRec := doJSON(t, router, http.MethodGet, "/links", nil, headers)
	var items []linkItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode list: %v", err)
	}
	if len(items) != 1 || items[0].BlockType != "file" || items[0].Title != "Download E-book Gratis" {
		t.Fatalf("items = %+v, ekspektasi 1 blok dengan block_type=file", items)
	}
}
