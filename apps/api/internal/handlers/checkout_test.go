package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/jeonme/api/internal/database"
	"github.com/jeonme/api/internal/midtrans"
)

func newTestCheckoutHandler(t *testing.T, serverKey string) (*CheckoutHandler, *AuthHandler) {
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
	// Storage & Queue sengaja nil -- test checkout fokus ke logika
	// order/pembayaran, bukan upload file atau notifikasi async (yang
	// masing-masing sudah punya soft-fail log-only saat nil).
	checkout := NewCheckoutHandler(db, midtransClient, serverKey, "http://localhost:3000", 5.0, nil, nil)

	return checkout, NewAuthHandler(db, rdb, "test-secret", "test")
}

// createActiveTestProduct membuat produk aktif langsung lewat SQL (bukan
// lewat alur upload sungguhan, yang butuh MinIO) supaya test checkout bisa
// fokus ke logika order/pembayaran.
func createActiveTestProduct(t *testing.T, checkout *CheckoutHandler, userID string, priceIDR int64) string {
	t.Helper()
	productID := uuid.NewString()
	_, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, file_key, is_active)
		VALUES ($1, $2, 'Produk Test Checkout', $3, 'products/test/file.pdf', true)
	`, productID, userID, priceIDR)
	if err != nil {
		t.Fatalf("gagal setup produk test: %v", err)
	}
	return productID
}

// Tanpa MIDTRANS_SERVER_KEY, Create harus menolak dengan pesan jelas (503)
// DAN tidak meninggalkan order "pending" yatim di database (transaksi
// rollback).
func TestCheckoutCreate_NotConfigured_RollsBackOrder(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, auth := newTestCheckoutHandler(t, "")
	userID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)

	router := gin.New()
	router.POST("/checkout", checkout.Create)

	rec := doJSON(t, router, http.MethodPost, "/checkout", map[string]string{
		"product_id":  productID,
		"buyer_email": "buyer@example.com",
	}, nil)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, ekspektasi %d. Body: %s", rec.Code, http.StatusServiceUnavailable, rec.Body.String())
	}

	var orderCount int
	err := checkout.DB.QueryRow(t.Context(), `SELECT COUNT(*) FROM orders WHERE product_id = $1`, productID).Scan(&orderCount)
	if err != nil {
		t.Fatalf("gagal query orders: %v", err)
	}
	if orderCount != 0 {
		t.Fatalf("orderCount = %d, ekspektasi 0 -- order seharusnya di-rollback saat Midtrans gagal", orderCount)
	}
}

// Checkout ke produk yang tidak aktif harus ditolak (produk belum lolos
// upload file, lihat Sprint 2 REQ-F-303).
func TestCheckoutCreate_InactiveProduct_ReturnsNotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, auth := newTestCheckoutHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)

	productID := uuid.NewString()
	_, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, is_active)
		VALUES ($1, $2, 'Produk Belum Aktif', 25000, false)
	`, productID, userID)
	if err != nil {
		t.Fatalf("gagal setup produk test: %v", err)
	}

	router := gin.New()
	router.POST("/checkout", checkout.Create)

	rec := doJSON(t, router, http.MethodPost, "/checkout", map[string]string{
		"product_id":  productID,
		"buyer_email": "buyer@example.com",
	}, nil)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, ekspektasi %d. Body: %s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

// webhookPayload menyusun payload notifikasi Midtrans sintetis dengan
// signature_key yang benar-benar valid (dihitung pakai rumus resmi
// midtrans.Sign) -- mensimulasikan apa yang Midtrans kirim, bukan memanggil
// API Midtrans sungguhan.
func webhookPayload(t *testing.T, serverKey, transactionID, orderID, transactionStatus string) []byte {
	t.Helper()
	const statusCode = "200"
	const grossAmount = "25000.00"
	body, err := json.Marshal(midtrans.NotificationPayload{
		OrderID:           orderID,
		StatusCode:        statusCode,
		GrossAmount:       grossAmount,
		SignatureKey:      midtrans.Sign(orderID, statusCode, grossAmount, serverKey),
		TransactionStatus: transactionStatus,
		TransactionID:     transactionID,
	})
	if err != nil {
		t.Fatalf("gagal encode payload webhook: %v", err)
	}
	return body
}

