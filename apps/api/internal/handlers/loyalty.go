package handlers

import (
	"context"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LoyaltyHandler mengimplementasikan No.94 (Sprint 13): program poin
// loyalitas + katalog reward yang bisa ditukar. Poin dihitung PER KREATOR
// (bukan lintas platform) -- pembeli yang sama bisa punya saldo poin
// berbeda di tiap kreator yang dia dukung, sesuai pengaturan masing-
// masing kreator. Penukaran reward menghasilkan VOUCHER sungguhan lewat
// tabel vouchers yang SUDAH ADA (No.67) -- reward tidak menambah mesin
// diskon baru sama sekali, cukup membuat satu baris voucher max_uses=1
// begitu ditukar, dipakai lewat alur checkout+voucher yang sudah teruji.
type LoyaltyHandler struct {
	DB *pgxpool.Pool
}

func NewLoyaltyHandler(db *pgxpool.Pool) *LoyaltyHandler {
	return &LoyaltyHandler{DB: db}
}

// awardLoyaltyPoints — dipanggil dari CheckoutHandler.Webhook SETELAH
// ledger kreator dikredit (No.94). Diam-diam tidak melakukan apa pun kalau
// kreator belum mengaktifkan program loyalitas ATAU order di bawah syarat
// minimum pembelian -- ini FITUR OPSIONAL, bukan bagian wajib checkout.
func awardLoyaltyPoints(ctx context.Context, tx pgx.Tx, creatorUserID, buyerEmail, orderID string, amountIDR int64) error {
	var isActive bool
	var pointType string
	var pointsRate float64
	var pointsLimit *int
	var minPurchaseIDR int64
	err := tx.QueryRow(ctx, `
		SELECT is_active, point_type, points_rate, points_limit, min_purchase_idr
		FROM loyalty_settings WHERE user_id = $1
	`, creatorUserID).Scan(&isActive, &pointType, &pointsRate, &pointsLimit, &minPurchaseIDR)
	if err == pgx.ErrNoRows || !isActive || amountIDR < minPurchaseIDR {
		return nil
	}
	if err != nil {
		return err
	}

	var points int
	if pointType == "percentage" {
		// points_rate = poin per Rp100.000 dibelanjakan.
		points = int(math.Floor(float64(amountIDR) / 100000 * pointsRate))
	} else {
		// nominal: points_rate = poin per Rp10.000 dibelanjakan.
		points = int(math.Floor(float64(amountIDR) / 10000 * pointsRate))
	}
	if pointsLimit != nil && points > *pointsLimit {
		points = *pointsLimit
	}
	if points <= 0 {
		return nil
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO loyalty_points_ledger (id, creator_user_id, buyer_email, points, reason, order_id)
		VALUES ($1, $2, $3, $4, 'earned', $5)
	`, uuid.NewString(), creatorUserID, strings.ToLower(buyerEmail), points, orderID)
	return err
}

type upsertLoyaltySettingsRequest struct {
	IsActive       bool    `json:"is_active"`
	PointType      string  `json:"point_type" binding:"omitempty,oneof=percentage nominal"`
	PointsRate     float64 `json:"points_rate" binding:"omitempty,min=0"`
	PointsLimit    *int    `json:"points_limit" binding:"omitempty,min=1"`
	ClearLimit     bool    `json:"clear_limit"`
	MinPurchaseIDR int64   `json:"min_purchase_idr" binding:"omitempty,min=0"`
}

type loyaltySettingsResponse struct {
	IsActive       bool    `json:"is_active"`
	PointType      string  `json:"point_type"`
	PointsRate     float64 `json:"points_rate"`
	PointsLimit    *int    `json:"points_limit"`
	MinPurchaseIDR int64   `json:"min_purchase_idr"`
}

func (h *LoyaltyHandler) GetSettings(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp loyaltySettingsResponse
	err := h.DB.QueryRow(ctx, `
		SELECT is_active, point_type, points_rate, points_limit, min_purchase_idr
		FROM loyalty_settings WHERE user_id = $1
	`, userID).Scan(&resp.IsActive, &resp.PointType, &resp.PointsRate, &resp.PointsLimit, &resp.MinPurchaseIDR)
	if err == pgx.ErrNoRows {
		resp = loyaltySettingsResponse{PointType: "nominal", PointsRate: 1}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pengaturan loyalitas"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *LoyaltyHandler) UpsertSettings(c *gin.Context) {
	var req upsertLoyaltySettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.PointType == "" {
		req.PointType = "nominal"
	}
	if req.PointsRate == 0 {
		req.PointsRate = 1
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	pointsLimit := req.PointsLimit
	if req.ClearLimit {
		pointsLimit = nil
	}

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO loyalty_settings (user_id, is_active, point_type, points_rate, points_limit, min_purchase_idr)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id) DO UPDATE SET
			is_active = $2, point_type = $3, points_rate = $4, points_limit = $5, min_purchase_idr = $6
	`, userID, req.IsActive, req.PointType, req.PointsRate, pointsLimit, req.MinPurchaseIDR); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pengaturan loyalitas"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "pengaturan loyalitas disimpan"})
}

type createRewardRequest struct {
	Name          string  `json:"name" binding:"required,max=200"`
	PointsNeeded  int     `json:"points_needed" binding:"required,min=1"`
	DiscountType  string  `json:"discount_type" binding:"required,oneof=percentage nominal"`
	DiscountValue int64   `json:"discount_value" binding:"required,min=1"`
	ValidUntil    *string `json:"valid_until"`
}

func (h *LoyaltyHandler) CreateReward(c *gin.Context) {
	var req createRewardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var validUntil *time.Time
	if req.ValidUntil != nil && *req.ValidUntil != "" {
		t, err := time.Parse(time.RFC3339, *req.ValidUntil)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format valid_until tidak valid (pakai RFC3339)"})
			return
		}
		validUntil = &t
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rewardID := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO loyalty_rewards (id, creator_user_id, name, points_needed, discount_type, discount_value, valid_until, is_published)
		VALUES ($1, $2, $3, $4, $5, $6, $7, false)
	`, rewardID, userID, req.Name, req.PointsNeeded, req.DiscountType, req.DiscountValue, validUntil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat reward"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": rewardID, "message": "reward dibuat, publikasikan supaya bisa ditukar pembeli"})
}

type rewardItem struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	PointsNeeded  int        `json:"points_needed"`
	DiscountType  string     `json:"discount_type"`
	DiscountValue int64      `json:"discount_value"`
	ValidUntil    *time.Time `json:"valid_until"`
	IsPublished   bool       `json:"is_published"`
	RedeemedCount int        `json:"redeemed_count"`
}

func (h *LoyaltyHandler) ListRewards(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, name, points_needed, discount_type, discount_value, valid_until, is_published, redeemed_count
		FROM loyalty_rewards WHERE creator_user_id = $1 ORDER BY points_needed ASC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat reward"})
		return
	}
	defer rows.Close()

	items := []rewardItem{}
	for rows.Next() {
		var it rewardItem
		if err := rows.Scan(&it.ID, &it.Name, &it.PointsNeeded, &it.DiscountType, &it.DiscountValue, &it.ValidUntil, &it.IsPublished, &it.RedeemedCount); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type updateRewardRequest struct {
	IsPublished *bool `json:"is_published"`
}

func (h *LoyaltyHandler) UpdateReward(c *gin.Context) {
	rewardID := c.Param("id")
	userID := c.GetString("userID")

	var req updateRewardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		UPDATE loyalty_rewards SET is_published = COALESCE($1, is_published)
		WHERE id = $2 AND creator_user_id = $3
	`, req.IsPublished, rewardID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui reward"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "reward tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "reward diperbarui"})
}

