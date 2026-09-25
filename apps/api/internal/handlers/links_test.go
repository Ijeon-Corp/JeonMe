package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
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

// Warna ikon kustom -- permintaan langsung pengguna, 22 Agustus 2026: "bisa
// mengubah warna yang kita inginkan untuk icon di blok daripada hanya
// warna hitam saja". Format hex divalidasi MANUAL (bukan tag "hexcolor"
// bawaan validator) -- lihat catatan lengkap di updateLinkRequest.IconColor
// kenapa (omitempty pada *string TIDAK menganggap pointer non-nil ke ""
// sebagai "kosong", jadi "hexcolor" tetap menolak "" padahal seharusnya
// lolos sebagai sinyal "batalkan warna"). Test ini membuktikan KETIGA
// perilaku sekaligus: format valid diterima, format tidak valid ditolak,
// & string kosong eksplisit berhasil membatalkan (bukan ikut ditolak).
func TestLinksUpdate_IconColorValidatesHexAndAllowsClearing(t *testing.T) {
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
		"title": "Tautan Warna", "url": "https://example.com/warna",
	}, headers)
	var created linkItem
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created link: %v", err)
	}

	invalidRec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"icon_color": "not-a-color"}, headers)
	if invalidRec.Code != http.StatusBadRequest {
		t.Fatalf("warna hex tidak valid seharusnya ditolak: status %d, body %s", invalidRec.Code, invalidRec.Body.String())
	}

	validRec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"icon_color": "#3366ff"}, headers)
	if validRec.Code != http.StatusOK {
		t.Fatalf("set warna valid gagal: status %d, body %s", validRec.Code, validRec.Body.String())
	}

	listRec := doJSON(t, router, http.MethodGet, "/links", nil, headers)
	var items []linkItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode list: %v", err)
	}
	if len(items) != 1 || items[0].IconColor != "#3366ff" {
		t.Fatalf("items = %+v, ekspektasi icon_color=#3366ff", items)
	}

	clearRec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"icon_color": ""}, headers)
	if clearRec.Code != http.StatusOK {
		t.Fatalf("membatalkan warna (string kosong) seharusnya berhasil: status %d, body %s", clearRec.Code, clearRec.Body.String())
	}

	listRec2 := doJSON(t, router, http.MethodGet, "/links", nil, headers)
	var items2 []linkItem
	if err := json.Unmarshal(listRec2.Body.Bytes(), &items2); err != nil {
		t.Fatalf("gagal decode list: %v", err)
	}
	if len(items2) != 1 || items2[0].IconColor != "" {
		t.Fatalf("items2 = %+v, ekspektasi icon_color kosong setelah dibatalkan", items2)
	}
}

// TestLinksCreate_BlocksSensitiveKeywordAndCachesDomainVerdict -- permintaan
// langsung pengguna, 22 Agustus 2026: "sistem bisa memblokir jika
// memasukkan link yang sensitif contoh nya link judol link 18+ dll".
// Sengaja TANPA moderation.Client (AI) -- menguji dua lapis deterministik
// saja (blocked_keywords + cache link_domain_verdicts), lapis AI diuji
// terpisah lewat unit test murni di internal/moderation kalau perlu (butuh
// ANTHROPIC_API_KEY sungguhan, di luar cakupan test handler ini).
func TestLinksCreate_BlocksSensitiveKeywordAndCachesDomainVerdict(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	links.Moderation = &LinkModerationChecker{DB: links.DB}
	userID := registerTestUser(t, auth)

	ctx := t.Context()
	testKeyword := "kwtestslot" + uuid.NewString()[:8]
	testDomain := "domain-test-" + uuid.NewString()[:8] + ".example"
	cleanDomain := "domain-clean-" + uuid.NewString()[:8] + ".example"
	if _, err := links.DB.Exec(ctx, `INSERT INTO blocked_keywords (id, keyword, category, created_at) VALUES ($1, $2, 'judi_online', now())`,
		uuid.NewString(), testKeyword); err != nil {
		t.Fatalf("gagal seed kata kunci test: %v", err)
	}
	t.Cleanup(func() {
		// context.Background(), BUKAN ctx (t.Context()) -- t.Context()
		// dibatalkan TEPAT SEBELUM fungsi ter-daftar t.Cleanup dijalankan
		// (ditemukan lewat verifikasi langsung: baris test ini sebelumnya
		// memakai ctx, query DELETE gagal diam-diam krn context sudah
		// dibatalkan, error-nya dibuang lewat "_, _ =", sisa data test
		// menumpuk di database tanpa ketahuan).
		cleanupCtx := context.Background()
		_, _ = links.DB.Exec(cleanupCtx, `DELETE FROM blocked_keywords WHERE keyword = $1`, testKeyword)
		_, _ = links.DB.Exec(cleanupCtx, `DELETE FROM link_domain_verdicts WHERE domain IN ($1, $2)`, testDomain, cleanDomain)
	})

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/links", links.Create)
	headers := map[string]string{"X-Test-UserID": userID}

	// 1. URL domain baru + path mengandung kata kunci -- harus ditolak.
	blockedRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Tautan Uji", "url": "https://" + testDomain + "/" + testKeyword,
	}, headers)
	if blockedRec.Code != http.StatusBadRequest {
		t.Fatalf("tautan dgn kata kunci sensitif seharusnya ditolak: status %d, body %s", blockedRec.Code, blockedRec.Body.String())
	}
	var blockedBody struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(blockedRec.Body.Bytes(), &blockedBody)
	if blockedBody.Error == "" {
		t.Fatalf("pesan error blokir seharusnya tidak kosong, body: %s", blockedRec.Body.String())
	}

	// 2. Domain itu sekarang harus ter-cache sebagai blocked, source=keyword.
	var verdict, source string
	if err := links.DB.QueryRow(ctx, `SELECT verdict, source FROM link_domain_verdicts WHERE domain = $1`, testDomain).
		Scan(&verdict, &source); err != nil {
		t.Fatalf("verdict domain seharusnya ter-cache: %v", err)
	}
	if verdict != "blocked" || source != "keyword" {
		t.Fatalf("verdict = %q, source = %q, ekspektasi blocked/keyword", verdict, source)
	}

	// 3. Path BERBEDA (tanpa kata kunci) ke domain yang SAMA tetap ditolak --
	// cache per-domain (lapis 1) berlaku lebih dulu, tidak perlu cocok kata
	// kunci lagi setelah domain diputuskan.
	secondRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Tautan Uji Lain", "url": "https://" + testDomain + "/halaman-lain-tanpa-kata-kunci",
	}, headers)
	if secondRec.Code != http.StatusBadRequest {
		t.Fatalf("domain yang sudah ter-cache blocked seharusnya tetap ditolak: status %d, body %s", secondRec.Code, secondRec.Body.String())
	}

	// 4. Domain bersih (tidak ada kaitan sama sekali) tetap lolos seperti biasa.
	okRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Tautan Aman", "url": "https://" + cleanDomain + "/halaman-biasa",
	}, headers)
	if okRec.Code != http.StatusCreated {
		t.Fatalf("tautan domain bersih seharusnya lolos: status %d, body %s", okRec.Code, okRec.Body.String())
	}
}

