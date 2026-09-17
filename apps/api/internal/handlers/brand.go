package handlers

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BrandHandler -- marketplace Brand <-> Kreator (Sponsored Links & Brand
// Deals), benchmark Linktree "Earn" 3 September 2026. Lihat catatan desain
// & CAKUPAN MVP di migrations/000085_brand_campaigns.up.sql: fee bersifat
// informatif, pembayaran belum lewat platform.
//
// Dua sisi dalam satu handler:
//   - sisi KREATOR: ListOpenCampaigns, Apply, ListMyApplications,
//     PublishSponsoredLink.
//   - sisi BRAND: CreateCampaign, ListMyCampaigns, UpdateCampaignStatus,
//     ListCampaignApplications, DecideApplication.
//
// Semua route didaftarkan langsung di grup dashboard (owner-only, di luar
// ActAs): campaign & lamaran terikat identitas akun, kolaborator tidak
// boleh melamar/menawar atas nama pemilik workspace.
type BrandHandler struct {
	DB *pgxpool.Pool
}

func NewBrandHandler(db *pgxpool.Pool) *BrandHandler {
	return &BrandHandler{DB: db}
}

type brandCampaignInput struct {
	Kind     string `json:"kind"`
	Title    string `json:"title"`
	Brief    string `json:"brief"`
	URL      string `json:"url"`
	Category string `json:"category"`
	FeeIDR   int64  `json:"fee_idr"`
	Slots    int    `json:"slots"`
}

// validateCampaignInput -- aturan murni tanpa DB (diuji unit). Mengembalikan
// pesan error Bahasa Indonesia yang langsung bisa ditampilkan, atau "".
func validateCampaignInput(in *brandCampaignInput) string {
	in.Kind = strings.TrimSpace(in.Kind)
	in.Title = strings.TrimSpace(in.Title)
	in.Brief = strings.TrimSpace(in.Brief)
	in.URL = strings.TrimSpace(in.URL)
	in.Category = strings.TrimSpace(in.Category)
	if in.Kind != "sponsored_link" && in.Kind != "brand_deal" {
		return "jenis campaign harus sponsored_link atau brand_deal"
	}
	if n := len([]rune(in.Title)); n < 3 || n > 120 {
		return "judul 3-120 karakter"
	}
	// 10000 (bukan 3000 seperti semula): brief SEKARANG HTML rich text
	// (RichTextEditor di dashboard/brand, 18 September 2026) -- tag
	// <p>/<ul>/<li>/<strong> ikut terhitung, jadi batas lama akan menolak
	// brief yang sebagai plain text dulunya masih muat. Disanitasi
	// (DOMPurify whitelist sempit) di sisi klien saat dirender, pola sama
	// seperti isi blok "text"/jawaban FAQ.
	if len([]rune(in.Brief)) > 10000 {
		return "brief maksimal 10000 karakter"
	}
	if len([]rune(in.Category)) > 60 {
		return "kategori maksimal 60 karakter"
	}
	if in.FeeIDR < 0 {
		return "fee tidak boleh negatif"
	}
	if in.Slots == 0 {
		in.Slots = 1
	}
	if in.Slots < 1 || in.Slots > 100 {
		return "slot kreator 1-100"
	}
	// Sponsored link WAJIB punya URL yang valid -- itulah yang akan
	// dipublikasikan di halaman kreator. Brand deal boleh tanpa URL.
	if in.Kind == "sponsored_link" {
		u, err := url.Parse(in.URL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return "URL tautan bersponsor harus diawali http:// atau https://"
		}
	} else if in.URL != "" {
		if u, err := url.Parse(in.URL); err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return "URL harus diawali http:// atau https://"
		}
	}
	return ""
}

type brandCampaign struct {
	ID            string `json:"id"`
	Kind          string `json:"kind"`
	Title         string `json:"title"`
	Brief         string `json:"brief"`
	URL           string `json:"url"`
	Category      string `json:"category"`
	FeeIDR        int64  `json:"fee_idr"`
	Slots         int    `json:"slots"`
	Status        string `json:"status"`
	BrandUsername string `json:"brand_username"`
	AcceptedCount int    `json:"accepted_count"`
	AppliedCount  int    `json:"applied_count"`
	// MyApplicationStatus -- hanya di daftar sisi kreator: "" kalau belum
	// melamar. Menghemat satu panggilan untuk tahu tombol apa yang tampil.
	MyApplicationStatus string `json:"my_application_status,omitempty"`
	MyApplicationID     string `json:"my_application_id,omitempty"`
	CreatedAt           string `json:"created_at"`
}

