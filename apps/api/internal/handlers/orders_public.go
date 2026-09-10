package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jeonme/api/internal/queue"
)

// orders_public.go -- riwayat pembelian pembeli (permintaan langsung
// pengguna, 10 September 2026: "alur pembelian product ini terasa ui dan
// ux nya masih sangat kurang", cakupan PALING BESAR dipilih via
// AskUserQuestion). File TERPISAH dari checkout.go (yang sudah >1600
// baris) -- 3 handler baru di CheckoutHandler ini MENIRU PERSIS pola
// verifikasi kepemilikan email tanpa akun yang SUDAH ADA & teruji di
// LoyaltyHandler (loyalty.go, migrasi 000090_loyalty_verification),
// HANYA beda: TIDAK di-scope per creator_user_id/username -- riwayat
// pembelian ini LINTAS SEMUA kreator di platform (satu pembeli bisa
// belanja di banyak toko berbeda), bukan poin per-toko. Helper bersama
// (generateVerificationCode/hashToken/generateToken/checkVerifyLockout/
// recordVerifyFailure/clearVerifyFailures/validationMessage) datang dari
// auth.go, dipakai APA ADANYA -- tidak ada logic baru yang diciptakan di
// sini, murni menyambungkan ulang pola yang sudah ada ke tabel baru
// (buyer_order_verifications) & bentuk query lintas-kreator.

type requestOrderHistoryCodeRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// RequestOrderHistoryCode -- langkah 1/2: kirim kode 6-digit ke email
// pembeli. SELALU membalas pesan generik yang sama terlepas dari apakah
// email ini pernah belanja sama sekali -- pola sama seperti
// RequestPasswordReset (auth.go)/RequestVerificationCode (loyalty.go),
// supaya endpoint ini tidak bisa dipakai sebagai oracle "email siapa saja
// yang pernah belanja di Jeon.id".
func (h *CheckoutHandler) RequestOrderHistoryCode(c *gin.Context) {
	var req requestOrderHistoryCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	buyerEmail := strings.ToLower(strings.TrimSpace(req.Email))

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	const genericResponse = "Kalau email ini pernah belanja di Jeon.id, kode verifikasi sudah dikirim"

	rawCode, codeHash, genErr := generateVerificationCode()
	if genErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode verifikasi"})
		return
	}
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO buyer_order_verifications (id, buyer_email, code_hash, expires_at)
		VALUES ($1, $2, $3, $4)
	`, uuid.NewString(), buyerEmail, codeHash, time.Now().Add(10*time.Minute)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode verifikasi"})
		return
	}

	// Soft-fail (pola sama seperti SMTP/S3/WhatsApp di seluruh repo ini).
	if h.Queue != nil {
		if task, err := queue.NewOrderHistoryVerificationTask(buyerEmail, rawCode); err == nil {
			_, _ = h.Queue.Enqueue(task)
		}
	}

	resp := gin.H{"message": genericResponse}
	if h.AppEnv != "production" {
		// TODO: hapus begitu riwayat pembelian sudah teruji stabil di
		// production sungguhan -- pola sama seperti dev_verification_code
		// (auth.go)/loyalty.go.
		resp["dev_verification_code"] = rawCode
	}
	c.JSON(http.StatusOK, resp)
}

type verifyOrderHistoryCodeRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required,len=6"`
}

