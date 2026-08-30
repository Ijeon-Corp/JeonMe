// Package pageimport -- Fitur Import (permintaan langsung pengguna, 31
// Agustus 2026): "bisa ga buat fungsi... membuat bentuk visual persis
// seperti foto yang diunggah dan juga bisa mengambil seluruh link". Dua
// sub-fitur independen digabung satu package karena selalu dipanggil
// bersamaan dari satu endpoint (lihat handlers.ImportHandler):
//   - scrape.go/linktree.go/generic.go: ambil semua link dari URL
//     link-in-bio lama (Linktree/Lynk.id/dst).
//   - vision.go/validate.go: cocokkan tema Jeon.id dari screenshot lewat
//     Claude vision API.
package pageimport

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jeonme/api/internal/netguard"
)

// ScrapedLink -- satu link hasil scraping, sebelum dikonversi jadi LinkItem
// sungguhan (itu tanggung jawab frontend lewat createLink, lihat catatan di
// applyTemplate quick-setup/page.tsx yang mekanismenya dipakai ulang).
type ScrapedLink struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// scrapeBodyLimit -- 5MB, halaman link-in-bio (bahkan yang berat) tidak
// pernah mendekati ukuran ini -- pagar terhadap target yang sengaja
// mengirim respons raksasa.
const scrapeBodyLimit = 5 << 20

// DetectPlatform -- host persis (bukan substring) supaya domain lain yang
// KEBETULAN mengandung "linktr.ee"/"lynk.id" di path/subdomain tidak salah
// terdeteksi.
func DetectPlatform(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "generic"
	}
	host := strings.ToLower(strings.TrimPrefix(u.Hostname(), "www."))
	switch host {
	case "linktr.ee":
		return "linktree"
	case "lynk.id":
		return "lynkid"
	default:
		return "generic"
	}
}

// ScrapeLinks mengambil rawURL server-side (SELALU lewat netguard -- lihat
// catatan panjang di netguard.go soal SSRF/DNS-rebinding, JANGAN pernah
// panggil http.Get polos untuk URL bebas dari pengguna) lalu mengekstrak
// link, dispatch ke parser platform-spesifik kalau dikenali (linktr.ee),
// selain itu jatuh ke ekstraksi <a href> generik.
//
// Catatan Lynk.id (dikonfirmasi lewat pengujian langsung, 31 Agustus 2026):
// situs ini memblokir SEMUA traffic non-browser lewat Cloudflare, termasuk
// homepage polos -- dicoba dari 2 jalur jaringan independen, keduanya kena
// 403 "Attention Required". Backend produksi (IP datacenter, bukan browser
// asli) SANGAT MUNGKIN kena blokir yang sama. Makanya Lynk.id TIDAK dapat
// parser khusus terpisah (di luar percobaan fallback generik) -- 403/503
// dari target dikembalikan sebagai error KHUSUS supaya frontend bisa
// menampilkan pesan jujur ("situs sumber memblokir pengambilan otomatis"),
// bukan pesan generik "gagal mengambil halaman".
func ScrapeLinks(ctx context.Context, rawURL string) (platform string, links []ScrapedLink, err error) {
	platform = DetectPlatform(rawURL)

	client := netguard.NewOutboundClient(10 * time.Second)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return platform, nil, fmt.Errorf("URL tidak valid: %w", err)
	}
	// User-Agent browser biasa -- Linktree dikonfirmasi tidak masalah TANPA
	// ini, tapi UA default Go ("Go-http-client/1.1") lebih mudah ditolak
	// target lain yang menerapkan proteksi bot dasar berbasis UA.
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; JeonmeImportBot/1.0; +https://jeon.id)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := client.Do(req)
	if err != nil {
		return platform, nil, fmt.Errorf("gagal mengambil halaman: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusServiceUnavailable {
		return platform, nil, fmt.Errorf("situs sumber memblokir pengambilan otomatis dari server kami (status %d)", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return platform, nil, fmt.Errorf("halaman sumber merespons status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, scrapeBodyLimit))
	if err != nil {
		return platform, nil, fmt.Errorf("gagal membaca respons: %w", err)
	}

	if platform == "linktree" {
		if lks, lerr := parseLinktree(data); lerr == nil && len(lks) > 0 {
			return platform, lks, nil
		}
		// Parser khusus gagal/kosong (struktur __NEXT_DATA__ berubah, atau
		// akun tanpa link) -- coba fallback generik di bawah daripada
		// langsung menyerah, hasil sebagian lebih baik daripada nihil.
	}

	genericLinks, genErr := parseGenericLinks(data, rawURL)
	return platform, genericLinks, genErr
}
