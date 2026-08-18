package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pquerna/otp/totp"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"github.com/jeonme/api/internal/googleoauth"
	"github.com/jeonme/api/internal/queue"
)

// AuthHandler mengimplementasikan REQ-F-101 (registrasi, termasuk OAuth
// Google -- lihat GoogleLogin di oauth_google.go), REQ-F-103 (reset
// password), REQ-F-104 (verifikasi email), dan REQ-F-106 (revoke sesi).
// KYC (REQ-F-105) belum diimplementasikan.
type AuthHandler struct {
	DB        *pgxpool.Pool
	RDB       *redis.Client
	JWTSecret string
	AppEnv    string
	// GoogleOAuth -- di-set terpisah sesudah NewAuthHandler (bukan lewat
	// parameter constructor) supaya SEMUA call site lama (test helper di
	// hampir setiap _test.go handler lain, yang tidak butuh Google OAuth
	// sama sekali) tidak perlu ikut berubah. Selalu non-nil (NewClient
	// tidak pernah gagal), ClientID/ClientSecret kosong ditangani sendiri
	// oleh googleoauth.Client.Exchange (ErrNotConfigured).
	GoogleOAuth *googleoauth.Client
	// Queue -- pola sama seperti GoogleOAuth di atas: di-set terpisah
	// sesudah NewAuthHandler (bukan lewat parameter constructor) supaya
	// SEMUA call site test lama tidak perlu ikut berubah. Nil-safe (lihat
	// Register) -- soft-fail, akun tetap dibuat walau Redis/queue
	// bermasalah, kreator tinggal pakai "Kirim ulang kode".
	Queue *asynq.Client
	// PublicWebURL -- perbaikan 20 Agustus 2026 (gap "reset password tidak
	// pernah kirim email", lihat queue.TypePasswordResetEmail): dibutuhkan
	// RequestPasswordReset untuk membangun tautan lengkap ke halaman
	// /reset-password (frontend), sebelum diteruskan ke worker lewat
	// payload. Sama seperti Queue -- di-set terpisah sesudah NewAuthHandler
	// supaya call site test lama tidak perlu berubah; string kosong di
	// test cuma menghasilkan tautan relatif di badan email (tidak pernah
	// benar-benar dikirim tanpa Queue juga di-set, lihat RequestPasswordReset).
	PublicWebURL string
}

func NewAuthHandler(db *pgxpool.Pool, rdb *redis.Client, jwtSecret string, appEnv string) *AuthHandler {
	return &AuthHandler{DB: db, RDB: rdb, JWTSecret: jwtSecret, AppEnv: appEnv, GoogleOAuth: googleoauth.NewClient("", "")}
}

type registerRequest struct {
	Email           string `json:"email" binding:"required,email"`
	Password        string `json:"password" binding:"required,min=8"`
	Username        string `json:"username" binding:"required,min=3,max=30"`
	ConsentAccepted bool   `json:"consent_accepted" binding:"required"`
}

