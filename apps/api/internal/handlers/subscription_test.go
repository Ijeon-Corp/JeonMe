package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
	"github.com/jeonme/api/internal/midtrans"
)

func newTestSubscriptionHandler(t *testing.T, serverKey string) (*SubscriptionHandler, *AuthHandler) {
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

	midtransClient := midtrans.NewClient(serverKey, false)
	subscription := NewSubscriptionHandler(db, midtransClient, serverKey, "http://localhost:3000", 29000, 299000)

	return subscription, NewAuthHandler(db, rdb, "test-secret", "test")
}

func TestSubscriptionGetStatus_DefaultsToFreeWithConfiguredPrices(t *testing.T) {
	gin.SetMode(gin.TestMode)
	subscription, auth := newTestSubscriptionHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/subscription", subscription.GetStatus)

	rec := doJSON(t, router, http.MethodGet, "/subscription", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var resp subscriptionStatusResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode response: %v", err)
	}
	if resp.Plan != "free" || resp.Status != "none" || resp.IsPremium {
		t.Errorf("resp = %+v, ekspektasi plan=free status=none is_premium=false", resp)
	}
	if resp.MonthlyPriceIDR != 29000 || resp.YearlyPriceIDR != 299000 {
		t.Errorf("harga = (%d, %d), ekspektasi (29000, 299000)", resp.MonthlyPriceIDR, resp.YearlyPriceIDR)
	}
}

// Baris subscriptions status='active' dibuat LANGSUNG lewat SQL (bukan
// lewat alur Midtrans sungguhan, yang butuh pembayaran kartu 3DS nyata di
// browser -- di luar jangkauan test otomatis) -- fokus test ini adalah
// GetStatus/isPremiumUser MEMBACA status itu dengan benar, bukan proses
// terjadinya "active".
func TestSubscriptionGetStatus_ReflectsActiveSubscriptionAsPremium(t *testing.T) {
	gin.SetMode(gin.TestMode)
	subscription, auth := newTestSubscriptionHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)

	if _, err := subscription.DB.Exec(t.Context(), `
		INSERT INTO subscriptions (user_id, plan, amount_idr, status, enrollment_order_id, midtrans_subscription_id, current_period_end)
		VALUES ($1, 'monthly', 29000, 'active', 'jeonme-sub-enroll-test1', 'sub-midtrans-1', now() + interval '20 days')
	`, userID); err != nil {
		t.Fatalf("gagal setup langganan aktif: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/subscription", subscription.GetStatus)

	rec := doJSON(t, router, http.MethodGet, "/subscription", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var resp subscriptionStatusResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode response: %v", err)
	}
	if resp.Plan != "monthly" || resp.Status != "active" || !resp.IsPremium {
		t.Errorf("resp = %+v, ekspektasi plan=monthly status=active is_premium=true", resp)
	}
}

func TestSubscriptionCancel_NoActiveSubscription_ReturnsNotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	subscription, auth := newTestSubscriptionHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/subscription/cancel", subscription.Cancel)

	rec := doJSON(t, router, http.MethodPost, "/subscription/cancel", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, ekspektasi 404, body %s", rec.Code, rec.Body.String())
	}
}

// midtrans_subscription_id kosong (belum pernah benar-benar terhubung ke
// Midtrans) -- Cancel harus TETAP berhasil (lewati panggilan API Midtrans,
// lihat pengecekan `midtransSubID != ""` di Cancel) dan akses premium tetap
// berlaku sampai current_period_end yang sudah dibayar.
func TestSubscriptionCancel_PreservesAccessUntilPeriodEnd(t *testing.T) {
	gin.SetMode(gin.TestMode)
	subscription, auth := newTestSubscriptionHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)

	if _, err := subscription.DB.Exec(t.Context(), `
		INSERT INTO subscriptions (user_id, plan, amount_idr, status, enrollment_order_id, current_period_end)
		VALUES ($1, 'monthly', 29000, 'active', 'jeonme-sub-enroll-test2', now() + interval '15 days')
	`, userID); err != nil {
		t.Fatalf("gagal setup langganan aktif: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/subscription/cancel", subscription.Cancel)

	rec := doJSON(t, router, http.MethodPost, "/subscription/cancel", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, ekspektasi 200, body %s", rec.Code, rec.Body.String())
	}

	var status string
	var canceledAtIsNull bool
	if err := subscription.DB.QueryRow(t.Context(), `
		SELECT status, canceled_at IS NULL FROM subscriptions WHERE user_id = $1
	`, userID).Scan(&status, &canceledAtIsNull); err != nil {
		t.Fatalf("gagal query langganan: %v", err)
	}
	if status != "canceled" || canceledAtIsNull {
		t.Errorf("status = %q, canceled_at kosong = %v, ekspektasi status=canceled dengan canceled_at terisi", status, canceledAtIsNull)
	}

	if !isPremiumUser(t.Context(), subscription.DB, userID) {
		t.Error("isPremiumUser = false, ekspektasi true -- masa yang sudah dibayar (current_period_end di masa depan) harus tetap dihitung premium walau sudah dibatalkan")
	}
}

