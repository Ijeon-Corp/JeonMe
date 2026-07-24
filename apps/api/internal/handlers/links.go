package handlers

import (
	"context"
	"net/http"
	"strings"
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
	ID         string     `json:"id"`
	Title      string     `json:"title"`
	URL        string     `json:"url"`
	Position   int        `json:"position"`
	IsActive   bool       `json:"is_active"`
	StartsAt   *time.Time `json:"starts_at"`
	EndsAt     *time.Time `json:"ends_at"`
	LockType   string     `json:"lock_type"`
	LockCode   string     `json:"lock_code"`
	LockMinAge *int       `json:"lock_min_age"`
}

// List mengembalikan seluruh tautan milik kreator yang sedang login, urut
// posisi. lock_code disertakan (BUKAN disembunyikan) karena ini endpoint
// dashboard kreator sendiri -- dia yang membuat kodenya, wajar dia bisa
// melihatnya lagi untuk diedit.
func (h *LinksHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT l.id, l.title, l.url, l.position, l.is_active, l.starts_at, l.ends_at,
			COALESCE(l.lock_type, ''), l.lock_code, l.lock_min_age
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
		if err := rows.Scan(&it.ID, &it.Title, &it.URL, &it.Position, &it.IsActive, &it.StartsAt, &it.EndsAt,
			&it.LockType, &it.LockCode, &it.LockMinAge); err == nil {
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
	// No.79 (Sprint 9): kunci tautan -- lock_type kosong ("") berarti tidak
	// terkunci. "age" butuh lock_min_age, "code" butuh lock_code, "subscribe"
	// tidak butuh keduanya (URL asli disembunyikan dari halaman publik,
	// baru dibuka lewat POST /links/:id/unlock).
	LockType   *string `json:"lock_type" binding:"omitempty,oneof=age code subscribe"`
	LockCode   *string `json:"lock_code" binding:"omitempty,max=50"`
	LockMinAge *int    `json:"lock_min_age" binding:"omitempty,min=13,max=99"`
	ClearLock  bool    `json:"clear_lock"`
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

	// No.79: validasi field yang wajib menyertai tiap lock_type -- dicek
	// terhadap NILAI AKHIR (yang baru diisi ATAU yang sudah tersimpan),
	// sama seperti pola validasi pwyw/flash sale di ProductHandler.Update.
	if req.LockType != nil {
		var currentLockCode string
		var currentLockMinAge *int
		if err := h.DB.QueryRow(ctx, `SELECT lock_code, lock_min_age FROM links WHERE id = $1`, linkID).
			Scan(&currentLockCode, &currentLockMinAge); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
			return
		}
		switch *req.LockType {
		case "age":
			minAge := currentLockMinAge
			if req.LockMinAge != nil {
				minAge = req.LockMinAge
			}
			if minAge == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "batas usia wajib diisi untuk kunci usia"})
				return
			}
		case "code":
			code := currentLockCode
			if req.LockCode != nil {
				code = *req.LockCode
			}
			if code == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "kode akses wajib diisi untuk kunci kode"})
				return
			}
		}
	}

	if req.ClearLock {
		if _, err := h.DB.Exec(ctx, `
			UPDATE links SET lock_type = NULL, lock_code = '', lock_min_age = NULL WHERE id = $1
		`, linkID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuka kunci tautan"})
			return
		}
	}

	_, err := h.DB.Exec(ctx, `
		UPDATE links SET
			title = COALESCE($1, title),
			url = COALESCE($2, url),
			is_active = COALESCE($3, is_active),
			starts_at = COALESCE($4, starts_at),
			ends_at = COALESCE($5, ends_at),
			lock_type = COALESCE($6, lock_type),
			lock_code = COALESCE($7, lock_code),
			lock_min_age = COALESCE($8, lock_min_age)
		WHERE id = $9
	`, req.Title, req.URL, req.IsActive, starts, ends, req.LockType, req.LockCode, req.LockMinAge, linkID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui tautan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "tautan diperbarui"})
}

// Unlock — No.79 (Sprint 9): endpoint PUBLIK, dipanggil dari halaman publik
// begitu pengunjung melewati gerbang kunci (konfirmasi usia, masukkan kode,
// atau daftar email/whatsapp). Mengembalikan URL asli HANYA kalau gerbang
// terlewati -- URL tidak pernah dikirim di payload halaman publik untuk
// tautan terkunci (lihat PageHandler.GetPublicPage).
type unlockLinkRequest struct {
	Code           string `json:"code"`
	Email          string `json:"email"`
	WhatsappNumber string `json:"whatsapp_number"`
}

func (h *LinksHandler) Unlock(c *gin.Context) {
	linkID := c.Param("id")

	var req unlockLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var url, lockType, lockCode string
	var creatorUserID string
	err := h.DB.QueryRow(ctx, `
		SELECT l.url, COALESCE(l.lock_type, ''), l.lock_code, p.user_id
		FROM links l JOIN pages p ON p.id = l.page_id
		WHERE l.id = $1
	`, linkID).Scan(&url, &lockType, &lockCode, &creatorUserID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
		return
	}

	switch lockType {
	case "code":
		if strings.TrimSpace(req.Code) == "" || req.Code != lockCode {
			c.JSON(http.StatusBadRequest, gin.H{"error": "kode akses salah"})
			return
		}
	case "subscribe":
		email := strings.TrimSpace(strings.ToLower(req.Email))
		whatsapp := strings.TrimSpace(req.WhatsappNumber)
		if email == "" && whatsapp == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "isi email atau nomor WhatsApp"})
			return
		}
		// No.79: subscribe-lock sekaligus jadi sumber lead baru untuk
		// Manajer Audiens (No.73) -- INSERT ke tabel subscribers yang sama,
		// dedupe email persis seperti AudienceHandler.SubscribeLead.
		if _, err := h.DB.Exec(ctx, `
			INSERT INTO subscribers (creator_user_id, email, whatsapp_number)
			VALUES ($1, $2, $3)
			ON CONFLICT (creator_user_id, email) WHERE email <> '' DO UPDATE SET
				whatsapp_number = CASE WHEN EXCLUDED.whatsapp_number <> '' THEN EXCLUDED.whatsapp_number ELSE subscribers.whatsapp_number END
		`, creatorUserID, email, whatsapp); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data"})
			return
		}
	case "age":
		// Konfirmasi usia murni klik persetujuan (tidak ada verifikasi
		// identitas sungguhan) -- konsisten dengan perilaku age-lock
		// Linktree yang sebenarnya (dikonfirmasi riset kompetitor).
	}

	c.JSON(http.StatusOK, gin.H{"url": url})
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
