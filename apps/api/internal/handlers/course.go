package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// minCourseChapters -- kursus harus punya minimal 1 bab, kalau tidak bukan
// "kursus terstruktur", cuma produk video biasa.
const minCourseChapters = 1

// CourseHandler mengimplementasikan No.91 (Sprint 11): blok kelas/kursus
// video -- perluasan natural dari produk digital biasa jadi terstruktur
// per-bab. Kursus adalah baris `products` biasa (is_course=true, file_key
// selalu kosong -- materinya video per-bab lewat course_chapters, bukan
// satu file) -- toggle aktif/nonaktif & hapus memakai ProductHandler.
// Update/Delete yang sudah ada, sama seperti pola BundleHandler/EventHandler.
//
// CATATAN LINGKUP: video per-bab HARUS berupa tautan YouTube/TikTok
// (memakai validator embed yang sama seperti blok video No.77, BUKAN
// upload/hosting video sendiri -- itu perlu infrastruktur streaming
// terpisah yang jauh di luar cakupan). Prasyarat (course_prerequisites)
// cuma teks bebas, bukan validasi terhubung ke kursus lain.
type CourseHandler struct {
	DB *pgxpool.Pool
}

func NewCourseHandler(db *pgxpool.Pool) *CourseHandler {
	return &CourseHandler{DB: db}
}

type chapterInput struct {
	Title       string `json:"title" binding:"required,max=200"`
	Description string `json:"description"`
	VideoURL    string `json:"video_url" binding:"required"`
}

type createCourseRequest struct {
	Name          string         `json:"name" binding:"required,max=200"`
	Description   string         `json:"description"`
	PriceIDR      int64          `json:"price_idr" binding:"required,min=1000"`
	Prerequisites string         `json:"prerequisites"`
	Chapters      []chapterInput `json:"chapters" binding:"required,min=1"`
}

func validateChapters(chapters []chapterInput) (string, bool) {
	if len(chapters) < minCourseChapters {
		return "kursus harus punya minimal 1 bab", false
	}
	for i, ch := range chapters {
		if strings.TrimSpace(ch.Title) == "" {
			return "judul bab tidak boleh kosong", false
		}
		if !isValidVideoEmbedURL(ch.VideoURL) {
			return "video bab " + strconv.Itoa(i+1) + " harus tautan YouTube atau TikTok yang valid", false
		}
	}
	return "", true
}

// Create — REQ seluruh bab divalidasi sekaligus sebelum apa pun disimpan
// (semua atau tidak sama sekali), sama seperti validasi produk bundel.
func (h *CourseHandler) Create(c *gin.Context) {
	var req createCourseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if msg, ok := validateChapters(req.Chapters); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	courseID := uuid.NewString()
	if _, err := tx.Exec(ctx, `
		INSERT INTO products (id, user_id, name, description, price_idr, is_active, is_course, course_prerequisites)
		VALUES ($1, $2, $3, $4, $5, false, true, $6)
	`, courseID, userID, req.Name, req.Description, req.PriceIDR, req.Prerequisites); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kursus"})
		return
	}

	for i, ch := range req.Chapters {
		if _, err := tx.Exec(ctx, `
			INSERT INTO course_chapters (id, course_product_id, title, description, video_url, position)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, uuid.NewString(), courseID, ch.Title, ch.Description, ch.VideoURL, i); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan bab kursus"})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan kursus"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": courseID, "message": "kursus dibuat, aktifkan dari daftar kursus supaya bisa dibeli"})
}

type courseListItem struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	PriceIDR      int64  `json:"price_idr"`
	IsActive      bool   `json:"is_active"`
	Prerequisites string `json:"prerequisites"`
	ChapterCount  int    `json:"chapter_count"`
}

func (h *CourseHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, p.description, p.price_idr, p.is_active, p.course_prerequisites,
			(SELECT COUNT(*) FROM course_chapters cc WHERE cc.course_product_id = p.id)
		FROM products p WHERE p.user_id = $1 AND p.is_course = true
		ORDER BY p.name
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat kursus"})
		return
	}
	defer rows.Close()

	items := []courseListItem{}
	for rows.Next() {
		var it courseListItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Description, &it.PriceIDR, &it.IsActive, &it.Prerequisites, &it.ChapterCount); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type chapterItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	VideoURL    string `json:"video_url"`
	Position    int    `json:"position"`
}

// GetChapters — dashboard (pemilik) melihat/mengedit isi bab kursusnya.
func (h *CourseHandler) GetChapters(c *gin.Context) {
	courseID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var exists int
	if err := h.DB.QueryRow(ctx, `SELECT 1 FROM products WHERE id = $1 AND user_id = $2 AND is_course = true`, courseID, userID).Scan(&exists); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "kursus tidak ditemukan"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT id, title, description, video_url, position FROM course_chapters
		WHERE course_product_id = $1 ORDER BY position ASC
	`, courseID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat bab kursus"})
		return
	}
	defer rows.Close()

	items := []chapterItem{}
	for rows.Next() {
		var it chapterItem
		if err := rows.Scan(&it.ID, &it.Title, &it.Description, &it.VideoURL, &it.Position); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type replaceChaptersRequest struct {
	Chapters []chapterInput `json:"chapters" binding:"required,min=1"`
}

// ReplaceChapters — mengganti SELURUH bab sekaligus (bukan CRUD granular
// per-bab) -- jauh lebih sederhana & aman dari salah urutan posisi
// dibanding endpoint tambah/hapus/reorder terpisah, dan mengedit kursus
// diperkirakan jarang terjadi (bukan alur harian seperti tautan).
func (h *CourseHandler) ReplaceChapters(c *gin.Context) {
	courseID := c.Param("id")
	userID := c.GetString("userID")

	var req replaceChaptersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msg, ok := validateChapters(req.Chapters); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var exists int
	if err := h.DB.QueryRow(ctx, `SELECT 1 FROM products WHERE id = $1 AND user_id = $2 AND is_course = true`, courseID, userID).Scan(&exists); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "kursus tidak ditemukan"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM course_chapters WHERE course_product_id = $1`, courseID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus bab lama"})
		return
	}
	for i, ch := range req.Chapters {
		if _, err := tx.Exec(ctx, `
			INSERT INTO course_chapters (id, course_product_id, title, description, video_url, position)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, uuid.NewString(), courseID, ch.Title, ch.Description, ch.VideoURL, i); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan bab kursus"})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "bab kursus diperbarui"})
}
