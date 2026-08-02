package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"regexp"
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
	ID       string `json:"id"`
	Username string `json:"username"`
	// DisplayName -- permintaan langsung pengguna: nama tampilan bebas
	// (mis. "PIKO"), terpisah dari username (identitas URL). Kosong berarti
	// kreator belum pernah mengisi -- jatuh balik ke username TANPA "@" di
	// sisi klien (lihat toPreviewData di PagePreview.tsx), bukan dipaksa
	// isi di backend supaya kreator lama tidak kehilangan apa pun.
	DisplayName           string `json:"display_name"`
	Bio                   string `json:"bio"`
	AvatarURL             string `json:"avatar_url"`
	Theme                 string `json:"theme"`
	SeoTitle              string `json:"seo_title"`
	SeoDescription        string `json:"seo_description"`
	Noindex               bool   `json:"noindex"`
	CustomBackgroundType  string `json:"custom_background_type"`
	CustomBackgroundValue string `json:"custom_background_value"`
	CustomFont            string `json:"custom_font"`
	CustomButtonColor     string `json:"custom_button_color"`
	// CustomButtonStyle -- "Desain 2.0": fill/outline/glass, HANYA relevan
	// kalau Theme="custom".
	CustomButtonStyle string `json:"custom_button_style"`
	// CustomButtonRounded/Shadow/TextColor & CustomPageTextColor/TitleFont/
	// TitleColor -- permintaan langsung pengguna (referensi tangkapan layar):
	// kontrol tombol & teks yang lebih lengkap. CustomStyleOverride
	// menentukan apakah field-field ini DITERAPKAN -- BUKAN lagi terikat ke
	// Theme="custom" (bug: dulu menyentuh panel Tombol/Font memaksa ganti
	// Theme jadi "custom", ikut membuang latar/mood preset yang sudah
	// dipilih) -- sekarang bisa jadi lapisan independen di atas tema APAPUN,
	// lihat komentar getPageTheme di page-themes.ts.
	CustomButtonRounded   string             `json:"custom_button_rounded"`
	CustomButtonShadow    string             `json:"custom_button_shadow"`
	CustomButtonTextColor string             `json:"custom_button_text_color"`
	CustomPageTextColor   string             `json:"custom_page_text_color"`
	CustomTitleFont       string             `json:"custom_title_font"`
	CustomTitleColor      string             `json:"custom_title_color"`
	CustomStyleOverride   bool               `json:"custom_style_override"`
	Links                 []publicLink       `json:"links"`
	Products              []publicItem       `json:"products"`
	Donation              *publicDonation    `json:"donation"`
	LeadCapture           *publicLeadCapture `json:"lead_capture"`
	SocialProof           *publicSocialProof `json:"social_proof"`
	IsVerified            bool               `json:"is_verified"`
	Events                []publicEvent      `json:"events"`
	Bookings              []publicBooking    `json:"bookings"`
	// LoyaltyActive -- No.94 (Sprint 13): cuma penanda ada/tidaknya program
	// poin, BUKAN saldo poin pengunjung (itu perlu email, dicek terpisah
	// lewat GET /pages/:username/loyalty).
	LoyaltyActive bool `json:"loyalty_active"`
	// PageType -- No.99 (Sprint 14): "bio" (halaman utama SELALU "bio") atau
	// "landing" (builder blok manual, halaman tambahan No.98 saja).
	PageType string `json:"page_type"`
}

