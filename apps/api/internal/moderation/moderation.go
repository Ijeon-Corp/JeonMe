// Package moderation membungkus panggilan klasifikasi tautan sensitif ke
// Claude API (permintaan langsung pengguna, 22 Agustus 2026: "kalau pakai
// ai agent buatan sendiri apakah bisa" -- lapisan KEDUA setelah blocklist
// deterministik di handlers.LinkModerationChecker, HANYA dipanggil untuk
// domain yang belum pernah dilihat & tidak cocok kata kunci mana pun).
// Client HTTP mentah (net/http + encoding/json), pola yang sama dengan
// internal/googleoauth & internal/midtrans -- tidak menambah dependency
// SDK resmi Anthropic hanya untuk satu panggilan REST sederhana.
package moderation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ErrNotConfigured -- dikembalikan kalau ANTHROPIC_API_KEY belum diset.
// Caller (handlers.LinkModerationChecker) memperlakukan ini sebagai
// fail-open (izinkan link, blocklist deterministik tetap berlaku) -- pola
// sama seperti googleoauth.ErrNotConfigured/midtrans.ErrNotConfigured,
// TAPI beda konsekuensi: di sana fitur yang belum dikonfigurasi menolak
// permintaan (501), di sini fitur yang belum dikonfigurasi TIDAK menahan
// aksi utama kreator sama sekali, cuma kehilangan lapisan deteksi bonus.
var ErrNotConfigured = errors.New("moderation: ANTHROPIC_API_KEY belum diset")

const apiURL = "https://api.anthropic.com/v1/messages"

type Client struct {
	APIKey string
	Model  string
	HTTP   *http.Client
}

// NewClient -- apiKey boleh kosong (lihat ErrNotConfigured). Model default
// Haiku (Claude 5 generation, model kecil/cepat) -- klasifikasi ya/tidak
// sederhana ini tidak butuh model besar, dan dipanggil sinkron di jalur
// simpan link jadi latensi & biaya per panggilan penting.
func NewClient(apiKey string) *Client {
	return &Client{
		APIKey: apiKey,
		Model:  "claude-haiku-4-5-20251001",
		HTTP:   &http.Client{Timeout: 6 * time.Second},
	}
}

// Verdict -- hasil klasifikasi satu URL+judul.
type Verdict struct {
	Blocked  bool
	Category string // "judi_online" | "konten_dewasa" | "lainnya" (kosong kalau !Blocked)
	Reason   string // penjelasan singkat AI, disimpan utk ditinjau admin
}

type messagesRequest struct {
	Model     string         `json:"model"`
	MaxTokens int            `json:"max_tokens"`
	System    string         `json:"system"`
	Messages  []messageParam `json:"messages"`
}

type messageParam struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type messagesResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// classifyResult -- bentuk JSON yang diminta ke model lewat system prompt.
type classifyResult struct {
	Blocked  bool   `json:"blocked"`
	Category string `json:"category"`
	Reason   string `json:"reason"`
}

const systemPrompt = `Kamu adalah pemeriksa konten untuk platform link-in-bio Indonesia (Jeon.id). Tugasmu HANYA memutuskan apakah sebuah URL tujuan tautan mengarah ke:
- "judi_online": situs judi/taruhan online (slot, togel, casino online, sportsbook, poker uang asli, dsb -- termasuk yang menyamar lewat nama domain umum tapi kontennya judi)
- "konten_dewasa": pornografi/konten seksual eksplisit
- "lainnya": kategori sensitif lain yang jelas melanggar hukum Indonesia (mis. penjualan narkoba, perjudian terselubung) DAN BUKAN kategori di atas
- aman: tidak masuk kategori mana pun di atas

Kamu HANYA melihat URL dan judul tautan yang diberikan kreator, TIDAK bisa membuka/mem-fetch halaman sungguhan. Putuskan berdasarkan nama domain, path URL, dan judul saja. Kalau ragu atau informasinya tidak cukup untuk yakin, JANGAN blokir (blocked=false) -- salah blokir situs sah lebih merugikan daripada melewatkan satu situs mencurigakan yang nanti bisa dilaporkan pengunjung.

Balas HANYA dengan JSON valid, tanpa teks lain, format persis:
{"blocked": boolean, "category": "judi_online" | "konten_dewasa" | "lainnya" | "", "reason": "penjelasan singkat 1 kalimat dalam Bahasa Indonesia"}`

// Classify memutuskan apakah rawURL+title mengarah ke konten sensitif.
// Fail-open sepenuhnya di sisi caller -- fungsi ini HANYA mengembalikan
// error kalau klasifikasi benar-benar gagal didapat (network/timeout/
// respons tak terduga), caller (handlers.LinkModerationChecker) yang
// memutuskan untuk mengizinkan link kalau begitu.
func (c *Client) Classify(ctx context.Context, rawURL, title string) (Verdict, error) {
	if c == nil || c.APIKey == "" {
		return Verdict{}, ErrNotConfigured
	}

	userContent := fmt.Sprintf("URL: %s\nJudul tautan: %s", rawURL, title)
	reqBody := messagesRequest{
		Model:     c.Model,
		MaxTokens: 200,
		System:    systemPrompt,
		Messages:  []messageParam{{Role: "user", Content: userContent}},
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return Verdict{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(payload))
	if err != nil {
		return Verdict{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", c.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return Verdict{}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return Verdict{}, err
	}

	var parsed messagesResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return Verdict{}, fmt.Errorf("moderation: gagal parse respons Claude API: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		msg := fmt.Sprintf("status %d", resp.StatusCode)
		if parsed.Error != nil && parsed.Error.Message != "" {
			msg = parsed.Error.Message
		}
		return Verdict{}, fmt.Errorf("moderation: Claude API error: %s", msg)
	}
	if len(parsed.Content) == 0 {
		return Verdict{}, errors.New("moderation: respons Claude API kosong")
	}

	// Model kadang membungkus JSON dengan ```json ... ``` walau diminta
	// polos -- lucuti pembungkus code-fence itu kalau ada, sebelum parse.
	text := strings.TrimSpace(parsed.Content[0].Text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var result classifyResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return Verdict{}, fmt.Errorf("moderation: gagal parse hasil klasifikasi: %w", err)
	}

	return Verdict(result), nil
}
