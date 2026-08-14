package handlers

import (
	"context"
	"crypto/rand"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// voucherCodeCharset -- tanpa 0/O/1/I/L supaya kode yang digenerate tidak
// gampang salah baca/ketik saat dibagikan manual (mis. lewat WhatsApp/IG).
const voucherCodeCharset = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// maxVoucherBatchQuantity -- batas generate massal sekali jalan, cegah
// penyalahgunaan (mis. men-generate jutaan baris tanpa sengaja/sengaja).
const maxVoucherBatchQuantity = 200

// VoucherHandler mengimplementasikan No.67 (Sprint 7): kode voucher/diskon
// per produk, diadaptasi dari fitur Voucher Lynk.id.
type VoucherHandler struct {
	DB *pgxpool.Pool
}

func NewVoucherHandler(db *pgxpool.Pool) *VoucherHandler {
	return &VoucherHandler{DB: db}
}

func generateVoucherCode() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	code := make([]byte, 8)
	for i, v := range b {
		code[i] = voucherCodeCharset[int(v)%len(voucherCodeCharset)]
	}
	return string(code), nil
}

type createVoucherRequest struct {
	Code           string   `json:"code"`
	BatchLabel     string   `json:"batch_label"`
	Quantity       int      `json:"quantity"`
	DiscountType   string   `json:"discount_type" binding:"required,oneof=percentage fixed"`
	DiscountValue  int64    `json:"discount_value" binding:"required,min=1"`
	MaxDiscountIDR *int64   `json:"max_discount_idr" binding:"omitempty,min=1"`
	MinPurchaseIDR int64    `json:"min_purchase_idr" binding:"omitempty,min=0"`
	MaxUses        *int     `json:"max_uses" binding:"omitempty,min=1"`
	ExpiresAt      *string  `json:"expires_at"`
	ProductIDs     []string `json:"product_ids"`
}

