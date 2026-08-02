package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/audit"
)

// SettingsProfileHandler mengimplementasikan Modul Settings §2 (Profile &
// Account). display_name/bio/avatar_url SUDAH ada di tabel pages (dikelola
// PageHandler.UpdateMyPage/UploadAvatar sejak awal) -- handler ini SENGAJA
// TIDAK menduplikasi kolom itu di users, cuma menambahkan yang belum ada:
// ganti username (identitas akun, belum pernah bisa diganti lewat API mana
// pun sebelum ini) + category.
type SettingsProfileHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
}

func NewSettingsProfileHandler(db *pgxpool.Pool, rdb *redis.Client) *SettingsProfileHandler {
	return &SettingsProfileHandler{DB: db, RDB: rdb}
}

type settingsProfileResponse struct {
	Username    string `json:"username"`
	Category    string `json:"category"`
	DisplayName string `json:"display_name"`
	Bio         string `json:"bio"`
	AvatarURL   string `json:"avatar_url"`
}

func (h *SettingsProfileHandler) Get(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp settingsProfileResponse
	err := h.DB.QueryRow(ctx, `
		SELECT u.username, u.category, p.display_name, p.bio, p.avatar_url
		FROM users u
		JOIN pages p ON p.user_id = u.id AND p.is_primary = true
		WHERE u.id = $1
	`, userID).Scan(&resp.Username, &resp.Category, &resp.DisplayName, &resp.Bio, &resp.AvatarURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat profil"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

type updateSettingsProfileRequest struct {
	Username    *string `json:"username"`
	Category    *string `json:"category"`
	DisplayName *string `json:"display_name"`
	Bio         *string `json:"bio"`
}

// Update — PATCH sebagian (semua field opsional, cuma yang dikirim yang
// diubah). Ganti username mencatat username_history + menginvalidasi cache
// halaman publik lama & baru, supaya request berikutnya ke username lama
// jatuh ke PageHandler.ResolveUsernameRedirect (bukan cache basi 200 OK
// atau 404 keras sebelum redirect sempat kepasang).
func (h *SettingsProfileHandler) Update(c *gin.Context) {
	userID := c.GetString("userID")

	var req updateSettingsProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Bio != nil && len(*req.Bio) > 160 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bio maksimal 160 karakter"})
		return
	}
	if req.Category != nil && len(*req.Category) > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "kategori maksimal 50 karakter"})
		return
	}
	if req.DisplayName != nil && len(*req.DisplayName) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nama tampilan maksimal 100 karakter"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var oldUsername string
	if err := tx.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&oldUsername); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}

	newUsername := oldUsername
	usernameChanged := false
	if req.Username != nil {
		trimmed := strings.TrimSpace(*req.Username)
		if trimmed != oldUsername {
			if ok, msg := checkUsernameAvailable(ctx, tx, trimmed, userID); !ok {
				c.JSON(http.StatusConflict, gin.H{"error": msg})
				return
			}
			newUsername = trimmed
			usernameChanged = true
		}
	}

	if usernameChanged {
		if _, err := tx.Exec(ctx, `UPDATE users SET username = $1 WHERE id = $2`, newUsername, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui username"})
			return
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO username_history (user_id, old_username) VALUES ($1, $2)
		`, userID, oldUsername); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat riwayat username"})
			return
		}
	}

	if req.Category != nil {
		if _, err := tx.Exec(ctx, `UPDATE users SET category = $1 WHERE id = $2`, *req.Category, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui kategori"})
			return
		}
	}

	if req.DisplayName != nil || req.Bio != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE pages SET
				display_name = COALESCE($1, display_name),
				bio = COALESCE($2, bio)
			WHERE user_id = $3 AND is_primary = true
		`, req.DisplayName, req.Bio, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui profil"})
			return
		}
	}

	var auditMeta []byte
	if usernameChanged {
		auditMeta, _ = json.Marshal(map[string]string{"old_username": oldUsername, "new_username": newUsername})
	}
	if err := audit.Log(ctx, tx, userID, "profile.updated", "user", userID, auditMeta); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	if usernameChanged && h.RDB != nil {
		h.RDB.Del(ctx, "page:"+oldUsername)
		h.RDB.Del(ctx, "page:"+newUsername)
	}

	c.JSON(http.StatusOK, gin.H{"message": "profil diperbarui", "username": newUsername})
}
