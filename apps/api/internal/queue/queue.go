// Package queue mendefinisikan task asynq (Redis-backed job queue) yang
// dipakai untuk pekerjaan asinkron -- saat ini hanya notifikasi email
// pembeli setelah pembayaran dikonfirmasi (REQ-F-405), yang sengaja TIDAK
// dilakukan sinkron di dalam CheckoutHandler.Webhook supaya lambat/gagalnya
// pengiriman email tidak pernah membuat webhook PSP itu sendiri gagal atau
// timeout.
package queue

import (
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

// TypeOrderPaidNotification -- REQ-F-405: kirim email + link unduhan ke
// pembeli setelah order berstatus "paid".
const TypeOrderPaidNotification = "order:paid_notification"

type OrderPaidPayload struct {
	OrderID string `json:"order_id"`
}

// NewOrderPaidTask membungkus payload jadi *asynq.Task siap di-enqueue.
func NewOrderPaidTask(orderID string) (*asynq.Task, error) {
	payload, err := json.Marshal(OrderPaidPayload{OrderID: orderID})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload order_id=%s: %w", orderID, err)
	}
	return asynq.NewTask(TypeOrderPaidNotification, payload), nil
}

// TypeWatermarkPrewarm -- audit performa profesional 15 September 2026
// (Medium-High): CheckoutHandler.downloadURLFor sudah men-cache salinan PDF
// ber-watermark by ETag (audit performa 4 September 2026) supaya UNDUHAN
// BERULANG cepat, tapi unduhan PERTAMA (cache miss) tetap men-download+
// watermark+upload SECARA SINKRON di dalam DownloadFile, yang cuma dikasih
// 5 detik context timeout -- berisiko timeout untuk file besar TEPAT saat
// pembeli baru saja membayar & langsung mengklik link unduhan di email.
// Task ini dienqueue SEKALI segera setelah order "paid" (lihat
// ApplyOrderStatus, sebelah enqueue TypeOrderPaidNotification) supaya
// proses download+watermark+upload sudah SELESAI & ter-cache di storage
// SEBELUM pembeli sempat membuka email & mengklik unduh -- begitu mereka
// klik, DownloadFile tinggal kena cache-hit (Storage.Exists) yang jauh di
// bawah 5 detik apa pun ukuran filenya. Gagal/timeout di worker (leluasa,
// tidak ada batas 5 detik seperti request HTTP) HANYA berarti unduhan
// pertama pembeli balik ke jalur sinkron lama -- tidak pernah membuat
// pembelian gagal, murni percepatan best-effort.
const TypeWatermarkPrewarm = "checkout:watermark_prewarm"

type WatermarkPrewarmPayload struct {
	OrderID string `json:"order_id"`
}

func NewWatermarkPrewarmTask(orderID string) (*asynq.Task, error) {
	payload, err := json.Marshal(WatermarkPrewarmPayload{OrderID: orderID})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload watermark prewarm order_id=%s: %w", orderID, err)
	}
	return asynq.NewTask(TypeWatermarkPrewarm, payload), nil
}

// TypeContactFormNotification -- No.77 (Sprint 9): kirim email ke kreator
// begitu ada pesan baru masuk lewat blok Formulir Kontak di halaman
// publiknya. Sengaja ASINKRON (sama seperti order.paid) supaya lambatnya
// SMTP tidak pernah membuat pengunjung menunggu request submit selesai.
const TypeContactFormNotification = "contact_form:notification"

type ContactFormPayload struct {
	CreatorEmail string `json:"creator_email"`
	PageUsername string `json:"page_username"`
	VisitorName  string `json:"visitor_name"`
	VisitorEmail string `json:"visitor_email"`
	Message      string `json:"message"`
}

func NewContactFormTask(payload ContactFormPayload) (*asynq.Task, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload formulir kontak: %w", err)
	}
	return asynq.NewTask(TypeContactFormNotification, encoded), nil
}