// Create — mode kode tunggal (quantity kosong/1) atau generate massal
// (quantity>1, tiap kode otomatis max_uses=1, dikelompokkan lewat batch_label).
func (h *VoucherHandler) Create(c *gin.Context) {
	var req createVoucherRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.DiscountType == "percentage" && (req.DiscountValue < 1 || req.DiscountValue > 100) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "diskon persentase harus antara 1-100"})
		return
	}

	quantity := req.Quantity
	if quantity < 1 {
		quantity = 1
	}
	if quantity > maxVoucherBatchQuantity {
		c.JSON(http.StatusBadRequest, gin.H{"error": "maksimal generate 200 kode sekali jalan"})
		return
	}
	if quantity > 1 && strings.TrimSpace(req.BatchLabel) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "batch_label wajib diisi untuk generate kode massal"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var expiresAt *time.Time
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format expires_at tidak valid (pakai RFC3339)"})
			return
		}
		expiresAt = &t
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	ids := make([]string, 0, quantity)
	maxUsesPerCode := req.MaxUses
	if quantity > 1 {
		one := 1
		maxUsesPerCode = &one
	}

	for i := 0; i < quantity; i++ {
		code := strings.ToUpper(strings.TrimSpace(req.Code))
		if quantity > 1 || code == "" {
			generated, err := generateVoucherCode()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode voucher"})
				return
			}
			code = generated
		}

		id := uuid.NewString()
		_, err := tx.Exec(ctx, `
			INSERT INTO vouchers (id, user_id, code, batch_label, discount_type, discount_value, max_discount_idr, min_purchase_idr, max_uses, expires_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`, id, userID, code, strings.TrimSpace(req.BatchLabel), req.DiscountType, req.DiscountValue, req.MaxDiscountIDR, req.MinPurchaseIDR, maxUsesPerCode, expiresAt)
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "kode voucher sudah dipakai, coba lagi"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat voucher"})
			return
		}
		ids = append(ids, id)

		for _, productID := range req.ProductIDs {
			if _, err := tx.Exec(ctx, `
				INSERT INTO voucher_products (voucher_id, product_id)
				SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM products WHERE id = $2 AND user_id = $3)
			`, id, productID, userID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan cakupan produk voucher"})
				return
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan voucher"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"ids": ids, "message": "voucher dibuat"})
}

type voucherListItem struct {
	ID             string     `json:"id"`
	Code           string     `json:"code"`
	BatchLabel     string     `json:"batch_label"`
	DiscountType   string     `json:"discount_type"`
	DiscountValue  int64      `json:"discount_value"`
	MaxDiscountIDR *int64     `json:"max_discount_idr"`
	MinPurchaseIDR int64      `json:"min_purchase_idr"`
	MaxUses        *int       `json:"max_uses"`
	UsedCount      int        `json:"used_count"`
	IsActive       bool       `json:"is_active"`
	ExpiresAt      *time.Time `json:"expires_at"`
	ProductIDs     []string   `json:"product_ids"`
}

// List mengembalikan seluruh voucher milik kreator yang sedang login,
// termasuk kode-kode hasil generate massal (dikelompokkan di frontend
// lewat batch_label yang sama).
func (h *VoucherHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT v.id, v.code, v.batch_label, v.discount_type, v.discount_value, v.max_discount_idr,
			v.min_purchase_idr, v.max_uses, v.used_count, v.is_active, v.expires_at,
			COALESCE(array_agg(vp.product_id::text) FILTER (WHERE vp.product_id IS NOT NULL), '{}')
		FROM vouchers v
		LEFT JOIN voucher_products vp ON vp.voucher_id = v.id
		WHERE v.user_id = $1
		GROUP BY v.id
		ORDER BY v.created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat voucher"})
		return
	}
	defer rows.Close()

	items := []voucherListItem{}
	for rows.Next() {
		var it voucherListItem
		if err := rows.Scan(&it.ID, &it.Code, &it.BatchLabel, &it.DiscountType, &it.DiscountValue, &it.MaxDiscountIDR,
			&it.MinPurchaseIDR, &it.MaxUses, &it.UsedCount, &it.IsActive, &it.ExpiresAt, &it.ProductIDs); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type updateVoucherRequest struct {
	IsActive  *bool   `json:"is_active"`
	MaxUses   *int    `json:"max_uses" binding:"omitempty,min=1"`
	ExpiresAt *string `json:"expires_at"`
}

// Update — untuk sekarang cuma dukung toggle aktif/nonaktif dan ubah
// max_uses/expires_at satu voucher/kode by id (bukan operasi per-batch).
func (h *VoucherHandler) Update(c *gin.Context) {
	voucherID := c.Param("id")
	userID := c.GetString("userID")

	var req updateVoucherRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var expiresAt *time.Time
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format expires_at tidak valid (pakai RFC3339)"})
			return
		}
		expiresAt = &t
	}

	// Kepemilikan disatukan langsung ke WHERE UPDATE ini (bukan SELECT
	// terpisah dulu baru UPDATE by id polos seperti sebelumnya) -- pola
	// yang sama dipakai konsisten di handler lain (mis. AffiliateHandler.Revoke)
	// setelah temuan audit keamanan 14 Agustus 2026 (bukan celah yang
	// berhasil dieksploitasi, tapi check-then-act dua langkah tetap defense-
	// in-depth yang lebih lemah dibanding satu statement atomik).
	tag, err := h.DB.Exec(ctx, `
		UPDATE vouchers SET
			is_active = COALESCE($1, is_active),
			max_uses = COALESCE($2, max_uses),
			expires_at = COALESCE($3, expires_at)
		WHERE id = $4 AND user_id = $5
	`, req.IsActive, req.MaxUses, expiresAt, voucherID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui voucher"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "voucher tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "voucher diperbarui"})
}