// Register — REQ-F-101, REQ-F-102 (validasi keunikan username), NF-09
// (persetujuan pemrosesan data pribadi sesuai UU PDP -- WAJIB dicentang,
// waktunya dicatat di consent_accepted_at untuk bukti kepatuhan).
// Setiap user baru langsung dibuatkan baris pages (belum published) supaya
// endpoint CRUD tautan (REQ-F-202/203) punya sesuatu untuk ditautkan.
func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("auth: validasi gagal: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	if !req.ConsentAccepted {
		c.JSON(http.StatusBadRequest, gin.H{"error": "kamu harus menyetujui pemrosesan data pribadi untuk mendaftar"})
		return
	}

	// Modul Settings §2: format sama dengan yang dipakai saat ganti username
	// di pengaturan, + cegah orang lain langsung mendaftar pakai username
	// yang baru saja ditinggalkan pemilik lama (masih dalam window redirect).
	// Race kecil di sini (dicek di luar transaksi insert) dibiarkan --
	// idx_users_username_lower tetap jadi penjamin akhir keunikan dasar,
	// pemeriksaan squat memang bukan constraint DB (aturan bisnis lintas
	// tabel), jadi celah TOCTOU-nya sengaja diterima untuk lingkup ini.
	if ok, msg := checkUsernameAvailable(c.Request.Context(), h.DB, req.Username, ""); !ok {
		c.JSON(http.StatusConflict, gin.H{"error": msg})
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
		`INSERT INTO users (id, email, password_hash, username, role, kyc_status, consent_accepted_at, created_at)
		 VALUES ($1, $2, $3, $4, 'creator', 'unverified', now(), now())`,
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

	// Kode aktivasi akun -- permintaan langsung pengguna, 19 Agustus 2026:
	// "saat sign up butuh kode verif yang dikirim dari email untuk
	// aktivasi baru setelah itu akun bisa digunakan". Dibuat DI DALAM
	// transaksi yang sama dengan pembuatan user/pages supaya atomik --
	// tidak mungkin ada akun baru tanpa kode aktivasi yang menyertainya
	// (kalau enqueue emailnya sendiri gagal di bawah, kreator tetap bisa
	// minta kirim ulang lewat ResendSignupVerification karena barisnya
	// sudah pasti ada di DB).
	rawCode, codeHash, genErr := generateVerificationCode()
	if genErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode verifikasi"})
		return
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		id, codeHash, time.Now().Add(15*time.Minute),
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode verifikasi"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan akun"})
		return
	}

	// Soft-fail (pola sama seperti SMTP/S3/WhatsApp di seluruh repo ini) --
	// akun TETAP dibuat walau Redis/queue bermasalah, kreator tinggal pakai
	// "Kirim ulang kode" di halaman verifikasi.
	if h.Queue != nil {
		if task, err := queue.NewSignupVerificationTask(req.Email, rawCode); err == nil {
			_, _ = h.Queue.Enqueue(task)
		}
	}

	resp := gin.H{"id": id, "username": req.Username, "email_verification_required": true}
	if h.AppEnv != "production" {
		// TODO: hapus begitu verifikasi email-manual sudah teruji stabil di
		// production sungguhan -- pola sama seperti dev_reset_token.
		resp["dev_verification_code"] = rawCode
	}
	c.JSON(http.StatusCreated, resp)
}