// Kebalikan dari test di atas: langganan yang statusnya "canceled" DAN
// current_period_end SUDAH lewat harus TIDAK dihitung premium lagi.
func TestIsPremiumUser_FalseAfterCanceledSubscriptionPeriodExpires(t *testing.T) {
	gin.SetMode(gin.TestMode)
	subscription, auth := newTestSubscriptionHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)

	if _, err := subscription.DB.Exec(t.Context(), `
		INSERT INTO subscriptions (user_id, plan, amount_idr, status, enrollment_order_id, current_period_end)
		VALUES ($1, 'monthly', 29000, 'canceled', 'jeonme-sub-enroll-test3', now() - interval '1 day')
	`, userID); err != nil {
		t.Fatalf("gagal setup langganan kedaluwarsa: %v", err)
	}

	if isPremiumUser(t.Context(), subscription.DB, userID) {
		t.Error("isPremiumUser = true, ekspektasi false -- current_period_end sudah lewat")
	}
}

func TestSubscriptionCheckout_RejectsWhenAlreadyHasLiveSubscription(t *testing.T) {
	gin.SetMode(gin.TestMode)
	subscription, auth := newTestSubscriptionHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)

	if _, err := subscription.DB.Exec(t.Context(), `
		INSERT INTO subscriptions (user_id, plan, amount_idr, status, enrollment_order_id)
		VALUES ($1, 'monthly', 29000, 'pending_card', 'jeonme-sub-enroll-test4')
	`, userID); err != nil {
		t.Fatalf("gagal setup langganan pending: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/subscription/checkout", subscription.Checkout)

	rec := doJSON(t, router, http.MethodPost, "/subscription/checkout", map[string]string{"plan": "monthly"}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, ekspektasi 409, body %s", rec.Code, rec.Body.String())
	}
}

