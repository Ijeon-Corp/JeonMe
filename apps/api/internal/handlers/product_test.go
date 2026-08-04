package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

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

// Modul Toko (Fase E4, tab Webhook Events): ListWebhookEvents HANYA
// menampilkan log milik produk kreator yang login, terbaru dulu.
func TestProductListWebhookEvents_ScopedToOwnProducts(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)
	otherUserID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.GET("/webhook-events", product.ListWebhookEvents)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{"name": "Produk Webhook", "price_idr": 25000}, map[string]string{"X-Test-UserID": userID})
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode respons create: %v", err)
	}

	otherRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{"name": "Produk Lain", "price_idr": 25000}, map[string]string{"X-Test-UserID": otherUserID})
	var otherCreated struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(otherRec.Body.Bytes(), &otherCreated); err != nil {
		t.Fatalf("gagal decode respons create kreator lain: %v", err)
	}

	var orderID, otherOrderID string
	if err := product.DB.QueryRow(t.Context(), `
		INSERT INTO orders (product_id, buyer_email, amount_idr, status) VALUES ($1, 'buyer@example.com', 25000, 'paid') RETURNING id
	`, created.ID).Scan(&orderID); err != nil {
		t.Fatalf("gagal setup order: %v", err)
	}
	if err := product.DB.QueryRow(t.Context(), `
		INSERT INTO orders (product_id, buyer_email, amount_idr, status) VALUES ($1, 'buyer2@example.com', 25000, 'paid') RETURNING id
	`, otherCreated.ID).Scan(&otherOrderID); err != nil {
		t.Fatalf("gagal setup order kreator lain: %v", err)
	}

	if _, err := product.DB.Exec(t.Context(), `
		INSERT INTO webhook_deliveries (id, user_id, product_id, order_id, url, status, response_code, error_message)
		VALUES (gen_random_uuid(), $1, $2, $3, 'https://example.com/hook', 'success', 200, '')
	`, userID, created.ID, orderID); err != nil {
		t.Fatalf("gagal setup webhook_deliveries: %v", err)
	}
	if _, err := product.DB.Exec(t.Context(), `
		INSERT INTO webhook_deliveries (id, user_id, product_id, order_id, url, status, response_code, error_message)
		VALUES (gen_random_uuid(), $1, $2, $3, 'https://example.com/other-hook', 'failed', 500, 'server error')
	`, otherUserID, otherCreated.ID, otherOrderID); err != nil {
		t.Fatalf("gagal setup webhook_deliveries kreator lain: %v", err)
	}

	rec := doJSON(t, router, http.MethodGet, "/webhook-events", nil, map[string]string{"X-Test-UserID": userID})
	var items []struct {
		ProductID string `json:"product_id"`
		Status    string `json:"status"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode respons: %v", err)
	}
	if len(items) != 1 || items[0].ProductID != created.ID || items[0].Status != "success" {
		t.Fatalf("items = %+v, ekspektasi hanya 1 log milik kreator ini", items)
	}
}

// Modul Toko (Fase E5, tab Shop Settings): toggle jeda toko tersimpan &
// terbaca kembali, dan shop_paused_at dipertahankan (bukan direset) kalau
// toko dijeda lagi tanpa dilepas dulu.
func TestShopSettings_TogglePausedRoundTrips(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/shop-settings", product.GetShopSettings)
	g.PATCH("/shop-settings", product.UpdateShopSettings)

	getRec := doJSON(t, router, http.MethodGet, "/shop-settings", nil, map[string]string{"X-Test-UserID": userID})
	var initial struct {
		ShopPaused        bool   `json:"shop_paused"`
		ShopPausedMessage string `json:"shop_paused_message"`
	}
	if err := json.Unmarshal(getRec.Body.Bytes(), &initial); err != nil {
		t.Fatalf("gagal decode respons GET awal: %v", err)
	}
	if initial.ShopPaused {
		t.Fatalf("toko baru seharusnya belum dijeda")
	}

	patchRec := doJSON(t, router, http.MethodPatch, "/shop-settings", map[string]any{"shop_paused": true, "shop_paused_message": "Sedang libur, kembali minggu depan"}, map[string]string{"X-Test-UserID": userID})
	if patchRec.Code != http.StatusOK {
		t.Fatalf("PATCH status = %d, body = %s", patchRec.Code, patchRec.Body.String())
	}

	var pausedAt1 *time.Time
	if err := product.DB.QueryRow(t.Context(), `SELECT shop_paused_at FROM users WHERE id = $1`, userID).Scan(&pausedAt1); err != nil {
		t.Fatalf("gagal baca shop_paused_at: %v", err)
	}
	if pausedAt1 == nil {
		t.Fatalf("shop_paused_at seharusnya terisi setelah dijeda")
	}

	// Toggle "dijeda" lagi (tanpa dilepas dulu) -- shop_paused_at TIDAK
	// boleh berubah, supaya durasi jeda tetap tercatat dari awal.
	doJSON(t, router, http.MethodPatch, "/shop-settings", map[string]any{"shop_paused": true, "shop_paused_message": "pesan baru"}, map[string]string{"X-Test-UserID": userID})
	var pausedAt2 *time.Time
	if err := product.DB.QueryRow(t.Context(), `SELECT shop_paused_at FROM users WHERE id = $1`, userID).Scan(&pausedAt2); err != nil {
		t.Fatalf("gagal baca shop_paused_at kedua: %v", err)
	}
	if pausedAt2 == nil || !pausedAt1.Equal(*pausedAt2) {
		t.Fatalf("shop_paused_at berubah saat dijeda ulang: sebelum=%v sesudah=%v", pausedAt1, pausedAt2)
	}

	getRec2 := doJSON(t, router, http.MethodGet, "/shop-settings", nil, map[string]string{"X-Test-UserID": userID})
	var afterPause struct {
		ShopPaused        bool   `json:"shop_paused"`
		ShopPausedMessage string `json:"shop_paused_message"`
	}
	if err := json.Unmarshal(getRec2.Body.Bytes(), &afterPause); err != nil {
		t.Fatalf("gagal decode respons GET kedua: %v", err)
	}
	if !afterPause.ShopPaused || afterPause.ShopPausedMessage != "pesan baru" {
		t.Fatalf("afterPause = %+v", afterPause)
	}

	// Lepas jeda -- shop_paused_at kembali NULL.
	doJSON(t, router, http.MethodPatch, "/shop-settings", map[string]any{"shop_paused": false, "shop_paused_message": ""}, map[string]string{"X-Test-UserID": userID})
	var pausedAt3 *time.Time
	if err := product.DB.QueryRow(t.Context(), `SELECT shop_paused_at FROM users WHERE id = $1`, userID).Scan(&pausedAt3); err != nil {
		t.Fatalf("gagal baca shop_paused_at ketiga: %v", err)
	}
	if pausedAt3 != nil {
		t.Fatalf("shop_paused_at seharusnya NULL setelah dilepas, dapat %v", pausedAt3)
	}
}

// Modul Toko (Fase E3, tab Storage & Files): ListStorage hanya menampilkan
// produk yang PUNYA file, total_bytes menjumlah file_size_bytes yang
// diketahui.
func TestProductListStorage_OnlyProductsWithFilesAndTotalsBytes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.GET("/storage", product.ListStorage)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Tanpa File", "price_idr": 25000,
	}, map[string]string{"X-Test-UserID": userID})
	var noFileProduct struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &noFileProduct); err != nil {
		t.Fatalf("gagal decode respons create: %v", err)
	}

	withFileRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Dengan File", "price_idr": 25000,
	}, map[string]string{"X-Test-UserID": userID})
	var withFileProduct struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(withFileRec.Body.Bytes(), &withFileProduct); err != nil {
		t.Fatalf("gagal decode respons create dengan file: %v", err)
	}
	if _, err := product.DB.Exec(t.Context(), `
		UPDATE products SET file_key = 'products/test/f.pdf', file_size_bytes = 5242880 WHERE id = $1
	`, withFileProduct.ID); err != nil {
		t.Fatalf("gagal setup file test: %v", err)
	}

	rec := doJSON(t, router, http.MethodGet, "/storage", nil, map[string]string{"X-Test-UserID": userID})
	var resp struct {
		Files []struct {
			ProductID string `json:"product_id"`
		} `json:"files"`
		TotalBytes int64 `json:"total_bytes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode respons: %v", err)
	}
	if len(resp.Files) != 1 || resp.Files[0].ProductID != withFileProduct.ID {
		t.Fatalf("Files = %+v, ekspektasi hanya produk yang punya file", resp.Files)
	}
	if resp.TotalBytes != 5242880 {
		t.Errorf("TotalBytes = %d, ekspektasi 5242880", resp.TotalBytes)
	}
}

