package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/audit"
)

// AdminHandler mengimplementasikan REQ-F-701 (manajemen user), REQ-F-702
// (moderasi konten dari laporan publik), REQ-F-703 (ringkasan dashboard admin).
//
// TIDAK ADA cara self-service untuk menjadi admin -- role diubah manual
// lewat SQL langsung oleh operator (UPDATE users SET role='admin' WHERE
// id=...), sengaja tidak diekspos lewat API sama sekali supaya tidak ada
// jalur eskalasi privilese lewat aplikasi.
type AdminHandler struct {
	DB *pgxpool.Pool
}

func NewAdminHandler(db *pgxpool.Pool) *AdminHandler {
	return &AdminHandler{DB: db}
}

type adminUserItem struct {
	ID          string     `json:"id"`
	Email       string     `json:"email"`
	Username    string     `json:"username"`
	Role        string     `json:"role"`
	CreatedAt   time.Time  `json:"created_at"`
	SuspendedAt *time.Time `json:"suspended_at,omitempty"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
}

// ListUsers — REQ-F-701. search (opsional) mencocokkan email/username.
func (h *AdminHandler) ListUsers(c *gin.Context) {
	search := "%" + c.Query("search") + "%"

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, email, username, role, created_at, suspended_at, deleted_at
		FROM users
		WHERE email ILIKE $1 OR username ILIKE $1
		ORDER BY created_at DESC
		LIMIT 100
	`, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar user"})
		return
	}
	defer rows.Close()

	items := []adminUserItem{}
	for rows.Next() {
		var it adminUserItem
		if err := rows.Scan(&it.ID, &it.Email, &it.Username, &it.Role, &it.CreatedAt, &it.SuspendedAt, &it.DeletedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// SuspendUser — REQ-F-701. Berbeda dari hapus akun: reversibel, identitas
// TIDAK dianonimkan, cuma diblokir login (lihat AuthHandler.Login).
func (h *AdminHandler) SuspendUser(c *gin.Context) {
	targetID := c.Param("id")
	adminID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `UPDATE users SET suspended_at = now() WHERE id = $1`, targetID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menangguhkan user"})
		return
	}
	if err := audit.Log(ctx, tx, adminID, "user.suspended", "user", targetID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user ditangguhkan"})
}

// ActivateUser — REQ-F-701 (lawan dari SuspendUser).
func (h *AdminHandler) ActivateUser(c *gin.Context) {
	targetID := c.Param("id")
	adminID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `UPDATE users SET suspended_at = NULL WHERE id = $1`, targetID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengaktifkan user"})
		return
	}
	if err := audit.Log(ctx, tx, adminID, "user.activated", "user", targetID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user diaktifkan kembali"})
}

type createReportRequest struct {
	TargetType    string `json:"target_type" binding:"required,oneof=page product"`
	TargetID      string `json:"target_id" binding:"required"`
	Reason        string `json:"reason" binding:"required,max=1000"`
	ReporterEmail string `json:"reporter_email"`
}

// CreateReport — REQ-F-702 (bagian publik: siapa pun bisa melaporkan tanpa
// akun). TIDAK dilindungi AuthRequired -- ini endpoint publik.
func (h *AdminHandler) CreateReport(c *gin.Context) {
	var req createReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	_, err := h.DB.Exec(ctx, `
		INSERT INTO reports (id, target_type, target_id, reason, reporter_email, status, created_at)
		VALUES ($1, $2, $3, $4, $5, 'pending', now())
	`, uuid.NewString(), req.TargetType, req.TargetID, req.Reason, req.ReporterEmail)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengirim laporan"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "laporan diterima, tim kami akan meninjau"})
}

type reportItem struct {
	ID            string    `json:"id"`
	TargetType    string    `json:"target_type"`
	TargetID      string    `json:"target_id"`
	Reason        string    `json:"reason"`
	ReporterEmail string    `json:"reporter_email"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

// ListReports — REQ-F-702 (bagian admin). status default "pending".
func (h *AdminHandler) ListReports(c *gin.Context) {
	status := c.DefaultQuery("status", "pending")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, target_type, target_id, reason, reporter_email, status, created_at
		FROM reports WHERE status = $1 ORDER BY created_at ASC LIMIT 100
	`, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat laporan"})
		return
	}
	defer rows.Close()

	items := []reportItem{}
	for rows.Next() {
		var it reportItem
		if err := rows.Scan(&it.ID, &it.TargetType, &it.TargetID, &it.Reason, &it.ReporterEmail, &it.Status, &it.CreatedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type resolveReportRequest struct {
	Action string `json:"action" binding:"required,oneof=takedown dismiss"`
}

// ResolveReport — REQ-F-702. "takedown" menonaktifkan halaman/produk yang
// dilaporkan (is_published/is_active = false); "dismiss" menutup laporan
// tanpa aksi (dianggap tidak melanggar).
func (h *AdminHandler) ResolveReport(c *gin.Context) {
	reportID := c.Param("id")
	adminID := c.GetString("userID")

	var req resolveReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var targetType, targetID string
	if err := h.DB.QueryRow(ctx, `
		SELECT target_type, target_id FROM reports WHERE id = $1 AND status = 'pending'
	`, reportID).Scan(&targetType, &targetID); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "laporan tidak ditemukan atau sudah diproses"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat laporan"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	newStatus := "dismissed"
	if req.Action == "takedown" {
		newStatus = "takedown"
		var takedownErr error
		switch targetType {
		case "page":
			_, takedownErr = tx.Exec(ctx, `UPDATE pages SET is_published = false WHERE id = $1`, targetID)
		case "product":
			_, takedownErr = tx.Exec(ctx, `UPDATE products SET is_active = false WHERE id = $1`, targetID)
		}
		if takedownErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menonaktifkan konten"})
			return
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE reports SET status = $1, resolved_by = $2, resolved_at = now() WHERE id = $3
	`, newStatus, adminID, reportID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui laporan"})
		return
	}

	if err := audit.Log(ctx, tx, adminID, "report."+newStatus, "report", reportID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "laporan diproses"})
}

type adminPayoutItem struct {
	ID                 string     `json:"id"`
	Username           string     `json:"username"`
	Email              string     `json:"email"`
	AmountIDR          int64      `json:"amount_idr"`
	DestinationAccount string     `json:"destination_account"`
	Status             string     `json:"status"`
	KycStatusAtRequest string     `json:"kyc_status_at_request"`
	RequestedAt        time.Time  `json:"requested_at"`
	CompletedAt        *time.Time `json:"completed_at,omitempty"`
}

// ListPayouts — REQ-F-505: admin melihat SEMUA pengajuan penarikan lintas
// kreator (beda dari BalanceHandler.ListPayouts yang cuma punya kreator
// sendiri). Default filter ke "requested"+"processing" (yang masih perlu
// tindakan) -- kirim ?status=all untuk melihat riwayat lengkap termasuk
// yang sudah selesai/gagal.
func (h *AdminHandler) ListPayouts(c *gin.Context) {
	status := c.DefaultQuery("status", "")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT p.id, u.username, u.email, p.amount_idr, p.destination_account, p.status,
		       p.kyc_status_at_request, p.requested_at, p.completed_at
		FROM payouts p JOIN users u ON u.id = p.user_id
	`
	args := []any{}
	switch status {
	case "", "needs_action":
		query += `WHERE p.status IN ('requested', 'processing')`
	case "all":
		// tanpa filter
	default:
		query += `WHERE p.status = $1`
		args = append(args, status)
	}
	// Kreator terverifikasi KYC diprioritaskan lebih dulu dalam antrian
	// (No.84) -- TIDAK memblokir yang belum terverifikasi, hanya diproses
	// belakangan sesuai urutan pengajuan di antara sesama status yang sama.
	query += ` ORDER BY (p.kyc_status_at_request = 'verified') DESC, p.requested_at ASC LIMIT 200`

	rows, err := h.DB.Query(ctx, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar penarikan"})
		return
	}
	defer rows.Close()

	items := []adminPayoutItem{}
	for rows.Next() {
		var it adminPayoutItem
		if err := rows.Scan(&it.ID, &it.Username, &it.Email, &it.AmountIDR, &it.DestinationAccount, &it.Status, &it.KycStatusAtRequest, &it.RequestedAt, &it.CompletedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// payoutTransitions — state machine eksplisit: "completed"/"failed" adalah
// status akhir, tidak bisa diubah lagi lewat endpoint ini. Mencegah admin
// (atau klik ganda tak sengaja) memproses penarikan yang sama dua kali.
var payoutTransitions = map[string]map[string]bool{
	"requested":  {"processing": true, "failed": true},
	"processing": {"completed": true, "failed": true},
}

type updatePayoutStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=processing completed failed"`
}

// UpdatePayoutStatus — REQ-F-505: admin memproses pengajuan penarikan
// secara MANUAL (belum ada integrasi Disbursement API sungguhan, lihat
// Rencana-Sprint-Jeonme.xlsx Sprint 4 No.52/53) -- transfer dana sungguhan
// dilakukan admin di luar sistem (mis. lewat internet banking), lalu
// ditandai di sini.
//
// Kalau status baru "failed": ledger debit yang dicatat saat PENGAJUAN
// (BalanceHandler.CreatePayout langsung mendebit supaya saldo yang sama
// tidak bisa diajukan dua kali) di-REVERSE (dikredit balik) DI DALAM
// transaksi yang sama -- kalau tidak, saldo kreator hilang permanen padahal
// uangnya tidak pernah benar-benar keluar dari platform.
func (h *AdminHandler) UpdatePayoutStatus(c *gin.Context) {
	payoutID := c.Param("id")
	adminID := c.GetString("userID")

	var req updatePayoutStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var currentStatus, payoutUserID string
	var amountIDR int64
	err = tx.QueryRow(ctx, `
		SELECT status, user_id, amount_idr FROM payouts WHERE id = $1 FOR UPDATE
	`, payoutID).Scan(&currentStatus, &payoutUserID, &amountIDR)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "penarikan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat penarikan"})
		return
	}

	if !payoutTransitions[currentStatus][req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("tidak bisa mengubah status dari %q ke %q", currentStatus, req.Status)})
		return
	}

	if req.Status == "completed" {
		_, err = tx.Exec(ctx, `UPDATE payouts SET status = $1, completed_at = now() WHERE id = $2`, req.Status, payoutID)
	} else {
		_, err = tx.Exec(ctx, `UPDATE payouts SET status = $1 WHERE id = $2`, req.Status, payoutID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui status"})
		return
	}

	if req.Status == "failed" {
		// Serialisasi lewat lock yang sama seperti CreatePayout/webhook
		// checkout supaya balance_after selalu benar walau ada penulisan
		// ledger lain untuk kreator yang sama bersamaan.
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, payoutUserID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunci saldo"})
			return
		}

		var currentBalance int64
		if err := tx.QueryRow(ctx, `
			SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1
		`, payoutUserID).Scan(&currentBalance); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung saldo"})
			return
		}

		newBalance := currentBalance + amountIDR
		ledgerID := uuid.NewString()
		if _, err := tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, type, amount_idr, balance_after, created_at)
			VALUES ($1, $2, 'credit', $3, $4, now())
		`, ledgerID, payoutUserID, amountIDR, newBalance); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengembalikan saldo"})
			return
		}

		metadata, _ := json.Marshal(gin.H{"payout_id": payoutID, "amount_idr": amountIDR, "balance_after": newBalance, "reason": "payout_failed_reversal"})
		if err := audit.Log(ctx, tx, payoutUserID, "ledger.credit", "ledger_entry", ledgerID, metadata); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
			return
		}
	}

	metadata, _ := json.Marshal(gin.H{"payout_id": payoutID, "from": currentStatus, "to": req.Status, "processed_by": adminID})
	if err := audit.Log(ctx, tx, payoutUserID, "payout."+req.Status, "payout", payoutID, metadata); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "status penarikan diperbarui"})
}

type adminSummaryResponse struct {
	TotalUsers      int64 `json:"total_users"`
	NewUsers7Days   int64 `json:"new_users_7_days"`
	TotalOrders     int64 `json:"total_orders"`
	TotalRevenueIDR int64 `json:"total_revenue_idr"`
	PendingReports  int64 `json:"pending_reports"`
	PendingPayouts  int64 `json:"pending_payouts"`
}

// GetSummary — REQ-F-703.
func (h *AdminHandler) GetSummary(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var resp adminSummaryResponse
	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')
		FROM users WHERE deleted_at IS NULL
	`).Scan(&resp.TotalUsers, &resp.NewUsers7Days); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung ringkasan user"})
		return
	}

	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE status = 'paid'), COALESCE(SUM(amount_idr) FILTER (WHERE status = 'paid'), 0)
		FROM orders
	`).Scan(&resp.TotalOrders, &resp.TotalRevenueIDR); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung ringkasan transaksi"})
		return
	}

	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM reports WHERE status = 'pending'`).Scan(&resp.PendingReports); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung laporan tertunda"})
		return
	}

	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM payouts WHERE status IN ('requested', 'processing')`).Scan(&resp.PendingPayouts); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung penarikan tertunda"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// ----------------------------------------------------------------------
// Moderasi tautan sensitif -- permintaan langsung pengguna, 22 Agustus
// 2026: "sistem bisa memblokir jika memasukkan link yang sensitif contoh
// nya link judol link 18+ dll". Panel admin untuk mengelola dua tabel yang
// dipakai handlers.LinkModerationChecker (moderation.go) -- lihat catatan
// lengkap arsitektur di sana. Endpoint di bawah HANYA mengelola data,
// keputusan blokir sungguhan terjadi di LinksHandler/ProductHandler saat
// kreator menyimpan tautan.
// ----------------------------------------------------------------------

type blockedKeywordItem struct {
	ID        string    `json:"id"`
	Keyword   string    `json:"keyword"`
	Category  string    `json:"category"`
	CreatedAt time.Time `json:"created_at"`
}

// ListBlockedKeywords — daftar kata kunci yang dicek terhadap URL+judul
// tautan baru dari domain yang belum pernah dilihat.
func (h *AdminHandler) ListBlockedKeywords(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `SELECT id, keyword, category, created_at FROM blocked_keywords ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat kata kunci"})
		return
	}
	defer rows.Close()

	items := []blockedKeywordItem{}
	for rows.Next() {
		var it blockedKeywordItem
		if err := rows.Scan(&it.ID, &it.Keyword, &it.Category, &it.CreatedAt); err == nil {
			items = append(items, it)
		}
	}
	c.JSON(http.StatusOK, items)
}

