package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/queue"
)

// LinksHandler mengimplementasikan CRUD tautan (REQ-F-202), nonaktifkan-
// sementara-tanpa-hapus (REQ-F-203), dan blok konten baru (No.77, Sprint 9:
// video embed, formulir kontak, FAQ) -- semuanya baris di tabel links yang
// sama, dibedakan lewat block_type ('link' = tautan biasa, default).
// Queue boleh nil (mis. REDIS_URL tidak valid saat startup) -- notifikasi
// formulir kontak akan dilewati dengan log peringatan, sama seperti pola
// soft-fail CheckoutHandler.
type LinksHandler struct {
	DB    *pgxpool.Pool
	Queue *asynq.Client
}

func NewLinksHandler(db *pgxpool.Pool, queueClient *asynq.Client) *LinksHandler {
	return &LinksHandler{DB: db, Queue: queueClient}
}

type linkItem struct {
	ID         string          `json:"id"`
	Title      string          `json:"title"`
	URL        string          `json:"url"`
	Position   int             `json:"position"`
	IsActive   bool            `json:"is_active"`
	StartsAt   *time.Time      `json:"starts_at"`
	EndsAt     *time.Time      `json:"ends_at"`
	LockType   string          `json:"lock_type"`
	LockCode   string          `json:"lock_code"`
	LockMinAge *int            `json:"lock_min_age"`
	BlockType  string          `json:"block_type"`
	BlockData  json.RawMessage `json:"block_data"`
	// ClickCount -- redesign dashboard Tautan ala Linktree (referensi
	// tangkapan layar pengguna): jumlah klik NYATA dari analytics_events
	// (REQ-F-601) yang sudah tercatat sejak awal, sebelumnya tidak pernah
	// ditampilkan per-tautan di dashboard (cuma top-5 di Ringkasan/No.86).
	ClickCount int64 `json:"click_count"`
}

// List mengembalikan seluruh tautan & blok konten milik kreator yang sedang
// login, urut posisi (satu daftar tercampur -- lihat komentar LinksHandler).
// lock_code disertakan (BUKAN disembunyikan) karena ini endpoint dashboard
// kreator sendiri -- dia yang membuat kodenya, wajar dia bisa melihatnya
// lagi untuk diedit.
func (h *LinksHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT l.id, l.title, l.url, l.position, l.is_active, l.starts_at, l.ends_at,
			COALESCE(l.lock_type, ''), l.lock_code, l.lock_min_age, l.block_type, l.block_data,
			(SELECT COUNT(*) FROM analytics_events ae WHERE ae.link_id = l.id AND ae.event_type = 'click')
		FROM links l
		JOIN pages p ON p.id = l.page_id
		WHERE p.user_id = $1 AND p.is_primary = true
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
			&it.LockType, &it.LockCode, &it.LockMinAge, &it.BlockType, &it.BlockData, &it.ClickCount); err == nil {
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
	if err := h.DB.QueryRow(ctx, `SELECT id FROM pages WHERE user_id = $1 AND is_primary = true`, userID).Scan(&pageID); err != nil {
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

	c.JSON(http.StatusCreated, linkItem{ID: id, Title: req.Title, URL: req.URL, Position: nextPosition, IsActive: true, BlockType: "link", BlockData: json.RawMessage("{}")})
}

// validVideoHosts -- No.77: "auto-embed" dibatasi ke YouTube/TikTok sesuai
// scope (bukan embed generik sembarang situs, yang butuh whitelist iframe
// jauh lebih hati-hati untuk keamanan).
func isValidVideoEmbedURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	host := strings.ToLower(u.Host)
	return strings.Contains(host, "youtube.com") || strings.Contains(host, "youtu.be") || strings.Contains(host, "tiktok.com")
}

// validateBlockData -- No.77: aturan tiap block_type. contact_form sengaja
// tidak butuh field apa pun (form kontak selalu sama: nama/email/pesan,
// tidak ada kustomisasi field untuk versi awal).
// No.99 (Sprint 14): heading/text/image ditambah untuk builder landing page
// blok manual (TANPA "Create with AI" -- lihat catatan lingkup di migrasi
// 000030). "button" TIDAK butuh validasi block_data khusus -- memakai ulang
// kolom title/url yang sudah ada di links, sama seperti tautan biasa, cuma
// dirender sebagai tombol CTA besar bukan baris daftar.
func validateBlockData(blockType string, data map[string]any) (string, bool) {
	switch blockType {
	case "video":
		videoURL, _ := data["video_url"].(string)
		if !isValidVideoEmbedURL(videoURL) {
			return "video_url wajib diisi dengan tautan YouTube atau TikTok yang valid", false
		}
	case "faq":
		items, ok := data["items"].([]any)
		if !ok || len(items) == 0 {
			return "isi minimal 1 pertanyaan FAQ", false
		}
		for _, raw := range items {
			item, ok := raw.(map[string]any)
			q, _ := item["question"].(string)
			a, _ := item["answer"].(string)
			if !ok || strings.TrimSpace(q) == "" || strings.TrimSpace(a) == "" {
				return "setiap item FAQ wajib punya pertanyaan dan jawaban", false
			}
		}
	case "heading", "text":
		text, _ := data["text"].(string)
		if strings.TrimSpace(text) == "" {
			return "isi teks blok ini", false
		}
	case "image":
		imageURL, _ := data["image_url"].(string)
		u, err := url.Parse(imageURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			return "image_url wajib diisi dengan URL gambar yang valid", false
		}
	}
	return "", true
}

