package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/imageconv"
	"github.com/jeonme/api/internal/netguard"
	"github.com/jeonme/api/internal/storage"
)

// maxProductFileSize -- 100MB, cukup untuk ebook/template/video pendek tanpa
// membebani VPS shared. Batasi lebih longgar lewat env kalau perlu di masa depan.
const maxProductFileSize = 100 * 1024 * 1024

// allowedProductFileExt -- REQ-F-302 (validasi tipe file). Daftar putih
// (bukan daftar hitam) supaya tipe file berbahaya (.exe, .sh, dst) tertolak
// secara default alih-alih harus disebutkan satu-satu.
//
// Audit keamanan (28 Juli 2026, permintaan langsung pengguna sebelum deploy
// production): dulu map[string]bool ini HANYA memvalidasi ekstensi, lalu
// Content-Type yang DIKIRIM KLIEN dipakai apa adanya saat unggah ke S3/MinIO
// -- kreator jahat bisa mengunggah file bernama "ebook.pdf" tapi mengirim
// header Content-Type: text/html, membuat MinIO menyajikannya sebagai HTML
// ke pembeli yang mengunduh (XSS tersimpan di domain storage). Diubah jadi
// map[string]string (ekstensi -> Content-Type) yang DIPAKSAKAN dari sisi
// server, TIDAK PERNAH dipercaya dari klien -- pola yang SAMA seperti
// allowedCoverExt di bawah & allowedAvatarExt (page.go), yang sejak awal
// sudah benar untuk unggahan lain.
var allowedProductFileExt = map[string]string{
	".pdf":  "application/pdf",
	".zip":  "application/zip",
	".epub": "application/epub+zip",
	".mp4":  "video/mp4",
	".mp3":  "audio/mpeg",
	".mov":  "video/quicktime",
	".jpg":  "image/jpeg", ".jpeg": "image/jpeg",
	".png": "image/png", ".webp": "image/webp",
}

// sanitizeFileNameForKey -- audit keamanan (28 Juli 2026): nama file file
// produk (BUKAN sampul, yang key-nya sudah tetap "covers/<productID>")
// sengaja tetap menyertakan nama asli di storage key (supaya pembeli
// mengunduh dengan nama file yang manusiawi, bukan UUID acak), tapi nama
// itu SEPENUHNYA dikendalikan klien -- tanpa disaring, karakter pemisah
// jalur ("/", "\\") atau ".." bisa mengubah lokasi object yang sesungguhnya
// ditulis di storage. Disaring jadi hanya huruf/angka/titik/strip/garis
// bawah, dan setiap ".." dibuang total.
func sanitizeFileNameForKey(name string) string {
	name = strings.ReplaceAll(name, "..", "")
	name = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '-', r == '_':
			return r
		default:
			return '_'
		}
	}, name)
	if name == "" {
		name = "file"
	}
	return name
}

// maxCoverImageSize -- 5MB, cukup untuk gambar sampul produk (bukan file
// produk itu sendiri, lihat maxProductFileSize).
const maxCoverImageSize = 5 * 1024 * 1024

// allowedCoverExt -- content-type diambil dari ekstensi (BUKAN dipercaya
// dari header klien) karena sampul disajikan langsung ke <img> di halaman
// publik & dashboard lewat URL permanen, sama seperti avatar kreator
// (lihat PageHandler.allowedAvatarExt).
var allowedCoverExt = map[string]string{
	".jpg": "image/jpeg", ".jpeg": "image/jpeg",
	".png": "image/png", ".webp": "image/webp",
}

// ProductHandler mengimplementasikan REQ-F-301..304.
type ProductHandler struct {
	DB      *pgxpool.Pool
	Storage *storage.Client
	RDB     *redis.Client
	// Moderation -- permintaan langsung pengguna, 22 Agustus 2026: blokir
	// URL eksternal produk (product_kind="external_link") yang judi
	// online/18+, lihat LinkModerationChecker (moderation.go). Instance
	// yang SAMA dibagi dengan LinksHandler, diwiring di routes.go.
	Moderation *LinkModerationChecker
}

func NewProductHandler(db *pgxpool.Pool, s3 *storage.Client, rdb *redis.Client) *ProductHandler {
	return &ProductHandler{DB: db, Storage: s3, RDB: rdb}
}

// invalidatePageCache — bug ditemukan 16 Juli 2026: perubahan produk (buat/
// ubah/hapus/unggah file/unggah sampul) TIDAK PERNAH menghapus cache
// "page:<username>" (lihat PageHandler.GetPublicPage, TTL 30 detik) --
// hanya UpdateMyPage & UploadAvatar yang melakukannya. Akibatnya produk
// baru/sampul baru bisa "tidak tampil" di halaman publik sampai cache lama
// kedaluwarsa sendiri. Dipanggil di setiap handler yang mengubah data
// produk, best-effort (gagal invalidasi cache tidak menggagalkan request).
func (h *ProductHandler) invalidatePageCache(ctx context.Context, userID string) {
	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
}

