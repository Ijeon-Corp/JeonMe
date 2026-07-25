package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BusinessCardHandler mengimplementasikan No.95 (Sprint 13): kartu kontak
// digital. LINGKUP DIPERSEMPIT dari temuan asli (Linktree "Business Cards"
// menghasilkan Apple/Google Wallet pass) -- integrasi Wallet butuh kredensial
// Apple Developer Program & Google Wallet API yang belum tersedia (blocker
// eksternal serupa WhatsApp Business API/No.74-75). Sebagai gantinya,
// pengunjung mengunduh file vCard (.vcf) standar yang didukung native oleh
// aplikasi Kontak di iOS & Android tanpa integrasi pihak ketiga apa pun --
// file .vcf dibuat di sisi FRONTEND dari data yang dikembalikan GetPublicCard,
// jadi handler ini tidak perlu endpoint unduhan terpisah.
//
// Fitur pertukaran DUA ARAH ("Let visitors share their details back" di
// Linktree) memakai kembali tabel subscribers (No.73) sebagai satu Manajer
// Audiens terpadu -- bukan tabel kontak terpisah.
type BusinessCardHandler struct {
	DB *pgxpool.Pool
}

func NewBusinessCardHandler(db *pgxpool.Pool) *BusinessCardHandler {
	return &BusinessCardHandler{DB: db}
}

type businessCardResponse struct {
	IsActive           bool   `json:"is_active"`
	FullName           string `json:"full_name"`
	JobTitle           string `json:"job_title"`
	Company            string `json:"company"`
	Phone              string `json:"phone"`
	WhatsappNumber     string `json:"whatsapp_number"`
	Email              string `json:"email"`
	Website            string `json:"website"`
	CollectContactBack bool   `json:"collect_contact_back"`
}