// Delete menghapus satu voucher/kode by id.
func (h *VoucherHandler) Delete(c *gin.Context) {
	voucherID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	res, err := h.DB.Exec(ctx, `DELETE FROM vouchers WHERE id = $1 AND user_id = $2`, voucherID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus voucher"})
		return
	}
	if res.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "voucher tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "voucher dihapus"})
}

// isUniqueViolation mengecek kode error Postgres 23505 (unique_violation)
// tanpa perlu import driver-specific pgconn secara eksplisit di tempat lain.
func isUniqueViolation(err error) bool {
	return strings.Contains(err.Error(), "23505")
}

// voucherPricing dipakai bersama oleh ValidateVoucher (publik, pratinjau)
// dan CheckoutHandler.Create (penerapan sungguhan saat bayar).
type voucherPricing struct {
	VoucherID   string
	DiscountIDR int64
}

// resolveVoucher mencari & memvalidasi kode voucher untuk produk & harga
// tertentu. Tidak butuh tahu siapa pemilik voucher secara eksplisit --
// cukup produk yang sama pemiliknya dengan voucher itu sendiri.
func resolveVoucher(ctx context.Context, db *pgxpool.Pool, code, productID string, priceIDR int64) (*voucherPricing, string, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return nil, "kode voucher tidak boleh kosong", nil
	}

	var id, discountType string
	var discountValue, minPurchaseIDR int64
	var maxDiscountIDR *int64
	var maxUses, usedCount int
	var maxUsesPtr *int
	var isActive bool
	var expiresAt *time.Time
	var inScope bool

	err := db.QueryRow(ctx, `
		SELECT v.id, v.discount_type, v.discount_value, v.max_discount_idr, v.min_purchase_idr,
			v.max_uses, v.used_count, v.is_active, v.expires_at,
			(NOT EXISTS (SELECT 1 FROM voucher_products vp WHERE vp.voucher_id = v.id)
			 OR EXISTS (SELECT 1 FROM voucher_products vp WHERE vp.voucher_id = v.id AND vp.product_id = $1)) AS in_scope
		FROM vouchers v
		JOIN products p ON p.user_id = v.user_id
		WHERE p.id = $1 AND v.code = $2
	`, productID, code).Scan(&id, &discountType, &discountValue, &maxDiscountIDR, &minPurchaseIDR,
		&maxUsesPtr, &usedCount, &isActive, &expiresAt, &inScope)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, "kode voucher tidak ditemukan", nil
		}
		return nil, "", err
	}
	if maxUsesPtr != nil {
		maxUses = *maxUsesPtr
	}

	if !isActive {
		return nil, "kode voucher sudah tidak aktif", nil
	}
	if !inScope {
		return nil, "kode voucher tidak berlaku untuk produk ini", nil
	}
	if expiresAt != nil && time.Now().After(*expiresAt) {
		return nil, "kode voucher sudah kedaluwarsa", nil
	}
	if maxUsesPtr != nil && usedCount >= maxUses {
		return nil, "kode voucher sudah mencapai batas pemakaian", nil
	}
	if priceIDR < minPurchaseIDR {
		return nil, "belum memenuhi minimum pembelian untuk kode ini", nil
	}

	var discountIDR int64
	if discountType == "percentage" {
		discountIDR = priceIDR * discountValue / 100
		if maxDiscountIDR != nil && discountIDR > *maxDiscountIDR {
			discountIDR = *maxDiscountIDR
		}
	} else {
		discountIDR = discountValue
	}
	// Clamp: harga akhir tidak boleh di bawah Rp1.000 (harga minimum produk
	// yang sudah berlaku di tempat lain) -- voucher tidak boleh menggratiskan
	// produk sepenuhnya.
	if priceIDR-discountIDR < 1000 {
		discountIDR = priceIDR - 1000
	}
	if discountIDR < 0 {
		discountIDR = 0
	}

	return &voucherPricing{VoucherID: id, DiscountIDR: discountIDR}, "", nil
}
