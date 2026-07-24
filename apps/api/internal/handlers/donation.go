package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
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
	DB *pgxpool.Pool
}

func NewDonationHandler(db *pgxpool.Pool) *DonationHandler {
	return &DonationHandler{DB: db}
}

type donationSettingsResponse struct {
	ProductID    *string `json:"product_id"`
	Enabled      bool    `json:"enabled"`
	Title        string  `json:"title"`
	MinAmountIDR *int64  `json:"min_amount_idr"`
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
	err := h.DB.QueryRow(ctx, `
		SELECT id, is_active, name, pwyw_min_price_idr
		FROM products WHERE user_id = $1 AND is_donation = true
	`, userID).Scan(&id, &resp.Enabled, &resp.Title, &resp.MinAmountIDR)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusOK, donationSettingsResponse{})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pengaturan dukungan"})
		return
	}
	resp.ProductID = &id

	c.JSON(http.StatusOK, resp)
}

type upsertDonationRequest struct {
	Enabled      bool   `json:"enabled"`
	Title        string `json:"title" binding:"max=200"`
	MinAmountIDR int64  `json:"min_amount_idr"`
}

// Upsert — mengaktifkan/menonaktifkan & mengatur judul serta nominal minimum
// blok dukungan. Membuat baris products donasi kalau ini pertama kalinya
// kreator mengaktifkan; sesudahnya baris yang sama diperbarui, TIDAK pernah
// membuat baris kedua.
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

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var existingID string
	err := h.DB.QueryRow(ctx, `SELECT id FROM products WHERE user_id = $1 AND is_donation = true`, userID).Scan(&existingID)
	switch {
	case err == pgx.ErrNoRows:
		if !req.Enabled {
			// Belum pernah dibuat & memang mau nonaktif -- tidak ada apa-apa
			// yang perlu dilakukan.
			c.JSON(http.StatusOK, gin.H{"message": "pengaturan dukungan disimpan"})
			return
		}
		id := uuid.NewString()
		if _, err := h.DB.Exec(ctx, `
			INSERT INTO products (id, user_id, name, description, price_idr, is_active, file_key, is_donation, pwyw_enabled, pwyw_min_price_idr)
			VALUES ($1, $2, $3, '', $4, true, '', true, true, $4)
		`, id, userID, req.Title, req.MinAmountIDR); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat blok dukungan"})
			return
		}
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pengaturan dukungan"})
		return
	default:
		if _, err := h.DB.Exec(ctx, `
			UPDATE products SET name = $1, pwyw_min_price_idr = $2, is_active = $3 WHERE id = $4
		`, req.Title, req.MinAmountIDR, req.Enabled, existingID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui blok dukungan"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "pengaturan dukungan disimpan"})
}
