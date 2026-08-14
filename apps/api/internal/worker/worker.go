// Package worker mengimplementasikan handler task asynq yang dijalankan
// oleh subcommand `./api worker` (proses terpisah dari server HTTP utama --
// lihat main.go). Task saat ini hanya notifikasi order.paid (REQ-F-405).
package worker

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/audit"
	"github.com/jeonme/api/internal/crypto"
	"github.com/jeonme/api/internal/mailer"
	"github.com/jeonme/api/internal/netguard"
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
	mux.HandleFunc(queue.TypeProductWebhookDelivery, h.HandleProductWebhookDelivery)
	mux.HandleFunc(queue.TypeAudienceBroadcast, h.HandleAudienceBroadcast)
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

// HandleAudienceBroadcast -- Gap #3 benchmark kompetitif (9 Agustus 2026).
// Best-effort PER PENERIMA: satu alamat gagal (mis. mailbox penuh, format
// aneh yang lolos validasi frontend) TIDAK menggagalkan seluruh broadcast
// atau memicu asynq retry ulang ke SEMUA subscriber yang sudah berhasil
// dikirimi -- itu akan mengirim email duplikat ke penerima yang sudah
// menerima. sent_count dicatat apa adanya (jujur, bukan recipient_count
// yang cuma niat awal) supaya kreator tahu persis berapa yang benar-benar
// terkirim kalau ada yang gagal di tengah jalan.
func (h *Handler) HandleAudienceBroadcast(ctx context.Context, t *asynq.Task) error {
	var payload queue.AudienceBroadcastPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("worker: payload broadcast tidak valid: %w", err)
	}

	var userID, subject, body, status string
	err := h.DB.QueryRow(ctx, `
		SELECT user_id, subject, body, status FROM audience_broadcasts WHERE id = $1
	`, payload.BroadcastID).Scan(&userID, &subject, &body, &status)
	if err != nil {
		if err == pgx.ErrNoRows {
			log.Printf("worker: broadcast %s tidak ditemukan, dilewati", payload.BroadcastID)
			return nil
		}
		return fmt.Errorf("worker: gagal memuat broadcast %s: %w", payload.BroadcastID, err)
	}
	// Idempotency: task asynq bisa saja di-retry (mis. worker crash di
	// tengah jalan) -- broadcast yang statusnya SUDAH "sent" tidak boleh
	// dikirim ulang dari awal ke semua subscriber.
	if status == "sent" {
		log.Printf("worker: broadcast %s sudah berstatus sent, dilewati", payload.BroadcastID)
		return nil
	}

	if _, err := h.DB.Exec(ctx, `UPDATE audience_broadcasts SET status = 'sending' WHERE id = $1`, payload.BroadcastID); err != nil {
		return fmt.Errorf("worker: gagal set status sending broadcast %s: %w", payload.BroadcastID, err)
	}

	rows, err := h.DB.Query(ctx, `
		SELECT DISTINCT email FROM subscribers WHERE creator_user_id = $1 AND email <> ''
	`, userID)
	if err != nil {
		return fmt.Errorf("worker: gagal memuat subscriber broadcast %s: %w", payload.BroadcastID, err)
	}
	var emails []string
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err == nil {
			emails = append(emails, email)
		}
	}
	rows.Close()

	sentCount := 0
	for _, email := range emails {
		if err := h.Mailer.Send(email, subject, body); err != nil {
			log.Printf("worker: gagal kirim broadcast %s ke %s: %v", payload.BroadcastID, email, err)
			continue
		}
		sentCount++
	}

	if _, err := h.DB.Exec(ctx, `
		UPDATE audience_broadcasts SET status = 'sent', sent_count = $2, completed_at = now() WHERE id = $1
	`, payload.BroadcastID, sentCount); err != nil {
		return fmt.Errorf("worker: gagal update status sent broadcast %s: %w", payload.BroadcastID, err)
	}

	log.Printf("worker: broadcast %s terkirim ke %d/%d subscriber", payload.BroadcastID, sentCount, len(emails))
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

	var buyerEmail, buyerContact, productName, status, sellerUserID string
	var amountIDR int64
	var isDonation bool
	err := h.DB.QueryRow(ctx, `
		SELECT o.buyer_email, o.buyer_contact, p.name, o.status, p.is_donation, p.user_id, o.amount_idr
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, payload.OrderID).Scan(&buyerEmail, &buyerContact, &productName, &status, &isDonation, &sellerUserID, &amountIDR)
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

	// Notifikasi dalam-app untuk KREATOR (ikon lonceng top bar dashboard) --
	// best-effort SAMA seperti WhatsApp di atas: kegagalan INSERT di sini
	// tidak boleh membuat asynq retry seluruh task (email pembeli sudah
	// terkirim sukses). Judul/isi beda untuk donasi vs pembelian biasa,
	// sama seperti subjek email di atas.
	var notifTitle, notifBody string
	if isDonation {
		notifTitle = "Dukungan baru diterima"
		notifBody = fmt.Sprintf("Seseorang baru saja mendukungmu lewat %s.", productName)
	} else {
		notifTitle = "Pesanan baru diterima"
		notifBody = fmt.Sprintf("%s terjual seharga Rp%s.", productName, formatRupiah(amountIDR))
	}
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO notifications (user_id, type, title, body, link_url)
		VALUES ($1, 'order_paid', $2, $3, '/dashboard/balance')
	`, sellerUserID, notifTitle, notifBody); err != nil {
		log.Printf("worker: order %s -- gagal membuat notifikasi dalam-app untuk kreator: %v", payload.OrderID, err)
	}

	return nil
}

