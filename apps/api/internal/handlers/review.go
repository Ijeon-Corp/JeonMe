package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ReviewHandler -- Modul Toko (Fase E1): ulasan pembeli. Submit ulasan
// PUBLIK (pembeli tidak punya akun, sama seperti seluruh alur checkout),
// moderasi (List/SetHidden/Delete) hanya untuk kreator pemilik produk.
type ReviewHandler struct {
	DB *pgxpool.Pool
}

func NewReviewHandler(db *pgxpool.Pool) *ReviewHandler {
	return &ReviewHandler{DB: db}
}

type submitReviewRequest struct {
	Rating  int    `json:"rating" binding:"required,min=1,max=5"`
	Comment string `json:"comment" binding:"omitempty,max=1000"`
}

// Submit -- HANYA order status="paid" yang boleh diulas, dan HANYA sekali
// per order (UNIQUE order_id, migrasi 000049) -- percobaan kedua ditolak
// dengan pesan jelas, bukan diam-diam menimpa ulasan pertama.
func (h *ReviewHandler) Submit(c *gin.Context) {
	orderID := c.Param("id")

	var req submitReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var productID, buyerEmail, status string
	if err := h.DB.QueryRow(ctx, `
		SELECT product_id, buyer_email, status FROM orders WHERE id = $1
	`, orderID).Scan(&productID, &buyerEmail, &status); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "pesanan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pesanan"})
		return
	}
	if status != "paid" {
		c.JSON(http.StatusForbidden, gin.H{"error": "hanya pesanan yang sudah lunas yang bisa diulas"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO product_reviews (product_id, order_id, buyer_email, rating, comment)
		VALUES ($1, $2, $3, $4, $5)
	`, productID, orderID, buyerEmail, req.Rating, req.Comment); err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "pesanan ini sudah pernah diulas"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan ulasan"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "terima kasih atas ulasanmu"})
}

type reviewItem struct {
	ID          string    `json:"id"`
	ProductID   string    `json:"product_id"`
	ProductName string    `json:"product_name"`
	BuyerEmail  string    `json:"buyer_email"`
	Rating      int       `json:"rating"`
	Comment     string    `json:"comment"`
	IsHidden    bool      `json:"is_hidden"`
	CreatedAt   time.Time `json:"created_at"`
}

// List -- SEMUA ulasan lintas produk milik kreator yang login (termasuk
// yang disembunyikan -- kreator sendiri tetap perlu melihatnya untuk bisa
// menampilkan kembali kalau berubah pikiran).
func (h *ReviewHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT r.id, r.product_id, p.name, r.buyer_email, r.rating, r.comment, r.is_hidden, r.created_at
		FROM product_reviews r JOIN products p ON p.id = r.product_id
		WHERE p.user_id = $1
		ORDER BY r.created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat ulasan"})
		return
	}
	defer rows.Close()

	items := []reviewItem{}
	for rows.Next() {
		var it reviewItem
		if err := rows.Scan(&it.ID, &it.ProductID, &it.ProductName, &it.BuyerEmail, &it.Rating, &it.Comment, &it.IsHidden, &it.CreatedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type updateReviewRequest struct {
	IsHidden *bool `json:"is_hidden" binding:"required"`
}

// SetHidden -- sembunyikan/tampilkan ulasan, hanya milik produk kreator sendiri.
func (h *ReviewHandler) SetHidden(c *gin.Context) {
	reviewID := c.Param("id")
	userID := c.GetString("userID")

	var req updateReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		UPDATE product_reviews SET is_hidden = $1
		WHERE id = $2 AND product_id IN (SELECT id FROM products WHERE user_id = $3)
	`, *req.IsHidden, reviewID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui ulasan"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "ulasan tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ulasan diperbarui"})
}

// Delete -- hapus PERMANEN, beda dari SetHidden (yang reversibel).
func (h *ReviewHandler) Delete(c *gin.Context) {
	reviewID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		DELETE FROM product_reviews
		WHERE id = $1 AND product_id IN (SELECT id FROM products WHERE user_id = $2)
	`, reviewID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus ulasan"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "ulasan tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ulasan dihapus"})
}
