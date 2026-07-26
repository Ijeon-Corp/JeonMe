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
