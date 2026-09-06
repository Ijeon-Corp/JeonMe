package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SupportChatHandler -- Live Chat dukungan (permintaan langsung pengguna, 7
// September 2026: "saya itu ingin ada fitur live chat tetapi yang membalas
// nanti dari pihak jeon id nya langsung bukan bot tapi tetep ada pertanyaan
// faq yang langsung bisa diberikan jawaban nya ke creator"). SEBELUMNYA
// satu-satunya jalur dukungan adalah tombol Email/WhatsApp manual di
// halaman Bantuan -- tidak ada riwayat percakapan tersimpan sama sekali.
//
// FAQ instan (bagian kedua permintaan) SENGAJA TIDAK ada di sini sama
// sekali -- frontend memakai ulang konten statis halaman Bantuan lewat
// lib/help-faq.ts, murni lokal tanpa round-trip API, jadi tidak butuh
// tabel/endpoint baru untuk itu. Handler ini HANYA menangani percakapan
// sungguhan dua-arah kreator<->staf (lihat migrasi 000095 untuk skema &
// alasan lengkap desain satu-tabel/satu-thread-per-kreator).
//
// TIDAK ADA WebSocket/SSE (konsisten dgn seluruh codebase -- lihat
// NotificationBell.tsx) -- kreator polling ringan lewat ListMine, admin
// memeriksa antrian /admin/support-chat secara manual seperti antrian
// KYC/Laporan/Penarikan yang sudah ada.
type SupportChatHandler struct {
	DB *pgxpool.Pool
}

func NewSupportChatHandler(db *pgxpool.Pool) *SupportChatHandler {
	return &SupportChatHandler{DB: db}
}

const maxSupportMessageLen = 2000

type supportMessageResponse struct {
	ID         string    `json:"id"`
	SenderRole string    `json:"sender_role"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

// ListMine -- riwayat thread milik kreator yang sedang login + jumlah
// belum dibaca dari admin, SATU response (pola sama NotificationHandler.List
// -- bukan endpoint count terpisah, lebih sedikit route/rate-limit-bucket
// utk dijaga, dan payloadnya kecil karena LIMIT 500). Dipoll
// SupportChatWidget.tsx: cepat (~4.5 detik) saat panel terbuka, lambat
// (~25 detik) saat tertutup.
func (h *SupportChatHandler) ListMine(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, sender_role, body, created_at FROM support_messages
		WHERE user_id = $1 ORDER BY created_at ASC LIMIT 500
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat percakapan"})
		return
	}
	defer rows.Close()
	items := []supportMessageResponse{}
	for rows.Next() {
		var m supportMessageResponse
		if err := rows.Scan(&m.ID, &m.SenderRole, &m.Body, &m.CreatedAt); err == nil {
			items = append(items, m)
		}
	}

	var unreadCount int
	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM support_messages WHERE user_id = $1 AND sender_role = 'admin' AND read_at IS NULL
	`, userID).Scan(&unreadCount); err != nil {
		unreadCount = 0
	}

	c.JSON(http.StatusOK, gin.H{"messages": items, "unread_count": unreadCount})
}

type sendSupportMessageRequest struct {
	Body string `json:"body" binding:"required,max=2000"`
}

// SendMine -- kreator mengirim pesan baru ke thread-nya sendiri.
func (h *SupportChatHandler) SendMine(c *gin.Context) {
	userID := c.GetString("userID")

	var req sendSupportMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pesan tidak boleh kosong"})
		return
	}
	if len(body) > maxSupportMessageLen {
		body = body[:maxSupportMessageLen]
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp supportMessageResponse
	if err := h.DB.QueryRow(ctx, `
		INSERT INTO support_messages (user_id, sender_role, body)
		VALUES ($1, 'creator', $2)
		RETURNING id, sender_role, body, created_at
	`, userID, body).Scan(&resp.ID, &resp.SenderRole, &resp.Body, &resp.CreatedAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengirim pesan"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// MarkMineRead -- kreator membuka tab Chat di widget -- tandai semua
// balasan admin yang belum dibaca sbg sudah dibaca (badge widget nol lagi).
func (h *SupportChatHandler) MarkMineRead(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `
		UPDATE support_messages SET read_at = now()
		WHERE user_id = $1 AND sender_role = 'admin' AND read_at IS NULL
	`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menandai pesan dibaca"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ditandai dibaca"})
}

type adminSupportThreadItem struct {
	UserID         string    `json:"user_id"`
	Username       string    `json:"username"`
	Email          string    `json:"email"`
	LastSenderRole string    `json:"last_sender_role"`
	LastMessage    string    `json:"last_message"`
	LastMessageAt  time.Time `json:"last_message_at"`
}

