package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

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

// Modul Toko (Fase D): Payment Link yang sudah kedaluwarsa (link_expires_at
// di masa lalu) harus ditolak SEBELUM sempat memanggil Midtrans -- dibuktikan
// server key kosong TIDAK memicu 503 "belum dikonfigurasi" (yang berarti
// baru dicek belakangan), melainkan 410 duluan.
func TestCheckoutCreate_PaymentLinkExpired_Rejects(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, auth := newTestCheckoutHandler(t, "")
	userID := registerTestUser(t, auth)

	productID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, is_active, product_kind, link_expires_at)
		VALUES ($1, $2, 'Payment Link Kedaluwarsa', 50000, true, 'payment_link', now() - interval '1 hour')
	`, productID, userID); err != nil {
		t.Fatalf("gagal setup payment link test: %v", err)
	}

	router := gin.New()
	router.POST("/checkout", checkout.Create)

	rec := doJSON(t, router, http.MethodPost, "/checkout", map[string]string{
		"product_id": productID, "buyer_email": "buyer@example.com",
	}, nil)
	if rec.Code != http.StatusGone {
		t.Fatalf("status = %d, ekspektasi 410. Body: %s", rec.Code, rec.Body.String())
	}
}

// Modul Toko (Fase D): batas jumlah pembayaran tercapai (payment_limit_count)
// harus ditolak, terlepas dari order lain yang statusnya BUKAN "paid" (mis.
// pending/expired) -- hanya order LUNAS yang dihitung menuju batas.
func TestCheckoutCreate_PaymentLinkLimitReached_Rejects(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, auth := newTestCheckoutHandler(t, "")
	userID := registerTestUser(t, auth)

	productID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, is_active, product_kind, payment_limit_count)
		VALUES ($1, $2, 'Payment Link Terbatas', 50000, true, 'payment_link', 1)
	`, productID, userID); err != nil {
		t.Fatalf("gagal setup payment link test: %v", err)
	}
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (product_id, buyer_email, amount_idr, status) VALUES
			($1, 'sudah-bayar@example.com', 50000, 'paid'),
			($1, 'belum-bayar@example.com', 50000, 'pending')
	`, productID); err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	router := gin.New()
	router.POST("/checkout", checkout.Create)

	rec := doJSON(t, router, http.MethodPost, "/checkout", map[string]string{
		"product_id": productID, "buyer_email": "buyer-baru@example.com",
	}, nil)
	if rec.Code != http.StatusGone {
		t.Fatalf("status = %d, ekspektasi 410. Body: %s", rec.Code, rec.Body.String())
	}
}

// Modul Toko (Fase E5): toko yang dijeda pemiliknya (shop_paused_at terisi)
// harus menolak checkout baru DI BACKEND, bukan cuma disembunyikan di
// frontend -- mengikuti pola yang sama seperti pengecekan gating premium.
func TestCheckoutCreate_ShopPaused_Rejects(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, auth := newTestCheckoutHandler(t, "")
	userID := registerTestUser(t, auth)

	if _, err := checkout.DB.Exec(t.Context(), `UPDATE users SET shop_paused_at = now(), shop_paused_message = 'sedang libur' WHERE id = $1`, userID); err != nil {
		t.Fatalf("gagal setup shop_paused_at: %v", err)
	}

	productID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, is_active)
		VALUES ($1, $2, 'Produk Toko Dijeda', 50000, true)
	`, productID, userID); err != nil {
		t.Fatalf("gagal setup produk test: %v", err)
	}

	router := gin.New()
	router.POST("/checkout", checkout.Create)

	rec := doJSON(t, router, http.MethodPost, "/checkout", map[string]string{
		"product_id": productID, "buyer_email": "buyer@example.com",
	}, nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, ekspektasi 403. Body: %s", rec.Code, rec.Body.String())
	}
}

