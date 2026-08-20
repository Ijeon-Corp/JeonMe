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
}

func NewLinksHandler(db *pgxpool.Pool, queueClient *asynq.Client, rdb *redis.Client, s3 *storage.Client) *LinksHandler {
	return &LinksHandler{DB: db, Queue: queueClient, RDB: rdb, Storage: s3}
}

// invalidatePageCacheByID — sama seperti invalidateUserPageCache (cache.go),
// tapi tautan bisa berada di halaman UTAMA (cache "page:<username>") ATAU
// halaman TAMBAHAN No.98 (cache "page-slug:<slug>") -- Update/Delete/Unlock
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
		h.RDB.Del(ctx, "page-slug:"+*slug)
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
	// IsFeatured/ThumbnailURL -- Modul "Featured Link" (permintaan langsung
	// pengguna, referensi "Featured Layout" Linktree sungguhan): tautan
	// tampil sebagai kartu thumbnail 16:9, bukan baris teks. ThumbnailURL
	// TERPISAH dari CustomIconURL (ikon bulat kecil) -- tujuan visualnya
	// beda, lihat migrasi 000064.
	IsFeatured   bool   `json:"is_featured"`
	ThumbnailURL string `json:"thumbnail_url"`
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
			l.icon_key, l.is_featured, l.thumbnail_url,
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
			&it.IconKey, &it.IsFeatured, &it.ThumbnailURL, &it.ClickCount); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type createLinkRequest struct {
	Title string `json:"title" binding:"required,max=100"`
	URL   string `json:"url" binding:"required,url,max=2048"`
}

// Create — REQ-F-202. Tautan baru ditaruh di posisi paling akhir.
func (h *LinksHandler) Create(c *gin.Context) {
	var req createLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

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
		INSERT INTO links (id, page_id, title, url, position, is_active)
		VALUES ($1, $2, $3, $4, $5, true)
	`, id, pageID, req.Title, req.URL, nextPosition)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat tautan"})
		return
	}

	h.invalidatePageCacheByID(ctx, pageID)
	c.JSON(http.StatusCreated, linkItem{ID: id, Title: req.Title, URL: req.URL, Position: nextPosition, IsActive: true, BlockType: "link", BlockData: json.RawMessage("{}")})
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
func validateBlockData(blockType string, data map[string]any) (string, bool) {
	switch blockType {
	case "video":
		videoURL, _ := data["video_url"].(string)
		if !isValidVideoEmbedURL(videoURL) {
			return "video_url wajib diisi dengan tautan YouTube atau TikTok yang valid", false
		}
	case "faq":
		items, ok := data["items"].([]any)
		if !ok || len(items) == 0 {
			return "isi minimal 1 pertanyaan FAQ", false
		}
		for _, raw := range items {
			item, ok := raw.(map[string]any)
			q, _ := item["question"].(string)
			a, _ := item["answer"].(string)
			if !ok || strings.TrimSpace(q) == "" || strings.TrimSpace(a) == "" {
				return "setiap item FAQ wajib punya pertanyaan dan jawaban", false
			}
		}
	case "heading", "text", "accordion":
		text, _ := data["text"].(string)
		if strings.TrimSpace(text) == "" {
			return "isi teks blok ini", false
		}
	case "image":
		imageURL, _ := data["image_url"].(string)
		u, err := url.Parse(imageURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			return "image_url wajib diisi dengan URL gambar yang valid", false
		}
	case "maps":
		if embed, ok := data["embed"]; ok {
			if _, isBool := embed.(bool); !isBool {
				return "embed wajib berupa true/false", false
			}
		}
	case "gallery":
		// "gallery" -- hasil analisa galeri tema kompetitor (17 Agustus
		// 2026, folder theme/: template portofolio/wisata s.id memakai grid
		// multi-foto yang belum ada padanannya di Jeonme, blok "image" lama
		// cuma 1 foto per blok). "images" divalidasi longgar di sini (boleh
		// kosong -- blok baru dibuat DULU lewat CreateBlock lalu fotonya
		// ditambah satu-satu lewat UploadGalleryImage, pola sama seperti
		// custom_icon_url yang upload-only terpisah dari create), tapi kalau
		// TERISI setiap entri wajib URL http(s) valid (jaga-jaga endpoint ini
		// juga dipakai utk PATCH block_data manual).
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
	}
	return "", true
}

type createBlockRequest struct {
	BlockType string         `json:"block_type" binding:"required,oneof=video contact_form faq heading text image button maps accordion gallery audio"`
	Title     string         `json:"title" binding:"required,max=100"`
	URL       string         `json:"url" binding:"omitempty,url,max=2048"`
	BlockData map[string]any `json:"block_data"`
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		BlockType: req.BlockType, BlockData: blockDataJSON,
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
		INSERT INTO links (id, page_id, title, url, position, is_active, block_type, block_data)
		VALUES ($1, $2, $3, $4, $5, true, $6, $7)
	`, id, pageID, req.Title, req.URL, position, req.BlockType, blockDataJSON); err != nil {
		return "", 0, nil, errors.New("gagal membuat blok")
	}

	return id, position, blockDataJSON, nil
}

