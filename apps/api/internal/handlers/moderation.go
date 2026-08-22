package handlers

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/moderation"
)

// LinkModerationChecker -- permintaan langsung pengguna, 22 Agustus 2026:
// "sistem bisa memblokir jika memasukkan link yang sensitif contoh nya
// link judol link 18+ dll". Dipakai BERSAMA oleh LinksHandler (tautan &
// blok link-in-bio) dan ProductHandler (URL eksternal produk) supaya satu
// sumber kebenaran, bukan dua implementasi independen yang bisa beda
// perilaku -- lihat wiring di routes.go (SATU instance dibagi ke keduanya,
// pola sama seperti EncryptionKey).
//
// Tiga lapis, diperiksa berurutan, berhenti di lapis pertama yang
// menentukan (murah ke mahal):
//
//  1. link_domain_verdicts -- cache keputusan PER DOMAIN. Kalau domain
//     tautan ini sudah pernah diputuskan (dikurasi admin manual ATAU hasil
//     klasifikasi AI sebelumnya, dari kreator MANA PUN), pakai ulang
//     keputusan itu tanpa cek apa pun lagi.
//  2. blocked_keywords -- domain belum pernah dilihat: cek kata kunci
//     terhadap URL+judul lengkap. Menangkap pola spam SEO judi online
//     ("judol") yang rutin ganti domain tapi kata kuncinya tetap.
//  3. Claude API (moderation.Client) -- HANYA domain baru & tidak cocok
//     kata kunci mana pun. Hasilnya DISIMPAN ke link_domain_verdicts
//     supaya domain yang sama dari kreator lain tidak memicu panggilan AI
//     lagi -- biaya & latensi AI cuma sekali per domain baru, bukan per
//     link.
//
// Fail-open kalau infrastruktur pemeriksaan sendiri bermasalah (query DB
// gagal, Claude API error/timeout/belum dikonfigurasi) -- SATU-SATUNYA
// jaminan keras di sini adalah dua lapis pertama yang deterministik & tanpa
// dependency luar; AI murni lapisan tambahan. Pola serupa soft-fail
// SMTP/S3/WhatsApp di CLAUDE.md (operasi sampingan tidak boleh
// menggagalkan aksi utama kreator), TAPI beda konsekuensi: soft-fail biasa
// berarti "abaikan sepenuhnya", di sini berarti "izinkan" -- karena
// blocklist tetap menjaring kasus yang sudah dikenal, kegagalan cuma
// kehilangan kemampuan mendeteksi domain BARU untuk request ini saja.
type LinkModerationChecker struct {
	DB *pgxpool.Pool
	AI *moderation.Client // boleh nil/APIKey kosong -- lapis AI dilewati
}

// ModerationResult -- Blocked=false berarti lolos (nilai zero value = lolos,
// aman dipakai tanpa inisialisasi eksplisit di jalur "tidak perlu dicek").
type ModerationResult struct {
	Blocked bool
	Message string
}

var moderationCategoryLabels = map[string]string{
	"judi_online":   "judi online",
	"konten_dewasa": "konten dewasa/pornografi",
	"lainnya":       "konten sensitif",
}

func blockedModerationResult(category string) ModerationResult {
	label, ok := moderationCategoryLabels[category]
	if !ok {
		label = moderationCategoryLabels["lainnya"]
	}
	return ModerationResult{
		Blocked: true,
		Message: fmt.Sprintf("Tautan ini terindikasi %s dan tidak diperbolehkan di Jeon.id.", label),
	}
}

// urlSeparatorPattern -- ditemukan lewat verifikasi langsung (curl ke API
// yang sedang jalan): kata kunci di blocked_keywords ditulis dgn SPASI
// ("slot gacor"), tapi URL sungguhan (slug SEO) memisahkan kata dengan
// tanda hubung/underscore/plus ("slot-gacor-terbaru"), BUKAN spasi --
// strings.Contains dengan kata kunci berspasi TIDAK PERNAH cocok terhadap
// URL asli, membuat keyword matching untuk URL efektif tidak berfungsi
// sama sekali (judul link masih cocok normal karena judul teks bebas boleh
// berspasi). Perbaikan: normalisasi pemisah URL jadi spasi SEBELUM
// pencocokan, supaya "slot-gacor-terbaru" jadi "slot gacor terbaru" dan
// cocok dgn kata kunci "slot gacor".
var urlSeparatorPattern = regexp.MustCompile(`[-_+]+`)

