// Package worker mengimplementasikan handler task asynq yang dijalankan
// oleh subcommand `./api worker` (proses terpisah dari server HTTP utama --
// lihat main.go). Task saat ini hanya notifikasi order.paid (REQ-F-405).
package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/audit"
	"github.com/jeonme/api/internal/crypto"
	"github.com/jeonme/api/internal/mailer"
	"github.com/jeonme/api/internal/payout"
	"github.com/jeonme/api/internal/queue"
	"github.com/jeonme/api/internal/whatsapp"
)

type Handler struct {
	DB                *pgxpool.Pool
	RDB               *redis.Client
	Mailer            *mailer.Client
	WhatsApp          *whatsapp.Client
	PublicAPIURL      string
	HoldingPeriodDays int
	EncryptionKey     []byte
}

func NewHandler(db *pgxpool.Pool, rdb *redis.Client, mailerClient *mailer.Client, whatsappClient *whatsapp.Client, publicAPIURL string, holdingPeriodDays int, encryptionKey []byte) *Handler {
	return &Handler{
		DB: db, RDB: rdb, Mailer: mailerClient, WhatsApp: whatsappClient, PublicAPIURL: publicAPIURL,
		HoldingPeriodDays: holdingPeriodDays, EncryptionKey: encryptionKey,
	}
}

// Mux merakit ServeMux asynq -- dipanggil main.go subcommand `worker`.
func (h *Handler) Mux() *asynq.ServeMux {
	mux := asynq.NewServeMux()
	mux.HandleFunc(queue.TypeOrderPaidNotification, h.HandleOrderPaidNotification)
	mux.HandleFunc(queue.TypeContactFormNotification, h.HandleContactFormNotification)
	mux.HandleFunc(queue.TypeAutoWithdrawScan, h.HandleAutoWithdrawScan)
	mux.HandleFunc(queue.TypeAccountPurgeScan, h.HandleAccountPurgeScan)
	mux.HandleFunc(queue.TypeTeamInviteNotification, h.HandleTeamInviteNotification)
	return mux
}

// teamRoleLabel -- label Indonesia untuk role di email undangan (pola sama
// dengan paymentMethodLabel di balance.go: pemetaan nilai mentah -> teks
// ramah manusia).
func teamRoleLabel(role string) string {
	switch role {
	case "content_admin":
		return "Admin Konten (Tautan & Desain)"
	case "sales_admin":
		return "Admin Penjualan (Produk)"
	case "full_access":
		return "Akses Penuh"
	default:
		return role
	}
}

// HandleTeamInviteNotification -- Modul Settings §4: email undangan tim,
// pola sama persis dengan HandleContactFormNotification (tidak ada status
// untuk dicek ulang, pesan yang sudah dienqueue selalu relevan untuk
// dikirim).
func (h *Handler) HandleTeamInviteNotification(_ context.Context, t *asynq.Task) error {
	var payload queue.TeamInvitePayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("worker: payload tidak valid: %w", err)
	}

	subject := fmt.Sprintf("Kamu diundang bergabung ke tim @%s di Jeonme", payload.OwnerUsername)
	body := fmt.Sprintf(
		"@%s mengundangmu bergabung sebagai kolaborator dengan peran %s.\n\n"+
			"Masuk ke akun Jeonme-mu (daftar dulu dengan email ini kalau belum punya akun) lalu buka "+
			"Tim & Kolaborator > Undangan untuk Saya untuk menerima.\n\nSalam,\nTim Jeonme",
		payload.OwnerUsername, teamRoleLabel(payload.Role),
	)

	if err := h.Mailer.Send(payload.CollaboratorEmail, subject, body); err != nil {
		return fmt.Errorf("worker: gagal kirim undangan tim: %w", err)
	}

	log.Printf("worker: undangan tim untuk @%s terkirim ke %s", payload.OwnerUsername, payload.CollaboratorEmail)
	return nil
}

