package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

func newTestAccountHandler(t *testing.T) (*AccountHandler, *AuthHandler, *PageHandler) {
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

	// Storage sengaja nil -- pola sama dengan test produk/checkout lain di
	// package ini (tidak menyentuh MinIO sungguhan lewat Go test, jalur
	// Export yang butuh Storage nyata diverifikasi lewat Playwright e2e
	// terhadap MinIO dev sungguhan).
	return NewAccountHandler(db, rdb, nil), NewAuthHandler(db, rdb, "test-secret", "test"), NewPageHandler(db, rdb, nil)
}

// Acceptance criteria Modul Settings §6: nonaktifkan akun reversibel KAPAN
// SAJA, tanpa masa tunggu -- halaman publik langsung tidak tampil, lalu
// muncul lagi persis seperti semula begitu diaktifkan kembali.
func TestDeactivate_HidesPublicPageThenReactivateRestoresIt(t *testing.T) {
	gin.SetMode(gin.TestMode)
	account, auth, page := newTestAccountHandler(t)
	userID := registerTestUser(t, auth)

	if _, err := account.DB.Exec(t.Context(), `UPDATE pages SET is_published = true WHERE user_id = $1`, userID); err != nil {
		t.Fatalf("gagal setup halaman: %v", err)
	}
	var username string
	if err := account.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err != nil {
		t.Fatalf("gagal ambil username: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/account/deactivate", account.Deactivate)
	g.POST("/account/reactivate", account.Reactivate)
	router.GET("/pages/:username", page.GetPublicPage)
	headers := map[string]string{"X-Test-UserID": userID}

	beforeRec := doJSON(t, router, http.MethodGet, "/pages/"+username, nil, nil)
	if beforeRec.Code != http.StatusOK {
		t.Fatalf("halaman publik sebelum nonaktif: status %d, ekspektasi 200", beforeRec.Code)
	}

	wrongPassRec := doJSON(t, router, http.MethodPost, "/account/deactivate", map[string]any{"password": "salah"}, headers)
	if wrongPassRec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, ekspektasi 401 untuk password salah", wrongPassRec.Code)
	}

	deactivateRec := doJSON(t, router, http.MethodPost, "/account/deactivate", map[string]any{"password": "password123"}, headers)
	if deactivateRec.Code != http.StatusOK {
		t.Fatalf("deactivate gagal: status %d, body %s", deactivateRec.Code, deactivateRec.Body.String())
	}

	duringRec := doJSON(t, router, http.MethodGet, "/pages/"+username, nil, nil)
	if duringRec.Code != http.StatusNotFound {
		t.Fatalf("halaman publik saat nonaktif: status %d, ekspektasi 404", duringRec.Code)
	}

	reactivateRec := doJSON(t, router, http.MethodPost, "/account/reactivate", nil, headers)
	if reactivateRec.Code != http.StatusOK {
		t.Fatalf("reactivate gagal: status %d, body %s", reactivateRec.Code, reactivateRec.Body.String())
	}

	afterRec := doJSON(t, router, http.MethodGet, "/pages/"+username, nil, nil)
	if afterRec.Code != http.StatusOK {
		t.Fatalf("halaman publik setelah reactivate: status %d, ekspektasi 200", afterRec.Code)
	}
}

// Acceptance criteria Modul Settings §6: konfirmasi berlapis (username +
// password) sebelum menjadwalkan hapus, dan TIDAK ADA anonimisasi instan --
// scheduled_purge_at harus ~14 hari ke depan, bukan sekarang.
func TestRequestDeletion_RequiresUsernameAndPasswordThenSchedules14Days(t *testing.T) {
	gin.SetMode(gin.TestMode)
	account, auth, page := newTestAccountHandler(t)
	userID := registerTestUser(t, auth)

	var username string
	if err := account.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err != nil {
		t.Fatalf("gagal ambil username: %v", err)
	}
	if _, err := account.DB.Exec(t.Context(), `UPDATE pages SET is_published = true WHERE user_id = $1`, userID); err != nil {
		t.Fatalf("gagal setup halaman: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/account/request-deletion", account.RequestDeletion)
	g.GET("/account/deletion-status", account.DeletionStatus)
	router.GET("/pages/:username", page.GetPublicPage)
	headers := map[string]string{"X-Test-UserID": userID}

	wrongUsernameRec := doJSON(t, router, http.MethodPost, "/account/request-deletion", map[string]any{
		"username_confirmation": "bukan-username-ini", "password": "password123",
	}, headers)
	if wrongUsernameRec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi 400 untuk username konfirmasi salah", wrongUsernameRec.Code)
	}

	wrongPasswordRec := doJSON(t, router, http.MethodPost, "/account/request-deletion", map[string]any{
		"username_confirmation": username, "password": "salah",
	}, headers)
	if wrongPasswordRec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, ekspektasi 401 untuk password salah", wrongPasswordRec.Code)
	}

	okRec := doJSON(t, router, http.MethodPost, "/account/request-deletion", map[string]any{
		"username_confirmation": username, "password": "password123",
	}, headers)
	if okRec.Code != http.StatusOK {
		t.Fatalf("request-deletion gagal: status %d, body %s", okRec.Code, okRec.Body.String())
	}
	var okResp struct {
		ScheduledPurgeAt time.Time `json:"scheduled_purge_at"`
	}
	if err := json.Unmarshal(okRec.Body.Bytes(), &okResp); err != nil {
		t.Fatalf("gagal decode response: %v", err)
	}
	daysUntilPurge := time.Until(okResp.ScheduledPurgeAt).Hours() / 24
	if daysUntilPurge < 13.9 || daysUntilPurge > 14.1 {
		t.Errorf("scheduled_purge_at = %v (%.2f hari lagi), ekspektasi ~14 hari", okResp.ScheduledPurgeAt, daysUntilPurge)
	}

	// Data TIDAK dianonimkan instan -- username asli masih dipakai untuk
	// login/tampilan, cuma halaman publik yang langsung tidak tampil.
	var currentUsername string
	if err := account.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userID).Scan(&currentUsername); err != nil {
		t.Fatalf("gagal query username: %v", err)
	}
	if currentUsername != username {
		t.Errorf("username berubah jadi %q segera setelah request-deletion, ekspektasi tetap %q (belum purge)", currentUsername, username)
	}

	statusRec := doJSON(t, router, http.MethodGet, "/account/deletion-status", nil, headers)
	var status deletionStatusResponse
	if err := json.Unmarshal(statusRec.Body.Bytes(), &status); err != nil {
		t.Fatalf("gagal decode status: %v", err)
	}
	if !status.Pending {
		t.Error("status.Pending = false setelah request-deletion, ekspektasi true")
	}

	pageRec := doJSON(t, router, http.MethodGet, "/pages/"+username, nil, nil)
	if pageRec.Code != http.StatusNotFound {
		t.Errorf("halaman publik status = %d setelah request-deletion, ekspektasi 404 (pending deletion)", pageRec.Code)
	}

	// Tidak boleh ada permintaan pending kedua di saat yang sama.
	secondRec := doJSON(t, router, http.MethodPost, "/account/request-deletion", map[string]any{
		"username_confirmation": username, "password": "password123",
	}, headers)
	if secondRec.Code != http.StatusConflict {
		t.Fatalf("status = %d, ekspektasi 409 untuk permintaan kedua saat masih pending", secondRec.Code)
	}
}

