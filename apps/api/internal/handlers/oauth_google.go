package handlers

import (
	"context"
	"crypto/rand"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jeonme/api/internal/googleoauth"
)

type googleLoginRequest struct {
	Code        string `json:"code" binding:"required"`
	RedirectURI string `json:"redirect_uri" binding:"required"`
}

// GoogleLogin -- REQ-F-101, permintaan langsung pengguna 13 Agustus 2026:
// "tambahkan di login dan register login via google". Alur Authorization
// Code PENUH (bukan Google Identity Services popup/id_token) -- frontend
// (tombol "Lanjutkan dengan Google" di /login MAUPUN /register, lihat
// GoogleAuthButton.tsx) mengarahkan browser ke accounts.google.com, Google
// redirect balik ke halaman /auth/google/callback (apps/web) bawa
// authorization code, frontend kirim code itu ke sini.
//
// Endpoint ini SATU-SATUNYA dan melayani login MAUPUN register sekaligus
// (tombol yang sama persis dipakai di kedua halaman, tidak ada endpoint
// /auth/google/register terpisah) -- lihat findOrCreateGoogleUser untuk 3
// jalur yang ditangani: akun Google sudah pernah dipakai (login), email
// cocok dengan akun password yang sudah ada (tautkan otomatis), atau akun
// benar-benar baru (daftar). Konsisten dengan Login()/VerifyLogin2FA:
// token diterbitkan lewat h.issueToken + recordSession yang SAMA, supaya
// revoke sesi/daftar device aktif (SecurityHandler) bekerja sama untuk
// akun apa pun terlepas dari cara masuknya.
func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var req googleLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	profile, err := h.GoogleOAuth.Exchange(ctx, req.Code, req.RedirectURI)
	if err != nil {
		if errors.Is(err, googleoauth.ErrNotConfigured) {
			c.JSON(http.StatusNotImplemented, gin.H{"error": "login Google belum dikonfigurasi di server ini"})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "gagal memverifikasi akun Google, coba lagi"})
		return
	}
	if !profile.EmailVerified {
		c.JSON(http.StatusForbidden, gin.H{"error": "email Google ini belum terverifikasi"})
		return
	}

	id, suspended, err := h.findOrCreateGoogleUser(ctx, profile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal masuk dengan Google"})
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

// findOrCreateGoogleUser -- 3 jalur: (1) google_id sudah cocok -> pakai akun
// itu langsung (login biasa), (2) belum, tapi email cocok dengan akun
// password yang sudah ada -> TAUTKAN google_id ke akun itu (login Google
// jadi cara tambahan masuk ke akun yang sama, bukan bikin akun duplikat --
// kreator yang lupa dia dulu daftar pakai password tetap sampai ke akun
// lamanya), (3) belum ada sama sekali -> daftar akun baru.
func (h *AuthHandler) findOrCreateGoogleUser(ctx context.Context, profile *googleoauth.Profile) (id string, suspended bool, err error) {
	var suspendedAt *time.Time

	err = h.DB.QueryRow(ctx, `SELECT id, suspended_at FROM users WHERE google_id = $1 AND deleted_at IS NULL`, profile.Sub).Scan(&id, &suspendedAt)
	if err == nil {
		return id, suspendedAt != nil, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", false, err
	}

	err = h.DB.QueryRow(ctx, `SELECT id, suspended_at FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`, profile.Email).Scan(&id, &suspendedAt)
	if err == nil {
		if _, uErr := h.DB.Exec(ctx, `UPDATE users SET google_id = $1 WHERE id = $2`, profile.Sub, id); uErr != nil {
			return "", false, uErr
		}
		return id, suspendedAt != nil, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", false, err
	}

	id, err = h.createGoogleUser(ctx, profile)
	return id, false, err
}

// createGoogleUser -- password_hash SENGAJA NULL (bukan hash acak yang
// tidak pernah dipakai) supaya jelas-jelas eksplisit di database bahwa
// akun ini belum punya password, bukan cuma password yang kebetulan tidak
// pernah cocok (lihat migrasi 000065 & penanganan NULL di Login()).
// consent_accepted_at diisi now() -- BEDA dari Register() biasa yang
// mewajibkan checkbox tercentang dulu (NF-09, UU PDP): layar consent
// Google sendiri (yang secara eksplisit menyebut nama aplikasi & data yang
// diminta -- email, profil) berfungsi sebagai bentuk persetujuan yang
// setara sebelum authorization code ini bisa terbit sama sekali, jadi
// tidak ada langkah checkbox terpisah yang masuk akal disisipkan di
// tengah alur redirect ini. email_verified_at juga diisi now() -- Google
// sudah memverifikasi kepemilikan email ini (dicek EmailVerified di
// GoogleLogin sebelum sampai sini), tidak perlu alur verifikasi email
// terpisah lagi.
func (h *AuthHandler) createGoogleUser(ctx context.Context, profile *googleoauth.Profile) (string, error) {
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
		INSERT INTO users (id, email, password_hash, username, role, kyc_status, google_id, email_verified_at, consent_accepted_at, created_at)
		VALUES ($1, $2, NULL, $3, 'creator', 'unverified', $4, now(), now(), now())
	`, id, profile.Email, username, profile.Sub); err != nil {
		return "", err
	}

	// avatar_url langsung diisi dari foto profil Google kalau ada -- nilai
	// awal yang masuk akal (halaman publik tidak kosong melompong sesaat
	// setelah daftar), kreator tetap bebas menggantinya lewat Desain.
	if _, err := tx.Exec(ctx, `INSERT INTO pages (user_id, avatar_url) VALUES ($1, $2)`, id, profile.Picture); err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return id, nil
}

var usernameSanitizePattern = regexp.MustCompile(`[^a-zA-Z0-9_]`)

// generateUsernameFromEmail -- akun Google tidak pernah mengisi username
// manual saat daftar (beda dari Register() biasa, alur redirect ini tidak
// punya langkah form apa pun) -- diturunkan dari bagian lokal alamat
// emailnya (sebelum '@'), dibersihkan sesuai usernamePattern (username.go),
// lalu ditambah akhiran angka acak kalau sudah dipakai. Kreator tetap
// bebas menggantinya nanti lewat /dashboard/settings/profile -- ini hanya
// nilai awal yang masuk akal supaya akun langsung punya URL publik.
func (h *AuthHandler) generateUsernameFromEmail(ctx context.Context, email string) (string, error) {
	local := email
	if i := strings.Index(email, "@"); i != -1 {
		local = email[:i]
	}
	base := strings.ToLower(usernameSanitizePattern.ReplaceAllString(local, ""))
	if len(base) < 3 {
		base += "user"
	}
	if len(base) > 24 {
		base = base[:24]
	}

	candidate := base
	for attempt := 0; attempt < 20; attempt++ {
		if ok, _ := checkUsernameAvailable(ctx, h.DB, candidate, ""); ok {
			return candidate, nil
		}
		suffix, err := randomDigits(4)
		if err != nil {
			return "", err
		}
		candidate = base + suffix
		if len(candidate) > 30 {
			candidate = candidate[:30]
		}
	}
	return "", errors.New("gagal membuat username unik")
}

func randomDigits(n int) (string, error) {
	const digits = "0123456789"
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, n)
	for i, b := range buf {
		out[i] = digits[int(b)%len(digits)]
	}
	return string(out), nil
}
