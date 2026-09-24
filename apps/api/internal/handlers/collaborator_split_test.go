package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
	"github.com/jeonme/api/internal/middleware"
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

// Kolaborator TIDAK boleh mengarahkan uang penjualan (audit menyeluruh
// 24 September 2026). SEBELUM perbaikan ini, kolaborator dengan izin
// can_edit_products SAJA (peran "sales_admin") bisa:
//
//	PATCH /dashboard/products/<produk-pemilik>
//	X-Act-As-Owner: <id-pemilik>
//	{"collaborator_splits":[{"user_id":"<id-DIRINYA-SENDIRI>","percent":100}]}
//
// dan dibalas 200. Penjaga anti-self-dealing yang ada membandingkan penerima
// split ke ownerUserID, padahal middleware.ActAsOwner SUDAH menimpa
// "userID" jadi ID PEMILIK sebelum handler jalan -- jadi ID kolaborator
// tidak pernah sama dengan pembanding itu dan selalu lolos. Setiap penjualan
// produk itu lalu meng-kredit ledger si kolaborator (checkout.go), yang bisa
// dia cairkan sebagai DIRINYA SENDIRI lewat rute payout (rute payout memang
// tidak ber-ActAsOwner, jadi tidak terhalang apa pun). Ini menembus kontrak
// yang ditulis CollaboratorHandler: "kolaborator TIDAK PERNAH bisa menyentuh
// saldo/penarikan".
//
// Test ini memakai middleware.ActAsOwner SUNGGUHAN (bukan fakeAuth saja)
// karena bug-nya justru hidup di interaksi middleware <-> handler.
func TestProductUpdate_CollaboratorCannotRouteMoneyToSelf(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	ownerID := registerTestUser(t, auth)
	collaboratorID := registerTestUser(t, auth)

	// Kolaborator aktif dengan izin produk saja -- persis peran sales_admin.
	var collaboratorEmail string
	if err := product.DB.QueryRow(t.Context(), `SELECT email FROM users WHERE id = $1`, collaboratorID).Scan(&collaboratorEmail); err != nil {
		t.Fatalf("gagal ambil email kolaborator: %v", err)
	}
	if _, err := product.DB.Exec(t.Context(), `
		INSERT INTO collaborators (id, owner_user_id, collaborator_email, collaborator_user_id, status, role, can_edit_links, can_edit_products, can_edit_design)
		VALUES (gen_random_uuid(), $1, $2, $3, 'active', 'sales_admin', false, true, false)
	`, ownerID, collaboratorEmail, collaboratorID); err != nil {
		t.Fatalf("gagal membuat kolaborator: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth(), middleware.ActAsOwner(product.DB, "can_edit_products"))
	g.POST("/products", product.Create)
	g.PATCH("/products/:id", product.Update)

	// Pemilik membuat produknya sendiri (tanpa impersonasi).
	createRec := doJSON(t, router, http.MethodPost, "/products", map[string]any{
		"name": "Produk Pemilik", "price_idr": 100000,
	}, map[string]string{"X-Test-UserID": ownerID})
	if createRec.Code != http.StatusCreated {
		t.Fatalf("status create = %d, ekspektasi 201, body %s", createRec.Code, createRec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode created product: %v", err)
	}

	asCollaborator := map[string]string{"X-Test-UserID": collaboratorID, "X-Act-As-Owner": ownerID}

	// INTI TEST: kolaborator mencoba mengalihkan 100% pendapatan ke dirinya.
	hijackRec := doJSON(t, router, http.MethodPatch, "/products/"+created.ID, map[string]any{
		"collaborator_splits": []map[string]any{{"user_id": collaboratorID, "percent": 100}},
	}, asCollaborator)
	if hijackRec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, ekspektasi 403 -- kolaborator TIDAK boleh mengatur bagi hasil, body %s", hijackRec.Code, hijackRec.Body.String())
	}

	// Tidak cukup melihat status code: pastikan benar-benar tidak ada yang
	// tertulis ke DB (kalau penjaganya dipasang setelah penulisan, status
	// 403 pun tidak menyelamatkan apa-apa).
	var splitsJSON string
	if err := product.DB.QueryRow(t.Context(), `SELECT collaborator_splits::text FROM products WHERE id = $1`, created.ID).Scan(&splitsJSON); err != nil {
		t.Fatalf("gagal membaca collaborator_splits: %v", err)
	}
	if splitsJSON != "[]" {
		t.Fatalf("collaborator_splits = %s, ekspektasi tetap [] -- tidak boleh ada yang tersimpan", splitsJSON)
	}

	// Perbaikannya harus BEDAH, bukan palu: kolaborator tetap boleh
	// menyunting produk seperti biasa (itu memang izin yang diberikan
	// pemilik). Kalau assertion ini gagal, perbaikannya kebablasan.
	editRec := doJSON(t, router, http.MethodPatch, "/products/"+created.ID, map[string]any{
		"name": "Nama Diubah Kolaborator",
	}, asCollaborator)
	if editRec.Code != http.StatusOK {
		t.Fatalf("status edit biasa = %d, ekspektasi 200 -- kolaborator harus tetap bisa menyunting produk, body %s", editRec.Code, editRec.Body.String())
	}

	// Pemilik sendiri TETAP boleh mengatur bagi hasil (ke orang lain).
	ownerSplitRec := doJSON(t, router, http.MethodPatch, "/products/"+created.ID, map[string]any{
		"collaborator_splits": []map[string]any{{"user_id": collaboratorID, "percent": 30}},
	}, map[string]string{"X-Test-UserID": ownerID})
	if ownerSplitRec.Code != http.StatusOK {
		t.Fatalf("status pemilik set split = %d, ekspektasi 200, body %s", ownerSplitRec.Code, ownerSplitRec.Body.String())
	}
}

// ListMine afiliasi memuat komisi SEMUA afiliator dalam satu query batch
// (perbaikan N+1, audit backend 24 September 2026). Yang dijaga: komisi
// dikelompokkan ke afiliator yang benar, urut per nama produk, dan
// afiliator tanpa komisi tetap mendapat `[]` -- BUKAN `null`, invarian yang
// diverifikasi audit cross-check tipe (frontend memakai .map tanpa guard).
func TestAffiliateListMine_BatchCommissionsGroupedAndNeverNull(t *testing.T) {
	gin.SetMode(gin.TestMode)
	product, auth := newTestProductHandler(t)
	affiliate, _ := newTestAffiliateHandler(t)
	ownerID := registerTestUser(t, auth)
	affAID := registerTestUser(t, auth)
	affBID := registerTestUser(t, auth)
	emailOf := func(id string) string {
		var e string
		if err := product.DB.QueryRow(t.Context(), `SELECT email FROM users WHERE id = $1`, id).Scan(&e); err != nil {
			t.Fatalf("gagal ambil email: %v", err)
		}
		return e
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/products", product.Create)
	g.POST("/affiliates", affiliate.Upsert)
	g.GET("/affiliates", affiliate.ListMine)
	g.DELETE("/affiliates/:id/products/:productId", affiliate.RemoveCommission)
	h := map[string]string{"X-Test-UserID": ownerID}

	mk := func(name string) string {
		rec := doJSON(t, router, http.MethodPost, "/products", map[string]any{"name": name, "price_idr": 50000}, h)
		if rec.Code != http.StatusCreated {
			t.Fatalf("buat produk %s: %d %s", name, rec.Code, rec.Body.String())
		}
		var p struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &p)
		return p.ID
	}
	// Nama sengaja terbalik dari urutan pembuatan, untuk menguji ORDER BY.
	prodZ := mk("Zeta Produk")
	prodA := mk("Alfa Produk")

	up := func(email, productID string, pct float64) {
		rec := doJSON(t, router, http.MethodPost, "/affiliates", map[string]any{"affiliate_email": email, "product_id": productID, "commission_percent": pct}, h)
		if rec.Code != http.StatusOK {
			t.Fatalf("upsert afiliasi: %d %s", rec.Code, rec.Body.String())
		}
	}
	up(emailOf(affAID), prodZ, 10)
	up(emailOf(affAID), prodA, 20)
	up(emailOf(affBID), prodZ, 15)

	list := func() (map[string]json.RawMessage, map[string][]affiliateProductCommission) {
		rec := doJSON(t, router, http.MethodGet, "/affiliates", nil, h)
		if rec.Code != http.StatusOK {
			t.Fatalf("list: %d %s", rec.Code, rec.Body.String())
		}
		var raw []map[string]json.RawMessage
		if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
			t.Fatalf("decode: %v", err)
		}
		rawByEmail := map[string]json.RawMessage{}
		parsed := map[string][]affiliateProductCommission{}
		for _, r := range raw {
			var email string
			_ = json.Unmarshal(r["affiliate_email"], &email)
			rawByEmail[email] = r["commissions"]
			var cs []affiliateProductCommission
			_ = json.Unmarshal(r["commissions"], &cs)
			parsed[email] = cs
		}
		return rawByEmail, parsed
	}

	_, parsed := list()
	a := parsed[emailOf(affAID)]
	if len(a) != 2 || a[0].ProductName != "Alfa Produk" || a[1].ProductName != "Zeta Produk" {
		t.Fatalf("komisi afiliator A = %+v, ekspektasi 2 entri urut nama (Alfa, Zeta)", a)
	}
	if b := parsed[emailOf(affBID)]; len(b) != 1 || b[0].ProductID != prodZ {
		t.Fatalf("komisi afiliator B = %+v, ekspektasi tepat 1 (produk Zeta)", b)
	}

	// Hapus satu-satunya komisi B -> B tetap terdaftar tapi TANPA komisi.
	var affBRow string
	if err := product.DB.QueryRow(t.Context(), `SELECT id FROM affiliates WHERE creator_user_id = $1 AND affiliate_user_id = $2`, ownerID, affBID).Scan(&affBRow); err != nil {
		t.Fatalf("gagal ambil id afiliasi B: %v", err)
	}
	if rec := doJSON(t, router, http.MethodDelete, "/affiliates/"+affBRow+"/products/"+prodZ, nil, h); rec.Code != http.StatusOK {
		t.Fatalf("hapus komisi B: %d %s", rec.Code, rec.Body.String())
	}
	rawByEmail, _ := list()
	if got := string(rawByEmail[emailOf(affBID)]); got != "[]" {
		t.Fatalf("commissions afiliator tanpa komisi = %s, ekspektasi [] (BUKAN null)", got)
	}
}