// CheckUsername -- permintaan langsung pengguna, 11 Agustus 2026: cek
// ketersediaan username secara live saat mengetik di /register (bukan
// menunggu submit lalu gagal). Publik (belum ada akun/JWT di titik ini,
// sama seperti Register sendiri), dibatasi rate limit tersendiri karena
// dipanggil berkali-kali per sesi pengisian form. Pakai helper yang SAMA
// (checkUsernameAvailable) dengan Register supaya hasil live-check dan
// hasil submit akhir tidak pernah berbeda logika.
func (h *AuthHandler) CheckUsername(c *gin.Context) {
	username := c.Query("username")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	available, msg := checkUsernameAvailable(ctx, h.DB, username, "")
	c.JSON(http.StatusOK, gin.H{"available": available, "message": msg})
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Konstanta lockout brute-force per-akun (audit keamanan 15 Agustus 2026).
// authRateLimit di routes.go membatasi per-IP (10/menit), tapi penyerang
// yang memutar lintas banyak IP bisa tetap menembus email tunggal yang
// diketahui -- lockout ini dikunci PER EMAIL (dengan toleransi case-insensitive),
// bukan per IP, supaya credential stuffing terhadap satu akun dibatasi
// terlepas dari berapa banyak IP yang dipakai.
const (
	loginFailMaxAttempts = 5              // setelah sekian kegagalan, akun dikunci sementara
	loginFailWindow      = 15 * time.Minute // hitung kegagalan dalam window geser ini
	loginLockoutDuration = 15 * time.Minute // durasi kunci setelah ambang terlampaui
)

func loginFailKey(email string) string {
	return "login_fail:" + strings.ToLower(email)
}

// checkLoginLockout mengembalikan true kalau akun sedang dikunci karena terlalu
// banyak kegagalan. Fail-open: kalau Redis bermasalah, tidak mengunci siapa pun
// (rate limit adalah pertahanan tambahan, bukan satu-satunya lapisan -- sama
// seperti middleware.RateLimit). Mengembalikan 0 countdown saat tidak terkunci.
func checkLoginLockout(ctx context.Context, rdb *redis.Client, email string) (locked bool, retryAfter time.Duration) {
	if rdb == nil {
		return false, 0
	}
	count, err := rdb.Get(ctx, loginFailKey(email)).Int()
	if err != nil || count < loginFailMaxAttempts {
		return false, 0
	}
	ttl, err := rdb.TTL(ctx, loginFailKey(email)).Result()
	if err != nil || ttl <= 0 {
		return false, 0
	}
	return true, ttl
}

// recordLoginFailure menambah penghitung kegagalan untuk email ini. Set key
// TTL = loginLockoutDuration saat ambang tercapai (kunci aktif), atau
// loginFailWindow selama masih di bawah ambang (hitungan berjalan). Mengembalikan
// jumlah percobaan setelah increment (dipakai untuk pesan yang informatif tanpa
// membocorkan ambang eksak ke penyerang).
func recordLoginFailure(ctx context.Context, rdb *redis.Client, email string) {
	if rdb == nil {
		return
	}
	key := loginFailKey(email)
	pipe := rdb.TxPipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, loginFailWindow)
	_, _ = pipe.Exec(ctx)
	if count, err := incr.Result(); err == nil && count >= int64(loginFailMaxAttempts) {
		// Perpanjang TTL ke durasi kunci penuh supaya ambang kegagalan
		// "mengunci" akun selama loginLockoutDuration sejak percobaan ke-5.
		_ = rdb.Expire(ctx, key, loginLockoutDuration).Err()
	}
}

// clearLoginFailures menghapus penghitung kegagalan begitu login berhasil --
// kegagalan lama tidak boleh membuat akun terkunci setelah password benar.
func clearLoginFailures(ctx context.Context, rdb *redis.Client, email string) {
	if rdb == nil {
		return
	}
	_ = rdb.Del(ctx, loginFailKey(email)).Err()
}

// issueToken menerbitkan JWT + jti + exp dalam bentuk yang SELALU sama --
// dipakai Login (jalur tanpa 2FA) MAUPUN VerifyLogin2FA (jalur sesudah kode
// TOTP benar), supaya kedua jalur menghasilkan token yang identik bentuknya.
func (h *AuthHandler) issueToken(userID string) (signed, jti string, exp time.Time, err error) {
	jti = uuid.NewString()
	exp = time.Now().Add(24 * time.Hour)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"jti": jti,
		"exp": exp.Unix(),
		"iat": time.Now().Unix(),
	})
	signed, err = token.SignedString([]byte(h.JWTSecret))
	return
}