// publicBooking -- No.92 (Sprint 11): blok booking konsultasi, TIDAK ikut
// array Products (harus pilih slot dulu sebelum bisa checkout, beda dari
// alur beli langsung produk biasa). Daftar slot yang tersedia dimuat
// TERPISAH lewat GET /products/:id/available-slots (lazy, bukan
// digabungkan di sini) supaya payload halaman utama tetap ringan.
type publicBooking struct {
	ProductID          string `json:"product_id"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	PriceIDR           int64  `json:"price_idr"`
	DurationMinutes    int    `json:"duration_minutes"`
	AvailableSlotCount int    `json:"available_slot_count"`
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
	// CustomIconURL -- permintaan langsung pengguna: gambar kustom per
	// tautan, MENGGANTIKAN ikon platform yang terdeteksi otomatis dari URL
	// di sisi klien (lihat lib/link-icons.ts). Kosong berarti tetap pakai
	// deteksi otomatis.
	CustomIconURL string `json:"custom_icon_url"`
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
	// No.91 (Sprint 11): kursus tampil di grid Produk yang sama seperti
	// produk biasa (bukan blok tersendiri seperti Event/Donation), cukup
	// ditandai jumlah bab-nya.
	IsCourse     bool `json:"is_course"`
	ChapterCount int  `json:"chapter_count"`
}

// GetPublicPage — REQ-F-201: diakses tanpa login di jeonme.com/{username}.
// Endpoint trafik tertinggi di seluruh sistem, jadi dicek dulu di cache Redis
// (NF-01/02) sebelum menyentuh database. HANYA menjangkau halaman UTAMA
// (is_primary=true) -- halaman TAMBAHAN (No.98) diakses lewat slug sendiri,
// lihat GetPublicPageBySlug.
func (h *PageHandler) GetPublicPage(c *gin.Context) {
	username := c.Param("username")
	cacheKey := "page:" + username

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if h.servePublicPageFromCache(c, ctx, cacheKey) {
		return
	}

	var resp publicPageResponse
	var userID, pageID string
	var emailVerified bool
	err := h.DB.QueryRow(ctx, `
		SELECT u.id, p.id, u.username, p.display_name, p.bio, p.avatar_url, p.theme, p.seo_title, p.seo_description, p.noindex,
			p.custom_background_type, p.custom_background_value, p.custom_font, p.custom_button_color, p.custom_button_style,
			p.custom_button_rounded, p.custom_button_shadow, p.custom_button_text_color,
			p.custom_page_text_color, p.custom_title_font, p.custom_title_color, p.custom_style_override,
			u.email_verified_at IS NOT NULL
		FROM users u
		JOIN pages p ON p.user_id = u.id
		WHERE u.username = $1 AND p.is_primary = true AND p.is_published = true
			AND u.deactivated_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM account_deletion_requests d WHERE d.user_id = u.id AND d.status = 'pending')
	`, username).Scan(&userID, &pageID, &resp.Username, &resp.DisplayName, &resp.Bio, &resp.AvatarURL, &resp.Theme,
		&resp.SeoTitle, &resp.SeoDescription, &resp.Noindex,
		&resp.CustomBackgroundType, &resp.CustomBackgroundValue, &resp.CustomFont, &resp.CustomButtonColor, &resp.CustomButtonStyle,
		&resp.CustomButtonRounded, &resp.CustomButtonShadow, &resp.CustomButtonTextColor,
		&resp.CustomPageTextColor, &resp.CustomTitleFont, &resp.CustomTitleColor, &resp.CustomStyleOverride,
		&emailVerified)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}
	resp.ID = pageID
	resp.PageType = "bio"

	h.finishPublicPageResponse(c, ctx, "page:"+username, userID, pageID, emailVerified, &resp)
}

// ResolveUsernameRedirect — Modul Settings §2: dipanggil frontend HANYA
// setelah GetPublicPage 404, untuk membedakan "benar-benar tidak pernah
// ada" dari "username lama, pemiliknya sudah ganti nama". Sengaja endpoint
// TERPISAH (bukan disisipkan ke body 404 GetPublicPage) supaya kontrak
// respons GetPublicPage yang sudah ada tidak berubah bentuk. Window 90 hari
// dihitung di query time dari username_history.changed_at, sama seperti
// checkUsernameAvailable (lihat username.go) yang menegakkan sisi lainnya
// (anti-squatting) dari aturan yang sama.
func (h *PageHandler) ResolveUsernameRedirect(c *gin.Context) {
	oldUsername := c.Param("username")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var newUsername string
	err := h.DB.QueryRow(ctx, `
		SELECT u.username
		FROM username_history h
		JOIN users u ON u.id = h.user_id
		WHERE lower(h.old_username) = lower($1) AND h.changed_at > now() - interval '90 days'
		ORDER BY h.changed_at DESC
		LIMIT 1
	`, oldUsername).Scan(&newUsername)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "tidak ada redirect untuk username ini"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa redirect"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"new_username": newUsername})
}

// GetPublicPageBySlug — No.98 (Sprint 14): diakses tanpa login di
// jeonme.com/p/{slug}, namespace terpisah dari username akun supaya tidak
// bentrok. Halaman tambahan berbagi katalog produk/monetisasi yang SAMA
// dengan kreatornya (lihat catatan lingkup di migrasi 000029) -- cuma
// bio/avatar/tema/tautan yang independen per halaman.
func (h *PageHandler) GetPublicPageBySlug(c *gin.Context) {
	slug := c.Param("slug")
	cacheKey := "page-slug:" + slug

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if h.servePublicPageFromCache(c, ctx, cacheKey) {
		return
	}

	var resp publicPageResponse
	var userID, pageID string
	var emailVerified bool
	err := h.DB.QueryRow(ctx, `
		SELECT p.user_id, p.id, u.username, p.display_name, p.bio, p.avatar_url, p.theme, p.seo_title, p.seo_description, p.noindex,
			p.custom_background_type, p.custom_background_value, p.custom_font, p.custom_button_color, p.custom_button_style,
			u.email_verified_at IS NOT NULL, p.page_type
		FROM pages p JOIN users u ON u.id = p.user_id
		WHERE p.slug = $1 AND p.is_published = true
			AND u.deactivated_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM account_deletion_requests d WHERE d.user_id = u.id AND d.status = 'pending')
	`, slug).Scan(&userID, &pageID, &resp.Username, &resp.DisplayName, &resp.Bio, &resp.AvatarURL, &resp.Theme,
		&resp.SeoTitle, &resp.SeoDescription, &resp.Noindex,
		&resp.CustomBackgroundType, &resp.CustomBackgroundValue, &resp.CustomFont, &resp.CustomButtonColor, &resp.CustomButtonStyle,
		&emailVerified, &resp.PageType)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}
	resp.ID = pageID

	h.finishPublicPageResponse(c, ctx, "page-slug:"+slug, userID, pageID, emailVerified, &resp)
}

// servePublicPageFromCache — dicek SEBELUM query DB apa pun (username/slug
// sudah cukup untuk membentuk cacheKey, tidak perlu resolusi userID/pageID
// dulu) supaya cache HIT tetap secepat sebelum halaman tambahan (No.98) ada.
func (h *PageHandler) servePublicPageFromCache(c *gin.Context, ctx context.Context, cacheKey string) bool {
	if h.RDB == nil {
		return false
	}
	cached, err := h.RDB.Get(ctx, cacheKey).Result()
	if err != nil {
		return false
	}
	var resp publicPageResponse
	if json.Unmarshal([]byte(cached), &resp) != nil {
		return false
	}
	c.Header("X-Cache", "HIT")
	c.JSON(http.StatusOK, resp)
	return true
}

// finishPublicPageResponse — logika inti halaman publik (badge terverifikasi,
// tautan, produk & seluruh blok monetisasi + penyimpanan cache), dipakai
// bersama oleh GetPublicPage (halaman utama) & GetPublicPageBySlug (No.98,
// halaman tambahan) supaya tidak ada duplikasi query. userID menentukan
// katalog produk/monetisasi (dibagi lintas SEMUA halaman kreator), pageID
// menentukan daftar tautan (independen PER halaman).
func (h *PageHandler) finishPublicPageResponse(c *gin.Context, ctx context.Context, cacheKey, userID, pageID string, emailVerified bool, resp *publicPageResponse) {
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
		SELECT id, title, url, COALESCE(lock_type, ''), lock_min_age, block_type, block_data, custom_icon_url FROM links
		WHERE page_id = $1
		AND is_active = true
		AND (starts_at IS NULL OR starts_at <= now())
		AND (ends_at IS NULL OR ends_at >= now())
		ORDER BY position ASC
	`, pageID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var l publicLink
			if err := rows.Scan(&l.ID, &l.Title, &l.URL, &l.LockType, &l.LockMinAge, &l.BlockType, &l.BlockData, &l.CustomIconURL); err == nil {
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
	// No.71/90/92: blok dukungan/donasi, event, & booking DIFILTER di sini --
	// masing-masing tampil sebagai blok tersendiri (resp.Donation/resp.
	// Events/resp.Bookings), bukan kartu di grid Produk.
	resp.Products = []publicItem{}
	productRows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, p.price_idr, p.cover_image_url, `+effectivePriceExpr+`, p.pwyw_enabled, p.pwyw_min_price_idr,
			p.is_bundle,
			(SELECT SUM(ip.price_idr) FROM bundle_items bi JOIN products ip ON ip.id = bi.item_product_id WHERE bi.bundle_product_id = p.id),
			p.is_course,
			(SELECT COUNT(*) FROM course_chapters cc WHERE cc.course_product_id = p.id)
		FROM products p WHERE p.user_id = $1 AND p.is_active = true AND p.is_donation = false AND p.is_event = false AND p.is_booking = false
	`, userID)
	if err == nil {
		defer productRows.Close()
		for productRows.Next() {
			var p publicItem
			if err := productRows.Scan(&p.ID, &p.Name, &p.PriceIDR, &p.CoverImage, &p.EffectivePriceIDR, &p.IsFlashSaleActive,
				&p.PwywEnabled, &p.PwywMinPriceIDR, &p.IsBundle, &p.BundleOriginalPriceIDR,
				&p.IsCourse, &p.ChapterCount); err == nil {
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

	// No.92 (Sprint 11): hanya booking dengan minimal 1 slot tersedia yang
	// ditampilkan -- tidak ada gunanya menampilkan blok booking yang tidak
	// bisa dipesan sama sekali.
	resp.Bookings = []publicBooking{}
	bookingRows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, p.description, p.price_idr, p.booking_duration_minutes,
			(SELECT COUNT(*) FROM booking_slots bs WHERE bs.booking_product_id = p.id AND bs.order_id IS NULL AND bs.starts_at > now())
		FROM products p
		WHERE p.user_id = $1 AND p.is_active = true AND p.is_booking = true
	`, userID)
	if err == nil {
		defer bookingRows.Close()
		for bookingRows.Next() {
			var bk publicBooking
			if err := bookingRows.Scan(&bk.ProductID, &bk.Name, &bk.Description, &bk.PriceIDR, &bk.DurationMinutes, &bk.AvailableSlotCount); err == nil && bk.AvailableSlotCount > 0 {
				resp.Bookings = append(resp.Bookings, bk)
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

	_ = h.DB.QueryRow(ctx, `SELECT is_active FROM loyalty_settings WHERE user_id = $1`, userID).Scan(&resp.LoyaltyActive)

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
	DisplayName           string             `json:"display_name"`
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
	CustomButtonStyle     string             `json:"custom_button_style"`
	CustomButtonRounded   string             `json:"custom_button_rounded"`
	CustomButtonShadow    string             `json:"custom_button_shadow"`
	CustomButtonTextColor string             `json:"custom_button_text_color"`
	CustomPageTextColor   string             `json:"custom_page_text_color"`
	CustomTitleFont       string             `json:"custom_title_font"`
	CustomTitleColor      string             `json:"custom_title_color"`
	CustomStyleOverride   bool               `json:"custom_style_override"`
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
		SELECT u.username, p.display_name, p.bio, p.avatar_url, p.theme, p.is_published, p.seo_title, p.seo_description, p.noindex,
			p.custom_background_type, p.custom_background_value, p.custom_font, p.custom_button_color, p.custom_button_style,
			p.custom_button_rounded, p.custom_button_shadow, p.custom_button_text_color,
			p.custom_page_text_color, p.custom_title_font, p.custom_title_color, p.custom_style_override,
			u.email_verified_at IS NOT NULL
		FROM pages p JOIN users u ON u.id = p.user_id
		WHERE p.user_id = $1 AND p.is_primary = true
	`, userID).Scan(&resp.Username, &resp.DisplayName, &resp.Bio, &resp.AvatarURL, &resp.Theme, &resp.IsPublished,
		&resp.SeoTitle, &resp.SeoDescription, &resp.Noindex,
		&resp.CustomBackgroundType, &resp.CustomBackgroundValue, &resp.CustomFont, &resp.CustomButtonColor, &resp.CustomButtonStyle,
		&resp.CustomButtonRounded, &resp.CustomButtonShadow, &resp.CustomButtonTextColor,
		&resp.CustomPageTextColor, &resp.CustomTitleFont, &resp.CustomTitleColor, &resp.CustomStyleOverride,
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
// kustomisasi lanjutan (latar/font/warna tombol) di luar preset. "Desain 2.0"
// (permintaan langsung pengguna, di luar backlog Excel): preset diperluas
// dari 5 jadi 10, lalu ditambah 6 lagi bernuansa gradien vivid (bloom/blaze/
// cyber/mint/golden/cosmic) supaya galeri template lebih variatif ala
// Linktree/Lynk.id.
var availableThemes = map[string]bool{
	"default": true, "midnight": true, "sunrise": true, "forest": true, "minimal": true,
	"rose": true, "ocean": true, "lavender": true, "noir": true, "peach": true,
	"bloom": true, "blaze": true, "cyber": true, "mint": true, "golden": true, "cosmic": true,
	"dusk": true, "marble": true, "nightfall": true, "mist": true, "berry": true,
	// 5 wallpaper TAMBAHAN (permintaan langsung pengguna: "tambahkan 5 lagi
	// pilihan tema menggunakan walpaper").
	"amber": true, "valley": true, "storm": true, "frost": true, "dew": true,
	// 6 preset WARNA SOLID baru (permintaan langsung pengguna: "tambahkan
	// warna warna seperti ini bukan hanya gradient saja").
	"air": true, "lake": true, "mineral": true, "blocks": true, "haven": true, "grid": true,
	// 2 preset gradien CSS baru (permintaan langsung pengguna): "Mesh
	// Gradient" & "Aurora Gradient".
	"mesh": true, "aurora": true,
	// 12 preset gradien CSS TAMBAHAN (klarifikasi pengguna: "pertema buat 2"
	// berarti 2 VARIAN per masing-masing 7 konsep yang dibagikan, bukan
	// pilih 2 dari 7) -- prism/borealis (varian ke-2 Mesh/Aurora), orbit/
	// halo (Radial Gradient), lava/bubble (Blob Background), canvas/static
	// (Grain/Noise Background), crystal/aqua (Glassmorphism Background),
	// nebula/flux (Abstract Blur Background).
	"prism": true, "borealis": true, "orbit": true, "halo": true,
	"lava": true, "bubble": true, "canvas": true, "static": true,
	"crystal": true, "aqua": true, "nebula": true, "flux": true,
	// 5 preset glassmorphism tambahan + 5 preset wallpaper foto tambahan
	// (permintaan langsung pengguna: "tambahkan 5 tema glassmorphism dan 5
	// tema walpaper lagi").
	"sapphire": true, "opal": true, "quartz": true, "glacier": true, "mirage": true,
	"canyon": true, "highland": true, "cascade": true, "tide": true, "skyline": true,
	"custom": true,
}

// availableCustomFonts -- "Desain 2.0": diperluas dari 5 jadi 9 pilihan font
// (Poppins/Quicksand/Merriweather/Space Grotesk ditambahkan).
var availableCustomFonts = map[string]bool{
	"inter": true, "playfair": true, "lora": true, "montserrat": true, "roboto-mono": true,
	"poppins": true, "quicksand": true, "merriweather": true, "space-grotesk": true,
}

type updatePageRequest struct {
	Theme                 *string `json:"theme"`
	DisplayName           *string `json:"display_name" binding:"omitempty,max=100"`
	Bio                   *string `json:"bio" binding:"omitempty,max=160"`
	IsPublished           *bool   `json:"is_published"`
	SeoTitle              *string `json:"seo_title" binding:"omitempty,max=70"`
	SeoDescription        *string `json:"seo_description" binding:"omitempty,max=160"`
	Noindex               *bool   `json:"noindex"`
	CustomBackgroundType  *string `json:"custom_background_type" binding:"omitempty,oneof=solid image gradient"`
	CustomBackgroundValue *string `json:"custom_background_value" binding:"omitempty,max=500"`
	CustomFont            *string `json:"custom_font"`
	CustomButtonColor     *string `json:"custom_button_color" binding:"omitempty,len=7"`
	// CustomButtonStyle -- "Desain 2.0": axis gaya tombol (fill=isi penuh,
	// outline=transparan+border, glass=transparan+blur ala kaca). "shadow"
	// (nilai lama) sudah dilebur jadi axis independen CustomButtonShadow
	// lewat migrasi 000034.
	CustomButtonStyle *string `json:"custom_button_style" binding:"omitempty,oneof=fill outline glass"`
	// CustomButtonRounded/Shadow/TextColor & CustomPageTextColor/TitleFont/
	// TitleColor -- permintaan langsung pengguna (referensi tangkapan layar
	// panel "Buttons"/"Fonts"): kontrol lebih lengkap, semua opsional.
	// DITERAPKAN hanya kalau CustomStyleOverride true -- BUKAN lagi terikat
	// ke theme="custom" (lihat migrasi 000035: bug lama memaksa ganti theme
	// tiap kali panel ini disentuh, ikut membuang preset yang sudah dipilih).
	// *Color kosong ("") berarti "ikuti warna bawaan tema" (divalidasi
	// manual di bawah, bukan lewat binding len=7, supaya string kosong
	// tetap diterima).
	CustomButtonRounded   *string `json:"custom_button_rounded" binding:"omitempty,oneof=none sm md full"`
	CustomButtonShadow    *string `json:"custom_button_shadow" binding:"omitempty,oneof=none soft strong hard"`
	CustomButtonTextColor *string `json:"custom_button_text_color" binding:"omitempty,len=7"`
	CustomPageTextColor   *string `json:"custom_page_text_color" binding:"omitempty,max=7"`
	// CustomTitleFont -- kosong berarti "samakan dengan font halaman"
	// (toggle "Alternative title font" pada referensi, default mati).
	CustomTitleFont  *string `json:"custom_title_font" binding:"omitempty,max=20"`
	CustomTitleColor *string `json:"custom_title_color" binding:"omitempty,max=7"`
	// CustomStyleOverride -- migrasi 000035 (bug dilaporkan pengguna):
	// dinyalakan otomatis oleh frontend begitu kreator menyentuh panel
	// Tombol ATAU Font, TANPA memaksa `theme` berubah -- lihat komentar
	// getPageTheme (page-themes.ts) untuk cara lapisan ini diterapkan di
	// atas tema APAPUN.
	CustomStyleOverride *bool `json:"custom_style_override"`
}

// UpdateMyPage — REQ-F-204 (ganti tema/bio) & penerbitan halaman (is_published).
// No.80 (Sprint 9): kustomisasi lanjutan (latar/font/warna tombol) TIDAK lagi
// terikat ke theme="custom" (bug diperbaiki lewat migrasi 000035) --
// kolomnya tetap disimpan lepas dari nilai theme saat ini supaya kreator
// tidak kehilangan pengaturannya kalau sementara ganti-ganti preset untuk
// dibandingkan, DAN supaya kustomisasi tombol/font bisa diterapkan di atas
// preset apa pun, bukan cuma di atas latar "custom".
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
	// CustomTitleFont kosong ("") itu SAH (berarti "samakan dengan font
	// halaman") -- cuma tolak kalau diisi TAPI bukan salah satu pilihan yang
	// dikenal, beda dari CustomFont (halaman) yang selalu wajib terisi.
	if req.CustomTitleFont != nil && *req.CustomTitleFont != "" && !availableCustomFonts[*req.CustomTitleFont] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pilihan font judul tidak dikenal"})
		return
	}
	if req.CustomPageTextColor != nil && *req.CustomPageTextColor != "" && len(*req.CustomPageTextColor) != 7 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "warna teks halaman harus kode hex 7 karakter (mis. #FFFFFF) atau dikosongkan"})
		return
	}
	if req.CustomTitleColor != nil && *req.CustomTitleColor != "" && len(*req.CustomTitleColor) != 7 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "warna judul harus kode hex 7 karakter (mis. #FFFFFF) atau dikosongkan"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var username string
	_, err := h.DB.Exec(ctx, `
		UPDATE pages SET
			theme = COALESCE($1, theme),
			display_name = COALESCE($2, display_name),
			bio = COALESCE($3, bio),
			is_published = COALESCE($4, is_published),
			seo_title = COALESCE($5, seo_title),
			seo_description = COALESCE($6, seo_description),
			noindex = COALESCE($7, noindex),
			custom_background_type = COALESCE($8, custom_background_type),
			custom_background_value = COALESCE($9, custom_background_value),
			custom_font = COALESCE($10, custom_font),
			custom_button_color = COALESCE($11, custom_button_color),
			custom_button_style = COALESCE($12, custom_button_style),
			custom_button_rounded = COALESCE($13, custom_button_rounded),
			custom_button_shadow = COALESCE($14, custom_button_shadow),
			custom_button_text_color = COALESCE($15, custom_button_text_color),
			custom_page_text_color = COALESCE($16, custom_page_text_color),
			custom_title_font = COALESCE($17, custom_title_font),
			custom_title_color = COALESCE($18, custom_title_color),
			custom_style_override = COALESCE($19, custom_style_override)
		WHERE user_id = $20 AND is_primary = true
	`, req.Theme, req.DisplayName, req.Bio, req.IsPublished, req.SeoTitle, req.SeoDescription, req.Noindex,
		req.CustomBackgroundType, req.CustomBackgroundValue, req.CustomFont, req.CustomButtonColor,
		req.CustomButtonStyle, req.CustomButtonRounded, req.CustomButtonShadow, req.CustomButtonTextColor,
		req.CustomPageTextColor, req.CustomTitleFont, req.CustomTitleColor, req.CustomStyleOverride, userID)
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

	// Query param "?v=<timestamp>" WAJIB ditambahkan & DISIMPAN ke DB (bukan
	// cuma di respons) -- key storage SELALU sama ("avatars/<userID>"), jadi
	// tanpa ini URL foto baru byte-identik dengan URL foto lama, & browser
	// (juga cache/CDN apa pun di depan storage) akan terus menampilkan foto
	// LAMA dari cache-nya sendiri walau unggahan baru sudah sukses di server
	// -- bug nyata yang dilaporkan pengguna ("upload tidak berubah, tidak ada
	// error") karena upload memang TIDAK gagal, cuma URL-nya tidak berubah.
	avatarURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	var username string
	err = h.DB.QueryRow(ctx, `
		UPDATE pages SET avatar_url = $1
		FROM users u WHERE pages.user_id = $2 AND u.id = pages.user_id AND pages.is_primary = true
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

// maxCustomBackgroundSize -- 8MB, sedikit lebih longgar dari avatar (5MB)
// karena wallpaper latar penuh biasanya berresolusi lebih tinggi daripada
// foto profil bulat kecil.
const maxCustomBackgroundSize = 8 * 1024 * 1024

// UploadCustomBackground -- bug dilaporkan pengguna: "tidak bisa mengupload
// gambar" -- akar masalah ditemukan lewat investigasi kode: opsi latar
// "Gambar" di halaman Desain SEBELUMNYA cuma kolom teks URL polos (kreator
// harus SUDAH punya foto ter-hosting di tempat lain & tahu URL langsungnya,
// tidak ada cara unggah file sama sekali dari perangkatnya sendiri).
// Endpoint baru ini mengisi celah itu -- pola SAMA PERSIS seperti
// UploadAvatar (key SELALU "backgrounds/<userID>" tanpa ekstensi supaya
// unggah ulang menimpa object lama, bukan menumpuk), langsung menyimpan
// custom_background_type="image" + custom_background_value=URL dalam satu
// request supaya frontend tidak perlu panggilan kedua ke UpdateMyPage.
func (h *PageHandler) UploadCustomBackground(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	fileHeader, err := c.FormFile("background")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"background\")"})
		return
	}

	if fileHeader.Size > maxCustomBackgroundSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 8MB"})
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

	key := fmt.Sprintf("backgrounds/%s", userID)
	if err := h.Storage.Upload(ctx, key, file, fileHeader.Size, contentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah gambar latar"})
		return
	}

	// Sama seperti UploadAvatar: "?v=<timestamp>" wajib disimpan ke DB, bukan
	// hanya di respons -- key storage selalu sama, tanpa ini URL byte-identik
	// antar-unggahan & browser/CDN akan terus menampilkan gambar latar lama.
	backgroundURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	var username string
	err = h.DB.QueryRow(ctx, `
		UPDATE pages SET custom_background_type = 'image', custom_background_value = $1
		FROM users u WHERE pages.user_id = $2 AND u.id = pages.user_id AND pages.is_primary = true
		RETURNING u.username
	`, backgroundURL, userID).Scan(&username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gambar terunggah tapi gagal menyimpan referensinya"})
		return
	}

	if h.RDB != nil {
		h.RDB.Del(ctx, "page:"+username)
	}

	c.JSON(http.StatusOK, gin.H{"custom_background_value": backgroundURL, "message": "gambar latar berhasil diunggah"})
}

