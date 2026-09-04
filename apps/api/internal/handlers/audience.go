package handlers

import (
	"context"
	"github.com/jeonme/api/internal/storage"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/queue"
)

// AudienceHandler mengimplementasikan No.73 (Sprint 8): blok pengumpulan
// email/nomor WhatsApp pengunjung + Manajer Audiens. Diadaptasi dari
// Audience Manager Linktree/Lynk.id -- versi awal menyentralisasi DUA
// sumber (form pengumpulan lead & pembeli produk) dalam satu daftar, TANPA
// fitur "subscribe-lock" (mengunci tautan di balik form) -- itu fitur
// terpisah yang lebih besar, dicatat sebagai pekerjaan lanjutan kalau
// tervalidasi.
type AudienceHandler struct {
	DB    *pgxpool.Pool
	RDB   *redis.Client
	Queue *asynq.Client
	// Storage -- presigned URL file lead magnet (Subscribe v2, migrasi 000086).
	// Boleh nil di test; lead magnet lalu dilewati (soft-fail).
	Storage *storage.Client
}

func NewAudienceHandler(db *pgxpool.Pool, rdb *redis.Client, queueClient *asynq.Client, store *storage.Client) *AudienceHandler {
	return &AudienceHandler{DB: db, RDB: rdb, Queue: queueClient, Storage: store}
}

type leadCaptureSettingsResponse struct {
	IsActive        bool   `json:"is_active"`
	Title           string `json:"title"`
	CollectEmail    bool   `json:"collect_email"`
	CollectWhatsapp bool   `json:"collect_whatsapp"`
	// Subscribe v2 (benchmark Linktree "Member", migrasi 000086).
	CollectTelegram  bool   `json:"collect_telegram"`
	MagnetProductID  string `json:"magnet_product_id"`
	WelcomeVoucherID string `json:"welcome_voucher_id"`
}

// GetLeadCaptureSettings — dipakai halaman pengaturan dashboard. Baris
// lead_capture_settings baru dibuat saat pertama kali disimpan (Upsert),
// jadi belum-pernah-disimpan mengembalikan default nonaktif, BUKAN 404.
func (h *AudienceHandler) GetLeadCaptureSettings(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	resp := leadCaptureSettingsResponse{Title: "Dapatkan info terbaru dariku", CollectEmail: true}
	err := h.DB.QueryRow(ctx, `
		SELECT is_active, title, collect_email, collect_whatsapp, collect_telegram,
		       COALESCE(magnet_product_id::text, ''), COALESCE(welcome_voucher_id::text, '')
		FROM lead_capture_settings WHERE user_id = $1
	`, userID).Scan(&resp.IsActive, &resp.Title, &resp.CollectEmail, &resp.CollectWhatsapp, &resp.CollectTelegram, &resp.MagnetProductID, &resp.WelcomeVoucherID)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pengaturan audiens"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

type upsertLeadCaptureRequest struct {
	IsActive        bool   `json:"is_active"`
	Title           string `json:"title" binding:"max=200"`
	CollectEmail    bool   `json:"collect_email"`
	CollectWhatsapp bool   `json:"collect_whatsapp"`
	CollectTelegram bool   `json:"collect_telegram"`
	// MagnetProductID / WelcomeVoucherID -- kosong = tidak ada. Kepemilikan
	// dicek server-side; produk lead magnet wajib punya file.
	MagnetProductID  string `json:"magnet_product_id"`
	WelcomeVoucherID string `json:"welcome_voucher_id"`
}

// UpsertLeadCaptureSettings — mengaktifkan/menonaktifkan blok pengumpulan
// lead & mengatur field mana yang diminta dari pengunjung.
func (h *AudienceHandler) UpsertLeadCaptureSettings(c *gin.Context) {
	var req upsertLeadCaptureRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	if req.IsActive && strings.TrimSpace(req.Title) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "judul blok wajib diisi"})
		return
	}
	if req.IsActive && !req.CollectEmail && !req.CollectWhatsapp && !req.CollectTelegram {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pilih minimal satu jenis data yang dikumpulkan"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// Lead magnet: produk harus milik sendiri DAN punya file -- tanpa file
	// tidak ada yang bisa "diunduh setelah mendaftar".
	magnetID := strings.TrimSpace(req.MagnetProductID)
	if magnetID != "" {
		var fileKey string
		if err := h.DB.QueryRow(ctx, `SELECT file_key FROM products WHERE id = $1 AND user_id = $2`, magnetID, userID).Scan(&fileKey); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "produk lead magnet tidak ditemukan"})
			return
		}
		if fileKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "produk lead magnet belum punya file"})
			return
		}
	}
	voucherID := strings.TrimSpace(req.WelcomeVoucherID)
	if voucherID != "" {
		var n int
		if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM vouchers WHERE id = $1 AND user_id = $2`, voucherID, userID).Scan(&n); err != nil || n == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "voucher sambutan tidak ditemukan"})
			return
		}
	}

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO lead_capture_settings (user_id, is_active, title, collect_email, collect_whatsapp, collect_telegram, magnet_product_id, welcome_voucher_id)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')::uuid, NULLIF($8, '')::uuid)
		ON CONFLICT (user_id) DO UPDATE SET
			is_active = EXCLUDED.is_active, title = EXCLUDED.title,
			collect_email = EXCLUDED.collect_email, collect_whatsapp = EXCLUDED.collect_whatsapp,
			collect_telegram = EXCLUDED.collect_telegram,
			magnet_product_id = EXCLUDED.magnet_product_id, welcome_voucher_id = EXCLUDED.welcome_voucher_id
	`, userID, req.IsActive, strings.TrimSpace(req.Title), req.CollectEmail, req.CollectWhatsapp, req.CollectTelegram, magnetID, voucherID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pengaturan audiens"})
		return
	}

	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusOK, gin.H{"message": "pengaturan audiens disimpan"})
}

