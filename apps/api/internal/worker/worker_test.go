package worker

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/jeonme/api/internal/database"
	"github.com/jeonme/api/internal/mailer"
	"github.com/jeonme/api/internal/queue"
	"github.com/jeonme/api/internal/whatsapp"
)

func mustEnv(t *testing.T, key string) string {
	t.Helper()
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		t.Fatalf("environment variable test %q belum diset", key)
	}
	return v
}

func newTestHandler(t *testing.T) *Handler {
	t.Helper()
	dbURL := mustEnv(t, "DATABASE_URL")

	db, err := database.NewPostgresPool(dbURL)
	if err != nil {
		t.Fatalf("gagal konek database test: %v", err)
	}
	t.Cleanup(db.Close)

	// SMTPHost & kredensial WhatsApp sengaja kosong -- mailer.Send/
	// whatsapp.SendOrderConfirmation akan log-only (lihat internal/mailer &
	// internal/whatsapp), test ini membuktikan alur query & kontrol worker,
	// bukan pengiriman SMTP/WhatsApp sungguhan.
	mailerClient := mailer.NewClient("", 587, "", "", "no-reply@jeonme.test")
	whatsappClient := whatsapp.NewClient("", "", "order_confirmation", "id")
	return NewHandler(db, mailerClient, whatsappClient, "http://localhost:8080/api/v1")
}

func newTestTask(t *testing.T, orderID string) *asynq.Task {
	t.Helper()
	payload, err := json.Marshal(queue.OrderPaidPayload{OrderID: orderID})
	if err != nil {
		t.Fatalf("gagal encode payload test: %v", err)
	}
	return asynq.NewTask(queue.TypeOrderPaidNotification, payload)
}

// Order berstatus "paid" harus diproses tanpa error (mailer soft-fail
// karena SMTP belum dikonfigurasi tetap dianggap "selesai", bukan gagal --
// lihat internal/mailer).
func TestHandleOrderPaidNotification_PaidOrder_Succeeds(t *testing.T) {
	h := newTestHandler(t)

	userID := uuid.NewString()
	suffix := uuid.NewString()[:8]
	_, err := h.DB.Exec(t.Context(), `
		INSERT INTO users (id, email, username, password_hash, consent_accepted_at)
		VALUES ($1, $2, $3, 'x', now())
	`, userID, "worker-"+suffix+"@example.com", "workeruser"+suffix)
	if err != nil {
		t.Fatalf("gagal setup user test: %v", err)
	}

	productID := uuid.NewString()
	_, err = h.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, file_key, is_active)
		VALUES ($1, $2, 'Produk Worker Test', 25000, 'products/test/file.pdf', true)
	`, productID, userID)
	if err != nil {
		t.Fatalf("gagal setup produk test: %v", err)
	}

	orderID := uuid.NewString()
	_, err = h.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status, psp_reference)
		VALUES ($1, $2, 'buyer@example.com', 25000, 'paid', $3)
	`, orderID, productID, "jeonme-order-"+orderID)
	if err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	if err := h.HandleOrderPaidNotification(t.Context(), newTestTask(t, orderID)); err != nil {
		t.Fatalf("HandleOrderPaidNotification: error tidak terduga: %v", err)
	}
}

// No.74: order dengan buyer_contact terisi harus TETAP diproses tanpa error
// walau WhatsApp belum dikonfigurasi (IsConfigured()==false) -- membuktikan
// jalur WhatsApp best-effort di HandleOrderPaidNotification tidak pernah
// menggagalkan task walau nomor kontak ada, konsisten dengan kegagalan
// email yang sengaja TIDAK mempengaruhi task ini (lihat komentar di worker.go).
func TestHandleOrderPaidNotification_WithBuyerContact_SucceedsWithoutWhatsAppConfigured(t *testing.T) {
	h := newTestHandler(t)

	userID := uuid.NewString()
	suffix := uuid.NewString()[:8]
	_, err := h.DB.Exec(t.Context(), `
		INSERT INTO users (id, email, username, password_hash, consent_accepted_at)
		VALUES ($1, $2, $3, 'x', now())
	`, userID, "worker-"+suffix+"@example.com", "workeruser"+suffix)
	if err != nil {
		t.Fatalf("gagal setup user test: %v", err)
	}

	productID := uuid.NewString()
	_, err = h.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, file_key, is_active)
		VALUES ($1, $2, 'Produk Worker Test', 25000, 'products/test/file.pdf', true)
	`, productID, userID)
	if err != nil {
		t.Fatalf("gagal setup produk test: %v", err)
	}

	orderID := uuid.NewString()
	_, err = h.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, buyer_contact, amount_idr, status, psp_reference)
		VALUES ($1, $2, 'buyer@example.com', '081234567890', 25000, 'paid', $3)
	`, orderID, productID, "jeonme-order-"+orderID)
	if err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	if err := h.HandleOrderPaidNotification(t.Context(), newTestTask(t, orderID)); err != nil {
		t.Fatalf("HandleOrderPaidNotification: error tidak terduga untuk order dengan buyer_contact: %v", err)
	}
}

// Order yang statusnya BUKAN "paid" (mis. race jarang, status berubah lagi
// sebelum job diproses) harus dilewati tanpa error -- TIDAK retry.
func TestHandleOrderPaidNotification_NonPaidOrder_SkipsWithoutError(t *testing.T) {
	h := newTestHandler(t)

	userID := uuid.NewString()
	suffix := uuid.NewString()[:8]
	_, err := h.DB.Exec(t.Context(), `
		INSERT INTO users (id, email, username, password_hash, consent_accepted_at)
		VALUES ($1, $2, $3, 'x', now())
	`, userID, "worker-"+suffix+"@example.com", "workeruser"+suffix)
	if err != nil {
		t.Fatalf("gagal setup user test: %v", err)
	}

	productID := uuid.NewString()
	_, err = h.DB.Exec(t.Context(), `
		INSERT INTO products (id, user_id, name, price_idr, file_key, is_active)
		VALUES ($1, $2, 'Produk Worker Test', 25000, 'products/test/file.pdf', true)
	`, productID, userID)
	if err != nil {
		t.Fatalf("gagal setup produk test: %v", err)
	}

	orderID := uuid.NewString()
	_, err = h.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status, psp_reference)
		VALUES ($1, $2, 'buyer@example.com', 25000, 'expired', $3)
	`, orderID, productID, "jeonme-order-"+orderID)
	if err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	if err := h.HandleOrderPaidNotification(t.Context(), newTestTask(t, orderID)); err != nil {
		t.Fatalf("HandleOrderPaidNotification: error tidak terduga untuk order non-paid: %v", err)
	}
}

// Order yang tidak ditemukan (mis. task lama untuk data yang sudah tidak
// ada) harus dilewati tanpa error -- TIDAK retry sia-sia.
func TestHandleOrderPaidNotification_OrderNotFound_SkipsWithoutError(t *testing.T) {
	h := newTestHandler(t)

	if err := h.HandleOrderPaidNotification(t.Context(), newTestTask(t, uuid.NewString())); err != nil {
		t.Fatalf("HandleOrderPaidNotification: error tidak terduga untuk order yang tidak ada: %v", err)
	}
}
