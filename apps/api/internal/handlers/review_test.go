package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

func newTestReviewHandler(t *testing.T) (*ReviewHandler, *AuthHandler) {
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

	return NewReviewHandler(db), NewAuthHandler(db, rdb, "test-secret", "test")
}

// Modul Toko (Fase E1): hanya order LUNAS yang boleh diulas, dan hanya
// SEKALI per order.
func TestReviewSubmit_OnlyPaidOrderOnce(t *testing.T) {
	gin.SetMode(gin.TestMode)
	review, auth := newTestReviewHandler(t)
	userID := registerTestUser(t, auth)

	productID := createTestProductForReview(t, review, userID)
	pendingOrderID := createTestOrderForReview(t, review, productID, "pending")
	paidOrderID := createTestOrderForReview(t, review, productID, "paid")

	router := gin.New()
	router.POST("/checkout/:id/review", review.Submit)

	pendingRec := doJSON(t, router, http.MethodPost, "/checkout/"+pendingOrderID+"/review", map[string]any{
		"rating": 5, "comment": "Bagus sekali",
	}, nil)
	if pendingRec.Code != http.StatusForbidden {
		t.Fatalf("status order pending = %d, ekspektasi 403. Body: %s", pendingRec.Code, pendingRec.Body.String())
	}

	firstRec := doJSON(t, router, http.MethodPost, "/checkout/"+paidOrderID+"/review", map[string]any{
		"rating": 4, "comment": "Sesuai deskripsi",
	}, nil)
	if firstRec.Code != http.StatusCreated {
		t.Fatalf("status ulasan pertama = %d, ekspektasi 201. Body: %s", firstRec.Code, firstRec.Body.String())
	}

	secondRec := doJSON(t, router, http.MethodPost, "/checkout/"+paidOrderID+"/review", map[string]any{
		"rating": 1, "comment": "Ulasan kedua",
	}, nil)
	if secondRec.Code != http.StatusConflict {
		t.Fatalf("status ulasan kedua = %d, ekspektasi 409 (order sudah pernah diulas). Body: %s", secondRec.Code, secondRec.Body.String())
	}
}

// Modul Toko (Fase E1): List HANYA menampilkan ulasan milik produk KREATOR
// yang login, SetHidden/Delete ditolak untuk ulasan produk kreator lain.
func TestReviewModeration_ScopedToOwnProducts(t *testing.T) {
	gin.SetMode(gin.TestMode)
	review, auth := newTestReviewHandler(t)
	userID := registerTestUser(t, auth)
	otherUserID := registerTestUser(t, auth)

	productID := createTestProductForReview(t, review, userID)
	orderID := createTestOrderForReview(t, review, productID, "paid")

	router := gin.New()
	submitRouter := gin.New()
	submitRouter.POST("/checkout/:id/review", review.Submit)
	doJSON(t, submitRouter, http.MethodPost, "/checkout/"+orderID+"/review", map[string]any{"rating": 5, "comment": "Mantap"}, nil)

	g := router.Group("/", fakeAuth())
	g.GET("/reviews", review.List)
	g.PATCH("/reviews/:id", review.SetHidden)
	g.DELETE("/reviews/:id", review.Delete)

	listRec := doJSON(t, router, http.MethodGet, "/reviews", nil, map[string]string{"X-Test-UserID": userID})
	var items []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &items); err != nil {
		t.Fatalf("gagal decode respons list: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("len(items) = %d, ekspektasi 1", len(items))
	}
	reviewID := items[0].ID

	otherListRec := doJSON(t, router, http.MethodGet, "/reviews", nil, map[string]string{"X-Test-UserID": otherUserID})
	var otherItems []struct{}
	if err := json.Unmarshal(otherListRec.Body.Bytes(), &otherItems); err != nil {
		t.Fatalf("gagal decode respons list kreator lain: %v", err)
	}
	if len(otherItems) != 0 {
		t.Fatalf("len(otherItems) = %d, ekspektasi 0 (bukan produk kreator ini)", len(otherItems))
	}

	forbiddenHideRec := doJSON(t, router, http.MethodPatch, "/reviews/"+reviewID, map[string]any{"is_hidden": true}, map[string]string{"X-Test-UserID": otherUserID})
	if forbiddenHideRec.Code != http.StatusNotFound {
		t.Fatalf("status sembunyikan oleh kreator lain = %d, ekspektasi 404", forbiddenHideRec.Code)
	}

	hideRec := doJSON(t, router, http.MethodPatch, "/reviews/"+reviewID, map[string]any{"is_hidden": true}, map[string]string{"X-Test-UserID": userID})
	if hideRec.Code != http.StatusOK {
		t.Fatalf("status sembunyikan = %d, ekspektasi 200. Body: %s", hideRec.Code, hideRec.Body.String())
	}
}

func createTestProductForReview(t *testing.T, review *ReviewHandler, userID string) string {
	t.Helper()
	var productID string
	if err := review.DB.QueryRow(t.Context(), `
		INSERT INTO products (user_id, name, price_idr, file_key, is_active)
		VALUES ($1, 'Produk Ulasan', 25000, 'products/test/file.pdf', true) RETURNING id
	`, userID).Scan(&productID); err != nil {
		t.Fatalf("gagal setup produk test: %v", err)
	}
	return productID
}

func createTestOrderForReview(t *testing.T, review *ReviewHandler, productID, status string) string {
	t.Helper()
	var orderID string
	if err := review.DB.QueryRow(t.Context(), `
		INSERT INTO orders (product_id, buyer_email, amount_idr, status) VALUES ($1, 'buyer@example.com', 25000, $2) RETURNING id
	`, productID, status).Scan(&orderID); err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}
	return orderID
}