type createProductRequest struct {
	Name        string `json:"name" binding:"required,max=200"`
	Description string `json:"description"`
	// PriceIDR -- pointer supaya bisa DIABAIKAN khusus product_kind=
	// "external_link" (permintaan langsung pengguna, 20 Agustus 2026: "untuk
	// produk affiliate harga jadikan optional") -- link afiliasi (Shopee/
	// Tokopedia/dll) TIDAK PERNAH lewat checkout Jeonme sama sekali (lihat
	// catatan ExternalURL di bawah), jadi harga di sini murni informasi
	// tampilan, bukan nilai transaksi -- kreator afiliasi wajar tidak selalu
	// tahu/mau menampilkan harga pasti (harga bisa berubah di toko tujuan).
	// "digital"/"payment_link" TETAP WAJIB (dicek manual di Create di bawah,
	// binding tag saja tidak bisa kondisional per product_kind) karena
	// keduanya representasi transaksi sungguhan lewat Jeonme.
	PriceIDR *int64 `json:"price_idr" binding:"omitempty,min=1000"`
	// Category -- Modul Toko (Fase B1): bebas isi kreator sendiri, lihat
	// migrasi 000046.
	Category string `json:"category" binding:"omitempty,max=50"`

	// ProductKind -- Modul Toko (Fase D): "digital" (default, produk
	// biasa dengan file) atau "payment_link" (kumpulkan pembayaran TANPA
	// file, mis. jasa/konsultasi -- lihat migrasi 000048). HANYA bisa
	// ditentukan saat pembuatan (bukan Update) -- mengubah jenis produk
	// setelah dibuat berisiko meninggalkan kombinasi data yang aneh (mis.
	// payment_link yang tiba-tiba dituntut punya file).
	//
	// "external_link" -- permintaan langsung pengguna, 17 Agustus 2026:
	// "saya mau untuk produk bisa untuk affiliate juga ke shopee dll"
	// (lihat migrasi 000068). Beda dari fitur Afiliasi (affiliate.go,
	// program referral Jeonme-internal) -- ini murni tombol "Beli" yang
	// membuka ExternalURL di tab baru, TIDAK PERNAH lewat checkout Jeonme
	// (lihat guard di checkout.go). Sama seperti payment_link, tidak
	// butuh file, aktif langsung begitu dibuat.
	ProductKind string `json:"product_kind" binding:"omitempty,oneof=digital payment_link external_link"`
	// SuccessMessage/PaymentLimitCount/LinkExpiresAt -- HANYA relevan untuk
	// product_kind="payment_link", lihat catatan lingkup di migrasi 000048.
	SuccessMessage    string  `json:"success_message" binding:"omitempty,max=1000"`
	PaymentLimitCount *int    `json:"payment_limit_count" binding:"omitempty,min=1"`
	LinkExpiresAt     *string `json:"link_expires_at"`
	// ExternalURL -- WAJIB diisi kalau ProductKind="external_link" (dicek
	// di bawah), diabaikan untuk jenis lain. Bukan sasaran permintaan
	// SERVER (cuma dibuka browser pembeli lewat window.open), jadi TIDAK
	// perlu netguard.ValidateOutboundURL seperti webhook_url -- SSRF hanya
	// relevan kalau server sendiri yang melakukan permintaan keluar.
	//
	// TAPI tetap wajib "http_url" (bukan "url" polos) -- audit keamanan 22
	// Agustus 2026: "url" menerima skema apa pun ("javascript:"/"data:"),
	// nilai ini dirender langsung sebagai href kartu produk di halaman
	// publik -- kreator jahat bisa mencuri token sesi pengunjung lain yang
	// login begitu link diklik. Beda kelas kerentanan dari SSRF (di sini
	// BROWSER pengunjung yang jadi korban, bukan server), makanya perbaikannya
	// beda juga (validasi skema URL, bukan netguard).
	ExternalURL string `json:"external_url" binding:"omitempty,http_url,max=2048"`

	// Modul Settings §3: opsional, lihat collaborator_split.go.
	CollaboratorSplits []CollaboratorSplit `json:"collaborator_splits"`
}

// Create — REQ-F-301. Endpoint ini dilindungi middleware.AuthRequired,
// jadi userID sudah tersedia di context (lihat routes.go).
func (h *ProductHandler) Create(c *gin.Context) {
	var req createProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	// Timeout lebih longgar dari 5s dasar -- h.Moderation.Check bisa
	// memanggil Claude API (dibatasi sendiri 5s, lihat internal/moderation)
	// untuk domain external_link yang belum pernah dilihat.
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if err := validateCollaboratorSplits(ctx, h.DB, req.CollaboratorSplits, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	splitsJSON := []byte("[]")
	if len(req.CollaboratorSplits) > 0 {
		splitsJSON, _ = json.Marshal(req.CollaboratorSplits)
	}

	productKind := req.ProductKind
	if productKind == "" {
		productKind = "digital"
	}
	if productKind == "external_link" && req.ExternalURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "external_url wajib diisi untuk produk jenis Link Eksternal"})
		return
	}
	if productKind == "external_link" {
		if res := h.Moderation.Check(ctx, req.ExternalURL, req.Name); res.Blocked {
			c.JSON(http.StatusBadRequest, gin.H{"error": res.Message})
			return
		}
	}
	// Harga wajib untuk SEMUA jenis produk KECUALI external_link (lihat
	// catatan lengkap di createProductRequest.PriceIDR) -- binding tag
	// `omitempty` di atas cuma bisa lewatkan validasi min, tidak bisa
	// mensyaratkan field secara kondisional per product_kind, jadi dicek
	// manual di sini.
	if productKind != "external_link" && req.PriceIDR == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "harga wajib diisi (minimal Rp1.000) untuk jenis produk ini"})
		return
	}
	var priceIDR int64
	if req.PriceIDR != nil {
		priceIDR = *req.PriceIDR
	}

	var linkExpiresAt *time.Time
	if req.LinkExpiresAt != nil && *req.LinkExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.LinkExpiresAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format link_expires_at tidak valid (pakai RFC3339)"})
			return
		}
		linkExpiresAt = &t
	}

	id := uuid.NewString()
	_, err := h.DB.Exec(ctx, `
		INSERT INTO products (
			id, user_id, name, description, price_idr, is_active, collaborator_splits, category,
			product_kind, success_message, payment_limit_count, link_expires_at, external_url
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`, id, userID, req.Name, req.Description, priceIDR,
		// SELALU dibuat tidak aktif -- permintaan langsung pengguna, 19
		// Agustus 2026 (gambar sampul wajib): SEBELUMNYA Payment Link/Link
		// Eksternal langsung aktif begitu dibuat (tidak butuh file), tapi
		// endpoint create ini tidak pernah menerima gambar sampul sama
		// sekali (diunggah TERPISAH lewat UploadCover setelah produk ada) --
		// kalau tetap langsung aktif di sini, gerbang sampul wajib di Update
		// tidak akan pernah sempat dicek untuk kedua jenis ini. Sekarang
		// SEMUA jenis produk (termasuk payment_link/external_link) butuh
		// langkah aktivasi eksplisit lewat Update setelah sampul terunggah,
		// sama seperti produk digital biasa.
		false,
		splitsJSON, req.Category, productKind, req.SuccessMessage, req.PaymentLimitCount, linkExpiresAt, req.ExternalURL)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat produk"})
		return
	}

	h.invalidatePageCache(ctx, userID)
	// Modul Halaman Produk: pemicu otomatis "Toko" gratis begitu produk
	// pertama ada -- lihat catatan lengkap di ensureProdukPage (page.go).
	ensureProdukPage(ctx, h.DB, h.RDB, userID)

	message := "produk dibuat, unggah file sebelum mengaktifkan produk"
	if productKind == "payment_link" {
		message = "payment link dibuat dan langsung aktif"
	} else if productKind == "external_link" {
		message = "produk link eksternal dibuat dan langsung aktif"
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "message": message})
}

// effectivePriceExpr -- No.68: harga flash sale dihitung LIVE dari now(),
// bukan disimpan sebagai flag yang perlu direset manual/lewat cron. Dipakai
// berulang di List/GetPublicPage/checkout, disalin apa adanya di tiap query
// (mengikuti gaya kodebase ini -- SQL mentah, bukan query builder).
const effectivePriceExpr = `
	CASE WHEN flash_sale_price_idr IS NOT NULL AND now() BETWEEN flash_sale_starts_at AND flash_sale_ends_at
		THEN flash_sale_price_idr ELSE price_idr END AS effective_price_idr,
	(flash_sale_price_idr IS NOT NULL AND now() BETWEEN flash_sale_starts_at AND flash_sale_ends_at) AS is_flash_sale_active
`

