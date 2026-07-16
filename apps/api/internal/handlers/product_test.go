package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

func newTestProductHandler(t *testing.T) (*ProductHandler, *AuthHandler) {
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

	// Storage sengaja nil -- test ini tidak menyentuh upload/download
	// sungguhan, cuma logika ownership & activation-gate di database.
	return NewProductHandler(db, nil, rdb), NewAuthHandler(db, rdb, "test-secret", "test")
}

// Produk BELUM boleh diaktifkan sebelum file diunggah (file_key kosong) --
// mencegah produk kosong "terjual" di halaman publik (REQ-F-303).
func TestProductUpdate_RejectsActivationWithoutFile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.PATCH("/products/:id", product.Update)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Ebook Tanpa File", "price_idr": 50000,
	}, map[string]string{"X-Test-UserID": userID})
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created product: %v", err)
	}

	activateRec := doJSON(t, router, http.MethodPatch, "/products/"+created.ID, map[string]any{
		"is_active": true,
	}, map[string]string{"X-Test-UserID": userID})
	if activateRec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi %d (ditolak karena belum ada file). Body: %s",
			activateRec.Code, http.StatusBadRequest, activateRec.Body.String())
	}
}

// Kepemilikan harus ditegakkan untuk update & delete produk, sama seperti tautan.
func TestProduct_OwnershipEnforced(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userA := registerTestUser(t, auth)
	userB := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.PATCH("/products/:id", product.Update)
	g.DELETE("/products/:id", product.Delete)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Punya A", "price_idr": 20000,
	}, map[string]string{"X-Test-UserID": userA})
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created product: %v", err)
	}

	updateRec := doJSON(t, router, http.MethodPatch, "/products/"+created.ID, map[string]any{
		"name": "Dibajak",
	}, map[string]string{"X-Test-UserID": userB})
	if updateRec.Code != http.StatusNotFound {
		t.Fatalf("update lintas-akun = %d, ekspektasi %d", updateRec.Code, http.StatusNotFound)
	}

	deleteRec := doJSON(t, router, http.MethodDelete, "/products/"+created.ID, nil, map[string]string{"X-Test-UserID": userB})
	if deleteRec.Code != http.StatusNotFound {
		t.Fatalf("delete lintas-akun = %d, ekspektasi %d", deleteRec.Code, http.StatusNotFound)
	}
}
