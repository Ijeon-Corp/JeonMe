package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

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

	return NewAnalyticsHandler(db, testEncryptionKey, "http://localhost:3000"), NewAuthHandler(db, rdb, "test-secret", "test")
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

// Modul Toko (Fase A, Overview): "Klik Beli" (product_click) dihitung
// terpisah dari klik tautan biasa, dan TotalCheckouts menghitung SEMUA order
// (bukan cuma paid) -- keduanya jadi dasar "Tingkat Konversi" yang jujur.
func TestAnalytics_ProductClickAndCheckoutsCounted(t *testing.T) {
	gin.SetMode(gin.TestMode)
	analytics, auth := newTestAnalyticsHandler(t)
	userID := registerTestUser(t, auth)

	var username string
	if err := analytics.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err != nil {
		t.Fatalf("gagal ambil username: %v", err)
	}

	productID := uuid.NewString()
	if _, err := analytics.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, is_active) VALUES ($1, $2, 'Produk Test', 25000, true)
	`, productID, userID); err != nil {
		t.Fatalf("gagal setup produk test: %v", err)
	}
	if _, err := analytics.DB.Exec(t.Context(), `
		INSERT INTO orders (product_id, buyer_email, amount_idr, status) VALUES
			($1, 'a@example.com', 25000, 'paid'),
			($1, 'b@example.com', 25000, 'pending')
	`, productID); err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	router := gin.New()
	router.POST("/pages/:username/track", analytics.Track)
	g := router.Group("/", fakeAuth())
	g.GET("/analytics/summary", analytics.GetSummary)

	for i := 0; i < 2; i++ {
		rec := doJSON(t, router, http.MethodPost, "/pages/"+username+"/track", map[string]string{
			"event_type": "product_click", "product_id": productID,
		}, nil)
		if rec.Code != http.StatusNoContent {
			t.Fatalf("track product_click: status %d, body %s", rec.Code, rec.Body.String())
		}
	}

	sumRec := doJSON(t, router, http.MethodGet, "/analytics/summary", nil, map[string]string{"X-Test-UserID": userID})
	var resp analyticsSummaryResponse
	if err := json.Unmarshal(sumRec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode summary: %v", err)
	}
	if resp.TotalProductClicks != 2 {
		t.Errorf("TotalProductClicks = %d, ekspektasi 2", resp.TotalProductClicks)
	}
	if resp.TotalCheckouts != 2 {
		t.Errorf("TotalCheckouts = %d, ekspektasi 2 (paid + pending, BUKAN cuma paid)", resp.TotalCheckouts)
	}
	if resp.TotalOrders != 1 {
		t.Errorf("TotalOrders = %d, ekspektasi 1 (hanya paid)", resp.TotalOrders)
	}
}

// Kartu ringkasan ala referensi ("Total Order"/"Total Sales", redesain
// Dashboard) -- total_orders/total_revenue_idr harus menghitung SEMUA
// pesanan lunas dalam rentang, bukan cuma 5 produk terlaris seperti
// TopProducts. weekly_revenue harus selalu 7 entri (hari ini termasuk
// pesanan yang baru dibuat), totalnya cocok dengan jumlah pesanan.
func TestAnalytics_Summary_IncludesOrderTotalsAndWeeklyRevenue(t *testing.T) {
	gin.SetMode(gin.TestMode)
	analytics, auth := newTestAnalyticsHandler(t)
	userID := registerTestUser(t, auth)

	productID := uuid.NewString()
	if _, err := analytics.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, file_key, is_active)
		VALUES ($1, $2, 'Produk Analytics Test', 40000, 'products/test/file.pdf', true)
	`, productID, userID); err != nil {
		t.Fatalf("gagal setup produk test: %v", err)
	}

	for i := 0; i < 2; i++ {
		orderID := uuid.NewString()
		if _, err := analytics.DB.Exec(t.Context(), `
			INSERT INTO orders (id, product_id, buyer_email, amount_idr, status, psp_reference)
			VALUES ($1, $2, 'buyer@example.com', 40000, 'paid', $3)
		`, orderID, productID, "jeonme-order-"+orderID); err != nil {
			t.Fatalf("gagal setup order test: %v", err)
		}
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/analytics/summary", analytics.GetSummary)

	rec := doJSON(t, router, http.MethodGet, "/analytics/summary", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var resp analyticsSummaryResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode summary: %v", err)
	}
	if resp.TotalOrders != 2 {
		t.Errorf("TotalOrders = %d, ekspektasi 2", resp.TotalOrders)
	}
	if resp.TotalRevenueIDR != 80000 {
		t.Errorf("TotalRevenueIDR = %d, ekspektasi 80000", resp.TotalRevenueIDR)
	}
	if len(resp.WeeklyRevenue) != 7 {
		t.Fatalf("WeeklyRevenue punya %d entri, ekspektasi 7", len(resp.WeeklyRevenue))
	}
	if resp.WeeklyRevenueTotalIDR != 80000 {
		t.Errorf("WeeklyRevenueTotalIDR = %d, ekspektasi 80000", resp.WeeklyRevenueTotalIDR)
	}
	todayHasOrders := false
	for _, pt := range resp.WeeklyRevenue {
		if pt.RevenueIDR == 80000 && pt.OrdersCount == 2 {
			todayHasOrders = true
		}
	}
	if !todayHasOrders {
		t.Errorf("WeeklyRevenue = %+v, ekspektasi salah satu hari (hari ini) mencatat 2 pesanan/80000", resp.WeeklyRevenue)
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