// Modul Toko (Fase D): status checkout untuk Payment Link yang SUDAH lunas
// menampilkan success_message KUSTOM kreator -- TIDAK ditampilkan kalau
// belum lunas (supaya pembeli yang belum bayar tidak melihat pesan sukses).
func TestCheckoutGetStatus_PaymentLinkPaid_ReturnsSuccessMessage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, auth := newTestCheckoutHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)

	productID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, is_active, product_kind, success_message)
		VALUES ($1, $2, 'Jasa Konsultasi', 50000, true, 'payment_link', 'Terima kasih, aku akan hubungi kamu lewat email dalam 1x24 jam.')
	`, productID, userID); err != nil {
		t.Fatalf("gagal setup payment link test: %v", err)
	}

	paidOrderID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status) VALUES ($1, $2, 'buyer@example.com', 50000, 'paid')
	`, paidOrderID, productID); err != nil {
		t.Fatalf("gagal setup order lunas: %v", err)
	}
	pendingOrderID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status) VALUES ($1, $2, 'buyer2@example.com', 50000, 'pending')
	`, pendingOrderID, productID); err != nil {
		t.Fatalf("gagal setup order pending: %v", err)
	}

	router := gin.New()
	router.GET("/checkout/:id/status", checkout.GetStatus)

	paidRec := doJSON(t, router, http.MethodGet, "/checkout/"+paidOrderID+"/status", nil, nil)
	var paidResp checkoutStatusResponse
	if err := json.Unmarshal(paidRec.Body.Bytes(), &paidResp); err != nil {
		t.Fatalf("gagal decode respons order lunas: %v", err)
	}
	if !paidResp.IsPaymentLink || paidResp.SuccessMessage != "Terima kasih, aku akan hubungi kamu lewat email dalam 1x24 jam." {
		t.Errorf("respons order lunas = %+v, ekspektasi is_payment_link=true dan success_message terisi", paidResp)
	}

	pendingRec := doJSON(t, router, http.MethodGet, "/checkout/"+pendingOrderID+"/status", nil, nil)
	var pendingResp checkoutStatusResponse
	if err := json.Unmarshal(pendingRec.Body.Bytes(), &pendingResp); err != nil {
		t.Fatalf("gagal decode respons order pending: %v", err)
	}
	if pendingResp.SuccessMessage != "" {
		t.Errorf("success_message = %q untuk order BELUM lunas, ekspektasi kosong", pendingResp.SuccessMessage)
	}
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

// Modul Toko (Fase C1): MarkFulfilled hanya berlaku untuk order status=
// "paid" milik produk delivery_method="manual" milik kreator yang login,
// dan idempoten (percobaan kedua tidak menimpa fulfilled_at pertama).
func TestMarkFulfilled_OnlyPaidManualOrdersOwnedByCreator(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, auth := newTestCheckoutHandler(t, "test-server-key")
	userID := registerTestUser(t, auth)
	otherUserID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)

	if _, err := checkout.DB.Exec(t.Context(), `UPDATE products SET delivery_method = 'manual' WHERE id = $1`, productID); err != nil {
		t.Fatalf("gagal set delivery_method: %v", err)
	}

	orderID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status) VALUES ($1, $2, 'buyer@example.com', 25000, 'paid')
	`, orderID, productID); err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/orders/:id/fulfill", checkout.MarkFulfilled)

	// Kreator LAIN tidak boleh menandai order ini selesai.
	forbiddenRec := doJSON(t, router, http.MethodPost, "/orders/"+orderID+"/fulfill", nil, map[string]string{"X-Test-UserID": otherUserID})
	if forbiddenRec.Code != http.StatusNotFound {
		t.Fatalf("status kreator lain = %d, ekspektasi 404", forbiddenRec.Code)
	}

	firstRec := doJSON(t, router, http.MethodPost, "/orders/"+orderID+"/fulfill", nil, map[string]string{"X-Test-UserID": userID})
	if firstRec.Code != http.StatusOK {
		t.Fatalf("status penandaan pertama = %d, body %s", firstRec.Code, firstRec.Body.String())
	}

	var firstFulfilledAt time.Time
	if err := checkout.DB.QueryRow(t.Context(), `SELECT fulfilled_at FROM orders WHERE id = $1`, orderID).Scan(&firstFulfilledAt); err != nil {
		t.Fatalf("gagal query fulfilled_at: %v", err)
	}

	// Percobaan kedua -- idempoten, TIDAK menimpa fulfilled_at yang sudah ada.
	secondRec := doJSON(t, router, http.MethodPost, "/orders/"+orderID+"/fulfill", nil, map[string]string{"X-Test-UserID": userID})
	if secondRec.Code != http.StatusNotFound {
		t.Fatalf("status penandaan kedua = %d, ekspektasi 404 (sudah ditandai selesai)", secondRec.Code)
	}

	var secondFulfilledAt time.Time
	if err := checkout.DB.QueryRow(t.Context(), `SELECT fulfilled_at FROM orders WHERE id = $1`, orderID).Scan(&secondFulfilledAt); err != nil {
		t.Fatalf("gagal query fulfilled_at kedua: %v", err)
	}
	if !firstFulfilledAt.Equal(secondFulfilledAt) {
		t.Errorf("fulfilled_at berubah setelah percobaan kedua (%v -> %v), ekspektasi tetap sama", firstFulfilledAt, secondFulfilledAt)
	}
}

