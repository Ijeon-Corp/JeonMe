package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pquerna/otp/totp"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"github.com/jeonme/api/internal/audit"
)

// SecurityHandler mengimplementasikan Modul Settings §5: ganti password
// (re-auth), 2FA TOTP, dan daftar/pencabutan sesi aktif. Sesi dibangun DI
// ATAS mekanisme denylist jti yang sudah ada di AuthHandler -- lihat
// session.go -- SENGAJA bukan tabel Postgres baru.
type SecurityHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
}

func NewSecurityHandler(db *pgxpool.Pool, rdb *redis.Client) *SecurityHandler {
	return &SecurityHandler{DB: db, RDB: rdb}
}

type changePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// ChangePassword — re-auth wajib (minta password lama) sebelum mengganti.
func (h *SecurityHandler) ChangePassword(c *gin.Context) {
	userID := c.GetString("userID")

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var currentHash string
	if err := h.DB.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&currentHash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.OldPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "password lama salah"})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memproses password baru"})
		return
	}

	if _, err := h.DB.Exec(ctx, `UPDATE users SET password_hash = $1 WHERE id = $2`, string(newHash), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan password baru"})
		return
	}

	_ = audit.Log(ctx, h.DB, userID, "security.password_changed", "user", userID, nil)

	c.JSON(http.StatusOK, gin.H{"message": "password berhasil diganti"})
}

// Enable2FA — langkah 1/2: buat secret TOTP baru & simpan sebagai "belum
// aktif" (two_factor_enabled_at tetap NULL sampai Verify2FA sukses).
// Memanggil ulang endpoint ini sebelum verify mengganti secret lama --
// wajar, mungkin pengguna perlu scan ulang di aplikasi authenticator lain.
func (h *SecurityHandler) Enable2FA(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var email string
	var alreadyEnabled *time.Time
	if err := h.DB.QueryRow(ctx, `SELECT email, two_factor_enabled_at FROM users WHERE id = $1`, userID).Scan(&email, &alreadyEnabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}
	if alreadyEnabled != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "2FA sudah aktif"})
		return
	}

	key, err := totp.Generate(totp.GenerateOpts{Issuer: "Jeonme", AccountName: email})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kunci 2FA"})
		return
	}

	if _, err := h.DB.Exec(ctx, `UPDATE users SET two_factor_secret = $1 WHERE id = $2`, key.Secret(), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan kunci 2FA"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"secret": key.Secret(), "otpauth_url": key.URL()})
}

type verify2FARequest struct {
	Code string `json:"code" binding:"required"`
}

// Verify2FA — langkah 2/2: konfirmasi kode dari aplikasi authenticator
// sebelum 2FA benar-benar dianggap aktif.
func (h *SecurityHandler) Verify2FA(c *gin.Context) {
	userID := c.GetString("userID")

	var req verify2FARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var secret string
	if err := h.DB.QueryRow(ctx, `SELECT COALESCE(two_factor_secret, '') FROM users WHERE id = $1`, userID).Scan(&secret); err != nil || secret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "mulai dari Aktifkan 2FA dulu sebelum verifikasi"})
		return
	}

	if !totp.Validate(req.Code, secret) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "kode 2FA salah"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		UPDATE users SET two_factor_enabled_at = now(), two_factor_snoozed_until = NULL WHERE id = $1
	`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengaktifkan 2FA"})
		return
	}
	_ = audit.Log(ctx, h.DB, userID, "security.2fa_enabled", "user", userID, nil)

	c.JSON(http.StatusOK, gin.H{"message": "2FA berhasil diaktifkan"})
}

type disable2FARequest struct {
	Password string `json:"password" binding:"required"`
}

// Disable2FA — re-auth wajib (password). Tidak ada di daftar endpoint
// literal spec, tapi jelas dibutuhkan: 2FA tanpa jalan keluar mengunci
// pengguna yang kehilangan device authenticator-nya.
func (h *SecurityHandler) Disable2FA(c *gin.Context) {
	userID := c.GetString("userID")

	var req disable2FARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var currentHash string
	if err := h.DB.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&currentHash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "password salah"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		UPDATE users SET two_factor_secret = NULL, two_factor_enabled_at = NULL, two_factor_snoozed_until = NULL WHERE id = $1
	`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menonaktifkan 2FA"})
		return
	}
	_ = audit.Log(ctx, h.DB, userID, "security.2fa_disabled", "user", userID, nil)

	c.JSON(http.StatusOK, gin.H{"message": "2FA dinonaktifkan"})
}

