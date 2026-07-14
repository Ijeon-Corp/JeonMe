package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

func newTestAnalyticsHandler(t *testing.T) (*AnalyticsHandler, *AuthHandler) {
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

	return NewAnalyticsHandler(db), NewAuthHandler(db, rdb, "test-secret", "test")
}

// Track mencatat view & click, GetSummary menghitungnya dengan benar --
// REQ-F-601/602.
func TestAnalytics_TrackAndSummarize(t *testing.T) {
	gin.SetMode(gin.TestMode)
	analytics, auth := newTestAnalyticsHandler(t)
	userID := registerTestUser(t, auth)

	var username string
	if err := analytics.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err != nil {
		t.Fatalf("gagal ambil username: %v", err)
	}

	router := gin.New()
	router.POST("/pages/:username/track", analytics.Track)
	g := router.Group("/", fakeAuth())
	g.GET("/analytics/summary", analytics.GetSummary)

	for i := 0; i < 3; i++ {
		rec := doJSON(t, router, http.MethodPost, "/pages/"+username+"/track", map[string]string{
			"event_type": "view", "referrer": "https://instagram.com",
		}, nil)
		if rec.Code != http.StatusNoContent {
			t.Fatalf("track view: status %d, body %s", rec.Code, rec.Body.String())
		}
	}
	clickRec := doJSON(t, router, http.MethodPost, "/pages/"+username+"/track", map[string]string{
		"event_type": "click",
	}, nil)
	if clickRec.Code != http.StatusNoContent {
		t.Fatalf("track click: status %d, body %s", clickRec.Code, clickRec.Body.String())
	}

	sumRec := doJSON(t, router, http.MethodGet, "/analytics/summary", nil, map[string]string{"X-Test-UserID": userID})
	if sumRec.Code != http.StatusOK {
		t.Fatalf("summary: status %d, body %s", sumRec.Code, sumRec.Body.String())
	}

	var resp analyticsSummaryResponse
	if err := json.Unmarshal(sumRec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode summary: %v", err)
	}
	if resp.TotalViews != 3 {
		t.Errorf("TotalViews = %d, ekspektasi 3", resp.TotalViews)
	}
	if resp.TotalClicks != 1 {
		t.Errorf("TotalClicks = %d, ekspektasi 1", resp.TotalClicks)
	}
	if len(resp.TopReferrers) != 1 || resp.TopReferrers[0].Referrer != "https://instagram.com" {
		t.Errorf("TopReferrers = %+v, ekspektasi 1 entri instagram.com", resp.TopReferrers)
	}
}

// Track ke username yang tidak ada harus tetap 204 (fail-silent, tidak boleh
// mengganggu pengunjung halaman publik).
func TestAnalytics_Track_UnknownUsername_FailsSilently(t *testing.T) {
	gin.SetMode(gin.TestMode)
	analytics, _ := newTestAnalyticsHandler(t)

	router := gin.New()
	router.POST("/pages/:username/track", analytics.Track)

	rec := doJSON(t, router, http.MethodPost, "/pages/tidak-ada-user-ini/track", map[string]string{
		"event_type": "view",
	}, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, ekspektasi %d", rec.Code, http.StatusNoContent)
	}
}