type subscribeLeadRequest struct {
	Username         string `json:"username" binding:"required"`
	Email            string `json:"email"`
	WhatsappNumber   string `json:"whatsapp_number"`
	TelegramUsername string `json:"telegram_username"`
}

// normalizeTelegram -- "@akbar" / "t.me/akbar" / "akbar" -> "akbar"; hanya
// huruf/angka/underscore, maks 32 (batas Telegram). Kosong kalau tidak valid.
// Murni, diuji unit.
func normalizeTelegram(raw string) string {
	v := strings.TrimSpace(strings.ToLower(raw))
	v = strings.TrimPrefix(v, "https://")
	v = strings.TrimPrefix(v, "http://")
	v = strings.TrimPrefix(v, "t.me/")
	v = strings.TrimPrefix(v, "@")
	if v == "" || len(v) > 32 {
		return ""
	}
	for _, r := range v {
		if !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_') {
			return ""
		}
	}
	return v
}

// SubscribeLead — endpoint PUBLIK (dipanggil dari blok pengumpulan lead di
// halaman publik). Menolak kalau kreator belum mengaktifkan blok ini
// (mencegah pengiriman ke kreator yang tidak minta), dan menolak kalau
// keduanya email & whatsapp_number kosong.
func (h *AudienceHandler) SubscribeLead(c *gin.Context) {
	var req subscribeLeadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	whatsapp := strings.TrimSpace(req.WhatsappNumber)
	telegram := normalizeTelegram(req.TelegramUsername)
	if email == "" && whatsapp == "" && telegram == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "isi email, nomor WhatsApp, atau username Telegram"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var creatorUserID string
	var isActive bool
	// Hadiah setelah mendaftar (Subscribe v2): file lead magnet & kode voucher
	// sambutan, dibaca dalam satu query supaya tidak ada round-trip tambahan
	// di jalur publik yang sering dipanggil.
	var magnetFileKey, magnetName, voucherCode string
	err := h.DB.QueryRow(ctx, `
		SELECT u.id, COALESCE(lcs.is_active, false),
		       COALESCE(p.file_key, ''), COALESCE(p.name, ''),
		       COALESCE(CASE WHEN v.is_active AND (v.expires_at IS NULL OR v.expires_at > now())
		                          AND (v.max_uses IS NULL OR v.used_count < v.max_uses)
		                     THEN v.code END, '')
		FROM users u
		LEFT JOIN lead_capture_settings lcs ON lcs.user_id = u.id
		LEFT JOIN products p ON p.id = lcs.magnet_product_id
		LEFT JOIN vouchers v ON v.id = lcs.welcome_voucher_id
		WHERE u.username = $1
	`, req.Username).Scan(&creatorUserID, &isActive, &magnetFileKey, &magnetName, &voucherCode)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}
	if !isActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blok pengumpulan belum aktif"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO subscribers (creator_user_id, email, whatsapp_number, telegram_username, source)
		VALUES ($1, $2, $3, $4, 'lead_capture')
		ON CONFLICT (creator_user_id, email) WHERE email <> '' DO UPDATE SET
			whatsapp_number = CASE WHEN EXCLUDED.whatsapp_number <> '' THEN EXCLUDED.whatsapp_number ELSE subscribers.whatsapp_number END,
			telegram_username = CASE WHEN EXCLUDED.telegram_username <> '' THEN EXCLUDED.telegram_username ELSE subscribers.telegram_username END
	`, creatorUserID, email, whatsapp, telegram); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data"})
		return
	}

	resp := gin.H{"message": "berhasil mendaftar"}
	// Lead magnet: presigned URL 15 menit (sama dengan REQ-F-304 unduhan
	// produk). Soft-fail: kalau storage tidak siap, pendaftaran tetap sukses
	// -- hadiah adalah pendukung, bukan inti. Watermark PDF sengaja TIDAK
	// diterapkan: itu terikat identitas pembeli+order, sedangkan lead magnet
	// memang dibagikan cuma-cuma.
	if magnetFileKey != "" && h.Storage != nil {
		if url, err := h.Storage.PresignedDownloadURL(ctx, magnetFileKey, 15*time.Minute); err == nil {
			resp["download_url"] = url
			resp["download_name"] = magnetName
		} else {
			log.Printf("audience: gagal membuat URL lead magnet untuk %s: %v", creatorUserID, err)
		}
	}
	if voucherCode != "" {
		resp["voucher_code"] = voucherCode
	}
	c.JSON(http.StatusCreated, resp)
}

type audienceContact struct {
	Name           string   `json:"name"`
	Email          string   `json:"email"`
	WhatsappNumber string   `json:"whatsapp_number"`
	Telegram       string   `json:"telegram_username"`
	Sources        []string `json:"sources"`
	JoinedAt       string   `json:"joined_at"`
	// Tags/Notes -- CRM ringan (migrasi 000083), digabung dari
	// audience_contact_meta lewat contactKey(). Selalu non-nil supaya
	// klien tidak perlu cek null.
	Tags  []string `json:"tags"`
	Notes string   `json:"notes"`
}

// contactKey -- identitas satu kontak lintas sumber: email (lowercase)
// kalau ada, kalau tidak nomor WA berawalan "wa:". Dipakai untuk kunci
// audience_contact_meta DAN untuk mencocokkan saat baca.
func contactKey(email, whatsapp string) string {
	if e := strings.ToLower(strings.TrimSpace(email)); e != "" {
		return e
	}
	if w := strings.TrimSpace(whatsapp); w != "" {
		return "wa:" + w
	}
	return ""
}

// GetAudience — Manajer Audiens: menyentralisasi subscriber (dari form
// pengumpulan lead) dan pembeli (dari orders yang lunas) dalam SATU daftar,
// digabung lewat email supaya orang yang sama tidak muncul dua baris kalau
// dia subscribe DAN pernah membeli. Diekspor ke CSV di sisi frontend
// (tidak ada endpoint CSV terpisah -- daftar ini sudah cukup kecil untuk
// diubah jadi CSV langsung di browser).
func (h *AudienceHandler) GetAudience(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	byEmail := map[string]*audienceContact{}
	order := []*audienceContact{}

	subRows, err := h.DB.Query(ctx, `
		SELECT email, whatsapp_number, telegram_username, name, source, created_at FROM subscribers WHERE creator_user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat subscriber"})
		return
	}
	for subRows.Next() {
		var email, whatsapp, telegram, name, source string
		var joinedAt time.Time
		if err := subRows.Scan(&email, &whatsapp, &telegram, &name, &source, &joinedAt); err != nil {
			continue
		}
		item := &audienceContact{Email: email, WhatsappNumber: whatsapp, Telegram: telegram, Name: name, Sources: []string{source}, JoinedAt: joinedAt.Format(time.RFC3339)}
		order = append(order, item)
		if email != "" {
			byEmail[email] = item
		}
	}
	subRows.Close()

	buyerRows, err := h.DB.Query(ctx, `
		SELECT o.buyer_email, MIN(o.created_at) FROM orders o
		JOIN products p ON p.id = o.product_id
		WHERE p.user_id = $1 AND o.status = 'paid'
		GROUP BY o.buyer_email
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pembeli"})
		return
	}
	for buyerRows.Next() {
		var email string
		var joinedAt time.Time
		if err := buyerRows.Scan(&email, &joinedAt); err != nil {
			continue
		}
		if existing, ok := byEmail[email]; ok {
			existing.Sources = append(existing.Sources, "buyer")
			continue
		}
		item := &audienceContact{Email: email, Sources: []string{"buyer"}, JoinedAt: joinedAt.Format(time.RFC3339)}
		order = append(order, item)
		byEmail[email] = item
	}
	buyerRows.Close()

	// Gabungkan tag/catatan. Soft-fail: kalau tabel meta gagal dibaca,
	// daftar kontak tetap tampil tanpa tag -- ini fitur pendukung.
	meta := map[string]struct {
		tags  []string
		notes string
	}{}
	if metaRows, err := h.DB.Query(ctx, `
		SELECT contact_key, tags, notes FROM audience_contact_meta WHERE creator_user_id = $1
	`, userID); err == nil {
		for metaRows.Next() {
			var key, notes string
			var tags []string
			if err := metaRows.Scan(&key, &tags, &notes); err == nil {
				meta[key] = struct {
					tags  []string
					notes string
				}{tags, notes}
			}
		}
		metaRows.Close()
	}

	contacts := make([]audienceContact, 0, len(order))
	for _, it := range order {
		it.Tags = []string{}
		if m, ok := meta[contactKey(it.Email, it.WhatsappNumber)]; ok {
			if m.tags != nil {
				it.Tags = m.tags
			}
			it.Notes = m.notes
		}
		contacts = append(contacts, *it)
	}

	c.JSON(http.StatusOK, contacts)
}

// ---------- CRM ringan: tag & catatan per kontak ----------

type upsertContactMetaRequest struct {
	Email          string   `json:"email"`
	WhatsappNumber string   `json:"whatsapp_number"`
	Tags           []string `json:"tags"`
	Notes          string   `json:"notes"`
}

// normalizeTags -- rapikan tag: trim, buang kosong/duplikat (case-insensitive),
// batasi jumlah & panjang supaya UI tetap terbaca dan kolom tidak jadi
// tempat sampah. Dipisah jadi fungsi murni supaya bisa diuji tanpa DB.
func normalizeTags(raw []string) []string {
	const maxTags, maxLen = 20, 30
	seen := map[string]bool{}
	out := make([]string, 0, len(raw))
	for _, t := range raw {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if len([]rune(t)) > maxLen {
			t = string([]rune(t)[:maxLen])
		}
		k := strings.ToLower(t)
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, t)
		if len(out) == maxTags {
			break
		}
	}
	return out
}

func (h *AudienceHandler) UpsertContactMeta(c *gin.Context) {
	userID := c.GetString("userID")
	var req upsertContactMetaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "payload tidak valid"})
		return
	}
	key := contactKey(req.Email, req.WhatsappNumber)
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "kontak butuh email atau nomor WhatsApp"})
		return
	}
	notes := strings.TrimSpace(req.Notes)
	if len([]rune(notes)) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "catatan maksimal 2000 karakter"})
		return
	}
	tags := normalizeTags(req.Tags)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// Tag kosong & catatan kosong = hapus barisnya, supaya tabel tidak
	// menumpuk baris hampa untuk kontak yang cuma pernah diedit lalu
	// dikosongkan lagi.
	if len(tags) == 0 && notes == "" {
		if _, err := h.DB.Exec(ctx, `DELETE FROM audience_contact_meta WHERE creator_user_id = $1 AND contact_key = $2`, userID, key); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan kontak"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"tags": []string{}, "notes": ""})
		return
	}
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO audience_contact_meta (creator_user_id, contact_key, tags, notes, updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (creator_user_id, contact_key)
		DO UPDATE SET tags = EXCLUDED.tags, notes = EXCLUDED.notes, updated_at = now()
	`, userID, key, tags, notes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan kontak"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tags": tags, "notes": notes})
}

