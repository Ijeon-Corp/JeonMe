package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/audit"
	"github.com/jeonme/api/internal/crypto"
)

// PayoutMethodHandler mengimplementasikan Modul Settings §3 (Payment /
// Payout): rekening/e-wallet TERSIMPAN, nomor dienkripsi at rest
// (AES-256-GCM, lihat internal/crypto) -- beda dari
// payouts.destination_account/kyc_verifications.bank_account_name yang
// sudah ada sebelumnya (plaintext, di luar lingkup revisi fase ini).
// Metode baru WAJIB verified=true (kode OTP 6 digit) sebelum bisa
// dijadikan is_primary.
type PayoutMethodHandler struct {
	DB            *pgxpool.Pool
	EncryptionKey []byte
	AppEnv        string
}

func NewPayoutMethodHandler(db *pgxpool.Pool, encryptionKey []byte, appEnv string) *PayoutMethodHandler {
	return &PayoutMethodHandler{DB: db, EncryptionKey: encryptionKey, AppEnv: appEnv}
}

type payoutMethodItem struct {
	ID                  string    `json:"id"`
	Type                string    `json:"type"`
	Provider            string    `json:"provider"`
	AccountNumberMasked string    `json:"account_number_masked"`
	AccountName         string    `json:"account_name"`
	IsPrimary           bool      `json:"is_primary"`
	Verified            bool      `json:"verified"`
	CreatedAt           time.Time `json:"created_at"`
}

// List — nomor rekening TIDAK PERNAH dikembalikan utuh setelah dibuat,
// cuma 4 digit terakhir (crypto.Mask) -- didekripsi di server sekadar
// untuk disamarkan, tidak pernah dikirim penuh ke klien lagi.
func (h *PayoutMethodHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, type, provider, account_number_encrypted, account_name, is_primary, verified, created_at
		FROM payout_methods WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat metode pembayaran"})
		return
	}
	defer rows.Close()

	items := []payoutMethodItem{}
	for rows.Next() {
		var it payoutMethodItem
		var encrypted string
		if err := rows.Scan(&it.ID, &it.Type, &it.Provider, &encrypted, &it.AccountName, &it.IsPrimary, &it.Verified, &it.CreatedAt); err != nil {
			continue
		}
		if decrypted, err := crypto.Decrypt(h.EncryptionKey, encrypted); err == nil {
			it.AccountNumberMasked = crypto.Mask(decrypted)
		} else {
			it.AccountNumberMasked = "••••"
		}
		items = append(items, it)
	}

	c.JSON(http.StatusOK, items)
}

type createPayoutMethodRequest struct {
	Type          string `json:"type" binding:"required,oneof=bank_transfer ewallet"`
	Provider      string `json:"provider" binding:"required"`
	AccountNumber string `json:"account_number" binding:"required"`
	AccountName   string `json:"account_name" binding:"required"`
}

// Create — metode baru SELALU mulai verified=false & is_primary=false
// (acceptance criteria Modul Settings §3: wajib verifikasi dulu).
func (h *PayoutMethodHandler) Create(c *gin.Context) {
	userID := c.GetString("userID")

	var req createPayoutMethodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	encrypted, err := crypto.Encrypt(h.EncryptionKey, req.AccountNumber)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengenkripsi nomor rekening"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	id := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO payout_methods (id, user_id, type, provider, account_number_encrypted, account_name)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, id, userID, req.Type, req.Provider, encrypted, req.AccountName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan metode pembayaran"})
		return
	}
	_ = audit.Log(ctx, h.DB, userID, "payout_method.created", "payout_method", id, nil)

	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "metode pembayaran ditambahkan, verifikasi dulu sebelum dipakai"})
}

