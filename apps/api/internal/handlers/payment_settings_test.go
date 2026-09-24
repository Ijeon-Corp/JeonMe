package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

func newTestPaymentHandlers(t *testing.T) (*PayoutMethodHandler, *PayoutScheduleHandler, *AuthHandler) {
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

	// rdb diteruskan supaya lockout percobaan OTP (ditambahkan 24 September
	// 2026) ikut teruji jalur normalnya; queue nil -- pengiriman email OTP
	// memang soft-fail & tidak relevan untuk test ini, kode mentahnya
	// diambil lewat dev_otp (AppEnv "test").
	return NewPayoutMethodHandler(db, testEncryptionKey, "test", rdb, nil), NewPayoutScheduleHandler(db), NewAuthHandler(db, rdb, "test-secret", "test")
}

// Acceptance criteria Modul Settings §3: metode baru wajib verifikasi
// sebelum bisa jadi is_primary -- buktikan seluruh alur (create -> tolak
// primary sebelum verify -> minta kode -> tolak kode salah -> verify
// dengan kode benar -> baru boleh jadi primary), dan nomor rekening tidak
// pernah dikembalikan utuh lewat List.
func TestPayoutMethod_MustVerifyBeforePrimary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pm, _, auth := newTestPaymentHandlers(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/payout-methods", pm.List)
	g.POST("/payout-methods", pm.Create)
	g.POST("/payout-methods/:id/request-verification", pm.RequestVerification)
	g.POST("/payout-methods/:id/verify", pm.Verify)
	g.PATCH("/payout-methods/:id/primary", pm.SetPrimary)
	headers := map[string]string{"X-Test-UserID": userID}

	createRec := doJSON(t, router, http.MethodPost, "/payout-methods", map[string]any{
		"type": "bank_transfer", "provider": "BCA", "account_number": "1234567890", "account_name": "Nama Uji",
	}, headers)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create gagal: status %d, body %s", createRec.Code, createRec.Body.String())
	}
	var createResp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &createResp); err != nil {
		t.Fatalf("gagal decode create response: %v", err)
	}

	listRec := doJSON(t, router, http.MethodGet, "/payout-methods", nil, headers)
	var list []payoutMethodItem
	if err := json.Unmarshal(listRec.Body.Bytes(), &list); err != nil {
		t.Fatalf("gagal decode list: %v", err)
	}
	if len(list) != 1 || list[0].Verified || list[0].IsPrimary {
		t.Fatalf("list = %+v, ekspektasi 1 metode belum verified & belum primary", list)
	}
	if list[0].AccountNumberMasked != "••••7890" {
		t.Errorf("AccountNumberMasked = %q, ekspektasi \"••••7890\" (nomor penuh tidak boleh terlihat)", list[0].AccountNumberMasked)
	}

	primaryTooEarlyRec := doJSON(t, router, http.MethodPatch, "/payout-methods/"+createResp.ID+"/primary", nil, headers)
	if primaryTooEarlyRec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi 400 (belum verified), body %s", primaryTooEarlyRec.Code, primaryTooEarlyRec.Body.String())
	}

	reqVerifyRec := doJSON(t, router, http.MethodPost, "/payout-methods/"+createResp.ID+"/request-verification", nil, headers)
	if reqVerifyRec.Code != http.StatusOK {
		t.Fatalf("request-verification gagal: status %d, body %s", reqVerifyRec.Code, reqVerifyRec.Body.String())
	}
	var reqVerifyResp struct {
		DevOTP string `json:"dev_otp"`
	}
	if err := json.Unmarshal(reqVerifyRec.Body.Bytes(), &reqVerifyResp); err != nil {
		t.Fatalf("gagal decode request-verification response: %v", err)
	}
	if reqVerifyResp.DevOTP == "" {
		t.Fatal("dev_otp kosong di response non-production, seharusnya terisi")
	}

	wrongCodeRec := doJSON(t, router, http.MethodPost, "/payout-methods/"+createResp.ID+"/verify", map[string]any{"code": "000000"}, headers)
	if wrongCodeRec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, ekspektasi 401 untuk kode salah, body %s", wrongCodeRec.Code, wrongCodeRec.Body.String())
	}

	verifyRec := doJSON(t, router, http.MethodPost, "/payout-methods/"+createResp.ID+"/verify", map[string]any{"code": reqVerifyResp.DevOTP}, headers)
	if verifyRec.Code != http.StatusOK {
		t.Fatalf("verify gagal: status %d, body %s", verifyRec.Code, verifyRec.Body.String())
	}

	primaryRec := doJSON(t, router, http.MethodPatch, "/payout-methods/"+createResp.ID+"/primary", nil, headers)
	if primaryRec.Code != http.StatusOK {
		t.Fatalf("set primary gagal setelah verified: status %d, body %s", primaryRec.Code, primaryRec.Body.String())
	}
}

