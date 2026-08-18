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

// markEmailVerified -- gerbang aktivasi akun (permintaan langsung
// pengguna, 19 Agustus 2026: kode verifikasi email wajib sebelum akun
// baru bisa dipakai) membuat /login menolak akun yang baru saja
// register lewat helper test. Test-test di bawah ini TIDAK sedang
// menguji alur verifikasi itu sendiri (lihat TestConfirmSignupVerification_*
// terpisah) -- tandai langsung lewat SQL supaya /login tetap bisa dites
// end-to-end tanpa ikut terblokir gerbang yang tidak relevan dengan
// yang sedang diuji.
func markEmailVerified(t *testing.T, h *AuthHandler, userID string) {
	t.Helper()
	if _, err := h.DB.Exec(t.Context(), `UPDATE users SET email_verified_at = now() WHERE id = $1`, userID); err != nil {
		t.Fatalf("gagal menandai email terverifikasi: %v", err)
	}
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
	body := map[string]any{
		"email":            "test-" + suffix + "@example.com",
		"password":         "password123",
		"username":         "user" + suffix,
		"consent_accepted": true,
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

	first := doJSON(t, router, http.MethodPost, "/register", map[string]any{
		"email": email, "password": "password123", "username": "first" + suffix, "consent_accepted": true,
	}, nil)
	if first.Code != http.StatusCreated {
		t.Fatalf("registrasi pertama gagal: status %d, body %s", first.Code, first.Body.String())
	}

	second := doJSON(t, router, http.MethodPost, "/register", map[string]any{
		"email": email, "password": "password123", "username": "second" + suffix, "consent_accepted": true,
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

	regRec := doJSON(t, router, http.MethodPost, "/register", map[string]any{
		"email": email, "password": "oldpassword1", "username": "reset" + suffix, "consent_accepted": true,
	}, nil)
	if regRec.Code != http.StatusCreated {
		t.Fatalf("registrasi gagal: %s", regRec.Body.String())
	}
	var regResp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(regRec.Body.Bytes(), &regResp); err != nil {
		t.Fatalf("gagal decode response register: %v", err)
	}
	markEmailVerified(t, h, regResp.ID)

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

// NF-09: registrasi tanpa menyetujui pemrosesan data pribadi harus ditolak.
func TestRegister_WithoutConsent_Rejected(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTestAuthHandler(t)

	router := gin.New()
	router.POST("/register", h.Register)

	suffix := uuid.NewString()[:8]
	rec := doJSON(t, router, http.MethodPost, "/register", map[string]any{
		"email": "noconsent-" + suffix + "@example.com", "password": "password123",
		"username": "noconsent" + suffix, "consent_accepted": false,
	}, nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi %d (consent wajib). Body: %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

// registerUnverified -- helper khusus test verifikasi di bawah ini (BEDA
// dari registerTestUser di links_test.go yang tidak butuh dev_verification_code
// sama sekali): mendaftar lewat AuthHandler.Register sungguhan, mengembalikan
// email + kode aktivasi mentah dari respons dev-mode.
func registerUnverified(t *testing.T, h *AuthHandler) (email, code string) {
	t.Helper()
	router := gin.New()
	router.POST("/register", h.Register)

	suffix := uuid.NewString()[:8]
	email = "verify-" + suffix + "@example.com"
	rec := doJSON(t, router, http.MethodPost, "/register", map[string]any{
		"email": email, "password": "password123", "username": "verify" + suffix, "consent_accepted": true,
	}, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("registrasi gagal: status %d, body %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		EmailVerificationRequired bool   `json:"email_verification_required"`
		DevVerificationCode       string `json:"dev_verification_code"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode response register: %v", err)
	}
	if !resp.EmailVerificationRequired {
		t.Fatalf("email_verification_required = false, ekspektasi true untuk akun baru")
	}
	if resp.DevVerificationCode == "" {
		t.Fatalf("dev_verification_code tidak ada di response (AppEnv seharusnya 'test' != production): %s", rec.Body.String())
	}
	return email, resp.DevVerificationCode
}

// Akun baru TIDAK boleh bisa login sama sekali sebelum kode dari email
// dimasukkan -- inti permintaan pengguna 19 Agustus 2026 ("baru setelah
// itu akun bisa digunakan").
func TestRegister_BlocksLoginUntilEmailVerified(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTestAuthHandler(t)
	email, _ := registerUnverified(t, h)

	router := gin.New()
	router.POST("/login", h.Login)

	rec := doJSON(t, router, http.MethodPost, "/login", map[string]string{"email": email, "password": "password123"}, nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, ekspektasi %d (belum verifikasi email). Body: %s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
	var resp struct {
		EmailVerificationRequired bool `json:"email_verification_required"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err == nil && !resp.EmailVerificationRequired {
		t.Fatalf("email_verification_required = false di respons 403 login, ekspektasi true: %s", rec.Body.String())
	}
}

// Alur aktivasi lengkap: kode benar -> akun terverifikasi -> token
// diterbitkan LANGSUNG (tidak perlu /login terpisah) -> /login biasa juga
// jadi berhasil setelahnya.
func TestConfirmSignupVerification_CorrectCode_ActivatesAndIssuesToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTestAuthHandler(t)
	email, code := registerUnverified(t, h)

	router := gin.New()
	router.POST("/signup-verification/confirm", h.ConfirmSignupVerification)
	router.POST("/login", h.Login)

	confirmRec := doJSON(t, router, http.MethodPost, "/signup-verification/confirm", map[string]string{"email": email, "code": code}, nil)
	if confirmRec.Code != http.StatusOK {
		t.Fatalf("status = %d, ekspektasi %d. Body: %s", confirmRec.Code, http.StatusOK, confirmRec.Body.String())
	}
	var confirmResp struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(confirmRec.Body.Bytes(), &confirmResp); err != nil || confirmResp.Token == "" {
		t.Fatalf("token tidak ada di response confirm: %s", confirmRec.Body.String())
	}

	loginRec := doJSON(t, router, http.MethodPost, "/login", map[string]string{"email": email, "password": "password123"}, nil)
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login setelah verifikasi = %d, ekspektasi %d. Body: %s", loginRec.Code, http.StatusOK, loginRec.Body.String())
	}
}

// Kode salah tidak boleh mengaktifkan akun -- dan sesudah loginFailMaxAttempts
// (5) percobaan gagal, email itu dikunci sementara (checkVerifyLockout),
// persis pola brute-force lockout /login.
func TestConfirmSignupVerification_WrongCode_RejectedThenLocksOut(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTestAuthHandler(t)
	email, code := registerUnverified(t, h)
	wrongCode := "000000"
	if wrongCode == code {
		wrongCode = "111111"
	}

	router := gin.New()
	router.POST("/signup-verification/confirm", h.ConfirmSignupVerification)

	var lastRec *httptest.ResponseRecorder
	for i := 0; i < loginFailMaxAttempts; i++ {
		lastRec = doJSON(t, router, http.MethodPost, "/signup-verification/confirm", map[string]string{"email": email, "code": wrongCode}, nil)
		if lastRec.Code != http.StatusBadRequest {
			t.Fatalf("percobaan #%d: status = %d, ekspektasi %d (kode salah). Body: %s", i+1, lastRec.Code, http.StatusBadRequest, lastRec.Body.String())
		}
	}

	lockedRec := doJSON(t, router, http.MethodPost, "/signup-verification/confirm", map[string]string{"email": email, "code": code}, nil)
	if lockedRec.Code != http.StatusLocked {
		t.Fatalf("status setelah %d percobaan gagal = %d, ekspektasi %d (terkunci, walau kode kali ini BENAR). Body: %s",
			loginFailMaxAttempts, lockedRec.Code, http.StatusLocked, lockedRec.Body.String())
	}
}

// Kirim ulang menghasilkan kode BARU -- kode lama tetap ada di tabel tapi
// masih valid juga (belum dipakai/kedaluwarsa), keduanya sengaja boleh
// dipakai (lihat catatan ResendSignupVerification: tidak menghapus baris
// lama, cukup sederhana untuk kasus ini).
func TestResendSignupVerification_IssuesNewWorkingCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTestAuthHandler(t)
	email, oldCode := registerUnverified(t, h)

	router := gin.New()
	router.POST("/signup-verification/resend", h.ResendSignupVerification)
	router.POST("/signup-verification/confirm", h.ConfirmSignupVerification)

	resendRec := doJSON(t, router, http.MethodPost, "/signup-verification/resend", map[string]string{"email": email}, nil)
	if resendRec.Code != http.StatusOK {
		t.Fatalf("resend gagal: status %d, body %s", resendRec.Code, resendRec.Body.String())
	}
	var resendResp struct {
		DevVerificationCode string `json:"dev_verification_code"`
	}
	if err := json.Unmarshal(resendRec.Body.Bytes(), &resendResp); err != nil || resendResp.DevVerificationCode == "" {
		t.Fatalf("dev_verification_code tidak ada di response resend: %s", resendRec.Body.String())
	}
	if resendResp.DevVerificationCode == oldCode {
		t.Fatalf("kode baru sama persis dengan kode lama -- kemungkinan resend tidak benar-benar generate ulang (atau kebetulan tabrakan acak, coba ulang test)")
	}

	confirmRec := doJSON(t, router, http.MethodPost, "/signup-verification/confirm", map[string]string{"email": email, "code": resendResp.DevVerificationCode}, nil)
	if confirmRec.Code != http.StatusOK {
		t.Fatalf("confirm dengan kode hasil resend gagal: status %d, body %s", confirmRec.Code, confirmRec.Body.String())
	}
}