// TestLinksCreate_DomainExactMatchType -- perbaikan lubang deteksi
// ditemukan pengguna 5 September 2026: "https://slot.com" (domain BARE
// tanpa hiasan apa pun) lolos moderasi karena "slot" sengaja tidak
// diikutkan sbg substring bare (lihat migrasi 000091). Menguji match_type
// "domain_exact": (1) domain yang PERSIS SAMA dgn kata kunci harus
// diblokir walau tidak ada frasa apa pun di title/path, (2) kata kunci yang
// cuma jadi SUBSTRING sebuah label domain lain (bukan label itu sendiri)
// TIDAK ikut diblokir -- justru itulah alasan match_type ini dipisah dari
// "substring", supaya kata generik satu-suku-kata tidak salah blokir
// brand/bisnis sah yang kebetulan memuat kata itu.
func TestLinksCreate_DomainExactMatchType(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	links.Moderation = &LinkModerationChecker{DB: links.DB}
	userID := registerTestUser(t, auth)

	ctx := t.Context()
	testWord := "kwtestexact" + uuid.NewString()[:8]
	exactDomain := testWord + ".example"
	substringDomain := "safe" + testWord + "brand.example"
	if _, err := links.DB.Exec(ctx, `INSERT INTO blocked_keywords (id, keyword, category, match_type, created_at) VALUES ($1, $2, 'judi_online', 'domain_exact', now())`,
		uuid.NewString(), testWord); err != nil {
		t.Fatalf("gagal seed kata kunci domain_exact test: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx := context.Background()
		_, _ = links.DB.Exec(cleanupCtx, `DELETE FROM blocked_keywords WHERE keyword = $1`, testWord)
		_, _ = links.DB.Exec(cleanupCtx, `DELETE FROM link_domain_verdicts WHERE domain IN ($1, $2)`, exactDomain, substringDomain)
	})

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/links", links.Create)
	headers := map[string]string{"X-Test-UserID": userID}

	// 1. Domain PERSIS SAMA dgn kata kunci -- tanpa frasa/hiasan apa pun di
	// judul/path -- harus ditolak.
	blockedRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Tautan Biasa Saja", "url": "https://" + exactDomain + "/",
	}, headers)
	if blockedRec.Code != http.StatusBadRequest {
		t.Fatalf("domain persis kata kunci domain_exact seharusnya ditolak: status %d, body %s", blockedRec.Code, blockedRec.Body.String())
	}

	// 2. Kata kunci yang sama, tapi cuma jadi SUBSTRING label domain lain
	// (bukan label itu sendiri) -- HARUS lolos, ini justru poin utama
	// match_type "domain_exact" (beda dari "substring").
	safeRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{
		"title": "Tautan Brand Sah", "url": "https://" + substringDomain + "/halaman",
	}, headers)
	if safeRec.Code != http.StatusCreated {
		t.Fatalf("kata kunci domain_exact sbg substring label lain seharusnya TETAP lolos: status %d, body %s", safeRec.Code, safeRec.Body.String())
	}
}