// List mengembalikan seluruh produk milik kreator yang sedang login.
func (h *ProductHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// No.70/71/90/91/92: bundel, blok dukungan, event, kursus, dan booking
	// TIDAK ikut tampil di sini -- masing-masing punya halaman dashboard
	// sendiri (/dashboard/bundles, /dashboard/donation, /dashboard/events,
	// /dashboard/courses, /dashboard/bookings), sama seperti voucher.
	// Modul Statistik/Toko (tab "Manage Items"): sold_count -- jumlah order
	// LUNAS per produk, sumber kebenaran yang SAMA seperti top_products di
	// AnalyticsHandler ("status = 'paid'" saja) -- ditampilkan sebagai kolom
	// "Terjual" di tabel, bukan angka rekaan.
	rows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, p.description, p.price_idr, p.is_active, p.file_key != '' AS has_file, p.cover_image_url,
			p.flash_sale_price_idr, p.flash_sale_starts_at, p.flash_sale_ends_at, `+effectivePriceExpr+`,
			p.pwyw_enabled, p.pwyw_min_price_idr, p.watermark_enabled, p.file_key ILIKE '%.pdf' AS is_pdf, p.collaborator_splits,
			COALESCE(o.sold_count, 0) AS sold_count, p.category,
			p.delivery_method, p.webhook_url, COALESCE(pc.unclaimed_count, 0) AS unclaimed_code_count,
			p.product_kind, p.success_message, p.payment_limit_count, p.link_expires_at, p.external_url,
			p.position, p.is_featured, COALESCE(pcl.click_count, 0) AS click_count
		FROM products p
		LEFT JOIN (
			SELECT product_id, COUNT(*) AS sold_count FROM orders WHERE status = 'paid' GROUP BY product_id
		) o ON o.product_id = p.id
		LEFT JOIN (
			SELECT product_id, COUNT(*) AS unclaimed_count FROM product_codes WHERE claimed_by_order_id IS NULL GROUP BY product_id
		) pc ON pc.product_id = p.id
		-- click_count -- permintaan langsung pengguna, 13 Agustus 2026: "di
		-- link bio dan juga product tambahkan dibagian bawah statistik
		-- berapa kali jumlah klik per bloknya". Sumber SAMA persis dengan
		-- TotalProductClicks (analytics.go) -- analytics_events tipe
		-- "product_click" -- sebelumnya cuma dihitung sebagai TOTAL
		-- gabungan, sekarang juga per-produk di sini.
		LEFT JOIN (
			SELECT product_id, COUNT(*) AS click_count FROM analytics_events WHERE event_type = 'product_click' GROUP BY product_id
		) pcl ON pcl.product_id = p.id
		WHERE p.user_id = $1 AND p.is_bundle = false AND p.is_donation = false AND p.is_event = false
			AND p.is_course = false AND p.is_booking = false
		ORDER BY p.is_featured DESC, p.position ASC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}
	defer rows.Close()

	type item struct {
		ID                 string              `json:"id"`
		Name               string              `json:"name"`
		Description        string              `json:"description"`
		PriceIDR           int64               `json:"price_idr"`
		IsActive           bool                `json:"is_active"`
		HasFile            bool                `json:"has_file"`
		CoverImageURL      string              `json:"cover_image_url"`
		FlashSalePriceIDR  *int64              `json:"flash_sale_price_idr"`
		FlashSaleStartsAt  *time.Time          `json:"flash_sale_starts_at"`
		FlashSaleEndsAt    *time.Time          `json:"flash_sale_ends_at"`
		EffectivePriceIDR  int64               `json:"effective_price_idr"`
		IsFlashSaleActive  bool                `json:"is_flash_sale_active"`
		PwywEnabled        bool                `json:"pwyw_enabled"`
		PwywMinPriceIDR    *int64              `json:"pwyw_min_price_idr"`
		WatermarkEnabled   bool                `json:"watermark_enabled"`
		IsPdf              bool                `json:"is_pdf"`
		CollaboratorSplits []CollaboratorSplit `json:"collaborator_splits"`
		SoldCount          int64               `json:"sold_count"`
		Category           string              `json:"category"`
		DeliveryMethod     string              `json:"delivery_method"`
		WebhookURL         string              `json:"webhook_url"`
		UnclaimedCodeCount int64               `json:"unclaimed_code_count"`
		ProductKind        string              `json:"product_kind"`
		SuccessMessage     string              `json:"success_message"`
		PaymentLimitCount  *int                `json:"payment_limit_count"`
		LinkExpiresAt      *time.Time          `json:"link_expires_at"`
		ExternalURL        string              `json:"external_url"`
		Position           int                 `json:"position"`
		IsFeatured         bool                `json:"is_featured"`
		// ClickCount -- lihat catatan lengkap di query SELECT di atas.
		ClickCount int64 `json:"click_count"`
	}
	items := []item{}
	for rows.Next() {
		var it item
		var splitsRaw []byte
		if err := rows.Scan(&it.ID, &it.Name, &it.Description, &it.PriceIDR, &it.IsActive, &it.HasFile, &it.CoverImageURL,
			&it.FlashSalePriceIDR, &it.FlashSaleStartsAt, &it.FlashSaleEndsAt, &it.EffectivePriceIDR, &it.IsFlashSaleActive,
			&it.PwywEnabled, &it.PwywMinPriceIDR, &it.WatermarkEnabled, &it.IsPdf, &splitsRaw, &it.SoldCount, &it.Category,
			&it.DeliveryMethod, &it.WebhookURL, &it.UnclaimedCodeCount,
			&it.ProductKind, &it.SuccessMessage, &it.PaymentLimitCount, &it.LinkExpiresAt, &it.ExternalURL,
			&it.Position, &it.IsFeatured, &it.ClickCount); err == nil {
			if len(splitsRaw) > 0 {
				_ = json.Unmarshal(splitsRaw, &it.CollaboratorSplits)
			}
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type updateProductRequest struct {
	Name              *string `json:"name" binding:"omitempty,max=200"`
	Description       *string `json:"description"`
	PriceIDR          *int64  `json:"price_idr" binding:"omitempty,min=1000"`
	IsActive          *bool   `json:"is_active"`
	FlashSalePriceIDR *int64  `json:"flash_sale_price_idr" binding:"omitempty,min=1"`
	FlashSaleStartsAt *string `json:"flash_sale_starts_at"`
	FlashSaleEndsAt   *string `json:"flash_sale_ends_at"`
	ClearFlashSale    bool    `json:"clear_flash_sale"`
	PwywEnabled       *bool   `json:"pwyw_enabled"`
	PwywMinPriceIDR   *int64  `json:"pwyw_min_price_idr" binding:"omitempty,min=1000"`
	WatermarkEnabled  *bool   `json:"watermark_enabled"`

	// No.90 (Sprint 11): reschedule/edit event -- lihat EventHandler.Create
	// untuk validasi awal saat pembuatan.
	EventStartsAt      *string `json:"event_starts_at"`
	EventEndsAt        *string `json:"event_ends_at"`
	EventLocation      *string `json:"event_location"`
	EventIsOnline      *bool   `json:"event_is_online"`
	EventCapacity      *int    `json:"event_capacity" binding:"omitempty,min=1"`
	ClearEventCapacity bool    `json:"clear_event_capacity"`

	// Modul Settings §3: nil berarti tidak diubah (pola sama dengan field
	// opsional lain di sini), lihat collaborator_split.go.
	CollaboratorSplits *[]CollaboratorSplit `json:"collaborator_splits"`

	// Category -- Modul Toko (Fase B1): lihat catatan lingkup di
	// createProductRequest.
	Category *string `json:"category" binding:"omitempty,max=50"`

	// DeliveryMethod/WebhookURL -- Modul Toko (Fase C): lihat migrasi 000047.
	// webhook_secret TIDAK bisa diisi lewat request ini (dibuat SERVER,
	// lihat Update di bawah) -- mencegah kreator/pihak lain menebak/
	// menimpa nilai yang dipakai memverifikasi keaslian pengirim webhook.
	DeliveryMethod *string `json:"delivery_method" binding:"omitempty,oneof=download_link manual random_code webhook"`
	WebhookURL     *string `json:"webhook_url" binding:"omitempty,max=500"`

	// SuccessMessage/PaymentLimitCount/LinkExpiresAt -- Modul Toko (Fase D):
	// hanya efektif untuk product_kind="payment_link", lihat migrasi 000048.
	SuccessMessage      *string `json:"success_message" binding:"omitempty,max=1000"`
	PaymentLimitCount   *int    `json:"payment_limit_count" binding:"omitempty,min=1"`
	ClearPaymentLimit   bool    `json:"clear_payment_limit"`
	LinkExpiresAt       *string `json:"link_expires_at"`
	ClearLinkExpiration bool    `json:"clear_link_expiration"`

	// IsFeatured -- Modul Toko (Fase E2, tab Listing): lihat migrasi 000050.
	IsFeatured *bool `json:"is_featured"`

	// ExternalURL -- Modul Toko: hanya efektif untuk product_kind=
	// "external_link" (lihat migrasi 000068), tapi tetap boleh diubah lewat
	// Update (beda dari ProductKind sendiri yang immutable) -- kreator bisa
	// memperbaiki tautan yang salah/kedaluwarsa tanpa perlu membuat ulang
	// produknya dari awal.
	ExternalURL *string `json:"external_url" binding:"omitempty,http_url,max=2048"`
}

// Update — REQ-F-301 (lanjutan: edit) & REQ-F-303 (aktifkan/nonaktifkan).
// Produk hanya boleh diaktifkan kalau file_key sudah terisi (file sudah
// diunggah) -- mencegah produk kosong tampil bisa "dibeli" di halaman publik.
func (h *ProductHandler) Update(c *gin.Context) {
	productID := c.Param("id")
	userID := c.GetString("userID")

	var req updateProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Perbaikan SSRF (audit keamanan 14 Agustus 2026): validasi cepat saat
	// DISIMPAN supaya kesalahan jelas (skema salah, literal IP privat)
	// langsung ketahuan di UI. Ini cuma feedback dini -- proteksi
	// SESUNGGUHNYA (blokir DNS rebinding) ada di netguard.NewOutboundClient
	// yang dipakai worker.deliverProductWebhook saat webhook BENAR-BENAR
	// dipanggil, lihat komentar panjang di internal/netguard/netguard.go.
	if req.WebhookURL != nil && *req.WebhookURL != "" {
		if err := netguard.ValidateOutboundURL(*req.WebhookURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "webhook_url: " + err.Error()})
			return
		}
	}

	// Timeout lebih longgar dari 5s dasar -- h.Moderation.Check bisa
	// memanggil Claude API (dibatasi sendiri 5s, lihat internal/moderation)
	// untuk domain external_link yang belum pernah dilihat.
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var fileKey, coverImageURL, currentName string
	var currentPriceIDR int64
	var currentFlashSalePriceIDR *int64
	var currentPwywEnabled bool
	var currentPwywMinPriceIDR *int64
	var isBundle, isDonation, isEvent, isCourse, isBooking bool
	var currentWebhookSecret, productKind string
	err := h.DB.QueryRow(ctx, `
		SELECT file_key, cover_image_url, price_idr, flash_sale_price_idr, pwyw_enabled, pwyw_min_price_idr, is_bundle, is_donation, is_event, is_course, is_booking, webhook_secret, product_kind, name
		FROM products WHERE id = $1 AND user_id = $2
	`, productID, userID).Scan(&fileKey, &coverImageURL, &currentPriceIDR, &currentFlashSalePriceIDR, &currentPwywEnabled, &currentPwywMinPriceIDR, &isBundle, &isDonation, &isEvent, &isCourse, &isBooking, &currentWebhookSecret, &productKind, &currentName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}

	if productKind == "external_link" && req.ExternalURL != nil && *req.ExternalURL != "" {
		name := currentName
		if req.Name != nil {
			name = *req.Name
		}
		if res := h.Moderation.Check(ctx, *req.ExternalURL, name); res.Blocked {
			c.JSON(http.StatusBadRequest, gin.H{"error": res.Message})
			return
		}
	}

	// No.70/71/90/91/92: bundel, blok dukungan, event, kursus, dan booking
	// tidak pernah punya file sendiri -- keabsahannya dijamin di tempat lain
	// (bundel: minimal 2 produk aktif saat dibuat; donasi: selalu bayar-
	// seikhlasnya; event: yang dijual adalah tiket; kursus: materinya video
	// per-bab di course_chapters; booking: yang dijual adalah slot waktu),
	// jadi lewati pengecekan file_key yang berlaku untuk produk biasa.
	// Modul Toko (Fase D): payment_link/external_link TIDAK LAGI aktif
	// otomatis sejak dibuat (lihat Create) -- sejak gerbang sampul di bawah
	// ini ada, keduanya juga wajib lewat pengecekan yang sama seperti
	// produk digital biasa.
	if req.IsActive != nil && *req.IsActive && fileKey == "" && !isBundle && !isDonation && !isEvent && !isCourse && !isBooking && productKind != "payment_link" && productKind != "external_link" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unggah file produk dulu sebelum mengaktifkan"})
		return
	}

	// Gambar sampul wajib -- permintaan langsung pengguna, 19 Agustus 2026:
	// "gambar sampul dan juga gambar product itu disamakan saja jadi
	// sampul jangan dijadikan opsional". Berlaku untuk SEMUA jenis produk
	// yang tampil di grid Produk publik (digital/payment_link/
	// external_link/bundel/kursus) -- donasi/event/booking DIKECUALIKAN
	// karena tidak pernah tampil sebagai kartu grid (masing-masing blok
	// tersendiri dengan tata letak berbeda, lihat finishPublicPageResponse
	// di page.go), sampul bukan bagian dari tampilan blok-blok itu.
	if req.IsActive != nil && *req.IsActive && coverImageURL == "" && !isDonation && !isEvent && !isBooking {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unggah gambar sampul dulu sebelum mengaktifkan"})
		return
	}

	// No.90: reschedule event -- kedua waktu wajib diisi bersamaan (pola
	// sama seperti flash sale), berakhir harus setelah mulai.
	var eventStarts, eventEnds *time.Time
	if req.EventStartsAt != nil || req.EventEndsAt != nil {
		if req.EventStartsAt == nil || req.EventEndsAt == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "waktu mulai dan berakhir event wajib diisi bersamaan"})
			return
		}
		starts, err := time.Parse(time.RFC3339, *req.EventStartsAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format event_starts_at tidak valid (pakai RFC3339)"})
			return
		}
		ends, err := time.Parse(time.RFC3339, *req.EventEndsAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format event_ends_at tidak valid (pakai RFC3339)"})
			return
		}
		if !ends.After(starts) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "waktu berakhir event harus setelah waktu mulai"})
			return
		}
		eventStarts, eventEnds = &starts, &ends
	}

	if req.ClearEventCapacity {
		if _, err := h.DB.Exec(ctx, `UPDATE products SET event_capacity = NULL WHERE id = $1`, productID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus batas kuota"})
			return
		}
	}

	// No.69: pwyw & flash sale (No.68) sengaja tidak boleh aktif bersamaan
	// pada produk yang sama -- kalau pembeli sudah bebas menentukan harga
	// sendiri, harga coret flash sale jadi tidak masuk akal.
	pwywWillBeEnabled := currentPwywEnabled
	if req.PwywEnabled != nil {
		pwywWillBeEnabled = *req.PwywEnabled
	}
	flashSaleWillBeSet := currentFlashSalePriceIDR != nil
	if req.ClearFlashSale {
		flashSaleWillBeSet = false
	}
	if req.FlashSalePriceIDR != nil && req.FlashSaleStartsAt != nil && req.FlashSaleEndsAt != nil {
		flashSaleWillBeSet = true
	}
	if pwywWillBeEnabled && flashSaleWillBeSet {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bayar seikhlasnya dan flash sale tidak bisa aktif bersamaan -- batalkan salah satu dulu"})
		return
	}

	if req.PwywEnabled != nil && *req.PwywEnabled {
		minPrice := currentPwywMinPriceIDR
		if req.PwywMinPriceIDR != nil {
			minPrice = req.PwywMinPriceIDR
		}
		if minPrice == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "harga minimum wajib diisi untuk mengaktifkan bayar seikhlasnya"})
			return
		}
	}

	// No.85: watermark cuma berlaku untuk file PDF (sama seperti batasan
	// Lynk.id) -- ditolak lebih awal daripada diam-diam tidak berefek.
	if req.WatermarkEnabled != nil && *req.WatermarkEnabled && !isPdfKey(fileKey) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "watermark hanya berlaku untuk file produk berformat PDF"})
		return
	}

	// No.68: validasi flash sale -- ketiga field wajib diisi bersamaan,
	// harga flash sale harus lebih murah dari harga (baru, kalau diubah
	// bersamaan) saat ini, dan periode harus masuk akal.
	var flashStarts, flashEnds *time.Time
	if req.FlashSalePriceIDR != nil || req.FlashSaleStartsAt != nil || req.FlashSaleEndsAt != nil {
		if req.FlashSalePriceIDR == nil || req.FlashSaleStartsAt == nil || req.FlashSaleEndsAt == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "harga, mulai, dan berakhir flash sale wajib diisi bersamaan"})
			return
		}
		effectivePrice := currentPriceIDR
		if req.PriceIDR != nil {
			effectivePrice = *req.PriceIDR
		}
		if *req.FlashSalePriceIDR >= effectivePrice {
			c.JSON(http.StatusBadRequest, gin.H{"error": "harga flash sale harus lebih murah dari harga produk"})
			return
		}
		starts, err := time.Parse(time.RFC3339, *req.FlashSaleStartsAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format flash_sale_starts_at tidak valid (pakai RFC3339)"})
			return
		}
		ends, err := time.Parse(time.RFC3339, *req.FlashSaleEndsAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format flash_sale_ends_at tidak valid (pakai RFC3339)"})
			return
		}
		if !ends.After(starts) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "waktu berakhir flash sale harus setelah waktu mulai"})
			return
		}
		flashStarts, flashEnds = &starts, &ends
	}

	if req.ClearFlashSale {
		if _, err := h.DB.Exec(ctx, `
			UPDATE products SET flash_sale_price_idr = NULL, flash_sale_starts_at = NULL, flash_sale_ends_at = NULL
			WHERE id = $1
		`, productID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membatalkan flash sale"})
			return
		}
	}

	// Modul Toko (Fase D): link_expires_at -- pola sama seperti flash sale
	// (nil berarti tidak diubah, Clear* berarti hapus batas).
	var linkExpiresAt *time.Time
	if req.LinkExpiresAt != nil && *req.LinkExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.LinkExpiresAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format link_expires_at tidak valid (pakai RFC3339)"})
			return
		}
		linkExpiresAt = &t
	}
	if req.ClearLinkExpiration {
		if _, err := h.DB.Exec(ctx, `UPDATE products SET link_expires_at = NULL WHERE id = $1`, productID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus batas waktu link"})
			return
		}
	}
	if req.ClearPaymentLimit {
		if _, err := h.DB.Exec(ctx, `UPDATE products SET payment_limit_count = NULL WHERE id = $1`, productID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus batas jumlah pembayaran"})
			return
		}
	}

	// Modul Settings §3: divalidasi SEBELUM UPDATE dijalankan -- nil berarti
	// field ini tidak dikirim sama sekali (tidak diubah), beda dari slice
	// kosong (`[]`) yang berarti "hapus semua split".
	var collaboratorSplitsJSON []byte
	if req.CollaboratorSplits != nil {
		if err := validateCollaboratorSplits(ctx, h.DB, *req.CollaboratorSplits, userID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		collaboratorSplitsJSON, _ = json.Marshal(*req.CollaboratorSplits)
	}

	// webhook_secret -- Modul Toko (Fase C3): dibuat SEKALI, hanya saat
	// kreator PERTAMA kali memilih delivery_method="webhook" dan belum
	// pernah punya secret (bukan diregenerasi tiap update lain) -- lihat
	// catatan lingkup di migrasi 000047.
	var newWebhookSecret *string
	if req.DeliveryMethod != nil && *req.DeliveryMethod == "webhook" && currentWebhookSecret == "" {
		secretBytes := make([]byte, 32)
		if _, err := rand.Read(secretBytes); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kunci webhook"})
			return
		}
		s := hex.EncodeToString(secretBytes)
		newWebhookSecret = &s
	}

	_, err = h.DB.Exec(ctx, `
		UPDATE products SET
			name = COALESCE($1, name),
			description = COALESCE($2, description),
			price_idr = COALESCE($3, price_idr),
			is_active = COALESCE($4, is_active),
			flash_sale_price_idr = COALESCE($5, flash_sale_price_idr),
			flash_sale_starts_at = COALESCE($6, flash_sale_starts_at),
			flash_sale_ends_at = COALESCE($7, flash_sale_ends_at),
			pwyw_enabled = COALESCE($8, pwyw_enabled),
			pwyw_min_price_idr = COALESCE($9, pwyw_min_price_idr),
			watermark_enabled = COALESCE($10, watermark_enabled),
			event_starts_at = COALESCE($11, event_starts_at),
			event_ends_at = COALESCE($12, event_ends_at),
			event_location = COALESCE($13, event_location),
			event_is_online = COALESCE($14, event_is_online),
			event_capacity = COALESCE($15, event_capacity),
			collaborator_splits = COALESCE($16, collaborator_splits),
			category = COALESCE($17, category),
			delivery_method = COALESCE($19, delivery_method),
			webhook_url = COALESCE($20, webhook_url),
			webhook_secret = COALESCE($21, webhook_secret),
			success_message = COALESCE($22, success_message),
			payment_limit_count = COALESCE($23, payment_limit_count),
			link_expires_at = COALESCE($24, link_expires_at),
			is_featured = COALESCE($25, is_featured),
			external_url = COALESCE($26, external_url)
		WHERE id = $18
	`, req.Name, req.Description, req.PriceIDR, req.IsActive, req.FlashSalePriceIDR, flashStarts, flashEnds,
		req.PwywEnabled, req.PwywMinPriceIDR, req.WatermarkEnabled,
		eventStarts, eventEnds, req.EventLocation, req.EventIsOnline, req.EventCapacity, collaboratorSplitsJSON, req.Category, productID,
		req.DeliveryMethod, req.WebhookURL, newWebhookSecret,
		req.SuccessMessage, req.PaymentLimitCount, linkExpiresAt, req.IsFeatured, req.ExternalURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui produk"})
		return
	}

	h.invalidatePageCache(ctx, userID)

	c.JSON(http.StatusOK, gin.H{"message": "produk diperbarui"})
}

