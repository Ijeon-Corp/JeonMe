package handlers

import (
	"context"
	"github.com/jeonme/api/internal/netguard"
	"github.com/jeonme/api/internal/storage"
	"io"
	"log"
	"net/http"
	"net/url"
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
	// Storage -- proxy avatar untuk komposer PNG kartu nama (lihat AvatarProxy).
	Storage *storage.Client
}

func NewBusinessCardHandler(db *pgxpool.Pool, store *storage.Client) *BusinessCardHandler {
	return &BusinessCardHandler{DB: db, Storage: store}
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
	// Kartu Nama v2 (migrasi 000087): tema + data lengkap kartu nama.
	CardTheme string `json:"card_theme"`
	Tagline   string `json:"tagline"`
	Address   string `json:"address"`
	Instagram string `json:"instagram"`
	Tiktok    string `json:"tiktok"`
	Linkedin  string `json:"linkedin"`
}

// GetCard — dipakai halaman pengaturan dashboard. Belum pernah disimpan
// mengembalikan state kosong/nonaktif, BUKAN 404.
func (h *BusinessCardHandler) GetCard(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp businessCardResponse
	err := h.DB.QueryRow(ctx, `
		SELECT is_active, full_name, job_title, company, phone, whatsapp_number, email, website, collect_contact_back,
		       card_theme, tagline, address, instagram, tiktok, linkedin
		FROM business_cards WHERE user_id = $1
	`, userID).Scan(&resp.IsActive, &resp.FullName, &resp.JobTitle, &resp.Company, &resp.Phone,
		&resp.WhatsappNumber, &resp.Email, &resp.Website, &resp.CollectContactBack,
		&resp.CardTheme, &resp.Tagline, &resp.Address, &resp.Instagram, &resp.Tiktok, &resp.Linkedin)
	if err == pgx.ErrNoRows {
		resp.CardTheme = "lavender"
	}
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
	CardTheme          string `json:"card_theme" binding:"max=20"`
	Tagline            string `json:"tagline" binding:"max=200"`
	Address            string `json:"address" binding:"max=300"`
	Instagram          string `json:"instagram" binding:"max=100"`
	Tiktok             string `json:"tiktok" binding:"max=100"`
	Linkedin           string `json:"linkedin" binding:"max=200"`
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
		INSERT INTO business_cards (user_id, is_active, full_name, job_title, company, phone, whatsapp_number, email, website, collect_contact_back,
		                            card_theme, tagline, address, instagram, tiktok, linkedin, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
		ON CONFLICT (user_id) DO UPDATE SET
			is_active = EXCLUDED.is_active, full_name = EXCLUDED.full_name, job_title = EXCLUDED.job_title,
			company = EXCLUDED.company, phone = EXCLUDED.phone, whatsapp_number = EXCLUDED.whatsapp_number,
			email = EXCLUDED.email, website = EXCLUDED.website, collect_contact_back = EXCLUDED.collect_contact_back,
			card_theme = EXCLUDED.card_theme, tagline = EXCLUDED.tagline, address = EXCLUDED.address,
			instagram = EXCLUDED.instagram, tiktok = EXCLUDED.tiktok, linkedin = EXCLUDED.linkedin,
			updated_at = now()
	`, userID, req.IsActive, strings.TrimSpace(req.FullName), strings.TrimSpace(req.JobTitle), strings.TrimSpace(req.Company),
		strings.TrimSpace(req.Phone), strings.TrimSpace(req.WhatsappNumber), strings.TrimSpace(strings.ToLower(req.Email)),
		strings.TrimSpace(req.Website), req.CollectContactBack,
		normalizeCardTheme(req.CardTheme), strings.TrimSpace(req.Tagline), strings.TrimSpace(req.Address),
		normalizeHandle(req.Instagram), normalizeHandle(req.Tiktok), strings.TrimSpace(req.Linkedin)); err != nil {
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
	// Kartu Nama v2 (migrasi 000087): tema + data lengkap kartu nama.
	CardTheme string `json:"card_theme"`
	Tagline   string `json:"tagline"`
	Address   string `json:"address"`
	Instagram string `json:"instagram"`
	Tiktok    string `json:"tiktok"`
	Linkedin  string `json:"linkedin"`
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
		SELECT COALESCE(p.avatar_url, ''), bc.full_name, bc.job_title, bc.company, bc.phone, bc.whatsapp_number, bc.email, bc.website, bc.collect_contact_back,
		       bc.card_theme, bc.tagline, bc.address, bc.instagram, bc.tiktok, bc.linkedin
		FROM business_cards bc
		JOIN users u ON u.id = bc.user_id
		LEFT JOIN pages p ON p.user_id = u.id AND p.is_primary = true
		WHERE u.username = $1 AND bc.is_active = true
	`, username).Scan(&resp.AvatarURL, &resp.FullName, &resp.JobTitle, &resp.Company, &resp.Phone,
		&resp.WhatsappNumber, &resp.Email, &resp.Website, &resp.CollectContactBack,
		&resp.CardTheme, &resp.Tagline, &resp.Address, &resp.Instagram, &resp.Tiktok, &resp.Linkedin)
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

// normalizeCardTheme -- tema kartu harus salah satu palet homepage; nilai
// lain jatuh ke lavender (bukan 400) supaya klien lama tanpa field ini tetap
// bisa menyimpan. Murni, diuji unit.
func normalizeCardTheme(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "lime":
		return "lime"
	case "pink":
		return "pink"
	case "blue":
		return "blue"
	case "ink":
		return "ink"
	default:
		return "lavender"
	}
}

