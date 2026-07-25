package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/storage"
)

// PageHandler mengimplementasikan REQ-F-201 (halaman publik) dan
// REQ-F-204 (ganti tema & bio). CRUD tautan ada di LinksHandler.
// Storage boleh nil (mis. kalau EnsureBucket gagal saat startup) --
// UploadAvatar akan menolak dengan pesan jelas alih-alih panic.
type PageHandler struct {
	DB      *pgxpool.Pool
	RDB     *redis.Client
	Storage *storage.Client
}

func NewPageHandler(db *pgxpool.Pool, rdb *redis.Client, s3 *storage.Client) *PageHandler {
	return &PageHandler{DB: db, RDB: rdb, Storage: s3}
}

// publicPageCacheTTL sengaja pendek (bukan invalidate-on-write untuk setiap
// mutasi tautan/produk) supaya implementasinya sederhana tapi staleness tetap
// terbatas -- cukup untuk endpoint baca-berat seperti ini (NF-01/02).
const publicPageCacheTTL = 30 * time.Second

type publicPageResponse struct {
	ID                    string             `json:"id"`
	Username              string             `json:"username"`
	Bio                   string             `json:"bio"`
	AvatarURL             string             `json:"avatar_url"`
	Theme                 string             `json:"theme"`
	SeoTitle              string             `json:"seo_title"`
	SeoDescription        string             `json:"seo_description"`
	Noindex               bool               `json:"noindex"`
	CustomBackgroundType  string             `json:"custom_background_type"`
	CustomBackgroundValue string             `json:"custom_background_value"`
	CustomFont            string             `json:"custom_font"`
	CustomButtonColor     string             `json:"custom_button_color"`
	Links                 []publicLink       `json:"links"`
	Products              []publicItem       `json:"products"`
	Donation              *publicDonation    `json:"donation"`
	LeadCapture           *publicLeadCapture `json:"lead_capture"`
	SocialProof           *publicSocialProof `json:"social_proof"`
	IsVerified            bool               `json:"is_verified"`
	Events                []publicEvent      `json:"events"`
}

// publicEvent -- No.90 (Sprint 11): blok event, TIDAK ikut array Products
// (tampil sebagai kartu tersendiri dengan tanggal/waktu/kuota, bukan grid
// produk biasa) -- beberapa event bisa aktif sekaligus, beda dari Donation
// yang cuma satu per kreator. SpotsLeft nil kalau kuota tidak dibatasi.
type publicEvent struct {
	ProductID         string    `json:"product_id"`
	Name              string    `json:"name"`
	Description       string    `json:"description"`
	EffectivePriceIDR int64     `json:"effective_price_idr"`
	IsFlashSaleActive bool      `json:"is_flash_sale_active"`
	StartsAt          time.Time `json:"starts_at"`
	EndsAt            time.Time `json:"ends_at"`
	Timezone          string    `json:"timezone"`
	Location          string    `json:"location"`
	IsOnline          bool      `json:"is_online"`
	SpotsLeft         *int      `json:"spots_left"`
}

// publicLeadCapture -- No.73 (Sprint 8): blok pengumpulan email/whatsapp
// pengunjung. nil kalau kreator belum mengaktifkan blok ini.
type publicLeadCapture struct {
	Title           string `json:"title"`
	CollectEmail    bool   `json:"collect_email"`
	CollectWhatsapp bool   `json:"collect_whatsapp"`
}

// publicSocialProof -- No.76 (Sprint 8): notifikasi "X baru saja membeli".
// nil kalau kreator belum mengaktifkan ATAU belum ada pembelian sama sekali
// (tidak ada gunanya menampilkan komponen tanpa data).
type publicSocialProof struct {
	DisplaySeconds  int              `json:"display_seconds"`
	IntervalSeconds int              `json:"interval_seconds"`
	Recent          []recentPurchase `json:"recent"`
}

// publicDonation -- No.71: blok dukungan/donasi, TIDAK ikut array Products
// (tampil sebagai blok tersendiri di halaman publik, bukan kartu di grid
// Produk). nil kalau kreator belum mengaktifkan blok ini.
type publicDonation struct {
	ProductID    string `json:"product_id"`
	Title        string `json:"title"`
	MinAmountIDR int64  `json:"min_amount_idr"`
}

