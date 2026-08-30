package pageimport

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
)

// nextDataRe -- Linktree (Next.js) menaruh seluruh state halaman, termasuk
// daftar link, di SATU tag <script id="__NEXT_DATA__"> berisi JSON.
// Dikonfirmasi langsung (curl polos ke linktr.ee, HTTP 200, tanpa proteksi
// bot) sebelum menulis parser ini -- bukan asumsi. (?s) supaya "." ikut
// mencocokkan newline di dalam JSON multi-baris.
var nextDataRe = regexp.MustCompile(`(?s)<script id="__NEXT_DATA__"[^>]*>(.*?)</script>`)

type linktreeGate struct {
	Passcode *string `json:"passcode"`
	Age      *int    `json:"age"`
	Nft      *string `json:"nft"`
}

type linktreeRules struct {
	Gate *linktreeGate `json:"gate"`
}

type linktreeLink struct {
	ID       string         `json:"id"`
	Title    string         `json:"title"`
	URL      string         `json:"url"`
	Type     string         `json:"type"`
	Position int            `json:"position"`
	Rules    *linktreeRules `json:"rules"`
}

type linktreeNextData struct {
	Props struct {
		PageProps struct {
			Links []linktreeLink `json:"links"`
		} `json:"pageProps"`
	} `json:"props"`
}

// parseLinktree -- lihat catatan sumber struktur di ScrapeLinks/nextDataRe.
// Filter yang diterapkan (perlu verifikasi ulang terhadap akun yang benar-
// benar pakai header/social section, sampel yang dicek saat desain fitur
// ini tidak punya itu): skip URL kosong, skip link terkunci (rules.gate.*
// terisi -- Jeonme tidak bisa "membuka" kunci Linktree lewat import), urutkan
// by position, dedupe by URL.
func parseLinktree(data []byte) ([]ScrapedLink, error) {
	m := nextDataRe.FindSubmatch(data)
	if m == nil {
		return nil, errors.New("tag __NEXT_DATA__ tidak ditemukan")
	}

	var parsed linktreeNextData
	if err := json.Unmarshal(m[1], &parsed); err != nil {
		return nil, fmt.Errorf("gagal parse __NEXT_DATA__: %w", err)
	}

	raw := parsed.Props.PageProps.Links
	sort.SliceStable(raw, func(i, j int) bool { return raw[i].Position < raw[j].Position })

	seen := make(map[string]bool, len(raw))
	links := make([]ScrapedLink, 0, len(raw))
	for _, l := range raw {
		if l.URL == "" || seen[l.URL] {
			continue
		}
		if l.Rules != nil && l.Rules.Gate != nil {
			g := l.Rules.Gate
			if (g.Passcode != nil && *g.Passcode != "") || (g.Age != nil && *g.Age > 0) || (g.Nft != nil && *g.Nft != "") {
				continue
			}
		}
		seen[l.URL] = true
		title := l.Title
		if title == "" {
			title = l.URL
		}
		links = append(links, ScrapedLink{Title: title, URL: l.URL})
	}
	return links, nil
}
