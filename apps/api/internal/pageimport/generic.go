package pageimport

import (
	"bytes"
	"fmt"
	"net/url"
	"strings"

	"golang.org/x/net/html"
)

// maxGenericTitleLen -- pagar terhadap anchor dengan teks nyasar panjang
// (mis. blok teks besar yang kebetulan seluruhnya jadi <a>), bukan batas
// yang realistis pernah tercapai untuk judul link biasa.
const maxGenericTitleLen = 120

// parseGenericLinks -- fallback utk platform TANPA parser khusus (termasuk
// Lynk.id -- lihat catatan panjang soal Cloudflare di ScrapeLinks, ini
// realistis jadi jalur UTAMA untuk platform itu, bukan sekadar cadangan
// jarang terpakai). Jalan-jalan seluruh DOM lewat golang.org/x/net/html
// (parser HTML5 lengkap, jauh lebih toleran terhadap markup rusak
// dibanding regex), kumpulkan tiap <a href>, buang navigasi internal
// (host sama dgn halaman sumber -- biasanya footer/login/about, bukan
// tautan konten kreator) dan href yang jelas bukan konten (#, javascript:).
func parseGenericLinks(data []byte, sourceURL string) ([]ScrapedLink, error) {
	base, err := url.Parse(sourceURL)
	if err != nil {
		return nil, fmt.Errorf("URL sumber tidak valid: %w", err)
	}
	sourceHost := strings.ToLower(strings.TrimPrefix(base.Hostname(), "www."))

	doc, err := html.Parse(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("gagal parse HTML: %w", err)
	}

	seen := map[string]bool{}
	var links []ScrapedLink

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "a" {
			href := nodeAttr(n, "href")
			if link, ok := buildScrapedLink(href, base, sourceHost, nodeText(n)); ok && !seen[link.URL] {
				seen[link.URL] = true
				links = append(links, link)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if links == nil {
		links = []ScrapedLink{}
	}
	return links, nil
}

func nodeAttr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func nodeText(n *html.Node) string {
	var sb strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			sb.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return strings.TrimSpace(sb.String())
}

func buildScrapedLink(href string, base *url.URL, sourceHost, title string) (ScrapedLink, bool) {
	trimmed := strings.TrimSpace(href)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "javascript:") {
		return ScrapedLink{}, false
	}

	resolved, err := base.Parse(trimmed)
	if err != nil {
		return ScrapedLink{}, false
	}

	switch resolved.Scheme {
	case "http", "https":
		host := strings.ToLower(strings.TrimPrefix(resolved.Hostname(), "www."))
		if host == "" || host == sourceHost {
			// Link internal ke halaman sumber itu sendiri (nav/footer/login)
			// -- bukan tautan konten yang kreator cantumkan.
			return ScrapedLink{}, false
		}
	case "mailto":
		// dipertahankan -- Jeonme mendukung link email di tempat lain juga.
	default:
		return ScrapedLink{}, false
	}

	if title == "" {
		title = resolved.Hostname()
		if title == "" {
			title = resolved.String()
		}
	}
	if len(title) > maxGenericTitleLen {
		title = title[:maxGenericTitleLen]
	}

	return ScrapedLink{Title: title, URL: resolved.String()}, true
}
