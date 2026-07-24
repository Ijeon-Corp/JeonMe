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

// AffiliateHandler mengimplementasikan No.72 (Sprint 7): program afiliasi.
// Versi awal sengaja mode PRIVAT saja (kreator undang afiliator yang sudah
// jadi pengguna Jeonme lewat email, komisi custom per produk) -- marketplace
// afiliasi publik lintas kreator dicatat sebagai pekerjaan lanjutan di
// backlog kalau permintaannya tervalidasi.
//
// Satu baris affiliates = satu hubungan kreator<->afiliator (dengan SATU
// referral_code untuk semuanya), sedangkan komisi per produk ada di tabel
// terpisah affiliate_commissions -- satu afiliator bisa punya komisi beda
// untuk tiap produk kreator yang sama.
type AffiliateHandler struct {
	DB           *pgxpool.Pool
	PublicWebURL string
}

func NewAffiliateHandler(db *pgxpool.Pool, publicWebURL string) *AffiliateHandler {
	return &AffiliateHandler{DB: db, PublicWebURL: publicWebURL}
}

type upsertAffiliateRequest struct {
	AffiliateEmail    string  `json:"affiliate_email" binding:"required,email"`
	ProductID         string  `json:"product_id" binding:"required"`
	CommissionPercent float64 `json:"commission_percent" binding:"required,min=0.01,max=100"`
}

// Upsert — mengundang afiliator (kalau belum pernah diundang kreator ini
// sebelumnya) sekaligus mengatur/memperbarui komisi untuk SATU produk.
// Dipanggil ulang dengan product_id berbeda untuk menambah komisi produk
// lain ke afiliator yang sama -- referral_code tetap satu untuk semuanya.
func (h *AffiliateHandler) Upsert(c *gin.Context) {
	var req upsertAffiliateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	creatorUserID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var affiliateUserID string
	if err := h.DB.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`,
		strings.ToLower(strings.TrimSpace(req.AffiliateEmail))).Scan(&affiliateUserID); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "belum ada pengguna Jeonme dengan email tersebut"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencari afiliator"})
		return
	}
	if affiliateUserID == creatorUserID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tidak bisa mengundang diri sendiri sebagai afiliator"})
		return
	}

	var productOwnerID string
	if err := h.DB.QueryRow(ctx, `SELECT user_id FROM products WHERE id = $1`, req.ProductID).Scan(&productOwnerID); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}
	if productOwnerID != creatorUserID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "produk ini bukan milikmu"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var affiliateID string
	err = tx.QueryRow(ctx, `
		SELECT id FROM affiliates WHERE creator_user_id = $1 AND affiliate_user_id = $2
	`, creatorUserID, affiliateUserID).Scan(&affiliateID)
	if err == pgx.ErrNoRows {
		for attempt := 0; attempt < 5; attempt++ {
			code, genErr := generateVoucherCode()
			if genErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode referral"})
				return
			}
			insertErr := tx.QueryRow(ctx, `
				INSERT INTO affiliates (creator_user_id, affiliate_user_id, referral_code)
				VALUES ($1, $2, $3) RETURNING id
			`, creatorUserID, affiliateUserID, code).Scan(&affiliateID)
			if insertErr == nil {
				break
			}
			if isUniqueViolation(insertErr) && attempt < 4 {
				continue
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengundang afiliator"})
			return
		}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat afiliator"})
		return
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO affiliate_commissions (affiliate_id, product_id, commission_percent)
		VALUES ($1, $2, $3)
		ON CONFLICT (affiliate_id, product_id) DO UPDATE SET commission_percent = EXCLUDED.commission_percent
	`, affiliateID, req.ProductID, req.CommissionPercent); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan komisi"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "afiliator & komisi disimpan", "affiliate_id": affiliateID})
}

type affiliateProductCommission struct {
	ProductID         string  `json:"product_id"`
	ProductName       string  `json:"product_name"`
	CommissionPercent float64 `json:"commission_percent"`
}

type myAffiliateItem struct {
	ID              string                       `json:"id"`
	AffiliateEmail  string                       `json:"affiliate_email"`
	ReferralCode    string                       `json:"referral_code"`
	ReferralBaseURL string                       `json:"referral_base_url"`
	Commissions     []affiliateProductCommission `json:"commissions"`
}

// ListMine — daftar afiliator yang SUDAH diundang kreator yang login,
// beserta komisi per produk & tautan referral siap-pakai (kreator tinggal
// menyalin, base URL-nya sudah pakai username kreator sendiri).
func (h *AffiliateHandler) ListMine(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var username string
	if err := h.DB.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat data kreator"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT a.id, u.email, a.referral_code
		FROM affiliates a JOIN users u ON u.id = a.affiliate_user_id
		WHERE a.creator_user_id = $1
		ORDER BY a.created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat afiliator"})
		return
	}
	defer rows.Close()

	items := []myAffiliateItem{}
	for rows.Next() {
		var it myAffiliateItem
		if err := rows.Scan(&it.ID, &it.AffiliateEmail, &it.ReferralCode); err == nil {
			it.ReferralBaseURL = h.PublicWebURL + "/" + username
			items = append(items, it)
		}
	}

	for i := range items {
		items[i].Commissions = h.loadCommissions(ctx, items[i].ID)
	}

	c.JSON(http.StatusOK, items)
}

