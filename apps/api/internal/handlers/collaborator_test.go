package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

func newTestCollaboratorHandler(t *testing.T) (*CollaboratorHandler, *AuthHandler) {
	t.Helper()
	dbURL := mustEnv(t, "DATABASE_URL")
	redisURL := mustEnv(t, "REDIS_URL")

	db, err := database.NewPostgresPool(dbURL)
	if err != nil {
		t.Fatalf("gagal konek database test: %v", err)
	}
	t.Cleanup(db.Close)

	rdb, err := database.NewRedisClient(redisURL)
	if err != nil {
		t.Fatalf("gagal konek redis test: %v", err)
	}
	t.Cleanup(func() { rdb.Close() })

	// Queue sengaja nil -- test ini fokus ke logika role/audit log, bukan
	// pengiriman email (sudah dites terpisah di worker package), pola sama
	// dengan Storage nil di test checkout/produk.
	return NewCollaboratorHandler(db, nil), NewAuthHandler(db, rdb, "test-secret", "test")
}

func newTeamTestRouter(collab *CollaboratorHandler) *gin.Engine {
	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/collaborators", collab.Invite)
	g.GET("/collaborators", collab.ListMine)
	g.PATCH("/collaborators/:id/role", collab.UpdateRole)
	g.DELETE("/collaborators/:id", collab.Revoke)
	g.GET("/collaboration-invites", collab.ListInvitesForMe)
	g.POST("/collaboration-invites/:id/accept", collab.AcceptInvite)
	g.GET("/team/audit-log", collab.ListAuditLog)
	return router
}

// Modul Settings §4 acceptance criteria: undang lewat username akun yang
// SUDAH ada (bukan cuma email) harus berhasil tanpa syarat "belum
// terdaftar".
func TestInvite_ByUsername_ResolvesToEmailAndSetsRolePermissions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	collab, auth := newTestCollaboratorHandler(t)
	ownerID := registerTestUser(t, auth)
	collaboratorID := registerTestUser(t, auth)

	var collaboratorUsername, collaboratorEmail string
	if err := collab.DB.QueryRow(t.Context(), `SELECT username, email FROM users WHERE id = $1`, collaboratorID).Scan(&collaboratorUsername, &collaboratorEmail); err != nil {
		t.Fatalf("gagal ambil data kolaborator: %v", err)
	}

	router := newTeamTestRouter(collab)
	headers := map[string]string{"X-Test-UserID": ownerID}

	inviteRec := doJSON(t, router, http.MethodPost, "/collaborators", map[string]any{
		"email_or_username": collaboratorUsername, "role": "sales_admin",
	}, headers)
	if inviteRec.Code != http.StatusOK {
		t.Fatalf("invite gagal: status %d, body %s", inviteRec.Code, inviteRec.Body.String())
	}

	listRec := doJSON(t, router, http.MethodGet, "/collaborators", nil, headers)
	var list []collaboratorItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &list); err != nil {
		t.Fatalf("gagal decode list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("len(list) = %d, ekspektasi 1", len(list))
	}
	item := list[0]
	if item.Email != collaboratorEmail {
		t.Errorf("Email = %q, ekspektasi %q (diresolusi dari username)", item.Email, collaboratorEmail)
	}
	if item.Role != "sales_admin" {
		t.Errorf("Role = %q, ekspektasi \"sales_admin\"", item.Role)
	}
	// sales_admin -> produk saja, TANPA tautan/desain (lihat roleToPermissions).
	if !item.CanEditProducts || item.CanEditLinks || item.CanEditDesign {
		t.Errorf("permissions = (links=%v, products=%v, design=%v), ekspektasi (false, true, false) untuk sales_admin",
			item.CanEditLinks, item.CanEditProducts, item.CanEditDesign)
	}
}

func TestInvite_UnknownUsername_Rejected(t *testing.T) {
	gin.SetMode(gin.TestMode)
	collab, auth := newTestCollaboratorHandler(t)
	ownerID := registerTestUser(t, auth)

	router := newTeamTestRouter(collab)
	rec := doJSON(t, router, http.MethodPost, "/collaborators", map[string]any{
		"email_or_username": "username-yang-tidak-pernah-ada-sama-sekali", "role": "content_admin",
	}, map[string]string{"X-Test-UserID": ownerID})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi 400 untuk username tidak ditemukan, body %s", rec.Code, rec.Body.String())
	}
}

func TestInvite_UnknownRole_Rejected(t *testing.T) {
	gin.SetMode(gin.TestMode)
	collab, auth := newTestCollaboratorHandler(t)
	ownerID := registerTestUser(t, auth)

	router := newTeamTestRouter(collab)
	rec := doJSON(t, router, http.MethodPost, "/collaborators", map[string]any{
		"email_or_username": "siapapun@example.com", "role": "super_admin",
	}, map[string]string{"X-Test-UserID": ownerID})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi 400 untuk role tidak dikenal, body %s", rec.Code, rec.Body.String())
	}
}