// publicLink -- No.79 (Sprint 9): URL SENGAJA dikosongkan kalau LockType
// terisi -- pengunjung harus lewat gerbang kunci (LinksHandler.Unlock)
// dulu untuk mendapat URL asli, tidak boleh bocor lewat payload halaman
// publik sebelum itu.
type publicLink struct {
	ID         string          `json:"id"`
	Title      string          `json:"title"`
	URL        string          `json:"url"`
	LockType   string          `json:"lock_type"`
	LockMinAge *int            `json:"lock_min_age"`
	BlockType  string          `json:"block_type"`
	BlockData  json.RawMessage `json:"block_data"`
}

type publicItem struct {
	ID                     string `json:"id"`
	Name                   string `json:"name"`
	PriceIDR               int64  `json:"price_idr"`
	CoverImage             string `json:"cover_image_url"`
	EffectivePriceIDR      int64  `json:"effective_price_idr"`
	IsFlashSaleActive      bool   `json:"is_flash_sale_active"`
	PwywEnabled            bool   `json:"pwyw_enabled"`
	PwywMinPriceIDR        *int64 `json:"pwyw_min_price_idr"`
	IsBundle               bool   `json:"is_bundle"`
	BundleOriginalPriceIDR *int64 `json:"bundle_original_price_idr"`
}

