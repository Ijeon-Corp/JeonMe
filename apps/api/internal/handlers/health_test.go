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

	h := NewHealthHandler(db, rdb, "test-version")

	router := gin.New()
	router.GET("/api/health", h.Check)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, ekspektasi %d. Body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	// Pipeline deploy memverifikasi field ini cocok dengan commit yang baru
	// di-deploy -- kalau field ini hilang dari respons, deploy tidak akan
	// pernah bisa mendeteksi container lama yang masih diam-diam berjalan.
	if !strings.Contains(rec.Body.String(), `"version":"test-version"`) {
		t.Fatalf("respons tidak menyertakan version yang benar. Body: %s", rec.Body.String())
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
