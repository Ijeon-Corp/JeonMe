package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/crypto"
	"github.com/jeonme/api/internal/database"
)

// testEncryptionKey -- kunci AES-256 tetap untuk seluruh test package ini
// (bukan config.Load() sungguhan, test tidak butuh .env), 32 byte persis
// sama seperti divalidasi config.go untuk kunci sungguhan.
var testEncryptionKey = []byte("jeonme-dev-encryption-key-32-ok!")

func newTestBalanceHandler(t *testing.T, holdingPeriodDays int) (*BalanceHandler, *AuthHandler) {
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

	return NewBalanceHandler(db, holdingPeriodDays, testEncryptionKey), NewAuthHandler(db, rdb, "test-secret", "test")
}

// createVerifiedPayoutMethod — setup langsung lewat DB (bukan lewat alur
// HTTP PayoutMethodHandler) supaya test saldo/penarikan di file ini fokus
// menguji perilaku BalanceHandler, bukan mengulang alur verifikasi OTP
// yang sudah punya test sendiri di payment_settings_test.go.
func createVerifiedPayoutMethod(t *testing.T, db *pgxpool.Pool, userID string) string {
	t.Helper()
	encrypted, err := crypto.Encrypt(testEncryptionKey, "1234567890")
	if err != nil {
		t.Fatalf("gagal enkripsi nomor rekening test: %v", err)
	}
	id := uuid.NewString()
	if _, err := db.Exec(t.Context(), `
		INSERT INTO payout_methods (id, user_id, type, provider, account_number_encrypted, account_name, is_primary, verified)
		VALUES ($1, $2, 'bank_transfer', 'BCA', $3, 'Nama Uji', true, true)
	`, id, userID, encrypted); err != nil {
		t.Fatalf("gagal setup payout_method: %v", err)
	}
	return id
}

// Kredit yang baru (dalam holding period) harus dihitung "tertahan", kredit
// yang lebih lama dari holding period harus "tersedia" -- REQ-F-502.
func TestBalance_HeldVsAvailable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	balance, auth := newTestBalanceHandler(t, 3)
	userID := registerTestUser(t, auth)

	// Kredit lama (di luar holding period 3 hari) -- harus "tersedia".
	_, err := balance.DB.Exec(t.Context(), `
		INSERT INTO ledger_entries (id, user_id, type, amount_idr, balance_after, created_at)
		VALUES ($1, $2, 'credit', 100000, 100000, now() - interval '10 days')
	`, uuid.NewString(), userID)
	if err != nil {
		t.Fatalf("gagal setup ledger lama: %v", err)
	}

	// Kredit baru (dalam holding period) -- harus "tertahan".
	_, err = balance.DB.Exec(t.Context(), `
		INSERT INTO ledger_entries (id, user_id, type, amount_idr, balance_after, created_at)
		VALUES ($1, $2, 'credit', 50000, 150000, now())
	`, uuid.NewString(), userID)
	if err != nil {
		t.Fatalf("gagal setup ledger baru: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/balance", balance.GetBalance)

	rec := doJSON(t, router, http.MethodGet, "/balance", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var resp balanceResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode response: %v", err)
	}
	if resp.HeldIDR != 50000 {
		t.Errorf("HeldIDR = %d, ekspektasi 50000", resp.HeldIDR)
	}
	if resp.AvailableIDR != 100000 {
		t.Errorf("AvailableIDR = %d, ekspektasi 100000", resp.AvailableIDR)
	}
}