// VerifyOrderHistoryCode -- langkah 2/2: tukar kode 6-digit jadi
// verification_token (token acak baru, BUKAN kode itu sendiri) yang
// dipakai ulang ListMyOrders selama sesi 30 menit. Lockout percobaan kode
// dibagi dengan mekanisme yang sama seperti verifikasi signup/loyalitas
// (checkVerifyLockout/recordVerifyFailure, auth.go) -- ambang & tujuannya
// identik (brute-force kode 6-digit), tidak perlu duplikat aturan baru.
func (h *CheckoutHandler) VerifyOrderHistoryCode(c *gin.Context) {
	var req verifyOrderHistoryCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	buyerEmail := strings.ToLower(strings.TrimSpace(req.Email))

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if h.RDB != nil {
		if locked, retryAfter := checkVerifyLockout(ctx, h.RDB, buyerEmail); locked {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "terlalu banyak percobaan, coba lagi nanti", "retry_after_seconds": int(retryAfter.Seconds())})
			return
		}
	}

	codeHash := hashToken(req.Code)
	var verificationID string
	if err := h.DB.QueryRow(ctx, `
		SELECT id FROM buyer_order_verifications
		WHERE buyer_email = $1 AND code_hash = $2
			AND verified_at IS NULL AND expires_at > now()
		ORDER BY created_at DESC LIMIT 1
	`, buyerEmail, codeHash).Scan(&verificationID); err != nil {
		recordVerifyFailure(ctx, h.RDB, buyerEmail)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "kode salah atau kedaluwarsa"})
		return
	}
	clearVerifyFailures(ctx, h.RDB, buyerEmail)

	rawSessionToken, sessionHash, genErr := generateToken()
	if genErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat sesi verifikasi"})
		return
	}
	if _, err := h.DB.Exec(ctx, `
		UPDATE buyer_order_verifications SET verified_at = now(), session_token_hash = $1, expires_at = now() + interval '30 minutes'
		WHERE id = $2
	`, sessionHash, verificationID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan sesi verifikasi"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"verification_token": rawSessionToken})
}

// verifyOrderHistorySession -- true kalau verificationToken cocok sesi
// yang SUDAH diverifikasi (verified_at terisi) & belum kedaluwarsa untuk
// email PERSIS ini. Mirror verifyLoyaltySession (loyalty.go) MINUS
// creatorUserID -- sesi ini lintas kreator, bukan per-toko.
func verifyOrderHistorySession(ctx context.Context, h *CheckoutHandler, buyerEmail, verificationToken string) bool {
	if verificationToken == "" {
		return false
	}
	var exists bool
	_ = h.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM buyer_order_verifications
			WHERE buyer_email = $1 AND session_token_hash = $2
				AND verified_at IS NOT NULL AND expires_at > now()
		)
	`, buyerEmail, hashToken(verificationToken)).Scan(&exists)
	return exists
}

// myOrderSummary -- satu baris ringkas riwayat pembelian, cukup utk
// daftar (mengklik salah satu order mengarah ke /checkout/{id} yang
// SUDAH ADA utk detail/download/invoice -- TIDAK perlu duplikasi
// tampilan detail di sini).
type myOrderSummary struct {
	OrderID         string    `json:"order_id"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"created_at"`
	AmountIDR       int64     `json:"amount_idr"`
	ProductName     string    `json:"product_name"`
	CoverImageURL   string    `json:"cover_image_url"`
	CreatorUsername string    `json:"creator_username"`
}

// ListMyOrders -- daftar SEMUA order milik satu email, lintas kreator,
// setelah kepemilikan email itu diverifikasi (verifyOrderHistorySession).
// `email`/`verification_token` dikirim sbg query param -- pola sama
// seperti LoyaltyHandler.GetMyPoints.
func (h *CheckoutHandler) ListMyOrders(c *gin.Context) {
	buyerEmail := strings.ToLower(strings.TrimSpace(c.Query("email")))
	verificationToken := c.Query("verification_token")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if buyerEmail == "" || !verifyOrderHistorySession(ctx, h, buyerEmail, verificationToken) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "sesi verifikasi tidak valid atau sudah kedaluwarsa"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT o.id, o.status, o.created_at, o.amount_idr, p.name, p.cover_image_url, u.username
		FROM orders o
		JOIN products p ON p.id = o.product_id
		JOIN users u ON u.id = p.user_id
		WHERE o.buyer_email = $1
		ORDER BY o.created_at DESC
	`, buyerEmail)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat riwayat pembelian"})
		return
	}
	defer rows.Close()

	orders := []myOrderSummary{}
	for rows.Next() {
		var o myOrderSummary
		if err := rows.Scan(&o.OrderID, &o.Status, &o.CreatedAt, &o.AmountIDR, &o.ProductName, &o.CoverImageURL, &o.CreatorUsername); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat riwayat pembelian"})
			return
		}
		orders = append(orders, o)
	}
	if err := rows.Err(); err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat riwayat pembelian"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"orders": orders})
}
