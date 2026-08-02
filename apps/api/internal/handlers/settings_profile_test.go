package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/jeonme/api/internal/database"
)

func newTestSettingsProfileHandler(t *testing.T) (*SettingsProfileHandler, *AuthHandler, *PageHandler) {
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

	return NewSettingsProfileHandler(db, rdb), NewAuthHandler(db, rdb, "test-secret", "test"), NewPageHandler(db, rdb, nil)
}

func TestSettingsProfile_GetReturnsCurrentData(t *testing.T) {
	gin.SetMode(gin.TestMode)
	settings, auth, _ := newTestSettingsProfileHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/settings/profile", settings.Get)

	rec := doJSON(t, router, http.MethodGet, "/settings/profile", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var resp settingsProfileResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode response: %v", err)
	}
	if resp.Username == "" {
		t.Error("username kosong, ekspektasi terisi dari hasil registrasi")
	}
}

// display_name/bio ditulis ke pages, category ke users -- pastikan
// keduanya benar-benar tersimpan lewat satu request PATCH gabungan.
func TestSettingsProfile_UpdateProfileFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	settings, auth, _ := newTestSettingsProfileHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/settings/profile", settings.Update)

	rec := doJSON(t, router, http.MethodPatch, "/settings/profile", map[string]any{
		"display_name": "Nama Baru",
		"bio":          "Bio baru",
		"category":     "Musik",
	}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var displayName, bio, category string
	if err := settings.DB.QueryRow(t.Context(), `
		SELECT p.display_name, p.bio, u.category FROM users u
		JOIN pages p ON p.user_id = u.id AND p.is_primary = true
		WHERE u.id = $1
	`, userID).Scan(&displayName, &bio, &category); err != nil {
		t.Fatalf("gagal query hasil update: %v", err)
	}
	if displayName != "Nama Baru" || bio != "Bio baru" || category != "Musik" {
		t.Errorf("hasil update = (%q, %q, %q), ekspektasi (\"Nama Baru\", \"Bio baru\", \"Musik\")", displayName, bio, category)
	}
}

// Acceptance criteria Modul Settings §2: ganti username tidak pernah
// menyebabkan link lama 404 selama window redirect aktif -- buktikan
// username_history tercatat DAN resolver publik menemukan username baru.
func TestSettingsProfile_UsernameChange_RecordsHistoryAndRedirects(t *testing.T) {
	gin.SetMode(gin.TestMode)
	settings, auth, page := newTestSettingsProfileHandler(t)
	userID := registerTestUser(t, auth)

	var oldUsername string
	if err := settings.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userID).Scan(&oldUsername); err != nil {
		t.Fatalf("gagal ambil username lama: %v", err)
	}
	newUsername := "new" + uuid.NewString()[:8]

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/settings/profile", settings.Update)
	router.GET("/usernames/:username/redirect", page.ResolveUsernameRedirect)

	rec := doJSON(t, router, http.MethodPatch, "/settings/profile", map[string]any{
		"username": newUsername,
	}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var historyCount int
	if err := settings.DB.QueryRow(t.Context(), `
		SELECT count(*) FROM username_history WHERE user_id = $1 AND old_username = $2
	`, userID, oldUsername).Scan(&historyCount); err != nil {
		t.Fatalf("gagal query username_history: %v", err)
	}
	if historyCount != 1 {
		t.Errorf("username_history count = %d, ekspektasi 1", historyCount)
	}

	rec2 := doJSON(t, router, http.MethodGet, "/usernames/"+oldUsername+"/redirect", nil, nil)
	if rec2.Code != http.StatusOK {
		t.Fatalf("resolver status = %d, body %s", rec2.Code, rec2.Body.String())
	}
	var resolved struct {
		NewUsername string `json:"new_username"`
	}
	if err := json.Unmarshal(rec2.Body.Bytes(), &resolved); err != nil {
		t.Fatalf("gagal decode resolver response: %v", err)
	}
	if resolved.NewUsername != newUsername {
		t.Errorf("new_username = %q, ekspektasi %q", resolved.NewUsername, newUsername)
	}
}

// Acceptance criteria Modul Settings §2: username yang sudah dipakai user
// lain tidak bisa direbut selama masih ada di username_history aktif --
// tapi pemilik ASLI tetap boleh mengambilnya kembali kapan pun.
func TestSettingsProfile_UsernameChange_RejectsRecentlyVacatedName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	settings, auth, _ := newTestSettingsProfileHandler(t)
	userA := registerTestUser(t, auth)
	userB := registerTestUser(t, auth)

	var oldUsernameA string
	if err := settings.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userA).Scan(&oldUsernameA); err != nil {
		t.Fatalf("gagal ambil username userA: %v", err)
	}
	newUsernameA := "moved" + uuid.NewString()[:8]

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/settings/profile", settings.Update)

	rec := doJSON(t, router, http.MethodPatch, "/settings/profile", map[string]any{
		"username": newUsernameA,
	}, map[string]string{"X-Test-UserID": userA})
	if rec.Code != http.StatusOK {
		t.Fatalf("gagal setup ganti username userA: status %d, body %s", rec.Code, rec.Body.String())
	}

	rec2 := doJSON(t, router, http.MethodPatch, "/settings/profile", map[string]any{
		"username": oldUsernameA,
	}, map[string]string{"X-Test-UserID": userB})
	if rec2.Code != http.StatusConflict {
		t.Fatalf("status = %d, ekspektasi 409 (squat protection), body %s", rec2.Code, rec2.Body.String())
	}

	rec3 := doJSON(t, router, http.MethodPatch, "/settings/profile", map[string]any{
		"username": oldUsernameA,
	}, map[string]string{"X-Test-UserID": userA})
	if rec3.Code != http.StatusOK {
		t.Fatalf("userA gagal ambil balik username sendiri: status %d, body %s", rec3.Code, rec3.Body.String())
	}
}

// Aturan anti-squat berlaku juga di jalur pendaftaran baru, bukan cuma
// ganti username -- kalau tidak, orang lain bisa lewati proteksi dengan
// bikin akun baru langsung memakai nama yang baru saja ditinggalkan.
func TestRegister_RejectsRecentlyVacatedUsername(t *testing.T) {
	gin.SetMode(gin.TestMode)
	settings, auth, _ := newTestSettingsProfileHandler(t)
	userA := registerTestUser(t, auth)

	var oldUsernameA string
	if err := settings.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userA).Scan(&oldUsernameA); err != nil {
		t.Fatalf("gagal ambil username userA: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/settings/profile", settings.Update)
	router.POST("/register", auth.Register)

	rec := doJSON(t, router, http.MethodPatch, "/settings/profile", map[string]any{
		"username": "moved" + uuid.NewString()[:8],
	}, map[string]string{"X-Test-UserID": userA})
	if rec.Code != http.StatusOK {
		t.Fatalf("gagal setup ganti username: status %d, body %s", rec.Code, rec.Body.String())
	}

	suffix := uuid.NewString()[:8]
	rec2 := doJSON(t, router, http.MethodPost, "/register", map[string]any{
		"email": "squat-" + suffix + "@example.com", "password": "password123",
		"username": oldUsernameA, "consent_accepted": true,
	}, nil)
	if rec2.Code != http.StatusConflict {
		t.Fatalf("status = %d, ekspektasi 409 (squat protection saat register), body %s", rec2.Code, rec2.Body.String())
	}
}
