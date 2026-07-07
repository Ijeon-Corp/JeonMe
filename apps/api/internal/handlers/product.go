package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProductHandler adalah kerangka awal untuk REQ-F-301..304.
// Upload file ke object storage (S3-compatible / MinIO / Cloudflare R2) dan
// pembuatan signed URL BELUM diimplementasikan -- tim perlu menambahkan
// SDK object storage pilihan (mis. aws-sdk-go-v2 untuk S3-compatible).
type ProductHandler struct {
	DB *pgxpool.Pool
}

func NewProductHandler(db *pgxpool.Pool) *ProductHandler {
	return &ProductHandler{DB: db}
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

	// TODO: setelah file diunggah terpisah (multipart/presigned upload),
	// perbarui file_key lalu izinkan is_active = true (REQ-F-303).
	c.JSON(http.StatusCreated, gin.H{
		"id":      id,
		"message": "produk dibuat, unggah file sebelum mengaktifkan produk",
	})
}

// List mengembalikan seluruh produk milik kreator yang sedang login.
func (h *ProductHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, name, price_idr, is_active FROM products WHERE user_id = $1
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}
	defer rows.Close()

	type item struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		PriceIDR int64  `json:"price_idr"`
		IsActive bool   `json:"is_active"`
	}
	var items []item
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.ID, &it.Name, &it.PriceIDR, &it.IsActive); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}