// normalizeHandle -- "@akun", "instagram.com/akun", "https://www.tiktok.com/@akun"
// -> "akun". Disimpan tanpa @ dan tanpa domain supaya kartu bisa menampilkan
// dan membangun tautan secara konsisten. Murni, diuji unit.
func normalizeHandle(raw string) string {
	v := strings.TrimSpace(raw)
	if i := strings.LastIndex(v, "/"); i >= 0 {
		v = v[i+1:]
	}
	v = strings.TrimPrefix(v, "@")
	v = strings.TrimSpace(v)
	if len(v) > 100 {
		v = v[:100]
	}
	return v
}

// AvatarProxy -- GET /cards/:username/avatar. Mengalirkan foto profil kreator
// dari origin API sendiri dengan header CORS.
//
// KENAPA (laporan pengguna, 3 September 2026: "ketika di-download PNG
// fotonya tidak ada"): komposer PNG kartu nama menggambar foto ke <canvas>.
// Browser hanya mengizinkan gambar lintas-origin masuk ke canvas kalau
// server-nya mengirim header CORS -- bucket storage tidak, dan avatar dari
// login Google bahkan URL eksternal (googleusercontent). Tanpa itu gambar
// gagal dimuat dan kartu jatuh ke inisial. Lewat proxy ini foto datang dari
// origin yang sama (dan tetap diberi Access-Control-Allow-Origin untuk
// deployment yang memisahkan origin API).
//
// Sumber: kunci di bucket sendiri dibaca lewat storage client (bukan lewat
// URL publik); URL eksternal (https) diambil lewat netguard -- satu-satunya
// jalur outbound yang diizinkan di codebase ini (proteksi SSRF). Ukuran
// dibatasi 5 MB, hanya jenis image/* yang diteruskan.
func (h *BusinessCardHandler) AvatarProxy(c *gin.Context) {
	username := c.Param("username")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()

	var avatarURL string
	if err := h.DB.QueryRow(ctx, `
		SELECT COALESCE(p.avatar_url, '')
		FROM business_cards bc
		JOIN users u ON u.id = bc.user_id
		LEFT JOIN pages p ON p.user_id = u.id AND p.is_primary = true
		WHERE u.username = $1 AND bc.is_active = true
	`, username).Scan(&avatarURL); err != nil || avatarURL == "" {
		c.Status(http.StatusNotFound)
		return
	}

	const maxBytes = 5 << 20
	var data []byte
	var contentType string
	if key, ok := storageKeyFromURL(h.Storage, avatarURL); ok {
		b, err := h.Storage.Download(ctx, key)
		if err != nil || len(b) == 0 || len(b) > maxBytes {
			log.Printf("business-card: avatar proxy gagal membaca kunci %q untuk %s: %v (len=%d)", key, username, err, len(b))
			c.Status(http.StatusNotFound)
			return
		}
		data = b
	} else {
		if err := netguard.ValidateOutboundURL(avatarURL); err != nil || !strings.HasPrefix(avatarURL, "https://") {
			log.Printf("business-card: avatar proxy menolak URL eksternal %q untuk %s: %v", avatarURL, username, err)
			c.Status(http.StatusNotFound)
			return
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, avatarURL, nil)
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		resp, err := netguard.NewOutboundClient(6 * time.Second).Do(req)
		if err != nil {
			log.Printf("business-card: avatar proxy gagal mengambil %q untuk %s: %v", avatarURL, username, err)
			c.Status(http.StatusNotFound)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			c.Status(http.StatusNotFound)
			return
		}
		b, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
		if err != nil || len(b) == 0 || len(b) > maxBytes {
			c.Status(http.StatusNotFound)
			return
		}
		data = b
		contentType = resp.Header.Get("Content-Type")
	}
	if contentType == "" || !strings.HasPrefix(contentType, "image/") {
		contentType = http.DetectContentType(data)
	}
	if !strings.HasPrefix(contentType, "image/") {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Cache-Control", "public, max-age=300")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, contentType, data)
}

// storageKeyFromURL -- kunci objek dari avatar_url. avatar_url dibangun
// handler upload sebagai PublicURL(key) + "?v=<nanodetik>" (cache-buster,
// lihat page.go), jadi query string HARUS dibuang sebelum jadi kunci --
// inilah penyebab foto tetap hilang di PNG setelah proxy pertama (laporan
// pengguna kedua, 3 September 2026): kunci "avatars/x.webp?v=123" tidak
// pernah ada di bucket. Murni, diuji unit.
func storageKeyFromURL(store *storage.Client, avatarURL string) (string, bool) {
	if store == nil {
		return "", false
	}
	u, err := url.Parse(strings.TrimSpace(avatarURL))
	if err != nil {
		return "", false
	}
	u.RawQuery = ""
	u.Fragment = ""
	clean := u.String()
	prefix := store.PublicURL("")
	if !strings.HasPrefix(clean, prefix) {
		return "", false
	}
	key := strings.TrimPrefix(clean, prefix)
	if key == "" {
		return "", false
	}
	return key, true
}