type createBlockRequest struct {
	BlockType string         `json:"block_type" binding:"required,oneof=video contact_form faq heading text image button"`
	Title     string         `json:"title" binding:"required,max=100"`
	URL       string         `json:"url" binding:"omitempty,url,max=2048"`
	BlockData map[string]any `json:"block_data"`
}

// CreateBlock — No.77 (Sprint 9): blok konten baru selain tautan biasa
// (video embed, formulir kontak, FAQ/accordion) -- baris products biasa di
// tabel links yang sama (pola identik bundel No.70: entitas baru TIDAK
// perlu tabel terpisah kalau cukup jadi varian baris yang sudah ada),
// ditaruh di posisi paling akhir dalam urutan yang SAMA dengan tautan biasa
// (satu daftar tercampur di halaman publik).
func (h *LinksHandler) CreateBlock(c *gin.Context) {
	var req createBlockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.BlockData == nil {
		req.BlockData = map[string]any{}
	}
	if req.BlockType == "button" && req.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url wajib diisi untuk tombol CTA"})
		return
	}
	if msg, ok := validateBlockData(req.BlockType, req.BlockData); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var pageID string
	if err := h.DB.QueryRow(ctx, `SELECT id FROM pages WHERE user_id = $1 AND is_primary = true`, userID).Scan(&pageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "halaman belum siap"})
		return
	}

	id, position, blockDataJSON, err := h.insertBlock(ctx, pageID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, linkItem{
		ID: id, Title: req.Title, URL: req.URL, Position: position, IsActive: true,
		BlockType: req.BlockType, BlockData: blockDataJSON,
	})
}

