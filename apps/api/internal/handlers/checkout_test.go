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