// Modul Toko (Fase C2): pesanan lunas untuk produk delivery_method=
// "random_code" harus mengklaim TEPAT SATU kode dari stok yang belum
// diklaim -- kode itu terikat ke order ini (claimed_by_order_id) dan tidak
// lagi dihitung sebagai stok tersedia.
func TestCheckoutWebhook_ClaimsRandomCodeOnPayment(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const serverKey = "the-real-server-key"
	checkout, auth := newTestCheckoutHandler(t, serverKey)
	userID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)

	if _, err := checkout.DB.Exec(t.Context(), `UPDATE products SET delivery_method = 'random_code' WHERE id = $1`, productID); err != nil {
		t.Fatalf("gagal set delivery_method: %v", err)
	}
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO product_codes (id, product_id, code) VALUES ($1, $2, 'KODE-UNIK-1'), ($3, $2, 'KODE-UNIK-2')
	`, uuid.NewString(), productID, uuid.NewString()); err != nil {
		t.Fatalf("gagal setup stok kode: %v", err)
	}

	orderID := uuid.NewString()
	externalID := "jeonme-order-" + orderID
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status, psp_reference)
		VALUES ($1, $2, 'buyer@example.com', 25000, 'pending', $3)
	`, orderID, productID, externalID); err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	router := gin.New()
	router.POST("/webhook", checkout.Webhook)

	body := webhookPayload(t, serverKey, uuid.NewString(), externalID, "settlement")
	rec := doJSON(t, router, http.MethodPost, "/webhook", json.RawMessage(body), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("webhook: status %d, body %s", rec.Code, rec.Body.String())
	}

	var claimedCode string
	if err := checkout.DB.QueryRow(t.Context(), `
		SELECT code FROM product_codes WHERE claimed_by_order_id = $1
	`, orderID).Scan(&claimedCode); err != nil {
		t.Fatalf("gagal query kode terklaim: %v", err)
	}
	if claimedCode != "KODE-UNIK-1" && claimedCode != "KODE-UNIK-2" {
		t.Errorf("claimedCode = %q, ekspektasi salah satu dari stok", claimedCode)
	}

	var remainingUnclaimed int
	if err := checkout.DB.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM product_codes WHERE product_id = $1 AND claimed_by_order_id IS NULL
	`, productID).Scan(&remainingUnclaimed); err != nil {
		t.Fatalf("gagal query stok tersisa: %v", err)
	}
	if remainingUnclaimed != 1 {
		t.Errorf("remainingUnclaimed = %d, ekspektasi 1 (stok 2 dikurangi 1 yang baru diklaim)", remainingUnclaimed)
	}
}

// Modul Toko (Fase C2): kehabisan stok kode TIDAK BOLEH menggagalkan
// webhook -- pembayaran sudah sah, tidak bisa dibatalkan hanya karena
// stok kosong. Order tetap berstatus "paid", cuma tidak ada kode terklaim.
func TestCheckoutWebhook_RandomCodeOutOfStock_StillMarksPaid(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const serverKey = "the-real-server-key"
	checkout, auth := newTestCheckoutHandler(t, serverKey)
	userID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)

	if _, err := checkout.DB.Exec(t.Context(), `UPDATE products SET delivery_method = 'random_code' WHERE id = $1`, productID); err != nil {
		t.Fatalf("gagal set delivery_method: %v", err)
	}

	orderID := uuid.NewString()
	externalID := "jeonme-order-" + orderID
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status, psp_reference)
		VALUES ($1, $2, 'buyer@example.com', 25000, 'pending', $3)
	`, orderID, productID, externalID); err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	router := gin.New()
	router.POST("/webhook", checkout.Webhook)

	body := webhookPayload(t, serverKey, uuid.NewString(), externalID, "settlement")
	rec := doJSON(t, router, http.MethodPost, "/webhook", json.RawMessage(body), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("webhook: status %d, body %s", rec.Code, rec.Body.String())
	}

	var status string
	if err := checkout.DB.QueryRow(t.Context(), `SELECT status FROM orders WHERE id = $1`, orderID).Scan(&status); err != nil {
		t.Fatalf("gagal query order: %v", err)
	}
	if status != "paid" {
		t.Fatalf("status = %q, ekspektasi paid walau stok kode kosong", status)
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