// GetPublicPage — REQ-F-201: diakses tanpa login di jeonme.com/{username}.
// Endpoint trafik tertinggi di seluruh sistem, jadi dicek dulu di cache Redis
// (NF-01/02) sebelum menyentuh database.
func (h *PageHandler) GetPublicPage(c *gin.Context) {
	username := c.Param("username")
	cacheKey := "page:" + username

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if h.RDB != nil {
		if cached, err := h.RDB.Get(ctx, cacheKey).Result(); err == nil {
			var resp publicPageResponse
			if json.Unmarshal([]byte(cached), &resp) == nil {
				c.Header("X-Cache", "HIT")
				c.JSON(http.StatusOK, resp)
				return
			}
		}
	}

	var resp publicPageResponse
	var userID string
	var emailVerified bool

	err := h.DB.QueryRow(ctx, `
		SELECT u.id, p.id, u.username, p.bio, p.avatar_url, p.theme, p.seo_title, p.seo_description, p.noindex,
			p.custom_background_type, p.custom_background_value, p.custom_font, p.custom_button_color,
			u.email_verified_at IS NOT NULL
		FROM users u
		JOIN pages p ON p.user_id = u.id
		WHERE u.username = $1 AND p.is_published = true
	`, username).Scan(&userID, &resp.ID, &resp.Username, &resp.Bio, &resp.AvatarURL, &resp.Theme,
		&resp.SeoTitle, &resp.SeoDescription, &resp.Noindex,
		&resp.CustomBackgroundType, &resp.CustomBackgroundValue, &resp.CustomFont, &resp.CustomButtonColor,
		&emailVerified)

	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}

	// No.88 (Sprint 10): badge terverifikasi -- sinyal kepercayaan murah untuk
	// pembeli, dihitung LANGSUNG dari data yang sudah ada (BUKAN proses review
	// manual seperti Linktree): email terverifikasi + profil lengkap (bio DAN
	// foto profil terisi) + minimal 1 transaksi sukses (order status='paid').
	var hasPaidOrder bool
	_ = h.DB.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM orders o JOIN products pr ON pr.id = o.product_id WHERE pr.user_id = $1 AND o.status = 'paid')
	`, userID).Scan(&hasPaidOrder)
	profileComplete := resp.Bio != "" && resp.AvatarURL != ""
	resp.IsVerified = emailVerified && profileComplete && hasPaidOrder

	// No.78 (Sprint 9): tautan terjadwal otomatis tampil/sembunyi berdasar
	// starts_at/ends_at (NULL = tidak dibatasi rentang waktu itu), di ATAS
	// gate is_active manual yang sudah ada -- keduanya harus lolos.
	resp.Links = []publicLink{}
	rows, err := h.DB.Query(ctx, `
		SELECT id, title, url, COALESCE(lock_type, ''), lock_min_age, block_type, block_data FROM links
		WHERE page_id = (SELECT id FROM pages WHERE user_id = $1)
		AND is_active = true
		AND (starts_at IS NULL OR starts_at <= now())
		AND (ends_at IS NULL OR ends_at >= now())
		ORDER BY position ASC
	`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var l publicLink
			if err := rows.Scan(&l.ID, &l.Title, &l.URL, &l.LockType, &l.LockMinAge, &l.BlockType, &l.BlockData); err == nil {
				// No.79: sembunyikan URL asli untuk tautan terkunci -- lihat
				// komentar di definisi struct publicLink.
				if l.LockType != "" {
					l.URL = ""
				}
				resp.Links = append(resp.Links, l)
			}
		}
	}

	// No.70: bundel TIDAK difilter di sini -- bundel memang harus tampil
	// di halaman publik sebagai produk yang bisa dibeli, dengan harga
	// asli (jumlah harga item di dalamnya) dicoret lewat bundle_original_price_idr.
	// No.71/90: blok dukungan/donasi & event DIFILTER di sini -- masing-
	// masing tampil sebagai blok tersendiri (resp.Donation/resp.Events),
	// bukan kartu di grid Produk.
	resp.Products = []publicItem{}
	productRows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, p.price_idr, p.cover_image_url, `+effectivePriceExpr+`, p.pwyw_enabled, p.pwyw_min_price_idr,
			p.is_bundle,
			(SELECT SUM(ip.price_idr) FROM bundle_items bi JOIN products ip ON ip.id = bi.item_product_id WHERE bi.bundle_product_id = p.id)
		FROM products p WHERE p.user_id = $1 AND p.is_active = true AND p.is_donation = false AND p.is_event = false
	`, userID)
	if err == nil {
		defer productRows.Close()
		for productRows.Next() {
			var p publicItem
			if err := productRows.Scan(&p.ID, &p.Name, &p.PriceIDR, &p.CoverImage, &p.EffectivePriceIDR, &p.IsFlashSaleActive,
				&p.PwywEnabled, &p.PwywMinPriceIDR, &p.IsBundle, &p.BundleOriginalPriceIDR); err == nil {
				resp.Products = append(resp.Products, p)
			}
		}
	}

	var donation publicDonation
	var minAmount *int64
	if err := h.DB.QueryRow(ctx, `
		SELECT id, name, pwyw_min_price_idr FROM products
		WHERE user_id = $1 AND is_donation = true AND is_active = true
	`, userID).Scan(&donation.ProductID, &donation.Title, &minAmount); err == nil {
		if minAmount != nil {
			donation.MinAmountIDR = *minAmount
		}
		resp.Donation = &donation
	}

	// No.90 (Sprint 11): event yang sudah lewat TIDAK ditampilkan lagi
	// (event_ends_at < now()) -- tidak ada gunanya menjual tiket ke acara
	// yang sudah selesai.
	resp.Events = []publicEvent{}
	eventRows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, p.description, `+effectivePriceExpr+`,
			p.event_starts_at, p.event_ends_at, p.event_timezone, p.event_location, p.event_is_online,
			p.event_capacity, (SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id)
		FROM products p
		WHERE p.user_id = $1 AND p.is_active = true AND p.is_event = true AND p.event_ends_at >= now()
		ORDER BY p.event_starts_at ASC
	`, userID)
	if err == nil {
		defer eventRows.Close()
		for eventRows.Next() {
			var ev publicEvent
			var capacity *int
			var attendeeCount int
			if err := eventRows.Scan(&ev.ProductID, &ev.Name, &ev.Description, &ev.EffectivePriceIDR, &ev.IsFlashSaleActive,
				&ev.StartsAt, &ev.EndsAt, &ev.Timezone, &ev.Location, &ev.IsOnline, &capacity, &attendeeCount); err == nil {
				if capacity != nil {
					left := *capacity - attendeeCount
					if left < 0 {
						left = 0
					}
					ev.SpotsLeft = &left
				}
				resp.Events = append(resp.Events, ev)
			}
		}
	}

	var leadCapture publicLeadCapture
	if err := h.DB.QueryRow(ctx, `
		SELECT title, collect_email, collect_whatsapp FROM lead_capture_settings
		WHERE user_id = $1 AND is_active = true
	`, userID).Scan(&leadCapture.Title, &leadCapture.CollectEmail, &leadCapture.CollectWhatsapp); err == nil {
		resp.LeadCapture = &leadCapture
	}

	var spActive, spShowOnProductPage bool
	var spDisplaySeconds, spIntervalSeconds int
	if err := h.DB.QueryRow(ctx, `
		SELECT is_active, show_on_product_page, display_seconds, interval_seconds
		FROM social_proof_settings WHERE user_id = $1
	`, userID).Scan(&spActive, &spShowOnProductPage, &spDisplaySeconds, &spIntervalSeconds); err == nil && spActive && spShowOnProductPage {
		recent := fetchRecentPurchases(ctx, h.DB, `
			SELECT p.name, o.buyer_email, o.created_at
			FROM orders o JOIN products p ON p.id = o.product_id
			WHERE p.user_id = $1 AND o.status = 'paid'
			ORDER BY o.created_at DESC LIMIT 10
		`, userID)
		if len(recent) > 0 {
			resp.SocialProof = &publicSocialProof{DisplaySeconds: spDisplaySeconds, IntervalSeconds: spIntervalSeconds, Recent: recent}
		}
	}

	if h.RDB != nil {
		if encoded, err := json.Marshal(resp); err == nil {
			h.RDB.Set(ctx, cacheKey, encoded, publicPageCacheTTL)
		}
	}

	c.Header("X-Cache", "MISS")
	c.JSON(http.StatusOK, resp)
}

type myPageResponse struct {
	Username              string             `json:"username"`
	Bio                   string             `json:"bio"`
	AvatarURL             string             `json:"avatar_url"`
	Theme                 string             `json:"theme"`
	IsPublished           bool               `json:"is_published"`
	SeoTitle              string             `json:"seo_title"`
	SeoDescription        string             `json:"seo_description"`
	Noindex               bool               `json:"noindex"`
	CustomBackgroundType  string             `json:"custom_background_type"`
	CustomBackgroundValue string             `json:"custom_background_value"`
	CustomFont            string             `json:"custom_font"`
	CustomButtonColor     string             `json:"custom_button_color"`
	Verification          verificationStatus `json:"verification"`
}

// verificationStatus -- No.88 (Sprint 10): rincian syarat badge terverifikasi
// supaya dashboard bisa menunjukkan progres ("2/3 syarat terpenuhi, tambahkan
// X") alih-alih hanya boolean tunggal seperti di halaman publik.
type verificationStatus struct {
	EmailVerified   bool `json:"email_verified"`
	ProfileComplete bool `json:"profile_complete"`
	HasPaidOrder    bool `json:"has_paid_order"`
	IsVerified      bool `json:"is_verified"`
}

// GetMyPage — dipakai dashboard untuk memuat pengaturan halaman milik kreator
// yang sedang login (tema, bio, status publish, SEO, kustomisasi lanjutan).
func (h *PageHandler) GetMyPage(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp myPageResponse
	var emailVerified bool
	err := h.DB.QueryRow(ctx, `
		SELECT u.username, p.bio, p.avatar_url, p.theme, p.is_published, p.seo_title, p.seo_description, p.noindex,
			p.custom_background_type, p.custom_background_value, p.custom_font, p.custom_button_color,
			u.email_verified_at IS NOT NULL
		FROM pages p JOIN users u ON u.id = p.user_id
		WHERE p.user_id = $1
	`, userID).Scan(&resp.Username, &resp.Bio, &resp.AvatarURL, &resp.Theme, &resp.IsPublished,
		&resp.SeoTitle, &resp.SeoDescription, &resp.Noindex,
		&resp.CustomBackgroundType, &resp.CustomBackgroundValue, &resp.CustomFont, &resp.CustomButtonColor,
		&emailVerified)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}

	var hasPaidOrder bool
	_ = h.DB.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM orders o JOIN products pr ON pr.id = o.product_id WHERE pr.user_id = $1 AND o.status = 'paid')
	`, userID).Scan(&hasPaidOrder)
	profileComplete := resp.Bio != "" && resp.AvatarURL != ""
	resp.Verification = verificationStatus{
		EmailVerified:   emailVerified,
		ProfileComplete: profileComplete,
		HasPaidOrder:    hasPaidOrder,
		IsVerified:      emailVerified && profileComplete && hasPaidOrder,
	}

	c.JSON(http.StatusOK, resp)
}