type createBlockedKeywordRequest struct {
	Keyword  string `json:"keyword" binding:"required,max=100"`
	Category string `json:"category" binding:"omitempty,oneof=judi_online konten_dewasa lainnya"`
}

// CreateBlockedKeyword — tambah satu kata kunci baru ke blocklist.
func (h *AdminHandler) CreateBlockedKeyword(c *gin.Context) {
	adminID := c.GetString("userID")

	var req createBlockedKeywordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Category == "" {
		req.Category = "lainnya"
	}
	keyword := strings.ToLower(strings.TrimSpace(req.Keyword))
	if keyword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "kata kunci tidak boleh kosong"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	id := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO blocked_keywords (id, keyword, category, created_at) VALUES ($1, $2, $3, now())
	`, id, keyword, req.Category); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menambah kata kunci (mungkin sudah ada)"})
		return
	}
	_ = audit.Log(ctx, h.DB, adminID, "blocked_keyword.created", "blocked_keyword", id, nil)

	c.JSON(http.StatusCreated, gin.H{"id": id, "keyword": keyword, "category": req.Category})
}

// DeleteBlockedKeyword — hapus satu kata kunci dari blocklist.
func (h *AdminHandler) DeleteBlockedKeyword(c *gin.Context) {
	id := c.Param("id")
	adminID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM blocked_keywords WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus kata kunci"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "kata kunci tidak ditemukan"})
		return
	}
	_ = audit.Log(ctx, h.DB, adminID, "blocked_keyword.deleted", "blocked_keyword", id, nil)

	c.JSON(http.StatusOK, gin.H{"message": "kata kunci dihapus"})
}

type domainVerdictItem struct {
	ID        string    `json:"id"`
	Domain    string    `json:"domain"`
	Verdict   string    `json:"verdict"`
	Category  string    `json:"category"`
	Source    string    `json:"source"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListDomainVerdicts — cache reputasi per-domain (hasil kurasi admin
// manual MAUPUN klasifikasi AI otomatis). ?verdict=blocked|allowed
// (opsional) untuk memfilter, mis. meninjau semua domain yang pernah
// diblokir AI untuk kemungkinan false-positive.
func (h *AdminHandler) ListDomainVerdicts(c *gin.Context) {
	verdictFilter := c.Query("verdict")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	query := `SELECT id, domain, verdict, COALESCE(category, ''), source, COALESCE(reason, ''), created_at, updated_at FROM link_domain_verdicts`
	args := []any{}
	if verdictFilter == "blocked" || verdictFilter == "allowed" {
		query += ` WHERE verdict = $1`
		args = append(args, verdictFilter)
	}
	query += ` ORDER BY updated_at DESC LIMIT 200`

	rows, err := h.DB.Query(ctx, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat reputasi domain"})
		return
	}
	defer rows.Close()

	items := []domainVerdictItem{}
	for rows.Next() {
		var it domainVerdictItem
		if err := rows.Scan(&it.ID, &it.Domain, &it.Verdict, &it.Category, &it.Source, &it.Reason, &it.CreatedAt, &it.UpdatedAt); err == nil {
			items = append(items, it)
		}
	}
	c.JSON(http.StatusOK, items)
}

type upsertDomainVerdictRequest struct {
	Domain   string `json:"domain" binding:"required,max=255"`
	Verdict  string `json:"verdict" binding:"required,oneof=allowed blocked"`
	Category string `json:"category" binding:"omitempty,oneof=judi_online konten_dewasa lainnya"`
	Reason   string `json:"reason" binding:"omitempty,max=500"`
}

// UpsertDomainVerdict — override manual admin: langsung memblokir/
// mengizinkan satu domain (mis. domain baru yang jelas judol tapi belum
// sempat dicoba kreator mana pun, ATAU membatalkan false-positive AI/kata
// kunci). source selalu "manual" supaya beda dari cache otomatis di
// tampilan admin.
func (h *AdminHandler) UpsertDomainVerdict(c *gin.Context) {
	adminID := c.GetString("userID")

	var req upsertDomainVerdictRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Verdict == "blocked" && req.Category == "" {
		req.Category = "lainnya"
	}
	domain := normalizeModerationDomain(strings.TrimSpace(req.Domain))
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain tidak boleh kosong"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var categoryVal any
	if req.Category != "" {
		categoryVal = req.Category
	}
	var reasonVal any
	if req.Reason != "" {
		reasonVal = req.Reason
	}

	id := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO link_domain_verdicts (id, domain, verdict, category, source, reason, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 'manual', $5, now(), now())
		ON CONFLICT (domain) DO UPDATE SET verdict = $3, category = $4, source = 'manual', reason = $5, updated_at = now()
	`, id, domain, req.Verdict, categoryVal, reasonVal); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan reputasi domain"})
		return
	}
	_ = audit.Log(ctx, h.DB, adminID, "domain_verdict."+req.Verdict, "link_domain_verdict", domain, nil)

	c.JSON(http.StatusOK, gin.H{"domain": domain, "verdict": req.Verdict})
}

// DeleteDomainVerdict — hapus entri reputasi (mis. override manual yang
// sudah tidak relevan) supaya domain itu dievaluasi ulang dari awal
// (kata kunci lalu AI) di percobaan berikutnya.
func (h *AdminHandler) DeleteDomainVerdict(c *gin.Context) {
	id := c.Param("id")
	adminID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM link_domain_verdicts WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus reputasi domain"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "entri tidak ditemukan"})
		return
	}
	_ = audit.Log(ctx, h.DB, adminID, "domain_verdict.deleted", "link_domain_verdict", id, nil)

	c.JSON(http.StatusOK, gin.H{"message": "entri dihapus"})
}