// GetCard — dipakai halaman pengaturan dashboard. Belum pernah disimpan
// mengembalikan state kosong/nonaktif, BUKAN 404.
func (h *BusinessCardHandler) GetCard(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp businessCardResponse
	err := h.DB.QueryRow(ctx, `
		SELECT is_active, full_name, job_title, company, phone, whatsapp_number, email, website, collect_contact_back
		FROM business_cards WHERE user_id = $1
	`, userID).Scan(&resp.IsActive, &resp.FullName, &resp.JobTitle, &resp.Company, &resp.Phone,
		&resp.WhatsappNumber, &resp.Email, &resp.Website, &resp.CollectContactBack)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat kartu kontak"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

type upsertBusinessCardRequest struct {
	IsActive           bool   `json:"is_active"`
	FullName           string `json:"full_name" binding:"max=200"`
	JobTitle           string `json:"job_title" binding:"max=200"`
	Company            string `json:"company" binding:"max=200"`
	Phone              string `json:"phone" binding:"max=30"`
	WhatsappNumber     string `json:"whatsapp_number" binding:"max=30"`
	Email              string `json:"email" binding:"omitempty,email"`
	Website            string `json:"website" binding:"max=500"`
	CollectContactBack bool   `json:"collect_contact_back"`
}

func (h *BusinessCardHandler) UpsertCard(c *gin.Context) {
	var req upsertBusinessCardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.IsActive && strings.TrimSpace(req.FullName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nama lengkap wajib diisi"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO business_cards (user_id, is_active, full_name, job_title, company, phone, whatsapp_number, email, website, collect_contact_back, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
		ON CONFLICT (user_id) DO UPDATE SET
			is_active = EXCLUDED.is_active, full_name = EXCLUDED.full_name, job_title = EXCLUDED.job_title,
			company = EXCLUDED.company, phone = EXCLUDED.phone, whatsapp_number = EXCLUDED.whatsapp_number,
			email = EXCLUDED.email, website = EXCLUDED.website, collect_contact_back = EXCLUDED.collect_contact_back,
			updated_at = now()
	`, userID, req.IsActive, strings.TrimSpace(req.FullName), strings.TrimSpace(req.JobTitle), strings.TrimSpace(req.Company),
		strings.TrimSpace(req.Phone), strings.TrimSpace(req.WhatsappNumber), strings.TrimSpace(strings.ToLower(req.Email)),
		strings.TrimSpace(req.Website), req.CollectContactBack); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan kartu kontak"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "kartu kontak disimpan"})
}

type publicBusinessCard struct {
	Username           string `json:"username"`
	AvatarURL          string `json:"avatar_url"`
	FullName           string `json:"full_name"`
	JobTitle           string `json:"job_title"`
	Company            string `json:"company"`
	Phone              string `json:"phone"`
	WhatsappNumber     string `json:"whatsapp_number"`
	Email              string `json:"email"`
	Website            string `json:"website"`
	CollectContactBack bool   `json:"collect_contact_back"`
}

// GetPublicCard — endpoint publik yang dituju QR code kartu kontak. 404
// kalau kreator belum mengaktifkan kartunya, supaya tidak bocor draft yang
// belum dipublikasikan.
func (h *BusinessCardHandler) GetPublicCard(c *gin.Context) {
	username := c.Param("username")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp publicBusinessCard
	resp.Username = username
	err := h.DB.QueryRow(ctx, `
		SELECT COALESCE(p.avatar_url, ''), bc.full_name, bc.job_title, bc.company, bc.phone, bc.whatsapp_number, bc.email, bc.website, bc.collect_contact_back
		FROM business_cards bc
		JOIN users u ON u.id = bc.user_id
		LEFT JOIN pages p ON p.user_id = u.id
		WHERE u.username = $1 AND bc.is_active = true
	`, username).Scan(&resp.AvatarURL, &resp.FullName, &resp.JobTitle, &resp.Company, &resp.Phone,
		&resp.WhatsappNumber, &resp.Email, &resp.Website, &resp.CollectContactBack)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "kartu kontak tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat kartu kontak"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

type submitCardContactRequest struct {
	Name           string `json:"name" binding:"max=200"`
	Email          string `json:"email"`
	WhatsappNumber string `json:"whatsapp_number"`
}

// SubmitCardContact — pengunjung membagikan kontaknya balik ke kreator
// setelah scan kartu. Menolak kalau kreator belum mengaktifkan toggle
// "terima kontak balik", dan kalau email & whatsapp_number keduanya kosong
// (nama saja tidak cukup untuk dihubungi kembali).
func (h *BusinessCardHandler) SubmitCardContact(c *gin.Context) {
	username := c.Param("username")

	var req submitCardContactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(strings.ToLower(req.Email))
	whatsapp := strings.TrimSpace(req.WhatsappNumber)
	if email == "" && whatsapp == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "isi email atau nomor WhatsApp"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var creatorUserID string
	var collectBack bool
	err := h.DB.QueryRow(ctx, `
		SELECT bc.user_id, bc.collect_contact_back
		FROM business_cards bc JOIN users u ON u.id = bc.user_id
		WHERE u.username = $1 AND bc.is_active = true
	`, username).Scan(&creatorUserID, &collectBack)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "kartu kontak tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat kartu kontak"})
		return
	}
	if !collectBack {
		c.JSON(http.StatusBadRequest, gin.H{"error": "kartu ini belum mengaktifkan penerimaan kontak balik"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO subscribers (creator_user_id, email, whatsapp_number, name, source)
		VALUES ($1, $2, $3, $4, 'business_card')
		ON CONFLICT (creator_user_id, email) WHERE email <> '' DO UPDATE SET
			whatsapp_number = CASE WHEN EXCLUDED.whatsapp_number <> '' THEN EXCLUDED.whatsapp_number ELSE subscribers.whatsapp_number END,
			name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE subscribers.name END
	`, creatorUserID, email, whatsapp, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan kontak"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "kontak berhasil dibagikan"})
}
