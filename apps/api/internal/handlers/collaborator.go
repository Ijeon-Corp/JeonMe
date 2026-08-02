package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/audit"
	"github.com/jeonme/api/internal/queue"
)

// CollaboratorHandler mengimplementasikan No.87 (Sprint 10) + Modul
// Settings §4 (Team & Role Management, keputusan pengguna 2026-07-31):
// kreator bisa mengundang kolaborator dengan AKSES TERBATAS ke halaman/
// produknya -- meniru Admin Invites (Linktree) & Multi Admin (Lynk.id).
//
// Role ("content_admin"/"sales_admin"/"full_access") DIPETAKAN ke 3 flag
// boolean tetap (can_edit_links/products/design, lihat roleToPermissions)
// yang sudah ada sejak No.87 -- role TIDAK menggantikan boolean itu,
// hanya lapisan tampilan/API yang lebih ramah di atasnya. Enforcement
// akses tetap 100% lewat boolean itu (middleware.ActAsOwner, routes.go).
// Kolaborator TIDAK PERNAH bisa menyentuh saldo/penarikan/KYC/hapus akun/
// domain kustom/audiens/admin apa pun milik pemilik -- rute-rute itu
// TIDAK dipasangi middleware.ActAsOwner sama sekali, jadi secara
// arsitektur (bukan cuma validasi permission) kolaborator tidak bisa
// mengaksesnya, walau role mereka "full_access".
type CollaboratorHandler struct {
	DB    *pgxpool.Pool
	Queue *asynq.Client
}

func NewCollaboratorHandler(db *pgxpool.Pool, queueClient *asynq.Client) *CollaboratorHandler {
	return &CollaboratorHandler{DB: db, Queue: queueClient}
}

var validTeamRoles = map[string]bool{"content_admin": true, "sales_admin": true, "full_access": true}

// roleToPermissions -- pemetaan role -> 3 flag boolean lama. content_admin
// (Tautan+Desain, TANPA Produk) dan sales_admin (Produk saja) SENGAJA
// saling lepas -- default aman kalau role tidak dikenal (seharusnya sudah
// ditolak validTeamRoles lebih dulu) jatuh ke content_admin, bukan
// full_access, supaya gagal AMAN (kurang akses), bukan gagal TERBUKA.
func roleToPermissions(role string) (canEditLinks, canEditProducts, canEditDesign bool) {
	switch role {
	case "sales_admin":
		return false, true, false
	case "full_access":
		return true, true, true
	default:
		return true, false, true
	}
}

type inviteCollaboratorRequest struct {
	EmailOrUsername string `json:"email_or_username" binding:"required"`
	Role            string `json:"role" binding:"required"`
}

