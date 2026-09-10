package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/dhowden/tag"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/imageconv"
	"github.com/jeonme/api/internal/queue"
	"github.com/jeonme/api/internal/storage"
)

// LinksHandler mengimplementasikan CRUD tautan (REQ-F-202), nonaktifkan-
// sementara-tanpa-hapus (REQ-F-203), dan blok konten baru (No.77, Sprint 9:
// video embed, formulir kontak, FAQ) -- semuanya baris di tabel links yang
// sama, dibedakan lewat block_type ('link' = tautan biasa, default).
// Queue boleh nil (mis. REDIS_URL tidak valid saat startup) -- notifikasi
// formulir kontak akan dilewati dengan log peringatan, sama seperti pola
// soft-fail CheckoutHandler.
type LinksHandler struct {
	DB      *pgxpool.Pool
	Queue   *asynq.Client
	RDB     *redis.Client
	Storage *storage.Client
	// Moderation -- permintaan langsung pengguna, 22 Agustus 2026: blokir
	// tautan judi online/18+, lihat catatan lengkap di
	// LinkModerationChecker (moderation.go). Diwiring di routes.go, dibagi
	// dengan ProductHandler.
	Moderation *LinkModerationChecker
}

func NewLinksHandler(db *pgxpool.Pool, queueClient *asynq.Client, rdb *redis.Client, s3 *storage.Client) *LinksHandler {
	return &LinksHandler{DB: db, Queue: queueClient, RDB: rdb, Storage: s3}
}

// invalidatePageCacheByID — sama seperti invalidateUserPageCache (cache.go),
// tapi tautan bisa berada di halaman UTAMA (cache "page:<username>") ATAU
// halaman TAMBAHAN No.98 (cache "page-slug:<username>:<slug>") -- Update/Delete/Unlock
// bekerja untuk tautan di halaman MANA PUN milik kreator (lihat komentar
// ownsLink di bawah), jadi perlu resolusi cache key yang benar dari pageID,
// tidak boleh asumsi selalu halaman utama.
func (h *LinksHandler) invalidatePageCacheByID(ctx context.Context, pageID string) {
	if h.RDB == nil {
		return
	}
	var username string
	var isPrimary bool
	var slug *string
	if err := h.DB.QueryRow(ctx, `
		SELECT u.username, p.is_primary, p.slug FROM pages p JOIN users u ON u.id = p.user_id WHERE p.id = $1
	`, pageID).Scan(&username, &isPrimary, &slug); err != nil {
		return
	}
	if isPrimary {
		h.RDB.Del(ctx, "page:"+username)
	} else if slug != nil {
		h.RDB.Del(ctx, "page-slug:"+username+":"+*slug)
	}
}

// invalidateLinkCache — dipakai handler yang cuma punya linkID (Update/
// Delete), mencari page_id-nya dulu lalu delegasi ke invalidatePageCacheByID.
func (h *LinksHandler) invalidateLinkCache(ctx context.Context, linkID string) {
	var pageID string
	if err := h.DB.QueryRow(ctx, `SELECT page_id FROM links WHERE id = $1`, linkID).Scan(&pageID); err == nil {
		h.invalidatePageCacheByID(ctx, pageID)
	}
}

type linkItem struct {
	ID         string          `json:"id"`
	Title      string          `json:"title"`
	URL        string          `json:"url"`
	Position   int             `json:"position"`
	IsActive   bool            `json:"is_active"`
	StartsAt   *time.Time      `json:"starts_at"`
	EndsAt     *time.Time      `json:"ends_at"`
	LockType   string          `json:"lock_type"`
	LockCode   string          `json:"lock_code"`
	LockMinAge *int            `json:"lock_min_age"`
	BlockType  string          `json:"block_type"`
	BlockData  json.RawMessage `json:"block_data"`
	// ClickCount -- redesign dashboard Tautan ala Linktree (referensi
	// tangkapan layar pengguna): jumlah klik NYATA dari analytics_events
	// (REQ-F-601) yang sudah tercatat sejak awal, sebelumnya tidak pernah
	// ditampilkan per-tautan di dashboard (cuma top-5 di Ringkasan/No.86).
	ClickCount int64 `json:"click_count"`
	// CustomIconURL -- permintaan langsung pengguna: gambar kustom per
	// tautan, MENGGANTIKAN ikon platform yang terdeteksi otomatis dari URL
	// (lihat lib/link-icons.ts sisi klien). Kosong berarti tetap pakai
	// deteksi otomatis seperti sebelumnya.
	CustomIconURL string `json:"custom_icon_url"`
	// IconKey -- permintaan langsung pengguna, 13 Agustus 2026: "memilih
	// icon untuk blok yang sudah disediakan dari web ini" -- kunci ke satu
	// entri lib/icon-library.ts (frontend, ratusan ikon lucide-react),
	// TERPISAH dari CustomIconURL (gambar hasil upload). Prioritas render
	// (lihat PagePreview.tsx): CustomIconURL > IconKey > deteksi otomatis
	// dari URL > ikon generik. Kosong berarti belum dipilih.
	IconKey string `json:"icon_key"`
	// IconColor -- permintaan langsung pengguna, 22 Agustus 2026: "bisa
	// mengubah warna yang kita inginkan untuk icon di blok daripada hanya
	// warna hitam saja" -- hex warna ("#rrggbb"), diterapkan sebagai CSS
	// inline style di IconKey/ikon deteksi otomatis (BUKAN CustomIconURL,
	// gambar hasil upload tidak bisa diberi warna ulang). Kosong berarti
	// ikut warna tema seperti sebelumnya (perilaku lama).
	IconColor string `json:"icon_color"`
	// IsFeatured/ThumbnailURL -- Modul "Featured Link" (permintaan langsung
	// pengguna, referensi "Featured Layout" Linktree sungguhan): tautan
	// tampil sebagai kartu thumbnail 16:9, bukan baris teks. ThumbnailURL
	// TERPISAH dari CustomIconURL (ikon bulat kecil) -- tujuan visualnya
	// beda, lihat migrasi 000064.
	IsFeatured   bool   `json:"is_featured"`
	ThumbnailURL string `json:"thumbnail_url"`
	// Description -- permintaan langsung pengguna, 24 Agustus 2026: template
	// "Dimas Dev" (kartu tautan ikon+judul+deskripsi+panah). Baris subjudul
	// OPSIONAL di bawah judul -- kosong ("") berarti tetap tampil sebagai
	// baris judul tunggal seperti sebelumnya (lihat renderLinkOrBlock,
	// PagePreview.tsx). Dipakai ulang untuk block_type "project_showcase"
	// sebagai paragraf deskripsi (bukan field terpisah di block_data) --
	// lihat migrasi 000077 kenapa ini kolom sendiri, bukan block_data.
	Description string `json:"description"`
}

// List mengembalikan seluruh tautan & blok konten milik kreator yang sedang
// login, urut posisi (satu daftar tercampur -- lihat komentar LinksHandler).
// lock_code disertakan (BUKAN disembunyikan) karena ini endpoint dashboard
// kreator sendiri -- dia yang membuat kodenya, wajar dia bisa melihatnya
// lagi untuk diedit.
func (h *LinksHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT l.id, l.title, l.url, l.position, l.is_active, l.starts_at, l.ends_at,
			COALESCE(l.lock_type, ''), l.lock_code, l.lock_min_age, l.block_type, l.block_data, l.custom_icon_url,
			l.icon_key, l.icon_color, l.is_featured, l.thumbnail_url, l.description,
			(SELECT COUNT(*) FROM analytics_events ae WHERE ae.link_id = l.id AND ae.event_type = 'click')
		FROM links l
		JOIN pages p ON p.id = l.page_id
		WHERE p.user_id = $1 AND p.is_primary = true
		ORDER BY l.position ASC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
		return
	}
	defer rows.Close()

	items := []linkItem{}
	for rows.Next() {
		var it linkItem
		if err := rows.Scan(&it.ID, &it.Title, &it.URL, &it.Position, &it.IsActive, &it.StartsAt, &it.EndsAt,
			&it.LockType, &it.LockCode, &it.LockMinAge, &it.BlockType, &it.BlockData, &it.CustomIconURL,
			&it.IconKey, &it.IconColor, &it.IsFeatured, &it.ThumbnailURL, &it.Description, &it.ClickCount); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type createLinkRequest struct {
	Title string `json:"title" binding:"required,max=100"`
	// URL -- audit keamanan 22 Agustus 2026: tag "url" (bukan "http_url")
	// menerima skema APA PUN yang punya Scheme non-kosong, termasuk
	// "javascript:"/"data:text/html;base64,..."/"vbscript:" -- dirender
	// langsung sebagai href tautan biasa di halaman publik (PagePreview.tsx),
	// jadi kreator jahat bisa membuat tautan yang mencuri token sesi
	// pengunjung lain yang login (localStorage) begitu diklik. "http_url"
	// (go-playground/validator, sudah bawaan, bukan tag kustom) memaksa
	// skema http/https saja -- pola sama diterapkan ke SEMUA field URL
	// tautan/blok/produk lain di file ini & product.go.
	URL string `json:"url" binding:"required,http_url,max=2048"`
	// Description -- lihat catatan lengkap di linkItem.Description.
	Description string `json:"description" binding:"omitempty,max=240"`
}

// Create — REQ-F-202. Tautan baru ditaruh di posisi paling akhir.
func (h *LinksHandler) Create(c *gin.Context) {
	var req createLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	userID := c.GetString("userID")

	// Timeout lebih longgar dari 5s dasar handler lain di file ini --
	// h.Moderation.Check bisa memanggil Claude API (dibatasi sendiri 5s,
	// lihat moderation.go) untuk domain yang belum pernah dilihat.
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if res := h.Moderation.Check(ctx, req.URL, req.Title); res.Blocked {
		c.JSON(http.StatusBadRequest, gin.H{"error": res.Message})
		return
	}

	var pageID string
	if err := h.DB.QueryRow(ctx, `SELECT id FROM pages WHERE user_id = $1 AND is_primary = true`, userID).Scan(&pageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "halaman belum siap"})
		return
	}

	var nextPosition int
	if err := h.DB.QueryRow(ctx,
		`SELECT COALESCE(MAX(position) + 1, 0) FROM links WHERE page_id = $1`, pageID,
	).Scan(&nextPosition); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung posisi tautan"})
		return
	}

	id := uuid.NewString()
	_, err := h.DB.Exec(ctx, `
		INSERT INTO links (id, page_id, title, url, position, is_active, description)
		VALUES ($1, $2, $3, $4, $5, true, $6)
	`, id, pageID, req.Title, req.URL, nextPosition, req.Description)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat tautan"})
		return
	}

	h.invalidatePageCacheByID(ctx, pageID)
	c.JSON(http.StatusCreated, linkItem{ID: id, Title: req.Title, URL: req.URL, Position: nextPosition, IsActive: true, BlockType: "link", BlockData: json.RawMessage("{}"), Description: req.Description})
}

// validVideoHosts -- No.77: "auto-embed" dibatasi ke YouTube/TikTok sesuai
// scope (bukan embed generik sembarang situs, yang butuh whitelist iframe
// jauh lebih hati-hati untuk keamanan).
func isValidVideoEmbedURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	host := strings.ToLower(u.Host)
	return strings.Contains(host, "youtube.com") || strings.Contains(host, "youtu.be") || strings.Contains(host, "tiktok.com")
}

// youtubeVideoIDPattern -- ID video YouTube SELALU 11 karakter
// alfanumerik/dash/underscore, dipakai memvalidasi hasil ekstraksi di
// deriveYoutubeThumbnail supaya tidak salah membangun URL thumbnail dari
// segmen path yang ternyata bukan ID video (mis. domain custom/typo).
var youtubeVideoIDPattern = regexp.MustCompile(`^[\w-]{11}$`)

// deriveYoutubeThumbnail -- Modul "Featured Link" (permintaan langsung
// pengguna, referensi "Featured Layout" Linktree sungguhan): thumbnail
// otomatis TANPA API key/panggilan keluar untuk tautan YouTube, memakai
// pola URL thumbnail publik YouTube (img.youtube.com/vi/<id>/hqdefault.jpg,
// selalu tersedia untuk video publik apa pun). Platform lain (Instagram,
// dst) TIDAK didukung di sini -- kreator unggah manual lewat
// UploadLinkThumbnail. Mendukung 3 bentuk URL YouTube: youtu.be/<id>,
// youtube.com/watch?v=<id>, youtube.com/shorts/<id>, youtube.com/embed/<id>.
func deriveYoutubeThumbnail(rawURL string) (string, bool) {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", false
	}
	host := strings.ToLower(u.Host)

	var id string
	switch {
	case strings.Contains(host, "youtu.be"):
		id = strings.Trim(u.Path, "/")
	case strings.Contains(host, "youtube.com"):
		switch {
		case u.Path == "/watch":
			id = u.Query().Get("v")
		case strings.HasPrefix(u.Path, "/shorts/"):
			id = strings.TrimPrefix(u.Path, "/shorts/")
		case strings.HasPrefix(u.Path, "/embed/"):
			id = strings.TrimPrefix(u.Path, "/embed/")
		}
	default:
		return "", false
	}

	// Path bisa punya segmen tambahan setelah ID (mis. "/shorts/<id>/"),
	// potong di karakter non-ID pertama.
	if i := strings.IndexAny(id, "/?&"); i != -1 {
		id = id[:i]
	}
	if !youtubeVideoIDPattern.MatchString(id) {
		return "", false
	}
	return fmt.Sprintf("https://img.youtube.com/vi/%s/hqdefault.jpg", id), true
}

// allowedMapsHosts -- permintaan langsung pengguna (referensi tangkapan
// layar fitur "Maps" Linktree): whitelist KETAT domain Google Maps saja --
// resolveMapsEmbedCoords melakukan permintaan HTTP KELUAR ke URL yang
// diberikan pengguna (untuk mengikuti redirect short link), jadi wajib
// dibatasi ketat supaya tidak jadi celah SSRF (server dipaksa memanggil
// alamat internal/sembarang). Dicek di URL AWAL maupun SETIAP hop redirect.
var allowedMapsHosts = map[string]bool{
	"maps.app.goo.gl": true,
	"goo.gl":          true,
	"www.google.com":  true,
	"google.com":      true,
	"maps.google.com": true,
}

func isAllowedMapsHost(host string) bool {
	return allowedMapsHosts[strings.ToLower(host)]
}

// mapsCoordPattern -- pola "@<lat>,<lng>,<zoom>z" SELALU ada di URL tempat
// Google Maps yang sudah selesai (baik hasil resolusi short link maupun
// ditempel langsung oleh pengguna), lihat komentar resolveMapsEmbedCoords.
var mapsCoordPattern = regexp.MustCompile(`@(-?\d+\.\d+),(-?\d+\.\d+),(?:\d+(?:\.\d+)?)z`)

// resolveMapsEmbedCoords -- permintaan langsung pengguna: ubah tautan
// berbagi Google Maps (termasuk short link maps.app.goo.gl) jadi koordinat
// lat/lng untuk ditanam sebagai peta interaktif di halaman publik TANPA
// API key berbayar -- trik resmi Google "output=embed" pada query
// "q=<lat>,<lng>" (dipakai lama sebelum Embed API berbayar ada, TERBUKTI
// masih berfungsi lewat verifikasi langsung: curl -L ke short link
// menghasilkan SATU redirect ke URL lengkap berisi "@lat,lng,zoom", & URL
// itu + "&output=embed" terbukti merespons 200 text/html embeddable).
// Short link diselesaikan lewat SATU permintaan HTTP mengikuti redirect,
// bukan parsing HTML apa pun -- lat/lng diambil murni dari pola URL hasil
// akhir, jadi tetap berfungsi walau Google mengubah isi halaman tempatnya.
func resolveMapsEmbedCoords(ctx context.Context, rawURL string) (lat, lng float64, err error) {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || !isAllowedMapsHost(u.Hostname()) {
		return 0, 0, errors.New("tautan harus berupa tautan berbagi Google Maps yang valid")
	}

	client := &http.Client{
		Timeout: 8 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if !isAllowedMapsHost(req.URL.Hostname()) {
				return errors.New("redirect ke domain di luar Google Maps tidak diizinkan")
			}
			if len(via) >= 5 {
				return errors.New("terlalu banyak redirect")
			}
			return nil
		},
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return 0, 0, errors.New("tautan tidak valid")
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		return 0, 0, errors.New("gagal membuka tautan Google Maps, coba lagi")
	}
	defer resp.Body.Close()

	match := mapsCoordPattern.FindStringSubmatch(resp.Request.URL.String())
	if match == nil {
		return 0, 0, errors.New("tidak bisa membaca koordinat dari tautan ini -- pastikan ini tautan berbagi LOKASI (bukan arah/pencarian) dari Google Maps")
	}
	lat, errLat := strconv.ParseFloat(match[1], 64)
	lng, errLng := strconv.ParseFloat(match[2], 64)
	if errLat != nil || errLng != nil {
		return 0, 0, errors.New("tidak bisa membaca koordinat dari tautan ini")
	}
	return lat, lng, nil
}

