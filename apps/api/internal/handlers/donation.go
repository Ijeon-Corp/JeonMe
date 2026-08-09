package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// DonationHandler mengimplementasikan No.71 (Sprint 7): blok dukungan/donasi
// (tip jar). Versi awal sengaja hanya nominal sekali bayar (bukan langganan
// berulang mingguan/bulanan -- itu butuh integrasi recurring charge Midtrans
// terpisah, dicatat sebagai pekerjaan lanjutan di backlog kalau tervalidasi).
//
// Donasi dimodelkan sebagai SATU baris products per kreator (is_donation=true,
// pwyw_enabled=true) -- pola yang sama seperti bundel (No.70): checkout/webhook/
// ledger yang sudah ada terpakai tanpa perubahan sama sekali lewat mekanisme
// bayar-seikhlasnya (No.69) yang sudah ada. Beda dengan bundel, baris ini TIDAK
// tampil di grid Produk halaman publik -- ia dapat blok tersendiri (lihat
// PageHandler.GetPublicPage).
type DonationHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
}

func NewDonationHandler(db *pgxpool.Pool, rdb *redis.Client) *DonationHandler {
	return &DonationHandler{DB: db, RDB: rdb}
}

type donationSettingsResponse struct {
	ProductID     *string `json:"product_id"`
	Enabled       bool    `json:"enabled"`
	Title         string  `json:"title"`
	MinAmountIDR  *int64  `json:"min_amount_idr"`
	GoalTitle     string  `json:"goal_title"`
	GoalAmountIDR int64   `json:"goal_amount_idr"`
	GoalRaisedIDR int64   `json:"goal_raised_idr"`
}

// Get — dipakai halaman pengaturan dashboard untuk memuat konfigurasi
// dukungan milik kreator yang login (kalau belum pernah dibuat, kembalikan
// state kosong/nonaktif, BUKAN 404 -- belum ada konfigurasi bukan error).
func (h *DonationHandler) Get(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp donationSettingsResponse
	var id string
	var goalStartedAt *time.Time
	err := h.DB.QueryRow(ctx, `
		SELECT id, is_active, name, pwyw_min_price_idr, donation_goal_title, donation_goal_amount_idr, donation_goal_started_at
		FROM products WHERE user_id = $1 AND is_donation = true
	`, userID).Scan(&id, &resp.Enabled, &resp.Title, &resp.MinAmountIDR, &resp.GoalTitle, &resp.GoalAmountIDR, &goalStartedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusOK, donationSettingsResponse{})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pengaturan dukungan"})
		return
	}
	resp.ProductID = &id

	// GoalRaisedIDR -- SUM order paid SEJAK goal ini dipasang (donation_goal_
	// started_at), BUKAN sepanjang masa -- lihat catatan panjang di migrasi
	// 000060 soal kenapa reset goal harus mulai dari nol lagi.
	if resp.GoalAmountIDR > 0 && goalStartedAt != nil {
		_ = h.DB.QueryRow(ctx, `
			SELECT COALESCE(SUM(amount_idr), 0) FROM orders WHERE product_id = $1 AND status = 'paid' AND created_at >= $2
		`, id, *goalStartedAt).Scan(&resp.GoalRaisedIDR)
	}

	c.JSON(http.StatusOK, resp)
}

type upsertDonationRequest struct {
	Enabled       bool   `json:"enabled"`
	Title         string `json:"title" binding:"max=200"`
	MinAmountIDR  int64  `json:"min_amount_idr"`
	GoalTitle     string `json:"goal_title" binding:"max=200"`
	GoalAmountIDR int64  `json:"goal_amount_idr"`
}