const campaignSelect = `
	SELECT c.id, c.kind, c.title, c.brief, c.url, c.category, c.fee_idr, c.slots, c.status, u.username,
	       (SELECT COUNT(*) FROM brand_campaign_applications a WHERE a.campaign_id = c.id AND a.status IN ('accepted', 'completed')),
	       (SELECT COUNT(*) FROM brand_campaign_applications a WHERE a.campaign_id = c.id),
	       c.created_at
	FROM brand_campaigns c JOIN users u ON u.id = c.brand_user_id`

func scanCampaign(rows pgx.Rows) (brandCampaign, error) {
	var it brandCampaign
	var createdAt time.Time
	err := rows.Scan(&it.ID, &it.Kind, &it.Title, &it.Brief, &it.URL, &it.Category, &it.FeeIDR, &it.Slots, &it.Status,
		&it.BrandUsername, &it.AcceptedCount, &it.AppliedCount, &createdAt)
	it.CreatedAt = createdAt.Format(time.RFC3339)
	return it, err
}

// notify -- notifikasi dalam-app, soft-fail (pola sama worker order_paid).
func (h *BrandHandler) notify(ctx context.Context, userID, typ, title, body, link string) {
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO notifications (user_id, type, title, body, link_url) VALUES ($1, $2, $3, $4, $5)
	`, userID, typ, title, body, link); err != nil {
		log.Printf("brand: gagal membuat notifikasi %s untuk %s: %v", typ, userID, err)
	}
}

// ---------- sisi KREATOR ----------

// ListOpenCampaigns -- penawaran terbuka dari brand LAIN, dengan status
// lamaran saya kalau ada. ?kind= menyaring sponsored_link / brand_deal.
func (h *BrandHandler) ListOpenCampaigns(c *gin.Context) {
	userID := c.GetString("userID")
	kind := c.Query("kind")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, campaignSelect+`
		WHERE c.status = 'open' AND c.brand_user_id <> $1 AND ($2 = '' OR c.kind = $2)
		ORDER BY c.created_at DESC LIMIT 200
	`, userID, kind)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat penawaran"})
		return
	}
	items := []brandCampaign{}
	ids := []string{}
	for rows.Next() {
		it, err := scanCampaign(rows)
		if err != nil {
			continue
		}
		items = append(items, it)
		ids = append(ids, it.ID)
	}
	rows.Close()

	if len(ids) > 0 {
		mine := map[string][2]string{}
		if r2, err := h.DB.Query(ctx, `
			SELECT campaign_id, id, status FROM brand_campaign_applications
			WHERE creator_user_id = $1 AND campaign_id = ANY($2)
		`, userID, ids); err == nil {
			for r2.Next() {
				var cid, aid, st string
				if err := r2.Scan(&cid, &aid, &st); err == nil {
					mine[cid] = [2]string{aid, st}
				}
			}
			r2.Close()
		}
		for i := range items {
			if m, ok := mine[items[i].ID]; ok {
				items[i].MyApplicationID = m[0]
				items[i].MyApplicationStatus = m[1]
			}
		}
	}
	c.JSON(http.StatusOK, items)
}

type applyRequest struct {
	Pitch string `json:"pitch"`
}

func (h *BrandHandler) Apply(c *gin.Context) {
	userID := c.GetString("userID")
	campaignID := c.Param("id")
	var req applyRequest
	_ = c.ShouldBindJSON(&req)
	req.Pitch = strings.TrimSpace(req.Pitch)
	if len([]rune(req.Pitch)) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pitch maksimal 2000 karakter"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var brandUserID, status, title string
	var slots, accepted int
	if err := h.DB.QueryRow(ctx, `
		SELECT c.brand_user_id, c.status, c.title, c.slots,
		       (SELECT COUNT(*) FROM brand_campaign_applications a WHERE a.campaign_id = c.id AND a.status IN ('accepted', 'completed'))
		FROM brand_campaigns c WHERE c.id = $1
	`, campaignID).Scan(&brandUserID, &status, &title, &slots, &accepted); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "campaign tidak ditemukan"})
		return
	}
	if brandUserID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tidak bisa melamar campaign sendiri"})
		return
	}
	if status != "open" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "campaign sudah ditutup"})
		return
	}
	if accepted >= slots {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slot kreator sudah penuh"})
		return
	}
	var appID string
	err := h.DB.QueryRow(ctx, `
		INSERT INTO brand_campaign_applications (id, campaign_id, creator_user_id, pitch)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (campaign_id, creator_user_id) DO NOTHING
		RETURNING id
	`, uuid.NewString(), campaignID, userID, req.Pitch).Scan(&appID)
	if err == pgx.ErrNoRows {
		c.JSON(http.StatusConflict, gin.H{"error": "kamu sudah melamar campaign ini"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengirim lamaran"})
		return
	}
	h.notify(ctx, brandUserID, "brand_application", "Lamaran baru masuk",
		"Seorang kreator melamar campaign \""+title+"\".", "/dashboard/brand?view=campaigns")
	c.JSON(http.StatusCreated, gin.H{"id": appID, "status": "applied"})
}

type myApplication struct {
	ID        string        `json:"id"`
	Status    string        `json:"status"`
	Pitch     string        `json:"pitch"`
	LinkID    *string       `json:"link_id"`
	CreatedAt string        `json:"created_at"`
	Campaign  brandCampaign `json:"campaign"`
}

func (h *BrandHandler) ListMyApplications(c *gin.Context) {
	userID := c.GetString("userID")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.DB.Query(ctx, `
		SELECT a.id, a.status, a.pitch, a.link_id, a.created_at,
		       c.id, c.kind, c.title, c.brief, c.url, c.category, c.fee_idr, c.slots, c.status, u.username, c.created_at
		FROM brand_campaign_applications a
		JOIN brand_campaigns c ON c.id = a.campaign_id
		JOIN users u ON u.id = c.brand_user_id
		WHERE a.creator_user_id = $1
		ORDER BY a.created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat lamaran"})
		return
	}
	defer rows.Close()
	out := []myApplication{}
	for rows.Next() {
		var it myApplication
		var createdAt, cCreated time.Time
		if err := rows.Scan(&it.ID, &it.Status, &it.Pitch, &it.LinkID, &createdAt,
			&it.Campaign.ID, &it.Campaign.Kind, &it.Campaign.Title, &it.Campaign.Brief, &it.Campaign.URL, &it.Campaign.Category,
			&it.Campaign.FeeIDR, &it.Campaign.Slots, &it.Campaign.Status, &it.Campaign.BrandUsername, &cCreated); err != nil {
			continue
		}
		it.CreatedAt = createdAt.Format(time.RFC3339)
		it.Campaign.CreatedAt = cCreated.Format(time.RFC3339)
		out = append(out, it)
	}
	c.JSON(http.StatusOK, out)
}

