package handlers

import (
	"context"
	"net/http"
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

type adminSummaryResponse struct {
	TotalUsers      int64 `json:"total_users"`
	NewUsers7Days   int64 `json:"new_users_7_days"`
	TotalOrders     int64 `json:"total_orders"`
	TotalRevenueIDR int64 `json:"total_revenue_idr"`
	PendingReports  int64 `json:"pending_reports"`
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

	c.JSON(http.StatusOK, resp)
}
