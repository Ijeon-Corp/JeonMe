package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/jeonme/api/internal/database"
	"github.com/jeonme/api/internal/middleware"
)

func newTestAdminHandler(t *testing.T) (*AdminHandler, *AuthHandler) {
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

	return NewAdminHandler(db), NewAuthHandler(db, rdb, "test-secret", "test")
}

// promoteToAdmin mensimulasikan satu-satunya cara menjadi admin: SQL manual
// oleh operator (tidak ada endpoint API untuk ini, disengaja).
func promoteToAdmin(t *testing.T, admin *AdminHandler, userID string) {
	t.Helper()
	if _, err := admin.DB.Exec(t.Context(), `UPDATE users SET role = 'admin' WHERE id = $1`, userID); err != nil {
		t.Fatalf("gagal promosikan user jadi admin: %v", err)
	}
}

// Non-admin harus ditolak (403) walau sudah login sah -- REQ-F-701/702/703.
func TestAdminRoutes_RejectNonAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	admin, auth := newTestAdminHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth(), middleware.AdminRequired(admin.DB))
	g.GET("/admin/summary", admin.GetSummary)

	rec := doJSON(t, router, http.MethodGet, "/admin/summary", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, ekspektasi %d (bukan admin). Body: %s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

// Admin bisa suspend & aktifkan kembali user lain; user yang di-suspend
// ditolak login sampai diaktifkan lagi -- REQ-F-701.
func TestAdminSuspendActivate_BlocksAndRestoresLogin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	admin, auth := newTestAdminHandler(t)
	adminID := registerTestUser(t, auth)
	promoteToAdmin(t, admin, adminID)

	router := gin.New()
	g := router.Group("/", fakeAuth(), middleware.AdminRequired(admin.DB))
	g.PATCH("/admin/users/:id/suspend", admin.SuspendUser)
	g.PATCH("/admin/users/:id/activate", admin.ActivateUser)

	loginRouter := gin.New()
	loginRouter.POST("/login", auth.Login)
	loginRouter.POST("/register", auth.Register)

	suffix := "suspendtest" + uuid.NewString()[:8]
	email := suffix + "@example.com"
	regRec := doJSON(t, loginRouter, http.MethodPost, "/register", map[string]any{
		"email": email, "password": "password123", "username": suffix, "consent_accepted": true,
	}, nil)
	var reg struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(regRec.Body.Bytes(), &reg); err != nil {
		t.Fatalf("gagal decode register: %v", err)
	}
	markEmailVerified(t, auth, reg.ID)

	suspendRec := doJSON(t, router, http.MethodPatch, "/admin/users/"+reg.ID+"/suspend", nil, map[string]string{"X-Test-UserID": adminID})
	if suspendRec.Code != http.StatusOK {
		t.Fatalf("suspend gagal: status %d, body %s", suspendRec.Code, suspendRec.Body.String())
	}

	loginRec := doJSON(t, loginRouter, http.MethodPost, "/login", map[string]string{
		"email": email, "password": "password123",
	}, nil)
	if loginRec.Code != http.StatusForbidden {
		t.Fatalf("login setelah suspend = %d, ekspektasi %d", loginRec.Code, http.StatusForbidden)
	}

	activateRec := doJSON(t, router, http.MethodPatch, "/admin/users/"+reg.ID+"/activate", nil, map[string]string{"X-Test-UserID": adminID})
	if activateRec.Code != http.StatusOK {
		t.Fatalf("activate gagal: status %d, body %s", activateRec.Code, activateRec.Body.String())
	}

	loginRec2 := doJSON(t, loginRouter, http.MethodPost, "/login", map[string]string{
		"email": email, "password": "password123",
	}, nil)
	if loginRec2.Code != http.StatusOK {
		t.Fatalf("login setelah diaktifkan lagi = %d, ekspektasi %d. Body: %s", loginRec2.Code, http.StatusOK, loginRec2.Body.String())
	}
}

// Laporan publik yang di-takedown admin harus benar-benar menonaktifkan
// halaman yang dilaporkan -- REQ-F-702.
func TestReportTakedown_UnpublishesPage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	admin, auth := newTestAdminHandler(t)
	adminID := registerTestUser(t, auth)
	promoteToAdmin(t, admin, adminID)
	reportedUserID := registerTestUser(t, auth)

	if _, err := admin.DB.Exec(t.Context(), `UPDATE pages SET is_published = true WHERE user_id = $1`, reportedUserID); err != nil {
		t.Fatalf("gagal publish halaman: %v", err)
	}
	var pageID string
	if err := admin.DB.QueryRow(t.Context(), `SELECT id FROM pages WHERE user_id = $1`, reportedUserID).Scan(&pageID); err != nil {
		t.Fatalf("gagal ambil page id: %v", err)
	}

	router := gin.New()
	router.POST("/reports", admin.CreateReport)
	g := router.Group("/", fakeAuth(), middleware.AdminRequired(admin.DB))
	g.PATCH("/admin/reports/:id/resolve", admin.ResolveReport)
	g.GET("/admin/reports", admin.ListReports)

	createRec := doJSON(t, router, http.MethodPost, "/reports", map[string]string{
		"target_type": "page", "target_id": pageID, "reason": "konten tidak pantas",
	}, nil)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create report gagal: status %d, body %s", createRec.Code, createRec.Body.String())
	}

	listRec := doJSON(t, router, http.MethodGet, "/admin/reports", nil, map[string]string{"X-Test-UserID": adminID})
	var reports []reportItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &reports); err != nil || len(reports) != 1 {
		t.Fatalf("list reports = %+v (err=%v), ekspektasi tepat 1 laporan pending", reports, err)
	}

	resolveRec := doJSON(t, router, http.MethodPatch, "/admin/reports/"+reports[0].ID+"/resolve", map[string]string{
		"action": "takedown",
	}, map[string]string{"X-Test-UserID": adminID})
	if resolveRec.Code != http.StatusOK {
		t.Fatalf("resolve gagal: status %d, body %s", resolveRec.Code, resolveRec.Body.String())
	}

	var isPublished bool
	if err := admin.DB.QueryRow(t.Context(), `SELECT is_published FROM pages WHERE id = $1`, pageID).Scan(&isPublished); err != nil {
		t.Fatalf("gagal query pages: %v", err)
	}
	if isPublished {
		t.Error("halaman masih is_published=true setelah takedown, ekspektasi false")
	}
}