// Login menghasilkan JWT yang dipakai untuk mengakses endpoint dashboard.
// Klaim "jti" dipakai untuk mendukung revoke sesi (lihat Logout) & daftar
// sesi aktif (lihat SecurityHandler.ListSessions, Modul Settings §5). Kalau
// akun ini sudah mengaktifkan 2FA, JWT TIDAK langsung diterbitkan di sini --
// mengembalikan mfa_token sementara (5 menit, sekali pakai) yang harus
// ditukar lewat VerifyLogin2FA dengan kode TOTP yang benar sebelum token
// sungguhan keluar.
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("auth: validasi gagal: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// Audit keamanan 15 Agustus 2026: brute-force lockout per-akun (lihat
	// checkLoginLockout). Dicek SEBELUM query DB supaya akun yang sedang
	// dikunci tidak bocor apakah email terdaftar pun (pesan sama dengan
	// login gagal biasa). Catatan: pesan lockout sengaja TIDAK menyebut
	// "terlalu banyak percobaan" eksplisit agar tidak membantu penyerang
	// memetakan ambang -- tapi 423 (Locked) memberi sinyal ke klien yang
	// mau menampilkan hint "coba lagi nanti".
	if locked, retryAfter := checkLoginLockout(ctx, h.RDB, req.Email); locked {
		c.Header("Retry-After", fmt.Sprintf("%d", int(retryAfter.Seconds())))
		c.JSON(http.StatusLocked, gin.H{"error": "terlalu banyak percobaan login gagal, coba lagi nanti"})
		return
	}

	var id string
	// passwordHash -- *string (bukan string) karena akun yang HANYA pernah
	// daftar/masuk lewat Google (lihat oauth_google.go) punya password_hash
	// NULL di database (migrasi 000065) -- scan ke string polos akan gagal
	// dengan error scan generik yang membingungkan, jadi ditangani eksplisit
	// di bawah dengan pesan yang jelas ("akun ini terdaftar lewat Google").
	var passwordHash *string
	var suspendedAt, twoFactorEnabledAt, emailVerifiedAt *time.Time
	err := h.DB.QueryRow(ctx,
		`SELECT id, password_hash, suspended_at, two_factor_enabled_at, email_verified_at FROM users WHERE email = $1 AND deleted_at IS NULL`, req.Email,
	).Scan(&id, &passwordHash, &suspendedAt, &twoFactorEnabledAt, &emailVerifiedAt)
	if err != nil {
		recordLoginFailure(ctx, h.RDB, req.Email)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "email atau password salah"})
		return
	}

	if passwordHash == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "akun ini terdaftar lewat Google, silakan masuk pakai tombol \"Lanjutkan dengan Google\""})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*passwordHash), []byte(req.Password)); err != nil {
		recordLoginFailure(ctx, h.RDB, req.Email)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "email atau password salah"})
		return
	}

	// Password sudah benar di titik ini -- aman memberi tahu status suspend
	// secara eksplisit (REQ-F-701), ini bukan kebocoran informasi akun ke
	// pihak yang tidak berhak (mereka sudah membuktikan tahu password-nya).
	if suspendedAt != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "akun ini sedang ditangguhkan, hubungi admin"})
		return
	}

	// Gerbang aktivasi akun -- permintaan langsung pengguna, 19 Agustus
	// 2026. Dicek SETELAH password benar (sama alasannya dengan suspend di
	// atas -- bukan kebocoran info ke pihak yang tidak berhak) tapi
	// SEBELUM 2FA (akun yang belum diaktivasi tidak boleh sampai ke
	// tantangan 2FA sama sekali). Akun lama sudah di-backfill terverifikasi
	// lewat migrasi 000071, jadi ini HANYA menghalangi akun baru yang
	// benar-benar belum menuntaskan kode dari email -- akun Google OAuth
	// juga tidak pernah kena (oauth_google.go langsung mengisi
	// email_verified_at=now() saat dibuat, Google sudah memverifikasi
	// emailnya).
	if emailVerifiedAt == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "akun belum diverifikasi, cek email untuk kode aktivasi", "email_verification_required": true})
		return
	}

	if twoFactorEnabledAt != nil {
		mfaToken := uuid.NewString()
		if h.RDB != nil {
			if err := h.RDB.Set(ctx, "mfa_pending:"+mfaToken, id, 5*time.Minute).Err(); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai verifikasi 2FA"})
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"mfa_required": true, "mfa_token": mfaToken})
		return
	}

	signed, jti, exp, err := h.issueToken(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token"})
		return
	}
	clearLoginFailures(ctx, h.RDB, req.Email)
	recordSession(ctx, h.RDB, id, jti, exp, c.Request.UserAgent(), c.ClientIP())

	c.JSON(http.StatusOK, gin.H{"token": signed})
}

