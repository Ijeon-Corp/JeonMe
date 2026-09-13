// Package duitku membungkus Duitku Invoice API v2 (dokumentasi publik
// Duitku: https://docs.duitku.com/api/en/#invoice). Dibuat 13 September
// 2026 sebagai KERANGKA (permintaan langsung pengguna: "buatkan kerangka
// payment gateway menggunakan duitku") -- bentuk request/response &
// endpoint di sini mengikuti dokumentasi publik Duitku Invoice v2
// (metode "pop up"/hosted, satu halaman pembayaran ter-hosting yang
// menampilkan semua kanal aktif merchant, PERSIS pola Snap Midtrans yang
// SUDAH dipakai jadi tidak perlu mengubah alur redirect frontend sama
// sekali -- lihat catatan payment.Gateway).
//
// PENTING sebelum dipakai sungguhan: paket ini BELUM PERNAH diuji ke API
// Duitku sungguhan (tidak ada kredensial sandbox Duitku tersedia saat
// kerangka ini ditulis) -- verifikasi ulang nama field & endpoint persis
// terhadap dokumentasi Duitku TERKINI (https://docs.duitku.com) sebelum
// dianggap siap produksi. Pola error handling/HTTP di sini SENGAJA meniru
// gaya internal/midtrans/client.go apa adanya supaya kedua paket mudah
// dibandingkan baris-per-baris.
package duitku

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ErrNotConfigured -- sama seperti midtrans.ErrNotConfigured, dikembalikan
// kalau DUITKU_MERCHANT_CODE/DUITKU_API_KEY belum diisi.
var ErrNotConfigured = errors.New("duitku: DUITKU_MERCHANT_CODE/DUITKU_API_KEY belum diset")

type Client struct {
	MerchantCode string
	APIKey       string
	BaseURL      string
	HTTP         *http.Client
}

// NewClient -- dua host BEDA per dokumentasi Duitku (bukan sekadar
// subdomain sandbox/production seperti Midtrans): sandbox di
// sandbox.duitku.com, production di passport.duitku.com.
func NewClient(merchantCode, apiKey string, isProduction bool) *Client {
	baseURL := "https://sandbox.duitku.com"
	if isProduction {
		baseURL = "https://passport.duitku.com"
	}
	return &Client{
		MerchantCode: merchantCode,
		APIKey:       apiKey,
		BaseURL:      baseURL,
		HTTP:         &http.Client{Timeout: 15 * time.Second},
	}
}

type CreateTransactionRequest struct {
	OrderID           string
	GrossAmountIDR    int64
	ItemName          string
	CustomerEmail     string
	FinishRedirectURL string
	// CallbackURL -- Duitku (beda dari Midtrans) memisahkan URL webhook
	// server-to-server ("callbackUrl") dari URL redirect browser
	// ("returnUrl") sebagai DUA field terpisah -- Midtrans Snap cuma
	// punya satu "finish" karena notifikasinya selalu lewat webhook
	// terdaftar di dashboard merchant, bukan per-request. WAJIB diisi
	// pemanggil (routes.go, dari PublicWebURL API bukan web -- lihat
	// catatan di NewCheckoutHandler pemanggil paket ini).
	CallbackURL string
}

type InvoiceTransaction struct {
	PaymentURL string `json:"paymentUrl"`
	Reference  string `json:"reference"`
	StatusCode string `json:"statusCode"`
}