func normalizeForKeywordMatch(s string) string {
	return urlSeparatorPattern.ReplaceAllString(strings.ToLower(s), " ")
}

// normalizeModerationDomain -- host URL, huruf kecil, tanpa "www." & port,
// dipakai sebagai kunci link_domain_verdicts.domain supaya
// "https://Www.Contoh.com:443/x" dan "http://contoh.com/y" dianggap domain
// yang sama.
func normalizeModerationDomain(host string) string {
	host = strings.ToLower(host)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.TrimPrefix(host, "www.")
	return host
}

// Check -- rawURL SUDAH lolos validasi format (binding "http_url") di
// pemanggil, jadi url.Parse di sini praktis tidak pernah gagal; kalaupun
// gagal/Host kosong, fail-open (bukan tugas fungsi ini menegakkan format
// URL). title boleh kosong (mis. produk tanpa nama di titik pemanggilan
// tertentu) -- cuma memperkaya konteks kata kunci/AI, bukan syarat.
func (m *LinkModerationChecker) Check(ctx context.Context, rawURL, title string) ModerationResult {
	if m == nil || m.DB == nil || rawURL == "" {
		return ModerationResult{}
	}
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return ModerationResult{}
	}
	domain := normalizeModerationDomain(u.Host)

	var verdict, category string
	err = m.DB.QueryRow(ctx, `SELECT verdict, COALESCE(category, '') FROM link_domain_verdicts WHERE domain = $1`, domain).
		Scan(&verdict, &category)
	if err == nil {
		if verdict == "blocked" {
			return blockedModerationResult(category)
		}
		return ModerationResult{} // verdict "allowed" sudah pernah diputuskan -- lolos.
	}
	if err != pgx.ErrNoRows {
		return ModerationResult{} // query gagal -- fail-open, jangan blokir kreator gara-gara masalah infra kita.
	}

	// Domain belum pernah dilihat: cek kata kunci terhadap URL+judul.
	haystack := normalizeForKeywordMatch(rawURL + " " + title)
	rows, err := m.DB.Query(ctx, `SELECT keyword, category FROM blocked_keywords`)
	if err == nil {
		type match struct{ keyword, category string }
		var hit *match
		for rows.Next() {
			var kw, cat string
			if scanErr := rows.Scan(&kw, &cat); scanErr == nil && strings.Contains(haystack, kw) {
				hit = &match{kw, cat}
				break
			}
		}
		rows.Close()
		if hit != nil {
			m.cacheVerdict(ctx, domain, "blocked", hit.category, "keyword", "cocok kata kunci: "+hit.keyword)
			return blockedModerationResult(hit.category)
		}
	}

	// Lapis terakhir: AI, hanya kalau dikonfigurasi. Timeout SENDIRI
	// (tidak ikut ctx pemanggil apa adanya) supaya durasinya bisa
	// diprediksi terlepas dari sisa waktu ctx pemanggil, dan supaya jalur
	// simpan link tidak pernah menunggu lebih dari ini untuk lapis AI.
	if m.AI != nil {
		aiCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		v, aiErr := m.AI.Classify(aiCtx, rawURL, title)
		cancel()
		if aiErr == nil {
			if v.Blocked {
				m.cacheVerdict(ctx, domain, "blocked", v.Category, "ai", v.Reason)
				return blockedModerationResult(v.Category)
			}
			m.cacheVerdict(ctx, domain, "allowed", "", "ai", v.Reason)
		}
		// aiErr != nil: fail-open diam-diam, SENGAJA tidak di-cache supaya
		// domain ini dicoba diklasifikasi ulang di kesempatan berikutnya
		// (bukan "allowed" permanen gara-gara satu kegagalan sesaat).
	}

	return ModerationResult{}
}

// cacheVerdict -- best-effort: kegagalan menyimpan cache TIDAK membatalkan
// keputusan blokir/izin yang sudah diambil untuk request ini, cuma berarti
// domain ini akan dicek ulang dari awal di kesempatan berikutnya.
func (m *LinkModerationChecker) cacheVerdict(ctx context.Context, domain, verdict, category, source, reason string) {
	var categoryVal any
	if category != "" {
		categoryVal = category
	}
	_, _ = m.DB.Exec(ctx, `
		INSERT INTO link_domain_verdicts (id, domain, verdict, category, source, reason, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now(), now())
		ON CONFLICT (domain) DO UPDATE SET verdict = $3, category = $4, source = $5, reason = $6, updated_at = now()
	`, uuid.NewString(), domain, verdict, categoryVal, source, reason)
}
