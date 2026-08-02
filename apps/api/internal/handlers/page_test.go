package handlers

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/jeonme/api/internal/database"
)

func newTestPageHandler(t *testing.T) (*PageHandler, *AuthHandler) {
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

	// Storage sengaja nil -- test gating premium fokus ke keputusan
	// izin/tolak SEBELUM upload ke storage disentuh sama sekali (lihat
	// urutan pengecekan di UploadCustomBackground: premium dicek duluan).
	page := NewPageHandler(db, rdb, nil)
	return page, NewAuthHandler(db, rdb, "test-secret", "test")
}

func makeTestUserPremium(t *testing.T, page *PageHandler, userID string) {
	t.Helper()
	if _, err := page.DB.Exec(t.Context(), `
		INSERT INTO subscriptions (user_id, plan, amount_idr, status, enrollment_order_id, current_period_end)
		VALUES ($1, 'monthly', 29000, 'active', $2, now() + interval '30 days')
	`, userID, "jeonme-sub-"+uuid.NewString()); err != nil {
		t.Fatalf("gagal setup langganan premium test: %v", err)
	}
}

// UpdateMyPage (halaman utama) -- kreator gratis mencoba pindah ke
// theme="custom" harus ditolak 403, TIDAK diam-diam disimpan.
func TestUpdateMyPage_RejectsCustomThemeForFreeUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	page, auth := newTestPageHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/page", page.UpdateMyPage)

	rec := doJSON(t, router, http.MethodPatch, "/page", map[string]string{"theme": "custom"}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, ekspektasi 403, body %s", rec.Code, rec.Body.String())
	}

	var theme string
	if err := page.DB.QueryRow(t.Context(), `SELECT theme FROM pages WHERE user_id = $1 AND is_primary = true`, userID).Scan(&theme); err != nil {
		t.Fatalf("gagal query halaman: %v", err)
	}
	if theme == "custom" {
		t.Error("theme = custom, ekspektasi TIDAK berubah -- permintaan seharusnya ditolak sebelum UPDATE")
	}
}

// Kreator gratis mencoba mengisi custom_background_value SAJA (tanpa
// menyebut theme sama sekali) juga harus ditolak -- gerbangnya memeriksa
// KEDUA jalur (theme="custom" ATAU field custom_background_*).
func TestUpdateMyPage_RejectsCustomBackgroundValueForFreeUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	page, auth := newTestPageHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/page", page.UpdateMyPage)

	rec := doJSON(t, router, http.MethodPatch, "/page", map[string]string{"custom_background_value": "#ff0000"}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, ekspektasi 403, body %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateMyPage_AllowsCustomThemeForPremiumUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	page, auth := newTestPageHandler(t)
	userID := registerTestUser(t, auth)
	makeTestUserPremium(t, page, userID)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/page", page.UpdateMyPage)

	rec := doJSON(t, router, http.MethodPatch, "/page", map[string]string{"theme": "custom"}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, ekspektasi 200, body %s", rec.Code, rec.Body.String())
	}

	var theme string
	if err := page.DB.QueryRow(t.Context(), `SELECT theme FROM pages WHERE user_id = $1 AND is_primary = true`, userID).Scan(&theme); err != nil {
		t.Fatalf("gagal query halaman: %v", err)
	}
	if theme != "custom" {
		t.Errorf("theme = %q, ekspektasi custom untuk kreator premium", theme)
	}
}

// Non-tema field (mis. bio) tetap harus berhasil untuk kreator gratis --
// gerbang HANYA menghalangi latar kustom, bukan seluruh endpoint.
func TestUpdateMyPage_AllowsNonCustomFieldsForFreeUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	page, auth := newTestPageHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/page", page.UpdateMyPage)

	rec := doJSON(t, router, http.MethodPatch, "/page", map[string]string{"bio": "Halo, ini bio test"}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, ekspektasi 200, body %s", rec.Code, rec.Body.String())
	}
}