// signInquiry -- formula tanda tangan resmi Duitku utk v2/inquiry:
// MD5(merchantCode + merchantOrderId + paymentAmount + apiKey). BEDA dari
// signature callback/status (lihat signCallback/signStatus di bawah) --
// Duitku memakai 3 formula MD5 berbeda tergantung endpoint, bukan satu
// formula dipakai ulang seperti SHA512 tunggal Midtrans.
func signInquiry(merchantCode, orderID string, amountIDR int64, apiKey string) string {
	raw := fmt.Sprintf("%s%s%d%s", merchantCode, orderID, amountIDR, apiKey)
	sum := md5.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// CreateTransaction -- POST /webapi/api/merchant/v2/inquiry. `paymentMethod`
// SENGAJA tidak dikirim (kosong) supaya Duitku menampilkan halaman pilih
// metode pembayaran sendiri -- perilaku "hosted, banyak kanal sekaligus"
// yang sama seperti Snap Midtrans, bukan dipaksa satu kanal tertentu.
func (c *Client) CreateTransaction(ctx context.Context, req CreateTransactionRequest) (*InvoiceTransaction, error) {
	if c.MerchantCode == "" || c.APIKey == "" {
		return nil, ErrNotConfigured
	}

	payload := map[string]any{
		"merchantCode":    c.MerchantCode,
		"paymentAmount":   req.GrossAmountIDR,
		"merchantOrderId": req.OrderID,
		"productDetails":  req.ItemName,
		"email":           req.CustomerEmail,
		"callbackUrl":     req.CallbackURL,
		"returnUrl":       req.FinishRedirectURL,
		"signature":       signInquiry(c.MerchantCode, req.OrderID, req.GrossAmountIDR, c.APIKey),
	}

	var out InvoiceTransaction
	if err := c.doRequest(ctx, "/webapi/api/merchant/v2/inquiry", payload, &out); err != nil {
		return nil, err
	}
	if out.StatusCode != "00" {
		return nil, fmt.Errorf("duitku: inquiry gagal, statusCode=%s", out.StatusCode)
	}
	return &out, nil
}

// CallbackPayload -- field yang dikirim Duitku ke `callbackUrl` (POST
// application/x-www-form-urlencoded, BUKAN JSON seperti webhook Midtrans
// -- lihat ParseWebhook di gateway.go paket payment/, parsing form value
// dilakukan di sana sebelum struct ini di-unmarshal dari map).
type CallbackPayload struct {
	MerchantCode    string `json:"merchantCode"`
	Amount          string `json:"amount"`
	MerchantOrderID string `json:"merchantOrderId"`
	ProductDetail   string `json:"productDetail"`
	ResultCode      string `json:"resultCode"`
	Reference       string `json:"reference"`
	Signature       string `json:"signature"`
	PaymentCode     string `json:"paymentCode"`
}

// signCallback -- formula BEDA dari signInquiry (urutan field beda,
// TANPA orderId di posisi ke-2): MD5(merchantCode + amount +
// merchantOrderId + apiKey), per dokumentasi Duitku bagian "Callback".
func signCallback(merchantCode, amount, orderID, apiKey string) string {
	raw := merchantCode + amount + orderID + apiKey
	sum := md5.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// VerifyCallbackSignature -- pola sama persis midtrans.VerifySignature
// (constant-time compare, bukan reflect.DeepEqual/==).
func VerifyCallbackSignature(merchantCode, amount, orderID, apiKey, receivedSignature string) bool {
	if apiKey == "" || receivedSignature == "" {
		return false
	}
	expected := signCallback(merchantCode, amount, orderID, apiKey)
	return subtle.ConstantTimeCompare([]byte(expected), []byte(receivedSignature)) == 1
}

// ResultCodeToOrderStatus -- pemetaan resultCode Duitku (bernilai string
// "00" sukses, lainnya gagal/pending per dokumentasi) ke status order
// internal kita, pola sama seperti midtrans.StatusToOrderStatus. Duitku
// TIDAK mengirim status "expired" terpisah lewat callback (kadaluwarsa
// baru diketahui lewat CheckTransactionStatus polling, lihat
// StatusCodeToOrderStatus di bawah) -- resultCode selain "00" di callback
// diperlakukan belum final (recognized=false) alih-alih buru-buru
// menganggap gagal permanen.
func ResultCodeToOrderStatus(resultCode string) (status string, recognized bool) {
	if resultCode == "00" {
		return "paid", true
	}
	return "", false
}

type TransactionStatusResponse struct {
	Reference     string `json:"reference"`
	Amount        string `json:"amount"`
	StatusCode    string `json:"statusCode"`
	StatusMessage string `json:"statusMessage"`
}

// signStatus -- formula KETIGA yang beda lagi: MD5(merchantCode +
// merchantOrderId + apiKey), TANPA amount sama sekali (beda dari
// signInquiry MAUPUN signCallback).
func signStatus(merchantCode, orderID, apiKey string) string {
	raw := merchantCode + orderID + apiKey
	sum := md5.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// GetTransactionStatus -- POST /webapi/api/merchant/transactionStatus,
// dipakai ReconcilePendingOrders (checkout.go) polling langsung ke Duitku
// utk order yang callback-nya tidak pernah sampai -- pola sama persis
// midtrans.Client.GetTransactionStatus. statusCode: "00"=sukses,
// "01"=pending (belum final), "02"=gagal, per dokumentasi Duitku.
func (c *Client) GetTransactionStatus(ctx context.Context, orderID string) (*TransactionStatusResponse, error) {
	if c.MerchantCode == "" || c.APIKey == "" {
		return nil, ErrNotConfigured
	}
	payload := map[string]any{
		"merchantCode":    c.MerchantCode,
		"merchantOrderId": orderID,
		"signature":       signStatus(c.MerchantCode, orderID, c.APIKey),
	}
	var out TransactionStatusResponse
	if err := c.doRequest(ctx, "/webapi/api/merchant/transactionStatus", payload, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// StatusCodeToOrderStatus -- lihat catatan statusCode di atas
// GetTransactionStatus.
func StatusCodeToOrderStatus(statusCode string) (status string, recognized bool) {
	switch statusCode {
	case "00":
		return "paid", true
	case "02":
		return "failed", true
	default:
		// "01" (pending) & kode tak dikenal lain -- belum final.
		return "", false
	}
}

func (c *Client) doRequest(ctx context.Context, path string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("duitku: gagal encode request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+path, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("duitku: gagal membuat request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return fmt.Errorf("duitku: gagal memanggil API: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("duitku: gagal membaca respons: %w", err)
	}

	if resp.StatusCode >= 300 {
		return fmt.Errorf("duitku: API membalas status %d: %s", resp.StatusCode, string(respBody))
	}

	if out != nil {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("duitku: gagal decode respons: %w", err)
		}
	}
	return nil
}
