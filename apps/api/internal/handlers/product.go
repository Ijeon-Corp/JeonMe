package handlers

import (
	"context"
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

	"github.com/jeonme/api/internal/storage"
)

// maxProductFileSize -- 100MB, cukup untuk ebook/template/video pendek tanpa
// membebani VPS shared. Batasi lebih longgar lewat env kalau perlu di masa depan.
const maxProductFileSize = 100 * 1024 * 1024

// allowedProductFileExt -- REQ-F-302 (validasi tipe file). Daftar putih
// (bukan daftar hitam) supaya tipe file berbahaya (.exe, .sh, dst) tertolak
// secara default alih-alih harus disebutkan satu-satu.
var allowedProductFileExt = map[string]bool{
	".pdf": true, ".zip": true, ".epub": true,
	".mp4": true, ".mp3": true, ".mov": true,
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true,
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
	if h.RDB == nil {
		return
	}
	var username string
	if err := h.DB.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err == nil {
		h.RDB.Del(ctx, "page:"+username)
	}
}

type createProductRequest struct {
	Name        string `json:"name" binding:"required,max=200"`
	Description string `json:"description"`
	PriceIDR    int64  `json:"price_idr" binding:"required,min=1000"`
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

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	id := uuid.NewString()
	_, err := h.DB.Exec(ctx, `
		INSERT INTO products (id, user_id, name, description, price_idr, is_active)
		VALUES ($1, $2, $3, $4, $5, false)
	`, id, userID, req.Name, req.Description, req.PriceIDR)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat produk"})
		return
	}

	h.invalidatePageCache(ctx, userID)

	c.JSON(http.StatusCreated, gin.H{
		"id":      id,
		"message": "produk dibuat, unggah file sebelum mengaktifkan produk",
	})
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

	// No.70/71: bundel & blok dukungan TIDAK ikut tampil di sini -- masing-
	// masing punya halaman dashboard sendiri (/dashboard/bundles,
	// /dashboard/donation), sama seperti voucher.
	rows, err := h.DB.Query(ctx, `
		SELECT id, name, description, price_idr, is_active, file_key != '' AS has_file, cover_image_url,
			flash_sale_price_idr, flash_sale_starts_at, flash_sale_ends_at, `+effectivePriceExpr+`,
			pwyw_enabled, pwyw_min_price_idr
		FROM products WHERE user_id = $1 AND is_bundle = false AND is_donation = false
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}
	defer rows.Close()

	type item struct {
		ID                string     `json:"id"`
		Name              string     `json:"name"`
		Description       string     `json:"description"`
		PriceIDR          int64      `json:"price_idr"`
		IsActive          bool       `json:"is_active"`
		HasFile           bool       `json:"has_file"`
		CoverImageURL     string     `json:"cover_image_url"`
		FlashSalePriceIDR *int64     `json:"flash_sale_price_idr"`
		FlashSaleStartsAt *time.Time `json:"flash_sale_starts_at"`
		FlashSaleEndsAt   *time.Time `json:"flash_sale_ends_at"`
		EffectivePriceIDR int64      `json:"effective_price_idr"`
		IsFlashSaleActive bool       `json:"is_flash_sale_active"`
		PwywEnabled       bool       `json:"pwyw_enabled"`
		PwywMinPriceIDR   *int64     `json:"pwyw_min_price_idr"`
	}
	items := []item{}
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.ID, &it.Name, &it.Description, &it.PriceIDR, &it.IsActive, &it.HasFile, &it.CoverImageURL,
			&it.FlashSalePriceIDR, &it.FlashSaleStartsAt, &it.FlashSaleEndsAt, &it.EffectivePriceIDR, &it.IsFlashSaleActive,
			&it.PwywEnabled, &it.PwywMinPriceIDR); err == nil {
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

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var fileKey string
	var currentPriceIDR int64
	var currentFlashSalePriceIDR *int64
	var currentPwywEnabled bool
	var currentPwywMinPriceIDR *int64
	var isBundle, isDonation bool
	err := h.DB.QueryRow(ctx, `
		SELECT file_key, price_idr, flash_sale_price_idr, pwyw_enabled, pwyw_min_price_idr, is_bundle, is_donation
		FROM products WHERE id = $1 AND user_id = $2
	`, productID, userID).Scan(&fileKey, &currentPriceIDR, &currentFlashSalePriceIDR, &currentPwywEnabled, &currentPwywMinPriceIDR, &isBundle, &isDonation)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}

	// No.70/71: bundel & blok dukungan tidak pernah punya file sendiri --
	// keabsahannya dijamin di tempat lain (bundel: minimal 2 produk aktif
	// saat dibuat; donasi: selalu bayar-seikhlasnya, tidak pernah kirim
	// file), jadi lewati pengecekan file_key yang berlaku untuk produk biasa.
	if req.IsActive != nil && *req.IsActive && fileKey == "" && !isBundle && !isDonation {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unggah file produk dulu sebelum mengaktifkan"})
		return
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
			pwyw_min_price_idr = COALESCE($9, pwyw_min_price_idr)
		WHERE id = $10
	`, req.Name, req.Description, req.PriceIDR, req.IsActive, req.FlashSalePriceIDR, flashStarts, flashEnds,
		req.PwywEnabled, req.PwywMinPriceIDR, productID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui produk"})
		return
	}

	h.invalidatePageCache(ctx, userID)

	c.JSON(http.StatusOK, gin.H{"message": "produk diperbarui"})
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
	if !allowedProductFileExt[ext] {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan", ext)})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	key := fmt.Sprintf("products/%s/%s", productID, fileHeader.Filename)
	contentType := fileHeader.Header.Get("Content-Type")
	if err := h.Storage.Upload(ctx, key, file, fileHeader.Size, contentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah file"})
		return
	}

	if _, err := h.DB.Exec(ctx, `UPDATE products SET file_key = $1 WHERE id = $2`, key, productID); err != nil {
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
	contentType, ok := allowedCoverExt[ext]
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

	key := fmt.Sprintf("covers/%s", productID)
	if err := h.Storage.Upload(ctx, key, file, fileHeader.Size, contentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah sampul"})
		return
	}

	coverURL := h.Storage.PublicURL(key)
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