// Checkout memanggil Midtrans Snap SUNGGUHAN (kredensial sandbox di .env
// test) -- membuktikan wiring CreateTransaction+EnableSaveCard benar-benar
// menghasilkan invoice_url yang valid, TANPA perlu pembayaran kartu 3DS
// nyata (itu di luar jangkauan test otomatis, lihat catatan lingkup di
// subscription.go).
func TestSubscriptionCheckout_CreatesRowAndRealMidtransTransaction(t *testing.T) {
	gin.SetMode(gin.TestMode)
	serverKey := mustEnv(t, "MIDTRANS_SERVER_KEY")
	subscription, auth := newTestSubscriptionHandler(t, serverKey)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/subscription/checkout", subscription.Checkout)

	rec := doJSON(t, router, http.MethodPost, "/subscription/checkout", map[string]string{"plan": "yearly"}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, ekspektasi 201, body %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		InvoiceURL string `json:"invoice_url"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode response: %v", err)
	}
	if resp.InvoiceURL == "" {
		t.Error("invoice_url kosong, ekspektasi URL Snap yang valid")
	}

	var plan, status string
	var amountIDR int64
	if err := subscription.DB.QueryRow(t.Context(), `
		SELECT plan, amount_idr, status FROM subscriptions WHERE user_id = $1
	`, userID).Scan(&plan, &amountIDR, &status); err != nil {
		t.Fatalf("gagal query subscriptions: %v", err)
	}
	if plan != "yearly" || amountIDR != 299000 || status != "pending_card" {
		t.Errorf("baris subscriptions = (%q, %d, %q), ekspektasi (yearly, 299000, pending_card)", plan, amountIDR, status)
	}
}

// HandleCycleWebhook (notifikasi siklus berulang) -- ID langganan yang
// tidak dikenal harus diabaikan dengan aman (200, tidak ada aksi), BUKAN
// error -- konsisten dengan pola webhook order biasa yang juga fail-silent
// untuk order_id yang tidak ditemukan.
func TestSubscriptionCycleWebhook_UnknownSubscriptionID_Ignored(t *testing.T) {
	gin.SetMode(gin.TestMode)
	subscription, _ := newTestSubscriptionHandler(t, "test-server-key")

	router := gin.New()
	router.POST("/webhooks/midtrans-subscription", subscription.HandleCycleWebhook)

	rec := doJSON(t, router, http.MethodPost, "/webhooks/midtrans-subscription", map[string]any{
		"subscription": map[string]string{"id": "subscription-id-tidak-dikenal"},
	}, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, ekspektasi 200 (diabaikan dengan aman), body %s", rec.Code, rec.Body.String())
	}
}

// maybeHandleSubscriptionEnrollmentPayment -- order_id BUKAN pendaftaran
// langganan (tidak berawalan enrollmentOrderIDPrefix) harus mengembalikan
// handled=false supaya checkout.go Webhook lanjut memproses sebagai order
// produk biasa.
func TestMaybeHandleSubscriptionEnrollment_IgnoresNonSubscriptionOrderID(t *testing.T) {
	subscription, _ := newTestSubscriptionHandler(t, "test-server-key")

	handled, err := maybeHandleSubscriptionEnrollmentPayment(t.Context(), subscription.DB, subscription.Midtrans, midtrans.NotificationPayload{
		OrderID:           "jeonme-order-bukan-langganan",
		TransactionStatus: "settlement",
	})
	if err != nil {
		t.Fatalf("error tidak terduga: %v", err)
	}
	if handled {
		t.Error("handled = true, ekspektasi false untuk order_id yang bukan pendaftaran langganan")
	}
}

// Pembayaran pendaftaran yang BELUM final (mis. masih "pending") tidak
// boleh memicu CreateSubscription sama sekali -- baris subscriptions
// dibiarkan pending_card apa adanya.
func TestMaybeHandleSubscriptionEnrollment_SkipsNonFinalStatus(t *testing.T) {
	subscription, auth := newTestSubscriptionHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)

	orderID := "jeonme-sub-enroll-pending-test"
	if _, err := subscription.DB.Exec(t.Context(), `
		INSERT INTO subscriptions (user_id, plan, amount_idr, status, enrollment_order_id)
		VALUES ($1, 'monthly', 29000, 'pending_card', $2)
	`, userID, orderID); err != nil {
		t.Fatalf("gagal setup langganan pending: %v", err)
	}

	handled, err := maybeHandleSubscriptionEnrollmentPayment(t.Context(), subscription.DB, subscription.Midtrans, midtrans.NotificationPayload{
		OrderID:           orderID,
		TransactionStatus: "pending",
	})
	if err != nil {
		t.Fatalf("error tidak terduga: %v", err)
	}
	if !handled {
		t.Error("handled = false, ekspektasi true (order_id ini memang pendaftaran langganan)")
	}

	var status string
	if err := subscription.DB.QueryRow(t.Context(), `SELECT status FROM subscriptions WHERE enrollment_order_id = $1`, orderID).Scan(&status); err != nil {
		t.Fatalf("gagal query subscriptions: %v", err)
	}
	if status != "pending_card" {
		t.Errorf("status = %q, ekspektasi tetap pending_card untuk status pembayaran yang belum final", status)
	}
}

// Webhook duplikat (retry Midtrans) untuk order pendaftaran yang SUDAH
// diproses (status bukan lagi pending_card) tidak boleh memicu
// CreateSubscription lagi -- idempoten, sama seperti webhook order biasa.
func TestMaybeHandleSubscriptionEnrollment_IdempotentWhenAlreadyActive(t *testing.T) {
	subscription, auth := newTestSubscriptionHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)

	orderID := "jeonme-sub-enroll-already-active-test"
	if _, err := subscription.DB.Exec(t.Context(), `
		INSERT INTO subscriptions (user_id, plan, amount_idr, status, enrollment_order_id, midtrans_subscription_id)
		VALUES ($1, 'monthly', 29000, 'active', $2, 'sub-midtrans-already')
	`, userID, orderID); err != nil {
		t.Fatalf("gagal setup langganan aktif: %v", err)
	}

	handled, err := maybeHandleSubscriptionEnrollmentPayment(t.Context(), subscription.DB, subscription.Midtrans, midtrans.NotificationPayload{
		OrderID:           orderID,
		TransactionStatus: "settlement",
		SavedTokenID:      "token-tidak-relevan",
	})
	if err != nil {
		t.Fatalf("error tidak terduga (seharusnya idempoten, tidak memanggil Midtrans lagi): %v", err)
	}
	if !handled {
		t.Error("handled = false, ekspektasi true")
	}
}