// Bypass tervalidasi: sebelum penambahan gerbang ini, kreator gratis bisa
// lolos batasan latar kustom halaman utama lewat halaman TAMBAHAN
// (endpoint /dashboard/pages/:id yang beda dari /dashboard/page).
func TestUpdatePage_RejectsCustomThemeForFreeUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	page, auth := newTestPageHandler(t)
	userID := registerTestUser(t, auth)

	extraPageID := uuid.NewString()
	if _, err := page.DB.Exec(t.Context(), `
		INSERT INTO pages (id, user_id, is_primary, name, slug, page_type)
		VALUES ($1, $2, false, 'Halaman Tambahan', $3, 'bio')
	`, extraPageID, userID, "extra-"+uuid.NewString()[:8]); err != nil {
		t.Fatalf("gagal setup halaman tambahan: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/pages/:id", page.UpdatePage)

	rec := doJSON(t, router, http.MethodPatch, "/pages/"+extraPageID, map[string]string{"theme": "custom"}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, ekspektasi 403, body %s", rec.Code, rec.Body.String())
	}

	var theme string
	if err := page.DB.QueryRow(t.Context(), `SELECT theme FROM pages WHERE id = $1`, extraPageID).Scan(&theme); err != nil {
		t.Fatalf("gagal query halaman tambahan: %v", err)
	}
	if theme == "custom" {
		t.Error("theme = custom, ekspektasi TIDAK berubah untuk kreator gratis")
	}
}

func TestUpdatePage_AllowsCustomThemeForPremiumUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	page, auth := newTestPageHandler(t)
	userID := registerTestUser(t, auth)
	makeTestUserPremium(t, page, userID)

	extraPageID := uuid.NewString()
	if _, err := page.DB.Exec(t.Context(), `
		INSERT INTO pages (id, user_id, is_primary, name, slug, page_type)
		VALUES ($1, $2, false, 'Halaman Tambahan', $3, 'bio')
	`, extraPageID, userID, "extra-"+uuid.NewString()[:8]); err != nil {
		t.Fatalf("gagal setup halaman tambahan: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/pages/:id", page.UpdatePage)

	rec := doJSON(t, router, http.MethodPatch, "/pages/"+extraPageID, map[string]string{"theme": "custom"}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, ekspektasi 200, body %s", rec.Code, rec.Body.String())
	}
}

// Bypass kedua yang tervalidasi: endpoint upload latar kustom menyimpan
// custom_background_type/value SENDIRI (tidak lewat UpdateMyPage), jadi
// butuh gerbangnya sendiri -- dicek TANPA perlu file/storage sungguhan
// karena pengecekan premium ditaruh sebelum FormFile/Storage disentuh.
func TestUploadCustomBackground_RejectsForFreeUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	page, auth := newTestPageHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/page/background", page.UploadCustomBackground)

	rec := doJSON(t, router, http.MethodPost, "/page/background", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, ekspektasi 403 (ditolak sebelum sempat cek storage/file), body %s", rec.Code, rec.Body.String())
	}
}

// isPremiumUser truth table -- pindah dari subscription_test.go, ditaruh
// di sini juga karena inilah gerbang yang dipakai page.go, supaya jelas
// terhubung ke test gating di atas.
func TestIsPremiumUser_TrueForActiveSubscription(t *testing.T) {
	gin.SetMode(gin.TestMode)
	page, auth := newTestPageHandler(t)
	userID := registerTestUser(t, auth)
	makeTestUserPremium(t, page, userID)

	if !isPremiumUser(t.Context(), page.DB, userID) {
		t.Error("isPremiumUser = false, ekspektasi true untuk langganan status=active")
	}
}

func TestIsPremiumUser_FalseForUserWithNoSubscriptionRow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	page, auth := newTestPageHandler(t)
	userID := registerTestUser(t, auth)

	if isPremiumUser(t.Context(), page.DB, userID) {
		t.Error("isPremiumUser = true, ekspektasi false -- user ini belum pernah punya baris subscriptions")
	}
}
