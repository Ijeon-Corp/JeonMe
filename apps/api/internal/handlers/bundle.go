package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// minBundleItems -- bundel harus menaungi minimal 2 produk, kalau tidak
// bukan "paket", cuma produk biasa.
const minBundleItems = 2

// BundleHandler mengimplementasikan No.70 (Sprint 7): bundel produk.
// Bundel adalah baris `products` biasa (is_bundle=true) -- toggle
// aktif/nonaktif & hapus memakai ProductHandler.Update/Delete yang sudah
// ada, jadi handler ini cuma perlu Create & List.
type BundleHandler struct {
	DB *pgxpool.Pool
}

func NewBundleHandler(db *pgxpool.Pool) *BundleHandler {
	return &BundleHandler{DB: db}
}

type createBundleRequest struct {
	Name       string   `json:"name" binding:"required,max=200"`
	PriceIDR   int64    `json:"price_idr" binding:"required,min=1000"`
	ProductIDs []string `json:"product_ids" binding:"required,min=2"`
}

// Create — validasi seluruh produk milik kreator yang login, aktif, dan
// bukan bundel lain (tidak boleh bundel-di-dalam-bundel), lalu harga
// bundel harus lebih murah dari jumlah harga aslinya.
func (h *BundleHandler) Create(c *gin.Context) {
	var req createBundleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// Hapus duplikat ID sebelum validasi supaya tidak diam-diam menghitung
	// satu produk dua kali dalam total harga asli.
	seen := map[string]bool{}
	uniqueIDs := make([]string, 0, len(req.ProductIDs))
	for _, id := range req.ProductIDs {
		if !seen[id] {
			seen[id] = true
			uniqueIDs = append(uniqueIDs, id)
		}
	}
	if len(uniqueIDs) < minBundleItems {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bundel harus berisi minimal 2 produk berbeda"})
		return
	}

	var totalPriceIDR int64
	rows, err := h.DB.Query(ctx, `
		SELECT price_idr, is_active, is_bundle FROM products WHERE id = ANY($1) AND user_id = $2
	`, uniqueIDs, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}
	found := 0
	for rows.Next() {
		var priceIDR int64
		var isActive, isBundle bool
		if err := rows.Scan(&priceIDR, &isActive, &isBundle); err != nil {
			rows.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
			return
		}
		if !isActive {
			rows.Close()
			c.JSON(http.StatusBadRequest, gin.H{"error": "semua produk dalam bundel harus sudah aktif"})
			return
		}
		if isBundle {
			rows.Close()
			c.JSON(http.StatusBadRequest, gin.H{"error": "bundel tidak boleh menaungi bundel lain"})
			return
		}
		totalPriceIDR += priceIDR
		found++
	}
	rows.Close()
	if found != len(uniqueIDs) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "salah satu produk tidak ditemukan atau bukan milikmu"})
		return
	}
	if req.PriceIDR >= totalPriceIDR {
		c.JSON(http.StatusBadRequest, gin.H{"error": "harga bundel harus lebih murah dari jumlah harga produk aslinya"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	bundleID := uuid.NewString()
	if _, err := tx.Exec(ctx, `
		INSERT INTO products (id, user_id, name, description, price_idr, is_active, is_bundle)
		VALUES ($1, $2, $3, '', $4, false, true)
	`, bundleID, userID, req.Name, req.PriceIDR); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat bundel"})
		return
	}

	for _, itemID := range uniqueIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO bundle_items (bundle_product_id, item_product_id) VALUES ($1, $2)
		`, bundleID, itemID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan isi bundel"})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan bundel"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":      bundleID,
		"message": "bundel dibuat, aktifkan dari daftar bundel supaya bisa dibeli",
	})
}

type bundleListItem struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	PriceIDR         int64    `json:"price_idr"`
	IsActive         bool     `json:"is_active"`
	OriginalTotalIDR int64    `json:"original_total_idr"`
	ItemNames        []string `json:"item_names"`
}

// List mengembalikan seluruh bundel milik kreator yang sedang login,
// beserta nama-nama produk yang termasuk & jumlah harga asli (utk coret
// harga di dashboard).
func (h *BundleHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT b.id, b.name, b.price_idr, b.is_active,
			COALESCE(SUM(ip.price_idr), 0) AS original_total_idr,
			COALESCE(array_agg(ip.name ORDER BY ip.name) FILTER (WHERE ip.name IS NOT NULL), '{}')
		FROM products b
		LEFT JOIN bundle_items bi ON bi.bundle_product_id = b.id
		LEFT JOIN products ip ON ip.id = bi.item_product_id
		WHERE b.user_id = $1 AND b.is_bundle = true
		GROUP BY b.id
		ORDER BY b.name
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat bundel"})
		return
	}
	defer rows.Close()

	items := []bundleListItem{}
	for rows.Next() {
		var it bundleListItem
		if err := rows.Scan(&it.ID, &it.Name, &it.PriceIDR, &it.IsActive, &it.OriginalTotalIDR, &it.ItemNames); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}
