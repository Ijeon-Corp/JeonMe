package handlers

import (
	"bytes"
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
	"golang.org/x/sync/errgroup"

	"github.com/jeonme/api/internal/imageconv"
	"github.com/jeonme/api/internal/instagramoauth"
	"github.com/jeonme/api/internal/storage"
	"github.com/jeonme/api/internal/tiktokoauth"
)

// PageHandler mengimplementasikan REQ-F-201 (halaman publik) dan
// REQ-F-204 (ganti tema & bio). CRUD tautan ada di LinksHandler.
// Storage boleh nil (mis. kalau EnsureBucket gagal saat startup) --
// UploadAvatar akan menolak dengan pesan jelas alih-alih panic.
type PageHandler struct {
	DB      *pgxpool.Pool
	RDB     *redis.Client
	Storage *storage.Client
	// Instagram/TikTok -- Modul Koneksi Sosial (migrasi 000069), di-set
	// terpisah sesudah NewPageHandler (pola sama seperti AuthHandler.
	// GoogleOAuth) supaya dipakai GetPublicPage/GetPublicPageBySlug untuk
	// menampilkan feed (lihat fetchInstagramFeed/fetchTikTokFeed,
	// social_connect.go). Selalu non-nil, kredensial kosong ditangani
	// sendiri lewat soft-fail di fungsi itu.
	Instagram *instagramoauth.Client
	TikTok    *tiktokoauth.Client
}

func NewPageHandler(db *pgxpool.Pool, rdb *redis.Client, s3 *storage.Client) *PageHandler {
	return &PageHandler{DB: db, RDB: rdb, Storage: s3, Instagram: instagramoauth.NewClient("", ""), TikTok: tiktokoauth.NewClient("", "")}
}

// publicPageCacheTTL sengaja pendek (bukan invalidate-on-write untuk setiap
// mutasi tautan/produk) supaya implementasinya sederhana tapi staleness tetap
// terbatas -- cukup untuk endpoint baca-berat seperti ini (NF-01/02).
const publicPageCacheTTL = 30 * time.Second

