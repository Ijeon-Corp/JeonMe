package handlers

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

// NF-09: hapus akun harus mengANONIMKAN (bukan menghapus baris), dan
// menonaktifkan halaman/produk supaya tidak lagi tampil publik.
func TestDeleteAccount_AnonymizesAndDeactivates(t *testing.T) {
	gin.SetMode(gin.TestMode)
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

	auth := NewAuthHandler(db, rdb, "test-secret", "test")
	account := NewAccountHandler(db)
	userID := registerTestUser(t, auth)

	var originalEmail string
	if err := db.QueryRow(t.Context(), `SELECT email FROM users WHERE id = $1`, userID).Scan(&originalEmail); err != nil {
		t.Fatalf("gagal ambil email asli: %v", err)
	}

	if _, err := db.Exec(t.Context(), `
		UPDATE pages SET is_published = true WHERE user_id = $1
	`, userID); err != nil {
		t.Fatalf("gagal setup halaman: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.DELETE("/account", account.DeleteAccount)

	rec := doJSON(t, router, http.MethodDelete, "/account", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var email string
	var deletedAt *string
	if err := db.QueryRow(t.Context(), `SELECT email, deleted_at::text FROM users WHERE id = $1`, userID).Scan(&email, &deletedAt); err != nil {
		t.Fatalf("gagal query user setelah hapus: %v", err)
	}
	if email == originalEmail {
		t.Errorf("email tidak berubah -- ekspektasi dianonimkan, dapat %q", email)
	}
	if deletedAt == nil {
		t.Error("deleted_at masih NULL, ekspektasi terisi")
	}

	var isPublished bool
	if err := db.QueryRow(t.Context(), `SELECT is_published FROM pages WHERE user_id = $1`, userID).Scan(&isPublished); err != nil {
		t.Fatalf("gagal query pages: %v", err)
	}
	if isPublished {
		t.Error("halaman masih is_published=true, ekspektasi false setelah akun dihapus")
	}
}
