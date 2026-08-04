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

// Modul Toko (Fase B1, Manage Items): category disimpan saat pembuatan
// dan bisa diubah lewat Update -- lihat migrasi 000046.
func TestProduct_CategorySetAndUpdated(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.PATCH("/products/:id", product.Update)
	g.GET("/products", product.List)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Ebook Kategori", "price_idr": 50000, "category": "Ebook",
	}, map[string]string{"X-Test-UserID": userID})
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created product: %v", err)
	}

	rec := doJSON(t, router, http.MethodGet, "/products", nil, map[string]string{"X-Test-UserID": userID})
	var items []struct {
		ID       string `json:"id"`
		Category string `json:"category"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode respons: %v", err)
	}
	if len(items) != 1 || items[0].Category != "Ebook" {
		t.Fatalf("items = %+v, ekspektasi 1 produk dengan category=Ebook", items)
	}

	doJSON(t, router, http.MethodPatch, "/products/"+created.ID, map[string]any{
		"category": "Template",
	}, map[string]string{"X-Test-UserID": userID})

	rec2 := doJSON(t, router, http.MethodGet, "/products", nil, map[string]string{"X-Test-UserID": userID})
	var items2 []struct {
		Category string `json:"category"`
	}
	if err := json.Unmarshal(rec2.Body.Bytes(), &items2); err != nil {
		t.Fatalf("gagal decode respons kedua: %v", err)
	}
	if len(items2) != 1 || items2[0].Category != "Template" {
		t.Fatalf("items2 = %+v, ekspektasi category=Template setelah update", items2)
	}
}

// Modul Statistik/Toko (tab "Manage Items"): sold_count di List harus
// menghitung HANYA order berstatus "paid" -- order "pending"/"expired" tidak
// boleh ikut dihitung sebagai "Terjual" (sumber kebenaran sama seperti
// AnalyticsHandler.computeSummary top_products).
func TestProductList_SoldCountOnlyCountsPaidOrders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.GET("/products", product.List)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Ebook Terjual", "price_idr": 50000,
	}, map[string]string{"X-Test-UserID": userID})
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created product: %v", err)
	}

	if _, err := product.DB.Exec(t.Context(), `
		INSERT INTO orders (product_id, buyer_email, amount_idr, status) VALUES
			($1, 'buyer1@example.com', 50000, 'paid'),
			($1, 'buyer2@example.com', 50000, 'paid'),
			($1, 'buyer3@example.com', 50000, 'pending')
	`, created.ID); err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	rec := doJSON(t, router, http.MethodGet, "/products", nil, map[string]string{"X-Test-UserID": userID})
	var items []struct {
		ID        string `json:"id"`
		SoldCount int64  `json:"sold_count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode respons: %v", err)
	}
	if len(items) != 1 || items[0].SoldCount != 2 {
		t.Fatalf("items = %+v, ekspektasi 1 produk dengan sold_count=2 (hanya order paid)", items)
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

// Modul Settings §3: collaborator_splits divalidasi -- tidak boleh split ke
// diri sendiri, tidak boleh ke akun yang tidak ada, dan total tidak boleh
// melebihi 100%. Berhasil kalau valid, dan tersimpan benar.
func TestProduct_CollaboratorSplits_Validation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)
	collaboratorID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	headers := map[string]string{"X-Test-UserID": userID}

	selfSplitRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Split Diri Sendiri", "price_idr": 50000,
		"collaborator_splits": []map[string]any{{"user_id": userID, "percent": 10}},
	}, headers)
	if selfSplitRec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi 400 (split ke diri sendiri), body %s", selfSplitRec.Code, selfSplitRec.Body.String())
	}

	nonexistentRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Split Tidak Ada", "price_idr": 50000,
		"collaborator_splits": []map[string]any{{"user_id": "00000000-0000-0000-0000-000000000000", "percent": 10}},
	}, headers)
	if nonexistentRec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi 400 (user_id tidak ada), body %s", nonexistentRec.Code, nonexistentRec.Body.String())
	}

	validRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Split Valid", "price_idr": 50000,
		"collaborator_splits": []map[string]any{{"user_id": collaboratorID, "percent": 15.5}},
	}, headers)
	if validRec.Code != http.StatusCreated {
		t.Fatalf("status = %d, ekspektasi 201 (split valid), body %s", validRec.Code, validRec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(validRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created product: %v", err)
	}

	var splitsJSON []byte
	if err := product.DB.QueryRow(t.Context(), `SELECT collaborator_splits FROM products WHERE id = $1`, created.ID).Scan(&splitsJSON); err != nil {
		t.Fatalf("gagal query collaborator_splits: %v", err)
	}
	var stored []CollaboratorSplit
	if err := json.Unmarshal(splitsJSON, &stored); err != nil {
		t.Fatalf("gagal decode collaborator_splits tersimpan: %v", err)
	}
	if len(stored) != 1 || stored[0].UserID != collaboratorID || stored[0].Percent != 15.5 {
		t.Fatalf("collaborator_splits tersimpan = %+v, ekspektasi 1 baris (%s, 15.5)", stored, collaboratorID)
	}
}

// Total persen collaborator_splits tidak boleh melebihi 100%.
func TestProduct_CollaboratorSplits_RejectsOver100Percent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)
	collabA := registerTestUser(t, auth)
	collabB := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)

	rec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Split Total Berlebih", "price_idr": 50000,
		"collaborator_splits": []map[string]any{
			{"user_id": collabA, "percent": 60},
			{"user_id": collabB, "percent": 50},
		},
	}, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, ekspektasi 400 (total > 100%%), body %s", rec.Code, rec.Body.String())
	}
}