type audienceBroadcastItem struct {
	ID             string  `json:"id"`
	Subject        string  `json:"subject"`
	RecipientCount int     `json:"recipient_count"`
	SentCount      int     `json:"sent_count"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"created_at"`
	CompletedAt    *string `json:"completed_at"`
}

// ListBroadcasts — riwayat broadcast email yang pernah dikirim kreator ini,
// dipakai halaman Audiens supaya kreator tahu apa yang sudah pernah
// dikirim & berapa yang benar-benar sampai (sent_count, diisi worker
// setelah selesai -- lihat HandleAudienceBroadcast).
func (h *AudienceHandler) ListBroadcasts(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, subject, recipient_count, sent_count, status, created_at, completed_at
		FROM audience_broadcasts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat riwayat broadcast"})
		return
	}
	defer rows.Close()

	items := []audienceBroadcastItem{}
	for rows.Next() {
		var it audienceBroadcastItem
		var createdAt time.Time
		var completedAt *time.Time
		if err := rows.Scan(&it.ID, &it.Subject, &it.RecipientCount, &it.SentCount, &it.Status, &createdAt, &completedAt); err != nil {
			continue
		}
		it.CreatedAt = createdAt.Format(time.RFC3339)
		if completedAt != nil {
			s := completedAt.Format(time.RFC3339)
			it.CompletedAt = &s
		}
		items = append(items, it)
	}

	c.JSON(http.StatusOK, items)
}

