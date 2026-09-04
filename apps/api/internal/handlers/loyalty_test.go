package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/jeonme/api/internal/database"
)

func newTestLoyaltyHandler(t *testing.T) (*LoyaltyHandler, *AuthHandler) {
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

	// Queue sengaja nil (pola sama dengan Storage nil di test lain) --
	// RequestVerificationCode soft-fail kalau Queue nil, kode mentah tetap
	// didapat lewat dev_verification_code (AppEnv "test" != "production").
	return NewLoyaltyHandler(db, rdb, nil, "test"), NewAuthHandler(db, rdb, "test-secret", "test")
}

func newLoyaltyTestRouter(loyalty *LoyaltyHandler) *gin.Engine {
	router := gin.New()
	router.POST("/pages/:username/loyalty/request-code", loyalty.RequestVerificationCode)
	router.POST("/pages/:username/loyalty/verify-code", loyalty.VerifyCode)
	router.GET("/pages/:username/loyalty", loyalty.GetMyPoints)
	router.POST("/loyalty/rewards/:id/redeem", loyalty.RedeemReward)
	return router
}

// requestAndVerifyLoyaltyCode -- alur lengkap langkah 1+2 (minta kode lewat
// dev_verification_code, lalu tukar jadi verification_token) dipakai
// berulang oleh test-test di bawah.
func requestAndVerifyLoyaltyCode(t *testing.T, router *gin.Engine, username, email string) string {
	t.Helper()
	reqRec := doJSON(t, router, http.MethodPost, "/pages/"+username+"/loyalty/request-code", map[string]string{"email": email}, nil)
	if reqRec.Code != http.StatusOK {
		t.Fatalf("status request-code = %d, ekspektasi 200, body %s", reqRec.Code, reqRec.Body.String())
	}
	var reqBody struct {
		DevVerificationCode string `json:"dev_verification_code"`
	}
	if err := json.Unmarshal(reqRec.Body.Bytes(), &reqBody); err != nil {
		t.Fatalf("gagal decode response request-code: %v", err)
	}
	if reqBody.DevVerificationCode == "" {
		t.Fatalf("dev_verification_code tidak ada di response (AppEnv seharusnya 'test' != production): %s", reqRec.Body.String())
	}

	verifyRec := doJSON(t, router, http.MethodPost, "/pages/"+username+"/loyalty/verify-code", map[string]string{
		"email": email, "code": reqBody.DevVerificationCode,
	}, nil)
	if verifyRec.Code != http.StatusOK {
		t.Fatalf("status verify-code = %d, ekspektasi 200, body %s", verifyRec.Code, verifyRec.Body.String())
	}
	var verifyBody struct {
		VerificationToken string `json:"verification_token"`
	}
	if err := json.Unmarshal(verifyRec.Body.Bytes(), &verifyBody); err != nil {
		t.Fatalf("gagal decode response verify-code: %v", err)
	}
	if verifyBody.VerificationToken == "" {
		t.Fatalf("verification_token kosong: %s", verifyRec.Body.String())
	}
	return verifyBody.VerificationToken
}

// Audit OWASP A04 (4 September 2026): GetMyPoints TANPA verification_token
// (atau dengan yang salah) harus ditolak -- ini akar perbaikan atas temuan
// "siapa pun yang tahu email pembeli bisa melihat poinnya".
func TestGetMyPoints_RejectsWithoutValidVerificationToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	loyalty, auth := newTestLoyaltyHandler(t)
	creatorID := registerTestUser(t, auth)
	var creatorUsername string
	if err := loyalty.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, creatorID).Scan(&creatorUsername); err != nil {
		t.Fatalf("gagal ambil username kreator: %v", err)
	}

	buyerEmail := "buyer-" + uuid.NewString() + "@example.com"
	if _, err := loyalty.DB.Exec(t.Context(), `
		INSERT INTO loyalty_points_ledger (id, creator_user_id, buyer_email, points, reason)
		VALUES ($1, $2, $3, 100, 'earned')
	`, uuid.NewString(), creatorID, buyerEmail); err != nil {
		t.Fatalf("gagal setup poin test: %v", err)
	}

	router := newLoyaltyTestRouter(loyalty)

	noTokenRec := doJSON(t, router, http.MethodGet, "/pages/"+creatorUsername+"/loyalty?email="+buyerEmail, nil, nil)
	if noTokenRec.Code != http.StatusUnauthorized {
		t.Fatalf("status tanpa token = %d, ekspektasi 401, body %s", noTokenRec.Code, noTokenRec.Body.String())
	}

	wrongTokenRec := doJSON(t, router, http.MethodGet, "/pages/"+creatorUsername+"/loyalty?email="+buyerEmail+"&verification_token=salah-total", nil, nil)
	if wrongTokenRec.Code != http.StatusUnauthorized {
		t.Fatalf("status token salah = %d, ekspektasi 401, body %s", wrongTokenRec.Code, wrongTokenRec.Body.String())
	}
}