func (h *LoyaltyHandler) DeleteReward(c *gin.Context) {
	rewardID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM loyalty_rewards WHERE id = $1 AND creator_user_id = $2`, rewardID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus reward"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "reward tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "reward dihapus"})
}

// GetMyPoints — REQ publik: pembeli mengecek saldo poinnya SENDIRI di
// kreator TERTENTU (poin per-kreator, bukan lintas platform), dan daftar
// reward yang sudah dipublikasikan supaya bisa memutuskan mau menukar yang mana.
func (h *LoyaltyHandler) GetMyPoints(c *gin.Context) {
	username := c.Param("username")
	buyerEmail := strings.ToLower(strings.TrimSpace(c.Query("email")))
	if buyerEmail == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "parameter email wajib diisi"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var creatorUserID string
	if err := h.DB.QueryRow(ctx, `SELECT id FROM users WHERE username = $1`, username).Scan(&creatorUserID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "kreator tidak ditemukan"})
		return
	}

	var totalPoints int
	if err := h.DB.QueryRow(ctx, `
		SELECT COALESCE(SUM(points), 0) FROM loyalty_points_ledger WHERE creator_user_id = $1 AND buyer_email = $2
	`, creatorUserID, buyerEmail).Scan(&totalPoints); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung poin"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT id, name, points_needed, discount_type, discount_value, valid_until
		FROM loyalty_rewards
		WHERE creator_user_id = $1 AND is_published = true AND (valid_until IS NULL OR valid_until >= now())
		ORDER BY points_needed ASC
	`, creatorUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat reward"})
		return
	}
	defer rows.Close()

	type publicReward struct {
		ID            string     `json:"id"`
		Name          string     `json:"name"`
		PointsNeeded  int        `json:"points_needed"`
		DiscountType  string     `json:"discount_type"`
		DiscountValue int64      `json:"discount_value"`
		ValidUntil    *time.Time `json:"valid_until"`
	}
	rewards := []publicReward{}
	for rows.Next() {
		var r publicReward
		if err := rows.Scan(&r.ID, &r.Name, &r.PointsNeeded, &r.DiscountType, &r.DiscountValue, &r.ValidUntil); err == nil {
			rewards = append(rewards, r)
		}
	}

	c.JSON(http.StatusOK, gin.H{"total_points": totalPoints, "rewards": rewards})
}

