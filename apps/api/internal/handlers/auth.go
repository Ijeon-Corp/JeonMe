package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler mengimplementasikan REQ-F-101 (registrasi), REQ-F-103 (reset
// password), REQ-F-104 (verifikasi email), dan REQ-F-106 (revoke sesi).
// OAuth Google (bagian dari REQ-F-101) belum diimplementasikan -- butuh
// GOOGLE_CLIENT_ID/SECRET dari Google Cloud Console yang belum tersedia.
// KYC (REQ-F-105) juga belum diimplementasikan.
type AuthHandler struct {
	DB        *pgxpool.Pool
	RDB       *redis.Client
	JWTSecret string
	AppEnv    string
}

func NewAuthHandler(db *pgxpool.Pool, rdb *redis.Client, jwtSecret string, appEnv string) *AuthHandler {
	return &AuthHandler{DB: db, RDB: rdb, JWTSecret: jwtSecret, AppEnv: appEnv}
}

type registerRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Username string `json:"username" binding:"required,min=3,max=30"`
}

// Register — REQ-F-101, REQ-F-102 (validasi keunikan username).
// Setiap user baru langsung dibuatkan baris pages (belum published) supaya
// endpoint CRUD tautan (REQ-F-202/203) punya sesuatu untuk ditautkan.
func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memproses password"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	id := uuid.NewString()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, username, role, kyc_status, created_at)
		 VALUES ($1, $2, $3, $4, 'creator', 'unverified', now())`,
		id, req.Email, string(hash), req.Username,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			field := "email atau username"
			if strings.Contains(pgErr.ConstraintName, "username") {
				field = "username"
			} else if strings.Contains(pgErr.ConstraintName, "email") {
				field = "email"
			}
			c.JSON(http.StatusConflict, gin.H{"error": field + " sudah dipakai"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat akun"})
		return
	}

	if _, err := tx.Exec(ctx, `INSERT INTO pages (user_id) VALUES ($1)`, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyiapkan halaman"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan akun"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id, "username": req.Username})
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Login menghasilkan JWT yang dipakai untuk mengakses endpoint dashboard.
// Klaim "jti" dipakai untuk mendukung revoke sesi (lihat Logout).
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var id, passwordHash string
	err := h.DB.QueryRow(ctx,
		`SELECT id, password_hash FROM users WHERE email = $1`, req.Email,
	).Scan(&id, &passwordHash)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "email atau password salah"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "email atau password salah"})
		return
	}

	jti := uuid.NewString()
	exp := time.Now().Add(24 * time.Hour)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": id,
		"jti": jti,
		"exp": exp.Unix(),
		"iat": time.Now().Unix(),
	})

	signed, err := token.SignedString([]byte(h.JWTSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": signed})
}

// Logout — REQ-F-106 (revoke sesi). Menaruh jti token yang sedang dipakai ke
// denylist Redis sampai token itu sendiri kedaluwarsa (TTL = sisa umur token),
// supaya denylist tidak menumpuk selamanya. Untuk "logout semua perangkat",
// klien perlu memanggil ini di tiap token yang tersimpan (tidak ada multi-
// session tracking terpisah di skema saat ini).
func (h *AuthHandler) Logout(c *gin.Context) {
	jti, _ := c.Get("jti")
	expUnix, _ := c.Get("exp")

	jtiStr, _ := jti.(string)
	if jtiStr == "" {
		c.JSON(http.StatusOK, gin.H{"message": "sudah logout"})
		return
	}

	ttl := time.Until(time.Unix(expUnix.(int64), 0))
	if ttl <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "sudah logout"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	if err := h.RDB.Set(ctx, "revoked_jti:"+jtiStr, "1", ttl).Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal logout"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "berhasil logout"})
}

type requestPasswordResetRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// RequestPasswordReset — REQ-F-103. Selalu membalas 200 walau email tidak
// terdaftar (menghindari enumerasi akun). Pengiriman email BELUM
// diimplementasikan (tidak ada provider SMTP/email terpasang) -- token
// dikembalikan langsung di response hanya saat APP_ENV != production,
// supaya tetap bisa diuji manual sebelum worker notifikasi (Sprint 2/3) siap.
func (h *AuthHandler) RequestPasswordReset(c *gin.Context) {
	var req requestPasswordResetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var userID string
	err := h.DB.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, req.Email).Scan(&userID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "jika email terdaftar, tautan reset sudah dikirim"})
		return
	}

	rawToken, tokenHash, genErr := generateToken()
	if genErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token reset"})
		return
	}

	_, err = h.DB.Exec(ctx,
		`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, tokenHash, time.Now().Add(1*time.Hour),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token reset"})
		return
	}

	resp := gin.H{"message": "jika email terdaftar, tautan reset sudah dikirim"}
	if h.AppEnv != "production" {
		// TODO: ganti dengan pengiriman email sungguhan begitu provider SMTP/worker siap.
		resp["dev_reset_token"] = rawToken
	}
	c.JSON(http.StatusOK, resp)
}

type confirmPasswordResetRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// ConfirmPasswordReset — REQ-F-103 (lanjutan). Token sekali pakai, kedaluwarsa 1 jam.
func (h *AuthHandler) ConfirmPasswordReset(c *gin.Context) {
	var req confirmPasswordResetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tokenHash := hashToken(req.Token)

	var tokenID, userID string
	err := h.DB.QueryRow(ctx, `
		SELECT id, user_id FROM password_reset_tokens
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
	`, tokenHash).Scan(&tokenID, &userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token tidak valid atau sudah kedaluwarsa"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memproses password"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `UPDATE users SET password_hash = $1 WHERE id = $2`, string(hash), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui password"})
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, tokenID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui password"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan password baru"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password berhasil diperbarui"})
}

// RequestEmailVerification — REQ-F-104. Dilindungi AuthRequired (user yang
// sedang login minta verifikasi emailnya sendiri). Sama seperti reset
// password, pengiriman email sungguhan belum ada -- token dikembalikan
// langsung di response saat bukan production.
func (h *AuthHandler) RequestEmailVerification(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rawToken, tokenHash, err := generateToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token verifikasi"})
		return
	}

	_, err = h.DB.Exec(ctx,
		`INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, tokenHash, time.Now().Add(24*time.Hour),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token verifikasi"})
		return
	}

	resp := gin.H{"message": "tautan verifikasi sudah dikirim ke email kamu"}
	if h.AppEnv != "production" {
		// TODO: ganti dengan pengiriman email sungguhan begitu provider SMTP/worker siap.
		resp["dev_verification_token"] = rawToken
	}
	c.JSON(http.StatusOK, resp)
}

type confirmEmailVerificationRequest struct {
	Token string `json:"token" binding:"required"`
}

// ConfirmEmailVerification — REQ-F-104 (lanjutan). Endpoint publik (link
// diklik dari email), token sekali pakai, kedaluwarsa 24 jam.
func (h *AuthHandler) ConfirmEmailVerification(c *gin.Context) {
	var req confirmEmailVerificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tokenHash := hashToken(req.Token)

	var tokenID, userID string
	err := h.DB.QueryRow(ctx, `
		SELECT id, user_id FROM email_verification_tokens
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
	`, tokenHash).Scan(&tokenID, &userID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusBadRequest, gin.H{"error": "token tidak valid atau sudah kedaluwarsa"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memverifikasi email"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `UPDATE users SET email_verified_at = now() WHERE id = $1`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memverifikasi email"})
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE email_verification_tokens SET used_at = now() WHERE id = $1`, tokenID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memverifikasi email"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan verifikasi"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email berhasil diverifikasi"})
}

// generateToken membuat token acak 32-byte. Nilai mentah (rawToken) dikirim
// ke pengguna (lewat email nantinya); hanya hash SHA-256-nya yang disimpan
// di database, supaya kebocoran database tidak otomatis membocorkan token aktif.
func generateToken() (rawToken string, tokenHash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	rawToken = hex.EncodeToString(buf)
	return rawToken, hashToken(rawToken), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
