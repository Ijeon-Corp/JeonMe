package handlers

import (
	"context"
	"net/http"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/crypto"
)

// fbPixelIDPattern/gaMeasurementIDPattern -- validasi FORMAT ketat, bukan
// cuma panjang maksimum. Kedua nilai ini dikirim APA ADANYA ke browser
// pengunjung (publicAnalytics, page.go) dan disisipkan LANGSUNG ke dalam
// tag <script> inline halaman publik (fbq('init', '<pixel_id>')/gtag
// config) -- tanpa validasi format, kreator jahat bisa menaruh payload
// XSS di kolom ini (mis. Pixel ID diisi `');alert(document.cookie);//`)
// yang lantas jalan di browser SEMUA PENGUNJUNG halaman publiknya, bukan
// cuma akunnya sendiri. Pixel ID Facebook asli SELALU numerik murni,
// Measurement ID GA4 asli SELALU "G-" + alfanumerik -- pola ini cukup
// ketat untuk menutup celah itu sekaligus tetap menerima ID asli apa pun.
var fbPixelIDPattern = regexp.MustCompile(`^[0-9]{1,32}$`)
var gaMeasurementIDPattern = regexp.MustCompile(`^G-[A-Z0-9]{1,20}$`)

// AnalyticsSettingsHandler -- Modul Analitik Pihak Ketiga (permintaan
// langsung pengguna, 12 Agustus 2026, referensi tangkapan layar panel
// "Analytics" Linktree): Facebook Pixel ID + Conversions API Access
// Token, Google Analytics Measurement ID (GA4), toggle parameter UTM
// otomatis. TERPISAH dari AnalyticsHandler (analytics.go, ringkasan
// kunjungan/klik/produk) -- modul ini PENGATURAN integrasi pihak ketiga,
// bukan penyajian data analitik milik Jeonme sendiri.
//
// Fitur PREMIUM (ikon gembok di referensi Linktree) -- TAPI mengikuti
// pola hideWatermark yang sudah ada (page.go): pengaturan tetap BISA
// diisi/disimpan oleh akun gratis (supaya tidak hilang begitu upgrade),
// gerbang premium ditegakkan di TITIK PEMAKAIAN (skrip Pixel/gtag.js di
// halaman publik & pengiriman event Conversions API server-side,
// finishPublicPageResponse & analytics.go), BUKAN dengan memblokir form
// pengaturannya sendiri.
type AnalyticsSettingsHandler struct {
	DB            *pgxpool.Pool
	RDB           *redis.Client
	EncryptionKey []byte
}

func NewAnalyticsSettingsHandler(db *pgxpool.Pool, rdb *redis.Client, encryptionKey []byte) *AnalyticsSettingsHandler {
	return &AnalyticsSettingsHandler{DB: db, RDB: rdb, EncryptionKey: encryptionKey}
}

type analyticsSettingsResponse struct {
	FbPixelID        string `json:"fb_pixel_id"`
	FbAccessTokenSet bool   `json:"fb_access_token_set"`
	GaMeasurementID  string `json:"ga_measurement_id"`
	UtmEnabled       bool   `json:"utm_enabled"`
	IsPremium        bool   `json:"is_premium"`
}

// Get — belum-pernah-disimpan mengembalikan default kosong (bukan 404),
// pola sama seperti social_proof/lead_capture. fb_access_token TIDAK
// PERNAH dikembalikan utuh -- cuma penanda ada/tidaknya (fb_access_token_set),
// sama seperti account_number_masked di payout_methods (secret sekali
// masuk, tidak pernah bisa dibaca ulang dari klien).
func (h *AnalyticsSettingsHandler) Get(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp analyticsSettingsResponse
	var encryptedToken *string
	err := h.DB.QueryRow(ctx, `
		SELECT fb_pixel_id, fb_access_token_encrypted, ga_measurement_id, utm_enabled
		FROM analytics_settings WHERE user_id = $1
	`, userID).Scan(&resp.FbPixelID, &encryptedToken, &resp.GaMeasurementID, &resp.UtmEnabled)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pengaturan analitik"})
		return
	}
	resp.FbAccessTokenSet = encryptedToken != nil && *encryptedToken != ""
	resp.IsPremium = isPremiumUser(ctx, h.DB, userID)

	c.JSON(http.StatusOK, resp)
}

type upsertAnalyticsSettingsRequest struct {
	FbPixelID string `json:"fb_pixel_id" binding:"max=64"`
	// FbAccessToken -- pointer supaya BISA membedakan 3 niat: field tidak
	// dikirim sama sekali/nil (token tersimpan TIDAK disentuh -- kreator
	// cuma mengubah field lain), string kosong "" (kreator SENGAJA
	// menghapus token), string berisi (kreator memasukkan/mengganti
	// token). Pola sama seperti LayoutVariant *string di updatePageRequest.
	FbAccessToken   *string `json:"fb_access_token" binding:"omitempty,max=512"`
	GaMeasurementID string  `json:"ga_measurement_id" binding:"max=32"`
	UtmEnabled      bool    `json:"utm_enabled"`
}

func (h *AnalyticsSettingsHandler) Upsert(c *gin.Context) {
	var req upsertAnalyticsSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.FbPixelID != "" && !fbPixelIDPattern.MatchString(req.FbPixelID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pixel ID harus berupa angka saja"})
		return
	}
	if req.GaMeasurementID != "" && !gaMeasurementIDPattern.MatchString(req.GaMeasurementID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Google Measurement ID harus berformat G-XXXXXXXXXX"})
		return
	}

	userID := c.GetString("userID")

	var encryptedToken *string
	updateToken := req.FbAccessToken != nil
	if updateToken && *req.FbAccessToken != "" {
		enc, err := crypto.Encrypt(h.EncryptionKey, *req.FbAccessToken)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengenkripsi access token"})
			return
		}
		encryptedToken = &enc
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO analytics_settings (user_id, fb_pixel_id, fb_access_token_encrypted, ga_measurement_id, utm_enabled)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id) DO UPDATE SET
			fb_pixel_id = $2,
			fb_access_token_encrypted = CASE WHEN $6 THEN $3 ELSE analytics_settings.fb_access_token_encrypted END,
			ga_measurement_id = $4,
			utm_enabled = $5
	`, userID, req.FbPixelID, encryptedToken, req.GaMeasurementID, req.UtmEnabled, updateToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pengaturan analitik"})
		return
	}

	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusOK, gin.H{"message": "pengaturan analitik disimpan"})
}
