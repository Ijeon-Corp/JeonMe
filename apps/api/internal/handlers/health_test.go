package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/database"
)

// TestMain menghubungkan test ke Postgres/Redis sungguhan lewat DATABASE_URL /
// REDIS_URL (diset oleh service container di ci.yml). Ini sekaligus jadi bukti
// bahwa migrasi sudah diterapkan sebelum test jalan -- lihat temuan kritis C3
// di audit CI/CD: sebelumnya test-backend berjalan melawan skema kosong.
func mustEnv(t *testing.T, key string) string {
	t.Helper()
	v := os.Getenv(key)
	if v == "" {
		t.Skipf("melewati test: %s belum diset (jalankan lewat `go test` di CI atau set manual secara lokal)", key)
	}
	return v
}

func TestHealthCheck_ReportsUpWhenDependenciesReachable(t *testing.T) {
	gin.SetMode(gin.TestMode)

	dbURL := mustEnv(t, "DATABASE_URL")
	redisURL := mustEnv(t, "REDIS_URL")

	db, err := database.NewPostgresPool(dbURL)
	if err != nil {
		t.Fatalf("gagal konek database test: %v", err)
	}
	defer db.Close()

	rdb, err := database.NewRedisClient(redisURL)
	if err != nil {
		t.Fatalf("gagal konek redis test: %v", err)
	}
	defer rdb.Close()

	// Bukti nyata bahwa migrasi 000001_init_schema sudah diterapkan --
	// bukan cuma "koneksi DB hidup". Kalau tabel belum ada, query ini
	// gagal dan test ikut gagal, alih-alih diam-diam lolos.
	assertTableExists(t, db, "users")
	assertTableExists(t, db, "ledger_entries")

	h := NewHealthHandler(db, rdb, "test-version", "secret-token")

	router := gin.New()
	router.GET("/api/health", h.Check)

	// Audit keamanan 15 Agustus 2026: respons PUBLIK tidak boleh mengandung
	// version (git SHA) maupun rincian komponen -- itu membantu fingerprint
	// versi build untuk riset CVE terarah. httptest default ClientIP-nya
	// "192.0.2.1" (bukan loopback), jadi ini mensimulasikan request publik
	// murni tanpa header X-Health-Token.
	pubReq := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	pubRec := httptest.NewRecorder()
	router.ServeHTTP(pubRec, pubReq)
	if pubRec.Code != http.StatusOK {
		t.Fatalf("status publik = %d, ekspektasi %d. Body: %s", pubRec.Code, http.StatusOK, pubRec.Body.String())
	}
	if strings.Contains(pubRec.Body.String(), "test-version") {
		t.Fatalf("respons PUBLIK bocor version ke publik. Body: %s", pubRec.Body.String())
	}
	if strings.Contains(pubRec.Body.String(), "checks") {
		t.Fatalf("respons PUBLIK bocor rincian komponen. Body: %s", pubRec.Body.String())
	}

	// Request INTERNAL dengan X-Health-Token yang cocok -- pipeline deploy
	// (deploy-staging/production.yml) memverifikasi field version cocok
	// commit yang baru di-deploy lewat header ini, supaya bisa mendeteksi
	// container lama yang masih diam-diam berjalan.
	intReq := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	intReq.Header.Set("X-Health-Token", "secret-token")
	intRec := httptest.NewRecorder()
	router.ServeHTTP(intRec, intReq)
	if intRec.Code != http.StatusOK {
		t.Fatalf("status internal = %d, ekspektasi %d. Body: %s", intRec.Code, http.StatusOK, intRec.Body.String())
	}
	if !strings.Contains(intRec.Body.String(), `"version":"test-version"`) {
		t.Fatalf("respons internal tidak menyertakan version yang benar. Body: %s", intRec.Body.String())
	}

	// Request dengan token SALAH tidak boleh dapat version (penyerang tidak
	// bisa menebak token untuk mendapatkan fingerprint versi).
	wrongReq := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	wrongReq.Header.Set("X-Health-Token", "bukan-token-yang-benar")
	wrongRec := httptest.NewRecorder()
	router.ServeHTTP(wrongRec, wrongReq)
	if strings.Contains(wrongRec.Body.String(), "test-version") {
		t.Fatalf("respons dengan token salah bocor version. Body: %s", wrongRec.Body.String())
	}
}

func assertTableExists(t *testing.T, db *pgxpool.Pool, table string) {
	t.Helper()
	ctx := context.Background()

	var exists bool
	err := db.QueryRow(ctx, `SELECT EXISTS (
		SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1
	)`, table).Scan(&exists)
	if err != nil {
		t.Fatalf("gagal cek keberadaan tabel %q: %v", table, err)
	}
	if !exists {
		t.Fatalf("tabel %q tidak ditemukan -- migrasi belum diterapkan ke database test sebelum go test dijalankan", table)
	}
}
