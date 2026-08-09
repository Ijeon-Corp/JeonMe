package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// OnboardingHandler -- permintaan langsung pengguna: "buatkan user
// onboarding... setiap user yang baru pertama kali login". Bentuknya
// halaman/menu Tutorial STATIS (dipilih pengguna lewat AskUserQuestion,
// bukan tur interaktif spotlight/tooltip) + satu pita pengingat yang
// tampil sekali sampai kreator membubuhkan dismiss -- lihat
// OnboardingBanner.tsx (pola SAMA seperti AccountDeletionBanner).
//
// users.onboarding_dismissed_at NULL berarti "belum pernah menutup pita
// ini" -- SENGAJA bukan "true untuk user baru saja", supaya kreator LAMA
// (didaftarkan sebelum fitur ini ada) juga melihatnya sekali, bukan
// kehilangan akses ke Tutorial selamanya hanya karena akunnya lebih tua
// dari kolom ini.
type OnboardingHandler struct {
	DB *pgxpool.Pool
}

func NewOnboardingHandler(db *pgxpool.Pool) *OnboardingHandler {
	return &OnboardingHandler{DB: db}
}

// checklistItem -- Gap #5 benchmark kompetitif (permintaan langsung
// pengguna, 9 Agustus 2026): pita statis sebelumnya cuma 1 link ke
// Tutorial, tidak ada arahan actionable/progres jelas -- praktik terbaik
// onboarding 2026 pakai checklist dengan progress bar ("speed to first
// value" adalah prediktor kuat retensi minggu pertama, lihat riset
// benchmark). Key STABIL (dipakai frontend sebagai React key, bukan cuma
// tampilan) -- jangan diganti tanpa alasan kuat.
type checklistItem struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Done  bool   `json:"done"`
	Href  string `json:"href"`
}

func (h *OnboardingHandler) GetStatus(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var dismissed bool
	if err := h.DB.QueryRow(ctx, `
		SELECT onboarding_dismissed_at IS NOT NULL FROM users WHERE id = $1
	`, userID).Scan(&dismissed); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat status onboarding"})
		return
	}

	var pageID string
	var bio, avatarURL string
	var isPublished bool
	if err := h.DB.QueryRow(ctx, `
		SELECT id, bio, avatar_url, is_published FROM pages WHERE user_id = $1 AND is_primary = true
	`, userID).Scan(&pageID, &bio, &avatarURL, &isPublished); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat status onboarding"})
		return
	}

	var hasContent bool
	_ = h.DB.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM links WHERE page_id = $1)
			OR EXISTS(SELECT 1 FROM products WHERE user_id = $2 AND is_donation = false)
	`, pageID, userID).Scan(&hasContent)

	var hasVerifiedPayment bool
	_ = h.DB.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM payout_methods WHERE user_id = $1 AND verified = true)
	`, userID).Scan(&hasVerifiedPayment)

	checklist := []checklistItem{
		{Key: "profile", Label: "Lengkapi foto profil & bio", Done: bio != "" && avatarURL != "", Href: "/dashboard/design/header"},
		{Key: "publish", Label: "Terbitkan halaman publik", Done: isPublished, Href: "/dashboard/design"},
		{Key: "content", Label: "Tambah tautan atau produk pertama", Done: hasContent, Href: "/dashboard/links"},
		{Key: "payment", Label: "Hubungkan & verifikasi metode pembayaran", Done: hasVerifiedPayment, Href: "/dashboard/settings/payment"},
	}
	doneCount := 0
	for _, item := range checklist {
		if item.Done {
			doneCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"dismissed":  dismissed,
		"checklist":  checklist,
		"done_count": doneCount,
		"total":      len(checklist),
	})
}

func (h *OnboardingHandler) Dismiss(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `
		UPDATE users SET onboarding_dismissed_at = now() WHERE id = $1 AND onboarding_dismissed_at IS NULL
	`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan status onboarding"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "onboarding ditutup"})
}
