package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

func newTestBusinessCardHandler(t *testing.T) (*BusinessCardHandler, *AuthHandler) {
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

	return &BusinessCardHandler{DB: db, RDB: rdb}, NewAuthHandler(db, rdb, "test-secret", "test")
}

// TestGetPublicCard_CachesResponse -- regresi audit performa profesional 15
// September 2026 (Medium): GetPublicCard SEBELUMNYA satu-satunya jalur baca
// "halaman publik" yang tidak lewat cache Redis 30 detik sama sekali (beda
// dari GetPublicPage/GetPublicPageBySlug, page.go) -- kartu kontak yang
// dibagikan luas (QR code) tidak punya lapisan penyerap lonjakan trafik.
// Test ini membuktikan: (1) panggilan pertama (cache miss) mengembalikan
// data benar TANPA header X-Cache, (2) panggilan kedua (cache hit) SAMA
// datanya DAN membawa header X-Cache: HIT -- bukti jalur cache benar-benar
// dipakai, bukan cuma tidak error.
func TestGetPublicCard_CachesResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	card, auth := newTestBusinessCardHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/card", card.UpsertCard)
	router.GET("/card/:username", card.GetPublicCard)

	upsertRec := doJSON(t, router, http.MethodPost, "/card", map[string]any{
		"is_active": true,
		"full_name": "Budi Santoso",
	}, map[string]string{"X-Test-UserID": userID})
	if upsertRec.Code != http.StatusOK {
		t.Fatalf("upsert card gagal: status=%d body=%s", upsertRec.Code, upsertRec.Body.String())
	}

	var username string
	if err := card.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err != nil {
		t.Fatalf("gagal ambil username: %v", err)
	}

	// Panggilan pertama -- cache miss, harus TANPA header X-Cache.
	rec1 := doJSON(t, router, http.MethodGet, "/card/"+username, nil, nil)
	if rec1.Code != http.StatusOK {
		t.Fatalf("GetPublicCard (miss) gagal: status=%d body=%s", rec1.Code, rec1.Body.String())
	}
	if got := rec1.Header().Get("X-Cache"); got != "" {
		t.Fatalf("X-Cache pada cache miss = %q, ekspektasi kosong", got)
	}
	var resp1 publicBusinessCard
	if err := json.Unmarshal(rec1.Body.Bytes(), &resp1); err != nil {
		t.Fatalf("gagal decode respons pertama: %v", err)
	}
	if resp1.FullName != "Budi Santoso" {
		t.Fatalf("full_name (miss) = %q, ekspektasi \"Budi Santoso\"", resp1.FullName)
	}

	// Panggilan kedua -- cache HIT, harus header X-Cache: HIT + data SAMA.
	rec2 := doJSON(t, router, http.MethodGet, "/card/"+username, nil, nil)
	if rec2.Code != http.StatusOK {
		t.Fatalf("GetPublicCard (hit) gagal: status=%d body=%s", rec2.Code, rec2.Body.String())
	}
	if got := rec2.Header().Get("X-Cache"); got != "HIT" {
		t.Fatalf("X-Cache pada cache hit = %q, ekspektasi \"HIT\"", got)
	}
	var resp2 publicBusinessCard
	if err := json.Unmarshal(rec2.Body.Bytes(), &resp2); err != nil {
		t.Fatalf("gagal decode respons kedua: %v", err)
	}
	if resp2.FullName != resp1.FullName {
		t.Fatalf("full_name (hit) = %q, ekspektasi sama dgn cache miss %q", resp2.FullName, resp1.FullName)
	}
}
