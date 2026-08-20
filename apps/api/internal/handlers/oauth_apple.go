package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jeonme/api/internal/appleoauth"
)

type appleLoginRequest struct {
	Code        string `json:"code" binding:"required"`
	RedirectURI string `json:"redirect_uri" binding:"required"`
}

// AppleLogin -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
// juga login via apple". Struktur SENGAJA dibuat sedekat mungkin dengan
// AuthHandler.GoogleLogin (oauth_google.go) -- SATU-SATUNYA endpoint yang
// melayani login MAUPUN register lewat Apple sekaligus, token diterbitkan
// lewat h.issueToken + recordSession yang SAMA seperti jalur login lain,
// generateUsernameFromEmail dipakai ULANG apa adanya (sudah generik, tidak
// spesifik Google). TIDAK digabung jadi satu fungsi generik dengan
// GoogleLogin -- pola yang sudah dipilih sengaja di proyek ini untuk kode
// keamanan otentikasi (lihat checkLoginLockout/dkk di auth.go): duplikasi
// kecil lebih aman daripada abstraksi bersama yang berisiko meregresi jalur
// Google yang sudah teruji kalau ada perubahan.
func (h *AuthHandler) AppleLogin(c *gin.Context) {
	var req appleLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	profile, err := h.AppleOAuth.Exchange(ctx, req.Code, req.RedirectURI)
	if err != nil {
		if errors.Is(err, appleoauth.ErrNotConfigured) {
			c.JSON(http.StatusNotImplemented, gin.H{"error": "login Apple belum dikonfigurasi di server ini"})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "gagal memverifikasi akun Apple, coba lagi"})
		return
	}
	if !profile.EmailVerified {
		c.JSON(http.StatusForbidden, gin.H{"error": "email Apple ini belum terverifikasi"})
		return
	}

	id, suspended, err := h.findOrCreateAppleUser(ctx, profile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal masuk dengan Apple"})
		return
	}
	if suspended {
		c.JSON(http.StatusForbidden, gin.H{"error": "akun ini sedang ditangguhkan, hubungi admin"})
		return
	}

	signed, jti, exp, err := h.issueToken(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token"})
		return
	}
	recordSession(ctx, h.RDB, id, jti, exp, c.Request.UserAgent(), c.ClientIP())

	c.JSON(http.StatusOK, gin.H{"token": signed})
}

// findOrCreateAppleUser -- 3 jalur, PERSIS sama semangatnya dengan
// findOrCreateGoogleUser: (1) apple_id sudah cocok -> pakai akun itu, (2)
// email cocok akun yang sudah ada (password ATAUPUN google_id) -> tautkan
// apple_id ke akun itu (jadi cara tambahan masuk ke akun yang sama), (3)
// belum ada sama sekali -> daftar akun baru.
func (h *AuthHandler) findOrCreateAppleUser(ctx context.Context, profile *appleoauth.Profile) (id string, suspended bool, err error) {
	var suspendedAt *time.Time

	err = h.DB.QueryRow(ctx, `SELECT id, suspended_at FROM users WHERE apple_id = $1 AND deleted_at IS NULL`, profile.Sub).Scan(&id, &suspendedAt)
	if err == nil {
		return id, suspendedAt != nil, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", false, err
	}

	err = h.DB.QueryRow(ctx, `SELECT id, suspended_at FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`, profile.Email).Scan(&id, &suspendedAt)
	if err == nil {
		if _, uErr := h.DB.Exec(ctx, `UPDATE users SET apple_id = $1 WHERE id = $2`, profile.Sub, id); uErr != nil {
			return "", false, uErr
		}
		return id, suspendedAt != nil, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", false, err
	}

	id, err = h.createAppleUser(ctx, profile)
	return id, false, err
}

// createAppleUser -- pola sama dengan createGoogleUser, dua beda: (1) TIDAK
// ada avatar_url awal (Apple tidak pernah menyertakan foto profil sama
// sekali di id_token, beda dari Google -- pages.avatar_url dibiarkan
// kosong seperti akun daftar manual biasa, kreator tetap bebas mengisi
// lewat Desain), (2) apple_id (bukan google_id) yang diisi.
func (h *AuthHandler) createAppleUser(ctx context.Context, profile *appleoauth.Profile) (string, error) {
	username, err := h.generateUsernameFromEmail(ctx, profile.Email)
	if err != nil {
		return "", err
	}

	id := uuid.NewString()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, username, role, kyc_status, apple_id, email_verified_at, consent_accepted_at, created_at)
		VALUES ($1, $2, NULL, $3, 'creator', 'unverified', $4, now(), now(), now())
	`, id, profile.Email, username, profile.Sub); err != nil {
		return "", err
	}

	if _, err := tx.Exec(ctx, `INSERT INTO pages (user_id) VALUES ($1)`, id); err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return id, nil
}