// insertBlock -- logika inti INSERT blok (dipakai CreateBlock & CreateBlockForPage,
// No.99) supaya tidak duplikasi query hitung posisi + marshal block_data.
func (h *LinksHandler) insertBlock(ctx context.Context, pageID string, req createBlockRequest) (id string, position int, blockDataJSON []byte, err error) {
	if err = h.DB.QueryRow(ctx,
		`SELECT COALESCE(MAX(position) + 1, 0) FROM links WHERE page_id = $1`, pageID,
	).Scan(&position); err != nil {
		return "", 0, nil, errors.New("gagal menghitung posisi blok")
	}

	blockDataJSON, err = json.Marshal(req.BlockData)
	if err != nil {
		return "", 0, nil, errors.New("gagal menyimpan data blok")
	}

	id = uuid.NewString()
	if _, err = h.DB.Exec(ctx, `
		INSERT INTO links (id, page_id, title, url, position, is_active, block_type, block_data)
		VALUES ($1, $2, $3, $4, $5, true, $6, $7)
	`, id, pageID, req.Title, req.URL, position, req.BlockType, blockDataJSON); err != nil {
		return "", 0, nil, errors.New("gagal membuat blok")
	}

	return id, position, blockDataJSON, nil
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
	// No.77: mengedit isi blok konten (mis. tautan video baru atau item FAQ)
	// -- divalidasi terhadap block_type baris yang SUDAH ada (tidak bisa
	// ganti block_type lewat endpoint ini, cuma isinya).
	BlockData map[string]any `json:"block_data"`
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

	// No.77: block_data divalidasi terhadap block_type baris yang SUDAH ADA
	// (endpoint ini tidak bisa mengganti block_type, cuma isinya).
	var blockDataJSON []byte
	if req.BlockData != nil {
		var currentBlockType string
		if err := h.DB.QueryRow(ctx, `SELECT block_type FROM links WHERE id = $1`, linkID).Scan(&currentBlockType); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
			return
		}
		if msg, ok := validateBlockData(currentBlockType, req.BlockData); !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		encoded, err := json.Marshal(req.BlockData)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
			return
		}
		blockDataJSON = encoded
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
			lock_min_age = COALESCE($8, lock_min_age),
			block_data = COALESCE($9, block_data)
		WHERE id = $10
	`, req.Title, req.URL, req.IsActive, starts, ends, req.LockType, req.LockCode, req.LockMinAge, blockDataJSON, linkID)
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

type contactFormRequest struct {
	Name    string `json:"name" binding:"required,max=100"`
	Email   string `json:"email" binding:"required,email"`
	Message string `json:"message" binding:"required,max=2000"`
}

// SubmitContactForm — No.77 (Sprint 9): endpoint PUBLIK untuk blok Formulir
// Kontak. Notifikasi ke kreator dikirim ASINKRON lewat queue (lihat
// queue.TypeContactFormNotification) -- pengunjung tidak pernah menunggu
// SMTP selesai, dan lambat/gagalnya SMTP tidak pernah membuat submit ini
// gagal di sisi pengunjung.
func (h *LinksHandler) SubmitContactForm(c *gin.Context) {
	linkID := c.Param("id")

	var req contactFormRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var blockType, creatorEmail, pageUsername string
	err := h.DB.QueryRow(ctx, `
		SELECT l.block_type, u.email, u.username
		FROM links l JOIN pages p ON p.id = l.page_id JOIN users u ON u.id = p.user_id
		WHERE l.id = $1
	`, linkID).Scan(&blockType, &creatorEmail, &pageUsername)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
		return
	}
	if blockType != "contact_form" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blok ini bukan formulir kontak"})
		return
	}

	if h.Queue == nil {
		c.JSON(http.StatusOK, gin.H{"message": "pesan terkirim"})
		return
	}
	task, err := queue.NewContactFormTask(queue.ContactFormPayload{
		CreatorEmail: creatorEmail, PageUsername: pageUsername,
		VisitorName: req.Name, VisitorEmail: req.Email, Message: req.Message,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengirim pesan"})
		return
	}
	if _, err := h.Queue.Enqueue(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengirim pesan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "pesan terkirim"})
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
			WHERE id = $2 AND page_id = (SELECT id FROM pages WHERE user_id = $3 AND is_primary = true)
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

// ReorderForPage — versi Reorder untuk halaman TAMBAHAN (No.98), page_id
// eksplisit dari URL alih-alih diasumsikan halaman utama.
func (h *LinksHandler) ReorderForPage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	var req []reorderItem
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, item := range req {
		res, err := tx.Exec(ctx, `UPDATE links SET position = $1 WHERE id = $2 AND page_id = $3`, item.Position, item.ID, pageID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan urutan"})
			return
		}
		if res.RowsAffected() == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "tautan bukan milik halaman ini"})
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

// ---------- No.98 (Sprint 14): tautan untuk halaman bio TAMBAHAN ----------
//
// Update/Delete/Unlock/SubmitContactForm/Reorder TIDAK perlu versi baru --
// ownsLink() sudah memeriksa kepemilikan lewat p.user_id tanpa peduli
// is_primary, jadi rute /dashboard/links/:id yang sudah ada otomatis bekerja
// untuk tautan di halaman MANA PUN milik kreator yang sama, termasuk halaman
// tambahan. Hanya List & Create yang perlu versi page-scoped baru, karena
// versi lama SELALU menargetkan halaman utama (WHERE ... AND is_primary = true).

// ListForPage — GET /dashboard/pages/:id/links, dipakai dashboard halaman
// tambahan (juga bisa dipakai untuk halaman utama kalau perlu, tidak
// dibatasi is_primary di sini karena kepemilikan sudah cukup sebagai gerbang).
func (h *LinksHandler) ListForPage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT id, title, url, position, is_active, starts_at, ends_at,
			COALESCE(lock_type, ''), lock_code, lock_min_age, block_type, block_data
		FROM links WHERE page_id = $1
		ORDER BY position ASC
	`, pageID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat tautan"})
		return
	}
	defer rows.Close()

	items := []linkItem{}
	for rows.Next() {
		var it linkItem
		if err := rows.Scan(&it.ID, &it.Title, &it.URL, &it.Position, &it.IsActive, &it.StartsAt, &it.EndsAt,
			&it.LockType, &it.LockCode, &it.LockMinAge, &it.BlockType, &it.BlockData); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// CreateForPage — POST /dashboard/pages/:id/links.
func (h *LinksHandler) CreateForPage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	var req createLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
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
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO links (id, page_id, title, url, position, is_active)
		VALUES ($1, $2, $3, $4, $5, true)
	`, id, pageID, req.Title, req.URL, nextPosition); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat tautan"})
		return
	}

	c.JSON(http.StatusCreated, linkItem{ID: id, Title: req.Title, URL: req.URL, Position: nextPosition, IsActive: true, BlockType: "link", BlockData: json.RawMessage("{}")})
}

// CreateBlockForPage — No.99 (Sprint 14): blok builder landing page
// (heading/text/image/button, plus video/faq/contact_form yang sudah ada
// dari No.77) untuk halaman TAMBAHAN mana pun (bio atau landing).
func (h *LinksHandler) CreateBlockForPage(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	var req createBlockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.BlockData == nil {
		req.BlockData = map[string]any{}
	}
	if req.BlockType == "button" && req.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url wajib diisi untuk tombol CTA"})
		return
	}
	if msg, ok := validateBlockData(req.BlockType, req.BlockData); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if !h.ownsPage(ctx, pageID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
		return
	}

	id, position, blockDataJSON, err := h.insertBlock(ctx, pageID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, linkItem{
		ID: id, Title: req.Title, URL: req.URL, Position: position, IsActive: true,
		BlockType: req.BlockType, BlockData: blockDataJSON,
	})
}

func (h *LinksHandler) ownsPage(ctx context.Context, pageID, userID string) bool {
	var exists int
	err := h.DB.QueryRow(ctx, `SELECT 1 FROM pages WHERE id = $1 AND user_id = $2`, pageID, userID).Scan(&exists)
	if err != nil && err != pgx.ErrNoRows {
		return false
	}
	return err == nil
}
