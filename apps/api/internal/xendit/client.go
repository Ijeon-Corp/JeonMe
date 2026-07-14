// Package xendit membungkus Xendit Invoice API (REQ-F-402). Dipilih "Invoice"
// (bukan integrasi terpisah per QRIS/VA/e-wallet) supaya satu panggilan API
// menghasilkan halaman checkout ter-hosting Xendit yang sudah mendukung
// semua metode pembayaran itu sekaligus -- jauh lebih sedikit permukaan
// integrasi untuk MVP.
//
// PENTING: paket ini BELUM PERNAH diuji melawan akun Xendit sungguhan (belum
// ada akun sandbox saat kode ini ditulis -- lihat Rencana-Sprint-Jeonme.xlsx
// Sprint 3, task "Aktifkan akun sandbox Xendit"). Struktur request/response
// mengikuti dokumentasi publik Xendit Invoice API v2, tapi WAJIB diverifikasi
// manual begitu API key sandbox tersedia sebelum dipakai di production.
package xendit

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ErrNotConfigured dikembalikan kalau XENDIT_SECRET_KEY belum diisi --
// dipakai handler untuk membalas error yang jelas, bukan panic/500 buram.
var ErrNotConfigured = errors.New("xendit: XENDIT_SECRET_KEY belum diset")

type Client struct {
	SecretKey string
	BaseURL   string
	HTTP      *http.Client
}

func NewClient(secretKey string) *Client {
	return &Client{
		SecretKey: secretKey,
		BaseURL:   "https://api.xendit.co",
		HTTP:      &http.Client{Timeout: 15 * time.Second},
	}
}

type CreateInvoiceRequest struct {
	ExternalID         string `json:"external_id"`
	Amount             int64  `json:"amount"`
	PayerEmail         string `json:"payer_email,omitempty"`
	Description        string `json:"description"`
	SuccessRedirectURL string `json:"success_redirect_url,omitempty"`
	FailureRedirectURL string `json:"failure_redirect_url,omitempty"`
}

type Invoice struct {
	ID         string `json:"id"`
	ExternalID string `json:"external_id"`
	Status     string `json:"status"` // PENDING | PAID | EXPIRED
	InvoiceURL string `json:"invoice_url"`
}

// CreateInvoice — REQ-F-402. Autentikasi Xendit pakai HTTP Basic Auth dengan
// secret key sebagai username, password kosong (konvensi resmi Xendit).
func (c *Client) CreateInvoice(ctx context.Context, req CreateInvoiceRequest) (*Invoice, error) {
	if c.SecretKey == "" {
		return nil, ErrNotConfigured
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("xendit: gagal encode request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/v2/invoices", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("xendit: gagal membuat request: %w", err)
	}
	httpReq.SetBasicAuth(c.SecretKey, "")
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("xendit: gagal memanggil API: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("xendit: gagal membaca respons: %w", err)
	}

	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("xendit: API membalas status %d: %s", resp.StatusCode, string(respBody))
	}

	var invoice Invoice
	if err := json.Unmarshal(respBody, &invoice); err != nil {
		return nil, fmt.Errorf("xendit: gagal decode respons: %w", err)
	}

	return &invoice, nil
}

// VerifyCallbackToken — membandingkan header "x-callback-token" yang dikirim
// Xendit di setiap webhook dengan token yang kita daftarkan di dashboard
// Xendit (XENDIT_WEBHOOK_VERIFICATION_TOKEN). WAJIB dipanggil sebelum
// memproses payload apa pun (lihat Technical Design Document Bagian 5 & 6:
// webhook harus verifikasi signature sebelum diproses).
func VerifyCallbackToken(received, expected string) bool {
	if expected == "" || received == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(received), []byte(expected)) == 1
}

// InvoiceWebhookPayload — subset field yang kita pakai dari payload webhook
// Xendit ("invoice.paid", "invoice.expired", dst). Payload asli punya lebih
// banyak field; kita hanya decode yang relevan.
type InvoiceWebhookPayload struct {
	ID         string `json:"id"`
	ExternalID string `json:"external_id"`
	Status     string `json:"status"` // PAID | EXPIRED | FAILED
	PaidAmount int64  `json:"paid_amount"`
}
