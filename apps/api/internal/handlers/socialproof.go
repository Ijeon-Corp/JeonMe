package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SocialProofHandler mengimplementasikan No.76 (Sprint 8): notifikasi
// "X baru saja membeli produk ini" di halaman publik & checkout. Diadaptasi
// dari Social Proof Notifications Lynk.id (PRO) -- versi Jeonme sengaja
// disederhanakan dari temuan riset kompetitor:
//   - Cakupan per-produk yang bisa dipilih satu-satu DISEDERHANAKAN jadi
//     SATU toggle global per kreator (estimasi 1 hari, prioritas Could --
//     UI pemilihan produk granular adalah pekerjaan terpisah kalau
//     tervalidasi).
//   - Pilihan bahasa TIDAK dikerjakan -- teks notifikasi tetap Bahasa
//     Indonesia mengikuti seluruh aplikasi.
//
// Yang tetap dipertahankan dari riset: durasi tampil & interval yang bisa
// diatur, toggle terpisah halaman produk vs checkout, dan email pembeli
// SELALU disamarkan sebagian (never ditampilkan penuh).
type SocialProofHandler struct {
	DB *pgxpool.Pool
}

func NewSocialProofHandler(db *pgxpool.Pool) *SocialProofHandler {
	return &SocialProofHandler{DB: db}
}

type socialProofSettingsResponse struct {
	IsActive          bool `json:"is_active"`
	ShowOnProductPage bool `json:"show_on_product_page"`
	ShowOnCheckout    bool `json:"show_on_checkout"`
	DisplaySeconds    int  `json:"display_seconds"`
	IntervalSeconds   int  `json:"interval_seconds"`
}

// Get — belum-pernah-disimpan mengembalikan default nonaktif (bukan 404),
// sama seperti pola pengaturan blok tunggal lain (donasi, lead capture).
func (h *SocialProofHandler) Get(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	resp := socialProofSettingsResponse{ShowOnProductPage: true, ShowOnCheckout: true, DisplaySeconds: 5, IntervalSeconds: 15}
	err := h.DB.QueryRow(ctx, `
		SELECT is_active, show_on_product_page, show_on_checkout, display_seconds, interval_seconds
		FROM social_proof_settings WHERE user_id = $1
	`, userID).Scan(&resp.IsActive, &resp.ShowOnProductPage, &resp.ShowOnCheckout, &resp.DisplaySeconds, &resp.IntervalSeconds)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pengaturan notifikasi"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

type upsertSocialProofRequest struct {
	IsActive          bool `json:"is_active"`
	ShowOnProductPage bool `json:"show_on_product_page"`
	ShowOnCheckout    bool `json:"show_on_checkout"`
	DisplaySeconds    int  `json:"display_seconds" binding:"oneof=5 10 15"`
	IntervalSeconds   int  `json:"interval_seconds" binding:"oneof=10 15 30 45 60"`
}

func (h *SocialProofHandler) Upsert(c *gin.Context) {
	var req upsertSocialProofRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO social_proof_settings (user_id, is_active, show_on_product_page, show_on_checkout, display_seconds, interval_seconds)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id) DO UPDATE SET
			is_active = EXCLUDED.is_active, show_on_product_page = EXCLUDED.show_on_product_page,
			show_on_checkout = EXCLUDED.show_on_checkout, display_seconds = EXCLUDED.display_seconds,
			interval_seconds = EXCLUDED.interval_seconds
	`, userID, req.IsActive, req.ShowOnProductPage, req.ShowOnCheckout, req.DisplaySeconds, req.IntervalSeconds); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pengaturan notifikasi"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "pengaturan notifikasi disimpan"})
}

// recentPurchase -- dipakai bersama oleh page.go (lintas produk, halaman
// publik) & checkout.go (satu produk, halaman checkout).
type recentPurchase struct {
	ProductName string `json:"product_name"`
	MaskedEmail string `json:"masked_email"`
	PurchasedAt string `json:"purchased_at"`
}

// maskEmail — email pembeli TIDAK PERNAH ditampilkan penuh di notifikasi
// publik (mis. "rumi****am@gmail.com"), sesuai temuan verifikasi langsung
// layar konfigurasi Lynk.id. Bagian lokal pendek (<=4 karakter) tetap
// disamarkan sebagian, bukan ditampilkan penuh.
func maskEmail(email string) string {
	at := strings.Index(email, "@")
	if at < 1 {
		return email
	}
	local := email[:at]
	domain := email[at:]
	if len(local) <= 4 {
		return local[:1] + "****" + domain
	}
	keepEnd := 2
	if len(local)-4-keepEnd < 0 {
		keepEnd = 1
	}
	return local[:4] + "****" + local[len(local)-keepEnd:] + domain
}

// fetchRecentPurchases — query generik (dipakai untuk lintas-produk maupun
// satu produk, bedanya cuma di query yang dioper).
func fetchRecentPurchases(ctx context.Context, db *pgxpool.Pool, query string, args ...any) []recentPurchase {
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()

	out := []recentPurchase{}
	for rows.Next() {
		var productName, buyerEmail string
		var purchasedAt time.Time
		if err := rows.Scan(&productName, &buyerEmail, &purchasedAt); err != nil {
			continue
		}
		out = append(out, recentPurchase{
			ProductName: productName,
			MaskedEmail: maskEmail(buyerEmail),
			PurchasedAt: purchasedAt.Format(time.RFC3339),
		})
	}
	return out
}
