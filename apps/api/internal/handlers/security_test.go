package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp/totp"

	"github.com/jeonme/api/internal/database"
)

func newTestSecurityHandler(t *testing.T) (*SecurityHandler, *AuthHandler) {
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

	return NewSecurityHandler(db, rdb), NewAuthHandler(db, rdb, "test-secret", "test")
}

// fakeAuthWithJTI — sama seperti fakeAuth, tapi juga menyisipkan "jti" ke
// context supaya SecurityHandler.ListSessions bisa menandai is_current.
func fakeAuthWithJTI(jti string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("userID", c.GetHeader("X-Test-UserID"))
		c.Set("jti", jti)
		c.Next()
	}
}

func TestChangePassword_RequiresCorrectOldPasswordThenAllowsLogin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	security, auth := newTestSecurityHandler(t)
	userID := registerTestUser(t, auth)
	markEmailVerified(t, auth, userID)

	var email string
	if err := security.DB.QueryRow(t.Context(), `SELECT email FROM users WHERE id = $1`, userID).Scan(&email); err != nil {
		t.Fatalf("gagal ambil email: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/security/password", security.ChangePassword)
	router.POST("/login", auth.Login)
	headers := map[string]string{"X-Test-UserID": userID}

	wrongRec := doJSON(t, router, http.MethodPatch, "/security/password", map[string]any{
		"old_password": "salahsekali", "new_password": "passwordbaru123",
	}, headers)
	if wrongRec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, ekspektasi 401 untuk password lama salah, body %s", wrongRec.Code, wrongRec.Body.String())
	}

	okRec := doJSON(t, router, http.MethodPatch, "/security/password", map[string]any{
		"old_password": "password123", "new_password": "passwordbaru123",
	}, headers)
	if okRec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", okRec.Code, okRec.Body.String())
	}

	loginRec := doJSON(t, router, http.MethodPost, "/login", map[string]any{"email": email, "password": "passwordbaru123"}, nil)
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login dengan password baru gagal: status %d, body %s", loginRec.Code, loginRec.Body.String())
	}

	oldLoginRec := doJSON(t, router, http.MethodPost, "/login", map[string]any{"email": email, "password": "password123"}, nil)
	if oldLoginRec.Code != http.StatusUnauthorized {
		t.Errorf("login dengan password lama masih berhasil (status %d), ekspektasi 401", oldLoginRec.Code)
	}
}

func TestTwoFactor_EnableVerifyThenDisable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	security, auth := newTestSecurityHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/security/2fa/enable", security.Enable2FA)
	g.POST("/security/2fa/verify", security.Verify2FA)
	g.POST("/security/2fa/disable", security.Disable2FA)
	g.GET("/security/2fa/status", security.Status2FA)
	headers := map[string]string{"X-Test-UserID": userID}

	enableRec := doJSON(t, router, http.MethodPost, "/security/2fa/enable", nil, headers)
	if enableRec.Code != http.StatusOK {
		t.Fatalf("enable gagal: status %d, body %s", enableRec.Code, enableRec.Body.String())
	}
	var enableResp struct {
		Secret string `json:"secret"`
	}
	if err := json.Unmarshal(enableRec.Body.Bytes(), &enableResp); err != nil {
		t.Fatalf("gagal decode enable response: %v", err)
	}

	// Kode dari 10 menit lalu -- di luar window skew (±1 periode 30 detik),
	// jadi PASTI ditolak (tidak seperti "000000" yang punya peluang kecil
	// kebetulan cocok).
	staleCode, err := totp.GenerateCode(enableResp.Secret, time.Now().Add(-10*time.Minute))
	if err != nil {
		t.Fatalf("gagal generate kode basi: %v", err)
	}
	wrongCodeRec := doJSON(t, router, http.MethodPost, "/security/2fa/verify", map[string]any{"code": staleCode}, headers)
	if wrongCodeRec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, ekspektasi 401 untuk kode basi, body %s", wrongCodeRec.Code, wrongCodeRec.Body.String())
	}

	code, err := totp.GenerateCode(enableResp.Secret, time.Now())
	if err != nil {
		t.Fatalf("gagal generate kode TOTP: %v", err)
	}
	verifyRec := doJSON(t, router, http.MethodPost, "/security/2fa/verify", map[string]any{"code": code}, headers)
	if verifyRec.Code != http.StatusOK {
		t.Fatalf("verify gagal: status %d, body %s", verifyRec.Code, verifyRec.Body.String())
	}

	var status status2FAResponse
	statusRec := doJSON(t, router, http.MethodGet, "/security/2fa/status", nil, headers)
	if err := json.Unmarshal(statusRec.Body.Bytes(), &status); err != nil {
		t.Fatalf("gagal decode status: %v", err)
	}
	if !status.Enabled {
		t.Error("status.Enabled = false, ekspektasi true setelah verify sukses")
	}

	disableWrongRec := doJSON(t, router, http.MethodPost, "/security/2fa/disable", map[string]any{"password": "salah"}, headers)
	if disableWrongRec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, ekspektasi 401 untuk password salah saat disable", disableWrongRec.Code)
	}

	disableRec := doJSON(t, router, http.MethodPost, "/security/2fa/disable", map[string]any{"password": "password123"}, headers)
	if disableRec.Code != http.StatusOK {
		t.Fatalf("disable gagal: status %d, body %s", disableRec.Code, disableRec.Body.String())
	}

	var status2 status2FAResponse
	statusRec2 := doJSON(t, router, http.MethodGet, "/security/2fa/status", nil, headers)
	if err := json.Unmarshal(statusRec2.Body.Bytes(), &status2); err != nil {
		t.Fatalf("gagal decode status kedua: %v", err)
	}
	if status2.Enabled {
		t.Error("status.Enabled masih true setelah disable")
	}
}