func (h *AffiliateHandler) loadCommissions(ctx context.Context, affiliateID string) []affiliateProductCommission {
	rows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, ac.commission_percent
		FROM affiliate_commissions ac JOIN products p ON p.id = ac.product_id
		WHERE ac.affiliate_id = $1
		ORDER BY p.name
	`, affiliateID)
	if err != nil {
		return []affiliateProductCommission{}
	}
	defer rows.Close()

	out := []affiliateProductCommission{}
	for rows.Next() {
		var it affiliateProductCommission
		if err := rows.Scan(&it.ProductID, &it.ProductName, &it.CommissionPercent); err == nil {
			out = append(out, it)
		}
	}
	return out
}

type affiliateProgramItem struct {
	ID              string                       `json:"id"`
	CreatorUsername string                       `json:"creator_username"`
	ReferralCode    string                       `json:"referral_code"`
	ReferralURL     string                       `json:"referral_url"`
	Commissions     []affiliateProductCommission `json:"commissions"`
}

// ListPrograms — daftar program afiliasi yang DIIKUTI pengguna yang login
// (dia diundang kreator lain sebagai afiliator), lengkap dengan tautan
// referral siap-pakai per kreator.
func (h *AffiliateHandler) ListPrograms(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT a.id, u.username, a.referral_code
		FROM affiliates a JOIN users u ON u.id = a.creator_user_id
		WHERE a.affiliate_user_id = $1
		ORDER BY a.created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat program afiliasi"})
		return
	}
	defer rows.Close()

	items := []affiliateProgramItem{}
	for rows.Next() {
		var it affiliateProgramItem
		if err := rows.Scan(&it.ID, &it.CreatorUsername, &it.ReferralCode); err == nil {
			it.ReferralURL = h.PublicWebURL + "/" + it.CreatorUsername + "?ref=" + it.ReferralCode
			items = append(items, it)
		}
	}

	for i := range items {
		items[i].Commissions = h.loadCommissions(ctx, items[i].ID)
	}

	c.JSON(http.StatusOK, items)
}

// Revoke — mencabut seluruh hubungan afiliasi (semua komisi produk ikut
// terhapus lewat ON DELETE CASCADE). Hanya kreator yang mengundang yang
// boleh mencabut.
func (h *AffiliateHandler) Revoke(c *gin.Context) {
	affiliateID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM affiliates WHERE id = $1 AND creator_user_id = $2`, affiliateID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencabut afiliator"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "afiliator tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "afiliator dicabut"})
}

// RemoveCommission — menghapus komisi SATU produk dari afiliator tanpa
// mencabut seluruh hubungan (referral_code tetap berlaku untuk produk lain
// yang masih ada komisinya).
func (h *AffiliateHandler) RemoveCommission(c *gin.Context) {
	affiliateID := c.Param("id")
	productID := c.Param("productId")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var ownerID string
	if err := h.DB.QueryRow(ctx, `SELECT creator_user_id FROM affiliates WHERE id = $1`, affiliateID).Scan(&ownerID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "afiliator tidak ditemukan"})
		return
	}
	if ownerID != userID {
		c.JSON(http.StatusNotFound, gin.H{"error": "afiliator tidak ditemukan"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		DELETE FROM affiliate_commissions WHERE affiliate_id = $1 AND product_id = $2
	`, affiliateID, productID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus komisi"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "komisi dihapus"})
}

// resolveAffiliate -- No.72: dipanggil checkout.Create untuk kode referral
// opsional. Kode yang salah/tidak cocok dengan produk (bukan bagian dari
// program afiliasi produk ini) SENGAJA diabaikan diam-diam (checkout tetap
// jalan tanpa komisi), bukan menolak pembelian -- ref link basi/salah tidak
// boleh memblokir pembeli.
func resolveAffiliate(ctx context.Context, db *pgxpool.Pool, referralCode, productID string) (affiliateID, affiliateUserID string, commissionPercent float64, ok bool) {
	if referralCode == "" {
		return "", "", 0, false
	}
	err := db.QueryRow(ctx, `
		SELECT a.id, a.affiliate_user_id, ac.commission_percent
		FROM affiliates a
		JOIN affiliate_commissions ac ON ac.affiliate_id = a.id
		JOIN products p ON p.id = ac.product_id
		WHERE a.referral_code = $1 AND ac.product_id = $2 AND p.user_id = a.creator_user_id
	`, referralCode, productID).Scan(&affiliateID, &affiliateUserID, &commissionPercent)
	if err != nil {
		return "", "", 0, false
	}
	return affiliateID, affiliateUserID, commissionPercent, true
}