// HandleAccountPurgeScan -- Modul Settings §6: dijalankan HARIAN (lihat
// asynq.Scheduler di main.go), sama seperti auto-withdraw scan. Idempotent
// by design: hanya memproses baris status='pending' -- begitu satu baris
// selesai (status diubah jadi 'completed' DALAM transaksi yang sama dengan
// anonimisasinya), pemindaian berikutnya (mis. proses sebelumnya crash di
// tengah jalan) tidak akan memprosesnya lagi.
func (h *Handler) HandleAccountPurgeScan(ctx context.Context, t *asynq.Task) error {
	rows, err := h.DB.Query(ctx, `
		SELECT id, user_id FROM account_deletion_requests WHERE status = 'pending' AND scheduled_purge_at <= now()
	`)
	if err != nil {
		return fmt.Errorf("worker: gagal memuat permintaan hapus akun jatuh tempo: %w", err)
	}
	type dueRequest struct {
		RequestID string
		UserID    string
	}
	var due []dueRequest
	for rows.Next() {
		var d dueRequest
		if err := rows.Scan(&d.RequestID, &d.UserID); err != nil {
			continue
		}
		due = append(due, d)
	}
	rows.Close()

	for _, d := range due {
		if err := h.purgeAccount(ctx, d.RequestID, d.UserID); err != nil {
			// Sama seperti auto-withdraw: satu akun gagal TIDAK BOLEH
			// menghentikan purge akun lain -- log & lanjut.
			log.Printf("worker: gagal purge akun user %s: %v", d.UserID, err)
		}
	}
	return nil
}

