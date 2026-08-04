// Package midtrans membungkus Midtrans Snap API (REQ-F-402). Snap dipilih
// (bukan Core API per-metode) karena satu panggilan API menghasilkan halaman
// pembayaran ter-hosting Midtrans yang sudah mendukung QRIS, Virtual
// Account, dan e-wallet sekaligus -- pengganti langsung pola Xendit Invoice
// yang dipakai sebelumnya (lihat CICD-GUIDE.md & Rencana-Sprint-Jeonme.xlsx
// Sprint 3 untuk riwayat migrasi Xendit -> Midtrans).
package midtrans

import (
	"bytes"
	"context"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ErrNotConfigured dikembalikan kalau MIDTRANS_SERVER_KEY belum diisi --
// dipakai handler untuk membalas error yang jelas, bukan panic/500 buram.
var ErrNotConfigured = errors.New("midtrans: MIDTRANS_SERVER_KEY belum diset")

type Client struct {
	ServerKey string
	BaseURL   string
	// CoreAPIBaseURL -- host TERPISAH dari BaseURL (Snap): Subscription API
	// (& Core API pada umumnya) di-hosting di "api.{sandbox.}midtrans.com",
	// BUKAN "app.{sandbox.}midtrans.com" yang dipakai Snap
	// (https://docs.midtrans.com/reference/create-subscription --
	// OpenAPI definition-nya eksplisit menunjuk api.sandbox.midtrans.com).
	// Server key sama, cuma host-nya beda.
	CoreAPIBaseURL string
	HTTP           *http.Client
}

// NewClient — isProduction menentukan base URL Snap: sandbox untuk
// development/staging, production untuk rilis sungguhan. Server key sandbox
// dan production TIDAK bisa dipakai silang (Midtrans menolak dengan 401).
func NewClient(serverKey string, isProduction bool) *Client {
	baseURL := "https://app.sandbox.midtrans.com"
	coreAPIBaseURL := "https://api.sandbox.midtrans.com"
	if isProduction {
		baseURL = "https://app.midtrans.com"
		coreAPIBaseURL = "https://api.midtrans.com"
	}
	return &Client{
		ServerKey:      serverKey,
		BaseURL:        baseURL,
		CoreAPIBaseURL: coreAPIBaseURL,
		HTTP:           &http.Client{Timeout: 15 * time.Second},
	}
}

type CreateTransactionRequest struct {
	OrderID           string
	GrossAmountIDR    int64
	ItemName          string
	CustomerEmail     string
	FinishRedirectURL string
	// EnableSaveCard -- Modul Langganan Premium: HANYA diisi true untuk
	// transaksi PENDAFTARAN pertama langganan (bukan pembelian produk
	// biasa) supaya kartu pembeli tersimpan sebagai "one click token"
	// (lihat https://docs.midtrans.com/reference/one-click), dipakai
	// selanjutnya oleh CreateSubscription untuk penagihan berulang otomatis
	// TANPA perlu kreator memasukkan nomor kartu lagi tiap siklus.
	// UserID -- WAJIB diisi (bukan kosong) kalau EnableSaveCard true,
	// pengenal pembeli unik (dipakai id user Jeonme sendiri) sesuai syarat
	// dokumentasi Midtrans di atas.
	EnableSaveCard bool
	UserID         string
}

type SnapTransaction struct {
	Token       string `json:"token"`
	RedirectURL string `json:"redirect_url"`
}

// CreateTransaction — REQ-F-402. Autentikasi Midtrans pakai HTTP Basic Auth
// dengan server key sebagai username, password kosong (konvensi resmi
// Midtrans, sama seperti Xendit sebelumnya).
//
// Snap hanya punya satu callback "finish" (bukan success/failure terpisah
// seperti Xendit Invoice) -- ini justru cocok dengan halaman
// /checkout/[id] di frontend yang SUDAH selalu mengecek ulang status ke
// backend, bukan percaya query string redirect.
func (c *Client) CreateTransaction(ctx context.Context, req CreateTransactionRequest) (*SnapTransaction, error) {
	if c.ServerKey == "" {
		return nil, ErrNotConfigured
	}

	payload := map[string]any{
		"transaction_details": map[string]any{
			"order_id":     req.OrderID,
			"gross_amount": req.GrossAmountIDR,
		},
		"customer_details": map[string]any{
			"email": req.CustomerEmail,
		},
		"item_details": []map[string]any{
			{
				"id":       req.OrderID,
				"price":    req.GrossAmountIDR,
				"quantity": 1,
				"name":     req.ItemName,
			},
		},
		"callbacks": map[string]any{
			"finish": req.FinishRedirectURL,
		},
	}

	if req.EnableSaveCard {
		payload["credit_card"] = map[string]any{"secure": true, "save_card": true}
		payload["user_id"] = req.UserID
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("midtrans: gagal encode request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/snap/v1/transactions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("midtrans: gagal membuat request: %w", err)
	}
	httpReq.SetBasicAuth(c.ServerKey, "")
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("midtrans: gagal memanggil API: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("midtrans: gagal membaca respons: %w", err)
	}

	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("midtrans: API membalas status %d: %s", resp.StatusCode, string(respBody))
	}

	var txn SnapTransaction
	if err := json.Unmarshal(respBody, &txn); err != nil {
		return nil, fmt.Errorf("midtrans: gagal decode respons: %w", err)
	}

	return &txn, nil
}

// NotificationPayload — subset field yang kita pakai dari HTTP Notification
// Midtrans. Payload asli punya lebih banyak field (payment_type, va_numbers,
// dst); kita hanya decode yang relevan untuk verifikasi & pemetaan status.
type NotificationPayload struct {
	OrderID           string `json:"order_id"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	SignatureKey      string `json:"signature_key"`
	TransactionStatus string `json:"transaction_status"`
	TransactionID     string `json:"transaction_id"`
	FraudStatus       string `json:"fraud_status"`
	// PaymentType -- No.89 (Sprint 10): kanal pembayaran sungguhan yang
	// dipilih pembeli di Midtrans Snap (mis. "qris", "bank_transfer",
	// "gopay", "shopeepay", "credit_card") -- SEBELUMNYA tidak pernah
	// ditangkap sama sekali (payments.method selalu diisi literal "snap",
	// yang cuma nama WIDGET checkout-nya, bukan kanal pembayaran
	// sesungguhnya). Dipakai untuk rincian biaya per metode pembayaran.
	PaymentType string `json:"payment_type"`
	// SavedTokenID -- Modul Langganan Premium: HANYA terisi untuk transaksi
	// pendaftaran langganan (EnableSaveCard=true di atas) yang berhasil --
	// token kartu tersimpan, dikirim Midtrans LANGSUNG di notifikasi yang
	// sama (tidak perlu panggilan API terpisah), dipakai CreateSubscription
	// untuk mengaktifkan penagihan berulang. Lihat
	// https://docs.midtrans.com/reference/get-transaction-status-card.
	SavedTokenID string `json:"saved_token_id"`
}

// Sign menghitung signature_key sesuai rumus resmi Midtrans. Dipakai
// VerifySignature, dan juga dibutuhkan test untuk menyusun payload
// notifikasi sintetis yang valid (simulasi apa yang Midtrans kirim).
func Sign(orderID, statusCode, grossAmount, serverKey string) string {
	raw := orderID + statusCode + grossAmount + serverKey
	sum := sha512.Sum512([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// VerifySignature — Midtrans TIDAK mengirim header rahasia terpisah seperti
// x-callback-token Xendit; signature_key di body-lah yang WAJIB diverifikasi
// sebelum payload diproses (lihat dokumentasi publik Midtrans "Verifying
// Notification"): SHA512(order_id + status_code + gross_amount + ServerKey).
func VerifySignature(orderID, statusCode, grossAmount, serverKey, receivedSignature string) bool {
	if serverKey == "" || receivedSignature == "" {
		return false
	}
	expected := Sign(orderID, statusCode, grossAmount, serverKey)
	return subtle.ConstantTimeCompare([]byte(expected), []byte(receivedSignature)) == 1
}

// StatusToOrderStatus memetakan transaction_status (+fraud_status untuk
// kartu kredit) Midtrans ke status order kita. "capture" dengan
// fraud_status="challenge" sengaja TIDAK dianggap final (butuh notifikasi
// lanjutan setelah review manual Midtrans) -- recognized=false supaya
// webhook membalas 200 tanpa mengubah apa pun, bukan keliru menandai lunas.
func StatusToOrderStatus(transactionStatus, fraudStatus string) (status string, recognized bool) {
	switch transactionStatus {
	case "capture":
		if fraudStatus == "accept" || fraudStatus == "" {
			return "paid", true
		}
		return "", false
	case "settlement":
		return "paid", true
	case "expire":
		return "expired", true
	case "deny", "cancel":
		return "failed", true
	default:
		// "pending", "refund", "partial_refund", dst -- belum final.
		return "", false
	}
}

// ---------- Modul Langganan Premium (Subscription API) ----------
//
// Beda dari CreateTransaction di atas (Snap, satu kali bayar per order) --
// bagian ini membungkus Midtrans Subscription API
// (https://docs.midtrans.com/reference/create-subscription), dipakai
// KHUSUS untuk penagihan berulang langganan Premium. Alurnya:
//   1. CreateTransaction dengan EnableSaveCard=true -- pembeli bayar siklus
//      PERTAMA lewat Snap seperti biasa, kartunya tersimpan.
//   2. Notifikasi webhook transaksi itu membawa SavedTokenID.
//   3. CreateSubscription dipanggil SEKALI dengan token itu -- sejak itu
//      Midtrans SENDIRI yang menagih otomatis tiap siklus, tidak ada
//      panggilan API dari kita lagi per siklus.
//   4. GetSubscription/CancelSubscription dipakai untuk cek status &
//      berhenti berlangganan.

// SubscriptionSchedule -- MaxInterval SENGAJA int biasa (bukan pointer):
// 0 berarti "tidak diisi ke payload sama sekali" (lihat CreateSubscription
// di bawah), BUKAN dikirim sebagai literal 0 -- per dokumentasi Midtrans,
// max_interval=0 berarti "jalankan SEKALI lalu berhenti", beda jauh dari
// field yang benar-benar tidak diisi ("berjalan terus sampai dinonaktifkan
// manual", https://docs.midtrans.com/reference/create-subscription-schedule-object).
// Langganan Premium Jeonme SELALU memakai perilaku "sampai dibatalkan
// manual" (indefinite) -- max_interval TIDAK PERNAH diisi oleh pemanggil.
type SubscriptionSchedule struct {
	Interval     int
	IntervalUnit string
	MaxInterval  int
	StartTime    string
}

type CreateSubscriptionRequest struct {
	Name          string
	AmountIDR     int64
	Token         string
	Schedule      SubscriptionSchedule
	CustomerEmail string
}

type SubscriptionResponse struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	Schedule struct {
		NextExecutionAt string `json:"next_execution_at"`
	} `json:"schedule"`
}

// CreateSubscription — POST /v1/subscriptions. amount WAJIB dikirim sebagai
// string tanpa desimal sesuai spesifikasi Midtrans (bukan angka JSON biasa).
func (c *Client) CreateSubscription(ctx context.Context, req CreateSubscriptionRequest) (*SubscriptionResponse, error) {
	if c.ServerKey == "" {
		return nil, ErrNotConfigured
	}

	schedule := map[string]any{
		"interval":      req.Schedule.Interval,
		"interval_unit": req.Schedule.IntervalUnit,
		"start_time":    req.Schedule.StartTime,
	}
	if req.Schedule.MaxInterval > 0 {
		schedule["max_interval"] = req.Schedule.MaxInterval
	}

	payload := map[string]any{
		"name":         req.Name,
		"amount":       fmt.Sprintf("%d", req.AmountIDR),
		"currency":     "IDR",
		"payment_type": "credit_card",
		"token":        req.Token,
		"schedule":     schedule,
		"customer_details": map[string]any{
			"email": req.CustomerEmail,
		},
	}

	var out SubscriptionResponse
	if err := c.doSubscriptionRequest(ctx, http.MethodPost, "/v1/subscriptions", payload, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetSubscription — GET /v1/subscriptions/{id}. Dipakai webhook siklus
// berulang sebagai SUMBER KEBENARAN (bukan mempercayai isi payload webhook
// itu sendiri langsung) -- lihat catatan lengkap di
// handlers/subscription.go HandleSubscriptionWebhook.
func (c *Client) GetSubscription(ctx context.Context, subscriptionID string) (*SubscriptionResponse, error) {
	if c.ServerKey == "" {
		return nil, ErrNotConfigured
	}
	var out SubscriptionResponse
	if err := c.doSubscriptionRequest(ctx, http.MethodGet, "/v1/subscriptions/"+subscriptionID, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CancelSubscription — POST /v1/subscriptions/{id}/cancel. Dipilih daripada
// "disable" (lihat https://docs.midtrans.com/reference/disable-subscription
// vs /reference/cancel-subscription) karena cancel JUGA menghentikan retry
// penagihan yang sedang tertunda, bukan cuma mencegah siklus berikutnya.
func (c *Client) CancelSubscription(ctx context.Context, subscriptionID string) error {
	if c.ServerKey == "" {
		return ErrNotConfigured
	}
	return c.doSubscriptionRequest(ctx, http.MethodPost, "/v1/subscriptions/"+subscriptionID+"/cancel", nil, nil)
}

// ---------- Modul Toko (Fase Transaction): Refund (Core API) ----------

// RefundResponse — subset field yang kita pakai dari respons refund Midtrans.
// StatusCode/StatusMessage WAJIB dicek terpisah dari status HTTP: Core API
// Midtrans kadang membalas HTTP 200 dengan status_code fungsional non-200 di
// body (mis. transaksi tidak bisa direfund) -- lihat Refund di bawah.
type RefundResponse struct {
	StatusCode        string `json:"status_code"`
	StatusMessage     string `json:"status_message"`
	TransactionStatus string `json:"transaction_status"`
	RefundAmount      string `json:"refund_amount"`
}

// Refund — POST /v2/{order_id}/refund (Core API). orderID di sini adalah
// order_id EKSTERNAL yang dikirim ke Midtrans saat CreateTransaction (lihat
// checkout.go: "jeonme-order-"+id, disimpan di orders.psp_reference), BUKAN
// UUID internal orders.id secara langsung.
//
// Modul Toko (tab Transaction) HANYA mendukung refund PENUH (field "amount"
// sengaja tidak dikirim -- kosong berarti Midtrans merefund jumlah penuh
// transaksi) -- refund sebagian butuh logika pembagian ulang platform fee/
// afiliasi/kolaborator yang proporsional, di luar cakupan yang diminta.
func (c *Client) Refund(ctx context.Context, orderID, reason string) (*RefundResponse, error) {
	if c.ServerKey == "" {
		return nil, ErrNotConfigured
	}

	payload := map[string]any{"reason": reason}

	var out RefundResponse
	if err := c.doSubscriptionRequest(ctx, http.MethodPost, "/v2/"+orderID+"/refund", payload, &out); err != nil {
		return nil, err
	}
	if out.StatusCode != "" && out.StatusCode != "200" {
		return nil, fmt.Errorf("midtrans: refund ditolak (status %s): %s", out.StatusCode, out.StatusMessage)
	}
	return &out, nil
}

func (c *Client) doSubscriptionRequest(ctx context.Context, method, path string, payload any, out any) error {
	var bodyReader io.Reader
	if payload != nil {
		body, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("midtrans: gagal encode request: %w", err)
		}
		bodyReader = bytes.NewReader(body)
	}

	httpReq, err := http.NewRequestWithContext(ctx, method, c.CoreAPIBaseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("midtrans: gagal membuat request: %w", err)
	}
	httpReq.SetBasicAuth(c.ServerKey, "")
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return fmt.Errorf("midtrans: gagal memanggil API: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("midtrans: gagal membaca respons: %w", err)
	}

	if resp.StatusCode >= 300 {
		return fmt.Errorf("midtrans: API membalas status %d: %s", resp.StatusCode, string(respBody))
	}

	if out != nil {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("midtrans: gagal decode respons: %w", err)
		}
	}
	return nil
}