// TypeAutoWithdrawScan -- Modul Settings §3: auto-withdraw terjadwal.
// Dijadwalkan HARIAN lewat asynq.Scheduler (lihat main.go runWorker) --
// task ini sendiri yang memutuskan siapa yang "jatuh tempo" hari ini
// (weekly/monthly, lihat worker.HandleAutoWithdrawScan), BUKAN cron
// terpisah per frekuensi, jadi cukup SATU entri scheduler.
const TypeAutoWithdrawScan = "payout:auto_withdraw_scan"

// NewAutoWithdrawScanTask -- tidak ada payload, task ini scan SEMUA user
// tiap kali jalan (lihat komentar handler).
func NewAutoWithdrawScanTask() *asynq.Task {
	return asynq.NewTask(TypeAutoWithdrawScan, nil)
}

// TypeAccountPurgeScan -- Modul Settings §6: purge akun yang masa tunggu
// 14 harinya sudah habis. Dijadwalkan HARIAN lewat asynq.Scheduler (lihat
// main.go runWorker), pola sama persis dengan TypeAutoWithdrawScan --
// task ini scan SEMUA account_deletion_requests yang jatuh tempo tiap kali
// jalan, bukan satu task per permintaan.
const TypeAccountPurgeScan = "account:purge_scan"

func NewAccountPurgeScanTask() *asynq.Task {
	return asynq.NewTask(TypeAccountPurgeScan, nil)
}

// TypeOrderReconcile -- permintaan langsung pengguna, 10 September 2026
// ("order nyangkut 'Menunggu Pembayaran' gara-gara URL Notification
// Midtrans salah dikonfigurasi"): notifikasi webhook yang HILANG
// sebelumnya tidak punya jalan pulih sama sekali -- order tetap "pending"
// selamanya. Dijadwalkan SERING (tiap 5 menit, BUKAN harian seperti dua
// task scan di atas -- order yang "nyangkut" perlu segera ketahuan, bukan
// nunggu sampai besok) lewat asynq.Scheduler (main.go runWorker). Pola
// sama persis TypeAutoWithdrawScan/TypeAccountPurgeScan: tidak ada
// payload, task ini scan SEMUA order pending yang cukup lama tiap kali
// jalan (lihat CheckoutHandler.ReconcilePendingOrders).
const TypeOrderReconcile = "checkout:order_reconcile"

func NewOrderReconcileTask() *asynq.Task {
	return asynq.NewTask(TypeOrderReconcile, nil)
}

// TypeTeamInviteNotification -- Modul Settings §4: kirim email undangan
// tim. Sengaja ASINKRON (pola sama dengan order.paid/contact_form) supaya
// lambatnya SMTP tidak pernah membuat CollaboratorHandler.Invite menunggu.
// Undangan TETAP tercatat & terlihat di "Undangan untuk Saya" (in-app)
// SEKALIPUN task ini gagal terkirim -- email murni notifikasi tambahan,
// bukan satu-satunya jalan menemukan undangan (lihat ListInvitesForMe).
const TypeTeamInviteNotification = "team:invite_notification"

type TeamInvitePayload struct {
	OwnerUsername     string `json:"owner_username"`
	CollaboratorEmail string `json:"collaborator_email"`
	Role              string `json:"role"`
}

func NewTeamInviteTask(payload TeamInvitePayload) (*asynq.Task, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload undangan tim: %w", err)
	}
	return asynq.NewTask(TypeTeamInviteNotification, encoded), nil
}

// TypeProductWebhookDelivery -- Modul Toko (Fase C3): metode penyerahan
// "webhook" -- kirim POST bertanda tangan (HMAC-SHA256, pola sama seperti
// verifikasi signature Midtrans yang sudah ada) ke webhook_url milik
// KREATOR saat pesanan produk itu lunas. ASINKRON (sama seperti
// order.paid) supaya server kreator yang lambat/mati tidak pernah membuat
// webhook Midtrans kita sendiri timeout.
const TypeProductWebhookDelivery = "product:webhook_delivery"

type ProductWebhookDeliveryPayload struct {
	OrderID string `json:"order_id"`
}