// Acceptance criteria Modul Settings §4: setiap perubahan role/akses
// tercatat di audit_log dengan actor yang jelas.
func TestInvite_RecordsAuditLogEntry(t *testing.T) {
	gin.SetMode(gin.TestMode)
	collab, auth := newTestCollaboratorHandler(t)
	ownerID := registerTestUser(t, auth)

	router := newTeamTestRouter(collab)
	rec := doJSON(t, router, http.MethodPost, "/collaborators", map[string]any{
		"email_or_username": "kolaborator-baru@example.com", "role": "full_access",
	}, map[string]string{"X-Test-UserID": ownerID})
	if rec.Code != http.StatusOK {
		t.Fatalf("invite gagal: status %d, body %s", rec.Code, rec.Body.String())
	}

	var count int
	if err := collab.DB.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM audit_log WHERE user_id = $1 AND action = 'team.invited'
	`, ownerID).Scan(&count); err != nil {
		t.Fatalf("gagal query audit_log: %v", err)
	}
	if count != 1 {
		t.Fatalf("audit_log count = %d, ekspektasi 1 baris team.invited", count)
	}
}

func TestUpdateRole_ChangesPermissionsAndRecordsAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	collab, auth := newTestCollaboratorHandler(t)
	ownerID := registerTestUser(t, auth)

	router := newTeamTestRouter(collab)
	headers := map[string]string{"X-Test-UserID": ownerID}

	inviteRec := doJSON(t, router, http.MethodPost, "/collaborators", map[string]any{
		"email_or_username": "kolaborator2@example.com", "role": "content_admin",
	}, headers)
	var inviteResp struct {
		Message string `json:"message"`
	}
	_ = json.Unmarshal(inviteRec.Body.Bytes(), &inviteResp)

	listRec := doJSON(t, router, http.MethodGet, "/collaborators", nil, headers)
	var list []collaboratorItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &list); err != nil || len(list) != 1 {
		t.Fatalf("gagal ambil kolaborator yang baru diundang: err=%v, list=%+v", err, list)
	}
	collaboratorID := list[0].ID

	updateRec := doJSON(t, router, http.MethodPatch, "/collaborators/"+collaboratorID+"/role", map[string]any{
		"role": "full_access",
	}, headers)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update role gagal: status %d, body %s", updateRec.Code, updateRec.Body.String())
	}

	listRec2 := doJSON(t, router, http.MethodGet, "/collaborators", nil, headers)
	var list2 []collaboratorItem
	if err := json.Unmarshal(listRec2.Body.Bytes(), &list2); err != nil || len(list2) != 1 {
		t.Fatalf("gagal ambil ulang kolaborator: err=%v, list=%+v", err, list2)
	}
	if list2[0].Role != "full_access" {
		t.Errorf("Role = %q, ekspektasi \"full_access\"", list2[0].Role)
	}
	if !list2[0].CanEditLinks || !list2[0].CanEditProducts || !list2[0].CanEditDesign {
		t.Errorf("permissions belum ikut berubah ke full_access: %+v", list2[0])
	}

	var count int
	if err := collab.DB.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM audit_log WHERE user_id = $1 AND action = 'team.role_updated'
	`, ownerID).Scan(&count); err != nil {
		t.Fatalf("gagal query audit_log: %v", err)
	}
	if count != 1 {
		t.Fatalf("audit_log count = %d, ekspektasi 1 baris team.role_updated", count)
	}
}