// Bug ditemukan di staging (5 Agustus 2026): Delete sebelumnya langsung
// DELETE FROM products tanpa mengecek riwayat order -- orders_product_id_fkey
// SENGAJA tidak ON DELETE CASCADE (migrasi 000001, melindungi jejak
// transaksi/ledger/refund), jadi percobaan hapus produk yang sudah pernah
// ada transaksi gagal kena pelanggaran foreign key dan cuma membalas 500
// generik. Sekarang dicek lebih dulu & membalas 409 yang jelas, produk TIDAK
// ikut hilang/berubah.
func TestProductDelete_RejectsWhenOrderHistoryExists(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.DELETE("/products/:id", product.Delete)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{"name": "Produk Sudah Laku", "price_idr": 25000}, map[string]string{"X-Test-UserID": userID})
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode respons create: %v", err)
	}

	if _, err := product.DB.Exec(t.Context(), `
		INSERT INTO orders (product_id, buyer_email, amount_idr, status) VALUES ($1, 'buyer@example.com', 25000, 'pending')
	`, created.ID); err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	rec := doJSON(t, router, http.MethodDelete, "/products/"+created.ID, nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, ekspektasi 409, body %s", rec.Code, rec.Body.String())
	}

	var stillExists bool
	if err := product.DB.QueryRow(t.Context(), `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)`, created.ID).Scan(&stillExists); err != nil {
		t.Fatalf("gagal query produk: %v", err)
	}
	if !stillExists {
		t.Fatal("produk hilang walau seharusnya ditolak sebelum DELETE dijalankan")
	}
}

