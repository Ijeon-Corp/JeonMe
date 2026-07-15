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
	HTTP      *http.Client
}

// NewClient — isProduction menentukan base URL Snap: sandbox untuk
// development/staging, production untuk rilis sungguhan. Server key sandbox
// dan production TIDAK bisa dipakai silang (Midtrans menolak dengan 401).
func NewClient(serverKey string, isProduction bool) *Client {
	baseURL := "https://app.sandbox.midtrans.com"
	if isProduction {
		baseURL = "https://app.midtrans.com"
	}
	return &Client{
		ServerKey: serverKey,
		BaseURL:   baseURL,
		HTTP:      &http.Client{Timeout: 15 * time.Second},
	}
}

type CreateTransactionRequest struct {
	OrderID           string
	GrossAmountIDR    int64
	ItemName          string
	CustomerEmail     string
	FinishRedirectURL string
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