func TestRevoke_RecordsAuditLogEntry(t *testing.T) {
	gin.SetMode(gin.TestMode)
	collab, auth := newTestCollaboratorHandler(t)
	ownerID := registerTestUser(t, auth)

	router := newTeamTestRouter(collab)
	headers := map[string]string{"X-Test-UserID": ownerID}

	doJSON(t, router, http.MethodPost, "/collaborators", map[string]any{
		"email_or_username": "kolaborator3@example.com", "role": "content_admin",
	}, headers)

	listRec := doJSON(t, router, http.MethodGet, "/collaborators", nil, headers)
	var list []collaboratorItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &list); err != nil || len(list) != 1 {
		t.Fatalf("gagal ambil kolaborator: err=%v, list=%+v", err, list)
	}

	revokeRec := doJSON(t, router, http.MethodDelete, "/collaborators/"+list[0].ID, nil, headers)
	if revokeRec.Code != http.StatusOK {
		t.Fatalf("revoke gagal: status %d, body %s", revokeRec.Code, revokeRec.Body.String())
	}

	var count int
	if err := collab.DB.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM audit_log WHERE user_id = $1 AND action = 'team.revoked'
	`, ownerID).Scan(&count); err != nil {
		t.Fatalf("gagal query audit_log: %v", err)
	}
	if count != 1 {
		t.Fatalf("audit_log count = %d, ekspektasi 1 baris team.revoked", count)
	}
}

// Menerima undangan tercatat di audit log MILIK PEMILIK (bukan kolaborator)
// supaya pemilik bisa melihatnya, dengan actor sesungguhnya tetap terekam
// di metadata.
func TestAcceptInvite_RecordsAuditLogUnderOwner(t *testing.T) {
	gin.SetMode(gin.TestMode)
	collab, auth := newTestCollaboratorHandler(t)
	ownerID := registerTestUser(t, auth)
	collaboratorID := registerTestUser(t, auth)

	var collaboratorEmail string
	if err := collab.DB.QueryRow(t.Context(), `SELECT email FROM users WHERE id = $1`, collaboratorID).Scan(&collaboratorEmail); err != nil {
		t.Fatalf("gagal ambil email kolaborator: %v", err)
	}

	router := newTeamTestRouter(collab)
	doJSON(t, router, http.MethodPost, "/collaborators", map[string]any{
		"email_or_username": collaboratorEmail, "role": "content_admin",
	}, map[string]string{"X-Test-UserID": ownerID})

	invitesRec := doJSON(t, router, http.MethodGet, "/collaboration-invites", nil, map[string]string{"X-Test-UserID": collaboratorID})
	var invites []pendingInviteItem
	if err := json.Unmarshal(invitesRec.Body.Bytes(), &invites); err != nil || len(invites) != 1 {
		t.Fatalf("gagal ambil undangan: err=%v, invites=%+v", err, invites)
	}

	acceptRec := doJSON(t, router, http.MethodPost, "/collaboration-invites/"+invites[0].ID+"/accept", nil, map[string]string{"X-Test-UserID": collaboratorID})
	if acceptRec.Code != http.StatusOK {
		t.Fatalf("accept gagal: status %d, body %s", acceptRec.Code, acceptRec.Body.String())
	}

	var count int
	if err := collab.DB.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM audit_log WHERE user_id = $1 AND action = 'team.invite_accepted'
	`, ownerID).Scan(&count); err != nil {
		t.Fatalf("gagal query audit_log: %v", err)
	}
	if count != 1 {
		t.Fatalf("audit_log count (milik owner) = %d, ekspektasi 1 baris team.invite_accepted", count)
	}
}

// Acceptance criteria Modul Settings §4: pemilik bisa lihat siapa mengubah
// apa dan kapan dari UI (endpoint ini) -- membuktikan urutan (terbaru
// dulu) & bahwa cuma action "team.*" milik owner ini yang muncul.
func TestListAuditLog_ReturnsOwnerScopedTeamEntriesNewestFirst(t *testing.T) {
	gin.SetMode(gin.TestMode)
	collab, auth := newTestCollaboratorHandler(t)
	ownerID := registerTestUser(t, auth)
	otherOwnerID := registerTestUser(t, auth)

	router := newTeamTestRouter(collab)

	doJSON(t, router, http.MethodPost, "/collaborators", map[string]any{
		"email_or_username": "audit-a@example.com", "role": "content_admin",
	}, map[string]string{"X-Test-UserID": ownerID})
	doJSON(t, router, http.MethodPost, "/collaborators", map[string]any{
		"email_or_username": "audit-b@example.com", "role": "sales_admin",
	}, map[string]string{"X-Test-UserID": ownerID})
	// Punya owner LAIN -- tidak boleh ikut muncul di audit log ownerID.
	doJSON(t, router, http.MethodPost, "/collaborators", map[string]any{
		"email_or_username": "audit-c@example.com", "role": "content_admin",
	}, map[string]string{"X-Test-UserID": otherOwnerID})

	rec := doJSON(t, router, http.MethodGet, "/team/audit-log", nil, map[string]string{"X-Test-UserID": ownerID})
	if rec.Code != http.StatusOK {
		t.Fatalf("list audit log gagal: status %d, body %s", rec.Code, rec.Body.String())
	}
	var items []auditLogItem
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode audit log: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("len(items) = %d, ekspektasi 2 (hanya milik ownerID)", len(items))
	}
	if !items[0].CreatedAt.After(items[1].CreatedAt) && !items[0].CreatedAt.Equal(items[1].CreatedAt) {
		t.Errorf("urutan bukan terbaru dulu: %v lalu %v", items[0].CreatedAt, items[1].CreatedAt)
	}
	for _, it := range items {
		if it.Action != "team.invited" {
			t.Errorf("action = %q, ekspektasi \"team.invited\"", it.Action)
		}
	}
}
