package handlers

import (
	"context"
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

	return NewAdminHandler(db, rdb), NewAuthHandler(db, rdb, "test-secret", "test")
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

	// Filter by targetID SENDIRI, bukan asumsi "cuma ada 1 laporan pending
	// di seluruh sistem" -- endpoint ini tidak di-scope per-test, test lain
	// (atau run sebelumnya) bisa saja sudah/masih punya laporan pending
	// lain yang tidak terkait.
	listRec := doJSON(t, router, http.MethodGet, "/admin/reports?limit=100", nil, map[string]string{"X-Test-UserID": adminID})
	var reportsResp paginatedResponse[reportItem]
	if err := json.Unmarshal(listRec.Body.Bytes(), &reportsResp); err != nil {
		t.Fatalf("gagal decode list reports: %v, body: %s", err, listRec.Body.String())
	}
	var reportID string
	for _, r := range reportsResp.Items {
		if r.TargetID == pageID {
			reportID = r.ID
			break
		}
	}
	if reportID == "" {
		t.Fatalf("laporan utk pageID=%s tidak ditemukan di list: %+v", pageID, reportsResp)
	}
	t.Cleanup(func() {
		_, _ = admin.DB.Exec(context.Background(), `DELETE FROM reports WHERE id = $1`, reportID)
	})

	resolveRec := doJSON(t, router, http.MethodPatch, "/admin/reports/"+reportID+"/resolve", map[string]string{
		"action": "takedown",
	}, map[string]string{"X-Test-UserID": adminID})
	if resolveRec.Code != http.StatusOK {
		t.Fatalf("resolve gagal: status %d, body %s", resolveRec.Code, resolveRec.Body.String())
	}

	var isPublished bool
	var moderationLocked bool
	if err := admin.DB.QueryRow(t.Context(), `SELECT is_published, moderation_locked_at IS NOT NULL FROM pages WHERE id = $1`, pageID).Scan(&isPublished, &moderationLocked); err != nil {
		t.Fatalf("gagal query pages: %v", err)
	}
	if isPublished {
		t.Error("halaman masih is_published=true setelah takedown, ekspektasi false")
	}
	if !moderationLocked {
		t.Error("moderation_locked_at kosong setelah takedown, ekspektasi terisi (migrasi 000092)")
	}

	// Pemilik konten TIDAK BOLEH bisa mempublikasikan ulang sendiri selama
	// terkunci -- ini justru poin utama migrasi 000092 (audit fitur admin,
	// 5 September 2026): SEBELUMNYA takedown bisa langsung dibatalkan
	// sendiri oleh pemiliknya lewat alur edit biasa.
	page, _ := newTestPageHandler(t)
	pageRouter := gin.New()
	pageRouter.Group("/", fakeAuth()).PATCH("/dashboard/page", page.UpdateMyPage)
	republishRec := doJSON(t, pageRouter, http.MethodPatch, "/dashboard/page", map[string]any{
		"is_published": true,
	}, map[string]string{"X-Test-UserID": reportedUserID})
	if republishRec.Code != http.StatusForbidden {
		t.Fatalf("republish sendiri selagi terkunci = %d, ekspektasi 403. Body: %s", republishRec.Code, republishRec.Body.String())
	}

	// RestoreReport (kebalikan takedown) -- admin memulihkan, HARUS
	// menyalakan lagi is_published DAN mencabut kunci sekaligus.
	restoreRouter := gin.New()
	restoreRouter.Group("/", fakeAuth(), middleware.AdminRequired(admin.DB)).PATCH("/admin/reports/:id/restore", admin.RestoreReport)
	restoreRec2 := doJSON(t, restoreRouter, http.MethodPatch, "/admin/reports/"+reportID+"/restore", nil, map[string]string{"X-Test-UserID": adminID})
	if restoreRec2.Code != http.StatusOK {
		t.Fatalf("restore gagal: status %d, body %s", restoreRec2.Code, restoreRec2.Body.String())
	}

	var isPublishedAfterRestore, moderationLockedAfterRestore bool
	if err := admin.DB.QueryRow(t.Context(), `SELECT is_published, moderation_locked_at IS NOT NULL FROM pages WHERE id = $1`, pageID).Scan(&isPublishedAfterRestore, &moderationLockedAfterRestore); err != nil {
		t.Fatalf("gagal query pages setelah restore: %v", err)
	}
	if !isPublishedAfterRestore || moderationLockedAfterRestore {
		t.Errorf("setelah restore: is_published=%v moderation_locked=%v, ekspektasi true/false", isPublishedAfterRestore, moderationLockedAfterRestore)
	}

	var notifCount int
	if err := admin.DB.QueryRow(t.Context(), `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type IN ('content_takedown', 'content_restored')`, reportedUserID).Scan(&notifCount); err != nil {
		t.Fatalf("gagal query notifications: %v", err)
	}
	if notifCount != 2 {
		t.Errorf("notifCount = %d, ekspektasi 2 (takedown + restored)", notifCount)
	}
}