// PageSticker -- Modul Desain (koreksi langsung pengguna, 8 Agustus 2026):
// stiker dekoratif INTERAKTIF -- kreator bisa taruh beberapa, masing-masing
// dengan posisi & ukuran sendiri (diatur lewat drag/resize di dashboard),
// bukan cuma satu pilihan tetap dekat avatar (migrasi 000056, diganti
// migrasi 000057). X/Y persen (0-100) relatif terhadap kanvas halaman,
// TITIK TENGAH stiker -- bukan piksel, supaya proporsional di layar apa
// pun. Scale 0.4-2.5 (lihat validateStickers).
type PageSticker struct {
	ID    string  `json:"id"`
	Type  string  `json:"type"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Scale float64 `json:"scale"`
}

// availableStickerTypes -- daftar bentuk stiker yang dikenal (lihat
// STICKER_SHAPES di page-themes.ts untuk render SVG-nya di frontend). Nama
// terinspirasi galeri stiker Pinterest (panah/kursor/dekoratif) -- SENGAJA
// bentuk garis/flat SVG, bukan tiruan gaya glossy 3D/foto, supaya ringan &
// tidak butuh aset gambar hosting terpisah.
var availableStickerTypes = map[string]bool{
	"arrow-curve": true, "arrow-straight": true, "arrow-sketch": true,
	"cursor-pixel": true, "cursor-hand": true, "pointing-hand": true,
	"star-sketch": true, "heart-sketch": true,
}

// maxStickersPerPage -- batas wajar supaya payload/render tidak membengkak
// tanpa terkendali, bukan angka yang berarti khusus.
const maxStickersPerPage = 20

// validateStickers -- dipakai UpdatePageStickers & UpdateExtraPageStickers.
// Ditolak (bukan cuma dipangkas diam-diam) supaya kreator tahu persis kenapa
// permintaannya gagal, bukan kehilangan data tanpa penjelasan.
func validateStickers(stickers []PageSticker) (string, bool) {
	if len(stickers) > maxStickersPerPage {
		return fmt.Sprintf("maksimal %d stiker per halaman", maxStickersPerPage), false
	}
	for _, s := range stickers {
		if !availableStickerTypes[s.Type] {
			return fmt.Sprintf("bentuk stiker %q tidak dikenal", s.Type), false
		}
		if s.X < 0 || s.X > 100 || s.Y < 0 || s.Y > 100 {
			return "posisi stiker harus dalam rentang 0-100 (persen)", false
		}
		if s.Scale < 0.4 || s.Scale > 2.5 {
			return "ukuran stiker harus dalam rentang 0.4-2.5", false
		}
	}
	return "", true
}

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
	CustomButtonRounded   string `json:"custom_button_rounded"`
	CustomButtonShadow    string `json:"custom_button_shadow"`
	CustomButtonTextColor string `json:"custom_button_text_color"`
	CustomPageTextColor   string `json:"custom_page_text_color"`
	CustomTitleFont       string `json:"custom_title_font"`
	CustomTitleColor      string `json:"custom_title_color"`
	CustomStyleOverride   bool   `json:"custom_style_override"`
	// Stickers -- Modul Desain: stiker dekoratif interaktif (posisi+ukuran
	// per stiker), array kosong = tidak ada. Berlaku sama untuk halaman
	// utama maupun tambahan.
	Stickers []PageSticker `json:"stickers"`
	// HideWatermark -- Modul Langganan Premium: toggle "sembunyikan pil
	// 'Buat halaman gratis di Jeonme' di footer", CUMA berlaku kalau
	// kreatornya Premium (dicek ulang lewat resp.IsPremium/IsVerified di
	// frontend, bukan dipercaya sendirian -- lihat catatan di migrasi
	// 000058). Kreator gratis SELALU tampil watermark apa pun nilai ini.
	HideWatermark bool `json:"hide_watermark"`
	// SocialInstagram..SocialEmail -- permintaan langsung pengguna, 11
	// Agustus 2026: baris ikon kontak sosial di bawah bio halaman publik,
	// TERPISAH dari daftar Links biasa. String kosong = platform itu belum
	// diisi, ikonnya tidak dirender (bukan ikon nonaktif). Nilai bisa
	// berupa handle SAJA atau URL lengkap -- dinormalisasi jadi href final
	// di frontend (lib/social-links.ts), sama seperti pola urlTemplate
	// SUGGESTED_PLATFORMS yang sudah ada.
	SocialInstagram string `json:"social_instagram"`
	SocialTiktok    string `json:"social_tiktok"`
	SocialFacebook  string `json:"social_facebook"`
	SocialWhatsapp  string `json:"social_whatsapp"`
	SocialYoutube   string `json:"social_youtube"`
	SocialX         string `json:"social_x"`
	SocialLinkedin  string `json:"social_linkedin"`
	SocialTelegram  string `json:"social_telegram"`
	SocialEmail     string `json:"social_email"`
	// LayoutVariant -- permintaan langsung pengguna, 11 Agustus 2026
	// (susulan Quick Setup), "card"/"spotlight" ditambah 12 Agustus 2026
	// ("tambahkan jenis model layout selain 2 yang sudah ada"), "cover"/
	// "minimal" ditambah lagi hari yang sama ("tambahkan lagi 2 bentuk
	// layout lain nya"), "hero" ditambah 13 Agustus 2026 (hasil analisa
	// benchmark Linktree/Lynk.id -- "Hero" Linktree BUKAN foto sampul
	// terpisah, cuma foto profil yang SAMA ditampilkan besar edge-to-edge,
	// jadi TIDAK butuh kolom/upload baru), "polaroid" ditambah hari yang
	// sama lagi (permintaan langsung pengguna: template Quick Setup per
	// kategori harus punya STRUKTUR layout berbeda-beda, bukan cuma tema/
	// isi blok -- dengan 8 kategori tapi baru 7 varian, kategori Lifestyle
	// kebagian jatah "centered" yang sama dengan kategori Special, jadi
	// varian ke-8 ini dibuat khusus supaya SEMUA 8 kategori akhirnya unik):
	// "centered" (bawaan, avatar+nama+bio di tengah), "banner" (rata kiri
	// sebaris ala kartu profil bisnis), "card" (identitas dibungkus kartu
	// bertema, avatar menonjol di tepi atas), "spotlight" (avatar besar,
	// nama dalam badge bulat), "cover" (pita warna di atas ala foto
	// sampul, avatar menindih tepi bawahnya), "minimal" (avatar kecil
	// sebaris nama ala header aplikasi/dokumen), "hero" (avatar_url YANG
	// SAMA dirender besar edge-to-edge sebagai header, bukan bulat kecil
	// -- fallback ke "centered" kalau avatar_url masih kosong), "polaroid"
	// (avatar KOTAK dibingkai putih ala foto polaroid, dimiringkan sedikit
	// -- referensi estetika Pinterest/VSCO board cover, cocok utk kategori
	// yang kontennya visual/aesthetic-driven seperti lifestyle/travel/
	// fashion blogger, lihat renderBioHeader).
	//
	// Revisi 20 Agustus 2026 (permintaan langsung pengguna): "saya mau
	// tambahkan jadi total 15 layout yang berbeda ambil referensi dari web
	// serupa dan buat unik dan sesuai dengan kategorinya" -- 7 nilai baru
	// ditambah: "split" (2 kolom, foto persegi kiri + identitas kanan),
	// "ticket" (dua bagian dipisah garis putus-putus ala boarding pass),
	// "headline" (teks dulu, foto kecil menyusul di bawah), "ribbon" (badge
	// aksen + nama dalam pita selebar penuh), "duo" (avatar+nama jadi satu
	// chip pil), "masthead" (pita warna berisi identitas langsung di
	// dalamnya, beda dari "cover" yang identitasnya menyusul di BAWAH
	// pita), "portrait" (foto tegak dibingkai & berbayang, terkungkung
	// dalam kolom -- beda dari "hero" yang bleed penuh ke tepi bingkai).
	// Lihat renderBioHeader di PagePreview.tsx untuk kelima belasnya, &
	// quick-setup-templates.ts untuk pemetaan kategori->varian terbaru.
	LayoutVariant string             `json:"layout_variant"`
	// ProductLayout -- permintaan langsung pengguna, 19 Agustus 2026: "buat
	// pilihan dua tipe layout product" -- 'grid' (2 kolom, bawaan) atau
	// 'stacked' (1 kolom penuh lebar). Cuma relevan untuk page_type='produk'
	// (frontend TIDAK LAGI merender grid Produk di halaman Bio sama sekali,
	// lihat ProdukPagePreview vs PagePreview di PagePreview.tsx) -- tetap
	// diekspos di sini juga (bukan cuma di GetPage/GetPublicPageBySlug versi
	// produk) supaya query/struct publicPageResponse yang dipakai bersama
	// GetPublicPage & GetPublicPageBySlug tidak perlu bercabang, sama
	// seperti LayoutVariant di atas.
	ProductLayout string             `json:"product_layout"`
	Links         []publicLink       `json:"links"`
	Products      []publicItem       `json:"products"`
	Donation      *publicDonation    `json:"donation"`
	LeadCapture   *publicLeadCapture `json:"lead_capture"`
	SocialProof   *publicSocialProof `json:"social_proof"`
	Analytics     *publicAnalytics   `json:"analytics"`
	IsVerified    bool               `json:"is_verified"`
	Events        []publicEvent      `json:"events"`
	Bookings      []publicBooking    `json:"bookings"`
	// LoyaltyActive -- No.94 (Sprint 13): cuma penanda ada/tidaknya program
	// poin, BUKAN saldo poin pengunjung (itu perlu email, dicek terpisah
	// lewat GET /pages/:username/loyalty).
	LoyaltyActive bool `json:"loyalty_active"`
	// PageType -- No.99 (Sprint 14): "bio" (halaman utama SELALU "bio") atau
	// "landing" (builder blok manual, halaman tambahan No.98 saja).
	PageType string `json:"page_type"`
	// IsPremium -- Modul Langganan Premium: status PEMILIK halaman (bukan
	// pengunjung), dipakai frontend menyembunyikan pil "Buat halaman gratis
	// di Jeonme" untuk kreator berbayar. Lihat isPremiumUser (subscription.go).
	IsPremium bool `json:"is_premium"`
	// ShopPaused/ShopPausedMessage -- Modul Toko (Fase E5): kreator bisa
	// menjeda seluruh toko dari tab Shop Settings tanpa menonaktifkan tiap
	// produk. Frontend menyembunyikan tombol beli & menampilkan pesan ini
	// kalau true; backend TETAP menolak checkout (lihat checkout.go Create)
	// supaya tidak bisa dilewati lewat panggilan API langsung.
	ShopPaused        bool   `json:"shop_paused"`
	ShopPausedMessage string `json:"shop_paused_message"`
	// InstagramFeed/TikTokFeed -- Modul Koneksi Sosial (migrasi 000069),
	// permintaan langsung pengguna, 17 Agustus 2026: "saya mau jeonme ini
	// bisa connect ke akun kita contoh nya instagram tiktok". nil kalau
	// kreator belum connect platform itu SAMA SEKALI, ATAU kalau
	// pengambilan feed gagal (soft-fail total, lihat fetchInstagramFeed/
	// fetchTikTokFeed di social_connect.go) -- halaman publik tetap normal
	// tanpa widget ini, tidak pernah jadi alasan seluruh halaman gagal.
	InstagramFeed *PublicSocialFeed `json:"instagram_feed"`
	TikTokFeed    *PublicSocialFeed `json:"tiktok_feed"`
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

// publicAnalytics -- Modul Analitik Pihak Ketiga (permintaan langsung
// pengguna, 12 Agustus 2026): fb_access_token_encrypted SENGAJA TIDAK ADA
// di sini -- itu SECRET, cuma dipakai server-side (analytics.go, kirim
// event Conversions API), TIDAK PERNAH boleh sampai ke browser pengunjung.
// Cuma FbPixelID/GaMeasurementID yang memang publik (dipakai browser
// menjalankan skrip fbq()/gtag.js sendiri). nil kalau kreator belum
// mengisi SATU PUN dari keduanya, ATAU bukan Premium (gerbang premium
// ditegakkan di sini, sama seperti hideWatermark -- lihat
// finishPublicPageResponse).
type publicAnalytics struct {
	FbPixelID       string `json:"fb_pixel_id"`
	GaMeasurementID string `json:"ga_measurement_id"`
	UtmEnabled      bool   `json:"utm_enabled"`
}

// publicDonation -- No.71: blok dukungan/donasi, TIDAK ikut array Products
// (tampil sebagai blok tersendiri di halaman publik, bukan kartu di grid
// Produk). nil kalau kreator belum mengaktifkan blok ini.
//
// GoalAmountIDR/GoalRaisedIDR/Wishlist -- Gap #4 benchmark kompetitif (9
// Agustus 2026, ala Saweria/Trakteer). GoalAmountIDR=0 berarti kreator
// belum memasang target -- frontend publik menyembunyikan progress bar
// dalam kasus itu, bukan menampilkan 0/0.
type publicDonation struct {
	ProductID     string               `json:"product_id"`
	Title         string               `json:"title"`
	MinAmountIDR  int64                `json:"min_amount_idr"`
	GoalTitle     string               `json:"goal_title"`
	GoalAmountIDR int64                `json:"goal_amount_idr"`
	GoalRaisedIDR int64                `json:"goal_raised_idr"`
	Wishlist      []publicWishlistItem `json:"wishlist"`
}

type publicWishlistItem struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	PriceIDR  int64  `json:"price_idr"`
	Link      string `json:"link"`
	RaisedIDR int64  `json:"raised_idr"`
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
	// IconKey -- permintaan langsung pengguna, 13 Agustus 2026: ikon dipilih
	// dari galeri siap-pakai (lib/icon-library.ts, frontend), lihat catatan
	// lengkap di linkItem.IconKey (links.go). Prioritas render sama:
	// CustomIconURL > IconKey > deteksi otomatis dari URL > generik.
	IconKey string `json:"icon_key"`
	// IsFeatured/ThumbnailURL -- Modul "Featured Link" (permintaan langsung
	// pengguna, referensi "Featured Layout" Linktree sungguhan): kalau true
	// DAN ThumbnailURL terisi, tautan dirender sebagai kartu thumbnail 16:9
	// (bukan baris klasik) -- lihat renderLinkOrBlock, PagePreview.tsx.
	IsFeatured   bool   `json:"is_featured"`
	ThumbnailURL string `json:"thumbnail_url"`
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
	// IsExternalLink/ExternalURL -- Modul Toko (migrasi 000068, permintaan
	// langsung pengguna: "saya mau untuk produk bisa untuk affiliate juga
	// ke shopee dll"). Tombol "Beli" di halaman publik membuka ExternalURL
	// di tab baru, TIDAK PERNAH lewat checkout Jeonme (lihat BuyProductButton.tsx).
	IsExternalLink bool   `json:"is_external_link"`
	ExternalURL    string `json:"external_url"`
	// Category -- permintaan langsung pengguna, 17 Agustus 2026: "saya mau
	// bisa buat katalog produk di halaman tokonya". Field ini SUDAH lama
	// ada & bisa diisi kreator dari dashboard (migrasi 000046), tapi
	// SEBELUM ini tidak pernah dikirim ke halaman publik sama sekali --
	// murni label internal manajemen. Sekarang dipakai frontend untuk
	// tab/filter kategori di grid Produk (lihat PagePreview.tsx).
	Category string `json:"category"`
}

// GetPublicPage — REQ-F-201: diakses tanpa login di jeon.id/{username}.
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
	var stickersRaw []byte
	err := h.DB.QueryRow(ctx, `
		SELECT u.id, p.id, u.username, p.display_name, p.bio, p.avatar_url, p.theme, p.seo_title, p.seo_description, p.noindex,
			p.custom_background_type, p.custom_background_value, p.custom_font, p.custom_button_color, p.custom_button_style,
			p.custom_button_rounded, p.custom_button_shadow, p.custom_button_text_color,
			p.custom_page_text_color, p.custom_title_font, p.custom_title_color, p.custom_style_override, p.stickers,
			p.hide_watermark,
			p.social_instagram, p.social_tiktok, p.social_facebook, p.social_whatsapp, p.social_youtube,
			p.social_x, p.social_linkedin, p.social_telegram, p.social_email, p.layout_variant, p.product_layout,
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
		&resp.CustomPageTextColor, &resp.CustomTitleFont, &resp.CustomTitleColor, &resp.CustomStyleOverride, &stickersRaw,
		&resp.HideWatermark,
		&resp.SocialInstagram, &resp.SocialTiktok, &resp.SocialFacebook, &resp.SocialWhatsapp, &resp.SocialYoutube,
		&resp.SocialX, &resp.SocialLinkedin, &resp.SocialTelegram, &resp.SocialEmail, &resp.LayoutVariant, &resp.ProductLayout,
		&emailVerified)
	if err == nil {
		_ = json.Unmarshal(stickersRaw, &resp.Stickers)
	}
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
// jeon.id/p/{slug}, namespace terpisah dari username akun supaya tidak
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
	var stickersRaw []byte
	// Bug ditemukan (8 Agustus 2026, sambil menambah kolom sticker): query
	// ini SEBELUMNYA tidak pernah menyertakan custom_button_rounded/shadow/
	// text_color, custom_page_text_color, custom_title_font/color, dan
	// custom_style_override -- beda dari GetPublicPage (halaman utama) yang
	// sudah lengkap. Akibatnya panel Tombol/Font di ProdukPageEditor
	// (Modul Halaman Toko) BERHASIL tersimpan ke database, tapi TIDAK
	// PERNAH benar-benar tampil di halaman publik Toko/Landing/Bio kedua --
	// halaman publiknya diam-diam selalu jatuh balik ke gaya bawaan tema.
	// Disamakan lengkap dengan GetPublicPage di sini.
	err := h.DB.QueryRow(ctx, `
		SELECT p.user_id, p.id, u.username, p.display_name, p.bio, p.avatar_url, p.theme, p.seo_title, p.seo_description, p.noindex,
			p.custom_background_type, p.custom_background_value, p.custom_font, p.custom_button_color, p.custom_button_style,
			p.custom_button_rounded, p.custom_button_shadow, p.custom_button_text_color,
			p.custom_page_text_color, p.custom_title_font, p.custom_title_color, p.custom_style_override, p.stickers,
			p.hide_watermark,
			p.social_instagram, p.social_tiktok, p.social_facebook, p.social_whatsapp, p.social_youtube,
			p.social_x, p.social_linkedin, p.social_telegram, p.social_email, p.layout_variant, p.product_layout,
			u.email_verified_at IS NOT NULL, p.page_type
		FROM pages p JOIN users u ON u.id = p.user_id
		WHERE p.slug = $1 AND p.is_published = true
			AND u.deactivated_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM account_deletion_requests d WHERE d.user_id = u.id AND d.status = 'pending')
	`, slug).Scan(&userID, &pageID, &resp.Username, &resp.DisplayName, &resp.Bio, &resp.AvatarURL, &resp.Theme,
		&resp.SeoTitle, &resp.SeoDescription, &resp.Noindex,
		&resp.CustomBackgroundType, &resp.CustomBackgroundValue, &resp.CustomFont, &resp.CustomButtonColor, &resp.CustomButtonStyle,
		&resp.CustomButtonRounded, &resp.CustomButtonShadow, &resp.CustomButtonTextColor,
		&resp.CustomPageTextColor, &resp.CustomTitleFont, &resp.CustomTitleColor, &resp.CustomStyleOverride, &stickersRaw,
		&resp.HideWatermark,
		&resp.SocialInstagram, &resp.SocialTiktok, &resp.SocialFacebook, &resp.SocialWhatsapp, &resp.SocialYoutube,
		&resp.SocialX, &resp.SocialLinkedin, &resp.SocialTelegram, &resp.SocialEmail, &resp.LayoutVariant, &resp.ProductLayout,
		&emailVerified, &resp.PageType)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}
	_ = json.Unmarshal(stickersRaw, &resp.Stickers)
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
	// IsPremium dihitung SINKRON & LEBIH DULU (satu query murah) -- dipakai
	// sebagai gerbang watermark di bawah DAN sebagai predikat query analytics
	// paralel di bawah, jadi harus sudah siap sebelum goroutine-goroutine itu
	// dilepas.
	resp.IsPremium = isPremiumUser(ctx, h.DB, userID)
	// Gerbang premium ditegakkan DI SINI (bukan cuma dipercaya dari kolom
	// DB apa adanya) -- kreator gratis yang kolomnya masih true (mis. bekas
	// Premium yang berakhir masa aktifnya) tetap SELALU tampil watermark.
	if !resp.IsPremium {
		resp.HideWatermark = false
	}

	// Optimasi performa (analisa & benchmark kompetitif, 18 Agustus 2026):
	// SEBELUMNYA ~12 query Postgres independen (badge verifikasi, status jeda
	// toko, tautan, produk, feed Instagram/TikTok, donasi+wishlist+goal,
	// event, booking, lead capture, loyalty, social proof, analitik) jalan
	// BERURUTAN satu-satu di sini pada SETIAP cache-miss halaman publik --
	// endpoint dengan traffic tertinggi di seluruh API (cache Redis cuma 30
	// detik, lihat publicPageCacheTTL), jadi latensi cache-miss dulu = jumlah
	// SEMUA round-trip ini ditumpuk. Query-query di bawah TIDAK saling
	// bergantung satu sama lain (kecuali IsPremium yang sudah dihitung di
	// atas), jadi sekarang dijalankan PARALEL lewat errgroup -- latensi
	// cache-miss turun jadi kira-kira waktu query PALING LAMBAT, bukan jumlah
	// semuanya. g.SetLimit(6) SENGAJA membatasi jumlah goroutine aktif
	// bersamaan (bukan dilepas semua ~12 sekaligus) -- pgxpool cuma
	// dikonfigurasi MaxConns=20 (lihat database.go) dan dipakai bersama oleh
	// SEMUA request bersamaan (termasuk checkout/dashboard/worker), jadi satu
	// request halaman publik cache-miss TIDAK BOLEH menyedot hampir seluruh
	// pool koneksi sendirian -- itu bisa membuat P99 lebih buruk di bawah
	// traffic bersamaan alih-alih lebih baik.
	var hasPaidOrder bool
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(6)

	g.Go(func() error {
		// No.88 (Sprint 10): badge terverifikasi -- sinyal kepercayaan murah
		// untuk pembeli, dihitung LANGSUNG dari data yang sudah ada (BUKAN
		// proses review manual seperti Linktree): email terverifikasi +
		// profil lengkap (bio DAN foto profil terisi) + minimal 1 transaksi
		// sukses (order status='paid'). profileComplete dihitung di luar
		// goroutine (lihat setelah g.Wait() di bawah) karena cuma baca
		// field resp yang SUDAH diisi sebelum fungsi ini dipanggil.
		_ = h.DB.QueryRow(gctx, `
			SELECT EXISTS(SELECT 1 FROM orders o JOIN products pr ON pr.id = o.product_id WHERE pr.user_id = $1 AND o.status = 'paid')
		`, userID).Scan(&hasPaidOrder)
		return nil
	})

	g.Go(func() error {
		resp.ShopPaused, resp.ShopPausedMessage = getShopPauseStatus(gctx, h.DB, userID)
		return nil
	})

	g.Go(func() error {
		// No.78 (Sprint 9): tautan terjadwal otomatis tampil/sembunyi berdasar
		// starts_at/ends_at (NULL = tidak dibatasi rentang waktu itu), di ATAS
		// gate is_active manual yang sudah ada -- keduanya harus lolos.
		resp.Links = []publicLink{}
		rows, err := h.DB.Query(gctx, `
			SELECT id, title, url, COALESCE(lock_type, ''), lock_min_age, block_type, block_data, custom_icon_url,
				icon_key, is_featured, thumbnail_url
			FROM links
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
				if err := rows.Scan(&l.ID, &l.Title, &l.URL, &l.LockType, &l.LockMinAge, &l.BlockType, &l.BlockData, &l.CustomIconURL,
					&l.IconKey, &l.IsFeatured, &l.ThumbnailURL); err == nil {
					// No.79: sembunyikan URL asli untuk tautan terkunci -- lihat
					// komentar di definisi struct publicLink.
					if l.LockType != "" {
						l.URL = ""
					}
					resp.Links = append(resp.Links, l)
				}
			}
		}
		return nil
	})

	g.Go(func() error {
		// No.70: bundel TIDAK difilter di sini -- bundel memang harus tampil
		// di halaman publik sebagai produk yang bisa dibeli, dengan harga
		// asli (jumlah harga item di dalamnya) dicoret lewat bundle_original_price_idr.
		// No.71/90/92: blok dukungan/donasi, event, & booking DIFILTER di sini --
		// masing-masing tampil sebagai blok tersendiri (resp.Donation/resp.
		// Events/resp.Bookings), bukan kartu di grid Produk.
		resp.Products = []publicItem{}
		productRows, err := h.DB.Query(gctx, `
			SELECT p.id, p.name, p.price_idr, p.cover_image_url, `+effectivePriceExpr+`, p.pwyw_enabled, p.pwyw_min_price_idr,
				p.is_bundle,
				(SELECT SUM(ip.price_idr) FROM bundle_items bi JOIN products ip ON ip.id = bi.item_product_id WHERE bi.bundle_product_id = p.id),
				p.is_course,
				(SELECT COUNT(*) FROM course_chapters cc WHERE cc.course_product_id = p.id),
				p.product_kind = 'external_link', p.external_url, p.category
			FROM products p WHERE p.user_id = $1 AND p.is_active = true AND p.is_donation = false AND p.is_event = false AND p.is_booking = false
			ORDER BY p.is_featured DESC, p.position ASC
		`, userID)
		if err == nil {
			defer productRows.Close()
			for productRows.Next() {
				var p publicItem
				if err := productRows.Scan(&p.ID, &p.Name, &p.PriceIDR, &p.CoverImage, &p.EffectivePriceIDR, &p.IsFlashSaleActive,
					&p.PwywEnabled, &p.PwywMinPriceIDR, &p.IsBundle, &p.BundleOriginalPriceIDR,
					&p.IsCourse, &p.ChapterCount, &p.IsExternalLink, &p.ExternalURL, &p.Category); err == nil {
					resp.Products = append(resp.Products, p)
				}
			}
		}
		return nil
	})

	// Modul Koneksi Sosial (migrasi 000069) -- lihat catatan lengkap di
	// publicPageResponse.InstagramFeed/TikTokFeed & fetchInstagramFeed/
	// fetchTikTokFeed (social_connect.go). Dua goroutine TERPISAH (bukan satu)
	// karena masing-masing bisa memicu panggilan API pihak ketiga (refresh
	// token) yang jauh lebih lambat dari query Postgres biasa -- tidak boleh
	// saling menunggu.
	g.Go(func() error {
		resp.InstagramFeed = fetchInstagramFeed(gctx, h.DB, h.RDB, h.Instagram, userID)
		return nil
	})
	g.Go(func() error {
		resp.TikTokFeed = fetchTikTokFeed(gctx, h.DB, h.RDB, h.TikTok, userID)
		return nil
	})

	g.Go(func() error {
		var donation publicDonation
		var minAmount *int64
		var goalStartedAt *time.Time
		if err := h.DB.QueryRow(gctx, `
			SELECT id, name, pwyw_min_price_idr, donation_goal_title, donation_goal_amount_idr, donation_goal_started_at
			FROM products
			WHERE user_id = $1 AND is_donation = true AND is_active = true
		`, userID).Scan(&donation.ProductID, &donation.Title, &minAmount, &donation.GoalTitle, &donation.GoalAmountIDR, &goalStartedAt); err == nil {
			if minAmount != nil {
				donation.MinAmountIDR = *minAmount
			}
			// GoalRaisedIDR -- SUM sejak goal ini dipasang, sama seperti
			// DonationHandler.Get (lihat catatan panjang di migrasi 000060).
			// Sengaja tetap SEKUENSIAL di dalam goroutine ini sendiri (goal
			// raised & wishlist keduanya butuh donation.ProductID/donation
			// sudah ketemu duluan) -- yang paralel adalah CABANG donasi ini
			// terhadap cabang-cabang lain (link/produk/event/dst), bukan
			// query di dalam satu cabang yang memang saling bergantung.
			if donation.GoalAmountIDR > 0 && goalStartedAt != nil {
				_ = h.DB.QueryRow(gctx, `
					SELECT COALESCE(SUM(amount_idr), 0) FROM orders WHERE product_id = $1 AND status = 'paid' AND created_at >= $2
				`, donation.ProductID, *goalStartedAt).Scan(&donation.GoalRaisedIDR)
			}

			// Wishlist (Gap #4 benchmark kompetitif) -- selalu diikutkan kalau
			// blok Donasi aktif, TERLEPAS dari ada isinya atau tidak (array
			// kosong, bukan null, supaya frontend tidak perlu nil-check ganda).
			donation.Wishlist = []publicWishlistItem{}
			wishlistRows, err := h.DB.Query(gctx, `
				SELECT id, name, price_idr, link, raised_idr FROM donation_wishlist_items WHERE user_id = $1 ORDER BY created_at DESC
			`, userID)
			if err == nil {
				for wishlistRows.Next() {
					var w publicWishlistItem
					if err := wishlistRows.Scan(&w.ID, &w.Name, &w.PriceIDR, &w.Link, &w.RaisedIDR); err == nil {
						donation.Wishlist = append(donation.Wishlist, w)
					}
				}
				wishlistRows.Close()
			}

			resp.Donation = &donation
		}
		return nil
	})

	g.Go(func() error {
		// No.90 (Sprint 11): event yang sudah lewat TIDAK ditampilkan lagi
		// (event_ends_at < now()) -- tidak ada gunanya menjual tiket ke acara
		// yang sudah selesai.
		resp.Events = []publicEvent{}
		eventRows, err := h.DB.Query(gctx, `
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
		return nil
	})

	g.Go(func() error {
		// No.92 (Sprint 11): hanya booking dengan minimal 1 slot tersedia yang
		// ditampilkan -- tidak ada gunanya menampilkan blok booking yang tidak
		// bisa dipesan sama sekali.
		resp.Bookings = []publicBooking{}
		bookingRows, err := h.DB.Query(gctx, `
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
		return nil
	})

	g.Go(func() error {
		var leadCapture publicLeadCapture
		if err := h.DB.QueryRow(gctx, `
			SELECT title, collect_email, collect_whatsapp FROM lead_capture_settings
			WHERE user_id = $1 AND is_active = true
		`, userID).Scan(&leadCapture.Title, &leadCapture.CollectEmail, &leadCapture.CollectWhatsapp); err == nil {
			resp.LeadCapture = &leadCapture
		}
		return nil
	})

	g.Go(func() error {
		_ = h.DB.QueryRow(gctx, `SELECT is_active FROM loyalty_settings WHERE user_id = $1`, userID).Scan(&resp.LoyaltyActive)
		return nil
	})

	g.Go(func() error {
		var spActive, spShowOnProductPage bool
		var spDisplaySeconds, spIntervalSeconds int
		if err := h.DB.QueryRow(gctx, `
			SELECT is_active, show_on_product_page, display_seconds, interval_seconds
			FROM social_proof_settings WHERE user_id = $1
		`, userID).Scan(&spActive, &spShowOnProductPage, &spDisplaySeconds, &spIntervalSeconds); err == nil && spActive && spShowOnProductPage {
			recent := fetchRecentPurchases(gctx, h.DB, `
				SELECT p.name, o.buyer_email, o.created_at
				FROM orders o JOIN products p ON p.id = o.product_id
				WHERE p.user_id = $1 AND o.status = 'paid'
				ORDER BY o.created_at DESC LIMIT 10
			`, userID)
			if len(recent) > 0 {
				resp.SocialProof = &publicSocialProof{DisplaySeconds: spDisplaySeconds, IntervalSeconds: spIntervalSeconds, Recent: recent}
			}
		}
		return nil
	})

	// Modul Analitik Pihak Ketiga -- resp.IsPremium SUDAH dihitung SINKRON di
	// awal fungsi ini (sebelum g dibuat), tinggal dipakai ulang sebagai
	// gerbang, TIDAK query isPremiumUser dua kali. fb_access_token_encrypted
	// SENGAJA TIDAK di-SELECT sama sekali di sini (bukan cuma tidak dikirim)
	// -- query ini murni untuk payload publik, tidak ada alasan menyentuh
	// kolom secret.
	if resp.IsPremium {
		g.Go(func() error {
			var pixelID, gaID string
			var utmEnabled bool
			if err := h.DB.QueryRow(gctx, `
				SELECT fb_pixel_id, ga_measurement_id, utm_enabled FROM analytics_settings WHERE user_id = $1
			`, userID).Scan(&pixelID, &gaID, &utmEnabled); err == nil && (pixelID != "" || gaID != "") {
				resp.Analytics = &publicAnalytics{FbPixelID: pixelID, GaMeasurementID: gaID, UtmEnabled: utmEnabled}
			}
			return nil
		})
	}

	// Semua goroutine di atas soft-fail sendiri (pola konsisten dgn kode
	// lama -- errornya ditelan lewat `if err == nil`/`_ =`), TIDAK ADA yang
	// pernah me-return error sungguhan ke g.Wait(). g dipakai murni sebagai
	// primitif sinkronisasi "tunggu semua goroutine di atas selesai", bukan
	// utk propagasi error.
	_ = g.Wait()

	profileComplete := resp.Bio != "" && resp.AvatarURL != ""
	resp.IsVerified = emailVerified && profileComplete && hasPaidOrder

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
	Stickers              []PageSticker      `json:"stickers"`
	HideWatermark         bool               `json:"hide_watermark"`
	SocialInstagram       string             `json:"social_instagram"`
	SocialTiktok          string             `json:"social_tiktok"`
	SocialFacebook        string             `json:"social_facebook"`
	SocialWhatsapp        string             `json:"social_whatsapp"`
	SocialYoutube         string             `json:"social_youtube"`
	SocialX               string             `json:"social_x"`
	SocialLinkedin        string             `json:"social_linkedin"`
	SocialTelegram        string             `json:"social_telegram"`
	SocialEmail           string             `json:"social_email"`
	LayoutVariant         string             `json:"layout_variant"`
	Verification          verificationStatus `json:"verification"`
	// IsPremium -- Modul Langganan Premium (permintaan langsung pengguna):
	// dipakai dashboard untuk gating tema "custom" (lihat UpdateMyPage) &
	// menampilkan status langganan. Sumber kebenaran TUNGGAL: isPremiumUser
	// (subscription.go) -- BUKAN kolom tersendiri di tabel users/pages,
	// selalu dihitung ulang dari tabel subscriptions supaya tidak ada dua
	// sumber kebenaran yang bisa tidak sinkron.
	IsPremium bool `json:"is_premium"`
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
	var stickersRaw []byte
	err := h.DB.QueryRow(ctx, `
		SELECT u.username, p.display_name, p.bio, p.avatar_url, p.theme, p.is_published, p.seo_title, p.seo_description, p.noindex,
			p.custom_background_type, p.custom_background_value, p.custom_font, p.custom_button_color, p.custom_button_style,
			p.custom_button_rounded, p.custom_button_shadow, p.custom_button_text_color,
			p.custom_page_text_color, p.custom_title_font, p.custom_title_color, p.custom_style_override, p.stickers,
			p.hide_watermark,
			p.social_instagram, p.social_tiktok, p.social_facebook, p.social_whatsapp, p.social_youtube,
			p.social_x, p.social_linkedin, p.social_telegram, p.social_email, p.layout_variant,
			u.email_verified_at IS NOT NULL
		FROM pages p JOIN users u ON u.id = p.user_id
		WHERE p.user_id = $1 AND p.is_primary = true
	`, userID).Scan(&resp.Username, &resp.DisplayName, &resp.Bio, &resp.AvatarURL, &resp.Theme, &resp.IsPublished,
		&resp.SeoTitle, &resp.SeoDescription, &resp.Noindex,
		&resp.CustomBackgroundType, &resp.CustomBackgroundValue, &resp.CustomFont, &resp.CustomButtonColor, &resp.CustomButtonStyle,
		&resp.CustomButtonRounded, &resp.CustomButtonShadow, &resp.CustomButtonTextColor,
		&resp.CustomPageTextColor, &resp.CustomTitleFont, &resp.CustomTitleColor, &resp.CustomStyleOverride, &stickersRaw,
		&resp.HideWatermark,
		&resp.SocialInstagram, &resp.SocialTiktok, &resp.SocialFacebook, &resp.SocialWhatsapp, &resp.SocialYoutube,
		&resp.SocialX, &resp.SocialLinkedin, &resp.SocialTelegram, &resp.SocialEmail, &resp.LayoutVariant,
		&emailVerified)
	if err == nil {
		_ = json.Unmarshal(stickersRaw, &resp.Stickers)
	}
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
	resp.IsPremium = isPremiumUser(ctx, h.DB, userID)

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
	// 5 preset "3D" murni CSS (permintaan langsung pengguna: "buatkan
	// beberapa tema 3d") -- lihat catatan lingkup di THREE_D_THEME_NAMES
	// (apps/web/lib/page-themes.ts).
	"sphere": true, "chrome": true, "cube": true, "relief": true, "facet": true,
	// 3 preset "Live Wallpaper" (permintaan susulan: "tambahkan live
	// walpaper di tab 3d") -- latar bergerak lewat CSS @keyframes.
	"flow": true, "pulse": true, "drift": true,
	// 6 preset wallpaper foto TAMBAHAN + 6 preset VIDEO (permintaan langsung
	// pengguna, 13 Agustus 2026: "perbanyak tema dan layout di quick setup...
	// background menggunakan wallpaper dan juga background yang bergerak
	// seperti mov/gif") -- video di sini berarti <video> sungguhan (lihat
	// VIDEO_THEME_NAMES, apps/web/lib/page-themes.ts), bukan animasi CSS
	// seperti flow/pulse/drift di atas.
	"brew": true, "lagoon": true, "dune": true, "sakura": true, "nova": true, "maple": true,
	"electric": true, "surge": true, "downtown": true, "polaris": true, "atmos": true, "ember": true,
	// 5 preset baru hasil analisa galeri tema kompetitor, 16 Agustus 2026
	// (pengguna minta baca semua gambar di folder theme/ lalu rekomendasi
	// tema baru yang worth ditambahkan) -- lihat catatan lingkup lengkap
	// di PAGE_THEMES (apps/web/lib/page-themes.ts).
	"xmas": true, "pride": true, "retro": true, "kraft": true, "monsoon": true,
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
	// HideWatermark -- Modul Langganan Premium (permintaan langsung
	// pengguna, 8 Agustus 2026): toggle "sembunyikan watermark" yang bisa
	// diatur SENDIRI oleh kreator Premium. Boleh disimpan oleh siapa saja
	// (tidak ditolak di sini) -- gerbang premium sungguhan ditegakkan saat
	// MENAMPILKAN halaman publik (lihat resp.HideWatermark di
	// finishPublicPageResponse), bukan saat menyimpan, supaya kreator yang
	// baru saja downgrade tidak kehilangan preferensinya kalau upgrade lagi.
	HideWatermark *bool `json:"hide_watermark"`
	// SocialInstagram..SocialEmail -- lihat catatan lengkap di
	// publicPageResponse. max=255 cukup untuk handle ATAU URL lengkap.
	SocialInstagram *string `json:"social_instagram" binding:"omitempty,max=255"`
	SocialTiktok    *string `json:"social_tiktok" binding:"omitempty,max=255"`
	SocialFacebook  *string `json:"social_facebook" binding:"omitempty,max=255"`
	SocialWhatsapp  *string `json:"social_whatsapp" binding:"omitempty,max=255"`
	SocialYoutube   *string `json:"social_youtube" binding:"omitempty,max=255"`
	SocialX         *string `json:"social_x" binding:"omitempty,max=255"`
	SocialLinkedin  *string `json:"social_linkedin" binding:"omitempty,max=255"`
	SocialTelegram  *string `json:"social_telegram" binding:"omitempty,max=255"`
	SocialEmail     *string `json:"social_email" binding:"omitempty,max=255"`
	// LayoutVariant -- lihat catatan lengkap di publicPageResponse.
	LayoutVariant *string `json:"layout_variant" binding:"omitempty,oneof=centered banner card spotlight cover minimal hero polaroid split ticket headline ribbon duo masthead portrait"`
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

	// Modul Langganan Premium (permintaan langsung pengguna: "custom
	// background by user premium"): latar bebas (theme="custom" +
	// custom_background_type/value) HANYA untuk kreator berbayar. Dicek di
	// SINI (bukan cuma disembunyikan di frontend) supaya penegakannya nyata
	// -- permintaan API langsung tidak bisa melewatinya.
	wantsCustomBackground := (req.Theme != nil && *req.Theme == "custom") ||
		req.CustomBackgroundType != nil || req.CustomBackgroundValue != nil
	if wantsCustomBackground && !isPremiumUser(ctx, h.DB, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "latar belakang custom hanya untuk kreator Premium, upgrade dulu di Pengaturan > Langganan"})
		return
	}

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
			custom_style_override = COALESCE($19, custom_style_override),
			hide_watermark = COALESCE($20, hide_watermark),
			social_instagram = COALESCE($21, social_instagram),
			social_tiktok = COALESCE($22, social_tiktok),
			social_facebook = COALESCE($23, social_facebook),
			social_whatsapp = COALESCE($24, social_whatsapp),
			social_youtube = COALESCE($25, social_youtube),
			social_x = COALESCE($26, social_x),
			social_linkedin = COALESCE($27, social_linkedin),
			social_telegram = COALESCE($28, social_telegram),
			social_email = COALESCE($29, social_email),
			layout_variant = COALESCE($30, layout_variant)
		WHERE user_id = $31 AND is_primary = true
	`, req.Theme, req.DisplayName, req.Bio, req.IsPublished, req.SeoTitle, req.SeoDescription, req.Noindex,
		req.CustomBackgroundType, req.CustomBackgroundValue, req.CustomFont, req.CustomButtonColor,
		req.CustomButtonStyle, req.CustomButtonRounded, req.CustomButtonShadow, req.CustomButtonTextColor,
		req.CustomPageTextColor, req.CustomTitleFont, req.CustomTitleColor, req.CustomStyleOverride,
		req.HideWatermark,
		req.SocialInstagram, req.SocialTiktok, req.SocialFacebook, req.SocialWhatsapp, req.SocialYoutube,
		req.SocialX, req.SocialLinkedin, req.SocialTelegram, req.SocialEmail, req.LayoutVariant,
		userID)
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

type updateStickersRequest struct {
	Stickers []PageSticker `json:"stickers" binding:"required"`
}

// UpdateMyPageStickers -- Modul Desain (koreksi langsung pengguna, 8
// Agustus 2026): endpoint TERPISAH dari UpdateMyPage (bukan salah satu
// field COALESCE) karena array diganti UTUH tiap simpan (drag/resize di
// dashboard mengirim seluruh daftar stiker terbaru sekaligus), bukan
// di-patch per field seperti tema/warna/dst.
func (h *PageHandler) UpdateMyPageStickers(c *gin.Context) {
	var req updateStickersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msg, ok := validateStickers(req.Stickers); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	userID := c.GetString("userID")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	stickersJSON, _ := json.Marshal(req.Stickers)
	var username string
	err := h.DB.QueryRow(ctx, `
		UPDATE pages SET stickers = $1 WHERE user_id = $2 AND is_primary = true RETURNING (SELECT username FROM users WHERE id = $2)
	`, stickersJSON, userID).Scan(&username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan stiker"})
		return
	}
	if h.RDB != nil {
		h.RDB.Del(ctx, "page:"+username)
	}

	c.JSON(http.StatusOK, gin.H{"message": "stiker disimpan"})
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

	// Modul Desain (permintaan langsung pengguna): SEMUA gambar yang
	// diunggah otomatis dikonversi ke WebP -- lihat catatan lengkap di
	// package imageconv soal kenapa encoder murni-Go (bukan cgo/libwebp).
	webpBytes, err := imageconv.ToWebP(file)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "gagal memproses gambar -- pastikan file benar-benar gambar jpg/png/webp yang valid"})
		return
	}

	key := fmt.Sprintf("avatars/%s.webp", userID)
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah foto profil"})
		return
	}

	// Query param "?v=<timestamp>" WAJIB ditambahkan & DISIMPAN ke DB (bukan
	// cuma di respons) -- key storage SELALU sama ("avatars/<userID>.webp"), jadi
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
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	// Modul Langganan Premium: gerbang yang sama seperti UpdateMyPage/
	// UpdatePage -- tanpa ini, kreator gratis bisa lolos batasan latar
	// kustom lewat endpoint upload ini langsung (endpoint ini menyimpan
	// custom_background_type/value sendiri, tidak lewat UpdateMyPage sama
	// sekali). Dicek DULUAN (sebelum cek storage/parsing file) supaya
	// kreator gratis tidak buang bandwidth/kuota untuk permintaan yang
	// bakal ditolak.
	if !isPremiumUser(ctx, h.DB, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "latar belakang kustom khusus untuk kreator Premium"})
		return
	}

	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

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

	// Modul Desain: SEMUA gambar diunggah otomatis dikonversi ke WebP --
	// lihat package imageconv.
	webpBytes, err := imageconv.ToWebP(file)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "gagal memproses gambar -- pastikan file benar-benar gambar jpg/png/webp yang valid"})
		return
	}

	key := fmt.Sprintf("backgrounds/%s.webp", userID)
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
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