// Produk yang belum pernah punya order sama sekali tetap bisa dihapus
// permanen seperti biasa -- pengecekan baru di atas tidak boleh menahan
// kasus normal ini.
func TestProductDelete_SucceedsWhenNoOrderHistory(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.DELETE("/products/:id", product.Delete)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{"name": "Produk Belum Laku", "price_idr": 25000}, map[string]string{"X-Test-UserID": userID})
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode respons create: %v", err)
	}

	rec := doJSON(t, router, http.MethodDelete, "/products/"+created.ID, nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, ekspektasi 200, body %s", rec.Code, rec.Body.String())
	}

	var stillExists bool
	if err := product.DB.QueryRow(t.Context(), `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)`, created.ID).Scan(&stillExists); err != nil {
		t.Fatalf("gagal query produk: %v", err)
	}
	if stillExists {
		t.Fatal("produk masih ada walau DELETE seharusnya berhasil")
	}
}

// Modul Toko (Fase E3): DeleteFile menghapus file DAN menonaktifkan produk
// (invarian "tidak aktif tanpa file" yang sama seperti Update), tapi TIDAK
// menghapus baris produknya (beda dari Delete).
func TestProductDeleteFile_ClearsFileAndDeactivates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.DELETE("/products/:id/file", product.DeleteFile)
	g.GET("/products", product.List)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Test", "price_idr": 25000,
	}, map[string]string{"X-Test-UserID": userID})
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode respons create: %v", err)
	}
	if _, err := product.DB.Exec(t.Context(), `
		UPDATE products SET file_key = 'products/test/f.pdf', file_size_bytes = 1000, is_active = true WHERE id = $1
	`, created.ID); err != nil {
		t.Fatalf("gagal setup file test: %v", err)
	}

	rec := doJSON(t, router, http.MethodDelete, "/products/"+created.ID+"/file", nil, map[string]string{"X-Test-UserID": userID})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	listRec := doJSON(t, router, http.MethodGet, "/products", nil, map[string]string{"X-Test-UserID": userID})
	var items []struct {
		HasFile  bool `json:"has_file"`
		IsActive bool `json:"is_active"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode respons list: %v", err)
	}
	if len(items) != 1 || items[0].HasFile || items[0].IsActive {
		t.Fatalf("items = %+v, ekspektasi has_file=false is_active=false", items)
	}
}

// Modul Toko (Fase E2, tab Listing): Reorder mengubah urutan List (featured
// selalu di atas, lalu diurutkan position ASC), dan menolak produk yang
// bukan milik kreator yang login.
func TestProductReorder_UpdatesPositionAndEnforcesOwnership(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)
	otherUserID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.PATCH("/products/:id", product.Update)
	g.PATCH("/products/reorder", product.Reorder)
	g.GET("/products", product.List)

	createOne := func(name string) string {
		rec := doJSON(t, router, http.MethodPost, "/products", map[string]any{"name": name, "price_idr": 25000}, map[string]string{"X-Test-UserID": userID})
		var created struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
			t.Fatalf("gagal decode created product: %v", err)
		}
		return created.ID
	}
	idA := createOne("Produk A")
	idB := createOne("Produk B")
	idC := createOne("Produk C")

	otherProductRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{"name": "Produk Kreator Lain", "price_idr": 25000}, map[string]string{"X-Test-UserID": otherUserID})
	var otherProduct struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(otherProductRec.Body.Bytes(), &otherProduct); err != nil {
		t.Fatalf("gagal decode created product kreator lain: %v", err)
	}

	// B jadi unggulan -- harus tampil PALING ATAS terlepas dari position.
	doJSON(t, router, http.MethodPatch, "/products/"+idB, map[string]any{"is_featured": true}, map[string]string{"X-Test-UserID": userID})

	reorderRec := doJSON(t, router, http.MethodPatch, "/products/reorder", []map[string]any{
		{"id": idC, "position": 0},
		{"id": idA, "position": 1},
		{"id": idB, "position": 2},
	}, map[string]string{"X-Test-UserID": userID})
	if reorderRec.Code != http.StatusOK {
		t.Fatalf("status reorder = %d, body %s", reorderRec.Code, reorderRec.Body.String())
	}

	rec := doJSON(t, router, http.MethodGet, "/products", nil, map[string]string{"X-Test-UserID": userID})
	var items []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode respons list: %v", err)
	}
	if len(items) != 3 || items[0].ID != idB || items[1].ID != idC || items[2].ID != idA {
		t.Fatalf("urutan items = %+v, ekspektasi [B(unggulan), C, A]", items)
	}

	// Mencoba menggeser produk kreator LAIN harus ditolak.
	forbiddenRec := doJSON(t, router, http.MethodPatch, "/products/reorder", []map[string]any{
		{"id": otherProduct.ID, "position": 0},
	}, map[string]string{"X-Test-UserID": userID})
	if forbiddenRec.Code != http.StatusForbidden {
		t.Fatalf("status reorder produk kreator lain = %d, ekspektasi 403", forbiddenRec.Code)
	}
}

// Modul Toko (Fase D): Payment Link langsung AKTIF begitu dibuat (tidak
// perlu unggah file dulu, beda dari produk digital biasa).
func TestProductCreate_PaymentLinkIsActiveImmediately(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.GET("/products", product.List)

	doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Konsultasi 1 Jam", "price_idr": 150000, "product_kind": "payment_link",
		"success_message": "Sampai jumpa di sesi konsultasinya!",
	}, map[string]string{"X-Test-UserID": userID})

	rec := doJSON(t, router, http.MethodGet, "/products", nil, map[string]string{"X-Test-UserID": userID})
	var items []struct {
		IsActive       bool   `json:"is_active"`
		ProductKind    string `json:"product_kind"`
		SuccessMessage string `json:"success_message"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode respons: %v", err)
	}
	if len(items) != 1 || !items[0].IsActive || items[0].ProductKind != "payment_link" {
		t.Fatalf("items = %+v, ekspektasi 1 payment_link yang langsung aktif", items)
	}
	if items[0].SuccessMessage != "Sampai jumpa di sesi konsultasinya!" {
		t.Errorf("success_message = %q, tidak sesuai yang dikirim", items[0].SuccessMessage)
	}
}