// Webhook dengan signature_key salah HARUS ditolak sebelum payload apa pun
// diproses (REQ-F-403).
func TestCheckoutWebhook_RejectsWrongSignature(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, _ := newTestCheckoutHandler(t, "the-real-server-key")

	router := gin.New()
	router.POST("/webhook", checkout.Webhook)

	body := webhookPayload(t, "server-key-yang-salah", uuid.NewString(), uuid.NewString(), "settlement")
	rec := doJSON(t, router, http.MethodPost, "/webhook", json.RawMessage(body), nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, ekspektasi %d. Body: %s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}
}

// Webhook yang diterima dua kali (retry PSP) TIDAK BOLEH memproses pembayaran
// dua kali -- REQ-F-404. Dibuktikan lewat: order tetap "paid" (bukan error),
// dan tepat satu baris payments tercatat walau Webhook dipanggil dua kali.
func TestCheckoutWebhook_IdempotentOnDuplicateDelivery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const serverKey = "the-real-server-key"
	checkout, auth := newTestCheckoutHandler(t, serverKey)
	userID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)

	orderID := uuid.NewString()
	externalID := "jeonme-order-" + orderID
	_, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status, psp_reference)
		VALUES ($1, $2, 'buyer@example.com', 25000, 'pending', $3)
	`, orderID, productID, externalID)
	if err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	router := gin.New()
	router.POST("/webhook", checkout.Webhook)

	transactionID := uuid.NewString()
	body := webhookPayload(t, serverKey, transactionID, externalID, "settlement")

	first := doJSON(t, router, http.MethodPost, "/webhook", json.RawMessage(body), nil)
	if first.Code != http.StatusOK {
		t.Fatalf("webhook pertama: status %d, body %s", first.Code, first.Body.String())
	}

	second := doJSON(t, router, http.MethodPost, "/webhook", json.RawMessage(body), nil)
	if second.Code != http.StatusOK {
		t.Fatalf("webhook kedua (duplikat): status %d, body %s", second.Code, second.Body.String())
	}

	var status string
	if err := checkout.DB.QueryRow(t.Context(), `SELECT status FROM orders WHERE id = $1`, orderID).Scan(&status); err != nil {
		t.Fatalf("gagal query order: %v", err)
	}
	if status != "paid" {
		t.Fatalf("status order = %q, ekspektasi \"paid\"", status)
	}

	var paymentCount int
	if err := checkout.DB.QueryRow(t.Context(), `SELECT COUNT(*) FROM payments WHERE order_id = $1`, orderID).Scan(&paymentCount); err != nil {
		t.Fatalf("gagal query payments: %v", err)
	}
	if paymentCount != 1 {
		t.Fatalf("paymentCount = %d, ekspektasi tepat 1 walau webhook diterima 2 kali", paymentCount)
	}

	// REQ-F-501: ledger kreator harus ke-kredit TEPAT SEKALI (bukan 2x
	// walau webhook diterima 2x) sebesar amount_idr order (platform_fee_idr
	// default 0 di setup test ini).
	var ledgerCount int
	var ledgerAmount int64
	if err := checkout.DB.QueryRow(t.Context(), `
		SELECT COUNT(*), COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE order_id = $1
	`, orderID).Scan(&ledgerCount, &ledgerAmount); err != nil {
		t.Fatalf("gagal query ledger_entries: %v", err)
	}
	if ledgerCount != 1 {
		t.Fatalf("ledgerCount = %d, ekspektasi tepat 1 walau webhook diterima 2 kali", ledgerCount)
	}
	if ledgerAmount != 25000 {
		t.Fatalf("ledgerAmount = %d, ekspektasi 25000", ledgerAmount)
	}
}

// Modul Statistik (tab "Toko"): transaksi terbaru HANYA milik produk
// kreator yang login -- order produk kreator LAIN tidak boleh bocor,
// urutan terbaru dulu, dan status non-"paid" (mis. "pending") tetap ikut
// tampil (beda dari AnalyticsHandler yang cuma menghitung "paid").
func TestListRecentOrders_ScopedToOwnProductsNewestFirst(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const serverKey = "the-real-server-key"
	checkout, auth := newTestCheckoutHandler(t, serverKey)
	userID := registerTestUser(t, auth)
	otherUserID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)
	otherProductID := createActiveTestProduct(t, checkout, otherUserID, 50000)

	olderOrderID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status, created_at)
		VALUES ($1, $2, 'buyer-old@example.com', 25000, 'pending', now() - interval '1 hour')
	`, olderOrderID, productID); err != nil {
		t.Fatalf("gagal setup order lama: %v", err)
	}
	newerOrderID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status, created_at)
		VALUES ($1, $2, 'buyer-new@example.com', 25000, 'paid', now())
	`, newerOrderID, productID); err != nil {
		t.Fatalf("gagal setup order baru: %v", err)
	}
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status)
		VALUES ($1, $2, 'buyer-other@example.com', 50000, 'paid')
	`, uuid.NewString(), otherProductID); err != nil {
		t.Fatalf("gagal setup order kreator lain: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/orders/recent", checkout.ListRecentOrders)

	rec := doJSON(t, router, http.MethodGet, "/orders/recent", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Orders []struct {
			OrderID string `json:"order_id"`
			Status  string `json:"status"`
		} `json:"orders"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode respons: %v", err)
	}
	if len(resp.Orders) != 2 {
		t.Fatalf("len(orders) = %d, ekspektasi 2 (hanya milik kreator ini)", len(resp.Orders))
	}
	if resp.Orders[0].OrderID != newerOrderID || resp.Orders[1].OrderID != olderOrderID {
		t.Errorf("urutan orders = %v, ekspektasi terbaru dulu (%s, %s)", resp.Orders, newerOrderID, olderOrderID)
	}
	if resp.Orders[0].Status != "paid" || resp.Orders[1].Status != "pending" {
		t.Errorf("status tidak sesuai: %+v", resp.Orders)
	}
}

// Modul Settings §3 (diferensiasi dari Lynk.id): split kolaborator disimpan
// sebagai snapshot rupiah ABSOLUT di orders.collaborator_splits_snapshot
// (lihat CheckoutHandler.Create) -- test ini fokus ke bagian yang paling
// berisiko (Webhook mengkredit ledger dari snapshot itu), bukan resolusi
// persen->rupiah di Create() yang butuh Midtrans sungguhan untuk diuji
// end-to-end (sama seperti test lain di file ini, lihat komentar
// TestCheckoutCreate_NotConfigured_RollsBackOrder).
func TestCheckoutWebhook_CreditsCollaboratorSplitFromSnapshot(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const serverKey = "the-real-server-key"
	checkout, auth := newTestCheckoutHandler(t, serverKey)
	userID := registerTestUser(t, auth)
	collaboratorID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 100000)

	orderID := uuid.NewString()
	externalID := "jeonme-order-" + orderID
	splitSnapshot, err := json.Marshal([]CollaboratorSplitSnapshot{{UserID: collaboratorID, AmountIDR: 20000}})
	if err != nil {
		t.Fatalf("gagal encode split snapshot: %v", err)
	}
	_, err = checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status, psp_reference, collaborator_splits_snapshot)
		VALUES ($1, $2, 'buyer@example.com', 100000, 'pending', $3, $4)
	`, orderID, productID, externalID, splitSnapshot)
	if err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	router := gin.New()
	router.POST("/webhook", checkout.Webhook)

	body := webhookPayload(t, serverKey, uuid.NewString(), externalID, "settlement")
	// webhookPayload selalu memakai grossAmount "25000.00" -- tidak
	// mempengaruhi test ini (signature cukup valid, amount_idr dibaca dari
	// order, bukan dari payload notifikasi).
	rec := doJSON(t, router, http.MethodPost, "/webhook", json.RawMessage(body), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("webhook gagal: status %d, body %s", rec.Code, rec.Body.String())
	}

	var collabLedgerAmount int64
	if err := checkout.DB.QueryRow(t.Context(), `
		SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1 AND order_id = $2
	`, collaboratorID, orderID).Scan(&collabLedgerAmount); err != nil {
		t.Fatalf("gagal query ledger kolaborator: %v", err)
	}
	if collabLedgerAmount != 20000 {
		t.Fatalf("ledger kolaborator = %d, ekspektasi 20000", collabLedgerAmount)
	}

	// Bagian kreator harus dipotong split kolaborator (100000 - 20000 =
	// 80000, platform_fee_idr 0 di setup test ini).
	var creatorLedgerAmount int64
	if err := checkout.DB.QueryRow(t.Context(), `
		SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1 AND order_id = $2
	`, userID, orderID).Scan(&creatorLedgerAmount); err != nil {
		t.Fatalf("gagal query ledger kreator: %v", err)
	}
	if creatorLedgerAmount != 80000 {
		t.Fatalf("ledger kreator = %d, ekspektasi 80000 (100000 - 20000 split)", creatorLedgerAmount)
	}
}