// ownsExtraPage — sama seperti LinksHandler.ownsPage, dipakai upload avatar/
// background halaman TAMBAHAN supaya kreator tidak bisa menimpa file
// halaman milik akun lain lewat pageID tebakan. SENGAJA "is_primary = false"
// -- unggahan halaman utama tetap lewat UploadAvatar/UploadCustomBackground.
func (h *PageHandler) ownsExtraPage(ctx context.Context, pageID, userID string) bool {
	var exists int
	err := h.DB.QueryRow(ctx, `
		SELECT 1 FROM pages WHERE id = $1 AND user_id = $2 AND is_primary = false
	`, pageID, userID).Scan(&exists)
	if err != nil && err != pgx.ErrNoRows {
		return false
	}
	return err == nil
}

// UploadAvatarForPage — Modul Halaman Toko: sama persis dengan UploadAvatar,
// tapi untuk halaman TAMBAHAN (Toko/Landing/Bio kedua-dst) -- key storage
// pakai pageID (bukan userID) supaya tiap halaman tambahan seorang kreator
// (Premium bisa punya sampai 5) tersimpan sebagai object terpisah, tidak
// saling menimpa.
func (h *PageHandler) UploadAvatarForPage(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	pageID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if !h.ownsExtraPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
		return
	}

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

	key := fmt.Sprintf("avatars/page-%s.webp", pageID)
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah foto profil"})
		return
	}

	// "?v=<timestamp>" -- lihat catatan panjang di UploadAvatar, alasannya sama.
	avatarURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	var slug string
	if err := h.DB.QueryRow(ctx, `
		UPDATE pages SET avatar_url = $1 WHERE id = $2 RETURNING COALESCE(slug, '')
	`, avatarURL, pageID).Scan(&slug); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "foto terunggah tapi gagal menyimpan referensinya"})
		return
	}
	if h.RDB != nil && slug != "" {
		h.RDB.Del(ctx, "page-slug:"+slug)
	}

	c.JSON(http.StatusOK, gin.H{"avatar_url": avatarURL, "message": "foto profil berhasil diunggah"})
}

