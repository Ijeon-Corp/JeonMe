// Package metaconversions membungkus Facebook/Meta Conversions API
// (server-side) -- permintaan langsung pengguna, 12 Agustus 2026
// (referensi tangkapan layar panel "Analytics" Linktree): kreator isi
// Pixel ID + Access Token dari Facebook Events Manager, event kunjungan/
// klik dikirim dari SERVER (bukan cuma browser pengunjung lewat fbq()
// client-side) supaya tetap tercatat walau ad blocker/ITP browser
// memblokir pixel client-side -- ini justru alasan utama Meta
// menyediakan Conversions API, bukan sekadar duplikasi.
//
// Pola SAMA PERSIS dengan internal/midtrans/client.go (ErrNotConfigured,
// http.Client dgn timeout eksplisit, error dibungkus berprefiks nama
// paket) supaya konsisten dgn klien API pihak-ketiga lain di proyek ini.
package metaconversions

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ErrNotConfigured -- kreator belum mengisi Pixel ID ATAU Access Token.
// Dicek oleh pemanggil SEBELUM membuat Client (lihat SendEventIfConfigured)
// supaya tidak ada percobaan panggilan API sia-sia untuk kreator yang
// belum mengaktifkan fitur ini -- mayoritas akun, jadi jalur ini harus
// murah/instan.
var ErrNotConfigured = errors.New("metaconversions: pixel_id atau access_token belum diisi")

type Client struct {
	PixelID     string
	AccessToken string
	BaseURL     string
	HTTP        *http.Client
}

func NewClient(pixelID, accessToken string) *Client {
	return &Client{
		PixelID:     pixelID,
		AccessToken: accessToken,
		BaseURL:     "https://graph.facebook.com/v19.0",
		HTTP:        &http.Client{Timeout: 8 * time.Second},
	}
}

// UserData -- subset field yang Meta pakai untuk pencocokan event (event
// match quality) TANPA data pribadi pengunjung (nama/email/telepon TIDAK
// pernah dikirim -- Jeonme tidak mengumpulkan itu untuk kunjungan/klik
// biasa, cuma untuk checkout yang di luar cakupan modul ini). IP +
// User-Agent SAJA sudah cukup untuk sinyal dasar, sesuai dokumentasi
// resmi Meta (field ini eksplisit didukung tanpa hashing, beda dari
// email/telepon yang WAJIB di-hash SHA-256 kalau dikirim).
type UserData struct {
	ClientIPAddress string
	ClientUserAgent string
}

// SendEvent -- satu event server-side. eventName pakai nama standar Meta
// ("PageView") untuk kunjungan halaman, atau nama custom ("LinkClick")
// untuk klik tautan keluar -- Meta menerima nama event custom apa pun,
// cukup konsisten dipakai supaya laporan Events Manager kreator bisa
// dibaca.
func (c *Client) SendEvent(ctx context.Context, eventName, sourceURL string, user UserData) error {
	if c.PixelID == "" || c.AccessToken == "" {
		return ErrNotConfigured
	}

	payload := map[string]any{
		"data": []map[string]any{
			{
				"event_name":       eventName,
				"event_time":       time.Now().Unix(),
				"action_source":    "website",
				"event_source_url": sourceURL,
				"user_data": map[string]any{
					"client_ip_address": user.ClientIPAddress,
					"client_user_agent": user.ClientUserAgent,
				},
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("metaconversions: gagal encode request: %w", err)
	}

	url := fmt.Sprintf("%s/%s/events?access_token=%s", c.BaseURL, c.PixelID, c.AccessToken)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("metaconversions: gagal membuat request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return fmt.Errorf("metaconversions: gagal memanggil API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("metaconversions: API membalas status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}
