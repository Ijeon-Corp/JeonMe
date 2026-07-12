package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/jeonme/api/internal/database"
)

func newTestAuthHandler(t *testing.T) *AuthHandler {
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

	return NewAuthHandler(db, rdb, "test-secret", "test")
}

func doJSON(t *testing.T, router *gin.Engine, method, path string, body any, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("gagal encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

// Membuktikan Register benar-benar membuat baris "pages" dalam transaksi yang
// sama -- tanpa ini, endpoint CRUD tautan (REQ-F-202/203) akan gagal karena
// tidak ada page_id untuk ditautkan.
func TestRegister_CreatesUserAndPage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTestAuthHandler(t)

	router := gin.New()
	router.POST("/register", h.Register)

	suffix := uuid.NewString()[:8]
	body := map[string]string{
		"email":    "test-" + suffix + "@example.com",
		"password": "password123",
		"username": "user" + suffix,
	}

	rec := doJSON(t, router, http.MethodPost, "/register", body, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, ekspektasi %d. Body: %s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var resp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode response: %v", err)
	}

	var pageCount int
	err := h.DB.QueryRow(t.Context(), `SELECT COUNT(*) FROM pages WHERE user_id = $1`, resp.ID).Scan(&pageCount)
	if err != nil {
		t.Fatalf("gagal query pages: %v", err)
	}
	if pageCount != 1 {
		t.Fatalf("pageCount = %d, ekspektasi 1 -- Register harus membuat tepat satu baris pages", pageCount)
	}
}

// Membuktikan konflik email/username terdeteksi lewat unique constraint
// Postgres (23505) dan pesan errornya jelas -- ini yang sebelumnya jadi TODO.
func TestRegister_DuplicateEmail_ReturnsConflict(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTestAuthHandler(t)

	router := gin.New()
	router.POST("/register", h.Register)

	suffix := uuid.NewString()[:8]
	email := "dup-" + suffix + "@example.com"

	first := doJSON(t, router, http.MethodPost, "/register", map[string]string{
		"email": email, "password": "password123", "username": "first" + suffix,
	}, nil)
	if first.Code != http.StatusCreated {
		t.Fatalf("registrasi pertama gagal: status %d, body %s", first.Code, first.Body.String())
	}

	second := doJSON(t, router, http.MethodPost, "/register", map[string]string{
		"email": email, "password": "password123", "username": "second" + suffix,
	}, nil)
	if second.Code != http.StatusConflict {
		t.Fatalf("status = %d, ekspektasi %d (konflik email duplikat). Body: %s", second.Code, http.StatusConflict, second.Body.String())
	}
}

// Alur reset password end-to-end: request (dev mode mengembalikan token),
// confirm dengan token itu, lalu pastikan password baru benar-benar berlaku.
func TestPasswordReset_RequestThenConfirm(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTestAuthHandler(t)

	router := gin.New()
	router.POST("/register", h.Register)
	router.POST("/login", h.Login)
	router.POST("/password-reset/request", h.RequestPasswordReset)
	router.POST("/password-reset/confirm", h.ConfirmPasswordReset)

	suffix := uuid.NewString()[:8]
	email := "reset-" + suffix + "@example.com"

	regRec := doJSON(t, router, http.MethodPost, "/register", map[string]string{
		"email": email, "password": "oldpassword1", "username": "reset" + suffix,
	}, nil)
	if regRec.Code != http.StatusCreated {
		t.Fatalf("registrasi gagal: %s", regRec.Body.String())
	}

	reqRec := doJSON(t, router, http.MethodPost, "/password-reset/request", map[string]string{"email": email}, nil)
	if reqRec.Code != http.StatusOK {
		t.Fatalf("request reset gagal: status %d, body %s", reqRec.Code, reqRec.Body.String())
	}

	var reqResp struct {
		DevResetToken string `json:"dev_reset_token"`
	}
	if err := json.Unmarshal(reqRec.Body.Bytes(), &reqResp); err != nil || reqResp.DevResetToken == "" {
		t.Fatalf("dev_reset_token tidak ada di response (AppEnv seharusnya 'test' != production): %s", reqRec.Body.String())
	}

	confirmRec := doJSON(t, router, http.MethodPost, "/password-reset/confirm", map[string]string{
		"token": reqResp.DevResetToken, "new_password": "newpassword1",
	}, nil)
	if confirmRec.Code != http.StatusOK {
		t.Fatalf("confirm reset gagal: status %d, body %s", confirmRec.Code, confirmRec.Body.String())
	}

	loginRec := doJSON(t, router, http.MethodPost, "/login", map[string]string{
		"email": email, "password": "newpassword1",
	}, nil)
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login dengan password baru gagal: status %d, body %s", loginRec.Code, loginRec.Body.String())
	}
}