// Acceptance criteria Modul Settings §6: bisa dibatalkan kapan pun sebelum
// jatuh tempo -- halaman publik tampil lagi begitu dibatalkan.
func TestCancelDeletion_RestoresPendingState(t *testing.T) {
	gin.SetMode(gin.TestMode)
	account, auth, page := newTestAccountHandler(t)
	userID := registerTestUser(t, auth)

	var username string
	if err := account.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err != nil {
		t.Fatalf("gagal ambil username: %v", err)
	}
	if _, err := account.DB.Exec(t.Context(), `UPDATE pages SET is_published = true WHERE user_id = $1`, userID); err != nil {
		t.Fatalf("gagal setup halaman: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/account/request-deletion", account.RequestDeletion)
	g.POST("/account/cancel-deletion", account.CancelDeletion)
	g.GET("/account/deletion-status", account.DeletionStatus)
	router.GET("/pages/:username", page.GetPublicPage)
	headers := map[string]string{"X-Test-UserID": userID}

	notPendingRec := doJSON(t, router, http.MethodPost, "/account/cancel-deletion", nil, headers)
	if notPendingRec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, ekspektasi 404 kalau belum ada permintaan pending", notPendingRec.Code)
	}

	if rec := doJSON(t, router, http.MethodPost, "/account/request-deletion", map[string]any{
		"username_confirmation": username, "password": "password123",
	}, headers); rec.Code != http.StatusOK {
		t.Fatalf("gagal setup request-deletion: status %d, body %s", rec.Code, rec.Body.String())
	}

	cancelRec := doJSON(t, router, http.MethodPost, "/account/cancel-deletion", nil, headers)
	if cancelRec.Code != http.StatusOK {
		t.Fatalf("cancel-deletion gagal: status %d, body %s", cancelRec.Code, cancelRec.Body.String())
	}

	statusRec := doJSON(t, router, http.MethodGet, "/account/deletion-status", nil, headers)
	var status deletionStatusResponse
	if err := json.Unmarshal(statusRec.Body.Bytes(), &status); err != nil {
		t.Fatalf("gagal decode status: %v", err)
	}
	if status.Pending {
		t.Error("status.Pending masih true setelah dibatalkan")
	}

	pageRec := doJSON(t, router, http.MethodGet, "/pages/"+username, nil, nil)
	if pageRec.Code != http.StatusOK {
		t.Errorf("halaman publik status = %d setelah dibatalkan, ekspektasi 200 (tidak lagi pending deletion)", pageRec.Code)
	}

	// Setelah dibatalkan, permintaan BARU harus bisa diajukan lagi (unique
	// index parsial cuma menolak status='pending' ganda, bukan histori).
	if rec := doJSON(t, router, http.MethodPost, "/account/request-deletion", map[string]any{
		"username_confirmation": username, "password": "password123",
	}, headers); rec.Code != http.StatusOK {
		t.Fatalf("gagal ajukan ulang setelah dibatalkan: status %d, body %s", rec.Code, rec.Body.String())
	}
}

func TestExport_WithoutStorageConfigured_Returns503(t *testing.T) {
	gin.SetMode(gin.TestMode)
	account, auth, _ := newTestAccountHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/account/export", account.Export)

	rec := doJSON(t, router, http.MethodGet, "/account/export", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, ekspektasi 503 tanpa storage dikonfigurasi", rec.Code)
	}
}