// Reorder -- Modul Toko (Fase E2, tab Listing): urutan tampil di halaman
// publik & tabel Manage Items. Pola SAMA persis dengan LinksHandler.Reorder
// (reorderItem, transaksi per-item dengan pengecekan kepemilikan).
func (h *ProductHandler) Reorder(c *gin.Context) {
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
		res, err := tx.Exec(ctx, `UPDATE products SET position = $1 WHERE id = $2 AND user_id = $3`, item.Position, item.ID, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan urutan"})
			return
		}
		if res.RowsAffected() == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "produk bukan milik akun ini"})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan urutan"})
		return
	}

	h.invalidatePageCache(ctx, userID)

	c.JSON(http.StatusOK, gin.H{"message": "urutan produk disimpan"})
}

// GetWebhookSecret -- Modul Toko (Fase C3): endpoint TERPISAH dari List
// (bukan field biasa di respons produk) supaya secret tidak ikut nongol di
// setiap pemanggilan daftar produk/log -- kreator sengaja harus buka
// panel "Kelola" > lihat kunci webhook untuk mengambilnya, mirip pola
// "reveal API key" pada umumnya.
func (h *ProductHandler) GetWebhookSecret(c *gin.Context) {
	productID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var secret string
	if err := h.DB.QueryRow(ctx, `
		SELECT webhook_secret FROM products WHERE id = $1 AND user_id = $2
	`, productID, userID).Scan(&secret); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"webhook_secret": secret})
}

