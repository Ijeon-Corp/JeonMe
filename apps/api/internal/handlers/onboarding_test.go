package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

func newTestOnboardingHandler(t *testing.T) (*OnboardingHandler, *AuthHandler) {
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

	return NewOnboardingHandler(db), NewAuthHandler(db, rdb, "test-secret", "test")
}

// User baru (belum pernah dismiss) harus melihat dismissed=false -- ini
// yang membuat OnboardingBanner tampil di layout dashboard.
func TestOnboardingGetStatus_FalseForNewUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	onboarding, auth := newTestOnboardingHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/onboarding", onboarding.GetStatus)

	rec := doJSON(t, router, http.MethodGet, "/onboarding", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Dismissed bool `json:"dismissed"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode respons: %v", err)
	}
	if resp.Dismissed {
		t.Error("dismissed = true, ekspektasi false untuk user yang belum pernah menutup pita onboarding")
	}
}

func TestOnboardingDismiss_PersistsAcrossRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	onboarding, auth := newTestOnboardingHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/onboarding", onboarding.GetStatus)
	g.POST("/onboarding/dismiss", onboarding.Dismiss)

	dismissRec := doJSON(t, router, http.MethodPost, "/onboarding/dismiss", nil, map[string]string{"X-Test-UserID": userID})
	if dismissRec.Code != http.StatusOK {
		t.Fatalf("status dismiss = %d, body %s", dismissRec.Code, dismissRec.Body.String())
	}

	rec := doJSON(t, router, http.MethodGet, "/onboarding", nil, map[string]string{"X-Test-UserID": userID})
	var resp struct {
		Dismissed bool `json:"dismissed"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode respons: %v", err)
	}
	if !resp.Dismissed {
		t.Error("dismissed = false, ekspektasi true setelah dismiss dipanggil")
	}
}

// Permintaan langsung pengguna, 20 Agustus 2026: "hilangkan terbitkan
// halaman publik karna langsung otomatis aktif dan terbit halaman nya" --
// item checklist "publish" dihapus (halaman selalu aktif sejak akun
// dibuat, tidak ada langkah untuk dicek lagi), total turun dari 4 jadi 3.
func TestOnboardingGetStatus_ChecklistNoLongerHasPublishItem(t *testing.T) {
	gin.SetMode(gin.TestMode)
	onboarding, auth := newTestOnboardingHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/onboarding", onboarding.GetStatus)

	rec := doJSON(t, router, http.MethodGet, "/onboarding", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Total     int `json:"total"`
		Checklist []struct {
			Key string `json:"key"`
		} `json:"checklist"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode respons: %v", err)
	}
	if resp.Total != 3 {
		t.Errorf("total = %d, ekspektasi 3 (item \"publish\" sudah dihapus)", resp.Total)
	}
	for _, item := range resp.Checklist {
		if item.Key == "publish" {
			t.Error("item checklist \"publish\" masih ada, ekspektasi sudah dihapus")
		}
	}
}
