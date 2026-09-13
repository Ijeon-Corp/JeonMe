// Package payment mendefinisikan abstraksi payment gateway BERSAMA supaya
// checkout.go/subscription.go tidak lagi terikat langsung ke satu penyedia
// (Midtrans) seperti sebelumnya.
//
// Kerangka ditambahkan 13 September 2026 (permintaan langsung pengguna:
// "buatkan kerangka payment gateway menggunakan duitku, tapi tetep keep
// midtrans untuk transaksi sandbox"). SEBELUM ini TIDAK ADA abstraksi sama
// sekali -- CheckoutHandler/SubscriptionHandler memegang *midtrans.Client
// konkret, memanggil method-nya langsung, dan literal string 'midtrans'
// ditulis apa adanya ke kolom payments.psp (checkout.go, ApplyOrderStatus).
// Riset lengkap sebelum menulis kerangka ini: TIDAK ADA satu pun interface
// yang bisa dipakai ulang, jadi paket ini + adapter di bawah dibuat baru,
// bukan menemukan yang sudah ada.
//
// LINGKUP SENGAJA DIBATASI ke alur checkout SEKALI-BAYAR (Create/Webhook/
// ReconcilePendingOrders di checkout.go) -- Langganan Premium
// (subscription.go, CreateSubscription/GetSubscription/CancelSubscription)
// TETAP Midtrans-only, TIDAK ikut lewat interface ini. Alasan: mekanisme
// recurring billing Midtrans (kartu tersimpan via EnableSaveCard + Token,
// lihat NotificationPayload.SavedTokenID) tidak punya padanan bentuknya di
// Duitku yang didokumentasikan publik dengan jelas -- mencoba menyamakan
// keduanya lewat SATU interface generik akan memaksa salah satu sisi jadi
// tidak natural. Refund (checkout.go RefundOrder) demikian juga TETAP
// langsung ke *midtrans.Client konkret (h.Midtrans, field lama, TIDAK
// dihapus) -- di luar cakupan "kerangka" ini, tercatat sebagai keterbatasan
// yang disengaja, bukan terlewat.
package payment

import "context"

// Gateway -- kontrak MINIMAL yang benar-benar dipakai bersama oleh alur
// checkout sekali-bayar: buat transaksi (dapat URL pembayaran ter-hosting),
// verifikasi+decode notifikasi webhook, dan polling status langsung
// (dipakai ReconcilePendingOrders utk order yang webhook-nya tidak pernah
// sampai). Method BARU ditambah di sini HANYA kalau benar-benar dipakai
// gateway-agnostic oleh handler -- jangan menambah method "just in case"
// yang cuma dipakai satu implementasi (lihat catatan Refund di atas).
type Gateway interface {
	// Name -- pengenal pendek ditulis apa adanya ke kolom payments.psp
	// (checkout.go ApplyOrderStatus) -- SEBELUMNYA hardcoded literal
	// 'midtrans' di SQL, sekarang dinamis lewat method ini supaya kolom itu
	// akhirnya benar-benar dipakai sesuai desain aslinya (kolom ini SUDAH
	// ada sejak migrasi awal, cuma tidak pernah diisi dinamis).
	Name() string

	// CreateTransaction -- REQ-F-402: hasilkan URL pembayaran ter-hosting
	// (Snap Midtrans / Invoice Duitku) untuk SATU order. `OrderID` di sini
	// adalah referensi EKSTERNAL (orders.psp_reference), BUKAN UUID
	// internal order Jeonme.
	CreateTransaction(ctx context.Context, in CreateTransactionInput) (*CreateTransactionResult, error)

	// GetTransactionStatus -- polling langsung ke gateway (BUKAN percaya
	// klaim webhook begitu saja) -- dipakai ReconcilePendingOrders
	// (checkout.go) persis seperti sebelumnya, sekarang gateway-agnostic.
	GetTransactionStatus(ctx context.Context, orderID string) (*TransactionStatus, error)

	// ParseWebhook -- verifikasi signature webhook (skema tanda tangan
	// beda-beda tiap gateway, disembunyikan di balik interface ini) LALU
	// decode ke bentuk ternormalisasi. Signature tidak valid -> error,
	// BUKAN silently return status kosong -- pemanggil (Webhook handler)
	// WAJIB membalas 401 kalau error != nil, sama seperti perilaku lama
	// VerifySignature Midtrans.
	ParseWebhook(body []byte) (*WebhookNotification, error)
}

type CreateTransactionInput struct {
	OrderID           string
	GrossAmountIDR    int64
	ItemName          string
	CustomerEmail     string
	FinishRedirectURL string
}

type CreateTransactionResult struct {
	// PaymentURL -- URL ter-hosting gateway, dikirim apa adanya ke
	// frontend sbg `invoice_url` (lihat BuyProductButton.tsx,
	// window.location.href = invoice_url -- pola redirect penuh yang
	// SUDAH ada, tidak berubah sama sekali utk gateway apa pun).
	PaymentURL string
}

// TransactionStatus/WebhookNotification sengaja dipisah jadi 2 tipe
// (bukan digabung satu) walau field-nya sama persis -- keduanya punya
// SUMBER data yang beda (respons API status vs body webhook), memisahkan
// membuat pemanggil tidak bisa keliru tertukar salah satu dgn lainnya.

type TransactionStatus struct {
	OrderStatus   string // "paid" | "expired" | "failed" -- kosong kalau Recognized=false
	Recognized    bool
	PaymentType   string
	TransactionID string
}

type WebhookNotification struct {
	OrderID       string
	OrderStatus   string
	Recognized    bool
	PaymentType   string
	TransactionID string
}