// Alur lengkap: minta kode -> verifikasi -> GetMyPoints dengan
// verification_token yang sah harus berhasil menunjukkan poin sungguhan.
func TestGetMyPoints_SucceedsWithValidVerificationToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	loyalty, auth := newTestLoyaltyHandler(t)
	creatorID := registerTestUser(t, auth)
	var creatorUsername string
	if err := loyalty.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, creatorID).Scan(&creatorUsername); err != nil {
		t.Fatalf("gagal ambil username kreator: %v", err)
	}

	buyerEmail := "buyer-" + uuid.NewString() + "@example.com"
	if _, err := loyalty.DB.Exec(t.Context(), `
		INSERT INTO loyalty_points_ledger (id, creator_user_id, buyer_email, points, reason)
		VALUES ($1, $2, $3, 250, 'earned')
	`, uuid.NewString(), creatorID, buyerEmail); err != nil {
		t.Fatalf("gagal setup poin test: %v", err)
	}

	router := newLoyaltyTestRouter(loyalty)
	token := requestAndVerifyLoyaltyCode(t, router, creatorUsername, buyerEmail)

	rec := doJSON(t, router, http.MethodGet, "/pages/"+creatorUsername+"/loyalty?email="+buyerEmail+"&verification_token="+token, nil, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, ekspektasi 200, body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		TotalPoints int `json:"total_points"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("gagal decode response: %v", err)
	}
	if body.TotalPoints != 250 {
		t.Fatalf("total_points = %d, ekspektasi 250", body.TotalPoints)
	}
}

// VerifyCode dengan kode yang salah harus ditolak, tidak pernah
// mengeluarkan verification_token.
func TestVerifyLoyaltyCode_WrongCode_Rejected(t *testing.T) {
	gin.SetMode(gin.TestMode)
	loyalty, auth := newTestLoyaltyHandler(t)
	creatorID := registerTestUser(t, auth)
	var creatorUsername string
	if err := loyalty.DB.QueryRow(t.Context(), `SELECT username FROM users WHERE id = $1`, creatorID).Scan(&creatorUsername); err != nil {
		t.Fatalf("gagal ambil username kreator: %v", err)
	}
	buyerEmail := "buyer-" + uuid.NewString() + "@example.com"

	router := newLoyaltyTestRouter(loyalty)
	reqRec := doJSON(t, router, http.MethodPost, "/pages/"+creatorUsername+"/loyalty/request-code", map[string]string{"email": buyerEmail}, nil)
	if reqRec.Code != http.StatusOK {
		t.Fatalf("status request-code = %d, ekspektasi 200, body %s", reqRec.Code, reqRec.Body.String())
	}

	verifyRec := doJSON(t, router, http.MethodPost, "/pages/"+creatorUsername+"/loyalty/verify-code", map[string]string{
		"email": buyerEmail, "code": "000000",
	}, nil)
	if verifyRec.Code != http.StatusUnauthorized {
		t.Fatalf("status kode salah = %d, ekspektasi 401, body %s", verifyRec.Code, verifyRec.Body.String())
	}
}

// RequestVerificationCode HARUS membalas pesan generik yang sama untuk
// username yang tidak ada sekalipun -- endpoint ini tidak boleh jadi
// oracle "username mana yang benar-benar ada".
func TestRequestLoyaltyCode_UnknownUsername_GenericResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	loyalty, _ := newTestLoyaltyHandler(t)
	router := newLoyaltyTestRouter(loyalty)

	rec := doJSON(t, router, http.MethodPost, "/pages/username-tidak-ada-"+uuid.NewString()+"/loyalty/request-code", map[string]string{
		"email": "siapa@example.com",
	}, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, ekspektasi 200 (pesan generik, bukan 404), body %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("gagal decode response: %v", err)
	}
	if _, hasCode := body["dev_verification_code"]; hasCode {
		t.Fatalf("dev_verification_code seharusnya TIDAK ada untuk username yang tidak ditemukan: %s", rec.Body.String())
	}
}

// Audit OWASP A04: RedeemReward TANPA verification_token yang sah harus
// ditolak SEBELUM menyentuh saldo poin sama sekali.
func TestRedeemReward_RejectsWithoutValidVerificationToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	loyalty, auth := newTestLoyaltyHandler(t)
	creatorID := registerTestUser(t, auth)

	buyerEmail := "buyer-" + uuid.NewString() + "@example.com"
	if _, err := loyalty.DB.Exec(t.Context(), `
		INSERT INTO loyalty_points_ledger (id, creator_user_id, buyer_email, points, reason)
		VALUES ($1, $2, $3, 1000, 'earned')
	`, uuid.NewString(), creatorID, buyerEmail); err != nil {
		t.Fatalf("gagal setup poin test: %v", err)
	}
	rewardID := uuid.NewString()
	if _, err := loyalty.DB.Exec(t.Context(), `
		INSERT INTO loyalty_rewards (id, creator_user_id, name, points_needed, discount_type, discount_value, is_published)
		VALUES ($1, $2, 'Diskon Test', 100, 'nominal', 10000, true)
	`, rewardID, creatorID); err != nil {
		t.Fatalf("gagal setup reward test: %v", err)
	}

	router := newLoyaltyTestRouter(loyalty)
	rec := doJSON(t, router, http.MethodPost, "/loyalty/rewards/"+rewardID+"/redeem", map[string]string{
		"buyer_email": buyerEmail, "verification_token": "salah-total",
	}, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, ekspektasi 401, body %s", rec.Code, rec.Body.String())
	}

	var totalPoints int
	if err := loyalty.DB.QueryRow(t.Context(), `
		SELECT COALESCE(SUM(points), 0) FROM loyalty_points_ledger WHERE creator_user_id = $1 AND buyer_email = $2
	`, creatorID, buyerEmail).Scan(&totalPoints); err != nil {
		t.Fatalf("gagal cek saldo poin: %v", err)
	}
	if totalPoints != 1000 {
		t.Fatalf("saldo poin = %d, ekspektasi TETAP 1000 (redeem gagal seharusnya tidak menyentuh saldo)", totalPoints)
	}
}