// Modul Toko (Fase C3): webhook_secret dibuat SEKALI saat delivery_method
// pertama kali diubah jadi "webhook", dan TIDAK diregenerasi pada update
// berikutnya (mis. saat webhook_url diubah lagi) -- integrasi kreator yang
// sudah pakai secret lama tidak boleh mendadak tidak valid.
func TestProduct_WebhookSecretGeneratedOnceOnFirstWebhookDeliveryMethod(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.PATCH("/products/:id", product.Update)
	g.GET("/products/:id/webhook-secret", product.GetWebhookSecret)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Webhook", "price_idr": 50000,
	}, map[string]string{"X-Test-UserID": userID})
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created product: %v", err)
	}

	doJSON(t, router, http.MethodPatch, "/products/"+created.ID, map[string]any{
		"delivery_method": "webhook", "webhook_url": "https://example.com/hook",
	}, map[string]string{"X-Test-UserID": userID})

	secretRec := doJSON(t, router, http.MethodGet, "/products/"+created.ID+"/webhook-secret", nil, map[string]string{"X-Test-UserID": userID})
	var secretResp struct {
		WebhookSecret string `json:"webhook_secret"`
	}
	if err := json.Unmarshal(secretRec.Body.Bytes(), &secretResp); err != nil {
		t.Fatalf("gagal decode respons secret: %v", err)
	}
	if secretResp.WebhookSecret == "" {
		t.Fatal("webhook_secret kosong, ekspektasi terisi otomatis setelah delivery_method=webhook")
	}
	firstSecret := secretResp.WebhookSecret

	doJSON(t, router, http.MethodPatch, "/products/"+created.ID, map[string]any{
		"webhook_url": "https://example.com/hook-v2",
	}, map[string]string{"X-Test-UserID": userID})

	secretRec2 := doJSON(t, router, http.MethodGet, "/products/"+created.ID+"/webhook-secret", nil, map[string]string{"X-Test-UserID": userID})
	var secretResp2 struct {
		WebhookSecret string `json:"webhook_secret"`
	}
	if err := json.Unmarshal(secretRec2.Body.Bytes(), &secretResp2); err != nil {
		t.Fatalf("gagal decode respons secret kedua: %v", err)
	}
	if secretResp2.WebhookSecret != firstSecret {
		t.Errorf("webhook_secret berubah setelah update lain (%q -> %q), ekspektasi tetap sama", firstSecret, secretResp2.WebhookSecret)
	}
}