// Snooze2FA — Modul Settings §5 acceptance criteria: prompt wajib 2FA boleh
// ditunda MAKSIMAL 7 hari, bukan permanen skip. Boleh dipanggil berkali-kali
// (tidak ada batas jumlah snooze), tapi tiap panggilan cuma menggeser
// window maju 7 hari dari SEKARANG, tidak pernah lebih jauh dari itu.
func (h *SecurityHandler) Snooze2FA(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `
		UPDATE users SET two_factor_snoozed_until = now() + interval '7 days'
		WHERE id = $1 AND two_factor_enabled_at IS NULL
	`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menunda pengingat 2FA"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "pengingat 2FA ditunda 7 hari"})
}

type status2FAResponse struct {
	Enabled      bool       `json:"enabled"`
	Required     bool       `json:"required"`
	SnoozedUntil *time.Time `json:"snoozed_until,omitempty"`
}

// Status2FA — dipanggil dashboard layout untuk menampilkan prompt wajib
// (lihat TwoFactorPrompt di frontend). "required" = kreator sudah mengisi
// rekening bank di KYC (proksi "punya metode pembayaran terhubung" -- belum
// ada tabel payout_methods sungguhan, itu pekerjaan Fase Payment; keputusan
// eksplisit pengguna 2026-07-31 untuk memakai proksi ini sampai fase itu)
// DAN belum mengaktifkan 2FA DAN tidak sedang di-snooze.
func (h *SecurityHandler) Status2FA(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var enabledAt, snoozedUntil *time.Time
	var hasBankAccount bool
	err := h.DB.QueryRow(ctx, `
		SELECT u.two_factor_enabled_at, u.two_factor_snoozed_until,
			EXISTS(
				SELECT 1 FROM kyc_verifications k
				WHERE k.user_id = u.id AND k.bank_account_name IS NOT NULL AND k.bank_account_name != ''
			)
		FROM users u WHERE u.id = $1
	`, userID).Scan(&enabledAt, &snoozedUntil, &hasBankAccount)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat status 2FA"})
		return
	}

	enabled := enabledAt != nil
	snoozed := snoozedUntil != nil && snoozedUntil.After(time.Now())
	required := hasBankAccount && !enabled && !snoozed

	c.JSON(http.StatusOK, status2FAResponse{Enabled: enabled, Required: required, SnoozedUntil: snoozedUntil})
}

type sessionItem struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	UserAgent string    `json:"user_agent"`
	IsCurrent bool      `json:"is_current"`
}

// ListSessions — Modul Settings §5. SCAN (bukan KEYS) supaya tidak
// memblokir Redis walau daftar sesi seorang pengguna cukup panjang.
func (h *SecurityHandler) ListSessions(c *gin.Context) {
	userID := c.GetString("userID")
	currentJTI, _ := c.Get("jti")
	currentJTIStr, _ := currentJTI.(string)

	items := []sessionItem{}
	if h.RDB == nil {
		c.JSON(http.StatusOK, items)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	prefix := sessionKey(userID, "")
	iter := h.RDB.Scan(ctx, 0, prefix+"*", 100).Iterator()
	for iter.Next(ctx) {
		key := iter.Val()
		jti := strings.TrimPrefix(key, prefix)

		data, err := h.RDB.Get(ctx, key).Bytes()
		if err != nil {
			continue
		}
		var rec sessionRecord
		if err := json.Unmarshal(data, &rec); err != nil {
			continue
		}
		items = append(items, sessionItem{
			ID:        jti,
			CreatedAt: rec.CreatedAt,
			ExpiresAt: rec.ExpiresAt,
			UserAgent: rec.UserAgent,
			IsCurrent: jti == currentJTIStr,
		})
	}

	c.JSON(http.StatusOK, items)
}

// RevokeSession — Modul Settings §5 acceptance criteria: efeknya REAL-TIME,
// bukan nunggu expiry. Menaruh jti ke denylist yang sudah dicek
// middleware.AuthRequired di SETIAP request (pola sama dengan
// AuthHandler.Logout) -- permintaan berikutnya dari device itu langsung
// ditolak, tidak perlu menunggu token-nya kedaluwarsa sendiri.
func (h *SecurityHandler) RevokeSession(c *gin.Context) {
	userID := c.GetString("userID")
	jti := c.Param("jti")

	if h.RDB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "manajemen sesi tidak tersedia"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	data, err := h.RDB.Get(ctx, sessionKey(userID, jti)).Bytes()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "sesi tidak ditemukan"})
		return
	}
	var rec sessionRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca sesi"})
		return
	}

	if ttl := time.Until(rec.ExpiresAt); ttl > 0 {
		if err := h.RDB.Set(ctx, "revoked_jti:"+jti, "1", ttl).Err(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencabut sesi"})
			return
		}
	}
	forgetSession(ctx, h.RDB, userID, jti)

	c.JSON(http.StatusOK, gin.H{"message": "sesi dicabut"})
}