// PublishSponsoredLink -- kreator yang lamarannya DITERIMA memasang tautan
// campaign di halaman utamanya. Memakai tabel links biasa (posisi di akhir,
// deskripsi "Sponsored") supaya tautan itu dikelola seperti tautan lain --
// bisa dipindah/dinonaktifkan dari Link Bio. Sekali saja per lamaran.
func (h *BrandHandler) PublishSponsoredLink(c *gin.Context) {
	userID := c.GetString("userID")
	appID := c.Param("id")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()

	var status, kind, title, linkURL, brandUserID string
	var linkID *string
	if err := h.DB.QueryRow(ctx, `
		SELECT a.status, a.link_id, c.kind, c.title, c.url, c.brand_user_id
		FROM brand_campaign_applications a JOIN brand_campaigns c ON c.id = a.campaign_id
		WHERE a.id = $1 AND a.creator_user_id = $2
	`, appID, userID).Scan(&status, &linkID, &kind, &title, &linkURL, &brandUserID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "lamaran tidak ditemukan"})
		return
	}
	if kind != "sponsored_link" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hanya campaign tautan bersponsor yang bisa dipublikasikan"})
		return
	}
	if status != "accepted" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lamaran belum diterima brand"})
		return
	}
	if linkID != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "tautan sudah dipublikasikan"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var pageID string
	if err := tx.QueryRow(ctx, `SELECT id FROM pages WHERE user_id = $1 AND is_primary = true`, userID).Scan(&pageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "halaman utama tidak ditemukan"})
		return
	}
	var position int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(position) + 1, 0) FROM links WHERE page_id = $1`, pageID).Scan(&position); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung posisi tautan"})
		return
	}
	newLinkID := uuid.NewString()
	if _, err := tx.Exec(ctx, `
		INSERT INTO links (id, page_id, title, url, position, is_active, description)
		VALUES ($1, $2, $3, $4, $5, true, 'Sponsored')
	`, newLinkID, pageID, title, linkURL, position); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat tautan"})
		return
	}
	if _, err := tx.Exec(ctx, `
		UPDATE brand_campaign_applications SET link_id = $2, updated_at = now() WHERE id = $1
	`, appID, newLinkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan tautan ke lamaran"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan"})
		return
	}
	// Cache halaman publik (Redis, TTL 30 detik) dibiarkan kedaluwarsa
	// sendiri -- sama seperti perubahan tautan lain lewat handler links.
	h.notify(ctx, brandUserID, "brand_link_published", "Tautan bersponsor tayang",
		"Kreator memublikasikan tautan campaign \""+title+"\" di halamannya.", "/dashboard/brand?view=campaigns")
	c.JSON(http.StatusOK, gin.H{"link_id": newLinkID})
}

// ---------- sisi BRAND ----------

func (h *BrandHandler) CreateCampaign(c *gin.Context) {
	userID := c.GetString("userID")
	var in brandCampaignInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "payload tidak valid"})
		return
	}
	if msg := validateCampaignInput(&in); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	id := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO brand_campaigns (id, brand_user_id, kind, title, brief, url, category, fee_idr, slots)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, id, userID, in.Kind, in.Title, in.Brief, in.URL, in.Category, in.FeeIDR, in.Slots); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat campaign"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *BrandHandler) ListMyCampaigns(c *gin.Context) {
	userID := c.GetString("userID")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.DB.Query(ctx, campaignSelect+` WHERE c.brand_user_id = $1 ORDER BY c.created_at DESC`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat campaign"})
		return
	}
	defer rows.Close()
	out := []brandCampaign{}
	for rows.Next() {
		if it, err := scanCampaign(rows); err == nil {
			out = append(out, it)
		}
	}
	c.JSON(http.StatusOK, out)
}

type campaignStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=open closed"`
}