func NewProductWebhookDeliveryTask(orderID string) (*asynq.Task, error) {
	payload, err := json.Marshal(ProductWebhookDeliveryPayload{OrderID: orderID})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload webhook produk order_id=%s: %w", orderID, err)
	}
	return asynq.NewTask(TypeProductWebhookDelivery, payload), nil
}

// TypeAudienceBroadcast -- Gap #3 benchmark kompetitif (9 Agustus 2026):
// kirim email broadcast ke subscriber. ASINKRON (pola sama dengan
// order.paid/team.invite) karena satu broadcast bisa menyasar ratusan
// subscriber sekaligus -- tidak boleh membuat request HTTP CreateBroadcast
// menunggu semuanya terkirim satu-satu lewat SMTP.
const TypeAudienceBroadcast = "audience:broadcast"

type AudienceBroadcastPayload struct {
	BroadcastID string `json:"broadcast_id"`
}

func NewAudienceBroadcastTask(broadcastID string) (*asynq.Task, error) {
	payload, err := json.Marshal(AudienceBroadcastPayload{BroadcastID: broadcastID})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload broadcast_id=%s: %w", broadcastID, err)
	}
	return asynq.NewTask(TypeAudienceBroadcast, payload), nil
}

// TypeSignupVerificationEmail -- permintaan langsung pengguna, 19 Agustus
// 2026: "saat sign up butuh kode verif yang dikirim dari email untuk
// aktivasi baru setelah itu akun bisa digunakan". ASINKRON (pola sama
// dengan order.paid/team.invite) supaya lambatnya SMTP tidak pernah membuat
// AuthHandler.Register menunggu. Payload membawa kode MENTAH (bukan hash)
// karena worker butuh menuliskannya apa adanya ke badan email -- DB cuma
// pernah menyimpan hash-nya (lihat generateVerificationCode di auth.go),
// jadi kode asli ini SATU-SATUNYA salinan yang ada setelah request HTTP
// selesai. Sama seperti payload job lain, hidup singkat di Redis
// (dihapus asynq begitu task selesai diproses) -- risiko diterima
// konsisten dengan pola job queue yang sudah ada di repo ini.
const TypeSignupVerificationEmail = "auth:signup_verification_email"

type SignupVerificationPayload struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func NewSignupVerificationTask(email, code string) (*asynq.Task, error) {
	payload, err := json.Marshal(SignupVerificationPayload{Email: email, Code: code})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload verifikasi email %s: %w", email, err)
	}
	return asynq.NewTask(TypeSignupVerificationEmail, payload), nil
}

// TypePasswordResetEmail -- perbaikan 20 Agustus 2026 (ditemukan lewat
// audit "apakah notifikasi sudah berfungsi semua"): RequestPasswordReset
// SELAMA INI cuma menyimpan token ke DB, TIDAK PERNAH benar-benar mengirim
// email-nya (komentar lama di auth.go secara eksplisit bilang "Pengiriman
// email BELUM diimplementasikan" dari sebelum worker/mailer ada) --
// pengguna produksi yang lupa password sebelumnya SAMA SEKALI tidak
// punya jalan reset (dev_reset_token cuma tampil saat AppEnv != production).
// ASINKRON (pola sama dengan auth:signup_verification_email) supaya
// lambatnya SMTP tidak membuat AuthHandler.RequestPasswordReset menunggu.
// Payload membawa ResetURL LENGKAP (bukan cuma token mentah) -- AuthHandler
// yang sudah tahu PublicWebURL yang membangunnya, worker tinggal
// menempelkan ke badan email apa adanya.
const TypePasswordResetEmail = "auth:password_reset_email"

type PasswordResetPayload struct {
	Email    string `json:"email"`
	ResetURL string `json:"reset_url"`
}

func NewPasswordResetTask(email, resetURL string) (*asynq.Task, error) {
	payload, err := json.Marshal(PasswordResetPayload{Email: email, ResetURL: resetURL})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload reset password %s: %w", email, err)
	}
	return asynq.NewTask(TypePasswordResetEmail, payload), nil
}

