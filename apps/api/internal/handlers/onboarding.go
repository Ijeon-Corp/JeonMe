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

	c.JSON(http.StatusOK, gin.H{"dismissed": dismissed})
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