type addProductCodesRequest struct {
	// Codes -- satu baris teks per kode (kreator tempel daftar dari mana
	// pun, mis. hasil generate lisensi software) -- validasi & dedup
	// dilakukan di sini, bukan dipaksa format tertentu, supaya kreator
	// bebas memakai format kode apa pun.
	Codes []string `json:"codes" binding:"required,min=1,dive,required,max=200"`
}

// AddCodes -- Modul Toko (Fase C2, metode "random_code"): tambah kode ke
// "stok". Duplikat (baik sesama kode baru maupun yang sudah ada di
// database) dilewati diam-diam (ON CONFLICT DO NOTHING, lihat UNIQUE
// (product_id, code) di migrasi 000047) -- lebih ramah daripada menolak
// seluruh batch hanya karena satu baris kebetulan sudah pernah diunggah.
func (h *ProductHandler) AddCodes(c *gin.Context) {
	productID := c.Param("id")
	userID := c.GetString("userID")

	var req addProductCodesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var owns bool
	if err := h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1 AND user_id = $2)`, productID, userID).Scan(&owns); err != nil || !owns {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}

	added := 0
	for _, code := range req.Codes {
		code = strings.TrimSpace(code)
		if code == "" {
			continue
		}
		tag, err := h.DB.Exec(ctx, `
			INSERT INTO product_codes (id, product_id, code) VALUES ($1, $2, $3)
			ON CONFLICT (product_id, code) DO NOTHING
		`, uuid.NewString(), productID, code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan kode"})
			return
		}
		added += int(tag.RowsAffected())
	}

	c.JSON(http.StatusOK, gin.H{"added": added, "message": fmt.Sprintf("%d kode baru ditambahkan", added)})
}

type productCodeItem struct {
	ID         string     `json:"id"`
	Code       string     `json:"code"`
	ClaimedAt  *time.Time `json:"claimed_at"`
	BuyerEmail string     `json:"buyer_email,omitempty"`
}

// ListCodes -- Modul Toko (Fase C2): daftar kode + status klaim, dipakai
// panel "Kelola" (lihat stok tersedia vs yang sudah terpakai).
func (h *ProductHandler) ListCodes(c *gin.Context) {
	productID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var owns bool
	if err := h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1 AND user_id = $2)`, productID, userID).Scan(&owns); err != nil || !owns {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT pc.id, pc.code, pc.claimed_at, COALESCE(o.buyer_email, '')
		FROM product_codes pc
		LEFT JOIN orders o ON o.id = pc.claimed_by_order_id
		WHERE pc.product_id = $1
		ORDER BY pc.claimed_by_order_id IS NULL DESC, pc.created_at DESC
	`, productID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat kode"})
		return
	}
	defer rows.Close()

	items := []productCodeItem{}
	for rows.Next() {
		var it productCodeItem
		if err := rows.Scan(&it.ID, &it.Code, &it.ClaimedAt, &it.BuyerEmail); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// DeleteCode -- Modul Toko (Fase C2): hanya kode yang BELUM diklaim boleh
// dihapus (kode yang sudah terlanjur dikirim ke pembeli harus tetap ada
// sebagai riwayat, jangan sampai pembeli kehilangan buktinya).
func (h *ProductHandler) DeleteCode(c *gin.Context) {
	codeID := c.Param("codeId")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		DELETE FROM product_codes WHERE id = $1 AND claimed_by_order_id IS NULL
			AND product_id IN (SELECT id FROM products WHERE user_id = $2)
	`, codeID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus kode"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "kode tidak ditemukan atau sudah diklaim"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "kode dihapus"})
}