// Acceptance criteria Modul Settings §5: prompt wajib 2FA muncul begitu ada
// rekening bank di KYC, dan bisa di-snooze maksimal 7 hari (bukan permanen).
func TestTwoFactor_StatusRequiredWhenBankAccountSet_AndSnoozeDefers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	security, auth := newTestSecurityHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/security/2fa/status", security.Status2FA)
	g.POST("/security/2fa/snooze", security.Snooze2FA)
	headers := map[string]string{"X-Test-UserID": userID}

	getStatus := func() status2FAResponse {
		rec := doJSON(t, router, http.MethodGet, "/security/2fa/status", nil, headers)
		var s status2FAResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &s); err != nil {
			t.Fatalf("gagal decode status: %v", err)
		}
		return s
	}

	if s := getStatus(); s.Required {
		t.Error("required = true sebelum ada data bank KYC, ekspektasi false")
	}

	// Simulasikan KYC terisi -- cukup kolom yang dibaca Status2FA, tidak
	// perlu lewat alur upload KycHandler.Submit yang sesungguhnya.
	if _, err := security.DB.Exec(t.Context(), `
		INSERT INTO kyc_verifications (id, user_id, status, bank_account_name)
		VALUES (gen_random_uuid(), $1, 'pending', 'Nama Pemilik Rekening')
	`, userID); err != nil {
		t.Fatalf("gagal setup kyc: %v", err)
	}

	if s := getStatus(); !s.Required {
		t.Error("required = false setelah bank_account_name terisi, ekspektasi true")
	}

	snoozeRec := doJSON(t, router, http.MethodPost, "/security/2fa/snooze", nil, headers)
	if snoozeRec.Code != http.StatusOK {
		t.Fatalf("snooze gagal: status %d, body %s", snoozeRec.Code, snoozeRec.Body.String())
	}

	s := getStatus()
	if s.Required {
		t.Error("required masih true segera setelah snooze, ekspektasi false")
	}
	if s.SnoozedUntil == nil {
		t.Fatal("snoozed_until kosong setelah snooze")
	}
	maxExpected := time.Now().Add(7*24*time.Hour + time.Minute)
	if s.SnoozedUntil.After(maxExpected) {
		t.Errorf("snoozed_until = %v, melebihi batas maksimal 7 hari", s.SnoozedUntil)
	}
}

