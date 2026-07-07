package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler mengimplementasikan REQ-F-101 (registrasi) dan alur login dasar.
// KYC (REQ-F-105) dan OAuth Google (REQ-F-101) belum diimplementasikan di sini --
// ini adalah kerangka awal yang perlu dilengkapi tim.
type AuthHandler struct {
	DB        *pgxpool.Pool
	JWTSecret string
}

func NewAuthHandler(db *pgxpool.Pool, jwtSecret string) *AuthHandler {
	return &AuthHandler{DB: db, JWTSecret: jwtSecret}
}

type registerRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Username string `json:"username" binding:"required,min=3,max=30"`
}

// Register — REQ-F-101, REQ-F-102 (validasi keunikan username).
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
	_, err = h.DB.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, username, role, kyc_status, created_at)
		 VALUES ($1, $2, $3, $4, 'creator', 'unverified', now())`,
		id, req.Email, string(hash), req.Username,
	)
	if err != nil {
		// TODO: bedakan error "username/email sudah dipakai" (unique constraint)
		// dari error database lain, lalu kembalikan pesan yang jelas ke pengguna.
		c.JSON(http.StatusConflict, gin.H{"error": "email atau username sudah dipakai"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id, "username": req.Username})
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Login menghasilkan JWT yang dipakai untuk mengakses endpoint dashboard.
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

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": id,
		"exp": time.Now().Add(24 * time.Hour).Unix(),
		"iat": time.Now().Unix(),
	})

	signed, err := token.SignedString([]byte(h.JWTSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": signed})
}