// Modul Toko (Fase C2): AddCodes menolak duplikat (ON CONFLICT DO NOTHING)
// dan ListCodes membedakan kode terklaim vs belum.
func TestProduct_AddAndListCodes_DedupesAndTracksClaim(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.POST("/products/:id/codes", product.AddCodes)
	g.GET("/products/:id/codes", product.ListCodes)
	g.DELETE("/products/:id/codes/:codeId", product.DeleteCode)

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Kode", "price_idr": 50000,
	}, map[string]string{"X-Test-UserID": userID})
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created product: %v", err)
	}

	addRec := doJSON(t, router, http.MethodPost, "/products/"+created.ID+"/codes", map[string]any{
		"codes": []string{"A1", "A2", "A1"},
	}, map[string]string{"X-Test-UserID": userID})
	var addResp struct {
		Added int `json:"added"`
	}
	if err := json.Unmarshal(addRec.Body.Bytes(), &addResp); err != nil {
		t.Fatalf("gagal decode respons add: %v", err)
	}
	if addResp.Added != 2 {
		t.Fatalf("added = %d, ekspektasi 2 (A1 duplikat dalam satu batch harus di-dedup)", addResp.Added)
	}

	// Kirim ulang A1 di batch TERPISAH -- juga harus di-dedup (ON CONFLICT).
	doJSON(t, router, http.MethodPost, "/products/"+created.ID+"/codes", map[string]any{
		"codes": []string{"A1", "A3"},
	}, map[string]string{"X-Test-UserID": userID})

	listRec := doJSON(t, router, http.MethodGet, "/products/"+created.ID+"/codes", nil, map[string]string{"X-Test-UserID": userID})
	var items []struct {
		ID   string `json:"id"`
		Code string `json:"code"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode respons list: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("len(items) = %d, ekspektasi 3 (A1, A2, A3 -- semua duplikat A1 di-dedup)", len(items))
	}

	// Hapus satu kode yang belum diklaim harus berhasil.
	delRec := doJSON(t, router, http.MethodDelete, "/products/"+created.ID+"/codes/"+items[0].ID, nil, map[string]string{"X-Test-UserID": userID})
	if delRec.Code != http.StatusOK {
		t.Fatalf("delete kode: status %d, body %s", delRec.Code, delRec.Body.String())
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
