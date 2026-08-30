package pageimport

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif" // pendaftaran decoder GIF (screenshot jarang GIF, tapi image.Decode butuh registrasi eksplisit)
	"image/jpeg"
	_ "image/png" // pendaftaran decoder PNG
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // pendaftaran decoder WebP
)

// ErrNotConfigured -- dikembalikan kalau ANTHROPIC_API_KEY belum diset.
// Sama key & idiom dengan moderation.ErrNotConfigured (SATU key Anthropic
// dipakai bersama utk dua fitur berbeda -- moderasi link & Import), TAPI
// beda konsekuensi ke caller: moderation fail-open (lewati diam-diam),
// handlers.ImportHandler.Analyze di sini mengembalikan pesan error yang
// terlihat ke pengguna (fitur berbayar yang memang diminta eksplisit,
// bukan proses latar belakang).
var ErrNotConfigured = errors.New("pageimport: ANTHROPIC_API_KEY belum diset")

const visionAPIURL = "https://api.anthropic.com/v1/messages"

// visionMaxLongEdge -- batas resolusi tier "Standard" Claude vision (model
// non-4.7+, termasuk Haiku yang dipakai di sini): ~1568px sisi terpanjang,
// selebihnya didownscale otomatis oleh Claude sendiri. Resize DI SINI
// dulu (sebelum encode base64 & kirim) supaya: (1) ukuran & biaya token
// terprediksi berapa pun resolusi asli unggahan kreator, (2) tidak buang
// bandwidth mengirim piksel yang toh dibuang di sisi Claude, (3) selalu
// jauh di bawah batas 10MB base64 API langsung.
const visionMaxLongEdge = 1568

type VisionClient struct {
	APIKey string
	Model  string
	HTTP   *http.Client
}

// NewVisionClient -- apiKey boleh kosong (lihat ErrNotConfigured). Model
// default Haiku (sama alasan moderation.NewClient: klasifikasi terstruktur
// dengan output enum terbatas ini tidak butuh model besar, dan ini fitur
// berbayar yang biayanya perlu ditekan) -- gampang dinaikkan ke
// "claude-sonnet-5" (satu baris) kalau verifikasi live menunjukkan
// akurasinya kurang.
func NewVisionClient(apiKey string) *VisionClient {
	return &VisionClient{
		APIKey: apiKey,
		Model:  "claude-haiku-4-5",
		HTTP:   &http.Client{Timeout: 25 * time.Second},
	}
}

// ThemeResult -- hasil analisis visual SEBELUM divalidasi/clamp (lihat
// validate.go). Bentuknya sengaja dibuat mudah dipetakan ke input
// updateMyPage() di frontend (apps/web/lib/api-client.ts) -- field JSON
// snake_case yang sama dengan yang sudah dipakai MyPage/CustomThemeConfig.
type ThemeResult struct {
	Theme         string       `json:"theme"`
	LayoutVariant string       `json:"layout_variant"`
	Custom        *CustomTheme `json:"custom,omitempty"`
	Confidence    string       `json:"confidence"`
	Notes         string       `json:"notes"`
}

// CustomTheme -- subset field CustomThemeConfig (apps/web/lib/page-themes.ts)
// yang bisa diisi bermakna dari analisis screenshot -- BackgroundType tidak
// pernah "image" di sini (Claude tidak bisa menyediakan asset gambar
// sungguhan dari analisis visual).
type CustomTheme struct {
	BackgroundType  string `json:"background_type"`
	BackgroundValue string `json:"background_value"`
	Font            string `json:"font"`
	ButtonColor     string `json:"button_color"`
	ButtonStyle     string `json:"button_style"`
	ButtonRounded   string `json:"button_rounded"`
	ButtonTextColor string `json:"button_text_color"`
	PageTextColor   string `json:"page_text_color"`
	TitleColor      string `json:"title_color"`
}

type visionMessagesRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	System    string          `json:"system"`
	Messages  []visionMessage `json:"messages"`
}

type visionMessage struct {
	Role    string          `json:"role"`
	Content []visionContent `json:"content"`
}

