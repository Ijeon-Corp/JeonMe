package worker

import (
	"encoding/json"
	"os"
	"testing"
	"time"

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

	// SMTPHost & kredensial WhatsApp sengaja kosong -- mailer.Send/
	// whatsapp.SendOrderConfirmation akan log-only (lihat internal/mailer &
	// internal/whatsapp), test ini membuktikan alur query & kontrol worker,
	// bukan pengiriman SMTP/WhatsApp sungguhan.
	mailerClient := mailer.NewClient("", 587, "", "", "no-reply@jeonme.test")
	whatsappClient := whatsapp.NewClient("", "", "order_confirmation", "id")
	return NewHandler(db, rdb, mailerClient, whatsappClient, "http://localhost:8080/api/v1", 3, []byte("jeonme-dev-encryption-key-32-ok!"))
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

// Modul Settings §6: permintaan hapus akun yang SUDAH jatuh tempo (scheduled_purge_at
// di masa lalu) harus dianonimkan oleh scan, status berubah jadi 'completed',
// DAN sesi aktifnya dicabut -- sama seperti perilaku AccountHandler.DeleteAccount
// instan versi lama, cuma sekarang dipicu worker bukan HTTP handler langsung.
func TestHandleAccountPurgeScan_AnonymizesDueRequestAndRevokesSessions(t *testing.T) {
	h := newTestHandler(t)

	userID := uuid.NewString()
	suffix := uuid.NewString()[:8]
	originalEmail := "worker-" + suffix + "@example.com"
	originalUsername := "workeruser" + suffix
	if _, err := h.DB.Exec(t.Context(), `
		INSERT INTO users (id, email, username, password_hash, consent_accepted_at)
		VALUES ($1, $2, $3, 'x', now())
	`, userID, originalEmail, originalUsername); err != nil {
		t.Fatalf("gagal setup user test: %v", err)
	}
	// Berbeda dari registerTestUser (handlers package, lewat AuthHandler.Register
	// sungguhan yang otomatis membuat baris pages) -- di sini user disisipkan
	// langsung lewat SQL, jadi baris pages harus dibuat manual.
	if _, err := h.DB.Exec(t.Context(), `
		INSERT INTO pages (user_id, is_published, is_primary) VALUES ($1, true, true)
	`, userID); err != nil {
		t.Fatalf("gagal setup halaman test: %v", err)
	}

	requestID := uuid.NewString()
	if _, err := h.DB.Exec(t.Context(), `
		INSERT INTO account_deletion_requests (id, user_id, scheduled_purge_at, status)
		VALUES ($1, $2, now() - interval '1 hour', 'pending')
	`, requestID, userID); err != nil {
		t.Fatalf("gagal setup permintaan hapus akun test: %v", err)
	}

	// Sesi aktif palsu -- harus tercabut (masuk denylist + baris sesi
	// terhapus) setelah purge, lihat komentar purgeAccount.
	sessionJTI := uuid.NewString()
	sessionKey := "session:" + userID + ":" + sessionJTI
	sessionData, _ := json.Marshal(map[string]any{
		"created_at": time.Now(), "expires_at": time.Now().Add(20 * time.Hour), "user_agent": "test-agent", "ip": "127.0.0.1",
	})
	if err := h.RDB.Set(t.Context(), sessionKey, sessionData, 20*time.Hour).Err(); err != nil {
		t.Fatalf("gagal setup sesi test: %v", err)
	}

	// Permintaan LAIN yang belum jatuh tempo tidak boleh ikut diproses.
	notDueUserID := uuid.NewString()
	if _, err := h.DB.Exec(t.Context(), `
		INSERT INTO users (id, email, username, password_hash, consent_accepted_at)
		VALUES ($1, $2, $3, 'x', now())
	`, notDueUserID, "worker-notdue-"+suffix+"@example.com", "notdueuser"+suffix); err != nil {
		t.Fatalf("gagal setup user belum jatuh tempo: %v", err)
	}
	notDueRequestID := uuid.NewString()
	if _, err := h.DB.Exec(t.Context(), `
		INSERT INTO account_deletion_requests (id, user_id, scheduled_purge_at, status)
		VALUES ($1, $2, now() + interval '13 days', 'pending')
	`, notDueRequestID, notDueUserID); err != nil {
		t.Fatalf("gagal setup permintaan belum jatuh tempo: %v", err)
	}

	if err := h.HandleAccountPurgeScan(t.Context(), asynq.NewTask(queue.TypeAccountPurgeScan, nil)); err != nil {
		t.Fatalf("HandleAccountPurgeScan: error tidak terduga: %v", err)
	}

	var email, username, passwordHash string
	var deletedAt *time.Time
	if err := h.DB.QueryRow(t.Context(), `
		SELECT email, username, password_hash, deleted_at FROM users WHERE id = $1
	`, userID).Scan(&email, &username, &passwordHash, &deletedAt); err != nil {
		t.Fatalf("gagal query user setelah purge: %v", err)
	}
	if email == originalEmail || username == originalUsername {
		t.Errorf("email/username tidak berubah setelah purge -- dapat (%q, %q)", email, username)
	}
	if passwordHash != "deleted" {
		t.Errorf("password_hash = %q, ekspektasi \"deleted\"", passwordHash)
	}
	if deletedAt == nil {
		t.Error("deleted_at masih NULL setelah purge")
	}

	var isPublished bool
	if err := h.DB.QueryRow(t.Context(), `SELECT is_published FROM pages WHERE user_id = $1`, userID).Scan(&isPublished); err != nil {
		t.Fatalf("gagal query pages: %v", err)
	}
	if isPublished {
		t.Error("halaman masih is_published=true setelah purge")
	}

	var requestStatus string
	if err := h.DB.QueryRow(t.Context(), `SELECT status FROM account_deletion_requests WHERE id = $1`, requestID).Scan(&requestStatus); err != nil {
		t.Fatalf("gagal query status permintaan: %v", err)
	}
	if requestStatus != "completed" {
		t.Errorf("status permintaan = %q, ekspektasi \"completed\"", requestStatus)
	}

	revoked, err := h.RDB.Exists(t.Context(), "revoked_jti:"+sessionJTI).Result()
	if err != nil || revoked == 0 {
		t.Error("jti sesi tidak masuk denylist setelah purge, ekspektasi langsung tercabut")
	}
	sessionStillThere, err := h.RDB.Exists(t.Context(), sessionKey).Result()
	if err != nil || sessionStillThere != 0 {
		t.Error("catatan sesi masih ada setelah purge, ekspektasi terhapus")
	}

	var notDueStatus string
	if err := h.DB.QueryRow(t.Context(), `SELECT status FROM account_deletion_requests WHERE id = $1`, notDueRequestID).Scan(&notDueStatus); err != nil {
		t.Fatalf("gagal query status permintaan belum jatuh tempo: %v", err)
	}
	if notDueStatus != "pending" {
		t.Errorf("permintaan belum jatuh tempo status = %q, ekspektasi tetap \"pending\"", notDueStatus)
	}
}

// Modul Settings §4: email undangan tim harus terkirim tanpa error walau
// SMTP belum dikonfigurasi (soft-fail log-only, sama seperti notifikasi
// order.paid/formulir kontak).
func TestHandleTeamInviteNotification_Succeeds(t *testing.T) {
	h := newTestHandler(t)

	task, err := queue.NewTeamInviteTask(queue.TeamInvitePayload{
		OwnerUsername: "pemilik-test", CollaboratorEmail: "kolaborator@example.com", Role: "sales_admin",
	})
	if err != nil {
		t.Fatalf("gagal encode task: %v", err)
	}

	if err := h.HandleTeamInviteNotification(t.Context(), task); err != nil {
		t.Fatalf("HandleTeamInviteNotification: error tidak terduga: %v", err)
	}
}
