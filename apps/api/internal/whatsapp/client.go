// Package whatsapp mengirim notifikasi WhatsApp ke pembeli (No.74, Sprint 8
// -- lanjutan No.47: email SUDAH selesai & terverifikasi, WhatsApp belum
// diimplementasikan sama sekali). Kanal ini SENGAJA jadi kanal TAMBAHAN,
// bukan pengganti email -- email tetap satu-satunya kanal yang wajib
// berhasil; kegagalan WhatsApp tidak boleh membuat pembeli gagal menerima
// notifikasi sama sekali (lihat pemanggilan best-effort di worker.go).
//
// Dibangun terhadap WhatsApp Business Cloud API (Meta) -- pilihan resmi
// yang direkomendasikan (bukan gateway pihak ketiga tidak resmi) karena
// pesan TRANSAKSIONAL seperti ini (konfirmasi pembelian) bisa dikirim lewat
// template pra-disetujui bahkan di luar sesi 24 jam, tanpa risiko nomor
// diblokir seperti gateway ala WhatsApp Web.
//
// KEPUTUSAN BISNIS BELUM DIAMBIL (permintaan langsung pengguna, 27 Juli
// 2026: "bangun infrastrukturnya dulu saja, kredensial nanti") -- paket ini
// SIAP dipakai begitu WHATSAPP_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID terisi,
// TAPI belum pernah diuji coba end-to-end terhadap Meta API sungguhan
// (butuh verifikasi bisnis Meta + nomor WhatsApp terdaftar + template pesan
// disetujui, proses yang bisa makan beberapa hari, lihat catatan No.75 di
// Rencana-Sprint-Jeonme.xlsx). Struktur "components"/parameter template di
// bawah adalah pola PALING UMUM untuk template utility sederhana (body
// dengan placeholder {{1}}/{{2}} berurutan) -- kalau template yang benar-
// benar disetujui Meta nanti punya struktur berbeda (mis. tombol/header),
// SendOrderConfirmation perlu disesuaikan lagi.
package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// apiBaseURL -- versi Graph API Meta. Dipisah jadi konstanta (bukan
// ditanam langsung di URL) supaya gampang dinaikkan kalau versi ini
// dihentikan Meta di masa depan.
const apiBaseURL = "https://graph.facebook.com/v21.0"

type Client struct {
	APIToken      string
	PhoneNumberID string
	TemplateName  string
	TemplateLang  string
	HTTP          *http.Client
}

func NewClient(apiToken, phoneNumberID, templateName, templateLang string) *Client {
	return &Client{
		APIToken:      apiToken,
		PhoneNumberID: phoneNumberID,
		TemplateName:  templateName,
		TemplateLang:  templateLang,
		HTTP:          &http.Client{Timeout: 15 * time.Second},
	}
}

// IsConfigured dipakai SendOrderConfirmation sendiri untuk memutuskan
// log-only vs kirim sungguhan (persis pola mailer.Client.Send) -- diekspos
// publik supaya pemanggil lain (mis. endpoint diagnostik/admin di masa
// depan) bisa memeriksa status konfigurasi tanpa mencoba mengirim pesan.
func (c *Client) IsConfigured() bool {
	return c.APIToken != "" && c.PhoneNumberID != ""
}

var digitsOnly = regexp.MustCompile(`\D`)