// TypeLoyaltyVerificationEmail -- audit OWASP A04 (4 September 2026):
// GetMyPoints/RedeemReward (loyalty.go) sebelumnya cuma percaya buyer_email
// tanpa bukti kepemilikan -- lihat catatan lengkap di migrasi
// 000090_loyalty_verification. ASINKRON (pola sama dengan
// auth:signup_verification_email) supaya lambatnya SMTP tidak membuat
// LoyaltyHandler.RequestVerificationCode menunggu. Payload membawa kode
// MENTAH (bukan hash) dengan alasan sama seperti SignupVerificationPayload
// -- DB cuma menyimpan hash-nya, kode asli ini satu-satunya salinan yang
// ada setelah request HTTP selesai.
const TypeLoyaltyVerificationEmail = "loyalty:verification_email"

type LoyaltyVerificationPayload struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func NewLoyaltyVerificationTask(email, code string) (*asynq.Task, error) {
	payload, err := json.Marshal(LoyaltyVerificationPayload{Email: email, Code: code})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload verifikasi loyalitas %s: %w", email, err)
	}
	return asynq.NewTask(TypeLoyaltyVerificationEmail, payload), nil
}

// TypeOrderHistoryVerificationEmail -- riwayat pembelian pembeli
// (permintaan langsung pengguna, 10 September 2026), pola SAMA PERSIS
// TypeLoyaltyVerificationEmail di atas (kode verifikasi kepemilikan email
// MENTAH lewat email, ASINKRON) -- lihat catatan lengkap migrasi
// 000097_buyer_order_verification.
const TypeOrderHistoryVerificationEmail = "order_history:verification_email"

type OrderHistoryVerificationPayload struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func NewOrderHistoryVerificationTask(email, code string) (*asynq.Task, error) {
	payload, err := json.Marshal(OrderHistoryVerificationPayload{Email: email, Code: code})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload verifikasi riwayat pembelian %s: %w", email, err)
	}
	return asynq.NewTask(TypeOrderHistoryVerificationEmail, payload), nil
}

// AccountStatusEmailPayload -- dipakai bersama oleh
// TypeAccountSuspendedEmail & TypeAccountActivatedEmail (audit fitur admin,
// 5 September 2026): SuspendUser/ActivateUser (admin.go) sebelumnya tidak
// memberi tahu user terdampak sama sekali. Notifikasi dalam-app (tabel
// notifications) TIDAK CUKUP di sini -- user yang disuspend justru tidak
// bisa login utk melihat bell notifikasi -- email satu-satunya kanal yang
// pasti menjangkau, baik saat disuspend MAUPUN saat diaktifkan kembali.
type AccountStatusEmailPayload struct {
	Email string `json:"email"`
}

const TypeAccountSuspendedEmail = "account:suspended_email"

func NewAccountSuspendedTask(email string) (*asynq.Task, error) {
	payload, err := json.Marshal(AccountStatusEmailPayload{Email: email})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload akun disuspend %s: %w", email, err)
	}
	return asynq.NewTask(TypeAccountSuspendedEmail, payload), nil
}

const TypeAccountActivatedEmail = "account:activated_email"

func NewAccountActivatedTask(email string) (*asynq.Task, error) {
	payload, err := json.Marshal(AccountStatusEmailPayload{Email: email})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload akun diaktifkan %s: %w", email, err)
	}
	return asynq.NewTask(TypeAccountActivatedEmail, payload), nil
}

// RedisOptFromURL menerjemahkan REDIS_URL (format yang sama dipakai
// database.NewRedisClient) ke opsi koneksi asynq -- supaya konfigurasi
// Redis cukup didaftarkan sekali lewat REDIS_URL, tidak perlu format host/
// port/password terpisah khusus untuk asynq.
func RedisOptFromURL(redisURL string) (asynq.RedisClientOpt, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return asynq.RedisClientOpt{}, fmt.Errorf("queue: gagal parse REDIS_URL: %w", err)
	}
	return asynq.RedisClientOpt{Addr: opt.Addr, Password: opt.Password, DB: opt.DB}, nil
}