// allowedEmbedHosts -- Canvas Page Builder Fase 3, block_type "embed"
// (iframe generik dgn whitelist domain, permintaan langsung pengguna 8
// September 2026, provider dikonfirmasi via AskUserQuestion: Google Forms/
// Calendly/Spotify -- Google Maps SENGAJA TIDAK di sini, itu promosi
// block_type "maps" lama yang sudah py allowedMapsHosts sendiri, lihat
// catatan lengkap di plan). Pola PERSIS allowedMapsHosts di atas (exact-
// match map, BUKAN strings.Contains seperti isValidVideoEmbedURL lama --
// itu SENGAJA tidak ditiru di sini, exact match jauh lebih ketat terhadap
// host tipuan spt "evil-calendly.com.attacker.net").
var allowedEmbedHosts = map[string]bool{
	"docs.google.com":  true, // Google Forms
	"calendly.com":     true,
	"open.spotify.com": true,
}

func isAllowedEmbedHost(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	return allowedEmbedHosts[strings.ToLower(u.Hostname())]
}

// validateBlockData -- No.77: aturan tiap block_type. contact_form sengaja
// tidak butuh field apa pun (form kontak selalu sama: nama/email/pesan,
// tidak ada kustomisasi field untuk versi awal).
// No.99 (Sprint 14): heading/text/image ditambah untuk builder landing page
// blok manual (TANPA "Create with AI" -- lihat catatan lingkup di migrasi
// 000030). "button" TIDAK butuh validasi block_data khusus -- memakai ulang
// kolom title/url yang sudah ada di links, sama seperti tautan biasa, cuma
// dirender sebagai tombol CTA besar bukan baris daftar.
// "maps" (permintaan langsung pengguna): resolusi koordinat (kalau embed=
// true) TERJADI SEBELUM fungsi ini dipanggil (lihat CreateBlock/Update,
// butuh context untuk permintaan HTTP keluar) -- di sini cuma memastikan
// strukturnya masuk akal.
// "accordion" (permintaan langsung pengguna, 12 Agustus 2026: "kalau saat
// menambahkan layout perlu menambahkan tipe blok baru... terutama blok
// yang bisa diklik lalu keluar text bukan hanya untuk faq saja") --
// interaksi klik-untuk-buka SATU item (bukan daftar tanya-jawab seperti
// "faq"), judulnya pakai kolom title yang sudah ada di links (sama seperti
// tautan biasa), block_data cuma butuh `text` (isi yang muncul saat
// diklik) -- makanya bentuknya SAMA PERSIS dengan "heading"/"text" di
// case ini, cuma beda block_type supaya frontend tahu harus dirender
// sebagai accordion (lihat renderLinkOrBlock, PagePreview.tsx -- dipakai
// ulang lewat FaqBlock dengan array 1 item, title kosong).
// maxCatalogDepth/maxCatalogItemBlocks/allowedCatalogEmbeddedBlockTypes --
// permintaan langsung pengguna, 27 Agustus 2026: "saya mau di blok katalog
// bisa menambahkan semua blok yang sudah ada di web ini di dalam katalog,
// dan juga sub blok ini bisa lebih dari 2, 3 untuk user premium" (contoh:
// Perumahan -> Tipe A -> [galeri foto ATAU blok lain apa saja]). Tiap item
// katalog sekarang boleh punya `blocks[]` opsional -- daftar blok TERTANAM
// (bentuknya SAMA seperti blok biasa: id+block_type+title+url?+
// description?+block_data), divalidasi lewat validateBlockData ITU SENDIRI
// secara rekursif (bukan sistem validasi terpisah) karena block_type
// "catalog" boleh muncul lagi sebagai blok tertanam -- begitulah nesting
// bertingkat-tingkat dicapai, tanpa konsep "children" terpisah sama sekali.
//
// Cakupan v1 (dikonfirmasi lewat AskUserQuestion): HANYA block_type yang
// TIDAK butuh endpoint upload file sendiri boleh ditanam -- text/faq/video/
// maps/catalog. gallery/audio/file/project_showcase BELUM didukung sebagai
// blok tertanam (butuh skema upload baru yang jauh lebih kompleks: key
// storage per item+blok, findCatalogItem jadi pencarian rekursif, dst --
// menyusul di iterasi berikutnya kalau dibutuhkan). Foto multi-gambar
// tetap terlayani lewat field `images` yang SUDAH ada per item (di luar
// mekanisme blocks[] ini sama sekali).
//
// Gratis vs Premium (dikonfirmasi lewat AskUserQuestion): gratis boleh
// menanam SEMUA tipe di atas KECUALI "catalog" (jadi tetap persis 2
// tingkat seperti sebelumnya: blok -> daftar item -> detail item, detail
// boleh berisi teks/FAQ/video/maps apa saja, tapi TIDAK BOLEH ada katalog
// baru lagi di dalamnya). Premium boleh menanam "catalog" lagi di dalam
// blocks[], sehingga bisa terus bercabang lebih dalam. Pengecekan Premium
// SENGAJA dilakukan di HANDLER (CreateBlock/Update/CreateBlockForPage),
// BUKAN di sini -- fungsi ini murni pengecekan struktur (pure, tanpa akses
// DB), konsisten dengan validateBlockData yang sudah ada.
//
// maxCatalogDepth=5 -- batas MUTLAK tetap berlaku bahkan untuk Premium
// (dicek DI SINI, bukan cuma di handler, supaya payload yang sangat dalam
// gagal cepat sebelum pemrosesan lain) supaya halaman publik tidak jadi
// sangat berat/berantakan -- contoh 5 tingkat: blok Katalog paling atas
// (tingkat 1) -> detail item "Tipe A" (tingkat 2) -> blok katalog
// tertanam "Unit" (tingkat 3) -> detail "Unit 1" (tingkat 4) -> blok
// katalog tertanam lagi (tingkat 5, TIDAK BOLEH ada blok katalog lagi di
// dalam detail tingkat 5).
const maxCatalogDepth = 5
const maxCatalogItemBlocks = 10

var allowedCatalogEmbeddedBlockTypes = map[string]bool{
	"text":    true,
	"faq":     true,
	"video":   true,
	"maps":    true,
	"catalog": true,
}

// maxBuilderDepth/maxBuilderContainerChildren/minBuilderColumns/
// maxBuilderColumns/allowedBuilderEmbeddedBlockTypes -- Canvas Page
// Builder (migrasi 000096, mode edit kedua bergaya Lynk.id, permintaan
// langsung pengguna 7 September 2026, dua screenshot Lynk.id). Blok root
// Section/Column/dst TETAP baris `links` biasa (position/is_active/
// block_type/block_data apa adanya, lihat komentar 000096), isi DI DALAM
// Section/Column disimpan sbg `children[]` tertanam di block_data-nya
// sendiri -- bentuk PERSIS EmbeddedCatalogBlock, generalisasi pola
// "catalog" (blocks[] di atas) ke dua tipe kontainer baru. SENGAJA dua
// allowlist & dua depth-cap TERPISAH dari catalog (bukan digabung ke
// allowedCatalogEmbeddedBlockTypes/maxCatalogDepth) -- Section/Column
// SALING rekursif tapi TIDAK cross-nest dengan "catalog" di v1, supaya
// tidak menambah matriks validasi/premium-gate gabungan sejak awal.
const maxBuilderDepth = 4
const maxBuilderContainerChildren = 30
const minBuilderColumns = 2
const maxBuilderColumns = 4

var allowedBuilderEmbeddedBlockTypes = map[string]bool{
	"text":    true,
	"button":  true,
	"divider": true,
	"section": true,
	"column":  true,
	// Fase 2 (permintaan langsung pengguna 8 September 2026, "kerjakan
	// penuh sekalian root + bersarang"): keenam tipe MEDIA/INFORMATION/
	// OTHERS baru, semuanya boleh ditanam di dalam Section/Column, TIDAK
	// dibatasi root-only -- lihat resolveBuilderBlockData (path-walking
	// upload gambar sudah mendukung kedalaman berapa pun).
	"video":       true,
	"faq":         true,
	"gallery":     true,
	"image":       true,
	"video_image": true,
	"embed_link":  true,
	// Fase 3 (permintaan langsung pengguna 8 September 2026): 4 tipe baru,
	// SEMUA boleh root maupun bersarang -- TIDAK ada requirement upload/
	// fetch server-side per-node spt Maps (lihat CATATAN "maps" TIDAK ada
	// di sini: block_type itu ROOT-ONLY di Fase 3 karena
	// resolveMapsEmbedCoords cuma dipanggil utk request block ROOT,
	// SENGAJA belum ikut di-path-walk ke block_data bersarang -- lihat
	// plan Fase 3 utk detail lengkap. Root tidak butuh entry di allowlist
	// ini sama sekali, allowlist ini KHUSUS anak tertanam Section/Column).
	"countdown":    true,
	"list":         true,
	"image_slider": true,
	"embed":        true,
	// "produk" -- permintaan langsung pengguna 10 September 2026, boleh
	// ditanam di Section/Column (TIDAK root-only spt "maps" -- tidak ada
	// keterbatasan resolusi server-side serupa utk tipe ini).
	"produk": true,
}

func validateBlockData(blockType string, data map[string]any) (string, bool) {
	return validateBlockDataAtDepth(blockType, data, 1)
}

// catalogHasNestedCatalog -- dipanggil dari HANDLER (CreateBlock/Update/
// CreateBlockForPage, yang punya akses DB) SETELAH validateBlockData
// (struktur) lolos, untuk menentukan apakah payload katalog ini perlu
// gerbang Premium (lihat catatan lengkap di atas validateBlockDataAtDepth).
// Cukup mengecek ADA-TIDAKNYA block_type "catalog" di mana pun di dalam
// blocks[] tiap item -- kalau ada SATU saja, itu sudah berarti kreator
// menaruh minimal 1 tingkat nesting tambahan (di luar 2 tingkat gratis),
// tidak perlu tahu SEBERAPA dalam nesting-nya (itu urusan maxCatalogDepth
// di atas, sudah dijamin pure validator).
func catalogHasNestedCatalog(items []any) bool {
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		blocks, _ := item["blocks"].([]any)
		for _, rawBlock := range blocks {
			block, ok := rawBlock.(map[string]any)
			if !ok {
				continue
			}
			if blockType, _ := block["block_type"].(string); blockType == "catalog" {
				return true
			}
		}
	}
	return false
}

// checkCatalogPremiumGate -- helper bersama dipanggil dari ketiga call site
// validateBlockData (CreateBlock/Update/CreateBlockForPage) SETELAH
// validasi struktur lolos, SEBELUM data disimpan. Mengembalikan pesan
// error (kalau ada) supaya caller cukup satu baris `if msg, ok :=
// checkCatalogPremiumGate(...); !ok { ... }`.
func checkCatalogPremiumGate(ctx context.Context, db *pgxpool.Pool, userID, blockType string, blockData map[string]any) (string, bool) {
	if blockType != "catalog" {
		return "", true
	}
	items, _ := blockData["items"].([]any)
	if !catalogHasNestedCatalog(items) {
		return "", true
	}
	if !isPremiumUser(ctx, db, userID) {
		return "menaruh blok Katalog di dalam item katalog (drill-down lebih dalam) khusus kreator Premium -- upgrade dulu di Pengaturan > Langganan", false
	}
	return "", true
}

// collectBuilderProductIDs -- PURE, rekursif menyusuri bentuk pohon
// Section/Column PERSIS sama seperti validateBuilderChildren (children[]/
// columns[]), tapi tujuannya MENGUMPULKAN product_id, bukan memvalidasi
// struktur -- dipanggil SETELAH validateBlockDataAtDepth memastikan
// bentuknya benar (lihat checkBuilderProductOwnership di bawah).
func collectBuilderProductIDs(blockType string, data map[string]any) []string {
	var ids []string
	if blockType == "produk" {
		if productID, _ := data["product_id"].(string); strings.TrimSpace(productID) != "" {
			ids = append(ids, productID)
		}
	}
	if rawChildren, ok := data["children"].([]any); ok {
		for _, rawChild := range rawChildren {
			child, ok := rawChild.(map[string]any)
			if !ok {
				continue
			}
			childType, _ := child["block_type"].(string)
			childData, _ := child["block_data"].(map[string]any)
			ids = append(ids, collectBuilderProductIDs(childType, childData)...)
		}
	}
	if rawColumns, ok := data["columns"].([]any); ok {
		for _, rawCol := range rawColumns {
			col, ok := rawCol.(map[string]any)
			if !ok {
				continue
			}
			// Kolom sendiri bukan node ber-block_type (cuma widthPercent+
			// children) -- blockType "" tidak akan pernah cocok "produk" di
			// pemanggilan rekursif ini, jadi cabang children[] di atas yang
			// benar-benar jalan di children MILIK kolom ini.
			ids = append(ids, collectBuilderProductIDs("", col)...)
		}
	}
	return ids
}