// NormalizeIndonesianPhone mengubah nomor gaya Indonesia (awalan "0",
// "+62", "62", atau campuran spasi/strip/tanda kurung) jadi format yang
// diharapkan WhatsApp Cloud API: kode negara + nomor TANPA "+"/spasi/nol
// di depan (mis. "081234567890" -> "6281234567890"). Mengembalikan error
// kalau setelah dibersihkan hasilnya tidak masuk akal sebagai nomor
// (terlalu pendek) -- BUKAN validasi ketat operator seluler, cukup untuk
// mencegah pemanggilan API dengan nilai yang jelas bukan nomor telepon.
func NormalizeIndonesianPhone(raw string) (string, error) {
	digits := digitsOnly.ReplaceAllString(raw, "")
	switch {
	case strings.HasPrefix(digits, "620"):
		// Kesalahan input umum: "62" + "0812..." tertempel jadi "62 0812...".
		digits = "62" + strings.TrimPrefix(digits, "620")
	case strings.HasPrefix(digits, "62"):
		// Sudah format internasional.
	case strings.HasPrefix(digits, "0"):
		digits = "62" + strings.TrimPrefix(digits, "0")
	default:
		digits = "62" + digits
	}
	if len(digits) < 10 || len(digits) > 15 {
		return "", fmt.Errorf("whatsapp: %q bukan nomor telepon yang masuk akal setelah dinormalisasi (%q)", raw, digits)
	}
	return digits, nil
}

type templateComponent struct {
	Type       string              `json:"type"`
	Parameters []templateParameter `json:"parameters"`
}

type templateParameter struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type sendMessageRequest struct {
	MessagingProduct string `json:"messaging_product"`
	To               string `json:"to"`
	Type             string `json:"type"`
	Template         struct {
		Name     string `json:"name"`
		Language struct {
			Code string `json:"code"`
		} `json:"language"`
		Components []templateComponent `json:"components"`
	} `json:"template"`
}

type apiErrorResponse struct {
	Error struct {
		Message      string `json:"message"`
		Type         string `json:"type"`
		Code         int    `json:"code"`
		ErrorSubcode int    `json:"error_subcode"`
		FBTraceID    string `json:"fbtrace_id"`
	} `json:"error"`
}

// SendOrderConfirmation mengirim template pesan konfirmasi pembelian.
// bodyParams diisi berurutan menggantikan placeholder {{1}}, {{2}}, dst di
// body template yang terdaftar di Meta Business Manager -- lihat catatan
// paket di atas soal struktur template yang diasumsikan.
//
// to HARUS sudah dinormalisasi lewat NormalizeIndonesianPhone sebelum
// dipanggil -- fungsi ini sengaja TIDAK menormalisasi sendiri supaya
// pemanggil (worker.go) yang memutuskan bagaimana menangani nomor yang
// gagal dinormalisasi (skip vs log) tanpa panggilan API yang pasti gagal.
func (c *Client) SendOrderConfirmation(ctx context.Context, to string, bodyParams []string) error {
	if !c.IsConfigured() {
		log.Printf("whatsapp: belum dikonfigurasi, lewati pengiriman ke %s", to)
		return nil
	}

	params := make([]templateParameter, len(bodyParams))
	for i, p := range bodyParams {
		params[i] = templateParameter{Type: "text", Text: p}
	}

	var reqBody sendMessageRequest
	reqBody.MessagingProduct = "whatsapp"
	reqBody.To = to
	reqBody.Type = "template"
	reqBody.Template.Name = c.TemplateName
	reqBody.Template.Language.Code = c.TemplateLang
	reqBody.Template.Components = []templateComponent{{Type: "body", Parameters: params}}

	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("whatsapp: gagal encode payload: %w", err)
	}

	url := fmt.Sprintf("%s/%s/messages", apiBaseURL, c.PhoneNumberID)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("whatsapp: gagal menyusun request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.APIToken)

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return fmt.Errorf("whatsapp: gagal menghubungi Graph API: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		var apiErr apiErrorResponse
		if json.Unmarshal(respBody, &apiErr) == nil && apiErr.Error.Message != "" {
			return fmt.Errorf("whatsapp: Graph API menolak (status %d): %s (fbtrace_id=%s)",
				resp.StatusCode, apiErr.Error.Message, apiErr.Error.FBTraceID)
		}
		return fmt.Errorf("whatsapp: Graph API menolak dengan status %d", resp.StatusCode)
	}

	return nil
}