func (h *BrandHandler) UpdateCampaignStatus(c *gin.Context) {
	userID := c.GetString("userID")
	var req campaignStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status harus open atau closed"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	tag, err := h.DB.Exec(ctx, `UPDATE brand_campaigns SET status = $3, updated_at = now() WHERE id = $1 AND brand_user_id = $2`,
		c.Param("id"), userID, req.Status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui campaign"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "campaign tidak ditemukan"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type campaignApplication struct {
	ID              string  `json:"id"`
	Status          string  `json:"status"`
	Pitch           string  `json:"pitch"`
	LinkID          *string `json:"link_id"`
	CreatorUsername string  `json:"creator_username"`
	CreatedAt       string  `json:"created_at"`
}

func (h *BrandHandler) ListCampaignApplications(c *gin.Context) {
	userID := c.GetString("userID")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.DB.Query(ctx, `
		SELECT a.id, a.status, a.pitch, a.link_id, u.username, a.created_at
		FROM brand_campaign_applications a
		JOIN brand_campaigns c ON c.id = a.campaign_id
		JOIN users u ON u.id = a.creator_user_id
		WHERE a.campaign_id = $1 AND c.brand_user_id = $2
		ORDER BY a.created_at ASC
	`, c.Param("id"), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat lamaran"})
		return
	}
	defer rows.Close()
	out := []campaignApplication{}
	for rows.Next() {
		var it campaignApplication
		var createdAt time.Time
		if err := rows.Scan(&it.ID, &it.Status, &it.Pitch, &it.LinkID, &it.CreatorUsername, &createdAt); err == nil {
			it.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, it)
		}
	}
	c.JSON(http.StatusOK, out)
}