// checkBuilderProductOwnership -- permintaan langsung pengguna 10
// September 2026 (blok "produk", Canvas Page Builder): product_id yang
// ditaruh di blok manapun (ROOT ataupun bersarang di kedalaman berapa pun
// dalam Section/Column) WAJIB milik kreator yang sedang login -- kalau
// tidak, siapa pun bisa menaruh (lengkap dengan tombol Beli-nya!) produk
// KREATOR LAIN di halamannya sendiri. checkCatalogPremiumGate (pola yang
// sudah ada di atas) TIDAK cukup dipakai ulang di sini -- gerbang itu
// cuma mengecek block_type ROOT, sedangkan blok "produk" pada umumnya
// ditanam DI DALAM root bertipe "section"/"column" (root-nya BUKAN
// "produk"), jadi perlu penyusuran rekursif sendiri
// (collectBuilderProductIDs) lalu SATU query memverifikasi semuanya
// sekaligus. Dipanggil dari 3 tempat yang sama dgn checkCatalogPremiumGate
// (CreateBlock/UpdateLink/CreateExtraPageBlock).
func checkBuilderProductOwnership(ctx context.Context, db *pgxpool.Pool, userID, blockType string, blockData map[string]any) (string, bool) {
	ids := collectBuilderProductIDs(blockType, blockData)
	if len(ids) == 0 {
		return "", true
	}
	uniqueIDs := map[string]bool{}
	for _, id := range ids {
		uniqueIDs[id] = true
	}
	idList := make([]string, 0, len(uniqueIDs))
	for id := range uniqueIDs {
		idList = append(idList, id)
	}
	var count int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM products WHERE id = ANY($1::uuid[]) AND user_id = $2`, idList, userID).Scan(&count); err != nil {
		return "gagal memverifikasi kepemilikan produk", false
	}
	if count != len(idList) {
		return "produk yang dipilih tidak ditemukan atau bukan milik kamu", false
	}
	return "", true
}

// validateBlockDataAtDepth -- lihat catatan lengkap di atas fungsi ini
// (maxCatalogDepth dkk). `depth` HANYA relevan untuk block_type "catalog"
// (dimulai dari 1 di validateBlockData) -- tipe lain mengabaikannya
// sepenuhnya, tetap identik dengan validateBlockData yang lama.
func validateBlockDataAtDepth(blockType string, data map[string]any, depth int) (string, bool) {
	switch blockType {
	case "video":
		// Canvas Page Builder Fase 2 (permintaan langsung pengguna 8
		// September 2026): requirement "wajib diisi di depth==1" DIHAPUS --
		// pola PERSIS relaksasi "heading"/"text" Fase 1, dgn alasan yang
		// SAMA: form dashboard yang sudah ada (`blockVideoUrl.trim()` check,
		// dashboard/links/page.tsx) MASIH menegakkan wajib isi di sisi
		// KLIEN sebelum submit, jadi pengguna form lama TIDAK terpengaruh.
		// Ini membuka jalur shell-first (buat kosong dulu, isi belakangan
		// lewat klik-utk-edit di kanvas builder) baik di ROOT maupun
		// tertanam di dalam Section/Column -- sebelumnya cuma tertanam
		// (lewat CatalogBlocksEditor/BlockDrilldownEditor) yang boleh
		// kosong. video_url yang TERISI tetap wajib valid YouTube/TikTok,
		// di semua depth, tidak berubah.
		videoURL, _ := data["video_url"].(string)
		if videoURL != "" && !isValidVideoEmbedURL(videoURL) {
			return "video_url wajib diisi dengan tautan YouTube atau TikTok yang valid", false
		}
	case "faq":
		// Fase 2 -- requirement kelengkapan di depth==1 DIHAPUS, alasan SAMA
		// seperti "video" di atas: form dashboard (`items.length === 0`
		// check, dashboard/links/page.tsx) sudah menyaring baris
		// kosong/tidak lengkap sebelum submit, jadi melonggarkan di sini
		// aman utk form lama. Sebelumnya depth>1 (blok FAQ tertanam) SUDAH
		// longgar (autosave onBlur per field, PATCH perantara question
		// terisi/answer kosong harus tetap lolos) -- sekarang depth==1
		// (termasuk shell-first ROOT builder) ikut longgar dengan alasan
		// yang sama persis, cukup satu aturan utk semua depth.
		items, ok := data["items"].([]any)
		if !ok {
			items = []any{}
		}
		for _, raw := range items {
			if _, ok := raw.(map[string]any); !ok {
				return "setiap item FAQ wajib berupa objek", false
			}
		}
	case "accordion":
		// depth>1 -- blok accordion tertanam boleh kosong dulu (pola sama
		// seperti video/faq di atas), diisi belakangan lewat textarea
		// inline di CatalogBlocksEditor.
		text, _ := data["text"].(string)
		if depth == 1 && strings.TrimSpace(text) == "" {
			return "isi teks blok ini", false
		}
	case "heading", "text":
		// Canvas Page Builder (migrasi 000096, permintaan langsung pengguna
		// 7 Sept 2026) menambah jalur pembuatan BARU utk "text": shell
		// kosong dulu (pola SAMA seperti divider/button/section/column di
		// bawah), diisi belakangan lewat klik-utk-edit langsung di kanvas --
		// BUKAN form wajib-isi-dulu ala dashboard/links/page.tsx (form itu
		// MASIH menegakkan wajib isi di sisi KLIEN sendiri sebelum submit,
		// lihat `blockText.trim()` di sana, jadi pengguna form lama tidak
		// terpengaruh perubahan ini). Requirement "wajib diisi di depth==1"
		// yang tadinya berlaku bertiga dengan "accordion" SENGAJA dihapus
		// khusus di sini -- "accordion" tetap pakai case terpisah di atas
		// dengan requirement lama utuh.
	case "image":
		// Fase 2 (permintaan langsung pengguna 8 September 2026, "sertakan
		// foto tunggal juga"): SEBELUMNYA satu-satunya case yang TIDAK punya
		// relaksasi depth sama sekali -- image_url wajib valid di SEMUA
		// depth, termasuk shell kosong. Diubah permisif SEPERTI "gallery" di
		// bawah (opsional, divalidasi HANYA kalau diisi) -- blok dibuat
		// kosong dulu lewat CreateBlock/Add Component, foto diunggah
		// belakangan lewat UploadMediaImage (bukan dikirim mentah). Tidak
		// ada pemanggil backend lain yang bergantung pada image_url SELALU
		// terisi utk block_type ini (dicek: tidak pernah punya endpoint
		// upload atau tile dashboard sebelum Fase 2).
		if imageURL, ok := data["image_url"].(string); ok && imageURL != "" {
			u, err := url.Parse(imageURL)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
				return "image_url wajib berupa URL gambar yang valid", false
			}
		}
	case "maps":
		if embed, ok := data["embed"]; ok {
			if _, isBool := embed.(bool); !isBool {
				return "embed wajib berupa true/false", false
			}
		}
	case "produk":
		// "produk" -- Canvas Page Builder, permintaan langsung pengguna 10
		// September 2026 ("harusnya ada blok produk"): menampilkan SATU
		// produk kreator di lokasi bebas dalam layout (beda dari grid
		// produk otomatis Halaman Toko). Shell-first sama seperti blok
		// lain -- product_id OPSIONAL & boleh kosong (blok dibuat dulu
		// lewat "Tambah Komponen", dipilih/dibuat belakangan lewat kanvas),
		// cukup wajib bertipe string kalau field-nya ADA di payload.
		// Validasi KEPEMILIKAN (product_id ini benar milik kreator yang
		// login) SENGAJA TIDAK di sini -- fungsi ini PURE tanpa akses DB --
		// lihat checkBuilderProductOwnership di bawah, dipanggil terpisah
		// dari handler (CreateBlock/UpdateLink/CreateExtraPageBlock)
		// setelah validasi struktur ini lolos.
		if raw, ok := data["product_id"]; ok {
			if _, isStr := raw.(string); !isStr {
				return "product_id wajib berupa teks", false
			}
		}
	case "gallery", "image_slider":
		// "gallery" -- hasil analisa galeri tema kompetitor (17 Agustus
		// 2026, folder theme/: template portofolio/wisata s.id memakai grid
		// multi-foto yang belum ada padanannya di Jeonme, blok "image" lama
		// cuma 1 foto per blok). "images" divalidasi longgar di sini (boleh
		// kosong -- blok baru dibuat DULU lewat CreateBlock lalu fotonya
		// ditambah satu-satu lewat UploadGalleryImage, pola sama seperti
		// custom_icon_url yang upload-only terpisah dari create), tapi kalau
		// TERISI setiap entri wajib URL http(s) valid (jaga-jaga endpoint ini
		// juga dipakai utk PATCH block_data manual).
		//
		// "image_slider" -- Canvas Page Builder Fase 3 (permintaan langsung
		// pengguna 8 September 2026): block_data BENAR-BENAR IDENTIK dengan
		// "gallery" (array `images`) -- satu-satunya beda adalah RENDER
		// publiknya (carousel geser, bukan grid statis, lihat renderBuilderNode
		// PagePreview.tsx), jadi validasi & endpoint upload (UploadGalleryImage/
		// DeleteGalleryImage) sengaja DIPAKAI ULANG APA ADANYA lewat case
		// gabungan ini, bukan diduplikasi.
		if raw, ok := data["images"]; ok {
			images, isSlice := raw.([]any)
			if !isSlice {
				return "images wajib berupa daftar URL", false
			}
			for _, img := range images {
				urlStr, isStr := img.(string)
				u, err := url.Parse(urlStr)
				if !isStr || err != nil || (u.Scheme != "http" && u.Scheme != "https") {
					return "setiap foto galeri wajib URL yang valid", false
				}
			}
		}
	case "video_image":
		// "video_image" -- Canvas Page Builder Fase 2 (permintaan langsung
		// pengguna 8 September 2026, kategori MEDIA "Video+Image"): dua
		// field independen, KEDUANYA opsional di semua depth (shell-first,
		// sama filosofi "gallery"/"image" di atas) -- video_url diisi lewat
		// PATCH block_data biasa (pola sama field lain di builder),
		// image_url diisi lewat UploadMediaImage (pola sama "image"). Tidak
		// ada requirement salah satu HARUS terisi -- kreator bisa mengisi
		// video dulu, foto belakangan, atau sebaliknya.
		if videoURL, ok := data["video_url"].(string); ok && videoURL != "" && !isValidVideoEmbedURL(videoURL) {
			return "video_url wajib diisi dengan tautan YouTube atau TikTok yang valid", false
		}
		if imageURL, ok := data["image_url"].(string); ok && imageURL != "" {
			u, err := url.Parse(imageURL)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
				return "image_url wajib berupa URL gambar yang valid", false
			}
		}
	case "embed_link":
		// "embed_link" -- Canvas Page Builder Fase 2 (kategori OTHERS "Embed
		// Link"): kartu link MANUAL (judul/deskripsi/URL pakai kolom `links`
		// yang sudah ada -- title/description/url, PERSIS pola
		// "project_showcase" -- TIDAK ada fetch metadata server sama
		// sekali, kreator isi sendiri). Cuma thumbnail (block_data.image_url,
		// diisi lewat UploadMediaImage) yang perlu divalidasi di sini,
		// opsional & permisif sama seperti "image"/"video_image" di atas.
		// BEDA dari "project_showcase" yang mewajibkan `url` (CTA) terisi
		// di handler CreateBlock -- embed_link SENGAJA tidak mewajibkan url
		// sama sekali (kartu link generik, lebih longgar).
		if imageURL, ok := data["image_url"].(string); ok && imageURL != "" {
			u, err := url.Parse(imageURL)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
				return "image_url wajib berupa URL gambar yang valid", false
			}
		}
	case "countdown":
		// "countdown" -- Canvas Page Builder Fase 3 (kategori CONVERSION,
		// permintaan langsung pengguna 8 September 2026): shell-first sama
		// seperti video/faq/image di atas -- target_at OPSIONAL (blok bisa
		// dibuat kosong dulu, diisi belakangan lewat klik-utk-edit), tapi
		// kalau TERISI wajib timestamp RFC3339 yang valid (dihitung mundur
		// murni di klien, CountdownBlock.tsx, tidak ada job/cron server).
		if raw, ok := data["target_at"]; ok {
			targetAt, _ := raw.(string)
			if targetAt != "" {
				if _, err := time.Parse(time.RFC3339, targetAt); err != nil {
					return "target_at wajib berupa tanggal/waktu yang valid", false
				}
			}
		}
	case "list":
		// "list" -- Canvas Page Builder Fase 3 (kategori INFORMATION,
		// gabungan "Card/List/Testimony" dari peta jalan awal jadi SATU
		// block_type fleksibel, dikonfirmasi via AskUserQuestion 8 September
		// 2026): `style` menentukan tampilan (list/card/testimony di
		// renderBuilderNode), `items[]` opsional (shell-first, pola sama
		// "faq") -- tiap item kalau ADA cukup wajib berupa objek, TIDAK ada
		// requirement title/description/author terisi.
		//
		// Requirement "title wajib tidak kosong" SEMPAT ada di sini tapi
		// dibuang lewat verifikasi live (bukan cuma baca kode): tombol
		// "Tambah Item" (ListItemsEditor, BuilderLeftPanel.tsx) menambah
		// baris KOSONG dulu ({title:"", description:""}) baru diisi
		// belakangan lewat onBlur per field -- pola shell-first yang SAMA
		// PERSIS FaqItemsEditor -- requirement title di sini menolak PATCH
		// pertama itu dgn 400 SEBELUM sempat diisi sama sekali, membuat
		// baris baru tidak pernah benar-benar muncul di UI. TIDAK ada
		// upload foto per-item di Fase 3 (author cuma teks nama, lihat
		// catatan lingkup di plan).
		if raw, ok := data["style"]; ok {
			style, _ := raw.(string)
			if style != "list" && style != "card" && style != "testimony" {
				return `style wajib salah satu dari "list", "card", atau "testimony"`, false
			}
		}
		items, ok := data["items"].([]any)
		if !ok {
			items = []any{}
		}
		for _, raw := range items {
			if _, isMap := raw.(map[string]any); !isMap {
				return "setiap item wajib berupa objek", false
			}
		}
	case "embed":
		// "embed" -- Canvas Page Builder Fase 3 (kategori OTHERS, embed
		// iframe GENERIK dgn whitelist domain -- BEDA dari "embed_link"
		// Fase 2 yang cuma kartu link manual TANPA iframe sama sekali).
		// embed_url OPSIONAL (shell-first), tapi kalau TERISI wajib lolos
		// isAllowedEmbedHost (exact-match hostname, BUKAN strings.Contains
		// spt isValidVideoEmbedURL lama -- lihat catatan lengkap di fungsi
		// itu) supaya CSP frame-src (next.config.js) tidak pernah dilewati
		// provider yang tidak diizinkan.
		if raw, ok := data["embed_url"]; ok {
			embedURL, _ := raw.(string)
			if embedURL != "" && !isAllowedEmbedHost(embedURL) {
				return "embed_url wajib tautan dari provider yang didukung (Google Forms, Calendly, atau Spotify)", false
			}
		}
	case "audio":
		// "audio" -- hasil analisa yang sama: mockup "Music" (galeri tema
		// kompetitor 4 Agustus) menampilkan pemutar musik tertanam di bio,
		// Jeonme belum punya padanannya sama sekali. audio_url boleh kosong
		// saat blok baru dibuat (diisi lewat UploadAudio setelahnya, pola
		// sama seperti gallery di atas), tapi kalau terisi wajib URL valid.
		if raw, ok := data["audio_url"]; ok {
			audioURL, _ := raw.(string)
			if audioURL != "" {
				u, err := url.Parse(audioURL)
				if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
					return "audio_url wajib berupa URL yang valid", false
				}
			}
		}
	case "file":
		// "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
		// file pdf download". Pola SAMA PERSIS dengan "audio" di atas -- blok
		// boleh dibuat DULU dengan file_url kosong (diisi lewat UploadFile
		// setelahnya), tapi kalau file_url TERISI wajib URL valid.
		if raw, ok := data["file_url"]; ok {
			fileURL, _ := raw.(string)
			if fileURL != "" {
				u, err := url.Parse(fileURL)
				if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
					return "file_url wajib berupa URL yang valid", false
				}
			}
		}
	case "project_showcase":
		// "project_showcase" -- permintaan langsung pengguna, 24 Agustus 2026:
		// kartu "Project Unggulan" (contoh tangkapan layar template "Dimas
		// Dev") -- gambar + badge + judul (title, kolom yang sudah ada) +
		// deskripsi (kolom `description`, lihat linkItem) + CTA (url, kolom
		// yang sudah ada + block_data.cta_text sebagai label tombolnya, mis.
		// "Lihat studi kasus"). Cuma image_url yang perlu divalidasi di sini
		// (badge_text/cta_text bebas teks apa saja) -- pola SAMA PERSIS
		// dengan gallery/audio/file: blok boleh dibuat DULU dengan image_url
		// kosong (diisi lewat UploadShowcaseImage setelahnya), tapi kalau
		// TERISI wajib URL valid.
		if raw, ok := data["image_url"]; ok {
			imageURL, _ := raw.(string)
			if imageURL != "" {
				u, err := url.Parse(imageURL)
				if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
					return "image_url wajib berupa URL yang valid", false
				}
			}
		}
	case "catalog":
		// "catalog" -- permintaan langsung pengguna, 25 Agustus 2026: "blok
		// diklik -> muncul blok blok baru seperti ke page baru... misal nya
		// gini, ada blok Jenis Rumah ketika di klik akan tampil semua blok
		// dengan isi jenis jenis rumah yang ada dan keitka di klik masing
		// masing itu bisa menampilkan gambar dan juga deskripsi dan gambar
		// bisa multiple" -- drill-down 2 tingkat (daftar item -> detail
		// item), dikonfirmasi lewat AskUserQuestion tampil sebagai
		// penggantian ISI HALAMAN penuh (bukan overlay), lihat
		// CatalogTakeoverView (PagePreview.tsx).
		//
		// items[] BOLEH kosong saat blok dibuat (pola sama gallery/audio/
		// file: blok dibuat dulu, item ditambah lewat panel "Kelola
		// Katalog" di kartu blok) -- kalau TERISI, tiap item wajib id
		// (dibuat klien, string apa saja asal tidak kosong -- dipakai
		// UploadCatalogItemImage/DeleteCatalogItemImage di bawah untuk
		// menunjuk item mana yang diubah, TANPA perlu tabel DB terpisah)
		// & title tidak kosong; images (kalau ada) divalidasi format URL --
		// isinya sendiri SELALU diisi lewat upload (UploadCatalogItemImage),
		// tidak pernah dikirim mentah lewat JSON di sini.
		if depth > maxCatalogDepth {
			return fmt.Sprintf("katalog maksimal %d tingkat kedalaman", maxCatalogDepth), false
		}
		if raw, ok := data["items"]; ok {
			items, isSlice := raw.([]any)
			if !isSlice {
				return "items wajib berupa daftar", false
			}
			if len(items) > maxCatalogItems {
				return fmt.Sprintf("maksimal %d item per katalog", maxCatalogItems), false
			}
			seenIDs := map[string]bool{}
			for _, raw := range items {
				item, ok := raw.(map[string]any)
				if !ok {
					return "setiap item katalog wajib berupa objek", false
				}
				id, _ := item["id"].(string)
				title, _ := item["title"].(string)
				if strings.TrimSpace(id) == "" || strings.TrimSpace(title) == "" {
					return "setiap item katalog wajib punya id dan judul", false
				}
				if seenIDs[id] {
					return "id item katalog tidak boleh duplikat", false
				}
				seenIDs[id] = true
				if imagesRaw, ok := item["images"]; ok {
					images, isSlice := imagesRaw.([]any)
					if !isSlice {
						return "images pada item katalog wajib berupa daftar", false
					}
					for _, img := range images {
						imgURL, isStr := img.(string)
						u, err := url.Parse(imgURL)
						if !isStr || err != nil || (u.Scheme != "http" && u.Scheme != "https") {
							return "setiap foto item katalog wajib URL yang valid", false
						}
					}
				}
				// blocks[] -- lihat catatan lengkap di atas fungsi ini
				// (maxCatalogDepth dkk). Divalidasi REKURSIF lewat
				// validateBlockDataAtDepth ITU SENDIRI supaya block_type
				// "catalog" tertanam otomatis kena aturan yang SAMA persis
				// (termasuk batas kedalaman) tanpa duplikasi logika.
				if blocksRaw, ok := item["blocks"]; ok {
					blocks, isSlice := blocksRaw.([]any)
					if !isSlice {
						return "blocks pada item katalog wajib berupa daftar", false
					}
					if len(blocks) > maxCatalogItemBlocks {
						return fmt.Sprintf("maksimal %d blok tertanam per item katalog", maxCatalogItemBlocks), false
					}
					seenBlockIDs := map[string]bool{}
					for _, rawBlock := range blocks {
						block, ok := rawBlock.(map[string]any)
						if !ok {
							return "setiap blok tertanam item katalog wajib berupa objek", false
						}
						blockID, _ := block["id"].(string)
						blockTitle, _ := block["title"].(string)
						embeddedType, _ := block["block_type"].(string)
						if strings.TrimSpace(blockID) == "" || strings.TrimSpace(blockTitle) == "" {
							return "setiap blok tertanam item katalog wajib punya id dan judul", false
						}
						if seenBlockIDs[blockID] {
							return "id blok tertanam item katalog tidak boleh duplikat", false
						}
						seenBlockIDs[blockID] = true
						if !allowedCatalogEmbeddedBlockTypes[embeddedType] {
							return fmt.Sprintf("tipe blok %q belum bisa ditanam di dalam item katalog", embeddedType), false
						}
						// maps tertanam -- v1 sengaja TIDAK mendukung mode
						// tertanam (embed=true, butuh resolusi koordinat via
						// HTTP keluar yang belum diterapkan rekursif) --
						// cuma tautan langsung, sama seperti blok maps biasa
						// yang embed=false. url SENGAJA boleh kosong (pola
						// sama seperti video/faq/text di atas -- blok dibuat
						// dulu, tautan diisi belakangan lewat CatalogBlocksEditor),
						// TIDAK seperti blok maps TINGKAT ATAS yang formnya
						// sudah mewajibkan tautan diisi sebelum submit.
						embeddedData, _ := block["block_data"].(map[string]any)
						if embeddedData == nil {
							embeddedData = map[string]any{}
						}
						if embeddedType == "maps" {
							if embed, _ := embeddedData["embed"].(bool); embed {
								return "blok maps tertanam belum mendukung mode tertanam (embed) -- gunakan tautan langsung", false
							}
						}
						if msg, ok := validateBlockDataAtDepth(embeddedType, embeddedData, depth+1); !ok {
							return msg, false
						}
					}
				}
			}
		}
	case "section":
		// "section" -- wadah full-width, generalisasi pola "catalog" di
		// atas (lihat catatan lengkap di allowedBuilderEmbeddedBlockTypes).
		// children[] BOLEH kosong/tidak ada -- shell dibuat dulu lewat
		// "Add Component", diisi belakangan lewat kanvas.
		if depth > maxBuilderDepth {
			return fmt.Sprintf("section maksimal %d tingkat kedalaman", maxBuilderDepth), false
		}
		if msg, ok := validateBuilderChildren(data, depth); !ok {
			return msg, false
		}
	case "column":
		// "column" -- wadah N-kolom sejajar (2-4 kolom, lihat
		// minBuilderColumns/maxBuilderColumns), tiap kolom py children[]
		// sendiri (bentuk sama seperti children Section). columns[] BOLEH
		// kosong/tidak ada -- shell dibuat dulu, jumlah kolom dipilih
		// belakangan lewat kanvas.
		if depth > maxBuilderDepth {
			return fmt.Sprintf("column maksimal %d tingkat kedalaman", maxBuilderDepth), false
		}
		if raw, ok := data["columns"]; ok {
			columns, isSlice := raw.([]any)
			if !isSlice {
				return "columns wajib berupa daftar", false
			}
			if len(columns) > 0 && (len(columns) < minBuilderColumns || len(columns) > maxBuilderColumns) {
				return fmt.Sprintf("column wajib %d-%d kolom", minBuilderColumns, maxBuilderColumns), false
			}
			for _, rawCol := range columns {
				col, ok := rawCol.(map[string]any)
				if !ok {
					return "setiap kolom wajib berupa objek", false
				}
				if msg, ok := validateBuilderChildren(col, depth); !ok {
					return msg, false
				}
			}
		}
	}
	return "", true
}

// validateBuilderChildren -- helper bersama dipanggil dari case "section"
// (langsung pada data) dan case "column" (per entri columns[]) di
// validateBlockDataAtDepth, memvalidasi container["children"] (bentuk
// PERSIS EmbeddedCatalogBlock, TANPA mewajibkan title -- beda dari
// blocks[] item katalog yang title-nya memang dipakai sebagai label item
// yang tampak; blok Section/Column murni wadah konten, tidak butuh label
// per anak). children[] BOLEH kosong/tidak ada -- pola sama seperti
// items[]/blocks[] katalog di atas, shell kontainer dibuat dulu, diisi
// belakangan lewat kanvas.
func validateBuilderChildren(container map[string]any, depth int) (string, bool) {
	raw, ok := container["children"]
	if !ok {
		return "", true
	}
	children, isSlice := raw.([]any)
	if !isSlice {
		return "children wajib berupa daftar", false
	}
	if len(children) > maxBuilderContainerChildren {
		return fmt.Sprintf("maksimal %d blok per kontainer", maxBuilderContainerChildren), false
	}
	seenIDs := map[string]bool{}
	for _, rawChild := range children {
		child, ok := rawChild.(map[string]any)
		if !ok {
			return "setiap blok anak wajib berupa objek", false
		}
		childID, _ := child["id"].(string)
		childType, _ := child["block_type"].(string)
		if strings.TrimSpace(childID) == "" {
			return "setiap blok anak wajib punya id", false
		}
		if seenIDs[childID] {
			return "id blok anak tidak boleh duplikat", false
		}
		seenIDs[childID] = true
		if !allowedBuilderEmbeddedBlockTypes[childType] {
			return fmt.Sprintf("tipe blok %q belum bisa ditambahkan di sini", childType), false
		}
		childData, _ := child["block_data"].(map[string]any)
		if childData == nil {
			childData = map[string]any{}
		}
		if msg, ok := validateBlockDataAtDepth(childType, childData, depth+1); !ok {
			return msg, false
		}
	}
	return "", true
}

// builderPathSeg -- cermin PERSIS BuilderSeg (apps/web/lib/builder-blocks.ts):
// satu "hop" turun dari block_data baris `links` root ke node bersarang di
// dalam Section/Column. Dikirim FE sbg field form JSON-encoded ("path")
// berdampingan dgn file gambar di endpoint upload builder (Fase 2,
// permintaan langsung pengguna 8 September 2026: "kerjakan penuh sekalian
// root + bersarang", bukan root-only) -- array kosong/absen berarti baris
// ROOT itu sendiri (perilaku lama endpoint upload yang sudah ada, sebelum
// Fase 2, tetap identik).
type builderPathSeg struct {
	Kind  string `json:"kind"`
	ID    string `json:"id,omitempty"`
	Index int    `json:"index,omitempty"`
}

// resolveBuilderBlockData -- generalisasi Go dari resolveAt
// (builder-blocks.ts) KHUSUS utk menjangkau block_data SATU blok gambar
// (image/gallery/video_image/embed_link) di mana pun posisinya, root
// MAUPUN bersarang berapa tingkat pun di dalam Section/Column -- dipakai
// SEMUA endpoint upload/hapus gambar builder (UploadGalleryImage/
// DeleteGalleryImage yang sudah ada + UploadMediaImage/DeleteMediaImage
// baru), satu implementasi dipakai bersama, bukan disalin per endpoint.
//
// `rootData`/`rootBlockType` SUDAH di-decode dari block_data+block_type
// baris `links` ROOT (pemanggil query sekali di awal). path=[] berarti
// rootData ITU SENDIRI target-nya (baris root langsung py block_type
// gallery/image/dst, TANPA Section/Column pembungkus -- inilah kasus yang
// SUDAH berjalan sebelum Fase 2, harus tetap identik).
//
// Map yang dikembalikan adalah REFERENSI LANGSUNG (Go map = reference
// type) ke dalam struktur `rootData` yang sama -- memutasi field di
// dalamnya (mis. `data["image_url"] = url`) otomatis tercermin balik ke
// `rootData`, cukup di-marshal ULANG SEKALI oleh pemanggil setelah
// memanggil fungsi ini, tidak perlu jalan-jalan tulis-balik manual seperti
// findCatalogItem (yang bentuk datanya beda: array item vs pohon
// children/columns).
//
// path HARUS berakhir di segmen {kind:"child"} (menunjuk satu BLOK
// ber-block_type, satu-satunya tempat field gambar sungguhan bisa
// tersimpan) -- segmen {kind:"column"} valid di TENGAH path (melangkah ke
// SATU kolom lalu lanjut ke children-nya) tapi TIDAK valid sbg segmen
// TERAKHIR (kolom murni wadah widthPercent+children, bukan blok, tidak
// punya block_data/block_type sendiri -- lihat BuilderColumn di
// builder-blocks.ts).
func resolveBuilderBlockData(rootData map[string]any, rootBlockType string, path []builderPathSeg) (data map[string]any, blockType string, ok bool) {
	if len(path) == 0 {
		return rootData, rootBlockType, true
	}

	children, _ := rootData["children"].([]any)
	columns, _ := rootData["columns"].([]any)

	for i, seg := range path {
		switch seg.Kind {
		case "child":
			var found map[string]any
			for _, raw := range children {
				block, isMap := raw.(map[string]any)
				if !isMap {
					continue
				}
				if id, _ := block["id"].(string); id == seg.ID {
					found = block
					break
				}
			}
			if found == nil {
				return nil, "", false
			}
			bt, _ := found["block_type"].(string)
			if i == len(path)-1 {
				data, _ := found["block_data"].(map[string]any)
				if data == nil {
					data = map[string]any{}
					found["block_data"] = data
				}
				return data, bt, true
			}
			nested, _ := found["block_data"].(map[string]any)
			if nested == nil {
				return nil, "", false
			}
			children, _ = nested["children"].([]any)
			columns, _ = nested["columns"].([]any)
		case "column":
			if i == len(path)-1 {
				return nil, "", false
			}
			if seg.Index < 0 || seg.Index >= len(columns) {
				return nil, "", false
			}
			col, isMap := columns[seg.Index].(map[string]any)
			if !isMap {
				return nil, "", false
			}
			children, _ = col["children"].([]any)
			columns = nil
		default:
			return nil, "", false
		}
	}
	return nil, "", false
}

// parseBuilderPath -- baca "path" (JSON-encoded array builderPathSeg),
// opsional -- absen/kosong berarti path=[] alias baris ROOT langsung. Dicek
// dari DUA sumber: field form (endpoint upload, multipart, py file
// sekalian) ATAU query string (endpoint hapus, DELETE tanpa body). Dipisah
// jadi fungsi kecil supaya keempat endpoint upload/hapus gambar builder
// memanggil pola yang SAMA persis, bukan menyalin json.Unmarshal+
// error-handling empat kali.
func parseBuilderPath(c *gin.Context) ([]builderPathSeg, error) {
	raw := c.PostForm("path")
	if strings.TrimSpace(raw) == "" {
		raw = c.Query("path")
	}
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var path []builderPathSeg
	if err := json.Unmarshal([]byte(raw), &path); err != nil {
		return nil, err
	}
	return path, nil
}

type createBlockRequest struct {
	BlockType string         `json:"block_type" binding:"required,oneof=video contact_form faq heading text image button maps accordion gallery audio file project_showcase catalog section column divider video_image embed_link countdown list image_slider embed produk"`
	Title     string         `json:"title" binding:"required,max=100"`
	URL       string         `json:"url" binding:"omitempty,http_url,max=2048"`
	BlockData map[string]any `json:"block_data"`
	// Description -- lihat catatan lengkap di linkItem.Description. Dipakai
	// block_type "project_showcase" sebagai paragraf deskripsi.
	Description string `json:"description" binding:"omitempty,max=240"`
}

// CreateBlock — No.77 (Sprint 9): blok konten baru selain tautan biasa
// (video embed, formulir kontak, FAQ/accordion) -- baris products biasa di
// tabel links yang sama (pola identik bundel No.70: entitas baru TIDAK
// perlu tabel terpisah kalau cukup jadi varian baris yang sudah ada),
// ditaruh di posisi paling akhir dalam urutan yang SAMA dengan tautan biasa
// (satu daftar tercampur di halaman publik).
func (h *LinksHandler) CreateBlock(c *gin.Context) {
	var req createBlockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	if req.BlockData == nil {
		req.BlockData = map[string]any{}
	}
	if req.BlockType == "button" && req.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url wajib diisi untuk tombol CTA"})
		return
	}
	if req.BlockType == "maps" && req.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tautan Google Maps wajib diisi"})
		return
	}
	if req.BlockType == "project_showcase" && req.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url tujuan (CTA) wajib diisi untuk kartu project unggulan"})
		return
	}
	if msg, ok := validateBlockData(req.BlockType, req.BlockData); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	userID := c.GetString("userID")

	// Timeout lebih longgar dari handler lain (5s) -- blok "maps" dengan
	// embed=true melakukan SATU permintaan HTTP KELUAR ke Google Maps
	// (resolveMapsEmbedCoords) untuk mengikuti redirect short link, di atas
	// query DB biasa.
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	if msg, ok := checkCatalogPremiumGate(ctx, h.DB, userID, req.BlockType, req.BlockData); !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": msg})
		return
	}
	if msg, ok := checkBuilderProductOwnership(ctx, h.DB, userID, req.BlockType, req.BlockData); !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": msg})
		return
	}

	if res := h.Moderation.Check(ctx, req.URL, req.Title); res.Blocked {
		c.JSON(http.StatusBadRequest, gin.H{"error": res.Message})
		return
	}

	if req.BlockType == "maps" {
		if embed, _ := req.BlockData["embed"].(bool); embed {
			lat, lng, rerr := resolveMapsEmbedCoords(ctx, req.URL)
			if rerr != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": rerr.Error()})
				return
			}
			req.BlockData["embed_lat"] = lat
			req.BlockData["embed_lng"] = lng
		}
	}

	var pageID string
	if err := h.DB.QueryRow(ctx, `SELECT id FROM pages WHERE user_id = $1 AND is_primary = true`, userID).Scan(&pageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "halaman belum siap"})
		return
	}

	id, position, blockDataJSON, err := h.insertBlock(ctx, pageID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.invalidatePageCacheByID(ctx, pageID)
	c.JSON(http.StatusCreated, linkItem{
		ID: id, Title: req.Title, URL: req.URL, Position: position, IsActive: true,
		BlockType: req.BlockType, BlockData: blockDataJSON, Description: req.Description,
	})
}

// insertBlock -- logika inti INSERT blok (dipakai CreateBlock & CreateBlockForPage,
// No.99) supaya tidak duplikasi query hitung posisi + marshal block_data.
func (h *LinksHandler) insertBlock(ctx context.Context, pageID string, req createBlockRequest) (id string, position int, blockDataJSON []byte, err error) {
	if err = h.DB.QueryRow(ctx,
		`SELECT COALESCE(MAX(position) + 1, 0) FROM links WHERE page_id = $1`, pageID,
	).Scan(&position); err != nil {
		return "", 0, nil, errors.New("gagal menghitung posisi blok")
	}

	blockDataJSON, err = json.Marshal(req.BlockData)
	if err != nil {
		return "", 0, nil, errors.New("gagal menyimpan data blok")
	}

	id = uuid.NewString()
	if _, err = h.DB.Exec(ctx, `
		INSERT INTO links (id, page_id, title, url, position, is_active, block_type, block_data, description)
		VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8)
	`, id, pageID, req.Title, req.URL, position, req.BlockType, blockDataJSON, req.Description); err != nil {
		return "", 0, nil, errors.New("gagal membuat blok")
	}

	return id, position, blockDataJSON, nil
}

type updateLinkRequest struct {
	Title         *string `json:"title" binding:"omitempty,max=100"`
	URL           *string `json:"url" binding:"omitempty,http_url,max=2048"`
	IsActive      *bool   `json:"is_active"`
	StartsAt      *string `json:"starts_at"`
	EndsAt        *string `json:"ends_at"`
	ClearSchedule bool    `json:"clear_schedule"`
	// No.79 (Sprint 9): kunci tautan -- lock_type kosong ("") berarti tidak
	// terkunci. "age" butuh lock_min_age, "code" butuh lock_code, "subscribe"
	// tidak butuh keduanya (URL asli disembunyikan dari halaman publik,
	// baru dibuka lewat POST /links/:id/unlock).
	//
	// "sensitive" -- permintaan langsung pengguna, 20 Agustus 2026:
	// "tambahkan juga sensitive content supaya nanti tampil ke user ketika
	// mau akses". SAMA PERSIS pola "age" (murni klik persetujuan, tidak
	// ada verifikasi/field tambahan, lihat Unlock di bawah), BEDA hanya
	// pesan yang tampil ke pengunjung. Untuk block_type SELAIN "link"/
	// "button" (video/faq/maps/gallery/audio/accordion/text/contact_form),
	// dampaknya murni di frontend (PagePreview.tsx, SensitiveContentGate) --
	// block_data TETAP terkirim apa adanya di payload halaman publik (tidak
	// disembunyikan server-side seperti url tautan terkunci), karena ini
	// peringatan santun bukan gerbang keamanan sungguhan.
	LockType   *string `json:"lock_type" binding:"omitempty,oneof=age code subscribe sensitive"`
	LockCode   *string `json:"lock_code" binding:"omitempty,max=50"`
	LockMinAge *int    `json:"lock_min_age" binding:"omitempty,min=13,max=99"`
	ClearLock  bool    `json:"clear_lock"`
	// No.77: mengedit isi blok konten (mis. tautan video baru atau item FAQ)
	// -- divalidasi terhadap block_type baris yang SUDAH ada (tidak bisa
	// ganti block_type lewat endpoint ini, cuma isinya).
	BlockData map[string]any `json:"block_data"`
	// IsFeatured -- Modul "Featured Link". Thumbnail TIDAK ada di request
	// ini (beda dari field lain di struct ini) -- diisi OTOMATIS (YouTube,
	// lihat deriveYoutubeThumbnail di bawah) atau lewat UploadLinkThumbnail
	// terpisah, sama seperti CustomIconURL yang juga upload-only.
	IsFeatured *bool `json:"is_featured"`
	// IconKey -- permintaan langsung pengguna, 13 Agustus 2026: pilih ikon
	// dari galeri siap-pakai (lib/icon-library.ts, frontend), BUKAN upload
	// file, jadi cukup lewat PATCH JSON biasa seperti Title/URL (beda dari
	// CustomIconURL yang upload-only lewat UploadIcon). String kosong ("")
	// dikirim eksplisit untuk membatalkan pilihan (kembali ke deteksi
	// otomatis) -- *string biasa cukup, tidak perlu flag Clear* terpisah
	// seperti jadwal/kunci karena tidak ada field lain yang saling terkait.
	IconKey *string `json:"icon_key" binding:"omitempty,max=50"`
	// IconColor -- permintaan langsung pengguna, 22 Agustus 2026: warna
	// kustom ikon, pola SAMA seperti IconKey (string kosong eksplisit =
	// batalkan, kembali ke warna tema). Format hex divalidasi MANUAL di
	// Update (bukan tag "hexcolor" bawaan validator) -- ditemukan lewat
	// verifikasi langsung: "omitempty" pada field *string TIDAK menganggap
	// pointer non-nil ke string kosong sebagai "kosong" (beda dari field
	// string biasa/non-pointer) -- pointer itu sendiri sudah non-nil,
	// jadi "hexcolor" tetap dijalankan & menolak "" (dikirim eksplisit
	// untuk membatalkan), padahal seharusnya lolos. IconKey "kebetulan"
	// tidak pernah menampakkan bug yang sama karena validatornya (max=50)
	// tetap lolos untuk string kosong apa pun alasannya.
	IconColor *string `json:"icon_color" binding:"omitempty,max=7"`
	// Description -- lihat catatan lengkap di linkItem.Description. String
	// kosong ("") dikirim eksplisit untuk mengosongkan (pola sama seperti
	// IconKey/IconColor), *string biasa cukup, tidak perlu flag Clear*.
	Description *string `json:"description" binding:"omitempty,max=240"`
}

// hexColorPattern -- format PERSIS yang dihasilkan <input type="color">
// HTML (satu-satunya sumber nilai ini di frontend): selalu "#" + 6 digit
// hex. Dicek manual (bukan tag validator) di Update, lihat catatan di
// updateLinkRequest.IconColor kenapa.
var hexColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// Update — REQ-F-202 (edit) & REQ-F-203 (nonaktifkan sementara via is_active=false).
// No.78 (Sprint 9): penjadwalan starts_at/ends_at -- tautan otomatis
// tampil/sembunyi di halaman publik pada rentang waktu tertentu, TANPA
// perlu toggle is_active manual (lihat filter di PageHandler.GetPublicPage).
func (h *LinksHandler) Update(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	var req updateLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	if req.IconColor != nil && *req.IconColor != "" && !hexColorPattern.MatchString(*req.IconColor) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "warna ikon wajib format hex #rrggbb"})
		return
	}

	// Timeout lebih longgar dari handler lain (5s) -- menyunting blok "maps"
	// dengan embed=true melakukan SATU permintaan HTTP KELUAR ke Google Maps
	// (resolveMapsEmbedCoords), lihat di bawah.
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	// Blokir link sensitif -- cuma dicek kalau URL benar-benar diganti
	// (bukan setiap PATCH, mis. sekadar toggle is_active). Judul dipakai
	// sebagai konteks tambahan untuk kata kunci/AI -- pakai judul baru
	// kalau ikut diganti di request yang sama, kalau tidak ambil judul
	// yang sudah tersimpan.
	if req.URL != nil && *req.URL != "" {
		title := ""
		if req.Title != nil {
			title = *req.Title
		} else {
			_ = h.DB.QueryRow(ctx, `SELECT title FROM links WHERE id = $1`, linkID).Scan(&title)
		}
		if res := h.Moderation.Check(ctx, *req.URL, title); res.Blocked {
			c.JSON(http.StatusBadRequest, gin.H{"error": res.Message})
			return
		}
	}

	var starts, ends *time.Time
	if req.StartsAt != nil || req.EndsAt != nil {
		if req.StartsAt == nil || req.EndsAt == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "starts_at dan ends_at wajib diisi bersamaan"})
			return
		}
		s, err := time.Parse(time.RFC3339, *req.StartsAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format starts_at tidak valid (pakai RFC3339)"})
			return
		}
		e, err := time.Parse(time.RFC3339, *req.EndsAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format ends_at tidak valid (pakai RFC3339)"})
			return
		}
		if !e.After(s) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "waktu berakhir jadwal harus setelah waktu mulai"})
			return
		}
		starts, ends = &s, &e
	}

	if req.ClearSchedule {
		if _, err := h.DB.Exec(ctx, `UPDATE links SET starts_at = NULL, ends_at = NULL WHERE id = $1`, linkID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membatalkan jadwal"})
			return
		}
	}

	// No.79: validasi field yang wajib menyertai tiap lock_type -- dicek
	// terhadap NILAI AKHIR (yang baru diisi ATAU yang sudah tersimpan),
	// sama seperti pola validasi pwyw/flash sale di ProductHandler.Update.
	if req.LockType != nil {
		var currentLockCode, currentBlockType string
		var currentLockMinAge *int
		if err := h.DB.QueryRow(ctx, `SELECT lock_code, lock_min_age, block_type FROM links WHERE id = $1`, linkID).
			Scan(&currentLockCode, &currentLockMinAge, &currentBlockType); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
			return
		}
		// Audit keamanan 22 Agustus 2026: "age"/"code"/"subscribe" MENYEMBUNYIKAN
		// l.URL dari payload halaman publik (lihat publicLink, page.go) --
		// gerbang keamanan sungguhan, cuma masuk akal untuk block_type yang
		// URL-nya memang dibuka lewat Unlock ("link"/"button"). block_type lain
		// (video/faq/maps/gallery/audio/accordion/text/contact_form) menaruh
		// isinya di block_data yang TETAP terkirim apa adanya -- mengizinkan
		// "code"/"subscribe" di sana cuma akan membuat UI mengklaim ada gerbang
		// padahal isinya sudah bocor duluan (dashboard SEKARANG memang cuma
		// menawarkan "sensitive" utk block_type ini, tapi endpoint API wajib
		// menegakkannya sendiri, bukan cuma percaya UI). "sensitive" TETAP
		// berlaku di block_type apa pun -- itu peringatan santun, bukan gerbang.
		if *req.LockType != "sensitive" && currentBlockType != "link" && currentBlockType != "button" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "kunci usia/kode/subscribe cuma berlaku untuk tautan atau tombol -- pakai peringatan konten sensitif untuk blok lain"})
			return
		}
		switch *req.LockType {
		case "age":
			minAge := currentLockMinAge
			if req.LockMinAge != nil {
				minAge = req.LockMinAge
			}
			if minAge == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "batas usia wajib diisi untuk kunci usia"})
				return
			}
		case "code":
			code := currentLockCode
			if req.LockCode != nil {
				code = *req.LockCode
			}
			if code == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "kode akses wajib diisi untuk kunci kode"})
				return
			}
		}
	}

	if req.ClearLock {
		if _, err := h.DB.Exec(ctx, `
			UPDATE links SET lock_type = NULL, lock_code = '', lock_min_age = NULL WHERE id = $1
		`, linkID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuka kunci tautan"})
			return
		}
	}

	// No.77: block_data divalidasi terhadap block_type baris yang SUDAH ADA
	// (endpoint ini tidak bisa mengganti block_type, cuma isinya).
	var blockDataJSON []byte
	if req.BlockData != nil {
		var currentBlockType, currentURL string
		if err := h.DB.QueryRow(ctx, `SELECT block_type, url FROM links WHERE id = $1`, linkID).Scan(&currentBlockType, &currentURL); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
			return
		}
		if msg, ok := validateBlockData(currentBlockType, req.BlockData); !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		if msg, ok := checkCatalogPremiumGate(ctx, h.DB, userID, currentBlockType, req.BlockData); !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": msg})
			return
		}
		if msg, ok := checkBuilderProductOwnership(ctx, h.DB, userID, currentBlockType, req.BlockData); !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": msg})
			return
		}
		// "maps" (permintaan langsung pengguna): resolusi koordinat ulang
		// kalau embed dinyalakan lewat penyuntingan ini -- pakai URL baru
		// kalau ikut diubah di request yang sama, kalau tidak pakai URL
		// yang sudah tersimpan.
		if currentBlockType == "maps" {
			if embed, _ := req.BlockData["embed"].(bool); embed {
				targetURL := currentURL
				if req.URL != nil && *req.URL != "" {
					targetURL = *req.URL
				}
				lat, lng, rerr := resolveMapsEmbedCoords(ctx, targetURL)
				if rerr != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": rerr.Error()})
					return
				}
				req.BlockData["embed_lat"] = lat
				req.BlockData["embed_lng"] = lng
			}
		}
		encoded, err := json.Marshal(req.BlockData)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
			return
		}
		blockDataJSON = encoded
	}

	// Featured Link -- kalau kreator baru menandai is_featured=true DAN
	// belum ada thumbnail tersimpan sama sekali, coba turunkan otomatis
	// dari URL YouTube (tidak perlu API key/unggah manual). URL efektif
	// pakai yang baru diisi di request ini kalau ada, kalau tidak pakai
	// yang sudah tersimpan -- supaya "ganti URL + tandai Featured
	// sekaligus" tetap menurunkan thumbnail dari URL BARU, bukan lama.
	var autoThumbnail *string
	if req.IsFeatured != nil && *req.IsFeatured {
		var currentURL, currentThumbnail string
		if err := h.DB.QueryRow(ctx, `SELECT url, thumbnail_url FROM links WHERE id = $1`, linkID).
			Scan(&currentURL, &currentThumbnail); err == nil && currentThumbnail == "" {
			effectiveURL := currentURL
			if req.URL != nil && *req.URL != "" {
				effectiveURL = *req.URL
			}
			if thumb, ok := deriveYoutubeThumbnail(effectiveURL); ok {
				autoThumbnail = &thumb
			}
		}
	}

	_, err := h.DB.Exec(ctx, `
		UPDATE links SET
			title = COALESCE($1, title),
			url = COALESCE($2, url),
			is_active = COALESCE($3, is_active),
			starts_at = COALESCE($4, starts_at),
			ends_at = COALESCE($5, ends_at),
			lock_type = COALESCE($6, lock_type),
			lock_code = COALESCE($7, lock_code),
			lock_min_age = COALESCE($8, lock_min_age),
			block_data = COALESCE($9, block_data),
			is_featured = COALESCE($10, is_featured),
			thumbnail_url = COALESCE($11, thumbnail_url),
			icon_key = COALESCE($12, icon_key),
			icon_color = COALESCE($13, icon_color),
			description = COALESCE($14, description)
		WHERE id = $15
	`, req.Title, req.URL, req.IsActive, starts, ends, req.LockType, req.LockCode, req.LockMinAge, blockDataJSON,
		req.IsFeatured, autoThumbnail, req.IconKey, req.IconColor, req.Description, linkID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui tautan"})
		return
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"message": "tautan diperbarui"})
}

// maxLinkIconSize -- 2MB, cukup untuk ikon kecil (bukan foto resolusi
// penuh seperti avatar/latar).
const maxLinkIconSize = 2 * 1024 * 1024

// UploadIcon -- permintaan langsung pengguna: unggah gambar kustom per
// tautan, MENGGANTIKAN ikon platform yang terdeteksi otomatis dari URL di
// halaman publik (lihat lib/link-icons.ts sisi klien -- deteksi otomatis
// TETAP jalan seperti biasa untuk tautan yang belum diberi ikon kustom).
// Pola SAMA PERSIS seperti PageHandler.UploadAvatar/UploadCustomBackground:
// key storage SELALU "link-icons/<linkID>" (unggah ulang menimpa, bukan
// menumpuk) + query param cache-busting "?v=<timestamp>" WAJIB disimpan ke
// DB (bukan cuma di respons) -- lihat komentar panjang di UploadAvatar
// soal kenapa ini penting (bug nyata yang pernah dilaporkan pengguna).
func (h *LinksHandler) UploadIcon(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	fileHeader, err := c.FormFile("icon")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"icon\")"})
		return
	}
	if fileHeader.Size > maxLinkIconSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 2MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if _, ok := allowedAvatarExt[ext]; !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan jpg/png/webp", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	// Modul Desain: SEMUA gambar diunggah otomatis dikonversi ke WebP.
	webpBytes, err := imageconv.ToWebP(file)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "gagal memproses gambar -- pastikan file benar-benar gambar jpg/png/webp yang valid"})
		return
	}

	key := fmt.Sprintf("link-icons/%s.webp", linkID)
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah ikon"})
		return
	}

	iconURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	if _, err := h.DB.Exec(ctx, `UPDATE links SET custom_icon_url = $1 WHERE id = $2`, iconURL, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ikon terunggah tapi gagal menyimpan referensinya"})
		return
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"custom_icon_url": iconURL, "message": "ikon tautan berhasil diunggah"})
}

// DeleteIcon -- mengembalikan tautan ke deteksi ikon otomatis (menghapus
// custom_icon_url). Objek di storage TIDAK wajib berhasil terhapus untuk
// endpoint ini sukses (soft-fail, sama seperti pola lain di codebase) --
// yang penting kolom DB bersih, file yatim di storage bukan masalah kritis.
func (h *LinksHandler) DeleteIcon(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	if _, err := h.DB.Exec(ctx, `UPDATE links SET custom_icon_url = '' WHERE id = $1`, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus ikon tautan"})
		return
	}

	if h.Storage != nil {
		_ = h.Storage.Delete(ctx, fmt.Sprintf("link-icons/%s", linkID))
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"message": "ikon tautan dihapus, kembali ke deteksi otomatis"})
}

// maxLinkThumbnailSize -- 5MB (sama seperti avatar) -- lebih besar dari
// maxLinkIconSize (2MB) karena thumbnail Featured Link tampil BESAR
// (16:9, seluruh lebar kartu), bukan ikon bulat kecil.
const maxLinkThumbnailSize = 5 * 1024 * 1024

// UploadThumbnail -- Modul "Featured Link" (permintaan langsung pengguna,
// referensi "Featured Layout" Linktree sungguhan): unggah manual thumbnail
// 16:9 untuk tautan non-YouTube (deriveYoutubeThumbnail cuma menangani
// YouTube). Pola SAMA PERSIS dengan UploadIcon di atas -- key storage
// SELALU "link-thumbnails/<linkID>" (unggah ulang menimpa) + cache-busting
// "?v=<timestamp>" disimpan ke DB, BUKAN endpoint gabungan dengan UploadIcon
// karena tujuan visualnya beda (lihat catatan ThumbnailURL, linkItem).
func (h *LinksHandler) UploadThumbnail(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	fileHeader, err := c.FormFile("thumbnail")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"thumbnail\")"})
		return
	}
	if fileHeader.Size > maxLinkThumbnailSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 5MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if _, ok := allowedAvatarExt[ext]; !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan jpg/png/webp", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	webpBytes, err := imageconv.ToWebP(file)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "gagal memproses gambar -- pastikan file benar-benar gambar jpg/png/webp yang valid"})
		return
	}

	key := fmt.Sprintf("link-thumbnails/%s.webp", linkID)
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah thumbnail"})
		return
	}

	thumbnailURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	if _, err := h.DB.Exec(ctx, `UPDATE links SET thumbnail_url = $1, is_featured = true WHERE id = $2`, thumbnailURL, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "thumbnail terunggah tapi gagal menyimpan referensinya"})
		return
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"thumbnail_url": thumbnailURL, "message": "thumbnail tautan berhasil diunggah"})
}

// DeleteThumbnail -- mengembalikan tautan ke baris klasik (menghapus
// thumbnail_url DAN mematikan is_featured -- kartu Featured tanpa
// thumbnail tidak masuk akal, lihat renderLinkOrBlock di PagePreview.tsx).
// Soft-fail utk penghapusan objek storage, pola sama seperti DeleteIcon.
func (h *LinksHandler) DeleteThumbnail(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	if _, err := h.DB.Exec(ctx, `UPDATE links SET thumbnail_url = '', is_featured = false WHERE id = $1`, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus thumbnail tautan"})
		return
	}

	if h.Storage != nil {
		_ = h.Storage.Delete(ctx, fmt.Sprintf("link-thumbnails/%s", linkID))
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"message": "thumbnail tautan dihapus, kembali ke baris klasik"})
}

// maxShowcaseImageSize -- sama seperti maxLinkThumbnailSize (5MB), gambar
// kartu "Project Unggulan" tampil besar (bukan ikon kecil).
const maxShowcaseImageSize = 5 * 1024 * 1024

// UploadShowcaseImage -- block_type "project_showcase" (permintaan langsung
// pengguna, 24 Agustus 2026, lihat catatan lengkap di validateBlockData).
// Pola SAMA PERSIS dengan UploadThumbnail (satu gambar, unggah ulang
// menimpa key storage yang sama + cache-busting "?v=<timestamp>") -- BEDA
// hanya disimpan di block_data.image_url (JSONB) lewat jsonb_set, BUKAN
// kolom khusus, karena field ini spesifik satu block_type (lihat migrasi
// 000077 kenapa `description` di atas sengaja kolom sendiri sementara ini
// tetap di block_data).
func (h *LinksHandler) UploadShowcaseImage(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	fileHeader, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"image\")"})
		return
	}
	if fileHeader.Size > maxShowcaseImageSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 5MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if _, ok := allowedAvatarExt[ext]; !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan jpg/png/webp", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	webpBytes, err := imageconv.ToWebP(file)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "gagal memproses gambar -- pastikan file benar-benar gambar jpg/png/webp yang valid"})
		return
	}

	key := fmt.Sprintf("link-showcase/%s.webp", linkID)
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah gambar"})
		return
	}

	imageURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	imageURLJSON, _ := json.Marshal(imageURL)
	res, err := h.DB.Exec(ctx, `
		UPDATE links SET block_data = jsonb_set(block_data, '{image_url}', $1::jsonb, true)
		WHERE id = $2 AND block_type = 'project_showcase'
	`, imageURLJSON, linkID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gambar terunggah tapi gagal menyimpan referensinya"})
		return
	}
	if res.RowsAffected() == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blok ini bukan kartu project unggulan"})
		return
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"image_url": imageURL, "message": "gambar kartu berhasil diunggah"})
}

// maxGalleryImageSize -- sama seperti maxLinkThumbnailSize (5MB), foto
// galeri tampil besar di grid, bukan ikon kecil.
const maxGalleryImageSize = 5 * 1024 * 1024

// maxGalleryImages -- grid 3 kolom, 9 = pas 3 baris penuh di galeri (mockup
// portofolio kompetitor "s56" pakai grid serupa, "My Shoot" 6 foto) --
// dibatasi supaya satu blok tidak jadi galeri tak terbatas yang memberatkan
// muat halaman publik.
const maxGalleryImages = 9

// UploadGalleryImage -- blok "gallery" (hasil analisa galeri tema kompetitor,
// 17 Agustus 2026): SATU foto per panggilan, DITAMBAHKAN ke array block_data.
// images (append, bukan timpa seperti UploadIcon/UploadThumbnail) -- kreator
// memanggil endpoint ini berkali-kali untuk mengisi galerinya. Key storage
// per-foto pakai UUID acak (bukan pola "<linkID>" tetap seperti icon/
// thumbnail) karena satu blok bisa punya BANYAK foto sekaligus, bukan cuma
// satu yang selalu ditimpa.
func (h *LinksHandler) UploadGalleryImage(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	path, err := parseBuilderPath(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path blok tidak valid"})
		return
	}

	var rootBlockType string
	var rootDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_type, block_data FROM links WHERE id = $1`, linkID).Scan(&rootBlockType, &rootDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	var rootData map[string]any
	if len(rootDataRaw) > 0 {
		_ = json.Unmarshal(rootDataRaw, &rootData)
	}
	if rootData == nil {
		rootData = map[string]any{}
	}

	// Fase 2 (permintaan langsung pengguna, 8 September 2026): `path`
	// menjangkau blok "gallery" di ROOT (path kosong, perilaku SAMA PERSIS
	// sebelum Fase 2) MAUPUN bersarang di dalam Section/Column -- lihat
	// catatan lengkap di resolveBuilderBlockData.
	blockData, blockType, ok := resolveBuilderBlockData(rootData, rootBlockType, path)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "blok tidak ditemukan pada path yang diminta"})
		return
	}
	// Fase 3: "image_slider" (Image Slider) pakai block_data & endpoint ini
	// APA ADANYA (lihat catatan lengkap di validateBlockDataAtDepth case
	// "gallery", "image_slider") -- satu-satunya beda tipe ini dari
	// "gallery" adalah render publiknya (carousel, bukan grid).
	if blockType != "gallery" && blockType != "image_slider" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blok ini bukan blok galeri foto"})
		return
	}

	images, _ := blockData["images"].([]any)
	if len(images) >= maxGalleryImages {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("maksimal %d foto per galeri", maxGalleryImages)})
		return
	}

	fileHeader, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"image\")"})
		return
	}
	if fileHeader.Size > maxGalleryImageSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 5MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if _, ok := allowedAvatarExt[ext]; !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan jpg/png/webp", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	webpBytes, err := imageconv.ToWebP(file)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "gagal memproses gambar -- pastikan file benar-benar gambar jpg/png/webp yang valid"})
		return
	}

	key := fmt.Sprintf("gallery-images/%s/%s.webp", linkID, uuid.NewString())
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah foto"})
		return
	}

	imageURL := h.Storage.PublicURL(key)
	images = append(images, imageURL)
	blockData["images"] = images
	encoded, err := json.Marshal(rootData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "foto terunggah tapi gagal menyimpan referensinya"})
		return
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"images": images, "message": "foto berhasil ditambahkan ke galeri"})
}