// visionContent -- union block gambar/teks. Field Source/Text yang tidak
// relevan untuk Type tertentu SENGAJA dibiarkan kosong (omitempty) --
// Anthropic Messages API membedakan block lewat "type", bukan lewat field
// mana yang terisi.
type visionContent struct {
	Type   string        `json:"type"`
	Source *visionSource `json:"source,omitempty"`
	Text   string        `json:"text,omitempty"`
}

type visionSource struct {
	Type      string `json:"type"`
	MediaType string `json:"media_type"`
	Data      string `json:"data"`
}

type visionMessagesResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// visionSystemPrompt -- shortlist 12 preset di sini HARUS tetap sinkron
// dengan themeShortlist (validate.go) DAN benar-benar ada di PageThemeName
// (apps/web/lib/page-themes.ts) -- dikonfirmasi ada saat menulis fitur ini
// (default/midnight/minimal/noir/bloom/cosmic/aurora/candy/matcha/obsidian/
// corporate/console), verifikasi ulang kalau salah satu preset itu pernah
// di-rename/dihapus di masa depan. 15 nilai layout_variant juga HARUS
// sinkron dengan layoutVariants (validate.go) & union asli di quick-setup-
// templates.ts.
const visionSystemPrompt = `Kamu adalah asisten desain untuk platform link-in-bio Indonesia (Jeon.id). Kamu akan diberi SATU screenshot halaman link-in-bio dari platform lain (Linktree, Lynk.id, dst). Tugasmu: cocokkan tampilannya (warna latar, gaya tombol, warna teks, kesan font, tata letak avatar/nama/bio/tautan) ke sistem tema Jeon.id sedekat mungkin -- BUKAN replikasi piksel-sempurna, cukup kombinasi tema/layout Jeon.id yang paling mirip nuansanya.

Pilih SALAH SATU dari daftar preset berikut kalau ada yang cukup mirip:
- "default": hijau tosca lembut, netral, serbaguna
- "midnight": hitam kehijauan gelap, minimalis
- "minimal": putih/abu sangat bersih, tanpa dekorasi
- "noir": hitam pekat + aksen emas, mewah
- "bloom": pastel lembut, feminin, floral
- "cosmic": gradasi ungu-biru gelap, galaksi
- "aurora": gradasi hijau-biru cerah, mengalir
- "candy": warna cerah playful, gradasi pink-oranye
- "matcha": hijau sage/olive natural
- "obsidian": hitam matte polos tanpa aksen warna kuat
- "corporate": abu-navy profesional, bersih
- "console": navy-hitam pekat, aksen teal, gaya developer/tech

Kalau TIDAK ADA yang cukup mirip, pilih "custom" dan isi field "custom" dengan warna literal hasil ekstraksi langsung dari screenshot.

Pilih juga "layout_variant" (tata letak avatar/nama/bio), SALAH SATU:
"centered" (semua di tengah, standar), "banner" (avatar kecil rata kiri sebaris nama), "card" (identitas dibungkus kartu terpisah), "spotlight" (avatar besar dominan), "cover" (foto sampul lebar di atas), "minimal" (super sederhana tanpa dekorasi), "hero" (avatar sangat besar ala hero section), "polaroid" (avatar berbingkai foto polaroid), "split" (avatar & teks berdampingan), "ticket" (kartu bergaya tiket sobek), "headline" (nama besar ala judul berita), "ribbon" (pita dekoratif di avatar), "duo" (dua kolom identitas), "masthead" (ala kop majalah), "portrait" (avatar memanjang vertikal).

SELALU balas walau screenshot tidak jelas atau bukan halaman link-in-bio -- pilih confidence "low" dan jelaskan kenapa di "notes". JANGAN PERNAH menolak menjawab atau membalas selain JSON.

Balas HANYA dengan JSON valid, tanpa teks lain, format persis:
{"theme": "...", "layout_variant": "...", "custom": {"background_type": "solid atau gradient", "background_value": "#RRGGBB atau linear-gradient(...)", "font": "inter/playfair/lora/montserrat/roboto-mono/poppins/quicksand/merriweather/space-grotesk", "button_color": "#RRGGBB", "button_style": "fill/outline/glass", "button_rounded": "none/sm/md/full", "button_text_color": "#RRGGBB", "page_text_color": "#RRGGBB", "title_color": "#RRGGBB"} (isi null kalau theme bukan "custom"), "confidence": "high/medium/low", "notes": "1 kalimat Bahasa Indonesia"}`