// UploadCustomBackgroundForPage — Modul Halaman Toko: analog
// UploadCustomBackground untuk halaman TAMBAHAN, gerbang Premium yang sama.
func (h *PageHandler) UploadCustomBackgroundForPage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if !isPremiumUser(ctx, h.DB, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "latar belakang kustom khusus untuk kreator Premium"})
		return
	}
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}
	if !h.ownsExtraPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
		return
	}

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

	key := fmt.Sprintf("backgrounds/page-%s.webp", pageID)
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah gambar latar"})
		return
	}

	backgroundURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	var slug string
	if err := h.DB.QueryRow(ctx, `
		UPDATE pages SET custom_background_type = 'image', custom_background_value = $1
		WHERE id = $2 RETURNING COALESCE(slug, '')
	`, backgroundURL, pageID).Scan(&slug); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gambar terunggah tapi gagal menyimpan referensinya"})
		return
	}
	if h.RDB != nil && slug != "" {
		h.RDB.Del(ctx, "page-slug:"+slug)
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
// halaman utama. Halaman tambahan diakses publik lewat jeon.id/p/{slug},
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
	// PageType -- No.99: opsional, default "bio" kalau kosong. "produk"
	// (Modul Halaman Produk) -- showcase katalog Toko, lihat catatan lingkup
	// di CreatePage.
	PageType string `json:"page_type" binding:"omitempty,oneof=bio landing produk"`
}