// productWebhookHTTPClient -- timeout PENDEK (bukan default tanpa batas)
// supaya server kreator yang lambat/mati tidak menahan worker terlalu lama
// -- ini task best-effort, bukan sesuatu yang boleh memblokir antrian.
//
// netguard.NewOutboundClient -- perbaikan SSRF (audit keamanan 14 Agustus
// 2026, lihat komentar panjang di internal/netguard/netguard.go):
// webhook_url diisi bebas oleh kreator lalu dipanggil server-side di sini
// setiap produknya terjual -- SEBELUMNYA memakai http.Client polos tanpa
// validasi tujuan sama sekali, dibuktikan lewat eksploitasi langsung bisa
// dipaksa memanggil alamat internal/loopback membawa email pembeli asli.
var productWebhookHTTPClient = netguard.NewOutboundClient(10 * time.Second)

// HandleProductWebhookDelivery -- Modul Toko (Fase C3): metode penyerahan
// "webhook". SENGAJA TIDAK PERNAH mengembalikan error (selalu nil) --
// gagal kirim (server kreator mati/URL salah/timeout) dicatat ke
// webhook_deliveries (lihat tab "Webhook Events", Fase E4) untuk kreator
// lihat & tindak lanjuti SENDIRI, bukan di-retry otomatis oleh asynq --
// retry otomatis di sini berisiko duplikat (POST ini BUKAN operasi
// idempoten di sisi server kreator, beda dari notifikasi email/DB kita
// sendiri yang aman diulang).
func (h *Handler) HandleProductWebhookDelivery(ctx context.Context, t *asynq.Task) error {
	var payload queue.ProductWebhookDeliveryPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		log.Printf("worker: payload webhook produk tidak valid: %v", err)
		return nil
	}

	var productID, productName, webhookURL, webhookSecret, buyerEmail, sellerUserID, status string
	var amountIDR int64
	err := h.DB.QueryRow(ctx, `
		SELECT p.id, p.name, p.webhook_url, p.webhook_secret, o.buyer_email, p.user_id, o.status, o.amount_idr
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, payload.OrderID).Scan(&productID, &productName, &webhookURL, &webhookSecret, &buyerEmail, &sellerUserID, &status, &amountIDR)
	if err != nil {
		if err == pgx.ErrNoRows {
			log.Printf("worker: order %s tidak ditemukan, lewati webhook produk", payload.OrderID)
			return nil
		}
		log.Printf("worker: gagal memuat order %s untuk webhook produk: %v", payload.OrderID, err)
		return nil
	}
	if status != "paid" {
		log.Printf("worker: order %s statusnya sekarang %q (bukan paid), lewati webhook produk", payload.OrderID, status)
		return nil
	}
	if webhookURL == "" {
		log.Printf("worker: produk %s tidak (lagi) punya webhook_url, lewati", productID)
		return nil
	}

	body, err := json.Marshal(map[string]any{
		"event":        "order.paid",
		"order_id":     payload.OrderID,
		"product_id":   productID,
		"product_name": productName,
		"buyer_email":  buyerEmail,
		"amount_idr":   amountIDR,
	})
	if err != nil {
		log.Printf("worker: gagal encode payload webhook produk order %s: %v", payload.OrderID, err)
		return nil
	}

	mac := hmac.New(sha256.New, []byte(webhookSecret))
	mac.Write(body)
	signature := hex.EncodeToString(mac.Sum(nil))

	deliveryStatus, responseCode, errMessage := deliverProductWebhook(ctx, webhookURL, body, signature)

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO webhook_deliveries (id, user_id, product_id, order_id, url, status, response_code, error_message)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, uuid.NewString(), sellerUserID, productID, payload.OrderID, webhookURL, deliveryStatus, responseCode, errMessage); err != nil {
		log.Printf("worker: gagal mencatat log webhook produk order %s: %v", payload.OrderID, err)
	}

	log.Printf("worker: webhook produk order %s -> %s: %s", payload.OrderID, webhookURL, deliveryStatus)
	return nil
}

// deliverProductWebhook -- POST mentah + tanda tangan HMAC-SHA256 di header
// X-Jeonme-Signature (hex) supaya server kreator bisa memverifikasi
// pengirimnya benar-benar Jeonme, sama seperti kita memverifikasi
// signature_key dari Midtrans, tapi arah terbalik.
func deliverProductWebhook(ctx context.Context, url string, body []byte, signature string) (status string, responseCode *int, errMessage string) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "failed", nil, fmt.Sprintf("gagal membuat request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Jeonme-Signature", signature)

	resp, err := productWebhookHTTPClient.Do(req)
	if err != nil {
		return "failed", nil, fmt.Sprintf("gagal memanggil webhook: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	code := resp.StatusCode
	if code >= 200 && code < 300 {
		return "success", &code, ""
	}
	return "failed", &code, fmt.Sprintf("webhook membalas status %d", code)
}

// formatRupiah -- "25000" -> "25.000" (pemisah ribuan ala format Indonesia),
// dipakai notifikasi dalam-app di atas. Sengaja fungsi kecil sendiri, bukan
// import paket format lokal penuh cuma untuk satu pemakaian ini.
func formatRupiah(amount int64) string {
	s := fmt.Sprintf("%d", amount)
	if len(s) <= 3 {
		return s
	}
	var parts []string
	for len(s) > 3 {
		parts = append([]string{s[len(s)-3:]}, parts...)
		s = s[:len(s)-3]
	}
	parts = append([]string{s}, parts...)
	return strings.Join(parts, ".")
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