// resizeForVision mendekode gambar apa pun yang didukung (jpg/png/gif/webp)
// dan mengembalikan JPEG q85 yang sisi terpanjangnya sudah di-cap ke
// visionMaxLongEdge (dibiarkan apa adanya kalau sudah lebih kecil dari
// itu). TIDAK memakai imageconv.ToWebP -- fungsi itu utk asset PERMANEN
// (Storage.Upload), buffer di sini cuma dipakai sekali utk satu panggilan
// Claude lalu dibuang, tidak pernah disimpan.
func resizeForVision(r io.Reader) ([]byte, error) {
	img, _, err := image.Decode(r)
	if err != nil {
		return nil, fmt.Errorf("gambar tidak valid atau format tidak didukung: %w", err)
	}

	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	longEdge := w
	if h > longEdge {
		longEdge = h
	}
	if longEdge > visionMaxLongEdge {
		scale := float64(visionMaxLongEdge) / float64(longEdge)
		newW := int(float64(w) * scale)
		newH := int(float64(h) * scale)
		if newW < 1 {
			newW = 1
		}
		if newH < 1 {
			newH = 1
		}
		dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
		draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)
		img = dst
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		return nil, fmt.Errorf("gagal mengonversi gambar: %w", err)
	}
	return buf.Bytes(), nil
}

// AnalyzeScreenshot mengirim screenshot ke Claude vision & mengembalikan
// hasil yang SUDAH divalidasi/clamp (clampThemeResult, validate.go) --
// caller tidak perlu memvalidasi lagi. Hanya mengembalikan error kalau
// analisis benar-benar gagal didapat (belum dikonfigurasi/network/timeout/
// respons tak terduga) -- caller (handlers.ImportHandler) yang memutuskan
// bagaimana menampilkan kegagalan ini (lihat desain "dua belahan independen"
// di Analyze).
func (c *VisionClient) AnalyzeScreenshot(ctx context.Context, imageReader io.Reader) (ThemeResult, error) {
	if c == nil || c.APIKey == "" {
		return ThemeResult{}, ErrNotConfigured
	}

	jpegBytes, err := resizeForVision(imageReader)
	if err != nil {
		return ThemeResult{}, err
	}
	b64 := base64.StdEncoding.EncodeToString(jpegBytes)

	reqBody := visionMessagesRequest{
		Model:     c.Model,
		MaxTokens: 700,
		System:    visionSystemPrompt,
		Messages: []visionMessage{{
			Role: "user",
			// Gambar SEBELUM teks -- rekomendasi resmi Anthropic ("Claude
			// works best when images come before text").
			Content: []visionContent{
				{Type: "image", Source: &visionSource{Type: "base64", MediaType: "image/jpeg", Data: b64}},
				{Type: "text", Text: "Cocokkan tema Jeon.id untuk screenshot link-in-bio ini."},
			},
		}},
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return ThemeResult{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, visionAPIURL, bytes.NewReader(payload))
	if err != nil {
		return ThemeResult{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", c.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return ThemeResult{}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return ThemeResult{}, err
	}

	var parsed visionMessagesResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return ThemeResult{}, fmt.Errorf("pageimport: gagal parse respons Claude API: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		msg := fmt.Sprintf("status %d", resp.StatusCode)
		if parsed.Error != nil && parsed.Error.Message != "" {
			msg = parsed.Error.Message
		}
		return ThemeResult{}, fmt.Errorf("pageimport: Claude API error: %s", msg)
	}
	if len(parsed.Content) == 0 {
		return ThemeResult{}, errors.New("pageimport: respons Claude API kosong")
	}

	// Model kadang membungkus JSON dengan ```json ... ``` walau diminta
	// polos -- idiom sama persis moderation.Client.Classify.
	text := strings.TrimSpace(parsed.Content[0].Text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var result ThemeResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return ThemeResult{}, fmt.Errorf("pageimport: gagal parse hasil analisis: %w", err)
	}

	return clampThemeResult(result), nil
}