// premiumExtraPageLimit -- Modul Langganan Premium: batas Halaman Tambahan
// bertipe bio/landing untuk kreator Premium (kreator gratis TIDAK BISA
// membuat sama sekali, lihat pengecekan di CreatePage). Fitur ini
// sebelumnya bebas & tanpa batas untuk semua orang -- pengguna lama yang
// sudah punya lebih banyak halaman dari batas ini SENGAJA dibiarkan
// (grandfathered, halamannya tetap aktif & bisa diedit), hanya pembuatan
// BARU yang ditahan gerbang ini.
const premiumExtraPageLimit = 5

// freeProdukPageLimit/premiumProdukPageLimit -- Modul Halaman Produk
// (keputusan langsung pengguna, 5 Agustus 2026): POOL TERPISAH dari
// premiumExtraPageLimit di atas -- kreator gratis dapat 1 Halaman Produk
// gratis (beda dari bio/landing yang tetap 0 untuk gratis), Premium tetap
// 5, sama seperti bio/landing.
const freeProdukPageLimit = 1
const premiumProdukPageLimit = 5

// ensureProdukPage — Modul Halaman Produk (permintaan langsung pengguna, 7
// Agustus 2026): setiap kreator gratis berhak atas 1 Halaman Toko gratis,
// tapi sekarang dibuat OTOMATIS begitu produk pertamanya ada -- bukan lagi
// langkah manual "+Tambah Halaman" yang gampang terlewat. Dipanggil
// best-effort (soft-fail, pola yang sama dengan SMTP/S3/WhatsApp di paket
// ini) dari ProductHandler.Create supaya kegagalan di sini TIDAK PERNAH
// menggagalkan pembuatan produk itu sendiri -- kreator masih bisa buat
// manual lewat dashboard/pages kalau ini gagal diam-diam.
//
// Slug SELALU = username akun (bukan slug bebas) supaya URL-nya konsisten
// dengan Halaman Bio (jeon.id/{username}), bukan slug acak yang harus
// diketik manual -- lihat aturan sama di CreatePage untuk Toko ke-2..5
// (Premium, mis. multi-brand) yang tetap pakai slug bebas seperti sebelumnya.
func ensureProdukPage(ctx context.Context, db *pgxpool.Pool, rdb *redis.Client, userID string) {
	var exists bool
	if err := db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM pages WHERE user_id = $1 AND page_type = 'produk')
	`, userID).Scan(&exists); err != nil || exists {
		return
	}

	var username, displayName, bio, avatarURL, theme string
	var stickersRaw []byte
	var hideWatermark bool
	if err := db.QueryRow(ctx, `
		SELECT u.username, COALESCE(NULLIF(p.display_name, ''), u.username), p.bio, p.avatar_url, p.theme, p.stickers, p.hide_watermark
		FROM users u JOIN pages p ON p.user_id = u.id AND p.is_primary = true
		WHERE u.id = $1
	`, userID).Scan(&username, &displayName, &bio, &avatarURL, &theme, &stickersRaw, &hideWatermark); err != nil {
		return
	}

	name := "Toko " + displayName
	if len(name) > 100 {
		name = name[:100]
	}

	// Toko baru langsung dipublikasikan (is_published=true) -- beda dari
	// halaman tambahan lain yang mulai draft -- karena baru muncul saat
	// produk sungguhan sudah ada, tidak ada alasan menahannya di draft.
	// Bio/avatar/tema/stiker/toggle-watermark DISALIN dari halaman Bio
	// utama (bukan dibiarkan kosong/default) supaya tampilannya konsisten
	// sejak pertama kali live, bukan etalase kosong tanpa identitas --
	// kreator tetap bebas mengubahnya sendiri nanti lewat "Kelola" di
	// dashboard/pages.
	if _, err := db.Exec(ctx, `
		INSERT INTO pages (user_id, is_primary, name, slug, page_type, is_published, bio, avatar_url, theme, stickers, hide_watermark)
		VALUES ($1, false, $2, $3, 'produk', true, $4, $5, $6, $7, $8)
	`, userID, name, username, bio, avatarURL, theme, stickersRaw, hideWatermark); err != nil {
		// Soft-fail -- kemungkinan besar cuma slug bentrok (kasus langka:
		// halaman lain, bukan milik kreator ini, kebetulan pakai slug
		// identik dengan username-nya).
		return
	}

	if rdb != nil {
		rdb.Del(ctx, "page-slug:"+username)
	}
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

	premium := isPremiumUser(ctx, h.DB, userID)
	isAutoProdukSlug := false

	if pageType == "produk" {
		// Modul Halaman Produk: pool TERPISAH dari bio/landing di bawah --
		// kreator gratis TETAP boleh, sampai 1 halaman.
		limit := freeProdukPageLimit
		if premium {
			limit = premiumProdukPageLimit
		}
		var produkPageCount int
		if err := h.DB.QueryRow(ctx, `
			SELECT COUNT(*) FROM pages WHERE user_id = $1 AND is_primary = false AND page_type = 'produk'
		`, userID).Scan(&produkPageCount); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa jumlah halaman"})
			return
		}
		if produkPageCount >= limit {
			if premium {
				c.JSON(http.StatusForbidden, gin.H{"error": fmt.Sprintf("kreator Premium maksimal %d Halaman Produk", limit)})
			} else {
				c.JSON(http.StatusForbidden, gin.H{"error": "kreator gratis maksimal 1 Halaman Produk -- upgrade ke Premium untuk lebih banyak"})
			}
			return
		}
		// Toko PERTAMA (gratis, produkPageCount==0) selalu dikunci ke
		// username akun -- permintaan langsung pengguna 7 Agustus 2026,
		// sama seperti ensureProdukPage di atas. Toko ke-2..5 (Premium,
		// mis. multi-brand) TETAP pakai slug bebas dari req.Slug.
		if produkPageCount == 0 {
			isAutoProdukSlug = true
		}
	} else {
		if !premium {
			c.JSON(http.StatusForbidden, gin.H{"error": "Halaman Tambahan khusus untuk kreator Premium, upgrade dulu di Pengaturan > Langganan"})
			return
		}
		var extraPageCount int
		if err := h.DB.QueryRow(ctx, `
			SELECT COUNT(*) FROM pages WHERE user_id = $1 AND is_primary = false AND page_type != 'produk'
		`, userID).Scan(&extraPageCount); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa jumlah halaman"})
			return
		}
		if extraPageCount >= premiumExtraPageLimit {
			c.JSON(http.StatusForbidden, gin.H{"error": fmt.Sprintf("kreator Premium maksimal %d halaman tambahan", premiumExtraPageLimit)})
			return
		}
	}

	name := strings.TrimSpace(req.Name)
	var pageID string
	var err error

	if isAutoProdukSlug {
		// Toko pertama (gratis): slug=username, langsung published, DAN
		// bio/avatar/tema disalin dari halaman Bio utama (bukan dibiarkan
		// kosong/default) -- sama persis dengan ensureProdukPage, supaya
		// dibuat manual lewat sini atau otomatis lewat produk pertama
		// hasilnya konsisten.
		var username, bio, avatarURL, theme string
		var stickersRaw []byte
		var hideWatermark bool
		if scanErr := h.DB.QueryRow(ctx, `
			SELECT u.username, pg.bio, pg.avatar_url, pg.theme, pg.stickers, pg.hide_watermark
			FROM users u JOIN pages pg ON pg.user_id = u.id AND pg.is_primary = true
			WHERE u.id = $1
		`, userID).Scan(&username, &bio, &avatarURL, &theme, &stickersRaw, &hideWatermark); scanErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
			return
		}
		slug = username
		if name == "" {
			name = "Toko " + username
		}
		err = h.DB.QueryRow(ctx, `
			INSERT INTO pages (user_id, is_primary, name, slug, page_type, is_published, bio, avatar_url, theme, stickers, hide_watermark)
			VALUES ($1, false, $2, $3, 'produk', true, $4, $5, $6, $7, $8) RETURNING id
		`, userID, name, slug, bio, avatarURL, theme, stickersRaw, hideWatermark).Scan(&pageID)
	} else {
		err = h.DB.QueryRow(ctx, `
			INSERT INTO pages (user_id, is_primary, name, slug, page_type, is_published) VALUES ($1, false, $2, $3, $4, false) RETURNING id
		`, userID, name, slug, pageType).Scan(&pageID)
	}
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

type extraPageDetailResponse struct {
	ID                    string        `json:"id"`
	Name                  string        `json:"name"`
	Slug                  string        `json:"slug"`
	PageType              string        `json:"page_type"`
	DisplayName           string        `json:"display_name"`
	Bio                   string        `json:"bio"`
	AvatarURL             string        `json:"avatar_url"`
	Theme                 string        `json:"theme"`
	IsPublished           bool          `json:"is_published"`
	SeoTitle              string        `json:"seo_title"`
	SeoDescription        string        `json:"seo_description"`
	Noindex               bool          `json:"noindex"`
	CustomBackgroundType  string        `json:"custom_background_type"`
	CustomBackgroundValue string        `json:"custom_background_value"`
	CustomFont            string        `json:"custom_font"`
	CustomButtonColor     string        `json:"custom_button_color"`
	CustomButtonStyle     string        `json:"custom_button_style"`
	CustomButtonRounded   string        `json:"custom_button_rounded"`
	CustomButtonShadow    string        `json:"custom_button_shadow"`
	CustomButtonTextColor string        `json:"custom_button_text_color"`
	CustomPageTextColor   string        `json:"custom_page_text_color"`
	CustomTitleFont       string        `json:"custom_title_font"`
	CustomTitleColor      string        `json:"custom_title_color"`
	CustomStyleOverride   bool          `json:"custom_style_override"`
	Stickers              []PageSticker `json:"stickers"`
	HideWatermark         bool          `json:"hide_watermark"`
	SocialInstagram       string        `json:"social_instagram"`
	SocialTiktok          string        `json:"social_tiktok"`
	SocialFacebook        string        `json:"social_facebook"`
	SocialWhatsapp        string        `json:"social_whatsapp"`
	SocialYoutube         string        `json:"social_youtube"`
	SocialX               string        `json:"social_x"`
	SocialLinkedin        string        `json:"social_linkedin"`
	SocialTelegram        string        `json:"social_telegram"`
	SocialEmail           string        `json:"social_email"`
	LayoutVariant         string        `json:"layout_variant"`
	// ProductLayout -- lihat catatan lengkap di publicPageResponse.
	ProductLayout string `json:"product_layout"`
	IsPremium     bool   `json:"is_premium"`
}

// GetPage — Modul Halaman Toko (permintaan langsung pengguna, 7 Agustus
// 2026): "semua fitur yang ada di link bio" (builder blok/tautan + 4 panel
// desain Tema/Header/Tombol/Font) sekarang juga tersedia untuk halaman
// TAMBAHAN, bukan cuma halaman utama -- endpoint ini mengisi celah yang
// sebelumnya cuma dipenuhi ListMyPages (field terbatas: id/name/slug/bio/
// theme/is_published/page_type saja, tidak cukup untuk panel desain penuh).
// Bentuk respons SENGAJA dibuat mirip GetMyPage supaya frontend bisa
// memakai ulang pola yang sama (lihat useDesignData.ts) untuk halaman
// utama MAUPUN halaman tambahan, tinggal beda sumber data.
func (h *PageHandler) GetPage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp extraPageDetailResponse
	var stickersRaw []byte
	err := h.DB.QueryRow(ctx, `
		SELECT id, name, COALESCE(slug, ''), page_type, display_name, bio, avatar_url, theme, is_published,
			seo_title, seo_description, noindex,
			custom_background_type, custom_background_value, custom_font, custom_button_color, custom_button_style,
			custom_button_rounded, custom_button_shadow, custom_button_text_color,
			custom_page_text_color, custom_title_font, custom_title_color, custom_style_override, stickers,
			hide_watermark,
			social_instagram, social_tiktok, social_facebook, social_whatsapp, social_youtube,
			social_x, social_linkedin, social_telegram, social_email, layout_variant, product_layout
		FROM pages WHERE id = $1 AND user_id = $2 AND is_primary = false
	`, pageID, userID).Scan(&resp.ID, &resp.Name, &resp.Slug, &resp.PageType, &resp.DisplayName, &resp.Bio, &resp.AvatarURL, &resp.Theme, &resp.IsPublished,
		&resp.SeoTitle, &resp.SeoDescription, &resp.Noindex,
		&resp.CustomBackgroundType, &resp.CustomBackgroundValue, &resp.CustomFont, &resp.CustomButtonColor, &resp.CustomButtonStyle,
		&resp.CustomButtonRounded, &resp.CustomButtonShadow, &resp.CustomButtonTextColor,
		&resp.CustomPageTextColor, &resp.CustomTitleFont, &resp.CustomTitleColor, &resp.CustomStyleOverride, &stickersRaw,
		&resp.HideWatermark,
		&resp.SocialInstagram, &resp.SocialTiktok, &resp.SocialFacebook, &resp.SocialWhatsapp, &resp.SocialYoutube,
		&resp.SocialX, &resp.SocialLinkedin, &resp.SocialTelegram, &resp.SocialEmail, &resp.LayoutVariant, &resp.ProductLayout)
	if err == nil {
		_ = json.Unmarshal(stickersRaw, &resp.Stickers)
	}
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}
	resp.IsPremium = isPremiumUser(ctx, h.DB, userID)

	c.JSON(http.StatusOK, resp)
}

type updateExtraPageRequest struct {
	Name                  *string `json:"name" binding:"omitempty,max=100"`
	Slug                  *string `json:"slug" binding:"omitempty,max=50"`
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
	// CustomButtonStyle -- "fill outline shadow" (nilai lama) diperbaiki jadi
	// "fill outline glass" di sini, menyamakan dengan updatePageRequest
	// (halaman utama) -- "shadow" sudah dilebur ke axis CustomButtonShadow
	// terpisah sejak migrasi 000034, struct ini sebelumnya tidak ikut
	// diperbarui karena belum pernah dipakai panel desain penuh.
	CustomButtonStyle     *string `json:"custom_button_style" binding:"omitempty,oneof=fill outline glass"`
	CustomButtonRounded   *string `json:"custom_button_rounded" binding:"omitempty,oneof=none sm md full"`
	CustomButtonShadow    *string `json:"custom_button_shadow" binding:"omitempty,oneof=none soft strong hard"`
	CustomButtonTextColor *string `json:"custom_button_text_color" binding:"omitempty,len=7"`
	CustomPageTextColor   *string `json:"custom_page_text_color" binding:"omitempty,max=7"`
	CustomTitleFont       *string `json:"custom_title_font" binding:"omitempty,max=20"`
	CustomTitleColor      *string `json:"custom_title_color" binding:"omitempty,max=7"`
	CustomStyleOverride   *bool   `json:"custom_style_override"`
	HideWatermark         *bool   `json:"hide_watermark"`
	SocialInstagram       *string `json:"social_instagram" binding:"omitempty,max=255"`
	SocialTiktok          *string `json:"social_tiktok" binding:"omitempty,max=255"`
	SocialFacebook        *string `json:"social_facebook" binding:"omitempty,max=255"`
	SocialWhatsapp        *string `json:"social_whatsapp" binding:"omitempty,max=255"`
	SocialYoutube         *string `json:"social_youtube" binding:"omitempty,max=255"`
	SocialX               *string `json:"social_x" binding:"omitempty,max=255"`
	SocialLinkedin        *string `json:"social_linkedin" binding:"omitempty,max=255"`
	SocialTelegram        *string `json:"social_telegram" binding:"omitempty,max=255"`
	SocialEmail           *string `json:"social_email" binding:"omitempty,max=255"`
	LayoutVariant         *string `json:"layout_variant" binding:"omitempty,oneof=centered banner card spotlight cover minimal hero polaroid split ticket headline ribbon duo masthead portrait"`
	// ProductLayout -- lihat catatan lengkap di publicPageResponse
	// (page.go) & renderProductGrid (PagePreview.tsx). "category" -- susulan
	// 20 Agustus 2026: "bagian produk bisa ga dibuat layout baru di
	// kelompokan seperti ini" -- blok kategori, klik untuk drill-down.
	ProductLayout *string `json:"product_layout" binding:"omitempty,oneof=grid stacked category"`
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
	// Validasi berikut menyalin PERSIS UpdateMyPage supaya panel desain
	// halaman tambahan (Modul Halaman Toko) punya jaminan yang sama dengan
	// halaman utama -- lihat catatan lengkap di updatePageRequest.
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

	// Modul Langganan Premium: gerbang yang SAMA seperti UpdateMyPage --
	// tanpa ini, kreator gratis bisa lolos batasan latar kustom lewat
	// halaman TAMBAHAN, padahal halaman utama sudah dijaga.
	wantsCustomBackground := (req.Theme != nil && *req.Theme == "custom") ||
		req.CustomBackgroundType != nil || req.CustomBackgroundValue != nil
	if wantsCustomBackground && !isPremiumUser(ctx, h.DB, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "latar belakang kustom khusus untuk kreator Premium"})
		return
	}

	tag, err := h.DB.Exec(ctx, `
		UPDATE pages SET
			name = COALESCE($1, name),
			slug = COALESCE($2, slug),
			theme = COALESCE($3, theme),
			display_name = COALESCE($4, display_name),
			bio = COALESCE($5, bio),
			is_published = COALESCE($6, is_published),
			seo_title = COALESCE($7, seo_title),
			seo_description = COALESCE($8, seo_description),
			noindex = COALESCE($9, noindex),
			custom_background_type = COALESCE($10, custom_background_type),
			custom_background_value = COALESCE($11, custom_background_value),
			custom_font = COALESCE($12, custom_font),
			custom_button_color = COALESCE($13, custom_button_color),
			custom_button_style = COALESCE($14, custom_button_style),
			custom_button_rounded = COALESCE($15, custom_button_rounded),
			custom_button_shadow = COALESCE($16, custom_button_shadow),
			custom_button_text_color = COALESCE($17, custom_button_text_color),
			custom_page_text_color = COALESCE($18, custom_page_text_color),
			custom_title_font = COALESCE($19, custom_title_font),
			custom_title_color = COALESCE($20, custom_title_color),
			custom_style_override = COALESCE($21, custom_style_override),
			hide_watermark = COALESCE($22, hide_watermark),
			social_instagram = COALESCE($23, social_instagram),
			social_tiktok = COALESCE($24, social_tiktok),
			social_facebook = COALESCE($25, social_facebook),
			social_whatsapp = COALESCE($26, social_whatsapp),
			social_youtube = COALESCE($27, social_youtube),
			social_x = COALESCE($28, social_x),
			social_linkedin = COALESCE($29, social_linkedin),
			social_telegram = COALESCE($30, social_telegram),
			social_email = COALESCE($31, social_email),
			layout_variant = COALESCE($32, layout_variant),
			product_layout = COALESCE($33, product_layout)
		WHERE id = $34 AND user_id = $35 AND is_primary = false
	`, req.Name, slug, req.Theme, req.DisplayName, req.Bio, req.IsPublished, req.SeoTitle, req.SeoDescription, req.Noindex,
		req.CustomBackgroundType, req.CustomBackgroundValue, req.CustomFont, req.CustomButtonColor, req.CustomButtonStyle,
		req.CustomButtonRounded, req.CustomButtonShadow, req.CustomButtonTextColor,
		req.CustomPageTextColor, req.CustomTitleFont, req.CustomTitleColor, req.CustomStyleOverride,
		req.HideWatermark,
		req.SocialInstagram, req.SocialTiktok, req.SocialFacebook, req.SocialWhatsapp, req.SocialYoutube,
		req.SocialX, req.SocialLinkedin, req.SocialTelegram, req.SocialEmail, req.LayoutVariant, req.ProductLayout,
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

// UpdatePageStickers -- analog UpdateMyPageStickers untuk halaman TAMBAHAN
// (Toko/Landing/Bio kedua). Endpoint terpisah dengan alasan yang sama:
// array diganti utuh, bukan di-patch per field.
func (h *PageHandler) UpdatePageStickers(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	var req updateStickersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msg, ok := validateStickers(req.Stickers); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	stickersJSON, _ := json.Marshal(req.Stickers)
	var slug string
	if err := h.DB.QueryRow(ctx, `
		UPDATE pages SET stickers = $1
		WHERE id = $2 AND user_id = $3 AND is_primary = false
		RETURNING COALESCE(slug, '')
	`, stickersJSON, pageID, userID).Scan(&slug); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan stiker"})
		return
	}
	if h.RDB != nil && slug != "" {
		h.RDB.Del(ctx, "page-slug:"+slug)
	}

	c.JSON(http.StatusOK, gin.H{"message": "stiker disimpan"})
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