// purgeAccount -- anonimisasi PERMANEN (email/username diacak, password
// dinonaktifkan, halaman & produk dinonaktifkan). Logika sama persis dengan
// AccountHandler.DeleteAccount versi lama (instan) yang sudah dihapus --
// bedanya sekarang dijalankan worker setelah masa tunggu 14 hari, bukan
// langsung dari HTTP handler.
func (h *Handler) purgeAccount(ctx context.Context, requestID, userID string) error {
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	anonymizedEmail := "deleted-" + userID + "@deleted.jeonme.invalid"
	anonymizedUsername := "deleted-" + userID[:8]

	if _, err := tx.Exec(ctx, `
		UPDATE users SET email = $1, username = $2, password_hash = 'deleted', deleted_at = now(), deactivated_at = NULL
		WHERE id = $3
	`, anonymizedEmail, anonymizedUsername, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE pages SET is_published = false WHERE user_id = $1`, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE products SET is_active = false WHERE user_id = $1`, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE account_deletion_requests SET status = 'completed', completed_at = now() WHERE id = $1
	`, requestID); err != nil {
		return err
	}
	if err := audit.Log(ctx, tx, userID, "account.purged", "user", userID, nil); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	// Mencabut SEMUA sesi aktif supaya token lama yang belum kedaluwarsa
	// (maks 24 jam, lihat AuthHandler.issueToken) tidak bisa dipakai lagi
	// begitu akun sungguh dianonimkan. Pola sesi disalin kecil dari
	// handlers/session.go -- package ini SENGAJA tidak mengimpor package
	// handlers (pemisahan proses/paket sejak awal proyek).
	if h.RDB != nil {
		revokeAllSessions(ctx, h.RDB, userID)
	}
	return nil
}

func revokeAllSessions(ctx context.Context, rdb *redis.Client, userID string) {
	prefix := "session:" + userID + ":"
	iter := rdb.Scan(ctx, 0, prefix+"*", 100).Iterator()
	for iter.Next(ctx) {
		key := iter.Val()
		jti := strings.TrimPrefix(key, prefix)

		data, err := rdb.Get(ctx, key).Bytes()
		if err != nil {
			continue
		}
		var rec struct {
			ExpiresAt time.Time `json:"expires_at"`
		}
		if err := json.Unmarshal(data, &rec); err != nil {
			continue
		}
		if ttl := time.Until(rec.ExpiresAt); ttl > 0 {
			_ = rdb.Set(ctx, "revoked_jti:"+jti, "1", ttl).Err()
		}
		_ = rdb.Del(ctx, key).Err()
	}
}

// HandleAutoWithdrawScan -- Modul Settings §3: dijalankan HARIAN (lihat
// asynq.Scheduler di main.go). Weekly jatuh tempo tiap Senin, monthly
// jatuh tempo tiap tanggal 1 -- PLACEHOLDER bisnis sederhana (belum ada
// keputusan resmi soal hari/tanggal spesifik, sama status dengan
// payout.MinIDR) -- cukup SATU scan harian yang tahu sendiri frekuensi
// mana yang "jatuh tempo" hari ini, bukan job terpisah per frekuensi.
func (h *Handler) HandleAutoWithdrawScan(ctx context.Context, t *asynq.Task) error {
	now := time.Now()
	dueWeekly := now.Weekday() == time.Monday
	dueMonthly := now.Day() == 1
	if !dueWeekly && !dueMonthly {
		return nil
	}

	rows, err := h.DB.Query(ctx, `
		SELECT user_id, frequency, min_threshold_idr FROM payout_schedule WHERE frequency IN ('weekly', 'monthly')
	`)
	if err != nil {
		return fmt.Errorf("worker: gagal memuat jadwal auto-withdraw: %w", err)
	}
	type dueSchedule struct {
		UserID          string
		Frequency       string
		MinThresholdIDR int64
	}
	var candidates []dueSchedule
	for rows.Next() {
		var d dueSchedule
		if err := rows.Scan(&d.UserID, &d.Frequency, &d.MinThresholdIDR); err != nil {
			continue
		}
		if (d.Frequency == "weekly" && dueWeekly) || (d.Frequency == "monthly" && dueMonthly) {
			candidates = append(candidates, d)
		}
	}
	rows.Close()

	for _, d := range candidates {
		if err := h.processAutoWithdraw(ctx, d.UserID, d.MinThresholdIDR); err != nil {
			// Satu kreator gagal (mis. belum ada metode utama terverifikasi,
			// saldo di bawah threshold) TIDAK BOLEH menghentikan scan
			// kreator lain -- log & lanjut, bukan return error (yang akan
			// membuat asynq me-retry SELURUH scan dari awal).
			log.Printf("worker: auto-withdraw gagal untuk user %s: %v", d.UserID, err)
		}
	}
	return nil
}

// processAutoWithdraw -- satu kreator. "Belum jatuh tempo secara saldo"
// (di bawah threshold) BUKAN error, cuma dilewati diam-diam.
func (h *Handler) processAutoWithdraw(ctx context.Context, userID string, minThresholdIDR int64) error {
	var total, held int64
	if err := h.DB.QueryRow(ctx, `SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return err
	}
	if err := h.DB.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries
		WHERE user_id = $1 AND type = 'credit' AND created_at > now() - make_interval(days => $2)
	`, userID, h.HoldingPeriodDays).Scan(&held); err != nil {
		return err
	}
	available := total - held
	if available < minThresholdIDR || available < payout.MinIDR {
		return nil
	}

	var payoutMethodID, encryptedAccount, accountName string
	err := h.DB.QueryRow(ctx, `
		SELECT id, account_number_encrypted, account_name FROM payout_methods
		WHERE user_id = $1 AND is_primary = true AND verified = true
	`, userID).Scan(&payoutMethodID, &encryptedAccount, &accountName)
	if err != nil {
		return fmt.Errorf("tidak ada metode pembayaran utama terverifikasi: %w", err)
	}

	accountNumber, err := crypto.Decrypt(h.EncryptionKey, encryptedAccount)
	if err != nil {
		return err
	}
	destinationAccount := accountName + " - " + accountNumber

	_, err = payout.Create(ctx, h.DB, userID, available, h.HoldingPeriodDays, &payoutMethodID, destinationAccount, "auto")
	return err
}

// HandleOrderPaidNotification -- REQ-F-405: kirim email notifikasi + link
// unduhan ke pembeli setelah pembayaran dikonfirmasi. Link unduhan mengarah
// ke endpoint API kita sendiri (bukan presigned URL S3 langsung) supaya
// tautan di email TETAP VALID kapan pun dibuka -- endpoint itu yang
// membuatkan presigned URL baru (berumur pendek) setiap kali diklik, lihat
// CheckoutHandler.DownloadFile.
func (h *Handler) HandleOrderPaidNotification(ctx context.Context, t *asynq.Task) error {
	var payload queue.OrderPaidPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("worker: payload tidak valid: %w", err)
	}

	var buyerEmail, buyerContact, productName, status string
	var isDonation bool
	err := h.DB.QueryRow(ctx, `
		SELECT o.buyer_email, o.buyer_contact, p.name, o.status, p.is_donation
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, payload.OrderID).Scan(&buyerEmail, &buyerContact, &productName, &status, &isDonation)
	if err != nil {
		if err == pgx.ErrNoRows {
			log.Printf("worker: order %s tidak ditemukan, lewati notifikasi", payload.OrderID)
			return nil
		}
		return fmt.Errorf("worker: gagal memuat order %s: %w", payload.OrderID, err)
	}

	if status != "paid" {
		// Race jarang (mis. refund langsung setelah lunas) -- kondisi
		// terbaru bukan "paid" lagi, tidak perlu retry.
		log.Printf("worker: order %s statusnya sekarang %q (bukan paid), lewati notifikasi", payload.OrderID, status)
		return nil
	}

	var subject, body, downloadURL string
	if isDonation {
		// No.71: donasi tidak pernah punya file -- ucapan terima kasih
		// saja, TANPA tautan unduhan (tidak ada yang bisa diunduh).
		subject = fmt.Sprintf("Terima kasih atas dukunganmu: %s", productName)
		body = fmt.Sprintf(
			"Terima kasih sudah memberi dukungan lewat %s di Jeonme!\n\n"+
				"Dukunganmu langsung diteruskan ke kreator. Sampai jumpa lagi!\n\n"+
				"Salam,\nTim Jeonme",
			productName,
		)
	} else {
		downloadURL = fmt.Sprintf("%s/checkout/%s/download", h.PublicAPIURL, payload.OrderID)
		subject = fmt.Sprintf("Pesananmu di Jeonme sudah bisa diunduh: %s", productName)
		body = fmt.Sprintf(
			"Terima kasih sudah membeli %s di Jeonme!\n\n"+
				"Unduh file kamu lewat tautan berikut (bisa dipakai berkali-kali):\n%s\n\n"+
				"Salam,\nTim Jeonme",
			productName, downloadURL,
		)
	}

	if err := h.Mailer.Send(buyerEmail, subject, body); err != nil {
		return fmt.Errorf("worker: gagal kirim notifikasi order %s: %w", payload.OrderID, err)
	}

	log.Printf("worker: notifikasi order %s terkirim ke %s", payload.OrderID, buyerEmail)

	// No.74 (Sprint 8, lanjutan No.47): kanal WhatsApp TAMBAHAN -- best-
	// effort, SENGAJA tidak mempengaruhi keberhasilan task ini sama sekali
	// (email di atas SUDAH berhasil terkirim, itu kanal wajib satu-satunya).
	// Kegagalan di sini (belum dikonfigurasi, nomor tidak valid, Graph API
	// menolak) hanya di-log, TIDAK mengembalikan error -- kalau
	// dikembalikan sebagai error, asynq akan retry SELURUH task termasuk
	// pengiriman email yang sudah sukses, berpotensi mengirim email
	// duplikat ke pembeli hanya karena kanal sekunder gagal.
	//
	// Donasi belum didukung (butuh template Meta terpisah tanpa parameter
	// tautan unduhan -- lihat catatan cakupan di internal/whatsapp/client.go)
	// -- sengaja dilewati dulu, fokus pada kasus pembelian dengan file yang
	// justru paling mendesak (Task No.74).
	//
	// Pengecekan h.WhatsApp.IsConfigured() SENGAJA tidak diulang di sini
	// (cukup buyerContact != "") -- SendOrderConfirmation sudah menangani &
	// MELOG sendiri kondisi belum dikonfigurasi (persis pola mailer.Send),
	// supaya order dengan nomor kontak yang genuinely dilewati karena
	// WhatsApp belum aktif tetap KETAHUAN di log, bukan diam-diam hilang.
	if !isDonation && buyerContact != "" {
		normalized, err := whatsapp.NormalizeIndonesianPhone(buyerContact)
		if err != nil {
			log.Printf("worker: order %s -- nomor kontak %q tidak valid, lewati notifikasi WhatsApp: %v", payload.OrderID, buyerContact, err)
		} else if err := h.WhatsApp.SendOrderConfirmation(ctx, normalized, []string{productName, downloadURL}); err != nil {
			log.Printf("worker: order %s -- gagal kirim notifikasi WhatsApp ke %s: %v", payload.OrderID, normalized, err)
		} else {
			log.Printf("worker: order %s -- notifikasi WhatsApp terkirim ke %s", payload.OrderID, normalized)
		}
	}

	return nil
}

// HandleContactFormNotification -- No.77 (Sprint 9): kirim email ke kreator
// begitu ada pesan baru masuk lewat blok Formulir Kontak di halaman
// publiknya. Tidak ada status untuk dicek ulang (beda dari order.paid) --
// pesan yang sudah dienqueue selalu relevan untuk dikirim.
func (h *Handler) HandleContactFormNotification(_ context.Context, t *asynq.Task) error {
	var payload queue.ContactFormPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("worker: payload tidak valid: %w", err)
	}

	subject := fmt.Sprintf("Pesan baru dari formulir kontak halamanmu (@%s)", payload.PageUsername)
	body := fmt.Sprintf(
		"Ada pesan baru dari pengunjung halamanmu:\n\nNama: %s\nEmail: %s\n\nPesan:\n%s\n\nSalam,\nTim Jeonme",
		payload.VisitorName, payload.VisitorEmail, payload.Message,
	)

	if err := h.Mailer.Send(payload.CreatorEmail, subject, body); err != nil {
		return fmt.Errorf("worker: gagal kirim notifikasi formulir kontak: %w", err)
	}

	log.Printf("worker: notifikasi formulir kontak terkirim ke %s", payload.CreatorEmail)
	return nil
}
