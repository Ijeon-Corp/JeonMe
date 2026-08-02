package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NotificationHandler -- pusat notifikasi dalam-app (ikon lonceng di top bar
// dashboard, permintaan langsung pengguna berdasar tangkapan layar top bar
// Linktree). SATU tabel generik (lihat migrasi 000042) diisi dari titik
// pemicu yang sudah ada di kode lain (mis. worker.HandleOrderPaidNotification
// untuk pesanan baru) -- handler ini murni baca/tandai-dibaca, TIDAK ada
// endpoint "buat notifikasi" langsung dari klien (semua notifikasi berasal
// dari kejadian sistem, bukan input pengguna).
type NotificationHandler struct {
	DB *pgxpool.Pool
}

func NewNotificationHandler(db *pgxpool.Pool) *NotificationHandler {
	return &NotificationHandler{DB: db}
}

type notificationResponse struct {
	ID        string  `json:"id"`
	Type      string  `json:"type"`
	Title     string  `json:"title"`
	Body      string  `json:"body"`
	LinkURL   *string `json:"link_url"`
	Read      bool    `json:"read"`
	CreatedAt string  `json:"created_at"`
}

// List -- 30 notifikasi terbaru + jumlah belum dibaca (dipakai badge lonceng).
// Limit tetap (bukan pagination penuh) -- ini panel dropdown ringkas di top
// bar, bukan halaman riwayat lengkap.
func (h *NotificationHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, type, title, body, link_url, read_at, created_at
		FROM notifications WHERE user_id = $1
		ORDER BY created_at DESC LIMIT 30
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat notifikasi"})
		return
	}
	defer rows.Close()

	items := []notificationResponse{}
	for rows.Next() {
		var n notificationResponse
		var readAt *time.Time
		var createdAt time.Time
		if err := rows.Scan(&n.ID, &n.Type, &n.Title, &n.Body, &n.LinkURL, &readAt, &createdAt); err != nil {
			continue
		}
		n.Read = readAt != nil
		n.CreatedAt = createdAt.Format(time.RFC3339)
		items = append(items, n)
	}

	var unreadCount int
	if err := h.DB.QueryRow(ctx, `
		SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL
	`, userID).Scan(&unreadCount); err != nil {
		unreadCount = 0
	}

	c.JSON(http.StatusOK, gin.H{"notifications": items, "unread_count": unreadCount})
}

// MarkRead -- WHERE user_id = $2 sekaligus jadi pengecekan kepemilikan (ID
// milik user lain diam-diam tidak match, bukan 403 eksplisit -- pola sama
// dengan endpoint kepemilikan lain di codebase ini, mis. links.go).
func (h *NotificationHandler) MarkRead(c *gin.Context) {
	userID := c.GetString("userID")
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `
		UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL
	`, id, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menandai notifikasi dibaca"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ditandai dibaca"})
}

func (h *NotificationHandler) MarkAllRead(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `
		UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL
	`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menandai semua notifikasi dibaca"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "semua notifikasi ditandai dibaca"})
}
