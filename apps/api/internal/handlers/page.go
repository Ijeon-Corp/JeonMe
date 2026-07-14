package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// PageHandler mengimplementasikan REQ-F-201 (halaman publik) dan
// REQ-F-204 (ganti tema & bio). CRUD tautan ada di LinksHandler.
type PageHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
}

func NewPageHandler(db *pgxpool.Pool, rdb *redis.Client) *PageHandler {
	return &PageHandler{DB: db, RDB: rdb}
}

// publicPageCacheTTL sengaja pendek (bukan invalidate-on-write untuk setiap
// mutasi tautan/produk) supaya implementasinya sederhana tapi staleness tetap
// terbatas -- cukup untuk endpoint baca-berat seperti ini (NF-01/02).
const publicPageCacheTTL = 30 * time.Second

type publicPageResponse struct {
	ID        string       `json:"id"`
	Username  string       `json:"username"`
	Bio       string       `json:"bio"`
	AvatarURL string       `json:"avatar_url"`
	Theme     string       `json:"theme"`
	Links     []publicLink `json:"links"`
	Products  []publicItem `json:"products"`
}

type publicLink struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	URL   string `json:"url"`
}

type publicItem struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	PriceIDR   int64  `json:"price_idr"`
	CoverImage string `json:"cover_image_url"`
}

// GetPublicPage — REQ-F-201: diakses tanpa login di jeonme.com/{username}.
// Endpoint trafik tertinggi di seluruh sistem, jadi dicek dulu di cache Redis
// (NF-01/02) sebelum menyentuh database.
func (h *PageHandler) GetPublicPage(c *gin.Context) {
	username := c.Param("username")
	cacheKey := "page:" + username

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if h.RDB != nil {
		if cached, err := h.RDB.Get(ctx, cacheKey).Result(); err == nil {
			var resp publicPageResponse
			if json.Unmarshal([]byte(cached), &resp) == nil {
				c.Header("X-Cache", "HIT")
				c.JSON(http.StatusOK, resp)
				return
			}
		}
	}

	var resp publicPageResponse
	var userID string

	err := h.DB.QueryRow(ctx, `
		SELECT u.id, p.id, u.username, p.bio, p.avatar_url, p.theme
		FROM users u
		JOIN pages p ON p.user_id = u.id
		WHERE u.username = $1 AND p.is_published = true
	`, username).Scan(&userID, &resp.ID, &resp.Username, &resp.Bio, &resp.AvatarURL, &resp.Theme)

	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}

	resp.Links = []publicLink{}
	rows, err := h.DB.Query(ctx, `
		SELECT id, title, url FROM links
		WHERE page_id = (SELECT id FROM pages WHERE user_id = $1)
		AND is_active = true
		ORDER BY position ASC
	`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var l publicLink
			if err := rows.Scan(&l.ID, &l.Title, &l.URL); err == nil {
				resp.Links = append(resp.Links, l)
			}
		}
	}

	resp.Products = []publicItem{}
	productRows, err := h.DB.Query(ctx, `
		SELECT id, name, price_idr, cover_image_url FROM products
		WHERE user_id = $1 AND is_active = true
	`, userID)
	if err == nil {
		defer productRows.Close()
		for productRows.Next() {
			var p publicItem
			if err := productRows.Scan(&p.ID, &p.Name, &p.PriceIDR, &p.CoverImage); err == nil {
				resp.Products = append(resp.Products, p)
			}
		}
	}

	if h.RDB != nil {
		if encoded, err := json.Marshal(resp); err == nil {
			h.RDB.Set(ctx, cacheKey, encoded, publicPageCacheTTL)
		}
	}

	c.Header("X-Cache", "MISS")
	c.JSON(http.StatusOK, resp)
}

type myPageResponse struct {
	Username    string `json:"username"`
	Bio         string `json:"bio"`
	AvatarURL   string `json:"avatar_url"`
	Theme       string `json:"theme"`
	IsPublished bool   `json:"is_published"`
}

// GetMyPage — dipakai dashboard untuk memuat pengaturan halaman milik kreator
// yang sedang login (tema, bio, status publish).
func (h *PageHandler) GetMyPage(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp myPageResponse
	err := h.DB.QueryRow(ctx, `
		SELECT u.username, p.bio, p.avatar_url, p.theme, p.is_published
		FROM pages p JOIN users u ON u.id = p.user_id
		WHERE p.user_id = $1
	`, userID).Scan(&resp.Username, &resp.Bio, &resp.AvatarURL, &resp.Theme, &resp.IsPublished)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// availableThemes — preset tema (REQ-F-204). Belum ada builder tema bebas,
// preset dianggap cukup untuk MVP.
var availableThemes = map[string]bool{
	"default": true, "midnight": true, "sunrise": true, "forest": true, "minimal": true,
}

type updatePageRequest struct {
	Theme       *string `json:"theme"`
	Bio         *string `json:"bio" binding:"omitempty,max=160"`
	IsPublished *bool   `json:"is_published"`
}

// UpdateMyPage — REQ-F-204 (ganti tema/bio) & penerbitan halaman (is_published).
func (h *PageHandler) UpdateMyPage(c *gin.Context) {
	var req updatePageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Theme != nil && !availableThemes[*req.Theme] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tema tidak dikenal"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var username string
	_, err := h.DB.Exec(ctx, `
		UPDATE pages SET
			theme = COALESCE($1, theme),
			bio = COALESCE($2, bio),
			is_published = COALESCE($3, is_published)
		WHERE user_id = $4
	`, req.Theme, req.Bio, req.IsPublished, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui halaman"})
		return
	}

	if h.RDB != nil {
		if scanErr := h.DB.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); scanErr == nil {
			h.RDB.Del(ctx, "page:"+username)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "halaman diperbarui"})
}