// SetPrimary harus melepas is_primary dari metode lama saat metode baru
// dijadikan utama -- tidak boleh ada dua is_primary=true sekaligus.
func TestPayoutMethod_SetPrimary_UnsetsOldPrimary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pm, _, auth := newTestPaymentHandlers(t)
	userID := registerTestUser(t, auth)

	methodA := createVerifiedPayoutMethod(t, pm.DB, userID)
	methodB := createVerifiedPayoutMethod(t, pm.DB, userID)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PATCH("/payout-methods/:id/primary", pm.SetPrimary)
	headers := map[string]string{"X-Test-UserID": userID}

	if rec := doJSON(t, router, http.MethodPatch, "/payout-methods/"+methodA+"/primary", nil, headers); rec.Code != http.StatusOK {
		t.Fatalf("set primary A gagal: status %d, body %s", rec.Code, rec.Body.String())
	}
	if rec := doJSON(t, router, http.MethodPatch, "/payout-methods/"+methodB+"/primary", nil, headers); rec.Code != http.StatusOK {
		t.Fatalf("set primary B gagal: status %d, body %s", rec.Code, rec.Body.String())
	}

	var primaryCount int
	if err := pm.DB.QueryRow(t.Context(), `SELECT COUNT(*) FROM payout_methods WHERE user_id = $1 AND is_primary = true`, userID).Scan(&primaryCount); err != nil {
		t.Fatalf("gagal query payout_methods: %v", err)
	}
	if primaryCount != 1 {
		t.Fatalf("primaryCount = %d, ekspektasi tepat 1", primaryCount)
	}

	var isPrimaryA bool
	if err := pm.DB.QueryRow(t.Context(), `SELECT is_primary FROM payout_methods WHERE id = $1`, methodA).Scan(&isPrimaryA); err != nil {
		t.Fatalf("gagal query methodA: %v", err)
	}
	if isPrimaryA {
		t.Error("methodA masih is_primary=true setelah methodB dijadikan utama")
	}
}

// Acceptance criteria Modul Settings §3: auto-withdraw (weekly/monthly)
// wajib punya metode utama terverifikasi -- manual selalu boleh.
func TestPayoutSchedule_RequiresVerifiedPrimaryForAutoWithdraw(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pm, ps, auth := newTestPaymentHandlers(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.PUT("/payout-schedule", ps.Upsert)
	headers := map[string]string{"X-Test-UserID": userID}

	manualRec := doJSON(t, router, http.MethodPut, "/payout-schedule", map[string]any{
		"frequency": "manual", "min_threshold_idr": 0,
	}, headers)
	if manualRec.Code != http.StatusOK {
		t.Fatalf("manual gagal: status %d, body %s", manualRec.Code, manualRec.Body.String())
	}

	weeklyTooEarlyRec := doJSON(t, router, http.MethodPut, "/payout-schedule", map[string]any{
		"frequency": "weekly", "min_threshold_idr": 100000,
	}, headers)
	if weeklyTooEarlyRec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi 400 (belum ada metode utama terverifikasi), body %s", weeklyTooEarlyRec.Code, weeklyTooEarlyRec.Body.String())
	}

	createVerifiedPayoutMethod(t, pm.DB, userID) // otomatis is_primary=true, verified=true

	weeklyRec := doJSON(t, router, http.MethodPut, "/payout-schedule", map[string]any{
		"frequency": "weekly", "min_threshold_idr": 100000,
	}, headers)
	if weeklyRec.Code != http.StatusOK {
		t.Fatalf("weekly gagal setelah ada metode utama terverifikasi: status %d, body %s", weeklyRec.Code, weeklyRec.Body.String())
	}
}

