package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/audit"
)

// usernameChangeCooldown -- permintaan langsung pengguna, 19 Agustus 2026:
// "batasi hanya bisa ganti 1x per 30 hari". Beda dari window redirect 90
// hari yang SUDAH ada (username_history.changed_at dipakai checkUsernameAvailable
// utk cegah squatting & ResolveUsernameRedirect utk alihkan pengunjung) --
// itu soal berapa lama nama LAMA tetap dialihkan/direservasi, ini soal
// SESERING APA pemilik akun boleh memulai perubahan baru. Kolom yang sama
// (username_history.changed_at) dipakai ulang untuk keduanya, cuma
// jendela waktunya beda.
const usernameChangeCooldown = 30 * 24 * time.Hour

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
	// UsernameChangeAvailableAt -- permintaan langsung pengguna, 19 Agustus
	// 2026 (cooldown 30 hari). null berarti boleh ganti sekarang juga
	// (belum pernah ganti sama sekali, atau cooldown sebelumnya sudah
	// lewat) -- diekspos di GET supaya frontend bisa menonaktifkan/memberi
	// tahu batas waktu SEBELUM kreator mengetik & submit, bukan baru
	// ketahuan lewat error 429 setelah mencoba.
	UsernameChangeAvailableAt *string `json:"username_change_available_at"`
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

	var lastChangedAt *time.Time
	_ = h.DB.QueryRow(ctx, `SELECT MAX(changed_at) FROM username_history WHERE user_id = $1`, userID).Scan(&lastChangedAt)
	if lastChangedAt != nil {
		if availableAt := lastChangedAt.Add(usernameChangeCooldown); time.Now().Before(availableAt) {
			s := availableAt.Format(time.RFC3339)
			resp.UsernameChangeAvailableAt = &s
		}
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
			// Cooldown 30 hari (permintaan langsung pengguna, 19 Agustus
			// 2026) -- dicek DI DALAM transaksi yang sama sebelum
			// checkUsernameAvailable, supaya penolakannya jelas ("baru bisa
			// ganti lagi tanggal X") alih-alih tercampur dengan pesan
			// "username sudah dipakai" yang beda alasannya sama sekali.
			var lastChangedAt *time.Time
			if err := tx.QueryRow(ctx, `SELECT MAX(changed_at) FROM username_history WHERE user_id = $1`, userID).Scan(&lastChangedAt); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa riwayat username"})
				return
			}
			if lastChangedAt != nil {
				if availableAt := lastChangedAt.Add(usernameChangeCooldown); time.Now().Before(availableAt) {
					c.JSON(http.StatusTooManyRequests, gin.H{
						"error": fmt.Sprintf("username cuma bisa diganti sekali per 30 hari -- coba lagi mulai %s", availableAt.Format("2 January 2006")),
					})
					return
				}
			}
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

	// Modul Halaman Produk: Toko pertama (auto) pakai slug = username --
	// kalau username-nya baru saja diganti, ikutkan slug Toko supaya
	// tetap konsisten (jeon.id/p/{username baru}). Cek "slug = username
	// LAMA" sebagai penanda "ini memang Toko auto", bukan Toko ke-2..5
	// Premium yang sengaja dikustomisasi slugnya sendiri -- best-effort,
	// gagal diam-diam kalau slug baru kebetulan sudah dipakai halaman lain.
	if usernameChanged {
		var newSlug string
		if err := h.DB.QueryRow(ctx, `
			UPDATE pages SET slug = $1
			WHERE user_id = $2 AND page_type = 'produk' AND slug = $3
			RETURNING slug
		`, newUsername, userID, oldUsername).Scan(&newSlug); err == nil && h.RDB != nil {
			h.RDB.Del(ctx, "page-slug:"+oldUsername)
			h.RDB.Del(ctx, "page-slug:"+newUsername)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "profil diperbarui", "username": newUsername})
}
