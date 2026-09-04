package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

func newTestAffiliateHandler(t *testing.T) (*AffiliateHandler, *AuthHandler) {
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

	// platformFeePercent = 0 -- pola sama dengan newTestProductHandler,
	// fokus test ini ke interaksi split kolaborator <-> komisi afiliasi,
	// bukan biaya platform.
	return NewAffiliateHandler(db, "https://jeon.id", 0), NewAuthHandler(db, rdb, "test-secret", "test")
}

// Audit 4 September 2026: sebelum perbaikan ini, validasi split kolaborator
// dan komisi afiliasi berjalan SEPENUHNYA independen -- masing-masing cuma
// mengecek dirinya sendiri <= 100%, padahal checkout.go memotong KEDUANYA
// dari amount yang sama (netAmount := amountIDR - platformFeeIDR -
// affiliateCommissionIDR - totalCollaboratorSplitIDR). Kombinasi split 60%
// + komisi afiliasi 50% pada produk yang sama lolos validasi lama, tapi
// bikin netAmount kreator NEGATIF saat produk itu terjual lewat tautan
// afiliasi -- ledger_entries tidak punya CHECK constraint yang mencegah
// 'credit' negatif, jadi saldo kreator diam-diam berkurang oleh penjualan
// yang seharusnya menambah saldo.
func TestCollaboratorSplits_RejectedWhenCombinedWithExistingAffiliateCommissionExceeds100Percent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	affiliate, _ := newTestAffiliateHandler(t)
	ownerID := registerTestUser(t, auth)
	collaboratorID := registerTestUser(t, auth)
	affiliateUserID := registerTestUser(t, auth)
	var affiliateEmail string
	if err := product.DB.QueryRow(t.Context(), `SELECT email FROM users WHERE id = $1`, affiliateUserID).Scan(&affiliateEmail); err != nil {
		t.Fatalf("gagal ambil email afiliator: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.PATCH("/products/:id", product.Update)
	g.POST("/affiliates", affiliate.Upsert)
	headers := map[string]string{"X-Test-UserID": ownerID}

	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Kombinasi Split+Afiliasi", "price_idr": 100000,
	}, headers)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("status create = %d, ekspektasi 201, body %s", createRec.Code, createRec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created product: %v", err)
	}

	// Komisi afiliasi 50% dipasang LEBIH DULU pada produk ini.
	affiliateRec := doJSON(t, router, http.MethodPost, "/affiliates", map[string]any{
		"affiliate_email": affiliateEmail, "product_id": created.ID, "commission_percent": 50,
	}, headers)
	if affiliateRec.Code != http.StatusOK {
		t.Fatalf("status upsert afiliasi = %d, ekspektasi 200, body %s", affiliateRec.Code, affiliateRec.Body.String())
	}

	// 50% (afiliasi, sudah aktif) + 60% (split baru) = 110% -- harus ditolak.
	updateRec := doJSON(t, router, http.MethodPatch, "/products/"+created.ID, map[string]any{
		"collaborator_splits": []map[string]any{{"user_id": collaboratorID, "percent": 60}},
	}, headers)
	if updateRec.Code != http.StatusBadRequest {
		t.Fatalf("status update split = %d, ekspektasi 400 (bentrok dengan komisi afiliasi 50%% yang sudah aktif), body %s", updateRec.Code, updateRec.Body.String())
	}

	// 50% (afiliasi) + 40% (split baru) = 90% -- harus diterima.
	okRec := doJSON(t, router, http.MethodPatch, "/products/"+created.ID, map[string]any{
		"collaborator_splits": []map[string]any{{"user_id": collaboratorID, "percent": 40}},
	}, headers)
	if okRec.Code != http.StatusOK {
		t.Fatalf("status update split (90%% total) = %d, ekspektasi 200, body %s", okRec.Code, okRec.Body.String())
	}
}

// Arah sebaliknya dari test di atas: split kolaborator dipasang LEBIH DULU,
// lalu komisi afiliasi baru (lewat undangan privat) yang seharusnya ditolak
// kalau totalnya lebih dari 100%.
func TestAffiliateUpsert_RejectedWhenCombinedWithExistingCollaboratorSplitsExceeds100Percent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	affiliate, _ := newTestAffiliateHandler(t)
	ownerID := registerTestUser(t, auth)
	collaboratorID := registerTestUser(t, auth)
	affiliateUserID := registerTestUser(t, auth)
	var affiliateEmail string
	if err := product.DB.QueryRow(t.Context(), `SELECT email FROM users WHERE id = $1`, affiliateUserID).Scan(&affiliateEmail); err != nil {
		t.Fatalf("gagal ambil email afiliator: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.POST("/affiliates", affiliate.Upsert)
	headers := map[string]string{"X-Test-UserID": ownerID}

	// Split kolaborator 70% dipasang SEJAK create.
	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Split Duluan", "price_idr": 100000,
		"collaborator_splits": []map[string]any{{"user_id": collaboratorID, "percent": 70}},
	}, headers)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("status create = %d, ekspektasi 201, body %s", createRec.Code, createRec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created product: %v", err)
	}

	// 70% (split, sudah aktif) + 40% (komisi afiliasi baru) = 110% -- ditolak.
	rec := doJSON(t, router, http.MethodPost, "/affiliates", map[string]any{
		"affiliate_email": affiliateEmail, "product_id": created.ID, "commission_percent": 40,
	}, headers)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status upsert afiliasi = %d, ekspektasi 400 (bentrok dengan split kolaborator 70%% yang sudah aktif), body %s", rec.Code, rec.Body.String())
	}
}
