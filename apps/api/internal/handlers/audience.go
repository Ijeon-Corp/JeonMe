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

// AudienceHandler mengimplementasikan No.73 (Sprint 8): blok pengumpulan
// email/nomor WhatsApp pengunjung + Manajer Audiens. Diadaptasi dari
// Audience Manager Linktree/Lynk.id -- versi awal menyentralisasi DUA
// sumber (form pengumpulan lead & pembeli produk) dalam satu daftar, TANPA
// fitur "subscribe-lock" (mengunci tautan di balik form) -- itu fitur
// terpisah yang lebih besar, dicatat sebagai pekerjaan lanjutan kalau
// tervalidasi.
type AudienceHandler struct {
	DB *pgxpool.Pool
}

func NewAudienceHandler(db *pgxpool.Pool) *AudienceHandler {
	return &AudienceHandler{DB: db}
}

type leadCaptureSettingsResponse struct {
	IsActive        bool   `json:"is_active"`
	Title           string `json:"title"`
	CollectEmail    bool   `json:"collect_email"`
	CollectWhatsapp bool   `json:"collect_whatsapp"`
}

// GetLeadCaptureSettings — dipakai halaman pengaturan dashboard. Baris
// lead_capture_settings baru dibuat saat pertama kali disimpan (Upsert),
// jadi belum-pernah-disimpan mengembalikan default nonaktif, BUKAN 404.
func (h *AudienceHandler) GetLeadCaptureSettings(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	resp := leadCaptureSettingsResponse{Title: "Dapatkan info terbaru dariku", CollectEmail: true}
	err := h.DB.QueryRow(ctx, `
		SELECT is_active, title, collect_email, collect_whatsapp FROM lead_capture_settings WHERE user_id = $1
	`, userID).Scan(&resp.IsActive, &resp.Title, &resp.CollectEmail, &resp.CollectWhatsapp)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pengaturan audiens"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

type upsertLeadCaptureRequest struct {
	IsActive        bool   `json:"is_active"`
	Title           string `json:"title" binding:"max=200"`
	CollectEmail    bool   `json:"collect_email"`
	CollectWhatsapp bool   `json:"collect_whatsapp"`
}

// UpsertLeadCaptureSettings — mengaktifkan/menonaktifkan blok pengumpulan
// lead & mengatur field mana yang diminta dari pengunjung.
func (h *AudienceHandler) UpsertLeadCaptureSettings(c *gin.Context) {
	var req upsertLeadCaptureRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.IsActive && strings.TrimSpace(req.Title) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "judul blok wajib diisi"})
		return
	}
	if req.IsActive && !req.CollectEmail && !req.CollectWhatsapp {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pilih minimal satu jenis data yang dikumpulkan"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO lead_capture_settings (user_id, is_active, title, collect_email, collect_whatsapp)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id) DO UPDATE SET
			is_active = EXCLUDED.is_active, title = EXCLUDED.title,
			collect_email = EXCLUDED.collect_email, collect_whatsapp = EXCLUDED.collect_whatsapp
	`, userID, req.IsActive, strings.TrimSpace(req.Title), req.CollectEmail, req.CollectWhatsapp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pengaturan audiens"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "pengaturan audiens disimpan"})
}

type subscribeLeadRequest struct {
	Username       string `json:"username" binding:"required"`
	Email          string `json:"email"`
	WhatsappNumber string `json:"whatsapp_number"`
}

// SubscribeLead — endpoint PUBLIK (dipanggil dari blok pengumpulan lead di
// halaman publik). Menolak kalau kreator belum mengaktifkan blok ini
// (mencegah pengiriman ke kreator yang tidak minta), dan menolak kalau
// keduanya email & whatsapp_number kosong.
func (h *AudienceHandler) SubscribeLead(c *gin.Context) {
	var req subscribeLeadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	whatsapp := strings.TrimSpace(req.WhatsappNumber)
	if email == "" && whatsapp == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "isi email atau nomor WhatsApp"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var creatorUserID string
	var isActive bool
	err := h.DB.QueryRow(ctx, `
		SELECT u.id, COALESCE(lcs.is_active, false)
		FROM users u LEFT JOIN lead_capture_settings lcs ON lcs.user_id = u.id
		WHERE u.username = $1
	`, req.Username).Scan(&creatorUserID, &isActive)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}
	if !isActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blok pengumpulan belum aktif"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO subscribers (creator_user_id, email, whatsapp_number)
		VALUES ($1, $2, $3)
		ON CONFLICT (creator_user_id, email) WHERE email <> '' DO UPDATE SET
			whatsapp_number = CASE WHEN EXCLUDED.whatsapp_number <> '' THEN EXCLUDED.whatsapp_number ELSE subscribers.whatsapp_number END
	`, creatorUserID, email, whatsapp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "berhasil mendaftar"})
}

type audienceContact struct {
	Email          string   `json:"email"`
	WhatsappNumber string   `json:"whatsapp_number"`
	Sources        []string `json:"sources"`
	JoinedAt       string   `json:"joined_at"`
}

// GetAudience — Manajer Audiens: menyentralisasi subscriber (dari form
// pengumpulan lead) dan pembeli (dari orders yang lunas) dalam SATU daftar,
// digabung lewat email supaya orang yang sama tidak muncul dua baris kalau
// dia subscribe DAN pernah membeli. Diekspor ke CSV di sisi frontend
// (tidak ada endpoint CSV terpisah -- daftar ini sudah cukup kecil untuk
// diubah jadi CSV langsung di browser).
func (h *AudienceHandler) GetAudience(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	byEmail := map[string]*audienceContact{}
	order := []*audienceContact{}

	subRows, err := h.DB.Query(ctx, `
		SELECT email, whatsapp_number, created_at FROM subscribers WHERE creator_user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat subscriber"})
		return
	}
	for subRows.Next() {
		var email, whatsapp string
		var joinedAt time.Time
		if err := subRows.Scan(&email, &whatsapp, &joinedAt); err != nil {
			continue
		}
		item := &audienceContact{Email: email, WhatsappNumber: whatsapp, Sources: []string{"subscriber"}, JoinedAt: joinedAt.Format(time.RFC3339)}
		order = append(order, item)
		if email != "" {
			byEmail[email] = item
		}
	}
	subRows.Close()

	buyerRows, err := h.DB.Query(ctx, `
		SELECT o.buyer_email, MIN(o.created_at) FROM orders o
		JOIN products p ON p.id = o.product_id
		WHERE p.user_id = $1 AND o.status = 'paid'
		GROUP BY o.buyer_email
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pembeli"})
		return
	}
	for buyerRows.Next() {
		var email string
		var joinedAt time.Time
		if err := buyerRows.Scan(&email, &joinedAt); err != nil {
			continue
		}
		if existing, ok := byEmail[email]; ok {
			existing.Sources = append(existing.Sources, "buyer")
			continue
		}
		item := &audienceContact{Email: email, Sources: []string{"buyer"}, JoinedAt: joinedAt.Format(time.RFC3339)}
		order = append(order, item)
		byEmail[email] = item
	}
	buyerRows.Close()

	contacts := make([]audienceContact, 0, len(order))
	for _, it := range order {
		contacts = append(contacts, *it)
	}

	c.JSON(http.StatusOK, contacts)
}