type redeemRewardRequest struct {
	BuyerEmail string `json:"buyer_email" binding:"required,email"`
}

// RedeemReward — REQ publik: pembeli menukar poin dengan reward. Saldo
// poin & penukaran dikunci dalam SATU transaksi (advisory lock per
// kreator+pembeli) supaya tidak bisa menukar reward yang sama dua kali
// dengan poin yang sebenarnya sudah habis lewat request paralel. Voucher
// yang dihasilkan SELALU max_uses=1 dan otomatis kedaluwarsa mengikuti
// valid_until reward (kalau ada).
func (h *LoyaltyHandler) RedeemReward(c *gin.Context) {
	rewardID := c.Param("id")

	var req redeemRewardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	buyerEmail := strings.ToLower(strings.TrimSpace(req.BuyerEmail))

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var creatorUserID, name, discountType string
	var pointsNeeded int
	var discountValue int64
	var validUntil *time.Time
	var isPublished bool
	if err := h.DB.QueryRow(ctx, `
		SELECT creator_user_id, name, points_needed, discount_type, discount_value, valid_until, is_published
		FROM loyalty_rewards WHERE id = $1
	`, rewardID).Scan(&creatorUserID, &name, &pointsNeeded, &discountType, &discountValue, &validUntil, &isPublished); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "reward tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat reward"})
		return
	}
	if !isPublished {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reward ini belum dipublikasikan"})
		return
	}
	if validUntil != nil && validUntil.Before(time.Now()) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reward ini sudah kedaluwarsa"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Kunci per kreator+pembeli (hash gabungan) supaya dua permintaan
	// tukar-reward paralel dari pembeli yang sama tidak bisa lolos
	// bersamaan memakai saldo poin yang sama.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, creatorUserID+":"+buyerEmail); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunci saldo poin"})
		return
	}

	var totalPoints int
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(points), 0) FROM loyalty_points_ledger WHERE creator_user_id = $1 AND buyer_email = $2
	`, creatorUserID, buyerEmail).Scan(&totalPoints); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung poin"})
		return
	}
	if totalPoints < pointsNeeded {
		c.JSON(http.StatusBadRequest, gin.H{"error": "poin kamu belum cukup untuk reward ini"})
		return
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO loyalty_points_ledger (id, creator_user_id, buyer_email, points, reason, reward_id)
		VALUES ($1, $2, $3, $4, 'redeemed', $5)
	`, uuid.NewString(), creatorUserID, buyerEmail, -pointsNeeded, rewardID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat penukaran"})
		return
	}

	if _, err := tx.Exec(ctx, `UPDATE loyalty_rewards SET redeemed_count = redeemed_count + 1 WHERE id = $1`, rewardID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui reward"})
		return
	}

	voucherID := uuid.NewString()
	voucherCode := "REWARD-" + strings.ToUpper(uuid.NewString()[:8])
	if _, err := tx.Exec(ctx, `
		INSERT INTO vouchers (id, user_id, code, batch_label, discount_type, discount_value, max_uses, is_active, expires_at)
		VALUES ($1, $2, $3, 'loyalty-reward', $4, $5, 1, true, $6)
	`, voucherID, creatorUserID, voucherCode, discountType, discountValue, validUntil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat voucher reward"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan penukaran"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "reward berhasil ditukar",
		"voucher_code": voucherCode,
		"reward_name":  name,
	})
}
