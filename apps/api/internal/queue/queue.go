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