// Login untuk akun ber-2FA tidak boleh langsung mengeluarkan token asli --
// harus lewat VerifyLogin2FA dengan kode TOTP yang benar dulu.
func TestLogin_With2FAEnabled_RequiresChallengeThenIssuesToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	security, auth := newTestSecurityHandler(t)
	userID := registerTestUser(t, auth)
	markEmailVerified(t, auth, userID)

	var email string
	if err := security.DB.QueryRow(t.Context(), `SELECT email FROM users WHERE id = $1`, userID).Scan(&email); err != nil {
		t.Fatalf("gagal ambil email: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/security/2fa/enable", security.Enable2FA)
	g.POST("/security/2fa/verify", security.Verify2FA)
	router.POST("/login", auth.Login)
	router.POST("/2fa/verify-login", auth.VerifyLogin2FA)
	headers := map[string]string{"X-Test-UserID": userID}

	enableRec := doJSON(t, router, http.MethodPost, "/security/2fa/enable", nil, headers)
	var enableResp struct {
		Secret string `json:"secret"`
	}
	if err := json.Unmarshal(enableRec.Body.Bytes(), &enableResp); err != nil {
		t.Fatalf("gagal decode enable response: %v", err)
	}
	code, _ := totp.GenerateCode(enableResp.Secret, time.Now())
	verifyRec := doJSON(t, router, http.MethodPost, "/security/2fa/verify", map[string]any{"code": code}, headers)
	if verifyRec.Code != http.StatusOK {
		t.Fatalf("setup verify gagal: status %d, body %s", verifyRec.Code, verifyRec.Body.String())
	}

	loginRec := doJSON(t, router, http.MethodPost, "/login", map[string]any{"email": email, "password": "password123"}, nil)
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login gagal: status %d, body %s", loginRec.Code, loginRec.Body.String())
	}
	var loginResp struct {
		Token       string `json:"token"`
		MFARequired bool   `json:"mfa_required"`
		MFAToken    string `json:"mfa_token"`
	}
	if err := json.Unmarshal(loginRec.Body.Bytes(), &loginResp); err != nil {
		t.Fatalf("gagal decode login response: %v", err)
	}
	if !loginResp.MFARequired || loginResp.MFAToken == "" {
		t.Fatalf("login response = %+v, ekspektasi mfa_required=true dengan mfa_token terisi", loginResp)
	}
	if loginResp.Token != "" {
		t.Error("token JWT sungguhan terbit langsung dari Login meski 2FA aktif -- seharusnya menunggu VerifyLogin2FA")
	}

	staleCode, _ := totp.GenerateCode(enableResp.Secret, time.Now().Add(-10*time.Minute))
	wrongVerifyRec := doJSON(t, router, http.MethodPost, "/2fa/verify-login", map[string]any{
		"mfa_token": loginResp.MFAToken, "code": staleCode,
	}, nil)
	if wrongVerifyRec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, ekspektasi 401 untuk kode salah, body %s", wrongVerifyRec.Code, wrongVerifyRec.Body.String())
	}

	code2, _ := totp.GenerateCode(enableResp.Secret, time.Now())
	finalRec := doJSON(t, router, http.MethodPost, "/2fa/verify-login", map[string]any{
		"mfa_token": loginResp.MFAToken, "code": code2,
	}, nil)
	if finalRec.Code != http.StatusOK {
		t.Fatalf("verify-login gagal: status %d, body %s", finalRec.Code, finalRec.Body.String())
	}
	var finalResp struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(finalRec.Body.Bytes(), &finalResp); err != nil {
		t.Fatalf("gagal decode verify-login response: %v", err)
	}
	if finalResp.Token == "" {
		t.Error("token kosong setelah verify-login sukses")
	}
}

// Acceptance criteria Modul Settings §5: mencabut sesi lain berefek REAL-TIME
// (langsung masuk denylist Redis), bukan menunggu token itu kedaluwarsa.
func TestSessions_ListShowsCurrentAndRevokeInvalidatesImmediately(t *testing.T) {
	gin.SetMode(gin.TestMode)
	security, auth := newTestSecurityHandler(t)
	userID := registerTestUser(t, auth)
	markEmailVerified(t, auth, userID)

	var email string
	if err := security.DB.QueryRow(t.Context(), `SELECT email FROM users WHERE id = $1`, userID).Scan(&email); err != nil {
		t.Fatalf("gagal ambil email: %v", err)
	}

	loginRouter := gin.New()
	loginRouter.POST("/login", auth.Login)
	loginRec := doJSON(t, loginRouter, http.MethodPost, "/login", map[string]any{"email": email, "password": "password123"}, nil)
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login gagal: status %d, body %s", loginRec.Code, loginRec.Body.String())
	}

	prefix := sessionKey(userID, "")
	keys, err := security.RDB.Keys(t.Context(), prefix+"*").Result()
	if err != nil || len(keys) != 1 {
		t.Fatalf("gagal ambil sesi tercatat: err=%v, keys=%v", err, keys)
	}
	jti := strings.TrimPrefix(keys[0], prefix)

	router := gin.New()
	g := router.Group("/", fakeAuthWithJTI(jti))
	g.GET("/security/sessions", security.ListSessions)
	g.DELETE("/security/sessions/:jti", security.RevokeSession)
	headers := map[string]string{"X-Test-UserID": userID}

	listRec := doJSON(t, router, http.MethodGet, "/security/sessions", nil, headers)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list sessions gagal: status %d, body %s", listRec.Code, listRec.Body.String())
	}
	var sessions []sessionItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &sessions); err != nil {
		t.Fatalf("gagal decode daftar sesi: %v", err)
	}
	if len(sessions) != 1 || !sessions[0].IsCurrent {
		t.Fatalf("sessions = %+v, ekspektasi 1 sesi dengan is_current=true", sessions)
	}

	revokeRec := doJSON(t, router, http.MethodDelete, "/security/sessions/"+jti, nil, headers)
	if revokeRec.Code != http.StatusOK {
		t.Fatalf("revoke gagal: status %d, body %s", revokeRec.Code, revokeRec.Body.String())
	}

	exists, err := security.RDB.Exists(t.Context(), "revoked_jti:"+jti).Result()
	if err != nil || exists == 0 {
		t.Errorf("revoked_jti:%s tidak ada di Redis setelah revoke -- ekspektasi langsung masuk denylist", jti)
	}

	stillThere, err := security.RDB.Exists(t.Context(), keys[0]).Result()
	if err != nil || stillThere != 0 {
		t.Errorf("catatan sesi %s masih ada setelah revoke, ekspektasi terhapus", keys[0])
	}
}