type updateLinkRequest struct {
	Title         *string `json:"title" binding:"omitempty,max=100"`
	URL           *string `json:"url" binding:"omitempty,url,max=2048"`
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
}

// Update — REQ-F-202 (edit) & REQ-F-203 (nonaktifkan sementara via is_active=false).
// No.78 (Sprint 9): penjadwalan starts_at/ends_at -- tautan otomatis
// tampil/sembunyi di halaman publik pada rentang waktu tertentu, TANPA
// perlu toggle is_active manual (lihat filter di PageHandler.GetPublicPage).
func (h *LinksHandler) Update(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	var req updateLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		var currentLockCode string
		var currentLockMinAge *int
		if err := h.DB.QueryRow(ctx, `SELECT lock_code, lock_min_age FROM links WHERE id = $1`, linkID).
			Scan(&currentLockCode, &currentLockMinAge); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
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
			icon_key = COALESCE($12, icon_key)
		WHERE id = $13
	`, req.Title, req.URL, req.IsActive, starts, ends, req.LockType, req.LockCode, req.LockMinAge, blockDataJSON,
		req.IsFeatured, autoThumbnail, req.IconKey, linkID)
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

	var blockType string
	var blockDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_type, block_data FROM links WHERE id = $1`, linkID).Scan(&blockType, &blockDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	if blockType != "gallery" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tautan ini bukan blok galeri foto"})
		return
	}

	var blockData map[string]any
	if len(blockDataRaw) > 0 {
		_ = json.Unmarshal(blockDataRaw, &blockData)
	}
	if blockData == nil {
		blockData = map[string]any{}
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

	var blockDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_data FROM links WHERE id = $1`, linkID).Scan(&blockDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return
	}
	var blockData map[string]any
	if len(blockDataRaw) > 0 {
		_ = json.Unmarshal(blockDataRaw, &blockData)
	}
	images, _ := blockData["images"].([]any)
	if index >= len(images) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "foto tidak ditemukan"})
		return
	}

	removedURL, _ := images[index].(string)
	images = append(images[:index], images[index+1:]...)
	blockData["images"] = images
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
	c.JSON(http.StatusOK, gin.H{"images": images, "message": "foto dihapus dari galeri"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
			custom_icon_url, is_featured, thumbnail_url, icon_key
		)
		SELECT $1, page_id, LEFT(title || ' (Salinan)', 100), url, $2, is_active, starts_at, ends_at,
			lock_type, lock_code, lock_min_age, block_type, block_data,
			custom_icon_url, is_featured, thumbnail_url, icon_key
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
	if msg, ok := validateBlockData(req.BlockType, req.BlockData); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

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

	if !h.ownsPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
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
		BlockType: req.BlockType, BlockData: blockDataJSON,
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
