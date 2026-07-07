package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PageHandler mengimplementasikan REQ-F-201 (halaman publik) dan
// menyediakan kerangka untuk REQ-F-202..206 (CRUD link, tema, dsb.)
// yang perlu dilengkapi tim sesuai kebutuhan dashboard.
type PageHandler struct {
	DB *pgxpool.Pool
}

func NewPageHandler(db *pgxpool.Pool) *PageHandler {
	return &PageHandler{DB: db}
}

type publicPageResponse struct {
	Username  string       `json:"username"`
	Bio       string       `json:"bio"`
	AvatarURL string       `json:"avatar_url"`
	Theme     string       `json:"theme"`
	Links     []publicLink `json:"links"`
	Products  []publicItem `json:"products"`
}

type publicLink struct {
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
// Endpoint ini adalah kandidat utama untuk caching Redis (lihat TDD Bagian 3.1)
// karena menjadi titik trafik tertinggi di seluruh sistem.
func (h *PageHandler) GetPublicPage(c *gin.Context) {
	username := c.Param("username")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// TODO: cek cache Redis dulu sebelum query database (key: "page:"+username).
	var resp publicPageResponse
	var userID string

	err := h.DB.QueryRow(ctx, `
		SELECT u.id, u.username, p.bio, p.avatar_url, p.theme
		FROM users u
		JOIN pages p ON p.user_id = u.id
		WHERE u.username = $1 AND p.is_published = true
	`, username).Scan(&userID, &resp.Username, &resp.Bio, &resp.AvatarURL, &resp.Theme)

	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT title, url FROM links
		WHERE page_id = (SELECT id FROM pages WHERE user_id = $1)
		AND is_active = true
		ORDER BY position ASC
	`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var l publicLink
			if err := rows.Scan(&l.Title, &l.URL); err == nil {
				resp.Links = append(resp.Links, l)
			}
		}
	}

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

	c.JSON(http.StatusOK, resp)
}
