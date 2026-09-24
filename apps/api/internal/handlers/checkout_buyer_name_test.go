package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// TestCheckoutCreate_RequiresBuyerName -- permintaan langsung pengguna, 15
// September 2026 ("di form pembelian tambahkan beberapa field lagi yang
// penting selain 2 field yang sekarang"): buyer_name SEKARANG wajib
// (binding:"required", createCheckoutRequest) -- beda dari buyer_contact/
// buyer_note yang tetap opsional. Endpoint publik ini bisa dicapai lewat
// panggilan API langsung, jadi ditegakkan di backend (bukan cuma frontend
// spt kategori produk).
func TestCheckoutCreate_RequiresBuyerName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkout, auth := newTestCheckoutHandler(t, "the-real-server-key")
	userID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)

	router := gin.New()
	router.POST("/checkout", checkout.Create)

	rec := doJSON(t, router, http.MethodPost, "/checkout", map[string]string{
		"product_id": productID, "buyer_email": "buyer@example.com",
	}, nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status tanpa buyer_name = %d, ekspektasi 400. Body: %s", rec.Code, rec.Body.String())
	}
}

// TestCheckoutCreate_StoresBuyerNameAndNote -- buyer_name & buyer_note yang
// dikirim ke Create WAJIB tersimpan & bisa dibaca kembali lewat
// GetOrderDetail (invoice/riwayat kreator, TransactionPanel.tsx), DAN
// buyer_name ikut cocok di pencarian bebas ListOrders (persis seperti
// buyer_email/nama produk yang sudah ada).
func TestCheckoutCreate_StoresBuyerNameAndNote(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const serverKey = "the-real-server-key"
	checkout, auth := newTestCheckoutHandler(t, serverKey)
	userID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)

	// Mock Midtrans Snap -- CreateTransaction (dipanggil dari dalam
	// checkout.Create) butuh respons sungguhan sebelum order benar-benar
	// tersimpan (order di-commit SEBELUM panggilan Snap, lalu DIHAPUS lagi
	// kalau Snap gagal -- lihat CheckoutHandler.Create). checkout.Midtrans DAN
	// checkout.PaymentGateway (MidtransGateway) membungkus *midtrans.Client
	// yang SAMA (lihat newTestCheckoutHandler), jadi override BaseURL di
	// sini otomatis berlaku ke keduanya.
	snapServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{
			"token":        "mock-token",
			"redirect_url": "https://mock-snap.test/invoice/xyz",
		})
	}))
	defer snapServer.Close()
	checkout.Midtrans.BaseURL = snapServer.URL

	router := gin.New()
	router.POST("/checkout", checkout.Create)
	g := router.Group("/", fakeAuth())
	g.GET("/orders/:id", checkout.GetOrderDetail)
	g.GET("/orders", checkout.ListOrders)

	createRec := doJSON(t, router, http.MethodPost, "/checkout", map[string]string{
		"product_id":  productID,
		"buyer_email": "buyer@example.com",
		"buyer_name":  "Nama Pembeli Uji",
		"buyer_note":  "Tolong kirim versi bahasa Inggris juga.",
	}, nil)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create checkout: status %d, body %s", createRec.Code, createRec.Body.String())
	}
	var created struct {
		OrderID string `json:"order_id"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("gagal decode respons create: %v", err)
	}

	detailRec := doJSON(t, router, http.MethodGet, "/orders/"+created.OrderID, nil, map[string]string{"X-Test-UserID": userID})
	if detailRec.Code != http.StatusOK {
		t.Fatalf("order detail: status %d, body %s", detailRec.Code, detailRec.Body.String())
	}
	var detail orderDetailResponse
	if err := json.Unmarshal(detailRec.Body.Bytes(), &detail); err != nil {
		t.Fatalf("gagal decode respons detail: %v", err)
	}
	if detail.BuyerName != "Nama Pembeli Uji" {
		t.Fatalf("BuyerName = %q, ekspektasi \"Nama Pembeli Uji\"", detail.BuyerName)
	}
	if detail.BuyerNote != "Tolong kirim versi bahasa Inggris juga." {
		t.Fatalf("BuyerNote = %q, ekspektasi teks catatan yang dikirim", detail.BuyerNote)
	}

	listRec := doJSON(t, router, http.MethodGet, "/orders?search=Nama+Pembeli+Uji", nil, map[string]string{"X-Test-UserID": userID})
	if listRec.Code != http.StatusOK {
		t.Fatalf("list orders: status %d, body %s", listRec.Code, listRec.Body.String())
	}
	var listResp struct {
		Orders []orderListItem `json:"orders"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("gagal decode respons list: %v", err)
	}
	found := false
	for _, o := range listResp.Orders {
		if o.OrderID == created.OrderID && o.BuyerName == "Nama Pembeli Uji" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("order %s dgn buyer_name benar tidak ditemukan lewat pencarian nama pembeli: %+v", created.OrderID, listResp.Orders)
	}
}