// Invite — pemilik mengundang kolaborator lewat email ATAU username yang
// SUDAH ada (Modul Settings §4: boleh akun existing, tidak seperti Lynk.id
// yang mengharuskan email baru). Tidak mensyaratkan penerima SUDAH
// terdaftar sama sekali kalau diisi email langsung -- undangan tetap
// dicatat, ditemukan otomatis begitu kolaborator itu login/daftar dengan
// email yang sama (lihat ListInvitesForMe). Email undangan dikirim
// ASINKRON lewat queue (best-effort -- in-app "Undangan untuk Saya" tetap
// jadi jalan utama, bukan satu-satunya).
func (h *CollaboratorHandler) Invite(c *gin.Context) {
	ownerID := c.GetString("userID")

	var req inviteCollaboratorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !validTeamRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role tidak dikenal"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	identifier := strings.TrimSpace(req.EmailOrUsername)
	email := strings.ToLower(identifier)
	if !strings.Contains(identifier, "@") {
		var resolvedEmail string
		if err := h.DB.QueryRow(ctx,
			`SELECT email FROM users WHERE lower(username) = lower($1) AND deleted_at IS NULL`, identifier,
		).Scan(&resolvedEmail); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "username tidak ditemukan -- coba masukkan email"})
			return
		}
		email = strings.ToLower(resolvedEmail)
	}

	var ownerUsername, ownerEmail string
	if err := h.DB.QueryRow(ctx, `SELECT username, email FROM users WHERE id = $1`, ownerID).Scan(&ownerUsername, &ownerEmail); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}
	if ownerEmail == email {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tidak bisa mengundang diri sendiri"})
		return
	}

	canEditLinks, canEditProducts, canEditDesign := roleToPermissions(req.Role)

	id := uuid.NewString()
	_, err := h.DB.Exec(ctx, `
		INSERT INTO collaborators (id, owner_user_id, collaborator_email, can_edit_links, can_edit_products, can_edit_design, role, status, invited_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'invited', now())
		ON CONFLICT (owner_user_id, collaborator_email) DO UPDATE SET
			can_edit_links = $4, can_edit_products = $5, can_edit_design = $6, role = $7,
			status = 'invited', invited_at = now(), accepted_at = NULL, collaborator_user_id = NULL
	`, id, ownerID, email, canEditLinks, canEditProducts, canEditDesign, req.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat undangan"})
		return
	}

	metadata, _ := json.Marshal(gin.H{"collaborator_email": email, "role": req.Role})
	_ = audit.Log(ctx, h.DB, ownerID, "team.invited", "collaborator", id, metadata)

	if h.Queue != nil {
		if task, err := queue.NewTeamInviteTask(queue.TeamInvitePayload{
			OwnerUsername: ownerUsername, CollaboratorEmail: email, Role: req.Role,
		}); err == nil {
			_, _ = h.Queue.Enqueue(task)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "undangan dibuat -- kolaborator akan melihatnya begitu login dengan email tersebut"})
}

type collaboratorItem struct {
	ID                 string     `json:"id"`
	Email              string     `json:"email"`
	CanEditLinks       bool       `json:"can_edit_links"`
	CanEditProducts    bool       `json:"can_edit_products"`
	CanEditDesign      bool       `json:"can_edit_design"`
	Role               string     `json:"role"`
	Status             string     `json:"status"`
	InvitedAt          time.Time  `json:"invited_at"`
	AcceptedAt         *time.Time `json:"accepted_at,omitempty"`
	CollaboratorUserID *string    `json:"collaborator_user_id,omitempty"`
}

// ListMine — daftar kolaborator yang DIUNDANG PEMILIK (bukan workspace
// tempat pengguna ini jadi kolaborator -- lihat ListWorkspaces).
// collaborator_user_id (terisi begitu status="active", lihat AcceptInvite)
// dipakai UI Modul Settings §3 (split kolaborator per produk) untuk
// menampilkan daftar "siapa yang bisa diberi bagian pendapatan" --
// SENGAJA dibatasi ke kolaborator yang sudah diundang & aktif, bukan
// user_id sembarang, supaya kreator tidak perlu tahu/ketik UUID orang lain.
func (h *CollaboratorHandler) ListMine(c *gin.Context) {
	ownerID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, collaborator_email, can_edit_links, can_edit_products, can_edit_design, role, status, invited_at, accepted_at, collaborator_user_id
		FROM collaborators WHERE owner_user_id = $1 AND status != 'revoked' ORDER BY invited_at DESC
	`, ownerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar kolaborator"})
		return
	}
	defer rows.Close()

	items := []collaboratorItem{}
	for rows.Next() {
		var it collaboratorItem
		if err := rows.Scan(&it.ID, &it.Email, &it.CanEditLinks, &it.CanEditProducts, &it.CanEditDesign, &it.Role, &it.Status, &it.InvitedAt, &it.AcceptedAt, &it.CollaboratorUserID); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type updateCollaboratorRoleRequest struct {
	Role string `json:"role" binding:"required"`
}

// UpdateRole — Modul Settings §4: ganti role kolaborator yang sudah
// diundang/aktif. Boolean akses lama (sumber kebenaran enforcement,
// middleware.ActAsOwner) ditegakkan ulang sesuai role baru DALAM
// transaksi yang sama dengan audit log, supaya keduanya selalu konsisten.
func (h *CollaboratorHandler) UpdateRole(c *gin.Context) {
	ownerID := c.GetString("userID")
	id := c.Param("id")

	var req updateCollaboratorRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !validTeamRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role tidak dikenal"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var collaboratorEmail, oldRole string
	if err := h.DB.QueryRow(ctx, `
		SELECT collaborator_email, role FROM collaborators WHERE id = $1 AND owner_user_id = $2 AND status != 'revoked'
	`, id, ownerID).Scan(&collaboratorEmail, &oldRole); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "kolaborator tidak ditemukan"})
		return
	}

	if oldRole == req.Role {
		c.JSON(http.StatusOK, gin.H{"message": "role kolaborator diperbarui"})
		return
	}

	canEditLinks, canEditProducts, canEditDesign := roleToPermissions(req.Role)

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		UPDATE collaborators SET role = $1, can_edit_links = $2, can_edit_products = $3, can_edit_design = $4
		WHERE id = $5
	`, req.Role, canEditLinks, canEditProducts, canEditDesign, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui role"})
		return
	}

	metadata, _ := json.Marshal(gin.H{"collaborator_email": collaboratorEmail, "old_role": oldRole, "new_role": req.Role})
	if err := audit.Log(ctx, tx, ownerID, "team.role_updated", "collaborator", id, metadata); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "role kolaborator diperbarui"})
}