type decideRequest struct {
	Status string `json:"status" binding:"required,oneof=accepted rejected completed"`
}

// DecideApplication -- brand menerima/menolak/menandai selesai. Transisi
// yang diizinkan: applied->accepted|rejected, accepted->completed|rejected.
// 'completed' = brand menyatakan kewajiban (termasuk fee, dibayar di luar
// platform pada MVP ini) sudah tuntas.
func (h *BrandHandler) DecideApplication(c *gin.Context) {
	userID := c.GetString("userID")
	var req decideRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status harus accepted, rejected, atau completed"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var current, creatorID, title string
	var slots, accepted int
	if err := h.DB.QueryRow(ctx, `
		SELECT a.status, a.creator_user_id, c.title, c.slots,
		       (SELECT COUNT(*) FROM brand_campaign_applications x WHERE x.campaign_id = c.id AND x.status IN ('accepted', 'completed'))
		FROM brand_campaign_applications a JOIN brand_campaigns c ON c.id = a.campaign_id
		WHERE a.id = $1 AND a.campaign_id = $2 AND c.brand_user_id = $3
	`, c.Param("appId"), c.Param("id"), userID).Scan(&current, &creatorID, &title, &slots, &accepted); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "lamaran tidak ditemukan"})
		return
	}
	if !brandTransitionAllowed(current, req.Status) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "perubahan status " + current + " -> " + req.Status + " tidak diizinkan"})
		return
	}
	if req.Status == "accepted" && accepted >= slots {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slot kreator sudah penuh"})
		return
	}
	// Audit 4 September 2026: SELECT slot di atas + UPDATE ini SEBELUMNYA
	// dua round-trip terpisah tanpa lock -- dua keputusan "accepted" yang
	// konkuren (double-click, dua tab, atau request yang di-retry) bisa
	// sama-sama lolos pengecekan `accepted >= slots` di atas sebelum salah
	// satu UPDATE benar-benar commit, mendorong accepted_count melebihi
	// slots. WHERE di bawah mengunci ulang KEDUA invarian (status masih
	// persis yang tadi dibaca, DAN utk status="accepted" slot masih
	// tersedia) di dalam UPDATE atomik yang sama -- kalau ada race,
	// RowsAffected()==0 dan request kedua gagal dengan pesan generik,
	// bukan ikut ter-commit ganda.
	tag, err := h.DB.Exec(ctx, `
		UPDATE brand_campaign_applications SET status = $2, updated_at = now()
		WHERE id = $1
		  AND status = $3
		  AND ($2 != 'accepted' OR (
		      SELECT COUNT(*) FROM brand_campaign_applications x
		      WHERE x.campaign_id = $4 AND x.status IN ('accepted', 'completed')
		  ) < (SELECT slots FROM brand_campaigns WHERE id = $4))
	`, c.Param("appId"), req.Status, current, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui lamaran"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "status lamaran ini sudah berubah (mis. slot terisi kreator lain) -- muat ulang halaman"})
		return
	}
	switch req.Status {
	case "accepted":
		h.notify(ctx, creatorID, "brand_accepted", "Lamaran diterima",
			"Brand menerima lamaranmu untuk \""+title+"\". Publikasikan tautannya dari menu Brand.", "/dashboard/brand?view=applications")
	case "rejected":
		h.notify(ctx, creatorID, "brand_rejected", "Lamaran tidak diterima",
			"Brand belum memilihmu untuk \""+title+"\".", "/dashboard/brand?view=applications")
	case "completed":
		h.notify(ctx, creatorID, "brand_completed", "Campaign selesai",
			"Brand menandai kerja sama \""+title+"\" selesai.", "/dashboard/brand?view=applications")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// brandTransitionAllowed -- mesin status lamaran, murni (diuji unit).
func brandTransitionAllowed(from, to string) bool {
	switch from {
	case "applied":
		return to == "accepted" || to == "rejected"
	case "accepted":
		return to == "completed" || to == "rejected"
	}
	return false
}