// TestValidateBlockData_BuilderSectionColumn -- Canvas Page Builder (migrasi
// 000096): validateBlockDataAtDepth adalah fungsi murni (tanpa DB), jadi
// diuji langsung di sini tanpa perlu router/DB, mengikuti pola yang sudah
// ada utk validasi struktur blok (lihat catatan lengkap di
// allowedBuilderEmbeddedBlockTypes, links.go).
func TestValidateBlockData_BuilderSectionColumn(t *testing.T) {
	child := func(id, blockType string) map[string]any {
		return map[string]any{"id": id, "block_type": blockType, "title": "", "block_data": map[string]any{}}
	}

	t.Run("section kosong (shell) lolos", func(t *testing.T) {
		if _, ok := validateBlockData("section", map[string]any{}); !ok {
			t.Fatal("section tanpa children[] seharusnya lolos (shell dibuat dulu)")
		}
	})

	t.Run("section dengan children valid lolos", func(t *testing.T) {
		data := map[string]any{"children": []any{child("c1", "text"), child("c2", "divider")}}
		if msg, ok := validateBlockData("section", data); !ok {
			t.Fatalf("section dengan children valid seharusnya lolos, dapat: %s", msg)
		}
	})

	t.Run("section children melebihi batas ditolak", func(t *testing.T) {
		children := make([]any, maxBuilderContainerChildren+1)
		for i := range children {
			children[i] = child(uuid.NewString(), "text")
		}
		if _, ok := validateBlockData("section", map[string]any{"children": children}); ok {
			t.Fatal("section dengan children melebihi batas seharusnya ditolak")
		}
	})

	t.Run("section child id duplikat ditolak", func(t *testing.T) {
		data := map[string]any{"children": []any{child("dup", "text"), child("dup", "divider")}}
		if _, ok := validateBlockData("section", data); ok {
			t.Fatal("id anak duplikat di dalam section seharusnya ditolak")
		}
	})

	t.Run("section child block_type tak dikenal ditolak", func(t *testing.T) {
		data := map[string]any{"children": []any{child("c1", "catalog")}}
		if _, ok := validateBlockData("section", data); ok {
			t.Fatal("block_type yang tidak ada di allowedBuilderEmbeddedBlockTypes seharusnya ditolak sbg anak section")
		}
	})

	t.Run("column jumlah di luar rentang ditolak", func(t *testing.T) {
		tooFew := map[string]any{"columns": []any{map[string]any{}}}
		if _, ok := validateBlockData("column", tooFew); ok {
			t.Fatal("column dengan 1 entri (< minBuilderColumns) seharusnya ditolak")
		}
		tooMany := map[string]any{"columns": []any{map[string]any{}, map[string]any{}, map[string]any{}, map[string]any{}, map[string]any{}}}
		if _, ok := validateBlockData("column", tooMany); ok {
			t.Fatal("column dengan 5 entri (> maxBuilderColumns) seharusnya ditolak")
		}
	})

	t.Run("column dalam rentang dengan children valid per kolom lolos", func(t *testing.T) {
		data := map[string]any{"columns": []any{
			map[string]any{"children": []any{child("c1", "text")}},
			map[string]any{"children": []any{child("c2", "button")}},
		}}
		if msg, ok := validateBlockData("column", data); !ok {
			t.Fatalf("column 2 kolom dengan anak block_type yang diizinkan seharusnya lolos, dapat: %s", msg)
		}
	})

	// "image" SEBELUMNYA dipakai sbg contoh tipe-belum-diizinkan (Fase 1) --
	// sekarang SUDAH diizinkan sejak Fase 2 (lihat
	// TestValidateBlockData_BuilderMediaTypes), jadi diganti "catalog"
	// (TETAP sengaja dikecualikan dari builder di v1, lihat catatan lengkap
	// di allowedBuilderEmbeddedBlockTypes soal cross-nesting) supaya test
	// ini tetap membuktikan penolakan tipe yang genuinely belum diizinkan.
	t.Run("column dengan anak block_type belum diizinkan (catalog, tidak cross-nest dgn builder) ditolak", func(t *testing.T) {
		data := map[string]any{"columns": []any{
			map[string]any{"children": []any{child("c1", "catalog")}},
			map[string]any{},
		}}
		if _, ok := validateBlockData("column", data); ok {
			t.Fatal("catalog SENGAJA tidak ada di allowedBuilderEmbeddedBlockTypes (tidak cross-nest dgn builder), seharusnya ditolak sbg anak column")
		}
	})

	t.Run("section berisi column berisi section (nested) lolos sampai batas kedalaman", func(t *testing.T) {
		innerSection := map[string]any{"id": "s2", "block_type": "section", "title": "", "block_data": map[string]any{"children": []any{child("t1", "text")}}}
		columnData := map[string]any{"columns": []any{map[string]any{"children": []any{innerSection}}, map[string]any{}}}
		column := map[string]any{"id": "col1", "block_type": "column", "title": "", "block_data": columnData}
		rootSection := map[string]any{"children": []any{column}}
		if msg, ok := validateBlockData("section", rootSection); !ok {
			t.Fatalf("section->column->section bersarang dalam batas kedalaman seharusnya lolos, dapat: %s", msg)
		}
	})

	t.Run("nesting melebihi maxBuilderDepth ditolak", func(t *testing.T) {
		// depth mulai dari 1 di root -- panggil langsung di depth
		// maxBuilderDepth+1 utk mensimulasikan section yang sudah tertanam
		// terlalu dalam, tanpa perlu membangun literal bersarang panjang.
		if _, ok := validateBlockDataAtDepth("section", map[string]any{}, maxBuilderDepth+1); ok {
			t.Fatal("section pada depth melebihi maxBuilderDepth seharusnya ditolak")
		}
		if _, ok := validateBlockDataAtDepth("column", map[string]any{}, maxBuilderDepth+1); ok {
			t.Fatal("column pada depth melebihi maxBuilderDepth seharusnya ditolak")
		}
	})

	t.Run("text kosong di depth 1 sekarang lolos (shell-first canvas)", func(t *testing.T) {
		if msg, ok := validateBlockData("text", map[string]any{}); !ok {
			t.Fatalf("text kosong di root seharusnya lolos sejak Canvas Page Builder, dapat: %s", msg)
		}
	})

	t.Run("accordion kosong di depth 1 tetap ditolak (tidak terpengaruh relaksasi text)", func(t *testing.T) {
		if _, ok := validateBlockData("accordion", map[string]any{}); ok {
			t.Fatal("accordion kosong di root seharusnya TETAP ditolak seperti sebelumnya")
		}
	})
}

// TestResolveBuilderBlockData -- Canvas Page Builder Fase 2 (permintaan
// langsung pengguna 8 September 2026: "kerjakan penuh sekalian root +
// bersarang"): resolveBuilderBlockData adalah fungsi murni (tanpa DB),
// diuji langsung sama seperti validateBlockDataAtDepth di atas.
func TestResolveBuilderBlockData(t *testing.T) {
	t.Run("path kosong mengembalikan rootData itu sendiri", func(t *testing.T) {
		root := map[string]any{"image_url": "https://old.example/a.webp"}
		data, blockType, ok := resolveBuilderBlockData(root, "image", nil)
		if !ok {
			t.Fatal("path kosong seharusnya selalu resolve")
		}
		if blockType != "image" {
			t.Fatalf("blockType seharusnya \"image\", dapat %q", blockType)
		}
		data["image_url"] = "https://new.example/a.webp"
		if root["image_url"] != "https://new.example/a.webp" {
			t.Fatal("memutasi data hasil path kosong seharusnya langsung memutasi rootData (referensi yang sama)")
		}
	})

	t.Run("satu tingkat -- child langsung di children Section", func(t *testing.T) {
		root := map[string]any{
			"children": []any{
				map[string]any{"id": "img-1", "block_type": "image", "block_data": map[string]any{}},
			},
		}
		data, blockType, ok := resolveBuilderBlockData(root, "section", []builderPathSeg{{Kind: "child", ID: "img-1"}})
		if !ok || blockType != "image" {
			t.Fatalf("seharusnya resolve ke blok image, dapat ok=%v blockType=%q", ok, blockType)
		}
		data["image_url"] = "https://example.com/nested.webp"

		// Verifikasi mutasi tercermin balik ke root lewat marshal ulang --
		// ini kontrak yang dipakai SEMUA endpoint upload/hapus (marshal
		// rootData SEKALI di akhir, bukan tulis-balik manual per level).
		encoded, err := json.Marshal(root)
		if err != nil {
			t.Fatalf("marshal gagal: %v", err)
		}
		if !strings.Contains(string(encoded), "https://example.com/nested.webp") {
			t.Fatalf("mutasi child block_data seharusnya tercermin di root yang di-marshal ulang, dapat: %s", encoded)
		}
	})

	t.Run("bersarang: section -> column -> child", func(t *testing.T) {
		root := map[string]any{
			"children": []any{
				map[string]any{
					"id":         "col-1",
					"block_type": "column",
					"block_data": map[string]any{
						"columns": []any{
							map[string]any{"children": []any{
								map[string]any{"id": "img-2", "block_type": "image", "block_data": map[string]any{}},
							}},
							map[string]any{"children": []any{}},
						},
					},
				},
			},
		}
		path := []builderPathSeg{{Kind: "child", ID: "col-1"}, {Kind: "column", Index: 0}, {Kind: "child", ID: "img-2"}}
		data, blockType, ok := resolveBuilderBlockData(root, "section", path)
		if !ok || blockType != "image" {
			t.Fatalf("seharusnya resolve ke blok image bersarang 2 tingkat, dapat ok=%v blockType=%q", ok, blockType)
		}
		data["image_url"] = "https://example.com/deep.webp"
		encoded, _ := json.Marshal(root)
		if !strings.Contains(string(encoded), "https://example.com/deep.webp") {
			t.Fatalf("mutasi blok bersarang 2 tingkat seharusnya tercermin di root, dapat: %s", encoded)
		}

		// Kolom KEDUA (index 1, children kosong) TIDAK boleh ikut kena --
		// pastikan path-walking tidak salah taruh ke sibling column.
		col1Children := ((root["children"].([]any))[0].(map[string]any)["block_data"].(map[string]any)["columns"].([]any))[1].(map[string]any)["children"].([]any)
		if len(col1Children) != 0 {
			t.Fatal("kolom kedua seharusnya tidak tersentuh sama sekali")
		}
	})

	t.Run("path merujuk id yang tidak ada -> not ok", func(t *testing.T) {
		root := map[string]any{"children": []any{map[string]any{"id": "img-1", "block_type": "image", "block_data": map[string]any{}}}}
		_, _, ok := resolveBuilderBlockData(root, "section", []builderPathSeg{{Kind: "child", ID: "tidak-ada"}})
		if ok {
			t.Fatal("id yang tidak ada di children seharusnya gagal resolve")
		}
	})

	t.Run("path berakhir di segmen column -> not ok (kolom bukan blok)", func(t *testing.T) {
		root := map[string]any{
			"children": []any{
				map[string]any{"id": "col-1", "block_type": "column", "block_data": map[string]any{"columns": []any{map[string]any{}}}},
			},
		}
		_, _, ok := resolveBuilderBlockData(root, "section", []builderPathSeg{{Kind: "child", ID: "col-1"}, {Kind: "column", Index: 0}})
		if ok {
			t.Fatal("path yang berakhir di segmen column seharusnya ditolak (kolom tidak punya block_data/block_type sendiri)")
		}
	})

	t.Run("index kolom di luar jangkauan -> not ok", func(t *testing.T) {
		root := map[string]any{
			"children": []any{
				map[string]any{"id": "col-1", "block_type": "column", "block_data": map[string]any{"columns": []any{map[string]any{}}}},
			},
		}
		_, _, ok := resolveBuilderBlockData(root, "section", []builderPathSeg{{Kind: "child", ID: "col-1"}, {Kind: "column", Index: 5}, {Kind: "child", ID: "x"}})
		if ok {
			t.Fatal("index kolom di luar jangkauan seharusnya gagal resolve")
		}
	})
}