// DeleteGalleryImage -- menghapus SATU foto dari array block_data.images
// lewat indeksnya (posisi saat ini di array, dikirim dari daftar yang sudah
// ditampilkan ke kreator -- bukan ID permanen karena foto galeri tidak
// disimpan sebagai baris DB tersendiri, cuma entri array di JSONB). Soft-fail
// utk penghapusan objek storage, pola sama seperti DeleteIcon/DeleteThumbnail.
func (h *LinksHandler) DeleteGalleryImage(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "indeks foto tidak valid"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	path, err := parseBuilderPath(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path blok tidak valid"})
		return
	}

	var rootBlockType string
	var rootDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_type, block_data FROM links WHERE id = $1`, linkID).Scan(&rootBlockType, &rootDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	var rootData map[string]any
	if len(rootDataRaw) > 0 {
		_ = json.Unmarshal(rootDataRaw, &rootData)
	}
	if rootData == nil {
		rootData = map[string]any{}
	}

	// Fase 2 -- lihat catatan lengkap di UploadGalleryImage.
	blockData, blockType, ok := resolveBuilderBlockData(rootData, rootBlockType, path)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "blok tidak ditemukan pada path yang diminta"})
		return
	}
	// Fase 3: "image_slider" (Image Slider) pakai block_data & endpoint ini
	// APA ADANYA (lihat catatan lengkap di validateBlockDataAtDepth case
	// "gallery", "image_slider") -- satu-satunya beda tipe ini dari
	// "gallery" adalah render publiknya (carousel, bukan grid).
	if blockType != "gallery" && blockType != "image_slider" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blok ini bukan blok galeri foto"})
		return
	}

	images, _ := blockData["images"].([]any)
	if index >= len(images) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "foto tidak ditemukan"})
		return
	}

	removedURL, _ := images[index].(string)
	images = append(images[:index], images[index+1:]...)
	blockData["images"] = images
	encoded, err := json.Marshal(rootData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus foto"})
		return
	}

	if h.Storage != nil && removedURL != "" {
		if key := storageKeyFromPublicURL(h.Storage, removedURL); key != "" {
			_ = h.Storage.Delete(ctx, key)
		}
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"images": images, "message": "foto dihapus dari galeri"})
}

// mediaImageBlockTypes -- tiga tipe blok foto-tunggal Fase 2 (Canvas Page
// Builder, permintaan langsung pengguna 8 September 2026) yang berbagi SATU
// endpoint upload/hapus (bukan tiga endpoint terpisah gaya
// UploadShowcaseImage) karena ketiganya identik persis: SATU field
// `block_data.image_url`, ditimpa (bukan ditambah ke array seperti
// gallery). "image" foto tunggal, "video_image" (video+foto, video_url-nya
// field terpisah diedit lewat PATCH block_data biasa), "embed_link" (kartu
// link manual, thumbnail-nya field ini).
var mediaImageBlockTypes = map[string]bool{
	"image":       true,
	"video_image": true,
	"embed_link":  true,
}

// UploadMediaImage -- lihat catatan lengkap di mediaImageBlockTypes &
// resolveBuilderBlockData. Pola SAMA PERSIS UploadShowcaseImage (satu foto,
// menimpa bukan menambah) TAPI menjangkau root MAUPUN bersarang di dalam
// Section/Column lewat `path`, dan berlaku utk KETIGA tipe sekaligus (blok
// mana yang dituju ditentukan hasil resolveBuilderBlockData, bukan
// endpoint terpisah per tipe).
func (h *LinksHandler) UploadMediaImage(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	path, err := parseBuilderPath(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path blok tidak valid"})
		return
	}

	var rootBlockType string
	var rootDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_type, block_data FROM links WHERE id = $1`, linkID).Scan(&rootBlockType, &rootDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	var rootData map[string]any
	if len(rootDataRaw) > 0 {
		_ = json.Unmarshal(rootDataRaw, &rootData)
	}
	if rootData == nil {
		rootData = map[string]any{}
	}

	blockData, blockType, ok := resolveBuilderBlockData(rootData, rootBlockType, path)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "blok tidak ditemukan pada path yang diminta"})
		return
	}
	if !mediaImageBlockTypes[blockType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blok ini bukan blok gambar (image/video+image/embed link)"})
		return
	}

	fileHeader, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"image\")"})
		return
	}
	if fileHeader.Size > maxShowcaseImageSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 5MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if _, ok := allowedAvatarExt[ext]; !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan jpg/png/webp", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	webpBytes, err := imageconv.ToWebP(file)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "gagal memproses gambar -- pastikan file benar-benar gambar jpg/png/webp yang valid"})
		return
	}

	// Key storage per NODE (bukan cuma per linkID seperti UploadShowcaseImage
	// -- satu baris root bisa punya BANYAK blok media tertanam sekaligus di
	// dalam Section/Column, tiap blok butuh key sendiri). nodeKey = id blok
	// itu sendiri (segmen {kind:"child"} TERAKHIR di path) kalau bersarang,
	// atau linkID kalau root -- keduanya sama-sama unik.
	nodeKey := linkID
	if len(path) > 0 {
		if last := path[len(path)-1]; last.Kind == "child" && last.ID != "" {
			nodeKey = last.ID
		}
	}
	key := fmt.Sprintf("link-media/%s/%s.webp", linkID, nodeKey)
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah gambar"})
		return
	}

	imageURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	blockData["image_url"] = imageURL
	encoded, err := json.Marshal(rootData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gambar terunggah tapi gagal menyimpan referensinya"})
		return
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"image_url": imageURL, "message": "gambar berhasil diunggah"})
}

