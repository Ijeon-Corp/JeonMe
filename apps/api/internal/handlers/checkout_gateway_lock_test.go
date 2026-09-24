package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// TestCheckoutCreate_ProductLockReleasedBeforeGatewayCall -- audit 24
// September 2026 (P2#7): kunci FOR UPDATE baris produk SEBELUMNYA ditahan
// selama panggilan HTTP ke gateway. Mock Snap di sini mencoba mengunci
// baris produk yang sama dgn NOWAIT DARI DALAM panggilan gateway -- kalau
// Create masih memegang kuncinya, NOWAIT gagal (lock_not_available).
func TestCheckoutCreate_ProductLockReleasedBeforeGatewayCall(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, auth := newTestCheckoutHandler(t, "the-real-server-key")
	userID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)

	var lockErr error
	lockChecked := false
	snapServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		tx, err := checkout.DB.Begin(ctx)
		if err != nil {
			lockErr = err
		} else {
			_, lockErr = tx.Exec(ctx, `SELECT id FROM products WHERE id = $1 FOR UPDATE NOWAIT`, productID)
			_ = tx.Rollback(ctx)
		}
		lockChecked = true
		_ = json.NewEncoder(w).Encode(map[string]string{"token": "mock-token", "redirect_url": "https://mock-snap.test/invoice/lock"})
	}))
	defer snapServer.Close()
	checkout.Midtrans.BaseURL = snapServer.URL

	router := gin.New()
	router.POST("/checkout", checkout.Create)
	rec := doJSON(t, router, http.MethodPost, "/checkout", map[string]string{
		"product_id": productID, "buyer_email": "buyer@example.com", "buyer_name": "Pembeli Kunci",
	}, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create checkout: status %d, body %s", rec.Code, rec.Body.String())
	}
	if !lockChecked {
		t.Fatal("mock gateway tidak pernah dipanggil")
	}
	if lockErr != nil {
		t.Fatalf("baris produk masih terkunci selama panggilan gateway: %v", lockErr)
	}
}

// TestCheckoutCreate_GatewayFailureRemovesOrderAndRestoresVoucher --
// karena order kini di-commit SEBELUM gateway dipanggil, kegagalan gateway
// wajib dikompensasi: order pending dihapus (tidak memakan kuota event /
// muncul di riwayat kreator) dan used_count voucher sekali-pakai kembali,
// persis efek rollback lama.
func TestCheckoutCreate_GatewayFailureRemovesOrderAndRestoresVoucher(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, auth := newTestCheckoutHandler(t, "the-real-server-key")
	userID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)

	voucherID := uuid.NewString()
	code := "GAGAL" + strings.ToUpper(uuid.NewString()[:8])
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO vouchers (id, user_id, code, discount_type, discount_value, max_uses)
		VALUES ($1, $2, $3, 'percentage', 10, 1)
	`, voucherID, userID, code); err != nil {
		t.Fatalf("seed voucher: %v", err)
	}

	snapServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error_messages":["mock down"]}`))
	}))
	defer snapServer.Close()
	checkout.Midtrans.BaseURL = snapServer.URL

	router := gin.New()
	router.POST("/checkout", checkout.Create)
	rec := doJSON(t, router, http.MethodPost, "/checkout", map[string]string{
		"product_id": productID, "buyer_email": "buyer@example.com", "buyer_name": "Pembeli Gagal", "voucher_code": code,
	}, nil)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, ekspektasi 502. Body: %s", rec.Code, rec.Body.String())
	}

	var orderCount, usedCount int
	if err := checkout.DB.QueryRow(t.Context(), `SELECT COUNT(*) FROM orders WHERE product_id = $1`, productID).Scan(&orderCount); err != nil {
		t.Fatalf("hitung order: %v", err)
	}
	if orderCount != 0 {
		t.Fatalf("masih ada %d order setelah gateway gagal, ekspektasi 0", orderCount)
	}
	if err := checkout.DB.QueryRow(t.Context(), `SELECT used_count FROM vouchers WHERE id = $1`, voucherID).Scan(&usedCount); err != nil {
		t.Fatalf("baca voucher: %v", err)
	}
	if usedCount != 0 {
		t.Fatalf("used_count voucher = %d setelah gateway gagal, ekspektasi 0", usedCount)
	}
}