type verifyLogin2FARequest struct {
	MFAToken string `json:"mfa_token" binding:"required"`
	Code     string `json:"code" binding:"required"`
}

// VerifyLogin2FA — langkah kedua login untuk akun ber-2FA (lihat Login di
// atas). mfa_token HANYA dihapus dari Redis begitu kodenya BENAR -- kalau
// pengguna salah ketik, mfa_token yang sama masih bisa dicoba lagi selama
// window 5 menitnya belum habis, tidak perlu login ulang dari awal.
func (h *AuthHandler) VerifyLogin2FA(c *gin.Context) {
	var req verifyLogin2FARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("auth: validasi gagal: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if h.RDB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "verifikasi 2FA tidak tersedia"})
		return
	}

	userID, err := h.RDB.Get(ctx, "mfa_pending:"+req.MFAToken).Result()
	if err != nil || userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "sesi verifikasi 2FA tidak valid atau kedaluwarsa, silakan login ulang"})
		return
	}

	var secret string
	if err := h.DB.QueryRow(ctx,
		`SELECT two_factor_secret FROM users WHERE id = $1 AND two_factor_enabled_at IS NOT NULL`, userID,
	).Scan(&secret); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "2FA tidak aktif untuk akun ini"})
		return
	}

	if !totp.Validate(req.Code, secret) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "kode 2FA salah"})
		return
	}

	h.RDB.Del(ctx, "mfa_pending:"+req.MFAToken)

	signed, jti, exp, err := h.issueToken(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token"})
		return
	}
	recordSession(ctx, h.RDB, userID, jti, exp, c.Request.UserAgent(), c.ClientIP())

	c.JSON(http.StatusOK, gin.H{"token": signed})
}

// Logout — REQ-F-106 (revoke sesi). Menaruh jti token yang sedang dipakai ke
// denylist Redis sampai token itu sendiri kedaluwarsa (TTL = sisa umur token),
// supaya denylist tidak menumpuk selamanya, dan menghapus catatan sesinya
// (lihat session.go) supaya langsung hilang dari daftar device aktif.
func (h *AuthHandler) Logout(c *gin.Context) {
	userID := c.GetString("userID")
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
	forgetSession(ctx, h.RDB, userID, jtiStr)

	c.JSON(http.StatusOK, gin.H{"message": "berhasil logout"})
}

type requestPasswordResetRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// RequestPasswordReset — REQ-F-103. Selalu membalas 200 walau email tidak
// terdaftar (menghindari enumerasi akun). Email SUNGGUHAN dikirim lewat
// worker (queue.TypePasswordResetEmail) sejak perbaikan 20 Agustus 2026 --
// SEBELUMNYA cuma menyimpan token ke DB tanpa pernah benar-benar
// mengirimkannya, ditemukan lewat audit "apakah notifikasi sudah berfungsi
// semua" (pengguna produksi yang lupa password sebelumnya tidak punya jalan
// reset sama sekali). dev_reset_token TETAP dikembalikan langsung di
// response saat APP_ENV != production -- dev convenience, pola sama dengan
// dev_verification_code di Register, tidak mengganti pengiriman email
// sungguhan (keduanya sama-sama terjadi).
func (h *AuthHandler) RequestPasswordReset(c *gin.Context) {
	var req requestPasswordResetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("auth: validasi gagal: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
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

	if h.Queue != nil {
		resetURL := h.PublicWebURL + "/reset-password?token=" + rawToken
		if task, err := queue.NewPasswordResetTask(req.Email, resetURL); err == nil {
			_, _ = h.Queue.Enqueue(task)
		}
	}

	resp := gin.H{"message": "jika email terdaftar, tautan reset sudah dikirim"}
	if h.AppEnv != "production" {
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
		log.Printf("auth: validasi gagal: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
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
		log.Printf("auth: validasi gagal: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
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

type confirmSignupVerificationRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required"`
}

// ConfirmSignupVerification -- permintaan langsung pengguna, 19 Agustus
// 2026, langkah kedua alur registrasi (lihat Register): publik (belum ada
// JWT di titik ini, akun baru belum pernah login sama sekali), menukar
// kode 6 digit yang dikirim ke email dengan JWT sungguhan -- dari sinilah
// akun BENAR-BENAR "bisa digunakan" pertama kali, bukan lewat Login biasa
// (yang sekarang menolak akun belum terverifikasi, lihat gerbang di atas).
//
// Rate-limit KHUSUS (checkVerifyLockout, terpisah dari checkLoginLockout)
// -- kode cuma 6 digit (1 juta kombinasi) dan endpoint ini TIDAK
// mensyaratkan password sama sekali, jadi WAJIB dibatasi ketat supaya
// tidak bisa di-brute-force dalam waktu wajar.
func (h *AuthHandler) ConfirmSignupVerification(c *gin.Context) {
	var req confirmSignupVerificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("auth: validasi gagal: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if locked, retryAfter := checkVerifyLockout(ctx, h.RDB, req.Email); locked {
		c.Header("Retry-After", fmt.Sprintf("%d", int(retryAfter.Seconds())))
		c.JSON(http.StatusLocked, gin.H{"error": "terlalu banyak percobaan, coba lagi nanti"})
		return
	}

	var userID string
	var emailVerifiedAt *time.Time
	err := h.DB.QueryRow(ctx,
		`SELECT id, email_verified_at FROM users WHERE email = $1 AND deleted_at IS NULL`, req.Email,
	).Scan(&userID, &emailVerifiedAt)
	if err != nil {
		recordVerifyFailure(ctx, h.RDB, req.Email)
		c.JSON(http.StatusBadRequest, gin.H{"error": "kode tidak valid atau sudah kedaluwarsa"})
		return
	}
	if emailVerifiedAt != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "akun ini sudah terverifikasi, silakan masuk seperti biasa"})
		return
	}

	var tokenID string
	err = h.DB.QueryRow(ctx, `
		SELECT id FROM email_verification_tokens
		WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > now()
	`, userID, hashToken(req.Code)).Scan(&tokenID)
	if err != nil {
		recordVerifyFailure(ctx, h.RDB, req.Email)
		c.JSON(http.StatusBadRequest, gin.H{"error": "kode tidak valid atau sudah kedaluwarsa"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `UPDATE users SET email_verified_at = now() WHERE id = $1`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memverifikasi akun"})
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE email_verification_tokens SET used_at = now() WHERE id = $1`, tokenID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memverifikasi akun"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan verifikasi"})
		return
	}

	clearVerifyFailures(ctx, h.RDB, req.Email)

	signed, jti, exp, err := h.issueToken(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token"})
		return
	}
	recordSession(ctx, h.RDB, userID, jti, exp, c.Request.UserAgent(), c.ClientIP())

	c.JSON(http.StatusOK, gin.H{"token": signed})
}

type resendSignupVerificationRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// ResendSignupVerification -- publik, dipanggil dari halaman verifikasi
// kalau kode lama sudah kedaluwarsa (15 menit) atau emailnya tidak pernah
// sampai. Cooldown 60 detik per email (SETNX Redis) mencegah spam kirim
// ulang. Respons SELALU generik (sama pola dengan RequestPasswordReset) --
// tidak membocorkan apakah email itu terdaftar atau sudah terverifikasi.
func (h *AuthHandler) ResendSignupVerification(c *gin.Context) {
	var req resendSignupVerificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("auth: validasi gagal: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	genericResp := gin.H{"message": "kalau akun belum terverifikasi, kode baru sudah dikirim"}

	if h.RDB != nil {
		cooldownKey := "verify_resend_cooldown:" + strings.ToLower(req.Email)
		ok, err := h.RDB.SetNX(ctx, cooldownKey, "1", 60*time.Second).Result()
		if err == nil && !ok {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "tunggu sebentar sebelum minta kode baru"})
			return
		}
	}

	var userID string
	var emailVerifiedAt *time.Time
	err := h.DB.QueryRow(ctx,
		`SELECT id, email_verified_at FROM users WHERE email = $1 AND deleted_at IS NULL`, req.Email,
	).Scan(&userID, &emailVerifiedAt)
	if err != nil || emailVerifiedAt != nil {
		c.JSON(http.StatusOK, genericResp)
		return
	}

	rawCode, codeHash, genErr := generateVerificationCode()
	if genErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode verifikasi"})
		return
	}
	if _, err := h.DB.Exec(ctx,
		`INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, codeHash, time.Now().Add(15*time.Minute),
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode verifikasi"})
		return
	}

	if h.Queue != nil {
		if task, err := queue.NewSignupVerificationTask(req.Email, rawCode); err == nil {
			_, _ = h.Queue.Enqueue(task)
		}
	}

	resp := genericResp
	if h.AppEnv != "production" {
		resp["dev_verification_code"] = rawCode
	}
	c.JSON(http.StatusOK, resp)
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

// generateVerificationCode -- kode 6 digit numerik (bukan token hex panjang
// seperti generateToken) supaya gampang diketik manual dari email. Dipakai
// KHUSUS alur aktivasi akun saat signup (beda dari
// RequestEmailVerification/ConfirmEmailVerification yang berbasis tautan
// utk pengguna yang SUDAH login) -- disimpan di tabel
// email_verification_tokens yang SAMA, kolom token_hash generik (SHA-256
// dari string apa pun), tidak spesifik ke format token panjang. crypto/rand
// (bukan math/rand) -- kode ini fungsinya sama seperti password sementara,
// harus CSPRNG.
func generateVerificationCode() (rawCode string, codeHash string, err error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", "", err
	}
	rawCode = fmt.Sprintf("%06d", n.Int64())
	return rawCode, hashToken(rawCode), nil
}

// Lockout percobaan kode verifikasi -- pola SENGAJA diduplikasi dari
// checkLoginLockout/recordLoginFailure/clearLoginFailures (bukan
// digeneralisasi jadi satu helper bersama) supaya mekanisme lockout login
// yang sudah teruji tidak ikut berubah/berisiko regresi hanya karena
// menambah alur baru ini -- kode di sini independen, aman diaudit
// terpisah. Ambang & durasi sama persis dengan login (5 percobaan/15
// menit) -- cukup, tidak perlu tuning terpisah untuk kasus ini.
func verifyFailKey(email string) string {
	return "email_verify_fail:" + strings.ToLower(email)
}

func checkVerifyLockout(ctx context.Context, rdb *redis.Client, email string) (locked bool, retryAfter time.Duration) {
	if rdb == nil {
		return false, 0
	}
	count, err := rdb.Get(ctx, verifyFailKey(email)).Int()
	if err != nil || count < loginFailMaxAttempts {
		return false, 0
	}
	ttl, err := rdb.TTL(ctx, verifyFailKey(email)).Result()
	if err != nil || ttl <= 0 {
		return false, 0
	}
	return true, ttl
}

func recordVerifyFailure(ctx context.Context, rdb *redis.Client, email string) {
	if rdb == nil {
		return
	}
	key := verifyFailKey(email)
	pipe := rdb.TxPipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, loginFailWindow)
	_, _ = pipe.Exec(ctx)
	if count, err := incr.Result(); err == nil && count >= int64(loginFailMaxAttempts) {
		_ = rdb.Expire(ctx, key, loginLockoutDuration).Err()
	}
}

func clearVerifyFailures(ctx context.Context, rdb *redis.Client, email string) {
	if rdb == nil {
		return
	}
	_ = rdb.Del(ctx, verifyFailKey(email)).Err()
}