// ---------- No.98 (Sprint 14): halaman bio tambahan per akun ----------
//
// Ditemukan lewat fitur "Your Pages" Linktree -- satu akun bisa kelola
// beberapa halaman bio terpisah, masing-masing dengan bio/tema/tautan
// sendiri, tapi TETAP berbagi katalog produk/event/booking/dst yang SAMA
// dengan kreatornya (monetisasi tetap per-USER, bukan per-halaman -- lihat
// catatan lingkup lengkap di migrasi 000029). Halaman UTAMA (is_primary=true,
// dibuat otomatis saat registrasi) TIDAK BERUBAH sama sekali -- semua route
// di atas (/dashboard/page, /dashboard/links, dst) tetap hanya menjangkau
// halaman utama. Halaman tambahan diakses publik lewat jeonme.com/p/{slug},
// namespace terpisah dari username akun.

var slugPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$`)

type extraPageItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Bio         string `json:"bio"`
	Theme       string `json:"theme"`
	IsPublished bool   `json:"is_published"`
	// PageType -- No.99 (Sprint 14): "bio" (default, No.98) atau "landing"
	// (builder blok manual, lihat catatan lingkup di migrasi 000030).
	PageType string `json:"page_type"`
}

// ListMyPages — daftar halaman TAMBAHAN milik kreator yang login (TIDAK
// termasuk halaman utama -- itu sudah dimuat lewat GetMyPage), dipakai
// dashboard untuk menampilkan pemilih/daftar halaman.
func (h *PageHandler) ListMyPages(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, name, COALESCE(slug, ''), bio, theme, is_published, page_type
		FROM pages WHERE user_id = $1 AND is_primary = false
		ORDER BY name ASC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman tambahan"})
		return
	}
	defer rows.Close()

	items := []extraPageItem{}
	for rows.Next() {
		var it extraPageItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Slug, &it.Bio, &it.Theme, &it.IsPublished, &it.PageType); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type createExtraPageRequest struct {
	Name string `json:"name" binding:"required,max=100"`
	Slug string `json:"slug" binding:"required,max=50"`
	// PageType -- No.99: opsional, default "bio" kalau kosong.
	PageType string `json:"page_type" binding:"omitempty,oneof=bio landing"`
}

// CreatePage — membuat halaman bio TAMBAHAN baru (is_primary=false), belum
// dipublikasikan sampai kreator mengisi & mempublikasikannya lewat UpdatePage.
func (h *PageHandler) CreatePage(c *gin.Context) {
	var req createExtraPageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	slug := strings.ToLower(strings.TrimSpace(req.Slug))
	if !slugPattern.MatchString(slug) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug hanya boleh huruf kecil, angka, dan tanda hubung (3-50 karakter)"})
		return
	}
	pageType := req.PageType
	if pageType == "" {
		pageType = "bio"
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var pageID string
	err := h.DB.QueryRow(ctx, `
		INSERT INTO pages (user_id, is_primary, name, slug, page_type) VALUES ($1, false, $2, $3, $4) RETURNING id
	`, userID, strings.TrimSpace(req.Name), slug, pageType).Scan(&pageID)
	if err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "slug ini sudah dipakai"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat halaman"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": pageID, "message": "halaman dibuat, isi & publikasikan lewat pengaturan halaman"})
}

type updateExtraPageRequest struct {
	Name                  *string `json:"name" binding:"omitempty,max=100"`
	Slug                  *string `json:"slug" binding:"omitempty,max=50"`
	Theme                 *string `json:"theme"`
	Bio                   *string `json:"bio" binding:"omitempty,max=160"`
	IsPublished           *bool   `json:"is_published"`
	CustomBackgroundType  *string `json:"custom_background_type" binding:"omitempty,oneof=solid image gradient"`
	CustomBackgroundValue *string `json:"custom_background_value" binding:"omitempty,max=500"`
	CustomFont            *string `json:"custom_font"`
	CustomButtonColor     *string `json:"custom_button_color" binding:"omitempty,len=7"`
	CustomButtonStyle     *string `json:"custom_button_style" binding:"omitempty,oneof=fill outline shadow"`
}

// UpdatePage — mengubah halaman TAMBAHAN (bukan halaman utama -- itu tetap
// lewat UpdateMyPage). Ditolak kalau pageID yang dituju ternyata halaman
// utama atau bukan milik kreator yang login.
func (h *PageHandler) UpdatePage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	var req updateExtraPageRequest
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
	var slug *string
	if req.Slug != nil {
		s := strings.ToLower(strings.TrimSpace(*req.Slug))
		if !slugPattern.MatchString(s) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "slug hanya boleh huruf kecil, angka, dan tanda hubung (3-50 karakter)"})
			return
		}
		slug = &s
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		UPDATE pages SET
			name = COALESCE($1, name),
			slug = COALESCE($2, slug),
			theme = COALESCE($3, theme),
			bio = COALESCE($4, bio),
			is_published = COALESCE($5, is_published),
			custom_background_type = COALESCE($6, custom_background_type),
			custom_background_value = COALESCE($7, custom_background_value),
			custom_font = COALESCE($8, custom_font),
			custom_button_color = COALESCE($9, custom_button_color),
			custom_button_style = COALESCE($10, custom_button_style)
		WHERE id = $11 AND user_id = $12 AND is_primary = false
	`, req.Name, slug, req.Theme, req.Bio, req.IsPublished,
		req.CustomBackgroundType, req.CustomBackgroundValue, req.CustomFont, req.CustomButtonColor, req.CustomButtonStyle,
		pageID, userID)
	if err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "slug ini sudah dipakai"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui halaman"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
		return
	}

	if h.RDB != nil {
		var currentSlug string
		if scanErr := h.DB.QueryRow(ctx, `SELECT slug FROM pages WHERE id = $1`, pageID).Scan(&currentSlug); scanErr == nil && currentSlug != "" {
			h.RDB.Del(ctx, "page-slug:"+currentSlug)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "halaman diperbarui"})
}

// DeletePage — menghapus halaman TAMBAHAN beserta seluruh tautannya
// (ON DELETE CASCADE). analytics_events yang mereferensikan tautan itu
// dihapus dulu DALAM SATU TRANSAKSI supaya cascade delete tautan tidak
// gagal karena FK analytics_events.link_id (NO ACTION, bukan CASCADE).
func (h *PageHandler) DeletePage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var slug string
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(slug, '') FROM pages WHERE id = $1 AND user_id = $2 AND is_primary = false
	`, pageID, userID).Scan(&slug); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM analytics_events WHERE link_id IN (SELECT id FROM links WHERE page_id = $1)
	`, pageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus halaman"})
		return
	}
	if _, err := tx.Exec(ctx, `DELETE FROM pages WHERE id = $1`, pageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus halaman"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus halaman"})
		return
	}

	if h.RDB != nil && slug != "" {
		h.RDB.Del(ctx, "page-slug:"+slug)
	}

	c.JSON(http.StatusOK, gin.H{"message": "halaman dihapus"})
}