// TestValidateBlockData_BuilderMediaTypes -- Canvas Page Builder Fase 2
// (permintaan langsung pengguna 8 September 2026): video/faq/image
// dilonggarkan supaya shell-first di ROOT juga (sebelumnya cuma tertanam),
// video_image/embed_link tipe baru sepenuhnya opsional di semua depth.
func TestValidateBlockData_BuilderMediaTypes(t *testing.T) {
	t.Run("video kosong di depth 1 sekarang lolos (shell-first)", func(t *testing.T) {
		if msg, ok := validateBlockData("video", map[string]any{}); !ok {
			t.Fatalf("video kosong di root seharusnya lolos sejak Fase 2, dapat: %s", msg)
		}
	})

	t.Run("video terisi tapi bukan YouTube/TikTok tetap ditolak", func(t *testing.T) {
		if _, ok := validateBlockData("video", map[string]any{"video_url": "https://example.com/not-a-video"}); ok {
			t.Fatal("video_url yang bukan YouTube/TikTok seharusnya tetap ditolak")
		}
	})

	t.Run("video URL YouTube valid lolos", func(t *testing.T) {
		if msg, ok := validateBlockData("video", map[string]any{"video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}); !ok {
			t.Fatalf("URL YouTube valid seharusnya lolos, dapat: %s", msg)
		}
	})

	t.Run("faq items kosong di depth 1 sekarang lolos (shell-first)", func(t *testing.T) {
		if msg, ok := validateBlockData("faq", map[string]any{}); !ok {
			t.Fatalf("faq kosong di root seharusnya lolos sejak Fase 2, dapat: %s", msg)
		}
	})

	t.Run("faq item bukan objek tetap ditolak", func(t *testing.T) {
		if _, ok := validateBlockData("faq", map[string]any{"items": []any{"bukan objek"}}); ok {
			t.Fatal("item FAQ yang bukan objek seharusnya tetap ditolak")
		}
	})

	t.Run("faq item separuh terisi (autosave onBlur per field) tetap lolos", func(t *testing.T) {
		data := map[string]any{"items": []any{map[string]any{"question": "Sudah diisi?", "answer": ""}}}
		if msg, ok := validateBlockData("faq", data); !ok {
			t.Fatalf("item FAQ separuh terisi seharusnya lolos di semua depth, dapat: %s", msg)
		}
	})

	t.Run("image kosong lolos (shell-first), URL tidak valid ditolak, URL valid lolos", func(t *testing.T) {
		if msg, ok := validateBlockData("image", map[string]any{}); !ok {
			t.Fatalf("image kosong seharusnya lolos sejak Fase 2, dapat: %s", msg)
		}
		if _, ok := validateBlockData("image", map[string]any{"image_url": "bukan-url"}); ok {
			t.Fatal("image_url tidak valid seharusnya ditolak")
		}
		if msg, ok := validateBlockData("image", map[string]any{"image_url": "https://example.com/foto.webp"}); !ok {
			t.Fatalf("image_url valid seharusnya lolos, dapat: %s", msg)
		}
	})

	t.Run("video_image -- keduanya opsional independen", func(t *testing.T) {
		if msg, ok := validateBlockData("video_image", map[string]any{}); !ok {
			t.Fatalf("video_image kosong seharusnya lolos, dapat: %s", msg)
		}
		if msg, ok := validateBlockData("video_image", map[string]any{"video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}); !ok {
			t.Fatalf("video_image dgn video_url saja seharusnya lolos, dapat: %s", msg)
		}
		if msg, ok := validateBlockData("video_image", map[string]any{"image_url": "https://example.com/foto.webp"}); !ok {
			t.Fatalf("video_image dgn image_url saja seharusnya lolos, dapat: %s", msg)
		}
		if _, ok := validateBlockData("video_image", map[string]any{"video_url": "https://example.com/not-a-video"}); ok {
			t.Fatal("video_image dgn video_url tidak valid seharusnya ditolak")
		}
		if _, ok := validateBlockData("video_image", map[string]any{"image_url": "bukan-url"}); ok {
			t.Fatal("video_image dgn image_url tidak valid seharusnya ditolak")
		}
	})

	t.Run("embed_link -- image_url opsional, divalidasi kalau ada", func(t *testing.T) {
		if msg, ok := validateBlockData("embed_link", map[string]any{}); !ok {
			t.Fatalf("embed_link kosong seharusnya lolos, dapat: %s", msg)
		}
		if _, ok := validateBlockData("embed_link", map[string]any{"image_url": "bukan-url"}); ok {
			t.Fatal("embed_link dgn image_url tidak valid seharusnya ditolak")
		}
		if msg, ok := validateBlockData("embed_link", map[string]any{"image_url": "https://example.com/thumb.webp"}); !ok {
			t.Fatalf("embed_link dgn image_url valid seharusnya lolos, dapat: %s", msg)
		}
	})

	t.Run("keenam tipe baru sekarang boleh ditanam di dalam Section", func(t *testing.T) {
		child := func(id, blockType string) map[string]any {
			return map[string]any{"id": id, "block_type": blockType, "title": "", "block_data": map[string]any{}}
		}
		for _, bt := range []string{"video", "faq", "gallery", "image", "video_image", "embed_link"} {
			data := map[string]any{"children": []any{child("c1", bt)}}
			if msg, ok := validateBlockData("section", data); !ok {
				t.Fatalf("block_type %q seharusnya sudah boleh ditanam di Section sejak Fase 2, dapat: %s", bt, msg)
			}
		}
	})
}

// TestValidateBlockData_BuilderFase3Types -- Canvas Page Builder Fase 3
// (permintaan langsung pengguna 8 September 2026): countdown/list/
// image_slider/embed + promosi "maps" ke allowlist builder (ROOT-ONLY,
// lihat catatan lengkap di plan & allowedBuilderEmbeddedBlockTypes).
func TestValidateBlockData_BuilderFase3Types(t *testing.T) {
	t.Run("countdown kosong lolos, target_at valid lolos, tidak valid ditolak", func(t *testing.T) {
		if msg, ok := validateBlockData("countdown", map[string]any{}); !ok {
			t.Fatalf("countdown kosong seharusnya lolos, dapat: %s", msg)
		}
		if msg, ok := validateBlockData("countdown", map[string]any{"target_at": "2026-12-31T23:59:59Z"}); !ok {
			t.Fatalf("target_at RFC3339 valid seharusnya lolos, dapat: %s", msg)
		}
		if _, ok := validateBlockData("countdown", map[string]any{"target_at": "31 Desember 2026"}); ok {
			t.Fatal("target_at bukan RFC3339 seharusnya ditolak")
		}
	})

	t.Run("list kosong lolos, style tidak dikenal ditolak, item tanpa judul (shell-first) tetap lolos", func(t *testing.T) {
		if msg, ok := validateBlockData("list", map[string]any{}); !ok {
			t.Fatalf("list kosong seharusnya lolos, dapat: %s", msg)
		}
		if msg, ok := validateBlockData("list", map[string]any{"style": "testimony"}); !ok {
			t.Fatalf("style \"testimony\" seharusnya lolos, dapat: %s", msg)
		}
		if _, ok := validateBlockData("list", map[string]any{"style": "grid"}); ok {
			t.Fatal("style yang tidak dikenal seharusnya ditolak")
		}
		// Shell-first (pola sama FAQ, lihat catatan lengkap di
		// validateBlockDataAtDepth case "list"): item BOLEH tanpa judul --
		// ListItemsEditor menambah baris kosong dulu ("Tambah Item"), diisi
		// belakangan lewat onBlur per field, satu field per PATCH.
		if msg, ok := validateBlockData("list", map[string]any{"items": []any{map[string]any{"description": "tanpa judul"}}}); !ok {
			t.Fatalf("item tanpa judul seharusnya tetap lolos (shell-first), dapat: %s", msg)
		}
		if _, ok := validateBlockData("list", map[string]any{"items": []any{"bukan objek"}}); ok {
			t.Fatal("item yang bukan objek seharusnya ditolak")
		}
		data := map[string]any{"items": []any{map[string]any{"title": "Budi", "description": "Mantap!", "author": "Budi S."}}}
		if msg, ok := validateBlockData("list", data); !ok {
			t.Fatalf("item lengkap seharusnya lolos, dapat: %s", msg)
		}
	})

	t.Run("image_slider pakai validasi & upload yang sama dgn gallery", func(t *testing.T) {
		if msg, ok := validateBlockData("image_slider", map[string]any{}); !ok {
			t.Fatalf("image_slider kosong seharusnya lolos, dapat: %s", msg)
		}
		if _, ok := validateBlockData("image_slider", map[string]any{"images": []any{"bukan-url"}}); ok {
			t.Fatal("image_slider dgn URL tidak valid seharusnya ditolak")
		}
		if msg, ok := validateBlockData("image_slider", map[string]any{"images": []any{"https://example.com/1.webp"}}); !ok {
			t.Fatalf("image_slider dgn URL valid seharusnya lolos, dapat: %s", msg)
		}
	})

	t.Run("embed kosong lolos, provider tidak diizinkan ditolak, provider diizinkan lolos", func(t *testing.T) {
		if msg, ok := validateBlockData("embed", map[string]any{}); !ok {
			t.Fatalf("embed kosong seharusnya lolos, dapat: %s", msg)
		}
		if _, ok := validateBlockData("embed", map[string]any{"embed_url": "https://evil-calendly.com.attacker.net/x"}); ok {
			t.Fatal("host tipuan seharusnya ditolak (exact match, bukan substring)")
		}
		for _, u := range []string{
			"https://docs.google.com/forms/d/e/abc/viewform",
			"https://calendly.com/someone",
			"https://open.spotify.com/track/abc123",
		} {
			if msg, ok := validateBlockData("embed", map[string]any{"embed_url": u}); !ok {
				t.Fatalf("embed_url %q seharusnya lolos, dapat: %s", u, msg)
			}
		}
	})

	t.Run("isAllowedEmbedHost menolak scheme selain http/https & host tidak dikenal", func(t *testing.T) {
		if isAllowedEmbedHost("javascript:alert(1)") {
			t.Fatal("scheme javascript: seharusnya ditolak")
		}
		if isAllowedEmbedHost("https://example.com") {
			t.Fatal("host yang tidak ada di allowedEmbedHosts seharusnya ditolak")
		}
	})

	t.Run("countdown/list/image_slider/embed boleh ditanam di dalam Section", func(t *testing.T) {
		child := func(id, blockType string) map[string]any {
			return map[string]any{"id": id, "block_type": blockType, "title": "", "block_data": map[string]any{}}
		}
		for _, bt := range []string{"countdown", "list", "image_slider", "embed"} {
			data := map[string]any{"children": []any{child("c1", bt)}}
			if msg, ok := validateBlockData("section", data); !ok {
				t.Fatalf("block_type %q seharusnya boleh ditanam di Section sejak Fase 3, dapat: %s", bt, msg)
			}
		}
		// "maps" dulu diuji di sini sbg contoh tipe ROOT-ONLY Fase 3 -- sejak
		// Builder improvements 18 September 2026 SUDAH boleh ditanam, lihat
		// TestValidateBlockData_BuilderNestedContactFormMaps di bawah.
	})
}

// TestValidateBlockData_BuilderNestedContactFormMaps -- Builder improvements
// 18 September 2026: "contact_form" & "maps" dicabut dari status root-only
// (lihat catatan lengkap di allowedBuilderEmbeddedBlockTypes, links.go).
// Validator struktur murni, diuji langsung seperti test Fase 1-3 di atas.
func TestValidateBlockData_BuilderNestedContactFormMaps(t *testing.T) {
	child := func(id, blockType string, data map[string]any) map[string]any {
		return map[string]any{"id": id, "block_type": blockType, "title": "", "url": "https://maps.app.goo.gl/abc", "block_data": data}
	}

	t.Run("contact_form & maps boleh ditanam langsung di Section", func(t *testing.T) {
		data := map[string]any{"children": []any{
			child("c1", "contact_form", map[string]any{}),
			child("c2", "maps", map[string]any{"embed": true}),
		}}
		if msg, ok := validateBlockData("section", data); !ok {
			t.Fatalf("contact_form/maps seharusnya boleh ditanam di Section sejak 18 September 2026, dapat: %s", msg)
		}
	})

	t.Run("contact_form & maps boleh ditanam di dalam kolom Column", func(t *testing.T) {
		data := map[string]any{"columns": []any{
			map[string]any{"children": []any{child("c1", "contact_form", map[string]any{})}},
			map[string]any{"children": []any{child("c2", "maps", map[string]any{"embed": false})}},
		}}
		if msg, ok := validateBlockData("column", data); !ok {
			t.Fatalf("contact_form/maps seharusnya boleh ditanam di Column, dapat: %s", msg)
		}
	})

	t.Run("aturan block_data maps TETAP berlaku saat tertanam (embed wajib bool)", func(t *testing.T) {
		data := map[string]any{"children": []any{child("c1", "maps", map[string]any{"embed": "ya"})}}
		if _, ok := validateBlockData("section", data); ok {
			t.Fatal("embed bukan bool seharusnya tetap ditolak walau blok maps-nya tertanam")
		}
	})

	t.Run("catalog TETAP tidak boleh ditanam (root-only)", func(t *testing.T) {
		data := map[string]any{"children": []any{child("c1", "catalog", map[string]any{})}}
		if _, ok := validateBlockData("section", data); ok {
			t.Fatal("catalog seharusnya TETAP ditolak sbg anak Section")
		}
	})
}

// TestFindEmbeddedBuilderBlock -- pencarian id blok tertanam yang dipakai
// SubmitContactForm utk Formulir Kontak di dalam Section/Column (Builder
// improvements 18 September 2026). Fungsi murni, tanpa DB.
func TestFindEmbeddedBuilderBlock(t *testing.T) {
	node := func(id, blockType string, data map[string]any) map[string]any {
		return map[string]any{"id": id, "block_type": blockType, "title": "", "block_data": data}
	}
	// section(root) -> [text, column -> [ [text], [section -> [contact_form]] ]]
	deepSection := node("s2", "section", map[string]any{"children": []any{node("cf1", "contact_form", map[string]any{})}})
	column := node("col1", "column", map[string]any{"columns": []any{
		map[string]any{"children": []any{node("t2", "text", map[string]any{})}},
		map[string]any{"children": []any{deepSection}},
	}})
	root := map[string]any{"children": []any{node("t1", "text", map[string]any{}), column}}

	t.Run("menemukan blok di kedalaman 3 lewat column", func(t *testing.T) {
		found := findEmbeddedBuilderBlock(root, "cf1")
		if found == nil {
			t.Fatal("contact_form yang tertanam di section->column->section seharusnya ditemukan")
		}
		if bt, _ := found["block_type"].(string); bt != "contact_form" {
			t.Fatalf("block_type = %q, ekspektasi contact_form", bt)
		}
	})

	t.Run("menemukan anak langsung & node kontainer itu sendiri", func(t *testing.T) {
		if findEmbeddedBuilderBlock(root, "t1") == nil {
			t.Fatal("anak langsung root seharusnya ditemukan")
		}
		if found := findEmbeddedBuilderBlock(root, "col1"); found == nil || found["block_type"] != "column" {
			t.Fatal("node column tertanam seharusnya ditemukan sbg node ber-block_type column")
		}
	})

	t.Run("id yang tidak ada / rootData nil mengembalikan nil", func(t *testing.T) {
		if findEmbeddedBuilderBlock(root, "tidak-ada") != nil {
			t.Fatal("id yang tidak ada seharusnya nil")
		}
		if findEmbeddedBuilderBlock(nil, "cf1") != nil {
			t.Fatal("rootData nil seharusnya nil, bukan panic")
		}
		// block_data root yang BUKAN kontainer (mis. baris root bertipe text)
		// tidak punya children/columns -- harus nil, bukan panic.
		if findEmbeddedBuilderBlock(map[string]any{"text": "halo"}, "cf1") != nil {
			t.Fatal("block_data tanpa children/columns seharusnya nil")
		}
	})
}

// TestResolveNestedMapsEmbedCoords -- resolusi koordinat maps TERTANAM
// (Builder improvements 18 September 2026), cermin path-aware dari blok
// resolveMapsEmbedCoords utk root. Resolver disuntik palsu supaya test
// TIDAK melakukan HTTP keluar ke Google Maps.
func TestResolveNestedMapsEmbedCoords(t *testing.T) {
	maps := func(id, url string, data map[string]any) map[string]any {
		return map[string]any{"id": id, "block_type": "maps", "title": "Kantor", "url": url, "block_data": data}
	}
	fakeResolver := func(calls *[]string) mapsCoordResolver {
		return func(_ context.Context, rawURL string) (float64, float64, error) {
			*calls = append(*calls, rawURL)
			if strings.Contains(rawURL, "rusak") {
				return 0, 0, errors.New("tautan harus berupa tautan berbagi Google Maps yang valid")
			}
			return -6.2, 106.8, nil
		}
	}

	t.Run("maps embed=true di dalam column diresolusi & koordinat ditulis di tempat", func(t *testing.T) {
		target := maps("m1", "https://maps.app.goo.gl/abc", map[string]any{"embed": true})
		data := map[string]any{"columns": []any{
			map[string]any{"children": []any{map[string]any{"id": "t1", "block_type": "text", "block_data": map[string]any{}}}},
			map[string]any{"children": []any{target}},
		}}
		var calls []string
		if err := resolveNestedMapsEmbedCoords(context.Background(), data, nil, fakeResolver(&calls)); err != nil {
			t.Fatalf("resolusi seharusnya sukses, dapat: %v", err)
		}
		bd := target["block_data"].(map[string]any)
		if bd["embed_lat"] != -6.2 || bd["embed_lng"] != 106.8 {
			t.Fatalf("embed_lat/embed_lng = %v/%v, ekspektasi -6.2/106.8 (mutasi di tempat)", bd["embed_lat"], bd["embed_lng"])
		}
		if len(calls) != 1 {
			t.Fatalf("resolver dipanggil %d kali, ekspektasi tepat 1", len(calls))
		}
	})

	t.Run("embed=false atau url kosong dilewati tanpa HTTP & tanpa error", func(t *testing.T) {
		direct := maps("m1", "https://maps.app.goo.gl/abc", map[string]any{"embed": false})
		shell := maps("m2", "", map[string]any{"embed": true})
		data := map[string]any{"children": []any{direct, shell}}
		var calls []string
		if err := resolveNestedMapsEmbedCoords(context.Background(), data, nil, fakeResolver(&calls)); err != nil {
			t.Fatalf("seharusnya tidak error, dapat: %v", err)
		}
		if len(calls) != 0 {
			t.Fatalf("resolver seharusnya TIDAK dipanggil, dipanggil utk: %v", calls)
		}
		if _, ok := shell["block_data"].(map[string]any)["embed_lat"]; ok {
			t.Fatal("maps tanpa url seharusnya dibiarkan tanpa koordinat (shell-first)")
		}
	})

	t.Run("koordinat dari prev dipakai ulang kalau url sama, diresolusi ulang kalau url berubah", func(t *testing.T) {
		prev := map[string]any{"children": []any{
			maps("sama", "https://maps.app.goo.gl/lama", map[string]any{"embed": true, "embed_lat": -7.0, "embed_lng": 110.0}),
			maps("ubah", "https://maps.app.goo.gl/lama", map[string]any{"embed": true, "embed_lat": -7.0, "embed_lng": 110.0}),
		}}
		// Klien mengirim balik koordinat "sama" dgn nilai yang DIUBAH -- yang
		// dipercaya harus nilai dari prev (DB), bukan kiriman klien.
		same := maps("sama", "https://maps.app.goo.gl/lama", map[string]any{"embed": true, "embed_lat": 99.0, "embed_lng": 99.0})
		changed := maps("ubah", "https://maps.app.goo.gl/baru", map[string]any{"embed": true, "embed_lat": -7.0, "embed_lng": 110.0})
		data := map[string]any{"children": []any{same, changed}}
		var calls []string
		if err := resolveNestedMapsEmbedCoords(context.Background(), data, prev, fakeResolver(&calls)); err != nil {
			t.Fatalf("seharusnya sukses, dapat: %v", err)
		}
		sameBD := same["block_data"].(map[string]any)
		if sameBD["embed_lat"] != -7.0 || sameBD["embed_lng"] != 110.0 {
			t.Fatalf("node url-sama seharusnya memakai koordinat prev (-7/110), dapat %v/%v", sameBD["embed_lat"], sameBD["embed_lng"])
		}
		changedBD := changed["block_data"].(map[string]any)
		if changedBD["embed_lat"] != -6.2 || changedBD["embed_lng"] != 106.8 {
			t.Fatalf("node url-berubah seharusnya diresolusi ulang (-6.2/106.8), dapat %v/%v", changedBD["embed_lat"], changedBD["embed_lng"])
		}
		if len(calls) != 1 || calls[0] != "https://maps.app.goo.gl/baru" {
			t.Fatalf("resolver seharusnya dipanggil tepat sekali utk url baru, dapat: %v", calls)
		}
	})

	t.Run("resolver gagal -> error menyebut blok, mutasi berhenti", func(t *testing.T) {
		broken := maps("m1", "https://example.com/rusak", map[string]any{"embed": true})
		data := map[string]any{"children": []any{broken}}
		var calls []string
		err := resolveNestedMapsEmbedCoords(context.Background(), data, nil, fakeResolver(&calls))
		if err == nil {
			t.Fatal("resolver gagal seharusnya diteruskan sbg error")
		}
		if !strings.Contains(err.Error(), "blok Maps tertanam (Kantor)") || !strings.Contains(err.Error(), "Google Maps") {
			t.Fatalf("pesan error seharusnya menyebut blok & alasan asli, dapat: %v", err)
		}
	})

	t.Run("block_data non-kontainer (root text) no-op", func(t *testing.T) {
		var calls []string
		if err := resolveNestedMapsEmbedCoords(context.Background(), map[string]any{"text": "halo"}, nil, fakeResolver(&calls)); err != nil || len(calls) != 0 {
			t.Fatalf("root tanpa children/columns seharusnya no-op, err=%v calls=%v", err, calls)
		}
	})
}

// TestLinksSubmitContactForm_NestedInSection -- alur nyata end-to-end di
// atas DB (Builder improvements 18 September 2026): Formulir Kontak yang
// ditanam di Section bisa di-submit pengunjung lewat id blok tertanam +
// root_link_id, sementara id tertanam TANPA root_link_id (perilaku lama)
// tetap 404, root milik kreator LAIN tidak bisa dipakai utk "meminjam" id,
// & anak tertanam bertipe bukan contact_form ditolak 400. Queue nil ->
// handler membalas 200 tanpa enqueue (pola yang sudah ada), cukup utk
// membuktikan pencarian id-nya.
func TestLinksSubmitContactForm_NestedInSection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userID := registerTestUser(t, auth)
	otherUserID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/blocks", links.CreateBlock)
	router.POST("/links/:id/contact", links.SubmitContactForm)

	embeddedContactID := uuid.NewString()
	embeddedTextID := uuid.NewString()
	createSection := func(ownerID string) string {
		rec := doJSON(t, router, http.MethodPost, "/blocks", map[string]any{
			"block_type": "section", "title": "Hubungi Kami",
			"block_data": map[string]any{"children": []any{
				map[string]any{"id": embeddedContactID, "block_type": "contact_form", "title": "Kontak", "block_data": map[string]any{}},
				map[string]any{"id": embeddedTextID, "block_type": "text", "title": "", "block_data": map[string]any{"text": "halo"}},
			}},
		}, map[string]string{"X-Test-UserID": ownerID})
		if rec.Code != http.StatusCreated {
			t.Fatalf("buat section dgn contact_form tertanam gagal: status %d, body %s", rec.Code, rec.Body.String())
		}
		var created linkItem
		if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
			t.Fatalf("gagal decode section: %v", err)
		}
		return created.ID
	}
	rootID := createSection(userID)
	otherRootID := createSection(otherUserID)

	body := func(rootLinkID string) map[string]any {
		payload := map[string]any{"name": "Budi", "email": "budi@example.com", "message": "Halo, mau tanya."}
		if rootLinkID != "" {
			payload["root_link_id"] = rootLinkID
		}
		return payload
	}

	t.Run("id tertanam + root_link_id yang benar -> 200", func(t *testing.T) {
		rec := doJSON(t, router, http.MethodPost, "/links/"+embeddedContactID+"/contact", body(rootID), nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("submit ke contact_form tertanam seharusnya 200, dapat %d, body %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("id tertanam TANPA root_link_id -> 404 (perilaku lama tidak berubah)", func(t *testing.T) {
		rec := doJSON(t, router, http.MethodPost, "/links/"+embeddedContactID+"/contact", body(""), nil)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("tanpa root_link_id seharusnya 404, dapat %d, body %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("root_link_id menunjuk root yang tidak memuat id itu -> 404", func(t *testing.T) {
		// otherRootID memuat id tertanam yang SAMA (uuid dibagi di test ini)
		// tapi milik kreator lain -- pencarian dibatasi ke root yang disebut,
		// jadi id acak yang TIDAK ada di root mana pun harus 404.
		rec := doJSON(t, router, http.MethodPost, "/links/"+uuid.NewString()+"/contact", body(rootID), nil)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("id yang tidak ada di root seharusnya 404, dapat %d, body %s", rec.Code, rec.Body.String())
		}
		rec = doJSON(t, router, http.MethodPost, "/links/"+embeddedContactID+"/contact", body(uuid.NewString()), nil)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("root_link_id yang tidak ada seharusnya 404, dapat %d, body %s", rec.Code, rec.Body.String())
		}
		rec = doJSON(t, router, http.MethodPost, "/links/"+embeddedContactID+"/contact", body("bukan-uuid"), nil)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("root_link_id non-uuid seharusnya 404 (bukan 500), dapat %d, body %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("id tertanam bertipe text -> 400 bukan formulir kontak", func(t *testing.T) {
		rec := doJSON(t, router, http.MethodPost, "/links/"+embeddedTextID+"/contact", body(rootID), nil)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("anak bertipe text seharusnya 400, dapat %d, body %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("id non-uuid tanpa root_link_id -> 404, bukan 500", func(t *testing.T) {
		rec := doJSON(t, router, http.MethodPost, "/links/bukan-uuid/contact", body(""), nil)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("id non-uuid seharusnya 404, dapat %d, body %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("root milik kreator lain tetap resolve ke root itu (penerima = pemilik root)", func(t *testing.T) {
		// Bukan celah: pengunjung memang bebas mengirim ke formulir siapa pun
		// yang benar-benar ada di halaman publik -- yang dijamin adalah
		// penerima SELALU pemilik root yang disebut, tidak pernah kreator lain.
		rec := doJSON(t, router, http.MethodPost, "/links/"+embeddedContactID+"/contact", body(otherRootID), nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("root milik kreator lain yang memang memuat id itu seharusnya 200, dapat %d, body %s", rec.Code, rec.Body.String())
		}
	})
}

// TestLinksUpdate_BlockStyle -- desain per blok (migrasi 000110): disimpan
// utuh, divalidasi, TIDAK terhapus saat field lain diubah, ikut
// terduplikasi, dan {} mengembalikan blok ke gaya tema.
func TestLinksUpdate_BlockStyle(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/links", links.Create)
	g.PATCH("/links/:id", links.Update)
	g.GET("/links", links.List)
	g.POST("/links/:id/duplicate", links.Duplicate)
	headers := map[string]string{"X-Test-UserID": userID}

	createRec := doJSON(t, router, http.MethodPost, "/links", map[string]string{"title": "Blok Gaya", "url": "https://example.com/gaya"}, headers)
	var created linkItem
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created: %v", err)
	}

	getStyle := func() map[string]string {
		rec := doJSON(t, router, http.MethodGet, "/links", nil, headers)
		var items []linkItem
		if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
			t.Fatalf("decode list: %v", err)
		}
		for _, it := range items {
			if it.ID == created.ID {
				var m map[string]string
				if err := json.Unmarshal(it.BlockStyle, &m); err != nil {
					t.Fatalf("decode block_style %s: %v", it.BlockStyle, err)
				}
				return m
			}
		}
		t.Fatalf("blok %s tidak ada di list", created.ID)
		return nil
	}

	if s := getStyle(); len(s) != 0 {
		t.Fatalf("blok baru harus block_style kosong, dapat %v", s)
	}
	style := map[string]string{"bg": "#111111", "text": "#ffffff", "font": "poppins", "font_size": "lg", "font_weight": "bold", "align": "center", "button_bg": "#d7ff60", "button_text": "#111111", "rounded": "full"}
	if rec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"block_style": style}, headers); rec.Code != http.StatusOK {
		t.Fatalf("simpan style gagal: %d %s", rec.Code, rec.Body.String())
	}
	if s := getStyle(); s["bg"] != "#111111" || s["font_size"] != "lg" || s["rounded"] != "full" || len(s) != len(style) {
		t.Fatalf("style tersimpan = %v", s)
	}
	if rec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"block_style": map[string]string{"bg": "red"}}, headers); rec.Code != http.StatusBadRequest {
		t.Fatalf("warna tidak valid harus 400, dapat %d", rec.Code)
	}
	if rec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"title": "Judul Baru"}, headers); rec.Code != http.StatusOK {
		t.Fatalf("update judul gagal: %d", rec.Code)
	}
	if s := getStyle(); s["bg"] != "#111111" {
		t.Fatalf("style hilang setelah update field lain: %v", s)
	}
	dupRec := doJSON(t, router, http.MethodPost, "/links/"+created.ID+"/duplicate", nil, headers)
	if dupRec.Code >= 300 {
		t.Fatalf("duplikasi gagal: %d %s", dupRec.Code, dupRec.Body.String())
	}
	listRec := doJSON(t, router, http.MethodGet, "/links", nil, headers)
	var items []linkItem
	_ = json.Unmarshal(listRec.Body.Bytes(), &items)
	copied := 0
	for _, it := range items {
		if it.ID != created.ID && strings.Contains(string(it.BlockStyle), "#111111") {
			copied++
		}
	}
	if copied != 1 {
		t.Fatalf("salinan blok harus membawa block_style, items=%d", len(items))
	}
	if rec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"block_style": map[string]string{}}, headers); rec.Code != http.StatusOK {
		t.Fatalf("reset style gagal: %d", rec.Code)
	}
	if s := getStyle(); len(s) != 0 {
		t.Fatalf("setelah reset style harus kosong, dapat %v", s)
	}
}