// DeleteMediaImage -- kebalikan UploadMediaImage: kosongkan
// block_data.image_url (bukan hapus baris/blok-nya) + soft-fail hapus objek
// storage, pola sama DeleteGalleryImage/DeleteIcon/DeleteThumbnail.
func (h *LinksHandler) DeleteMediaImage(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	path, err := parseBuilderPath(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path blok tidak valid"})
		return
	}

	var rootBlockType string
	var rootDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_type, block_data FROM links WHERE id = $1`, linkID).Scan(&rootBlockType, &rootDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	var rootData map[string]any
	if len(rootDataRaw) > 0 {
		_ = json.Unmarshal(rootDataRaw, &rootData)
	}
	if rootData == nil {
		rootData = map[string]any{}
	}

	blockData, blockType, ok := resolveBuilderBlockData(rootData, rootBlockType, path)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "blok tidak ditemukan pada path yang diminta"})
		return
	}
	if !mediaImageBlockTypes[blockType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blok ini bukan blok gambar (image/video+image/embed link)"})
		return
	}

	removedURL, _ := blockData["image_url"].(string)
	blockData["image_url"] = ""
	encoded, err := json.Marshal(rootData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus gambar"})
		return
	}

	if h.Storage != nil && removedURL != "" {
		if key := storageKeyFromPublicURL(h.Storage, removedURL); key != "" {
			_ = h.Storage.Delete(ctx, key)
		}
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"message": "gambar dihapus"})
}

// maxAudioFileSize -- 15MB, cukup untuk beberapa menit MP3 kualitas standar
// tanpa membebani halaman publik (audio TIDAK dikonversi/dikompres ulang di
// server, beda dari gambar lewat imageconv -- diunggah apa adanya setelah
// validasi tipe).
const maxAudioFileSize = 15 * 1024 * 1024

// allowedAudioExt -- daftar putih ekstensi->Content-Type, pola SAMA PERSIS
// dengan allowedProductFileExt (page.go)/allowedAvatarExt -- Content-Type
// SELALU dipaksa dari sini, TIDAK PERNAH dipercaya dari klien (audit
// keamanan 28 Juli 2026, lihat catatan allowedProductFileExt).
var allowedAudioExt = map[string]string{
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".m4a": "audio/mp4",
	".ogg": "audio/ogg",
}

// UploadAudio -- blok "audio" (hasil analisa galeri tema kompetitor, 17
// Agustus 2026, mockup "Music"): SATU file audio per blok, key storage
// TETAP "audio-blocks/<linkID>.<ext>" (unggah ulang menimpa, pola sama
// seperti UploadIcon) -- beda dari gallery images yang memang perlu banyak
// per blok. Cover art blok ini SENGAJA TIDAK dapat endpoint upload baru --
// dipakai ulang custom_icon_url yang sudah ada (UploadIcon, generik untuk
// SEMUA block_type, lihat resolveBlockIcon di PagePreview.tsx).
func (h *LinksHandler) UploadAudio(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	var blockType string
	if err := h.DB.QueryRow(ctx, `SELECT block_type FROM links WHERE id = $1`, linkID).Scan(&blockType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	if blockType != "audio" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tautan ini bukan blok audio"})
		return
	}

	fileHeader, err := c.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"audio\")"})
		return
	}
	if fileHeader.Size > maxAudioFileSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 15MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	contentType, ok := allowedAudioExt[ext]
	if !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan mp3/wav/m4a/ogg", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	// Judul otomatis -- permintaan langsung pengguna, 17 Agustus 2026:
	// "otomatis ambil judul dari audio yang di upload". dhowden/tag
	// (pure-Go, TANPA cgo, konsisten dengan imageconv) membaca metadata
	// ID3v1/ID3v2 (mp3) & tag serupa (m4a/ogg) -- kalau file punya tag
	// Artist DAN Title, digabung "Artis - Judul" (ala pemutar musik
	// sungguhan), kalau cuma Title dipakai apa adanya. Gagal baca (format
	// TANPA tag, atau file rusak) BUKAN error fatal -- fallback ke nama
	// file yang dibersihkan (titleFromFilename), audio tetap berhasil
	// diunggah baik ada tag maupun tidak. tag.ReadFrom butuh io.ReadSeeker
	// -- multipart.File sudah memenuhi itu, Seek balik ke awal WAJIB
	// sebelum Storage.Upload supaya body yang terunggah tidak kepotong
	// bagian yang sudah "dibaca habis" oleh pembaca tag.
	derivedTitle := ""
	if meta, terr := tag.ReadFrom(file); terr == nil {
		artist := strings.TrimSpace(meta.Artist())
		songTitle := strings.TrimSpace(meta.Title())
		switch {
		case artist != "" && songTitle != "":
			derivedTitle = artist + " - " + songTitle
		case songTitle != "":
			derivedTitle = songTitle
		}
	}
	if derivedTitle == "" {
		derivedTitle = titleFromFilename(fileHeader.Filename)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}

	key := fmt.Sprintf("audio-blocks/%s%s", linkID, ext)
	if err := h.Storage.Upload(ctx, key, file, fileHeader.Size, contentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah audio"})
		return
	}

	audioURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	var blockDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_data FROM links WHERE id = $1`, linkID).Scan(&blockDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	var blockData map[string]any
	if len(blockDataRaw) > 0 {
		_ = json.Unmarshal(blockDataRaw, &blockData)
	}
	if blockData == nil {
		blockData = map[string]any{}
	}
	blockData["audio_url"] = audioURL
	encoded, err := json.Marshal(blockData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1, title = $2 WHERE id = $3`, encoded, derivedTitle, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "audio terunggah tapi gagal menyimpan referensinya"})
		return
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"audio_url": audioURL, "title": derivedTitle, "message": "audio berhasil diunggah, judul otomatis dari file"})
}

// titleFromFilename -- fallback saat file audio tidak punya tag ID3 (atau
// gagal dibaca): nama file tanpa ekstensi, "_"/"-" diganti spasi lalu
// dirapikan. SELALU mengembalikan string tidak kosong (fallback "Audio"
// kalau nama file kosong/cuma karakter yang hilang setelah dibersihkan).
func titleFromFilename(name string) string {
	base := strings.TrimSuffix(name, filepath.Ext(name))
	base = strings.ReplaceAll(base, "_", " ")
	base = strings.ReplaceAll(base, "-", " ")
	base = strings.Join(strings.Fields(base), " ")
	if base == "" {
		return "Audio"
	}
	return base
}

// DeleteAudio -- mengosongkan audio_url (blok tetap ada, tinggal kosong --
// kreator bisa unggah audio baru lewat UploadAudio lagi). Soft-fail utk
// penghapusan objek storage, pola sama seperti DeleteIcon.
func (h *LinksHandler) DeleteAudio(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	var blockDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_data FROM links WHERE id = $1`, linkID).Scan(&blockDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	var blockData map[string]any
	if len(blockDataRaw) > 0 {
		_ = json.Unmarshal(blockDataRaw, &blockData)
	}
	if blockData == nil {
		blockData = map[string]any{}
	}
	delete(blockData, "audio_url")
	encoded, err := json.Marshal(blockData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus audio"})
		return
	}

	if h.Storage != nil {
		for ext := range allowedAudioExt {
			_ = h.Storage.Delete(ctx, fmt.Sprintf("audio-blocks/%s%s", linkID, ext))
		}
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"message": "audio dihapus dari blok"})
}