// availableThemes — preset tema (REQ-F-204) + "custom" (No.80, Sprint 9):
// kustomisasi lanjutan (latar/font/warna tombol) di luar 5 preset.
var availableThemes = map[string]bool{
	"default": true, "midnight": true, "sunrise": true, "forest": true, "minimal": true, "custom": true,
}

var availableCustomFonts = map[string]bool{
	"inter": true, "playfair": true, "lora": true, "montserrat": true, "roboto-mono": true,
}

type updatePageRequest struct {
	Theme                 *string `json:"theme"`
	Bio                   *string `json:"bio" binding:"omitempty,max=160"`
	IsPublished           *bool   `json:"is_published"`
	SeoTitle              *string `json:"seo_title" binding:"omitempty,max=70"`
	SeoDescription        *string `json:"seo_description" binding:"omitempty,max=160"`
	Noindex               *bool   `json:"noindex"`
	CustomBackgroundType  *string `json:"custom_background_type" binding:"omitempty,oneof=solid image"`
	CustomBackgroundValue *string `json:"custom_background_value" binding:"omitempty,max=500"`
	CustomFont            *string `json:"custom_font"`
	CustomButtonColor     *string `json:"custom_button_color" binding:"omitempty,len=7"`
}

// UpdateMyPage — REQ-F-204 (ganti tema/bio) & penerbitan halaman (is_published).
// No.80 (Sprint 9): kustomisasi lanjutan (latar/font/warna tombol) hanya
// berlaku kalau theme="custom" -- kolomnya tetap disimpan lepas dari nilai
// theme saat ini supaya kreator tidak kehilangan pengaturannya kalau
// sementara ganti-ganti preset untuk dibandingkan.
func (h *PageHandler) UpdateMyPage(c *gin.Context) {
	var req updatePageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Theme != nil && !availableThemes[*req.Theme] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tema tidak dikenal"})
		return
	}
	if req.CustomFont != nil && !availableCustomFonts[*req.CustomFont] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pilihan font tidak dikenal"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var username string
	_, err := h.DB.Exec(ctx, `
		UPDATE pages SET
			theme = COALESCE($1, theme),
			bio = COALESCE($2, bio),
			is_published = COALESCE($3, is_published),
			seo_title = COALESCE($4, seo_title),
			seo_description = COALESCE($5, seo_description),
			noindex = COALESCE($6, noindex),
			custom_background_type = COALESCE($7, custom_background_type),
			custom_background_value = COALESCE($8, custom_background_value),
			custom_font = COALESCE($9, custom_font),
			custom_button_color = COALESCE($10, custom_button_color)
		WHERE user_id = $11
	`, req.Theme, req.Bio, req.IsPublished, req.SeoTitle, req.SeoDescription, req.Noindex,
		req.CustomBackgroundType, req.CustomBackgroundValue, req.CustomFont, req.CustomButtonColor, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui halaman"})
		return
	}

	if h.RDB != nil {
		if scanErr := h.DB.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); scanErr == nil {
			h.RDB.Del(ctx, "page:"+username)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "halaman diperbarui"})
}