// RequestVerification — micro-deposit bank sungguhan butuh integrasi rel
// pembayaran yang belum ada, jadi verifikasi lewat kode OTP 6 digit
// (dihash SHA-256 sebelum disimpan, expiry 10 menit -- pola sama persis
// dengan password_reset_tokens/email_verification_tokens yang sudah ada).
// Pengiriman SMS/email OTP sungguhan BELUM diwire (belum ada provider) --
// kode dikembalikan langsung di response HANYA saat non-production, sama
// seperti dev_reset_token di AuthHandler.
func (h *PayoutMethodHandler) RequestVerification(c *gin.Context) {
	userID := c.GetString("userID")
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var exists bool
	if err := h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM payout_methods WHERE id = $1 AND user_id = $2)`, id, userID).Scan(&exists); err != nil || !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "metode pembayaran tidak ditemukan"})
		return
	}

	code, err := generateOTP()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode verifikasi"})
		return
	}
	sum := sha256.Sum256([]byte(code))
	hashHex := hex.EncodeToString(sum[:])

	if _, err := h.DB.Exec(ctx, `
		UPDATE payout_methods SET verification_code_hash = $1, verification_expires_at = now() + interval '10 minutes'
		WHERE id = $2
	`, hashHex, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan kode verifikasi"})
		return
	}

	resp := gin.H{"message": "kode verifikasi dibuat, berlaku 10 menit"}
	if h.AppEnv != "production" {
		resp["dev_otp"] = code
	}
	c.JSON(http.StatusOK, resp)
}

func generateOTP() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

type verifyPayoutMethodRequest struct {
	Code string `json:"code" binding:"required"`
}

func (h *PayoutMethodHandler) Verify(c *gin.Context) {
	userID := c.GetString("userID")
	id := c.Param("id")

	var req verifyPayoutMethodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var hashHex string
	var expiresAt *time.Time
	err := h.DB.QueryRow(ctx, `
		SELECT COALESCE(verification_code_hash, ''), verification_expires_at
		FROM payout_methods WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(&hashHex, &expiresAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "metode pembayaran tidak ditemukan"})
		return
	}
	if hashHex == "" || expiresAt == nil || expiresAt.Before(time.Now()) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "belum ada kode verifikasi aktif, minta kode baru"})
		return
	}

	sum := sha256.Sum256([]byte(req.Code))
	if hex.EncodeToString(sum[:]) != hashHex {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "kode verifikasi salah"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		UPDATE payout_methods SET verified = true, verification_code_hash = NULL, verification_expires_at = NULL
		WHERE id = $1
	`, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memverifikasi metode pembayaran"})
		return
	}
	_ = audit.Log(ctx, h.DB, userID, "payout_method.verified", "payout_method", id, nil)

	c.JSON(http.StatusOK, gin.H{"message": "metode pembayaran terverifikasi"})
}

// SetPrimary — WAJIB verified=true (acceptance criteria). Unset primary
// lama + set yang baru dalam SATU transaksi supaya tidak pernah ada dua
// is_primary=true sekaligus -- ditegakkan di sini (bukan constraint DB
// partial-unique) karena ini SATU-SATUNYA jalur yang mengubah is_primary.
func (h *PayoutMethodHandler) SetPrimary(c *gin.Context) {
	userID := c.GetString("userID")
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var verified bool
	if err := h.DB.QueryRow(ctx, `SELECT verified FROM payout_methods WHERE id = $1 AND user_id = $2`, id, userID).Scan(&verified); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "metode pembayaran tidak ditemukan"})
		return
	}
	if !verified {
		c.JSON(http.StatusBadRequest, gin.H{"error": "verifikasi metode ini dulu sebelum dijadikan utama"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `UPDATE payout_methods SET is_primary = false WHERE user_id = $1 AND is_primary = true`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui metode utama"})
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE payout_methods SET is_primary = true WHERE id = $1`, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menjadikan metode utama"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "metode pembayaran utama diperbarui"})
}

func (h *PayoutMethodHandler) Delete(c *gin.Context) {
	userID := c.GetString("userID")
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM payout_methods WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus metode pembayaran"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "metode pembayaran tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "metode pembayaran dihapus"})
}

// PayoutScheduleHandler mengimplementasikan auto-withdraw terjadwal
// (Modul Settings §3, diferensiasi dari Lynk.id) -- baris preferensi
// TERKINI per user (bukan riwayat), dieksekusi oleh
// worker.HandleAutoWithdrawScan lewat asynq.Scheduler (lihat main.go).
type PayoutScheduleHandler struct {
	DB *pgxpool.Pool
}

func NewPayoutScheduleHandler(db *pgxpool.Pool) *PayoutScheduleHandler {
	return &PayoutScheduleHandler{DB: db}
}

type payoutScheduleResponse struct {
	Frequency       string `json:"frequency"`
	MinThresholdIDR int64  `json:"min_threshold_idr"`
}

func (h *PayoutScheduleHandler) Get(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp payoutScheduleResponse
	err := h.DB.QueryRow(ctx, `
		SELECT COALESCE((SELECT frequency FROM payout_schedule WHERE user_id = $1), 'manual'),
			COALESCE((SELECT min_threshold_idr FROM payout_schedule WHERE user_id = $1), 0)
	`, userID).Scan(&resp.Frequency, &resp.MinThresholdIDR)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat jadwal penarikan"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

type upsertPayoutScheduleRequest struct {
	Frequency       string `json:"frequency" binding:"required,oneof=manual weekly monthly"`
	MinThresholdIDR int64  `json:"min_threshold_idr" binding:"min=0"`
}

// Upsert — acceptance criteria Modul Settings §3: auto-withdraw HARUS
// punya metode pembayaran utama TERVERIFIKASI sebelum bisa dijadwalkan
// (weekly/monthly) -- kalau tidak, jadwalnya tidak akan pernah benar-benar
// bisa mencairkan apa pun.
func (h *PayoutScheduleHandler) Upsert(c *gin.Context) {
	userID := c.GetString("userID")

	var req upsertPayoutScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if req.Frequency != "manual" {
		var hasVerifiedPrimary bool
		if err := h.DB.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM payout_methods WHERE user_id = $1 AND is_primary = true AND verified = true)
		`, userID).Scan(&hasVerifiedPrimary); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa metode pembayaran"})
			return
		}
		if !hasVerifiedPrimary {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tambahkan & verifikasi metode pembayaran utama dulu sebelum mengaktifkan auto-withdraw"})
			return
		}
	}

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO payout_schedule (user_id, frequency, min_threshold_idr, updated_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (user_id) DO UPDATE SET frequency = $2, min_threshold_idr = $3, updated_at = now()
	`, userID, req.Frequency, req.MinThresholdIDR); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan jadwal penarikan"})
		return
	}
	_ = audit.Log(ctx, h.DB, userID, "payout_schedule.updated", "user", userID, nil)

	c.JSON(http.StatusOK, gin.H{"message": "jadwal penarikan disimpan"})
}