// Upsert — mengaktifkan/menonaktifkan & mengatur judul serta nominal minimum
// blok dukungan, plus target donasi opsional (Gap #4 benchmark kompetitif,
// 9 Agustus 2026 -- ala goal Saweria/Trakteer). Membuat baris products
// donasi kalau ini pertama kalinya kreator mengaktifkan; sesudahnya baris
// yang sama diperbarui, TIDAK pernah membuat baris kedua.
func (h *DonationHandler) Upsert(c *gin.Context) {
	var req upsertDonationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Enabled && req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "judul blok dukungan wajib diisi"})
		return
	}
	if req.Enabled && req.MinAmountIDR < 1000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nominal minimum dukungan minimal Rp1.000"})
		return
	}
	if req.GoalAmountIDR < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target donasi tidak boleh negatif"})
		return
	}
	if req.GoalAmountIDR > 0 && req.GoalTitle == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "judul target wajib diisi kalau mengatur target donasi"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var existingID string
	var currentGoalAmount int64
	err := h.DB.QueryRow(ctx, `
		SELECT id, donation_goal_amount_idr FROM products WHERE user_id = $1 AND is_donation = true
	`, userID).Scan(&existingID, &currentGoalAmount)
	switch {
	case err == pgx.ErrNoRows:
		if !req.Enabled {
			// Belum pernah dibuat & memang mau nonaktif -- tidak ada apa-apa
			// yang perlu dilakukan.
			c.JSON(http.StatusOK, gin.H{"message": "pengaturan dukungan disimpan"})
			return
		}
		id := uuid.NewString()
		var startedAt *time.Time
		if req.GoalAmountIDR > 0 {
			now := time.Now()
			startedAt = &now
		}
		if _, err := h.DB.Exec(ctx, `
			INSERT INTO products (id, user_id, name, description, price_idr, is_active, file_key, is_donation, pwyw_enabled, pwyw_min_price_idr,
				donation_goal_title, donation_goal_amount_idr, donation_goal_started_at)
			VALUES ($1, $2, $3, '', $4, true, '', true, true, $4, $5, $6, $7)
		`, id, userID, req.Title, req.MinAmountIDR, req.GoalTitle, req.GoalAmountIDR, startedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat blok dukungan"})
			return
		}
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pengaturan dukungan"})
		return
	default:
		if req.GoalAmountIDR != currentGoalAmount {
			// Target baru dipasang, diubah, atau dihapus (goal_amount_idr=0)
			// -- started_at direset supaya progress TIDAK membawa donasi
			// dari target lama (lihat catatan migrasi 000060).
			var startedAt *time.Time
			if req.GoalAmountIDR > 0 {
				now := time.Now()
				startedAt = &now
			}
			_, err = h.DB.Exec(ctx, `
				UPDATE products SET name = $1, pwyw_min_price_idr = $2, is_active = $3,
					donation_goal_title = $4, donation_goal_amount_idr = $5, donation_goal_started_at = $6
				WHERE id = $7
			`, req.Title, req.MinAmountIDR, req.Enabled, req.GoalTitle, req.GoalAmountIDR, startedAt, existingID)
		} else {
			_, err = h.DB.Exec(ctx, `
				UPDATE products SET name = $1, pwyw_min_price_idr = $2, is_active = $3, donation_goal_title = $4
				WHERE id = $5
			`, req.Title, req.MinAmountIDR, req.Enabled, req.GoalTitle, existingID)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui blok dukungan"})
			return
		}
	}

	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusOK, gin.H{"message": "pengaturan dukungan disimpan"})
}

type wishlistItem struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	PriceIDR  int64  `json:"price_idr"`
	Link      string `json:"link"`
	RaisedIDR int64  `json:"raised_idr"`
	CreatedAt string `json:"created_at"`
}

// ListWishlistItems — daftar wishlist kreator ini untuk dashboard, urut
// terbaru dulu.
func (h *DonationHandler) ListWishlistItems(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, name, price_idr, link, raised_idr, created_at FROM donation_wishlist_items
		WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat wishlist"})
		return
	}
	defer rows.Close()

	items := []wishlistItem{}
	for rows.Next() {
		var it wishlistItem
		var createdAt time.Time
		if err := rows.Scan(&it.ID, &it.Name, &it.PriceIDR, &it.Link, &it.RaisedIDR, &createdAt); err != nil {
			continue
		}
		it.CreatedAt = createdAt.Format(time.RFC3339)
		items = append(items, it)
	}

	c.JSON(http.StatusOK, items)
}

type createWishlistItemRequest struct {
	Name     string `json:"name" binding:"required,max=200"`
	PriceIDR int64  `json:"price_idr" binding:"required,min=1000"`
	Link     string `json:"link" binding:"max=500"`
}

// CreateWishlistItem — Gap #4 benchmark kompetitif: tambah barang yang bisa
// "diwujudkan" pendukung. Tidak digerbang jumlah blok Donasi aktif/tidak --
// kreator boleh siapkan wishlist duluan sebelum mengaktifkan blok, sama
// seperti pola pages/products lain di Jeonme.
func (h *DonationHandler) CreateWishlistItem(c *gin.Context) {
	var req createWishlistItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var id string
	if err := h.DB.QueryRow(ctx, `
		INSERT INTO donation_wishlist_items (user_id, name, price_idr, link) VALUES ($1, $2, $3, $4) RETURNING id
	`, userID, req.Name, req.PriceIDR, req.Link).Scan(&id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menambah wishlist"})
		return
	}

	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "wishlist ditambahkan"})
}

// DeleteWishlistItem — kepemilikan dicek lewat klausa WHERE user_id (pola
// yang sama dipakai penghapusan link/produk lain), bukan query terpisah
// dulu -- kalau baris bukan milik userID ini, DELETE cuma tidak mengenai
// apa pun (RowsAffected=0), tidak perlu pengecekan tambahan.
func (h *DonationHandler) DeleteWishlistItem(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `DELETE FROM donation_wishlist_items WHERE id = $1 AND user_id = $2`, id, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus wishlist"})
		return
	}

	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusOK, gin.H{"message": "wishlist dihapus"})
}

// creditDonationWishlistItem — dipanggil dari CheckoutHandler.Webhook di
// DALAM transaksi yang sama dengan kredit ledger (pola sama persis dengan
// awardLoyaltyPoints), bukan dihitung ulang dari SUM(orders) tiap request
// publik. wishlistItemID nil berarti donasi UMUM (tidak menargetkan item
// tertentu) -- no-op, bukan error.
func creditDonationWishlistItem(ctx context.Context, tx pgx.Tx, wishlistItemID *string, amountIDR int64) error {
	if wishlistItemID == nil || *wishlistItemID == "" {
		return nil
	}
	_, err := tx.Exec(ctx, `UPDATE donation_wishlist_items SET raised_idr = raised_idr + $1 WHERE id = $2`, amountIDR, *wishlistItemID)
	return err
}