// Delete — REQ-F-301 (lanjutan). Menghapus file di storage juga (best-effort,
// tidak menggagalkan penghapusan record kalau storage sedang bermasalah).
func (h *ProductHandler) Delete(c *gin.Context) {
	productID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var fileKey string
	err := h.DB.QueryRow(ctx, `SELECT file_key FROM products WHERE id = $1 AND user_id = $2`, productID, userID).Scan(&fileKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}

	// Bug ditemukan (staging, 5 Agustus 2026): orders_product_id_fkey SENGAJA
	// tidak ON DELETE CASCADE (lihat migrasi 000001) -- jejak transaksi/ledger/
	// refund tidak boleh ikut hilang diam-diam kalau produknya dihapus. Tanpa
	// pengecekan ini, DELETE di bawah gagal kena pelanggaran foreign key dan
	// hanya membalas 500 generik. Dicek DI SINI dulu supaya kreator dapat
	// pesan jelas -- nonaktifkan produknya saja kalau sudah pernah ada
	// transaksi, bukan hapus permanen.
	var orderCount int
	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM orders WHERE product_id = $1`, productID).Scan(&orderCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa riwayat transaksi produk"})
		return
	}
	if orderCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "produk ini sudah pernah ada transaksi, tidak bisa dihapus permanen -- nonaktifkan saja lewat toggle Aktif"})
		return
	}

	if _, err := h.DB.Exec(ctx, `DELETE FROM products WHERE id = $1`, productID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus produk"})
		return
	}

	if h.Storage != nil && fileKey != "" {
		_ = h.Storage.Delete(ctx, fileKey)
	}

	h.invalidatePageCache(ctx, userID)

	c.JSON(http.StatusOK, gin.H{"message": "produk dihapus"})
}

type storageFileItem struct {
	ProductID     string `json:"product_id"`
	ProductName   string `json:"product_name"`
	HasFile       bool   `json:"has_file"`
	FileSizeBytes *int64 `json:"file_size_bytes"`
	CoverImageURL string `json:"cover_image_url"`
	IsActive      bool   `json:"is_active"`
}

// ListStorage -- Modul Toko (Fase E3, tab Storage & Files): satu baris per
// produk yang PUNYA file (has_file) -- produk tanpa file (mis. baru
// dibuat, atau Payment Link) tidak relevan di sini. total_bytes menjumlah
// HANYA file_size_bytes yang diketahui (bukan NULL) -- lihat catatan
// lingkup jujur di migrasi 000051 (file lama sebelum kolom ini ada tidak
// punya ukuran tercatat).
func (h *ProductHandler) ListStorage(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, name, file_key != '', file_size_bytes, cover_image_url, is_active
		FROM products
		WHERE user_id = $1 AND file_key != ''
		ORDER BY file_size_bytes DESC NULLS LAST
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat data penyimpanan"})
		return
	}
	defer rows.Close()

	items := []storageFileItem{}
	var totalBytes int64
	for rows.Next() {
		var it storageFileItem
		if err := rows.Scan(&it.ProductID, &it.ProductName, &it.HasFile, &it.FileSizeBytes, &it.CoverImageURL, &it.IsActive); err == nil {
			items = append(items, it)
			if it.FileSizeBytes != nil {
				totalBytes += *it.FileSizeBytes
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"files": items, "total_bytes": totalBytes})
}

type webhookEventItem struct {
	ID           string    `json:"id"`
	ProductID    string    `json:"product_id"`
	ProductName  string    `json:"product_name"`
	OrderID      string    `json:"order_id"`
	URL          string    `json:"url"`
	Status       string    `json:"status"`
	ResponseCode *int      `json:"response_code"`
	ErrorMessage string    `json:"error_message"`
	Attempt      int       `json:"attempt"`
	CreatedAt    time.Time `json:"created_at"`
}

// ListWebhookEvents -- Modul Toko (Fase E4, tab Webhook Events): log
// pengiriman webhook (lihat worker.HandleProductWebhookDelivery, Fase C3) --
// murni BACA, tidak ada aksi retry manual di v1 ini (kreator perbaiki
// URL/server sendiri lalu pesanan BERIKUTNYA otomatis dicoba lagi, bukan
// retry pengiriman lama yang datanya sudah kedaluwarsa).
func (h *ProductHandler) ListWebhookEvents(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT wd.id, wd.product_id, p.name, wd.order_id, wd.url, wd.status, wd.response_code, wd.error_message, wd.attempt, wd.created_at
		FROM webhook_deliveries wd JOIN products p ON p.id = wd.product_id
		WHERE wd.user_id = $1
		ORDER BY wd.created_at DESC LIMIT 100
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat log webhook"})
		return
	}
	defer rows.Close()

	items := []webhookEventItem{}
	for rows.Next() {
		var it webhookEventItem
		if err := rows.Scan(&it.ID, &it.ProductID, &it.ProductName, &it.OrderID, &it.URL, &it.Status, &it.ResponseCode, &it.ErrorMessage, &it.Attempt, &it.CreatedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// getShopPauseStatus -- dipakai bersama oleh GetShopSettings (dashboard) dan
// finishPublicPageResponse (page.go, halaman publik) supaya sumber kebenaran
// status jeda toko cuma satu tempat.
func getShopPauseStatus(ctx context.Context, db *pgxpool.Pool, userID string) (bool, string) {
	var pausedAt *time.Time
	var message string
	if err := db.QueryRow(ctx, `SELECT shop_paused_at, shop_paused_message FROM users WHERE id = $1`, userID).Scan(&pausedAt, &message); err != nil {
		return false, ""
	}
	return pausedAt != nil, message
}

type shopSettingsResponse struct {
	ShopPaused        bool   `json:"shop_paused"`
	ShopPausedMessage string `json:"shop_paused_message"`
}

// GetShopSettings -- Modul Toko (Fase E5): tab Shop Settings.
func (h *ProductHandler) GetShopSettings(c *gin.Context) {
	userID := c.GetString("userID")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	paused, message := getShopPauseStatus(ctx, h.DB, userID)
	c.JSON(http.StatusOK, shopSettingsResponse{ShopPaused: paused, ShopPausedMessage: message})
}

type updateShopSettingsRequest struct {
	ShopPaused        bool   `json:"shop_paused"`
	ShopPausedMessage string `json:"shop_paused_message"`
}

// UpdateShopSettings -- Modul Toko (Fase E5): "Toko Dijeda" menyembunyikan
// tombol beli di seluruh katalog & menolak checkout baru (lihat pengecekan
// di checkout.go Create) TANPA menonaktifkan tiap produk satu per satu.
// shop_paused_at dipertahankan (bukan direset ke now()) kalau toko sudah
// dijeda sebelumnya, supaya durasi jeda tetap tercatat dari awal.
func (h *ProductHandler) UpdateShopSettings(c *gin.Context) {
	userID := c.GetString("userID")
	var req updateShopSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.ShopPausedMessage) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pesan jeda toko maksimal 200 karakter"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	_, err := h.DB.Exec(ctx, `
		UPDATE users SET
			shop_paused_at = CASE WHEN $1 THEN COALESCE(shop_paused_at, now()) ELSE NULL END,
			shop_paused_message = $2
		WHERE id = $3
	`, req.ShopPaused, req.ShopPausedMessage, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pengaturan toko"})
		return
	}

	h.invalidatePageCache(ctx, userID)
	c.JSON(http.StatusOK, shopSettingsResponse(req))
}

// DeleteFile -- Modul Toko (Fase E3): hapus file produk TANPA menghapus
// produknya sendiri (beda dari Delete di atas). Produk otomatis
// dinonaktifkan kalau sedang aktif -- menegakkan invarian yang sama
// seperti Update (produk tanpa file tidak boleh aktif).
func (h *ProductHandler) DeleteFile(c *gin.Context) {
	productID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var fileKey string
	if err := h.DB.QueryRow(ctx, `
		SELECT file_key FROM products WHERE id = $1 AND user_id = $2
	`, productID, userID).Scan(&fileKey); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}
	if fileKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "produk ini belum punya file"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		UPDATE products SET file_key = '', file_size_bytes = NULL, is_active = false WHERE id = $1
	`, productID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus file"})
		return
	}

	if h.Storage != nil {
		_ = h.Storage.Delete(ctx, fileKey)
	}

	h.invalidatePageCache(ctx, userID)

	c.JSON(http.StatusOK, gin.H{"message": "file dihapus, produk dinonaktifkan sampai file baru diunggah"})
}