type createBroadcastRequest struct {
	Subject string `json:"subject" binding:"required,max=200"`
	Body    string `json:"body" binding:"required,max=5000"`
}

// CreateBroadcast — Gap #3 benchmark kompetitif (9 Agustus 2026): kirim
// email ke SEMUA subscriber (bukan pembeli, lihat catatan consent di
// migrations/000059) sekaligus. Pengiriman sungguhan ASINKRON lewat
// worker (HandleAudienceBroadcast) -- endpoint ini cuma memvalidasi,
// mencatat baris, dan enqueue task, supaya request selesai cepat walau
// subscriber-nya ratusan.
func (h *AudienceHandler) CreateBroadcast(c *gin.Context) {
	var req createBroadcastRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	subject := strings.TrimSpace(req.Subject)
	body := strings.TrimSpace(req.Body)
	if subject == "" || body == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subjek dan isi pesan wajib diisi"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// Guard anti-double-klik/spam sederhana (MVP -- bukan sistem kuota
	// bertingkat free/Premium, itu keputusan produk terpisah yang belum
	// diminta): tolak kalau kreator ini baru saja membuat broadcast dalam
	// 5 menit terakhir, apa pun statusnya.
	var recentCount int
	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM audience_broadcasts WHERE user_id = $1 AND created_at > now() - interval '5 minutes'
	`, userID).Scan(&recentCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa riwayat broadcast"})
		return
	}
	if recentCount > 0 {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "tunggu beberapa menit sebelum mengirim broadcast lagi"})
		return
	}

	var recipientCount int
	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(DISTINCT email) FROM subscribers WHERE creator_user_id = $1 AND email <> ''
	`, userID).Scan(&recipientCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung subscriber"})
		return
	}
	if recipientCount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "belum ada subscriber dengan email untuk dikirimi -- aktifkan blok pengumpulan lead dulu"})
		return
	}

	var broadcastID string
	if err := h.DB.QueryRow(ctx, `
		INSERT INTO audience_broadcasts (user_id, subject, body, recipient_count, status)
		VALUES ($1, $2, $3, $4, 'queued') RETURNING id
	`, userID, subject, body, recipientCount).Scan(&broadcastID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan broadcast"})
		return
	}

	if h.Queue != nil {
		if task, err := queue.NewAudienceBroadcastTask(broadcastID); err == nil {
			_, _ = h.Queue.Enqueue(task)
		}
	}

	c.JSON(http.StatusCreated, gin.H{"message": "broadcast diantre untuk dikirim", "id": broadcastID, "recipient_count": recipientCount})
}
