package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// TestAnalytics_TrackStoresUtmForAdminTrafficSources -- permintaan
// langsung pengguna, 15 September 2026 ("untuk sumber trafic misal
// seperti dari facebook ig dan lain lain apakah itu sudah bisa tercatat
// atau di tracking untuk admin"): UTM masuk (utm_source/medium/campaign)
// yang dikirim Track SEKARANG benar-benar tersimpan (migrasi 000101),
// dan AdminHandler.ListTrafficSources (platform-wide) bisa membacanya
// kembali dengan hitungan views/clicks yang benar per kombinasi.
func TestAnalytics_TrackStoresUtmForAdminTrafficSources(t *testing.T) {
	gin.SetMode(gin.TestMode)
	analytics, auth := newTestAnalyticsHandler(t)
	admin := &AdminHandler{DB: analytics.DB}
	userID := registerTestUser(t, auth)

	var username string
	if err := analytics.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err != nil {
		t.Fatalf("gagal ambil username: %v", err)
	}

	router := gin.New()
	router.POST("/pages/:username/track", analytics.Track)
	g := router.Group("/", fakeAuth())
	g.GET("/admin/traffic-sources", admin.ListTrafficSources)

	// campaign UNIK per run (bukan literal "promo_course" tetap) -- DB
	// test dibagi SELURUH suite (bahkan antar run test INI SENDIRI kalau
	// dijalankan berkali-kali) tanpa isolasi transaksi, dan GROUP BY di
	// ListTrafficSources platform-wide TIDAK menyaring per halaman/user,
	// jadi baris dari run sebelumnya bisa ikut tergabung kalau campaign-nya
	// sama persis -- ditemukan lewat kegagalan nyata (Views=6 bukan 2)
	// saat test ini dijalankan ulang tanpa restart DB.
	campaign := "promo_course-" + uuid.NewString()

	// 2 view + 1 click dengan UTM yang SAMA -- harus jadi SATU baris
	// breakdown dgn views=2, clicks=1.
	for i := 0; i < 2; i++ {
		rec := doJSON(t, router, http.MethodPost, "/pages/"+username+"/track", map[string]string{
			"event_type": "view", "utm_source": "facebook", "utm_medium": "social", "utm_campaign": campaign,
		}, nil)
		if rec.Code != http.StatusNoContent {
			t.Fatalf("track view: status %d, body %s", rec.Code, rec.Body.String())
		}
	}
	clickRec := doJSON(t, router, http.MethodPost, "/pages/"+username+"/track", map[string]string{
		"event_type": "click", "utm_source": "facebook", "utm_medium": "social", "utm_campaign": campaign,
	}, nil)
	if clickRec.Code != http.StatusNoContent {
		t.Fatalf("track click: status %d, body %s", clickRec.Code, clickRec.Body.String())
	}

	// 1 view TANPA UTM sama sekali (organik) -- harus ikut TotalViews tapi
	// TIDAK PERNAH muncul di tabel breakdown (Sources).
	organicRec := doJSON(t, router, http.MethodPost, "/pages/"+username+"/track", map[string]string{"event_type": "view"}, nil)
	if organicRec.Code != http.StatusNoContent {
		t.Fatalf("track organic view: status %d, body %s", organicRec.Code, organicRec.Body.String())
	}

	sourcesRec := doJSON(t, router, http.MethodGet, "/admin/traffic-sources?range_days=1&limit=200", nil, map[string]string{"X-Test-UserID": userID})
	if sourcesRec.Code != http.StatusOK {
		t.Fatalf("traffic sources: status %d, body %s", sourcesRec.Code, sourcesRec.Body.String())
	}
	var resp trafficSourcesResponse
	if err := json.Unmarshal(sourcesRec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode respons: %v, body: %s", err, sourcesRec.Body.String())
	}

	if resp.TotalViews < 3 {
		t.Fatalf("TotalViews = %d, ekspektasi minimal 3 (2 UTM + 1 organik)", resp.TotalViews)
	}
	if resp.ViewsWithUTM < 2 {
		t.Fatalf("ViewsWithUTM = %d, ekspektasi minimal 2", resp.ViewsWithUTM)
	}

	var found *trafficSourceRow
	for i := range resp.Sources {
		if resp.Sources[i].UtmSource == "facebook" && resp.Sources[i].UtmCampaign == campaign {
			found = &resp.Sources[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("baris facebook/%s tidak ditemukan di sources: %+v", campaign, resp.Sources)
	}
	if found.UtmMedium != "social" {
		t.Fatalf("UtmMedium = %q, ekspektasi \"social\"", found.UtmMedium)
	}
	if found.Views != 2 {
		t.Fatalf("Views = %d, ekspektasi 2", found.Views)
	}
	if found.Clicks != 1 {
		t.Fatalf("Clicks = %d, ekspektasi 1", found.Clicks)
	}
}