// Lockout brute-force OTP rekening pencairan (audit menyeluruh 24 September
// 2026). SEBELUM perbaikan: Verify membalas 401 untuk kode salah TANPA
// mencatat apa pun -- tidak ada hitungan percobaan, tidak ada lockout, kode
// tidak diinvalidasi -- jadi ruang tebak 6 digit (1 juta) bisa digempur
// habis, dan rekening yang berhasil diverifikasi langsung bisa dijadikan
// tujuan penarikan SELURUH saldo (SetPrimary -> CreatePayout).
//
// Yang dibuktikan test ini, berurutan:
//  1. percobaan ke-6 dibalas 429, bukan 401 lagi;
//  2. saat terkunci, kode yang BENAR pun ditolak (kalau tidak, lockout-nya
//     tidak menahan apa-apa);
//  3. membuat metode pembayaran BARU tidak mereset penghitung -- ini inti
//     keputusan mengunci per USER, bukan per payout_method.id. Kalau dikunci
//     per metode, penyerang tinggal membuat metode baru tiap 5 tebakan
//     (POST /payout-methods tidak dibatasi jumlah) dan lockout-nya jadi
//     hiasan belaka.
func TestPayoutMethod_VerifyBruteForce_LockedOutPerUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pm, _, auth := newTestPaymentHandlers(t)
	userID := registerTestUser(t, auth)

	// Penghitung lockout hidup di Redis & dikunci per user -- dibersihkan
	// dulu supaya test ini tidak terpengaruh sisa run sebelumnya.
	clearPayoutVerifyFailures(t.Context(), pm.RDB, userID)
	t.Cleanup(func() { clearPayoutVerifyFailures(context.Background(), pm.RDB, userID) })

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/payout-methods", pm.Create)
	g.POST("/payout-methods/:id/request-verification", pm.RequestVerification)
	g.POST("/payout-methods/:id/verify", pm.Verify)
	headers := map[string]string{"X-Test-UserID": userID}

	createMethod := func(accountNumber string) string {
		t.Helper()
		rec := doJSON(t, router, http.MethodPost, "/payout-methods", map[string]any{
			"type": "bank_transfer", "provider": "BCA", "account_number": accountNumber, "account_name": "Nama Uji",
		}, headers)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create gagal: status %d, body %s", rec.Code, rec.Body.String())
		}
		var resp struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("gagal decode create response: %v", err)
		}
		return resp.ID
	}

	requestOTP := func(methodID string) string {
		t.Helper()
		rec := doJSON(t, router, http.MethodPost, "/payout-methods/"+methodID+"/request-verification", nil, headers)
		if rec.Code != http.StatusOK {
			t.Fatalf("request-verification gagal: status %d, body %s", rec.Code, rec.Body.String())
		}
		var resp struct {
			DevOTP string `json:"dev_otp"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("gagal decode request-verification response: %v", err)
		}
		return resp.DevOTP
	}

	methodID := createMethod("1234567890")
	realOTP := requestOTP(methodID)

	// loginFailMaxAttempts kegagalan pertama masih dibalas 401 biasa.
	for i := 0; i < loginFailMaxAttempts; i++ {
		rec := doJSON(t, router, http.MethodPost, "/payout-methods/"+methodID+"/verify", map[string]any{"code": "000000"}, headers)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("percobaan salah ke-%d: status = %d, ekspektasi 401, body %s", i+1, rec.Code, rec.Body.String())
		}
	}

	lockedRec := doJSON(t, router, http.MethodPost, "/payout-methods/"+methodID+"/verify", map[string]any{"code": "000000"}, headers)
	if lockedRec.Code != http.StatusTooManyRequests {
		t.Fatalf("percobaan ke-%d: status = %d, ekspektasi 429 (terkunci), body %s", loginFailMaxAttempts+1, lockedRec.Code, lockedRec.Body.String())
	}

	// (2) Kode BENAR pun harus ditolak selama terkunci.
	correctButLockedRec := doJSON(t, router, http.MethodPost, "/payout-methods/"+methodID+"/verify", map[string]any{"code": realOTP}, headers)
	if correctButLockedRec.Code != http.StatusTooManyRequests {
		t.Fatalf("kode benar saat terkunci: status = %d, ekspektasi 429, body %s", correctButLockedRec.Code, correctButLockedRec.Body.String())
	}

	// (3) Metode BARU tidak boleh memberi penghitung yang segar.
	otherMethodID := createMethod("9876543210")
	freshMethodRec := doJSON(t, router, http.MethodPost, "/payout-methods/"+otherMethodID+"/verify", map[string]any{"code": "000000"}, headers)
	if freshMethodRec.Code != http.StatusTooManyRequests {
		t.Fatalf("metode baru saat user terkunci: status = %d, ekspektasi 429 (lockout per USER, bukan per metode), body %s", freshMethodRec.Code, freshMethodRec.Body.String())
	}
}