// AdminList -- daftar thread lintas kreator, satu baris per kreator (pesan
// TERAKHIRnya saja) lewat DISTINCT ON. filter default "needs_reply" (pesan
// terakhir thread itu dari kreator -- giliran staf membalas), "all" utk
// seluruh thread yang pernah ada. search cocok username/email (pola sama
// AdminList KYC). Urutan beda sengaja: needs_reply urut ASC (yang menunggu
// paling lama duluan, gaya antrian), all urut DESC (aktivitas terbaru
// duluan, gaya kotak masuk).
//
// CATATAN performa: query ini O(baris) bukan O(thread) -- pindai seluruh
// support_messages tiap panggilan. Konsisten dgn gaya KYC/Laporan/
// notifikasi di codebase ini (scan langsung, tanpa tabel ringkasan
// terpisah) -- cukup di skala saat ini, revisit kalau tabel sudah besar.
func (h *SupportChatHandler) AdminList(c *gin.Context) {
	filter := c.DefaultQuery("filter", "needs_reply")
	search := "%" + c.Query("search") + "%"
	limit, offset := parseLimitOffset(c)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	where := "WHERE (u.username ILIKE $1 OR u.email ILIKE $1)"
	args := []any{search}
	if filter != "all" {
		where += " AND l.last_sender_role = 'creator'"
	}
	order := "DESC"
	if filter != "all" {
		order = "ASC"
	}

	latestCTE := `
		WITH latest AS (
			SELECT DISTINCT ON (sm.user_id) sm.user_id, sm.sender_role AS last_sender_role,
			       sm.body AS last_message, sm.created_at AS last_message_at
			FROM support_messages sm ORDER BY sm.user_id, sm.created_at DESC
		)
	`

	var total int
	if err := h.DB.QueryRow(ctx, latestCTE+`
		SELECT COUNT(*) FROM latest l JOIN users u ON u.id = l.user_id `+where, args...,
	).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar live chat"})
		return
	}

	args = append(args, limit, offset)
	rows, err := h.DB.Query(ctx, fmt.Sprintf(latestCTE+`
		SELECT l.user_id, u.username, u.email, l.last_sender_role, l.last_message, l.last_message_at
		FROM latest l JOIN users u ON u.id = l.user_id
		%s
		ORDER BY l.last_message_at %s
		LIMIT $%d OFFSET $%d
	`, where, order, len(args)-1, len(args)), args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar live chat"})
		return
	}
	defer rows.Close()

	items := []adminSupportThreadItem{}
	for rows.Next() {
		var it adminSupportThreadItem
		if err := rows.Scan(&it.UserID, &it.Username, &it.Email, &it.LastSenderRole, &it.LastMessage, &it.LastMessageAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, paginatedResponse[adminSupportThreadItem]{Items: items, Total: total})
}

type adminSupportThreadDetail struct {
	UserID   string                    `json:"user_id"`
	Username string                    `json:"username"`
	Email    string                    `json:"email"`
	Messages []supportMessageResponse `json:"messages"`
}

// AdminGetThread -- riwayat penuh satu thread. Sekaligus menandai pesan
// kreator->admin sbg dibaca (efek samping "admin sudah melihat thread ini")
// -- TIDAK memengaruhi definisi antrian needs_reply di AdminList (itu murni
// berdasar last_sender_role, bukan read_at).
func (h *SupportChatHandler) AdminGetThread(c *gin.Context) {
	targetUserID := c.Param("userId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var resp adminSupportThreadDetail
	resp.UserID = targetUserID
	if err := h.DB.QueryRow(ctx, `SELECT username, email FROM users WHERE id = $1`, targetUserID).Scan(&resp.Username, &resp.Email); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "kreator tidak ditemukan"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT id, sender_role, body, created_at FROM support_messages
		WHERE user_id = $1 ORDER BY created_at ASC LIMIT 500
	`, targetUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat percakapan"})
		return
	}
	messages := []supportMessageResponse{}
	for rows.Next() {
		var m supportMessageResponse
		if err := rows.Scan(&m.ID, &m.SenderRole, &m.Body, &m.CreatedAt); err == nil {
			messages = append(messages, m)
		}
	}
	rows.Close()
	resp.Messages = messages

	if _, err := h.DB.Exec(ctx, `
		UPDATE support_messages SET read_at = now()
		WHERE user_id = $1 AND sender_role = 'creator' AND read_at IS NULL
	`, targetUserID); err != nil {
		// soft-fail -- gagal menandai dibaca bukan alasan menggagalkan
		// tampilan thread yang sudah berhasil dimuat.
		_ = err
	}

	c.JSON(http.StatusOK, resp)
}

type replySupportChatRequest struct {
	Body string `json:"body" binding:"required,max=2000"`
}

// AdminReply -- staf membalas thread kreator tertentu. Memberi tahu kreator
// lewat sistem notifikasi dalam-app yang sudah ada (notifyUser, admin.go) --
// pola sama persis KycHandler.AdminReview/AdminRevoke.
func (h *SupportChatHandler) AdminReply(c *gin.Context) {
	targetUserID := c.Param("userId")
	adminID := c.GetString("userID")

	var req replySupportChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "balasan tidak boleh kosong"})
		return
	}
	if len(body) > maxSupportMessageLen {
		body = body[:maxSupportMessageLen]
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var exists bool
	if err := h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, targetUserID).Scan(&exists); err != nil || !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "kreator tidak ditemukan"})
		return
	}

	var resp supportMessageResponse
	if err := h.DB.QueryRow(ctx, `
		INSERT INTO support_messages (user_id, sender_role, sender_admin_id, body)
		VALUES ($1, 'admin', $2, $3)
		RETURNING id, sender_role, body, created_at
	`, targetUserID, adminID, body).Scan(&resp.ID, &resp.SenderRole, &resp.Body, &resp.CreatedAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengirim balasan"})
		return
	}

	preview := body
	if len(preview) > 140 {
		preview = preview[:140] + "..."
	}
	notifyUser(ctx, h.DB, targetUserID, "support_reply", "Balasan baru dari Tim Jeon.id", preview, "/dashboard")

	c.JSON(http.StatusOK, resp)
}