// maxFileBlockSize -- 20MB, cukup untuk ebook/PDF/dokumen singkat tanpa
// membebani VPS shared -- lebih kecil dari maxProductFileSize (100MB,
// product.go) karena blok ini gratis/lead-magnet, bukan produk berbayar inti.
const maxFileBlockSize = 20 * 1024 * 1024

// allowedFileBlockExt -- daftar putih ekstensi->Content-Type, pola SAMA
// PERSIS dengan allowedAudioExt di atas & allowedProductFileExt (product.go)
// -- Content-Type DIPAKSAKAN dari server, TIDAK PERNAH dipercaya dari klien
// (lihat catatan keamanan lengkap di allowedProductFileExt, audit 28 Juli
// 2026: mencegah kreator jahat mengunggah file berbahaya bernama "*.pdf"
// tapi Content-Type asli HTML/script). Sengaja dibatasi ke 3 format
// dokumen/arsip (BUKAN audio/video/gambar -- itu sudah punya blok sendiri
// masing-masing) supaya blok ini tetap fokus ke "unduhan dokumen", tidak
// tumpang tindih dengan blok lain.
var allowedFileBlockExt = map[string]string{
	".pdf":  "application/pdf",
	".zip":  "application/zip",
	".epub": "application/epub+zip",
}