// Revoke — pemilik mencabut akses kolaborator (undangan yang belum
// diterima ATAUPUN yang sudah aktif) kapan saja.
func (h *CollaboratorHandler) Revoke(c *gin.Context) {
	ownerID := c.GetString("userID")
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var collaboratorEmail, role string
	if err := h.DB.QueryRow(ctx, `
		SELECT collaborator_email, role FROM collaborators WHERE id = $1 AND owner_user_id = $2
	`, id, ownerID).Scan(&collaboratorEmail, &role); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "kolaborator tidak ditemukan"})
		return
	}

	tag, err := h.DB.Exec(ctx, `
		UPDATE collaborators SET status = 'revoked' WHERE id = $1 AND owner_user_id = $2
	`, id, ownerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencabut akses"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "kolaborator tidak ditemukan"})
		return
	}

	metadata, _ := json.Marshal(gin.H{"collaborator_email": collaboratorEmail, "role": role})
	_ = audit.Log(ctx, h.DB, ownerID, "team.revoked", "collaborator", id, metadata)

	c.JSON(http.StatusOK, gin.H{"message": "akses kolaborator dicabut"})
}

type pendingInviteItem struct {
	ID              string    `json:"id"`
	OwnerUsername   string    `json:"owner_username"`
	CanEditLinks    bool      `json:"can_edit_links"`
	CanEditProducts bool      `json:"can_edit_products"`
	CanEditDesign   bool      `json:"can_edit_design"`
	Role            string    `json:"role"`
	InvitedAt       time.Time `json:"invited_at"`
}