// UploadFile — REQ-F-302. Validasi ekstensi (daftar putih) dan ukuran
// sebelum diteruskan ke storage; "pemindaian dasar file berbahaya" untuk MVP
// berarti menolak ekstensi yang tidak dikenal, BUKAN antivirus/malware
// scanning sungguhan -- itu di luar cakupan MVP (catat sebagai batasan).
func (h *ProductHandler) UploadFile(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	productID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	var exists int
	if err := h.DB.QueryRow(ctx, `SELECT 1 FROM products WHERE id = $1 AND user_id = $2`, productID, userID).Scan(&exists); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"file\")"})
		return
	}

	if fileHeader.Size > maxProductFileSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran file melebihi 100MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	contentType, ok := allowedProductFileExt[ext]
	if !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	key := fmt.Sprintf("products/%s/%s", productID, sanitizeFileNameForKey(fileHeader.Filename))
	if err := h.Storage.Upload(ctx, key, file, fileHeader.Size, contentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah file"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		UPDATE products SET file_key = $1, file_size_bytes = $2 WHERE id = $3
	`, key, fileHeader.Size, productID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "file terunggah tapi gagal menyimpan referensinya"})
		return
	}

	h.invalidatePageCache(ctx, userID)

	c.JSON(http.StatusOK, gin.H{"message": "file berhasil diunggah, produk siap diaktifkan"})
}

// UploadCover — gambar sampul produk yang ditampilkan di halaman publik &
// dashboard. Terpisah dari UploadFile (file produk yang dijual, PRIVAT --
// hanya bisa diakses lewat presigned URL setelah pembayaran) karena sampul
// justru harus publik PERMANEN. Key selalu "covers/<productID>" (tanpa
// ekstensi) supaya unggah ulang menimpa object yang sama, sama seperti
// pola avatar kreator (lihat PageHandler.UploadAvatar).
func (h *ProductHandler) UploadCover(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	productID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	var exists int
	if err := h.DB.QueryRow(ctx, `SELECT 1 FROM products WHERE id = $1 AND user_id = $2`, productID, userID).Scan(&exists); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}

	fileHeader, err := c.FormFile("cover")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"cover\")"})
		return
	}

	if fileHeader.Size > maxCoverImageSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran gambar melebihi 5MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if _, ok := allowedCoverExt[ext]; !ok {
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

	key := fmt.Sprintf("covers/%s.webp", productID)
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(webpBytes), int64(len(webpBytes)), imageconv.ContentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah sampul"})
		return
	}

	// "?v=<timestamp>" wajib -- key storage selalu sama ("covers/<productID>"),
	// tanpa ini URL sampul byte-identik antar-unggahan & browser/CDN akan
	// terus menampilkan sampul lama walau unggahan baru sudah sukses.
	coverURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	if _, err := h.DB.Exec(ctx, `UPDATE products SET cover_image_url = $1 WHERE id = $2`, coverURL, productID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "sampul terunggah tapi gagal menyimpan referensinya"})
		return
	}

	h.invalidatePageCache(ctx, userID)

	c.JSON(http.StatusOK, gin.H{"cover_image_url": coverURL, "message": "sampul produk berhasil diunggah"})
}

// GetDownloadURL — REQ-F-304: signed URL kedaluwarsa (15 menit), bukan
// tautan permanen. Dipakai kreator untuk mengecek file yang sudah diunggah;
// alur unduhan pembeli sungguhan menyusul di Sprint 3 (checkout).
func (h *ProductHandler) GetDownloadURL(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	productID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var fileKey string
	err := h.DB.QueryRow(ctx, `SELECT file_key FROM products WHERE id = $1 AND user_id = $2`, productID, userID).Scan(&fileKey)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}
	if fileKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "produk belum punya file"})
		return
	}

	url, err := h.Storage.PresignedDownloadURL(ctx, fileKey, 15*time.Minute)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat tautan unduhan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"download_url": url, "expires_in_seconds": 900})
}