// UploadFile -- blok "file" (permintaan langsung pengguna, 20 Agustus 2026:
// "tambahkan file pdf download"). Pola SAMA PERSIS dengan UploadAudio di
// atas (SATU file per blok, key storage TETAP "file-blocks/<linkID>.<ext>",
// unggah ulang menimpa) -- beda utama: title blok TIDAK ditimpa otomatis
// (PDF tidak punya metadata judul semudah tag ID3 audio, & judul blok di
// sini biasanya sudah deskriptif dari kreator sendiri, mis. "Download
// E-book Gratis") -- nama file asli & ukurannya disimpan terpisah di
// block_data (file_name/file_size_bytes) murni untuk ditampilkan di kartu
// unduh (FileDownloadBlock.tsx), bukan menggantikan title.
func (h *LinksHandler) UploadFile(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	var blockType string
	if err := h.DB.QueryRow(ctx, `SELECT block_type FROM links WHERE id = $1`, linkID).Scan(&blockType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	if blockType != "file" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tautan ini bukan blok file"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"file\")"})
		return
	}
	if fileHeader.Size > maxFileBlockSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 20MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	contentType, ok := allowedFileBlockExt[ext]
	if !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan pdf/zip/epub", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	key := fmt.Sprintf("file-blocks/%s%s", linkID, ext)
	if err := h.Storage.Upload(ctx, key, file, fileHeader.Size, contentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah file"})
		return
	}

	fileURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	var blockDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_data FROM links WHERE id = $1`, linkID).Scan(&blockDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	var blockData map[string]any
	if len(blockDataRaw) > 0 {
		_ = json.Unmarshal(blockDataRaw, &blockData)
	}
	if blockData == nil {
		blockData = map[string]any{}
	}
	blockData["file_url"] = fileURL
	blockData["file_name"] = fileHeader.Filename
	blockData["file_size_bytes"] = fileHeader.Size
	encoded, err := json.Marshal(blockData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "file terunggah tapi gagal menyimpan referensinya"})
		return
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{
		"file_url":        fileURL,
		"file_name":       fileHeader.Filename,
		"file_size_bytes": fileHeader.Size,
		"message":         "file berhasil diunggah",
	})
}

// DeleteFile -- mengosongkan file_url/file_name/file_size_bytes (blok tetap
// ada, tinggal kosong -- kreator bisa unggah file baru lewat UploadFile
// lagi). Soft-fail utk penghapusan objek storage, pola sama seperti
// DeleteAudio.
func (h *LinksHandler) DeleteFile(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	var blockDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_data FROM links WHERE id = $1`, linkID).Scan(&blockDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	var blockData map[string]any
	if len(blockDataRaw) > 0 {
		_ = json.Unmarshal(blockDataRaw, &blockData)
	}
	if blockData == nil {
		blockData = map[string]any{}
	}
	delete(blockData, "file_url")
	delete(blockData, "file_name")
	delete(blockData, "file_size_bytes")
	encoded, err := json.Marshal(blockData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus file"})
		return
	}

	if h.Storage != nil {
		for ext := range allowedFileBlockExt {
			_ = h.Storage.Delete(ctx, fmt.Sprintf("file-blocks/%s%s", linkID, ext))
		}
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"message": "file dihapus dari blok"})
}

// storageKeyFromPublicURL -- gallery images (beda dari icon/thumbnail/avatar
// yang key-nya SELALU bisa ditebak dari <linkID>) disimpan dengan UUID acak
// di key-nya, jadi satu-satunya cara menemukan object yang akan dihapus di
// storage adalah menurunkan kembali key dari public URL yang tersimpan di
// block_data.images. Soft-fail dipanggil di sisi pemanggil (DeleteGalleryImage)
// kalau ini gagal menebak -- kolom DB tetap jadi sumber kebenaran, objek
// yatim di storage bukan masalah kritis (pola sama seperti soft-fail lain).
func storageKeyFromPublicURL(s *storage.Client, publicURL string) string {
	prefix := s.PublicURL("")
	if !strings.HasPrefix(publicURL, prefix) {
		return ""
	}
	return strings.TrimPrefix(publicURL, prefix)
}

// maxCatalogItems -- batas wajar jumlah item per blok "catalog" (permintaan
// langsung pengguna, 25 Agustus 2026: blok "Jenis Rumah" -> daftar jenis ->
// detail per jenis) supaya daftar item tidak jadi katalog tak terbatas yang
// memberatkan muat halaman publik -- sama semangatnya dgn maxGalleryImages.
const maxCatalogItems = 20

// maxCatalogImagesPerItem -- LEBIH KECIL dari maxGalleryImages (9) --
// katalog ini punya BANYAK item, masing-masing punya galerinya sendiri,
// 6 foto/item x 20 item tetap wajar, 9 foto/item akan berlebihan.
const maxCatalogImagesPerItem = 6

// maxCatalogImageSize -- sama seperti maxGalleryImageSize (5MB).
const maxCatalogImageSize = 5 * 1024 * 1024

// findCatalogItem -- cari item di block_data.items berdasarkan id (dibuat
// klien, lihat catatan validateBlockData case "catalog") -- dipakai kedua
// handler upload/hapus foto di bawah supaya logikanya tidak diduplikasi.
// Mengembalikan (items mentah, index item, item map, ok).
func findCatalogItem(blockData map[string]any, itemID string) ([]any, int, map[string]any, bool) {
	items, _ := blockData["items"].([]any)
	for i, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if id, _ := item["id"].(string); id == itemID {
			return items, i, item, true
		}
	}
	return items, -1, nil, false
}

// UploadCatalogItemImage -- blok "catalog" (permintaan langsung pengguna, 25
// Agustus 2026): SATU foto per panggilan, DITAMBAHKAN ke array
// block_data.items[itemIndex].images (pola SAMA PERSIS dengan
// UploadGalleryImage -- append, bukan timpa) -- BEDA ditulis ke item
// BERSARANG di dalam items[], bukan ke block_data.images langsung, karena
// blok ini punya BANYAK sub-item yang masing-masing butuh galerinya sendiri.
func (h *LinksHandler) UploadCatalogItemImage(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	linkID := c.Param("id")
	itemID := c.Param("itemId")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	var blockType string
	var blockDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_type, block_data FROM links WHERE id = $1`, linkID).Scan(&blockType, &blockDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	if blockType != "catalog" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tautan ini bukan blok katalog"})
		return
	}

	var blockData map[string]any
	if len(blockDataRaw) > 0 {
		_ = json.Unmarshal(blockDataRaw, &blockData)
	}
	if blockData == nil {
		blockData = map[string]any{}
	}
	items, itemIndex, item, ok := findCatalogItem(blockData, itemID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "item katalog tidak ditemukan"})
		return
	}
	images, _ := item["images"].([]any)
	if len(images) >= maxCatalogImagesPerItem {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("maksimal %d foto per item", maxCatalogImagesPerItem)})
		return
	}

	fileHeader, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"image\")"})
		return
	}
	if fileHeader.Size > maxCatalogImageSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 5MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if _, ok := allowedAvatarExt[ext]; !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan jpg/png/webp", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	webpBytes, err := imageconv.ToWebP(file)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "gagal memproses gambar -- pastikan file benar-benar gambar jpg/png/webp yang valid"})
		return
	}

	key := fmt.Sprintf("catalog-images/%s/%s/%s.webp", linkID, itemID, uuid.NewString())
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah foto"})
		return
	}

	imageURL := h.Storage.PublicURL(key)
	images = append(images, imageURL)
	item["images"] = images
	items[itemIndex] = item
	blockData["items"] = items
	encoded, err := json.Marshal(blockData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "foto terunggah tapi gagal menyimpan referensinya"})
		return
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"images": images, "message": "foto berhasil ditambahkan ke item katalog"})
}

// DeleteCatalogItemImage -- menghapus SATU foto dari
// block_data.items[itemIndex].images lewat indeksnya (pola sama
// DeleteGalleryImage). Soft-fail utk penghapusan objek storage.
func (h *LinksHandler) DeleteCatalogItemImage(c *gin.Context) {
	linkID := c.Param("id")
	itemID := c.Param("itemId")
	userID := c.GetString("userID")
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "indeks foto tidak valid"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	var blockDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_data FROM links WHERE id = $1`, linkID).Scan(&blockDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	var blockData map[string]any
	if len(blockDataRaw) > 0 {
		_ = json.Unmarshal(blockDataRaw, &blockData)
	}
	items, itemIndex, item, ok := findCatalogItem(blockData, itemID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "item katalog tidak ditemukan"})
		return
	}
	images, _ := item["images"].([]any)
	if index >= len(images) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "foto tidak ditemukan"})
		return
	}

	removedURL, _ := images[index].(string)
	images = append(images[:index], images[index+1:]...)
	item["images"] = images
	items[itemIndex] = item
	blockData["items"] = items
	encoded, err := json.Marshal(blockData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus foto"})
		return
	}

	if h.Storage != nil && removedURL != "" {
		if key := storageKeyFromPublicURL(h.Storage, removedURL); key != "" {
			_ = h.Storage.Delete(ctx, key)
		}
	}

	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"images": images, "message": "foto dihapus dari item katalog"})
}