// Pengajuan penarikan melebihi saldo tersedia harus ditolak (REQ-F-503).
func TestCreatePayout_InsufficientBalance_Rejected(t *testing.T) {
	gin.SetMode(gin.TestMode)
	balance, auth := newTestBalanceHandler(t, 3)
	userID := registerTestUser(t, auth)

	methodID := createVerifiedPayoutMethod(t, balance.DB, userID)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/payouts", balance.CreatePayout)

	rec := doJSON(t, router, http.MethodPost, "/payouts", map[string]any{
		"amount_idr":       100000,
		"payout_method_id": methodID,
	}, map[string]string{"X-Test-UserID": userID})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi %d (saldo tidak cukup). Body: %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

// Penarikan yang berhasil diajukan harus mendebit saldo (ledger baru) supaya
// tidak bisa diajukan dua kali untuk saldo yang sama -- REQ-F-503/504.
func TestCreatePayout_Success_DebitsLedger(t *testing.T) {
	gin.SetMode(gin.TestMode)
	balance, auth := newTestBalanceHandler(t, 3)
	userID := registerTestUser(t, auth)

	_, err := balance.DB.Exec(t.Context(), `
		INSERT INTO ledger_entries (id, user_id, type, amount_idr, balance_after, created_at)
		VALUES ($1, $2, 'credit', 200000, 200000, now() - interval '10 days')
	`, uuid.NewString(), userID)
	if err != nil {
		t.Fatalf("gagal setup ledger: %v", err)
	}

	methodID := createVerifiedPayoutMethod(t, balance.DB, userID)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/payouts", balance.CreatePayout)
	g.GET("/balance", balance.GetBalance)

	rec := doJSON(t, router, http.MethodPost, "/payouts", map[string]any{
		"amount_idr":       100000,
		"payout_method_id": methodID,
	}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, ekspektasi %d. Body: %s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	balRec := doJSON(t, router, http.MethodGet, "/balance", nil, map[string]string{"X-Test-UserID": userID})
	var resp balanceResponse
	if err := json.Unmarshal(balRec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode balance: %v", err)
	}
	if resp.AvailableIDR != 100000 {
		t.Fatalf("AvailableIDR setelah payout = %d, ekspektasi 100000 (200000 - 100000)", resp.AvailableIDR)
	}
}

// Keputusan pengguna 2026-07-31 (Modul Settings §3): penarikan WAJIB lewat
// metode TERVERIFIKASI -- metode yang belum verified harus ditolak walau
// saldo cukup.
func TestCreatePayout_UnverifiedMethod_Rejected(t *testing.T) {
	gin.SetMode(gin.TestMode)
	balance, auth := newTestBalanceHandler(t, 3)
	userID := registerTestUser(t, auth)

	_, err := balance.DB.Exec(t.Context(), `
		INSERT INTO ledger_entries (id, user_id, type, amount_idr, balance_after, created_at)
		VALUES ($1, $2, 'credit', 200000, 200000, now() - interval '10 days')
	`, uuid.NewString(), userID)
	if err != nil {
		t.Fatalf("gagal setup ledger: %v", err)
	}

	encrypted, err := crypto.Encrypt(testEncryptionKey, "1234567890")
	if err != nil {
		t.Fatalf("gagal enkripsi nomor rekening test: %v", err)
	}
	unverifiedMethodID := uuid.NewString()
	if _, err := balance.DB.Exec(t.Context(), `
		INSERT INTO payout_methods (id, user_id, type, provider, account_number_encrypted, account_name, is_primary, verified)
		VALUES ($1, $2, 'bank_transfer', 'BCA', $3, 'Nama Uji', false, false)
	`, unverifiedMethodID, userID, encrypted); err != nil {
		t.Fatalf("gagal setup payout_method belum verified: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/payouts", balance.CreatePayout)

	rec := doJSON(t, router, http.MethodPost, "/payouts", map[string]any{
		"amount_idr":       100000,
		"payout_method_id": unverifiedMethodID,
	}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi 400 (metode belum diverifikasi), body %s", rec.Code, rec.Body.String())
	}
}

// Metode pembayaran milik pengguna LAIN tidak boleh dipakai untuk menarik
// dana -- resolusi payout_method_id di CreatePayout ikut memfilter user_id,
// bukan cuma id.
func TestCreatePayout_OtherUsersMethod_Rejected(t *testing.T) {
	gin.SetMode(gin.TestMode)
	balance, auth := newTestBalanceHandler(t, 3)
	userID := registerTestUser(t, auth)
	otherUserID := registerTestUser(t, auth)

	_, err := balance.DB.Exec(t.Context(), `
		INSERT INTO ledger_entries (id, user_id, type, amount_idr, balance_after, created_at)
		VALUES ($1, $2, 'credit', 200000, 200000, now() - interval '10 days')
	`, uuid.NewString(), userID)
	if err != nil {
		t.Fatalf("gagal setup ledger: %v", err)
	}

	otherMethodID := createVerifiedPayoutMethod(t, balance.DB, otherUserID)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/payouts", balance.CreatePayout)

	rec := doJSON(t, router, http.MethodPost, "/payouts", map[string]any{
		"amount_idr":       100000,
		"payout_method_id": otherMethodID,
	}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, ekspektasi 404 (metode milik user lain), body %s", rec.Code, rec.Body.String())
	}
}
