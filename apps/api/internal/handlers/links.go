package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LinksHandler mengimplementasikan CRUD tautan (REQ-F-202) dan
// nonaktifkan-sementara-tanpa-hapus (REQ-F-203).
type LinksHandler struct {
	DB *pgxpool.Pool
}

func NewLinksHandler(db *pgxpool.Pool) *LinksHandler {
	return &LinksHandler{DB: db}
}

type linkItem struct {
	ID       string     `json:"id"`
	Title    string     `json:"title"`
	URL      string     `json:"url"`
	Position int        `json:"position"`
	IsActive bool       `json:"is_active"`
	StartsAt *time.Time `json:"starts_at"`
	EndsAt   *time.Time `json:"ends_at"`
}

// List mengembalikan seluruh tautan milik kreator yang sedang login, urut posisi.
func (h *LinksHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT l.id, l.title, l.url, l.position, l.is_active, l.starts_at, l.ends_at
		FROM links l
		JOIN pages p ON p.id = l.page_id
		WHERE p.user_id = $1
		ORDER BY l.position ASC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
		return
	}
	defer rows.Close()

	items := []linkItem{}
	for rows.Next() {
		var it linkItem
		if err := rows.Scan(&it.ID, &it.Title, &it.URL, &it.Position, &it.IsActive, &it.StartsAt, &it.EndsAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type createLinkRequest struct {
	Title string `json:"title" binding:"required,max=100"`
	URL   string `json:"url" binding:"required,url,max=2048"`
}

// Create — REQ-F-202. Tautan baru ditaruh di posisi paling akhir.
func (h *LinksHandler) Create(c *gin.Context) {
	var req createLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var pageID string
	if err := h.DB.QueryRow(ctx, `SELECT id FROM pages WHERE user_id = $1`, userID).Scan(&pageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "halaman belum siap"})
		return
	}

	var nextPosition int
	if err := h.DB.QueryRow(ctx,
		`SELECT COALESCE(MAX(position) + 1, 0) FROM links WHERE page_id = $1`, pageID,
	).Scan(&nextPosition); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung posisi tautan"})
		return
	}

	id := uuid.NewString()
	_, err := h.DB.Exec(ctx, `
		INSERT INTO links (id, page_id, title, url, position, is_active)
		VALUES ($1, $2, $3, $4, $5, true)
	`, id, pageID, req.Title, req.URL, nextPosition)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat tautan"})
		return
	}

	c.JSON(http.StatusCreated, linkItem{ID: id, Title: req.Title, URL: req.URL, Position: nextPosition, IsActive: true})
}

type updateLinkRequest struct {
	Title         *string `json:"title" binding:"omitempty,max=100"`
	URL           *string `json:"url" binding:"omitempty,url,max=2048"`
	IsActive      *bool   `json:"is_active"`
	StartsAt      *string `json:"starts_at"`
	EndsAt        *string `json:"ends_at"`
	ClearSchedule bool    `json:"clear_schedule"`
}

// Update — REQ-F-202 (edit) & REQ-F-203 (nonaktifkan sementara via is_active=false).
// No.78 (Sprint 9): penjadwalan starts_at/ends_at -- tautan otomatis
// tampil/sembunyi di halaman publik pada rentang waktu tertentu, TANPA
// perlu toggle is_active manual (lihat filter di PageHandler.GetPublicPage).
func (h *LinksHandler) Update(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	var req updateLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	var starts, ends *time.Time
	if req.StartsAt != nil || req.EndsAt != nil {
		if req.StartsAt == nil || req.EndsAt == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "starts_at dan ends_at wajib diisi bersamaan"})
			return
		}
		s, err := time.Parse(time.RFC3339, *req.StartsAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format starts_at tidak valid (pakai RFC3339)"})
			return
		}
		e, err := time.Parse(time.RFC3339, *req.EndsAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format ends_at tidak valid (pakai RFC3339)"})
			return
		}
		if !e.After(s) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "waktu berakhir jadwal harus setelah waktu mulai"})
			return
		}
		starts, ends = &s, &e
	}

	if req.ClearSchedule {
		if _, err := h.DB.Exec(ctx, `UPDATE links SET starts_at = NULL, ends_at = NULL WHERE id = $1`, linkID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membatalkan jadwal"})
			return
		}
	}

	_, err := h.DB.Exec(ctx, `
		UPDATE links SET
			title = COALESCE($1, title),
			url = COALESCE($2, url),
			is_active = COALESCE($3, is_active),
			starts_at = COALESCE($4, starts_at),
			ends_at = COALESCE($5, ends_at)
		WHERE id = $6
	`, req.Title, req.URL, req.IsActive, starts, ends, linkID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui tautan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "tautan diperbarui"})
}

// Delete — REQ-F-202 (hapus permanen; untuk sementara pakai Update is_active=false).
func (h *LinksHandler) Delete(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}

	if _, err := h.DB.Exec(ctx, `DELETE FROM links WHERE id = $1`, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus tautan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "tautan dihapus"})
}

type reorderItem struct {
	ID       string `json:"id" binding:"required"`
	Position int    `json:"position"`
}

// Reorder — mendukung drag-and-drop di dashboard (REQ-F-202). Menerima daftar
// {id, position} lengkap untuk halaman kreator yang sedang login; seluruh
// tautan yang disebut divalidasi kepemilikannya sebelum diterapkan.
func (h *LinksHandler) Reorder(c *gin.Context) {
	var req []reorderItem
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, item := range req {
		res, err := tx.Exec(ctx, `
			UPDATE links SET position = $1
			WHERE id = $2 AND page_id = (SELECT id FROM pages WHERE user_id = $3)
		`, item.Position, item.ID, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan urutan"})
			return
		}
		if res.RowsAffected() == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "tautan bukan milik akun ini"})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan urutan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "urutan tautan diperbarui"})
}

func (h *LinksHandler) ownsLink(ctx context.Context, linkID, userID string) bool {
	var exists int
	err := h.DB.QueryRow(ctx, `
		SELECT 1 FROM links l
		JOIN pages p ON p.id = l.page_id
		WHERE l.id = $1 AND p.user_id = $2
	`, linkID, userID).Scan(&exists)
	if err != nil && err != pgx.ErrNoRows {
		return false
	}
	return err == nil
}