// maxAvatarSize -- 5MB, cukup untuk foto profil tanpa membebani VPS shared.
const maxAvatarSize = 5 * 1024 * 1024

// allowedAvatarExt -- daftar putih ekstensi gambar + content-type yang benar
// untuk disetel saat upload (TIDAK dipercaya begitu saja dari header yang
// dikirim klien, tidak seperti product.go, karena avatar disajikan langsung
// ke <img> di halaman publik lewat URL permanen -- content-type yang salah
// bisa membuat browser menolak menampilkannya).
var allowedAvatarExt = map[string]string{
	".jpg": "image/jpeg", ".jpeg": "image/jpeg",
	".png": "image/png", ".webp": "image/webp",
}

// UploadAvatar — REQ-F-205: unggah foto profil. Key SELALU
// "avatars/<userID>" (tanpa ekstensi di nama file) supaya unggahan ulang
// menimpa object yang sama persis -- tidak ada file avatar lama yang
// menumpuk di storage tiap kali kreator ganti foto profil.
func (h *PageHandler) UploadAvatar(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	fileHeader, err := c.FormFile("avatar")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"avatar\")"})
		return
	}

	if fileHeader.Size > maxAvatarSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 5MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	contentType, ok := allowedAvatarExt[ext]
	if !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan jpg/png/webp", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	key := fmt.Sprintf("avatars/%s", userID)
	if err := h.Storage.Upload(ctx, key, file, fileHeader.Size, contentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah foto profil"})
		return
	}

	avatarURL := h.Storage.PublicURL(key)
	var username string
	err = h.DB.QueryRow(ctx, `
		UPDATE pages SET avatar_url = $1
		FROM users u WHERE pages.user_id = $2 AND u.id = pages.user_id
		RETURNING u.username
	`, avatarURL, userID).Scan(&username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "foto terunggah tapi gagal menyimpan referensinya"})
		return
	}

	if h.RDB != nil {
		h.RDB.Del(ctx, "page:"+username)
	}

	c.JSON(http.StatusOK, gin.H{"avatar_url": avatarURL, "message": "foto profil berhasil diunggah"})
}