// ListInvitesForMe — undangan berstatus "invited" yang alamat emailnya
// cocok dengan akun pengguna yang sedang login.
func (h *CollaboratorHandler) ListInvitesForMe(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var email string
	if err := h.DB.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT c.id, u.username, c.can_edit_links, c.can_edit_products, c.can_edit_design, c.role, c.invited_at
		FROM collaborators c JOIN users u ON u.id = c.owner_user_id
		WHERE c.collaborator_email = $1 AND c.status = 'invited'
		ORDER BY c.invited_at DESC
	`, email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat undangan"})
		return
	}
	defer rows.Close()

	items := []pendingInviteItem{}
	for rows.Next() {
		var it pendingInviteItem
		if err := rows.Scan(&it.ID, &it.OwnerUsername, &it.CanEditLinks, &it.CanEditProducts, &it.CanEditDesign, &it.Role, &it.InvitedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// AcceptInvite — kolaborator menyetujui undangan. Validasi email cocok
// (bukan cuma ID) supaya tidak ada celah menerima undangan orang lain
// lewat tebak ID. Audit log dicatat di bawah NAMA PEMILIK (owner_user_id
// hasil RETURNING), bukan kolaborator, supaya muncul di ListAuditLog
// milik pemilik -- actor sesungguhnya (si kolaborator) tetap terekam di
// metadata.
func (h *CollaboratorHandler) AcceptInvite(c *gin.Context) {
	userID := c.GetString("userID")
	inviteID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var email string
	if err := h.DB.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}

	var ownerID string
	err := h.DB.QueryRow(ctx, `
		UPDATE collaborators SET status = 'active', collaborator_user_id = $1, accepted_at = now()
		WHERE id = $2 AND collaborator_email = $3 AND status = 'invited'
		RETURNING owner_user_id
	`, userID, inviteID, email).Scan(&ownerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "undangan tidak ditemukan atau sudah diproses"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menerima undangan"})
		return
	}

	metadata, _ := json.Marshal(gin.H{"collaborator_email": email, "actor_user_id": userID})
	_ = audit.Log(ctx, h.DB, ownerID, "team.invite_accepted", "collaborator", inviteID, metadata)

	c.JSON(http.StatusOK, gin.H{"message": "undangan diterima"})
}

type auditLogItem struct {
	ID        string          `json:"id"`
	Action    string          `json:"action"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

// ListAuditLog — Modul Settings §4 acceptance criteria: pemilik bisa lihat
// SIAPA mengubah APA dan KAPAN dari UI, bukan cuma di database. Reuse
// tabel audit_log yang sudah ada (NF-10) alih-alih tabel terpisah --
// difilter ke action berawalan "team." supaya cuma menampilkan perubahan
// tim, bukan seluruh aktivitas akun (payout, 2FA, dst).
func (h *CollaboratorHandler) ListAuditLog(c *gin.Context) {
	ownerID := c.GetString("userID")

	limit := 50
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	offset := 0
	if v := c.Query("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, action, metadata, created_at FROM audit_log
		WHERE user_id = $1 AND action LIKE 'team.%'
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, ownerID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat audit log"})
		return
	}
	defer rows.Close()

	items := []auditLogItem{}
	for rows.Next() {
		var it auditLogItem
		if err := rows.Scan(&it.ID, &it.Action, &it.Metadata, &it.CreatedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type workspaceItem struct {
	OwnerUserID     string `json:"owner_user_id"`
	OwnerUsername   string `json:"owner_username"`
	IsSelf          bool   `json:"is_self"`
	CanEditLinks    bool   `json:"can_edit_links"`
	CanEditProducts bool   `json:"can_edit_products"`
	CanEditDesign   bool   `json:"can_edit_design"`
}

// ListWorkspaces — dipakai pemilih ruang kerja di dashboard: workspace
// milik sendiri (selalu ada, akses penuh) + semua workspace tempat
// pengguna ini menjadi kolaborator AKTIF.
func (h *CollaboratorHandler) ListWorkspaces(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var selfUsername string
	if err := h.DB.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&selfUsername); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}

	items := []workspaceItem{
		{OwnerUserID: userID, OwnerUsername: selfUsername, IsSelf: true, CanEditLinks: true, CanEditProducts: true, CanEditDesign: true},
	}

	rows, err := h.DB.Query(ctx, `
		SELECT c.owner_user_id, u.username, c.can_edit_links, c.can_edit_products, c.can_edit_design
		FROM collaborators c JOIN users u ON u.id = c.owner_user_id
		WHERE c.collaborator_user_id = $1 AND c.status = 'active'
		ORDER BY u.username ASC
	`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var it workspaceItem
			if err := rows.Scan(&it.OwnerUserID, &it.OwnerUsername, &it.CanEditLinks, &it.CanEditProducts, &it.CanEditDesign); err == nil {
				items = append(items, it)
			}
		}
	}

	c.JSON(http.StatusOK, items)
}