// Unlock — No.79 (Sprint 9): endpoint PUBLIK, dipanggil dari halaman publik
// begitu pengunjung melewati gerbang kunci (konfirmasi usia, masukkan kode,
// atau daftar email/whatsapp). Mengembalikan URL asli HANYA kalau gerbang
// terlewati -- URL tidak pernah dikirim di payload halaman publik untuk
// tautan terkunci (lihat PageHandler.GetPublicPage).
type unlockLinkRequest struct {
	Code           string `json:"code"`
	Email          string `json:"email"`
	WhatsappNumber string `json:"whatsapp_number"`
}

func (h *LinksHandler) Unlock(c *gin.Context) {
	linkID := c.Param("id")

	var req unlockLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var url, lockType, lockCode string
	var creatorUserID string
	err := h.DB.QueryRow(ctx, `
		SELECT l.url, COALESCE(l.lock_type, ''), l.lock_code, p.user_id
		FROM links l JOIN pages p ON p.id = l.page_id
		WHERE l.id = $1
	`, linkID).Scan(&url, &lockType, &lockCode, &creatorUserID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
		return
	}

	switch lockType {
	case "code":
		if strings.TrimSpace(req.Code) == "" || req.Code != lockCode {
			c.JSON(http.StatusBadRequest, gin.H{"error": "kode akses salah"})
			return
		}
	case "subscribe":
		email := strings.TrimSpace(strings.ToLower(req.Email))
		whatsapp := strings.TrimSpace(req.WhatsappNumber)
		if email == "" && whatsapp == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "isi email atau nomor WhatsApp"})
			return
		}
		// No.79: subscribe-lock sekaligus jadi sumber lead baru untuk
		// Manajer Audiens (No.73) -- INSERT ke tabel subscribers yang sama,
		// dedupe email persis seperti AudienceHandler.SubscribeLead.
		if _, err := h.DB.Exec(ctx, `
			INSERT INTO subscribers (creator_user_id, email, whatsapp_number)
			VALUES ($1, $2, $3)
			ON CONFLICT (creator_user_id, email) WHERE email <> '' DO UPDATE SET
				whatsapp_number = CASE WHEN EXCLUDED.whatsapp_number <> '' THEN EXCLUDED.whatsapp_number ELSE subscribers.whatsapp_number END
		`, creatorUserID, email, whatsapp); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data"})
			return
		}
	case "age":
		// Konfirmasi usia murni klik persetujuan (tidak ada verifikasi
		// identitas sungguhan) -- konsisten dengan perilaku age-lock
		// Linktree yang sebenarnya (dikonfirmasi riset kompetitor).
	case "sensitive":
		// Sama seperti "age" -- murni klik "lanjutkan", tidak ada
		// verifikasi. Endpoint ini HANYA relevan untuk block_type "link"/
		// "button" (url disembunyikan sampai unlock) -- block_type lain
		// digerbang murni client-side, tidak pernah memanggil endpoint ini
		// sama sekali (lihat SensitiveContentGate, PagePreview.tsx).
	}

	c.JSON(http.StatusOK, gin.H{"url": url})
}

type contactFormRequest struct {
	Name    string `json:"name" binding:"required,max=100"`
	Email   string `json:"email" binding:"required,email"`
	Message string `json:"message" binding:"required,max=2000"`
}

// SubmitContactForm — No.77 (Sprint 9): endpoint PUBLIK untuk blok Formulir
// Kontak. Notifikasi ke kreator dikirim ASINKRON lewat queue (lihat
// queue.TypeContactFormNotification) -- pengunjung tidak pernah menunggu
// SMTP selesai, dan lambat/gagalnya SMTP tidak pernah membuat submit ini
// gagal di sisi pengunjung.
func (h *LinksHandler) SubmitContactForm(c *gin.Context) {
	linkID := c.Param("id")

	var req contactFormRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var blockType, creatorEmail, pageUsername string
	err := h.DB.QueryRow(ctx, `
		SELECT l.block_type, u.email, u.username
		FROM links l JOIN pages p ON p.id = l.page_id JOIN users u ON u.id = p.user_id
		WHERE l.id = $1
	`, linkID).Scan(&blockType, &creatorEmail, &pageUsername)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
		return
	}
	if blockType != "contact_form" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blok ini bukan formulir kontak"})
		return
	}

	if h.Queue == nil {
		c.JSON(http.StatusOK, gin.H{"message": "pesan terkirim"})
		return
	}
	task, err := queue.NewContactFormTask(queue.ContactFormPayload{
		CreatorEmail: creatorEmail, PageUsername: pageUsername,
		VisitorName: req.Name, VisitorEmail: req.Email, Message: req.Message,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengirim pesan"})
		return
	}
	if _, err := h.Queue.Enqueue(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengirim pesan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "pesan terkirim"})
}

// Duplicate — permintaan langsung pengguna, 20 Agustus 2026: "di bagian
// link bio di blok nya tambahkan fungsi duplicate". Menyalin SEMUA kolom
// (termasuk kunci/lock_type, jadwal, ikon, featured, block_data) lewat
// SATU INSERT...SELECT -- duplikat penuh, bukan cuma judul+URL. Ditaruh di
// posisi PALING AKHIR (bukan tepat setelah aslinya) supaya tidak perlu
// menggeser posisi baris lain, pola position sama seperti Create. Judul
// diberi akhiran " (Salinan)" (dipotong ke 100 karakter -- batas kolom
// title, VARCHAR(100) NOT NULL -- kalau judul asli sudah mepet batas)
// supaya kreator langsung tahu mana baris yang baru digandakan tanpa
// harus membandingkan isi satu-satu.
func (h *LinksHandler) Duplicate(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	var pageID string
	if err := h.DB.QueryRow(ctx, `SELECT page_id FROM links WHERE id = $1`, linkID).Scan(&pageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
		return
	}

	var nextPosition int
	if err := h.DB.QueryRow(ctx,
		`SELECT COALESCE(MAX(position) + 1, 0) FROM links WHERE page_id = $1`, pageID,
	).Scan(&nextPosition); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung posisi tautan"})
		return
	}

	newID := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO links (
			id, page_id, title, url, position, is_active, starts_at, ends_at,
			lock_type, lock_code, lock_min_age, block_type, block_data,
			custom_icon_url, is_featured, thumbnail_url, icon_key, icon_color, description
		)
		SELECT $1, page_id, LEFT(title || ' (Salinan)', 100), url, $2, is_active, starts_at, ends_at,
			lock_type, lock_code, lock_min_age, block_type, block_data,
			custom_icon_url, is_featured, thumbnail_url, icon_key, icon_color, description
		FROM links WHERE id = $3
	`, newID, nextPosition, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menduplikasi blok"})
		return
	}

	h.invalidatePageCacheByID(ctx, pageID)
	c.JSON(http.StatusCreated, gin.H{"id": newID, "message": "blok berhasil diduplikasi"})
}

// Delete — REQ-F-202 (hapus permanen; untuk sementara pakai Update is_active=false).
func (h *LinksHandler) Delete(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	// Ambil page_id SEBELUM menghapus -- setelah DELETE baris ini sudah
	// tidak ada lagi, jadi invalidateLinkCache (yang query lewat linkID)
	// tidak akan menemukan apa-apa kalau dipanggil sesudahnya.
	var pageID string
	_ = h.DB.QueryRow(ctx, `SELECT page_id FROM links WHERE id = $1`, linkID).Scan(&pageID)

	if _, err := h.DB.Exec(ctx, `DELETE FROM links WHERE id = $1`, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus tautan"})
		return
	}

	if pageID != "" {
		h.invalidatePageCacheByID(ctx, pageID)
	}
	c.JSON(http.StatusOK, gin.H{"message": "tautan dihapus"})
}

type reorderItem struct {
	ID       string `json:"id" binding:"required"`
	Position int    `json:"position"`
}

// Reorder — mendukung drag-and-drop di dashboard (REQ-F-202). Menerima daftar
// {id, position} lengkap untuk halaman kreator yang sedang login; seluruh
// tautan yang disebut divalidasi kepemilikannya sebelum diterapkan.
func (h *LinksHandler) Reorder(c *gin.Context) {
	var req []reorderItem
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, item := range req {
		res, err := tx.Exec(ctx, `
			UPDATE links SET position = $1
			WHERE id = $2 AND page_id = (SELECT id FROM pages WHERE user_id = $3 AND is_primary = true)
		`, item.Position, item.ID, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan urutan"})
			return
		}
		if res.RowsAffected() == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "tautan bukan milik akun ini"})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan urutan"})
		return
	}

	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusOK, gin.H{"message": "urutan tautan diperbarui"})
}

// ReorderForPage — versi Reorder untuk halaman TAMBAHAN (No.98), page_id
// eksplisit dari URL alih-alih diasumsikan halaman utama.
func (h *LinksHandler) ReorderForPage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	var req []reorderItem
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, item := range req {
		res, err := tx.Exec(ctx, `UPDATE links SET position = $1 WHERE id = $2 AND page_id = $3`, item.Position, item.ID, pageID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan urutan"})
			return
		}
		if res.RowsAffected() == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "tautan bukan milik halaman ini"})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan urutan"})
		return
	}

	h.invalidatePageCacheByID(ctx, pageID)
	c.JSON(http.StatusOK, gin.H{"message": "urutan tautan diperbarui"})
}

func (h *LinksHandler) ownsLink(ctx context.Context, linkID, userID string) bool {
	var exists int
	err := h.DB.QueryRow(ctx, `
		SELECT 1 FROM links l
		JOIN pages p ON p.id = l.page_id
		WHERE l.id = $1 AND p.user_id = $2
	`, linkID, userID).Scan(&exists)
	if err != nil && err != pgx.ErrNoRows {
		return false
	}
	return err == nil
}

// ---------- No.98 (Sprint 14): tautan untuk halaman bio TAMBAHAN ----------
//
// Update/Delete/Unlock/SubmitContactForm/Reorder TIDAK perlu versi baru --
// ownsLink() sudah memeriksa kepemilikan lewat p.user_id tanpa peduli
// is_primary, jadi rute /dashboard/links/:id yang sudah ada otomatis bekerja
// untuk tautan di halaman MANA PUN milik kreator yang sama, termasuk halaman
// tambahan. Hanya List & Create yang perlu versi page-scoped baru, karena
// versi lama SELALU menargetkan halaman utama (WHERE ... AND is_primary = true).

// ListForPage — GET /dashboard/pages/:id/links, dipakai dashboard halaman
// tambahan (juga bisa dipakai untuk halaman utama kalau perlu, tidak
// dibatasi is_primary di sini karena kepemilikan sudah cukup sebagai gerbang).
func (h *LinksHandler) ListForPage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT id, title, url, position, is_active, starts_at, ends_at,
			COALESCE(lock_type, ''), lock_code, lock_min_age, block_type, block_data
		FROM links WHERE page_id = $1
		ORDER BY position ASC
	`, pageID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
		return
	}
	defer rows.Close()

	items := []linkItem{}
	for rows.Next() {
		var it linkItem
		if err := rows.Scan(&it.ID, &it.Title, &it.URL, &it.Position, &it.IsActive, &it.StartsAt, &it.EndsAt,
			&it.LockType, &it.LockCode, &it.LockMinAge, &it.BlockType, &it.BlockData); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// CreateForPage — POST /dashboard/pages/:id/links.
func (h *LinksHandler) CreateForPage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	var req createLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if !h.ownsPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
		return
	}

	if res := h.Moderation.Check(ctx, req.URL, req.Title); res.Blocked {
		c.JSON(http.StatusBadRequest, gin.H{"error": res.Message})
		return
	}

	var nextPosition int
	if err := h.DB.QueryRow(ctx,
		`SELECT COALESCE(MAX(position) + 1, 0) FROM links WHERE page_id = $1`, pageID,
	).Scan(&nextPosition); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung posisi tautan"})
		return
	}

	id := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO links (id, page_id, title, url, position, is_active)
		VALUES ($1, $2, $3, $4, $5, true)
	`, id, pageID, req.Title, req.URL, nextPosition); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat tautan"})
		return
	}

	h.invalidatePageCacheByID(ctx, pageID)
	c.JSON(http.StatusCreated, linkItem{ID: id, Title: req.Title, URL: req.URL, Position: nextPosition, IsActive: true, BlockType: "link", BlockData: json.RawMessage("{}")})
}

// CreateBlockForPage — No.99 (Sprint 14): blok builder landing page
// (heading/text/image/button, plus video/faq/contact_form yang sudah ada
// dari No.77) untuk halaman TAMBAHAN mana pun (bio atau landing).
func (h *LinksHandler) CreateBlockForPage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	var req createBlockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	if req.BlockData == nil {
		req.BlockData = map[string]any{}
	}
	if req.BlockType == "button" && req.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url wajib diisi untuk tombol CTA"})
		return
	}
	if req.BlockType == "maps" && req.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tautan Google Maps wajib diisi"})
		return
	}
	if req.BlockType == "project_showcase" && req.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url tujuan (CTA) wajib diisi untuk kartu project unggulan"})
		return
	}
	if msg, ok := validateBlockData(req.BlockType, req.BlockData); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	if !h.ownsPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
		return
	}

	if msg, ok := checkCatalogPremiumGate(ctx, h.DB, userID, req.BlockType, req.BlockData); !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": msg})
		return
	}
	if msg, ok := checkBuilderProductOwnership(ctx, h.DB, userID, req.BlockType, req.BlockData); !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": msg})
		return
	}

	if res := h.Moderation.Check(ctx, req.URL, req.Title); res.Blocked {
		c.JSON(http.StatusBadRequest, gin.H{"error": res.Message})
		return
	}

	if req.BlockType == "maps" {
		if embed, _ := req.BlockData["embed"].(bool); embed {
			lat, lng, rerr := resolveMapsEmbedCoords(ctx, req.URL)
			if rerr != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": rerr.Error()})
				return
			}
			req.BlockData["embed_lat"] = lat
			req.BlockData["embed_lng"] = lng
		}
	}

	id, position, blockDataJSON, err := h.insertBlock(ctx, pageID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.invalidatePageCacheByID(ctx, pageID)
	c.JSON(http.StatusCreated, linkItem{
		ID: id, Title: req.Title, URL: req.URL, Position: position, IsActive: true,
		BlockType: req.BlockType, BlockData: blockDataJSON, Description: req.Description,
	})
}

func (h *LinksHandler) ownsPage(ctx context.Context, pageID, userID string) bool {
	var exists int
	err := h.DB.QueryRow(ctx, `SELECT 1 FROM pages WHERE id = $1 AND user_id = $2`, pageID, userID).Scan(&exists)
	if err != nil && err != pgx.ErrNoRows {
		return false
	}
	return err == nil
}
