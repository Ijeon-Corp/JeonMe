package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CollaboratorHandler mengimplementasikan No.87 (Sprint 10): kreator bisa
// mengundang kolaborator (mis. admin/tim kecil) dengan AKSES TERBATAS ke
// halaman/produknya -- meniru Admin Invites (Linktree) & Multi Admin
// (Lynk.id), keduanya fitur berbayar di kompetitor.
//
// CATATAN LINGKUP (disederhanakan dari estimasi 2.5 hari): 3 flag izin
// tetap (can_edit_links, can_edit_products, can_edit_design) -- BUKAN
// sistem role/permission granular per-endpoint seperti kompetitor mungkin
// tawarkan. Kolaborator TIDAK PERNAH bisa menyentuh saldo/penarikan/KYC/
// hapus akun/domain kustom/audiens/admin apa pun milik pemilik -- rute-rute
// itu TIDAK dipasangi middleware.ActAsOwner sama sekali (lihat routes.go),
// jadi secara arsitektur (bukan cuma validasi permission) kolaborator tidak
// bisa mengaksesnya, walau permission mereka "full". Tidak ada pengiriman
// email undangan (belum ada template/wiring mailer utk ini) -- kolaborator
// menemukan undangan lewat daftar "Undangan untuk Saya" di dashboard mereka
// sendiri (dicocokkan lewat alamat email akun mereka).
type CollaboratorHandler struct {
	DB *pgxpool.Pool
}

func NewCollaboratorHandler(db *pgxpool.Pool) *CollaboratorHandler {
	return &CollaboratorHandler{DB: db}
}

type inviteCollaboratorRequest struct {
	Email           string `json:"email" binding:"required,email"`
	CanEditLinks    bool   `json:"can_edit_links"`
	CanEditProducts bool   `json:"can_edit_products"`
	CanEditDesign   bool   `json:"can_edit_design"`
}

// Invite — pemilik mengundang kolaborator lewat email. Tidak mensyaratkan
// email itu SUDAH terdaftar (undangan tetap dicatat, ditemukan otomatis
// begitu kolaborator itu login/daftar dengan email yang sama).
func (h *CollaboratorHandler) Invite(c *gin.Context) {
	ownerID := c.GetString("userID")

	var req inviteCollaboratorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !req.CanEditLinks && !req.CanEditProducts && !req.CanEditDesign {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pilih minimal satu akses (tautan/produk/desain)"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var ownerEmail string
	if err := h.DB.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, ownerID).Scan(&ownerEmail); err == nil && ownerEmail == email {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tidak bisa mengundang diri sendiri"})
		return
	}

	id := uuid.NewString()
	_, err := h.DB.Exec(ctx, `
		INSERT INTO collaborators (id, owner_user_id, collaborator_email, can_edit_links, can_edit_products, can_edit_design, status, invited_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'invited', now())
		ON CONFLICT (owner_user_id, collaborator_email) DO UPDATE SET
			can_edit_links = $4, can_edit_products = $5, can_edit_design = $6,
			status = 'invited', invited_at = now(), accepted_at = NULL, collaborator_user_id = NULL
	`, id, ownerID, email, req.CanEditLinks, req.CanEditProducts, req.CanEditDesign)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat undangan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "undangan dibuat -- kolaborator akan melihatnya begitu login dengan email tersebut"})
}

type collaboratorItem struct {
	ID              string     `json:"id"`
	Email           string     `json:"email"`
	CanEditLinks    bool       `json:"can_edit_links"`
	CanEditProducts bool       `json:"can_edit_products"`
	CanEditDesign   bool       `json:"can_edit_design"`
	Status          string     `json:"status"`
	InvitedAt       time.Time  `json:"invited_at"`
	AcceptedAt      *time.Time `json:"accepted_at,omitempty"`
}

// ListMine — daftar kolaborator yang DIUNDANG PEMILIK (bukan workspace
// tempat pengguna ini jadi kolaborator -- lihat ListWorkspaces).
func (h *CollaboratorHandler) ListMine(c *gin.Context) {
	ownerID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, collaborator_email, can_edit_links, can_edit_products, can_edit_design, status, invited_at, accepted_at
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
		if err := rows.Scan(&it.ID, &it.Email, &it.CanEditLinks, &it.CanEditProducts, &it.CanEditDesign, &it.Status, &it.InvitedAt, &it.AcceptedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// Revoke — pemilik mencabut akses kolaborator (undangan yang belum
// diterima ATAUPUN yang sudah aktif) kapan saja.
func (h *CollaboratorHandler) Revoke(c *gin.Context) {
	ownerID := c.GetString("userID")
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

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

	c.JSON(http.StatusOK, gin.H{"message": "akses kolaborator dicabut"})
}

type pendingInviteItem struct {
	ID              string    `json:"id"`
	OwnerUsername   string    `json:"owner_username"`
	CanEditLinks    bool      `json:"can_edit_links"`
	CanEditProducts bool      `json:"can_edit_products"`
	CanEditDesign   bool      `json:"can_edit_design"`
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
		SELECT c.id, u.username, c.can_edit_links, c.can_edit_products, c.can_edit_design, c.invited_at
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
		if err := rows.Scan(&it.ID, &it.OwnerUsername, &it.CanEditLinks, &it.CanEditProducts, &it.CanEditDesign, &it.InvitedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// AcceptInvite — kolaborator menyetujui undangan. Validasi email cocok
// (bukan cuma ID) supaya tidak ada celah menerima undangan orang lain
// lewat tebak ID.
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

	tag, err := h.DB.Exec(ctx, `
		UPDATE collaborators SET status = 'active', collaborator_user_id = $1, accepted_at = now()
		WHERE id = $2 AND collaborator_email = $3 AND status = 'invited'
	`, userID, inviteID, email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menerima undangan"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "undangan tidak ditemukan atau sudah diproses"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "undangan diterima"})
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
