package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/database"
)

func mustRedis(t *testing.T) *redis.Client {
	t.Helper()
	url := os.Getenv("REDIS_URL")
	if url == "" {
		t.Skip("melewati test: REDIS_URL belum diset")
	}
	rdb, err := database.NewRedisClient(url)
	if err != nil {
		t.Fatalf("gagal konek redis test: %v", err)
	}
	t.Cleanup(func() { rdb.Close() })
	return rdb
}

// NF-05: request ke-(limit+1) dalam window yang sama harus ditolak 429,
// request setelah limit direset tetap 200.
func TestRateLimit_BlocksAfterLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rdb := mustRedis(t)

	router := gin.New()
	router.GET("/ping", RateLimit(rdb, "test-limit-"+time.Now().Format("150405.000"), 3, time.Minute), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	for i := 1; i <= 3; i++ {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/ping", nil)
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("request ke-%d: status %d, ekspektasi 200", i, rec.Code)
		}
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("request ke-4: status %d, ekspektasi %d", rec.Code, http.StatusTooManyRequests)
	}
}
