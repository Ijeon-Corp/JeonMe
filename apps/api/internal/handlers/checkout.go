package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/audit"
	"github.com/jeonme/api/internal/midtrans"
	"github.com/jeonme/api/internal/queue"
	"github.com/jeonme/api/internal/storage"
)

// CheckoutHandler mengimplementasikan REQ-F-401 (checkout tanpa akun),
// REQ-F-402 (integrasi Midtrans), REQ-F-403/404 (webhook + idempotensi).
//
// Queue boleh nil (mis. kalau REDIS_URL tidak valid saat startup) --
// notifikasi order.paid (REQ-F-405) akan dilewati dengan log peringatan,
// BUKAN membuat webhook PSP gagal, sama seperti pola soft-fail Storage.
type CheckoutHandler struct {
	DB                 *pgxpool.Pool
	Midtrans           *midtrans.Client
	MidtransServerKey  string
	PublicWebURL       string
	PlatformFeePercent float64
	Storage            *storage.Client
	Queue              *asynq.Client
}

func NewCheckoutHandler(db *pgxpool.Pool, midtransClient *midtrans.Client, midtransServerKey, publicWebURL string, platformFeePercent float64, s3 *storage.Client, queueClient *asynq.Client) *CheckoutHandler {
	return &CheckoutHandler{
		DB: db, Midtrans: midtransClient, MidtransServerKey: midtransServerKey,
		PublicWebURL: publicWebURL, PlatformFeePercent: platformFeePercent,
		Storage: s3, Queue: queueClient,
	}
}

type createCheckoutRequest struct {
	ProductID      string `json:"product_id" binding:"required"`
	BuyerEmail     string `json:"buyer_email" binding:"required,email"`
	BuyerContact   string `json:"buyer_contact"`
	VoucherCode    string `json:"voucher_code"`
	BuyerAmountIDR *int64 `json:"buyer_amount_idr"`
	ReferralCode   string `json:"referral_code"`
	// SlotID -- No.92 (Sprint 11): wajib diisi kalau produknya booking
	// konsultasi (is_booking=true), menunjuk slot waktu yang dipilih
	// pembeli. Diklaim ATOMIK di dalam transaksi yang sama seperti
	// pembuatan order (lihat di bawah) supaya dua pembeli tidak bisa
	// merebut slot yang sama.
	SlotID string `json:"slot_id"`
	// WishlistItemID -- Gap #4 benchmark kompetitif (9 Agustus 2026):
	// opsional, cuma relevan kalau ProductID adalah blok Donasi (is_donation
	// =true) -- pendonor MEMILIH mewujudkan satu item wishlist tertentu,
	// bukan donasi umum. Divalidasi milik kreator yang sama dengan produk
	// (lihat di bawah) supaya tidak bisa dipakai menaikkan raised_idr
	// wishlist kreator LAIN lewat donasi ke kreator ini.
	WishlistItemID string `json:"wishlist_item_id"`
}

// Create — REQ-F-401: checkout cukup email/WhatsApp, TANPA perlu bikin akun.
// Produk harus is_active=true (sudah lolos gate upload file, lihat Sprint 2).
func (h *CheckoutHandler) Create(c *gin.Context) {
	var req createCheckoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var productName string
	var productUserID string
	var priceIDR int64
	var flashSaleActive bool
	var pwywEnabled bool
	var pwywMinPriceIDR *int64
	var isEvent bool
	var eventEndsAt *time.Time
	var eventCapacity *int
	var isBooking bool
	var collaboratorSplitsRaw []byte
	var productKind string
	var paymentLimitCount *int
	var linkExpiresAt *time.Time
	var shopPausedAt *time.Time
	// No.68: priceIDR di sini SUDAH harga efektif (harga flash sale kalau
	// sedang aktif) -- voucher (No.67) di bawah menumpuk di atas harga ini,
	// bukan di atas harga asli.
	err := h.DB.QueryRow(ctx, `
		SELECT p.user_id, name, `+effectivePriceExpr+`, pwyw_enabled, pwyw_min_price_idr, is_event, event_ends_at, event_capacity, is_booking, collaborator_splits,
			product_kind, payment_limit_count, link_expires_at, u.shop_paused_at
		FROM products p
		JOIN users u ON u.id = p.user_id
		WHERE p.id = $1 AND p.is_active = true
	`, req.ProductID).Scan(&productUserID, &productName, &priceIDR, &flashSaleActive, &pwywEnabled, &pwywMinPriceIDR, &isEvent, &eventEndsAt, &eventCapacity, &isBooking, &collaboratorSplitsRaw,
		&productKind, &paymentLimitCount, &linkExpiresAt, &shopPausedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan atau belum aktif"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}

	// Gap #4 benchmark kompetitif: WishlistItemID (kalau diisi) HARUS milik
	// kreator yang SAMA dengan produk donasi ini -- tanpa ini, pendonor ke
	// kreator A bisa memalsukan wishlist_item_id milik kreator B untuk
	// menaikkan raised_idr wishlist orang lain pakai uang yang sebenarnya
	// masuk ke kreator A.
	var wishlistItemID *string
	if req.WishlistItemID != "" {
		var wishlistOwnerID string
		if err := h.DB.QueryRow(ctx, `SELECT user_id FROM donation_wishlist_items WHERE id = $1`, req.WishlistItemID).Scan(&wishlistOwnerID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "item wishlist tidak ditemukan"})
			return
		}
		if wishlistOwnerID != productUserID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "item wishlist tidak cocok dengan halaman ini"})
			return
		}
		wishlistItemID = &req.WishlistItemID
	}

	// Modul Toko (Fase E5): Toko Dijeda -- kreator bisa menjeda seluruh
	// toko tanpa menonaktifkan tiap produk satu per satu. Ditegakkan DI
	// SINI (bukan cuma disembunyikan di frontend) supaya tidak bisa
	// dilewati lewat panggilan API langsung.
	if shopPausedAt != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "toko sedang dijeda oleh pemiliknya, coba lagi nanti"})
		return
	}

	// Modul Toko (Fase D): Payment Link -- tolak checkout kalau link sudah
	// kedaluwarsa atau batas jumlah pembayaran sudah tercapai. Dicek di
	// SINI (sebelum order dibuat) supaya pembeli dapat pesan jelas, bukan
	// baru gagal setelah bayar.
	if productKind == "payment_link" {
		if linkExpiresAt != nil && time.Now().After(*linkExpiresAt) {
			c.JSON(http.StatusGone, gin.H{"error": "payment link ini sudah kedaluwarsa"})
			return
		}
		if paymentLimitCount != nil {
			var paidCount int
			if err := h.DB.QueryRow(ctx, `
				SELECT COUNT(*) FROM orders WHERE product_id = $1 AND status = 'paid'
			`, req.ProductID).Scan(&paidCount); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa batas pembayaran"})
				return
			}
			if paidCount >= *paymentLimitCount {
				c.JSON(http.StatusGone, gin.H{"error": "payment link ini sudah mencapai batas jumlah pembayaran"})
				return
			}
		}
	}

	// No.92: booking wajib menyertakan slot_id -- validasi keberadaan &
	// ketersediaannya di sini (SEBELUM transaksi dibuka) supaya pesan error
	// jelas; klaim ATOMIK sungguhan terjadi di dalam transaksi di bawah
	// (mencegah race condition dua pembeli merebut slot yang sama).
	if isBooking {
		if req.SlotID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "pilih slot waktu terlebih dahulu"})
			return
		}
		var slotTaken bool
		if err := h.DB.QueryRow(ctx, `
			SELECT order_id IS NOT NULL FROM booking_slots WHERE id = $1 AND booking_product_id = $2
		`, req.SlotID, req.ProductID).Scan(&slotTaken); err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "slot tidak ditemukan"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa slot"})
			return
		}
		if slotTaken {
			c.JSON(http.StatusConflict, gin.H{"error": "slot ini sudah dipesan orang lain, pilih slot lain"})
			return
		}
	}

	// No.90 (Sprint 11): event tidak bisa dibeli lagi setelah lewat, dan
	// dibatasi kuota kalau creator mengisinya. Jumlah "terpakai" dihitung
	// dari SELURUH order (lihat komentar EventHandler.List) -- konsisten
	// dengan cara used_count voucher bekerja.
	if isEvent {
		if eventEndsAt != nil && eventEndsAt.Before(time.Now()) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "event ini sudah berakhir"})
			return
		}
		if eventCapacity != nil {
			var attendeeCount int
			if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM orders WHERE product_id = $1`, req.ProductID).Scan(&attendeeCount); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa kuota event"})
				return
			}
			if attendeeCount >= *eventCapacity {
				c.JSON(http.StatusBadRequest, gin.H{"error": "kuota event ini sudah penuh"})
				return
			}
		}
	}

	// No.69: kalau bayar-seikhlasnya aktif, harga yang pembeli tentukan
	// sendiri MENGGANTIKAN (bukan menumpuk di atas) harga efektif produk --
	// lihat catatan interaksi dengan flash sale di ProductHandler.Update.
	if pwywEnabled {
		minPrice := int64(1000)
		if pwywMinPriceIDR != nil {
			minPrice = *pwywMinPriceIDR
		}
		if req.BuyerAmountIDR == nil || *req.BuyerAmountIDR < minPrice {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("jumlah pembayaran minimal Rp%d", minPrice)})
			return
		}
		priceIDR = *req.BuyerAmountIDR
	}

	// No.67 (Sprint 7): terapkan voucher SEBELUM platform_fee dihitung --
	// fee dipotong dari uang yang benar-benar berpindah (harga terdiskon),
	// bukan harga asli sebelum diskon.
	var voucherID *string
	var discountIDR int64
	if req.VoucherCode != "" {
		pricing, reason, err := resolveVoucher(ctx, h.DB, req.VoucherCode, req.ProductID, priceIDR)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memvalidasi voucher"})
			return
		}
		if pricing == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": reason})
			return
		}
		voucherID = &pricing.VoucherID
		discountIDR = pricing.DiscountIDR
	}
	finalAmountIDR := priceIDR - discountIDR

	// Modul Settings §3 (diferensiasi dari Lynk.id): resolusi persen ->
	// rupiah absolut PADA SAAT checkout (pola sama persis dengan
	// affiliateCommissionIDR di bawah) -- disimpan sebagai snapshot supaya
	// perubahan collaborator_splits di produk SESUDAHNYA tidak pernah
	// mempengaruhi order yang sudah terlanjur dibuat.
	var collaboratorSplits []CollaboratorSplit
	if len(collaboratorSplitsRaw) > 0 {
		_ = json.Unmarshal(collaboratorSplitsRaw, &collaboratorSplits)
	}
	var collaboratorSplitSnapshots []CollaboratorSplitSnapshot
	var totalCollaboratorSplitIDR int64
	for _, s := range collaboratorSplits {
		amount := int64(float64(finalAmountIDR) * s.Percent / 100)
		collaboratorSplitSnapshots = append(collaboratorSplitSnapshots, CollaboratorSplitSnapshot{UserID: s.UserID, AmountIDR: amount})
		totalCollaboratorSplitIDR += amount
	}
	collaboratorSplitsSnapshotJSON := []byte("[]")
	if len(collaboratorSplitSnapshots) > 0 {
		collaboratorSplitsSnapshotJSON, _ = json.Marshal(collaboratorSplitSnapshots)
	}

	// No.72 (Sprint 7): komisi afiliasi dihitung dari harga yang BENAR-BENAR
	// dibayar (setelah voucher), sama seperti platform_fee -- kode referral
	// yang tidak cocok dengan produk ini (bukan bagian program afiliasi
	// produk ini) diabaikan diam-diam, checkout tetap lanjut tanpa komisi.
	var affiliateID *string
	var affiliateCommissionIDR int64
	if id, _, commissionPercent, ok := resolveAffiliate(ctx, h.DB, req.ReferralCode, req.ProductID); ok {
		affiliateID = &id
		affiliateCommissionIDR = int64(float64(finalAmountIDR) * commissionPercent / 100)
	}

	orderID := uuid.NewString()
	externalID := "jeonme-order-" + orderID
	platformFeeIDR := int64(float64(finalAmountIDR) * h.PlatformFeePercent / 100)

	// Order disimpan dalam transaksi yang BELUM di-commit sampai Midtrans
	// benar-benar berhasil membuat transaksi Snap -- kalau panggilan Midtrans
	// gagal, transaksi di-rollback supaya tidak ada order "pending" yatim
	// yang tidak pernah bisa dibayar sama sekali.
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx, `
		INSERT INTO orders (id, product_id, buyer_email, buyer_contact, amount_idr, platform_fee_idr, status, psp_reference, voucher_id, discount_idr, affiliate_id, affiliate_commission_idr, collaborator_splits_snapshot, donation_wishlist_item_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, $12, $13, now())
	`, orderID, req.ProductID, req.BuyerEmail, req.BuyerContact, finalAmountIDR, platformFeeIDR, externalID, voucherID, discountIDR, affiliateID, affiliateCommissionIDR, collaboratorSplitsSnapshotJSON, wishlistItemID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat order"})
		return
	}

	if voucherID != nil {
		if _, err := tx.Exec(ctx, `UPDATE vouchers SET used_count = used_count + 1 WHERE id = $1`, *voucherID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat pemakaian voucher"})
			return
		}
	}

	// No.92: klaim slot ATOMIK -- UPDATE ... WHERE order_id IS NULL hanya
	// berhasil mengubah SATU baris kalau slot memang masih kosong; kalau
	// RowsAffected()==0 berarti ada pembeli lain yang berhasil merebutnya
	// lebih dulu tepat di antara pengecekan di atas dan titik ini (race
	// condition asli, bukan hipotetis -- makanya pengecekan awal TIDAK
	// cukup sendirian, klaim di sini yang jadi sumber kebenaran akhir).
	if isBooking {
		tag, err := tx.Exec(ctx, `
			UPDATE booking_slots SET order_id = $1 WHERE id = $2 AND booking_product_id = $3 AND order_id IS NULL
		`, orderID, req.SlotID, req.ProductID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengklaim slot"})
			return
		}
		if tag.RowsAffected() == 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "slot ini sudah dipesan orang lain, pilih slot lain"})
			return
		}
	}

	txn, err := h.Midtrans.CreateTransaction(ctx, midtrans.CreateTransactionRequest{
		OrderID:           externalID,
		GrossAmountIDR:    finalAmountIDR,
		ItemName:          fmt.Sprintf("Jeonme: %s", productName),
		CustomerEmail:     req.BuyerEmail,
		FinishRedirectURL: h.PublicWebURL + "/checkout/" + orderID,
	})
	if err != nil {
		if err == midtrans.ErrNotConfigured {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "pembayaran belum dikonfigurasi, hubungi admin"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "gagal menghubungi penyedia pembayaran, coba lagi"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan order"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"order_id":    orderID,
		"invoice_url": txn.RedirectURL,
	})
}

type validateVoucherRequest struct {
	Code           string `json:"code" binding:"required"`
	ProductID      string `json:"product_id" binding:"required"`
	BuyerAmountIDR *int64 `json:"buyer_amount_idr"`
}

// ValidateVoucher — endpoint publik untuk pratinjau real-time diskon di
// halaman produk SEBELUM pembeli benar-benar submit checkout (No.67).
// Tidak mencatat pemakaian (used_count) -- itu baru terjadi di Create.
func (h *CheckoutHandler) ValidateVoucher(c *gin.Context) {
	var req validateVoucherRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var priceIDR int64
	var flashSaleActive bool
	var pwywEnabled bool
	var pwywMinPriceIDR *int64
	// No.68: pratinjau juga pakai harga efektif supaya konsisten dengan
	// yang benar-benar dikenakan saat checkout sungguhan.
	if err := h.DB.QueryRow(ctx, `
		SELECT `+effectivePriceExpr+`, pwyw_enabled, pwyw_min_price_idr
		FROM products WHERE id = $1 AND is_active = true
	`, req.ProductID).Scan(&priceIDR, &flashSaleActive, &pwywEnabled, &pwywMinPriceIDR); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan atau belum aktif"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}

	// No.69: kalau pwyw aktif, basis harga pratinjau adalah jumlah yang
	// pembeli sudah masukkan (kalau ada) -- tanpa ini, harga dasar tidak
	// diketahui sampai pembeli benar-benar menentukan jumlahnya.
	if pwywEnabled && req.BuyerAmountIDR != nil {
		priceIDR = *req.BuyerAmountIDR
	}

	pricing, reason, err := resolveVoucher(ctx, h.DB, req.Code, req.ProductID, priceIDR)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memvalidasi voucher"})
		return
	}
	if pricing == nil {
		c.JSON(http.StatusOK, gin.H{"valid": false, "message": reason})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":            true,
		"discount_idr":     pricing.DiscountIDR,
		"final_amount_idr": priceIDR - pricing.DiscountIDR,
	})
}

type checkoutStatusResponse struct {
	OrderID      string               `json:"order_id"`
	Status       string               `json:"status"`
	Product      string               `json:"product_name"`
	IsBundle     bool                 `json:"is_bundle"`
	IsDonation   bool                 `json:"is_donation"`
	IsCourse     bool                 `json:"is_course"`
	IsBooking    bool                 `json:"is_booking"`
	BookedSlotAt *time.Time           `json:"booked_slot_at,omitempty"`
	SocialProof  *checkoutSocialProof `json:"social_proof"`

	// DeliveryMethod/FulfilledAt/ClaimedCode -- Modul Toko (Fase C): status
	// penyerahan produk digital biasa (download_link/manual/random_code/
	// webhook) -- dikosongkan untuk bundel/donasi/kursus/booking (masing-
	// masing sudah punya jalur tampilan sendiri di frontend).
	DeliveryMethod string     `json:"delivery_method,omitempty"`
	FulfilledAt    *time.Time `json:"fulfilled_at,omitempty"`
	ClaimedCode    string     `json:"claimed_code,omitempty"`

	// IsPaymentLink/SuccessMessage -- Modul Toko (Fase D): pesan sukses
	// KUSTOM kreator, ditampilkan menggantikan pesan generik "pesanan
	// dikonfirmasi" (lihat migrasi 000048).
	IsPaymentLink  bool   `json:"is_payment_link"`
	SuccessMessage string `json:"success_message,omitempty"`
}

// checkoutSocialProof -- No.76 (Sprint 8): beda dari publicSocialProof di
// halaman publik (yang lintas produk) -- di halaman checkout hanya pembeli
// PRODUK YANG SAMA yang relevan ("orang lain juga baru saja membeli produk
// yang sedang kamu bayar ini").
type checkoutSocialProof struct {
	DisplaySeconds  int              `json:"display_seconds"`
	IntervalSeconds int              `json:"interval_seconds"`
	Recent          []recentPurchase `json:"recent"`
}

// GetStatus — dipakai halaman konfirmasi pembeli untuk menampilkan status
// terbaru (REQ-F-406: pesan gagal bayar yang jelas).
func (h *CheckoutHandler) GetStatus(c *gin.Context) {
	orderID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp checkoutStatusResponse
	var productID, creatorUserID, productKind string
	var isBundle, isDonation, isEvent, isCourse, isBooking bool
	resp.OrderID = orderID
	err := h.DB.QueryRow(ctx, `
		SELECT o.status, p.id, p.name, p.is_bundle, p.is_donation, p.is_course, p.is_booking, p.user_id,
			p.is_event, p.delivery_method, o.fulfilled_at, p.product_kind, p.success_message
		FROM orders o
		JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, orderID).Scan(&resp.Status, &productID, &resp.Product, &isBundle, &isDonation, &isCourse, &isBooking, &creatorUserID,
		&isEvent, &resp.DeliveryMethod, &resp.FulfilledAt, &productKind, &resp.SuccessMessage)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "order tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat status order"})
		return
	}
	resp.IsBundle, resp.IsDonation, resp.IsCourse, resp.IsBooking = isBundle, isDonation, isCourse, isBooking
	resp.IsPaymentLink = productKind == "payment_link"
	if !resp.IsPaymentLink || resp.Status != "paid" {
		resp.SuccessMessage = ""
	}

	// Modul Toko (Fase C): status penyerahan HANYA relevan untuk produk
	// digital biasa -- bundel/donasi/kursus/booking/event sudah punya
	// jalur tampilan sendiri di frontend (lihat field IsBundle dkk di atas),
	// jadi delivery_method disembunyikan supaya tidak membingungkan.
	if isBundle || isDonation || isCourse || isBooking || isEvent || productKind == "payment_link" {
		resp.DeliveryMethod = ""
	} else if resp.Status == "paid" && resp.DeliveryMethod == "random_code" {
		_ = h.DB.QueryRow(ctx, `SELECT code FROM product_codes WHERE claimed_by_order_id = $1`, orderID).Scan(&resp.ClaimedCode)
	}

	// No.92: tampilkan waktu slot yang berhasil dipesan (kalau ada) supaya
	// pembeli langsung tahu jadwal konsultasinya tanpa perlu buka email.
	if resp.IsBooking {
		var bookedAt time.Time
		if err := h.DB.QueryRow(ctx, `
			SELECT starts_at FROM booking_slots WHERE order_id = $1
		`, orderID).Scan(&bookedAt); err == nil {
			resp.BookedSlotAt = &bookedAt
		}
	}

	var spActive, spShowOnCheckout bool
	var spDisplaySeconds, spIntervalSeconds int
	if err := h.DB.QueryRow(ctx, `
		SELECT is_active, show_on_checkout, display_seconds, interval_seconds
		FROM social_proof_settings WHERE user_id = $1
	`, creatorUserID).Scan(&spActive, &spShowOnCheckout, &spDisplaySeconds, &spIntervalSeconds); err == nil && spActive && spShowOnCheckout {
		recent := fetchRecentPurchases(ctx, h.DB, `
			SELECT p.name, o.buyer_email, o.created_at
			FROM orders o JOIN products p ON p.id = o.product_id
			WHERE o.product_id = $1 AND o.status = 'paid'
			ORDER BY o.created_at DESC LIMIT 10
		`, productID)
		if len(recent) > 0 {
			resp.SocialProof = &checkoutSocialProof{DisplaySeconds: spDisplaySeconds, IntervalSeconds: spIntervalSeconds, Recent: recent}
		}
	}

	c.JSON(http.StatusOK, resp)
}

type recentOrderItem struct {
	OrderID     string `json:"order_id"`
	ProductName string `json:"product_name"`
	BuyerEmail  string `json:"buyer_email"`
	AmountIDR   int64  `json:"amount_idr"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
}

// ListRecentOrders -- Modul Statistik (tab "Toko"): daftar transaksi
// terbaru kreator (ala "New Transactions" pada dashboard toko referensi
// Linktree/Lynk.id-like). Menampilkan SEMUA status (bukan cuma "paid")
// supaya kreator juga lihat pesanan yang masih pending/gagal -- beda dari
// AnalyticsHandler.computeSummary yang sengaja hanya menghitung "paid" untuk
// metrik pendapatan/produk terlaris.
func (h *CheckoutHandler) ListRecentOrders(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT o.id, p.name, o.buyer_email, o.amount_idr, o.status, o.created_at
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE p.user_id = $1
		ORDER BY o.created_at DESC LIMIT 20
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat transaksi terbaru"})
		return
	}
	defer rows.Close()

	items := []recentOrderItem{}
	for rows.Next() {
		var it recentOrderItem
		var createdAt time.Time
		if err := rows.Scan(&it.OrderID, &it.ProductName, &it.BuyerEmail, &it.AmountIDR, &it.Status, &createdAt); err != nil {
			continue
		}
		it.CreatedAt = createdAt.Format(time.RFC3339)
		items = append(items, it)
	}

	c.JSON(http.StatusOK, gin.H{"orders": items})
}

// MarkFulfilled -- Modul Toko (Fase C1, metode "manual"): kreator menandai
// pesanan sudah diproses/dikirim lewat kanal lain (WhatsApp/email manual,
// dsb). HANYA berlaku untuk order status="paid" milik produk KREATOR yang
// login, dan HANYA sekali (idempoten -- fulfilled_at yang sudah terisi
// tidak ditimpa ulang, supaya waktu penyelesaian ASLI tidak berubah kalau
// tombolnya tertekan lagi).
func (h *CheckoutHandler) MarkFulfilled(c *gin.Context) {
	orderID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		UPDATE orders SET fulfilled_at = now()
		WHERE id = $1 AND status = 'paid' AND fulfilled_at IS NULL
			AND product_id IN (SELECT id FROM products WHERE user_id = $2 AND delivery_method = 'manual')
	`, orderID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menandai pesanan selesai"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "pesanan tidak ditemukan, belum lunas, sudah ditandai selesai, atau bukan metode manual"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "pesanan ditandai selesai diproses"})
}

type orderListItem struct {
	OrderID        string  `json:"order_id"`
	ProductName    string  `json:"product_name"`
	BuyerEmail     string  `json:"buyer_email"`
	AmountIDR      int64   `json:"amount_idr"`
	PlatformFeeIDR int64   `json:"platform_fee_idr"`
	Status         string  `json:"status"`
	PaymentMethod  string  `json:"payment_method"`
	CreatedAt      string  `json:"created_at"`
	FulfilledAt    *string `json:"fulfilled_at"`
	RefundedAt     *string `json:"refunded_at"`
}

// ListOrders -- Modul Toko (tab Transaction): daftar SEMUA transaksi
// kreator (beda dari ListRecentOrders di atas yang cuma 20 teratas untuk
// widget Statistik), dengan filter status & pencarian bebas (email pembeli
// atau nama produk). Mengikuti gaya "search ILIKE + LIMIT tetap" yang sudah
// dipakai AdminHandler.ListUsers -- kodebase ini sengaja TIDAK punya
// pagination LIMIT/OFFSET sungguhan di mana pun, jadi tidak diperkenalkan
// khusus di sini juga.
func (h *CheckoutHandler) ListOrders(c *gin.Context) {
	userID := c.GetString("userID")
	status := c.Query("status")
	search := "%" + c.Query("search") + "%"

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT o.id, p.name, o.buyer_email, o.amount_idr, o.platform_fee_idr, o.status,
			COALESCE(pay.method, ''), o.created_at, o.fulfilled_at, o.refunded_at
		FROM orders o
		JOIN products p ON p.id = o.product_id
		LEFT JOIN (
			SELECT DISTINCT ON (order_id) order_id, method FROM payments ORDER BY order_id, verified_at DESC NULLS LAST
		) pay ON pay.order_id = o.id
		WHERE p.user_id = $1
			AND ($2 = '' OR o.status = $2)
			AND (o.buyer_email ILIKE $3 OR p.name ILIKE $3)
		ORDER BY o.created_at DESC LIMIT 200
	`, userID, status, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat transaksi"})
		return
	}
	defer rows.Close()

	items := []orderListItem{}
	for rows.Next() {
		var it orderListItem
		var createdAt time.Time
		var fulfilledAt, refundedAt *time.Time
		if err := rows.Scan(&it.OrderID, &it.ProductName, &it.BuyerEmail, &it.AmountIDR, &it.PlatformFeeIDR, &it.Status,
			&it.PaymentMethod, &createdAt, &fulfilledAt, &refundedAt); err != nil {
			continue
		}
		it.CreatedAt = createdAt.Format(time.RFC3339)
		if fulfilledAt != nil {
			s := fulfilledAt.Format(time.RFC3339)
			it.FulfilledAt = &s
		}
		if refundedAt != nil {
			s := refundedAt.Format(time.RFC3339)
			it.RefundedAt = &s
		}
		items = append(items, it)
	}

	c.JSON(http.StatusOK, gin.H{"orders": items})
}

type orderDetailLedgerRow struct {
	Type      string `json:"type"`
	AmountIDR int64  `json:"amount_idr"`
	CreatedAt string `json:"created_at"`
}

type orderDetailResponse struct {
	OrderID                string  `json:"order_id"`
	ProductName            string  `json:"product_name"`
	BuyerEmail             string  `json:"buyer_email"`
	BuyerContact           string  `json:"buyer_contact"`
	AmountIDR              int64   `json:"amount_idr"`
	PlatformFeeIDR         int64   `json:"platform_fee_idr"`
	DiscountIDR            int64   `json:"discount_idr"`
	AffiliateCommissionIDR int64   `json:"affiliate_commission_idr"`
	Status                 string  `json:"status"`
	PspReference           string  `json:"psp_reference"`
	PaymentMethod          string  `json:"payment_method"`
	CreatedAt              string  `json:"created_at"`
	FulfilledAt            *string `json:"fulfilled_at"`
	RefundedAt             *string `json:"refunded_at"`
	RefundAmountIDR        *int64  `json:"refund_amount_idr"`
	RefundReason           string  `json:"refund_reason"`
	// LedgerEntries -- HANYA baris ledger_entries milik KREATOR yang login
	// (bukan afiliator/kolaborator lain yang mungkin juga dapat bagian dari
	// order yang sama) -- konsisten dengan balance.go yang juga selalu
	// menghitung ledger PER user yang login, bukan lintas pihak.
	LedgerEntries []orderDetailLedgerRow `json:"ledger_entries"`
}

// GetOrderDetail -- Modul Toko (tab Transaction): tampilan detail/invoice
// satu pesanan, termasuk rincian ledger (berapa yang benar-benar masuk ke
// saldo kreator dari order ini, dan pembalikannya kalau sudah direfund).
func (h *CheckoutHandler) GetOrderDetail(c *gin.Context) {
	orderID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp orderDetailResponse
	var createdAt time.Time
	var fulfilledAt, refundedAt *time.Time
	err := h.DB.QueryRow(ctx, `
		SELECT o.id, p.name, o.buyer_email, o.buyer_contact, o.amount_idr, o.platform_fee_idr, o.discount_idr,
			o.affiliate_commission_idr, o.status, o.psp_reference, o.created_at, o.fulfilled_at,
			o.refunded_at, o.refund_amount_idr, o.refund_reason
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE o.id = $1 AND p.user_id = $2
	`, orderID, userID).Scan(&resp.OrderID, &resp.ProductName, &resp.BuyerEmail, &resp.BuyerContact, &resp.AmountIDR,
		&resp.PlatformFeeIDR, &resp.DiscountIDR, &resp.AffiliateCommissionIDR, &resp.Status, &resp.PspReference,
		&createdAt, &fulfilledAt, &refundedAt, &resp.RefundAmountIDR, &resp.RefundReason)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "pesanan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pesanan"})
		return
	}
	resp.CreatedAt = createdAt.Format(time.RFC3339)
	if fulfilledAt != nil {
		s := fulfilledAt.Format(time.RFC3339)
		resp.FulfilledAt = &s
	}
	if refundedAt != nil {
		s := refundedAt.Format(time.RFC3339)
		resp.RefundedAt = &s
	}

	_ = h.DB.QueryRow(ctx, `
		SELECT COALESCE(method, '') FROM payments WHERE order_id = $1 ORDER BY verified_at DESC NULLS LAST LIMIT 1
	`, orderID).Scan(&resp.PaymentMethod)

	resp.LedgerEntries = []orderDetailLedgerRow{}
	ledgerRows, err := h.DB.Query(ctx, `
		SELECT type, amount_idr, created_at FROM ledger_entries WHERE order_id = $1 AND user_id = $2 ORDER BY created_at ASC
	`, orderID, userID)
	if err == nil {
		defer ledgerRows.Close()
		for ledgerRows.Next() {
			var lr orderDetailLedgerRow
			var t time.Time
			if err := ledgerRows.Scan(&lr.Type, &lr.AmountIDR, &t); err == nil {
				lr.CreatedAt = t.Format(time.RFC3339)
				resp.LedgerEntries = append(resp.LedgerEntries, lr)
			}
		}
	}

	c.JSON(http.StatusOK, resp)
}

type refundOrderRequest struct {
	Reason string `json:"reason" binding:"omitempty,max=200"`
}

// RefundOrder -- Modul Toko (tab Transaction): refund PENUH pesanan yang
// sudah lunas lewat Midtrans Core API refund (lihat midtrans.Client.Refund),
// lalu membalikkan SEMUA ledger credit yang tertaut ke order ini (kreator +
// afiliator + tiap kolaborator -- cerminan PERSIS dari yang ditulis Webhook
// saat order lunas, lihat catatan di sana) sebagai entri 'refund_debit'
// bernilai negatif, dalam SATU transaksi DB.
//
// SENGAJA TIDAK mencoba menarik kembali barang digital yang sudah terkirim
// (kode acak yang sudah diklaim, slot booking yang sudah dipesan, poin
// loyalitas yang sudah didapat pembeli) -- itu keputusan bisnis terpisah di
// luar cakupan "refund uang" murni yang diminta di sini. Refund SEBAGIAN
// juga di luar cakupan (butuh pembagian ulang platform fee/afiliasi/
// kolaborator yang proporsional) -- lihat catatan lingkup di
// midtrans.Client.Refund.
//
// Panggilan ke Midtrans dilakukan SEBELUM transaksi DB dibuka -- uang harus
// benar-benar berhasil direfund dulu sebelum status lokal berubah. Kalau
// proses gagal PERSIS di antara refund Midtrans sukses dan commit transaksi
// ini (mis. server crash), status lokal bisa tertinggal di belakang
// Midtrans -- kasus langka yang dicatat lewat log di bawah untuk
// rekonsiliasi manual, bukan sistem rekonsiliasi otomatis penuh (di luar
// cakupan).
func (h *CheckoutHandler) RefundOrder(c *gin.Context) {
	orderID := c.Param("id")
	userID := c.GetString("userID")

	var req refundOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()

	var pspReference string
	var amountIDR int64
	err := h.DB.QueryRow(ctx, `
		SELECT o.psp_reference, o.amount_idr
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE o.id = $1 AND p.user_id = $2 AND o.status = 'paid' AND o.refunded_at IS NULL
	`, orderID, userID).Scan(&pspReference, &amountIDR)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "pesanan tidak ditemukan, belum lunas, atau sudah direfund"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pesanan"})
		return
	}

	if _, err := h.Midtrans.Refund(ctx, pspReference, req.Reason); err != nil {
		if err == midtrans.ErrNotConfigured {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "pembayaran belum dikonfigurasi, hubungi admin"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "refund ditolak Midtrans: " + err.Error()})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		log.Printf("checkout: refund Midtrans sukses untuk order %s tapi gagal memulai transaksi DB -- perlu rekonsiliasi manual: %v", orderID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "refund Midtrans berhasil tapi gagal menyimpan status -- hubungi admin"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		UPDATE orders SET status = 'refunded', refunded_at = now(), refund_amount_idr = $1, refund_reason = $2
		WHERE id = $3 AND status = 'paid' AND refunded_at IS NULL
			AND product_id IN (SELECT id FROM products WHERE user_id = $4)
	`, amountIDR, req.Reason, orderID, userID)
	if err != nil {
		log.Printf("checkout: refund Midtrans sukses untuk order %s tapi UPDATE orders gagal -- perlu rekonsiliasi manual: %v", orderID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "refund Midtrans berhasil tapi gagal menyimpan status -- hubungi admin"})
		return
	}
	if tag.RowsAffected() == 0 {
		log.Printf("checkout: refund Midtrans sukses untuk order %s tapi order tidak lagi memenuhi syarat saat commit -- perlu rekonsiliasi manual", orderID)
		c.JSON(http.StatusConflict, gin.H{"error": "pesanan sudah berubah status, tapi refund Midtrans sudah diproses -- hubungi admin untuk rekonsiliasi"})
		return
	}

	creditRows, err := tx.Query(ctx, `SELECT id, user_id, amount_idr FROM ledger_entries WHERE order_id = $1 AND type = 'credit'`, orderID)
	if err != nil {
		log.Printf("checkout: refund Midtrans sukses untuk order %s tapi gagal membaca ledger credit -- perlu rekonsiliasi manual: %v", orderID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "refund Midtrans berhasil tapi gagal membalikkan ledger -- hubungi admin"})
		return
	}
	type creditRow struct {
		LedgerID  string
		UserID    string
		AmountIDR int64
	}
	var credits []creditRow
	for creditRows.Next() {
		var cr creditRow
		if err := creditRows.Scan(&cr.LedgerID, &cr.UserID, &cr.AmountIDR); err == nil {
			credits = append(credits, cr)
		}
	}
	creditRows.Close()

	for _, cr := range credits {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, cr.UserID); err != nil {
			log.Printf("checkout: refund order %s gagal mengunci ledger user %s -- perlu rekonsiliasi manual: %v", orderID, cr.UserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "refund Midtrans berhasil tapi gagal membalikkan ledger -- hubungi admin"})
			return
		}
		var currentBalance int64
		if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1`, cr.UserID).Scan(&currentBalance); err != nil {
			log.Printf("checkout: refund order %s gagal membaca saldo user %s -- perlu rekonsiliasi manual: %v", orderID, cr.UserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "refund Midtrans berhasil tapi gagal membalikkan ledger -- hubungi admin"})
			return
		}
		newBalance := currentBalance - cr.AmountIDR
		refundLedgerID := uuid.NewString()
		if _, err := tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, order_id, type, amount_idr, balance_after, created_at)
			VALUES ($1, $2, $3, 'refund_debit', $4, $5, now())
		`, refundLedgerID, cr.UserID, orderID, -cr.AmountIDR, newBalance); err != nil {
			log.Printf("checkout: refund order %s gagal menulis ledger pembalik untuk user %s -- perlu rekonsiliasi manual: %v", orderID, cr.UserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "refund Midtrans berhasil tapi gagal membalikkan ledger -- hubungi admin"})
			return
		}
		metadata, _ := json.Marshal(gin.H{"amount_idr": -cr.AmountIDR, "balance_after": newBalance, "order_id": orderID, "reversed_ledger_id": cr.LedgerID})
		if err := audit.Log(ctx, tx, cr.UserID, "ledger.refund_debit", "ledger_entry", refundLedgerID, metadata); err != nil {
			log.Printf("checkout: refund order %s gagal mencatat audit log untuk user %s -- perlu rekonsiliasi manual: %v", orderID, cr.UserID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "refund Midtrans berhasil tapi gagal membalikkan ledger -- hubungi admin"})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("checkout: refund Midtrans sukses untuk order %s tapi commit gagal -- perlu rekonsiliasi manual: %v", orderID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "refund Midtrans berhasil tapi gagal menyimpan perubahan -- hubungi admin"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "refund berhasil diproses", "refund_amount_idr": amountIDR})
}

// Webhook — REQ-F-403 (verifikasi signature WAJIB sebelum diproses) &
// REQ-F-404 (idempotensi: notifikasi yang di-retry Midtrans tidak boleh
// diproses dua kali). Selalu membalas 200 kalau payload valid (termasuk saat
// duplikat) supaya Midtrans berhenti retry -- retry hanya berguna kalau
// error KITA yang menyebabkan gagal, bukan karena event-nya sudah pernah
// diproses.
func (h *CheckoutHandler) Webhook(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "gagal membaca payload"})
		return
	}

	var payload midtrans.NotificationPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "payload tidak valid"})
		return
	}

	// REQ-F-403: signature_key di BODY (bukan header terpisah seperti
	// Xendit sebelumnya) WAJIB diverifikasi sebelum payload diproses sama
	// sekali.
	if !midtrans.VerifySignature(payload.OrderID, payload.StatusCode, payload.GrossAmount, h.MidtransServerKey, payload.SignatureKey) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "signature webhook tidak valid"})
		return
	}

	// Modul Langganan Premium: order_id pendaftaran langganan (bukan
	// pembelian produk) ditangani SEPENUHNYA terpisah -- lihat catatan
	// lingkup di subscription.go. HARUS dicek sebelum StatusToOrderStatus/
	// query orders di bawah supaya tidak salah dicari sebagai order produk.
	webhookCtx, webhookCancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	handledAsSubscription, subErr := maybeHandleSubscriptionEnrollmentPayment(webhookCtx, h.DB, h.Midtrans, payload)
	webhookCancel()
	if handledAsSubscription {
		if subErr != nil {
			log.Printf("checkout: gagal memproses pembayaran pendaftaran langganan %s: %v", payload.OrderID, subErr)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memproses pendaftaran langganan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "pendaftaran langganan diproses"})
		return
	}

	orderStatus, recognized := midtrans.StatusToOrderStatus(payload.TransactionStatus, payload.FraudStatus)
	if !recognized {
		// Status lain (mis. "pending", "capture" yang masih "challenge")
		// tidak butuh aksi -- tetap 200 supaya Midtrans tidak retry sia-sia.
		c.JSON(http.StatusOK, gin.H{"message": "diterima, tidak ada aksi untuk status ini"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var orderID, productID, productUserID, buyerEmail, deliveryMethod string
	var amountIDR, platformFeeIDR, affiliateCommissionIDR int64
	var affiliateID *string
	var wishlistItemID *string
	var collaboratorSplitsSnapshotRaw []byte
	err = h.DB.QueryRow(ctx, `
		SELECT o.id, p.id, p.user_id, o.amount_idr, o.platform_fee_idr, o.affiliate_id, o.affiliate_commission_idr, o.buyer_email, o.collaborator_splits_snapshot, p.delivery_method, o.donation_wishlist_item_id
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE o.psp_reference = $1
	`, payload.OrderID).Scan(&orderID, &productID, &productUserID, &amountIDR, &platformFeeIDR, &affiliateID, &affiliateCommissionIDR, &buyerEmail, &collaboratorSplitsSnapshotRaw, &deliveryMethod, &wishlistItemID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{"message": "order tidak ditemukan, diabaikan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencari order"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Idempotensi (REQ-F-404): kalau psp_transaction_id ini sudah pernah
	// tercatat, INSERT tidak melakukan apa-apa (RowsAffected=0) -- webhook
	// duplikat aman diabaikan tanpa mengubah status order/ledger lagi.
	res, err := tx.Exec(ctx, `
		INSERT INTO payments (id, order_id, psp, method, psp_transaction_id, status, raw_webhook_payload, verified_at)
		VALUES ($1, $2, 'midtrans', $3, $4, $5, $6, now())
		ON CONFLICT (psp_transaction_id) WHERE psp_transaction_id != '' DO NOTHING
	`, uuid.NewString(), orderID, payload.PaymentType, payload.TransactionID, orderStatus, body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pembayaran"})
		return
	}

	shouldNotifyBuyer := false

	if res.RowsAffected() > 0 {
		if _, err := tx.Exec(ctx, `UPDATE orders SET status = $1 WHERE id = $2`, orderStatus, orderID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui status order"})
			return
		}
		if err := audit.Log(ctx, tx, productUserID, "order."+orderStatus, "order", orderID, nil); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
			return
		}

		// REQ-F-501: kredit ledger kreator saat pembayaran benar-benar
		// dikonfirmasi (bukan saat checkout dibuat). pg_advisory_xact_lock
		// menyerialkan write ke ledger user yang sama supaya balance_after
		// selalu benar walau ada beberapa webhook masuk bersamaan untuk
		// kreator yang sama.
		if orderStatus == "paid" {
			if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, productUserID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunci ledger"})
				return
			}

			var currentBalance int64
			if err := tx.QueryRow(ctx, `
				SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1
			`, productUserID).Scan(&currentBalance); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung saldo"})
				return
			}

			// Modul Settings §3: snapshot sudah berisi rupiah ABSOLUT per
			// kolaborator (dihitung sekali saat checkout, lihat
			// CheckoutHandler.Create) -- di sini cuma dibaca & dijumlah,
			// tidak ada perhitungan persen apa pun lagi.
			var collaboratorSplitSnapshots []CollaboratorSplitSnapshot
			if len(collaboratorSplitsSnapshotRaw) > 0 {
				_ = json.Unmarshal(collaboratorSplitsSnapshotRaw, &collaboratorSplitSnapshots)
			}
			var totalCollaboratorSplitIDR int64
			for _, s := range collaboratorSplitSnapshots {
				totalCollaboratorSplitIDR += s.AmountIDR
			}

			// No.72 & Modul Settings §3: komisi afiliasi DAN split kolaborator
			// dipotong dari bagian kreator (keduanya dibayar dari pendapatan
			// kreator, BUKAN biaya tambahan platform).
			netAmount := amountIDR - platformFeeIDR - affiliateCommissionIDR - totalCollaboratorSplitIDR
			newBalance := currentBalance + netAmount
			ledgerID := uuid.NewString()
			if _, err := tx.Exec(ctx, `
				INSERT INTO ledger_entries (id, user_id, order_id, type, amount_idr, balance_after, created_at)
				VALUES ($1, $2, $3, 'credit', $4, $5, now())
			`, ledgerID, productUserID, orderID, netAmount, newBalance); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat ledger"})
				return
			}
			metadata, _ := json.Marshal(gin.H{"amount_idr": netAmount, "balance_after": newBalance, "order_id": orderID})
			if err := audit.Log(ctx, tx, productUserID, "ledger.credit", "ledger_entry", ledgerID, metadata); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
				return
			}

			// No.72: kredit ledger afiliator, pola sama persis seperti ledger
			// kreator di atas (lock per user_id supaya balance_after benar
			// walau ada beberapa webhook afiliator yang sama masuk bersamaan).
			if affiliateID != nil && affiliateCommissionIDR > 0 {
				var affiliateUserID string
				if err := tx.QueryRow(ctx, `SELECT affiliate_user_id FROM affiliates WHERE id = $1`, *affiliateID).Scan(&affiliateUserID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat afiliator"})
					return
				}
				if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, affiliateUserID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunci ledger afiliator"})
					return
				}
				var affiliateCurrentBalance int64
				if err := tx.QueryRow(ctx, `
					SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1
				`, affiliateUserID).Scan(&affiliateCurrentBalance); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung saldo afiliator"})
					return
				}
				affiliateNewBalance := affiliateCurrentBalance + affiliateCommissionIDR
				affiliateLedgerID := uuid.NewString()
				if _, err := tx.Exec(ctx, `
					INSERT INTO ledger_entries (id, user_id, order_id, type, amount_idr, balance_after, created_at)
					VALUES ($1, $2, $3, 'credit', $4, $5, now())
				`, affiliateLedgerID, affiliateUserID, orderID, affiliateCommissionIDR, affiliateNewBalance); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat ledger afiliator"})
					return
				}
				affiliateMetadata, _ := json.Marshal(gin.H{"amount_idr": affiliateCommissionIDR, "balance_after": affiliateNewBalance, "order_id": orderID})
				if err := audit.Log(ctx, tx, affiliateUserID, "ledger.credit", "ledger_entry", affiliateLedgerID, affiliateMetadata); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log afiliator"})
					return
				}
			}

			// Modul Settings §3: kredit ledger tiap kolaborator, pola sama
			// PERSIS dengan blok afiliator di atas (lock per user_id, baca
			// saldo, insert credit, audit log) -- diulang per baris snapshot
			// karena split BISA lebih dari satu kolaborator sekaligus (beda
			// dari afiliasi yang maksimal satu per order).
			for _, split := range collaboratorSplitSnapshots {
				if split.AmountIDR <= 0 {
					continue
				}
				if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, split.UserID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunci ledger kolaborator"})
					return
				}
				var collabCurrentBalance int64
				if err := tx.QueryRow(ctx, `
					SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1
				`, split.UserID).Scan(&collabCurrentBalance); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung saldo kolaborator"})
					return
				}
				collabNewBalance := collabCurrentBalance + split.AmountIDR
				collabLedgerID := uuid.NewString()
				if _, err := tx.Exec(ctx, `
					INSERT INTO ledger_entries (id, user_id, order_id, type, amount_idr, balance_after, created_at)
					VALUES ($1, $2, $3, 'credit', $4, $5, now())
				`, collabLedgerID, split.UserID, orderID, split.AmountIDR, collabNewBalance); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat ledger kolaborator"})
					return
				}
				collabMetadata, _ := json.Marshal(gin.H{"amount_idr": split.AmountIDR, "balance_after": collabNewBalance, "order_id": orderID})
				if err := audit.Log(ctx, tx, split.UserID, "ledger.credit", "ledger_entry", collabLedgerID, collabMetadata); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log kolaborator"})
					return
				}
			}

			// No.94 (Sprint 13): poin loyalitas dihitung dari amountIDR
			// (nilai order SEBELUM potongan platform, sama seperti dasar
			// perhitungan komisi afiliasi) -- lihat awardLoyaltyPoints.
			if err := awardLoyaltyPoints(ctx, tx, productUserID, buyerEmail, orderID, amountIDR); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat poin loyalitas"})
				return
			}

			// Gap #4 benchmark kompetitif (9 Agustus 2026): kredit progress
			// wishlist ala Saweria/Trakteer -- amountIDR (nilai order penuh
			// SEBELUM potongan apa pun, sama seperti dasar poin loyalitas di
			// atas), no-op kalau donasi ini tidak menargetkan item tertentu.
			if err := creditDonationWishlistItem(ctx, tx, wishlistItemID, amountIDR); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat progres wishlist"})
				return
			}

			// Modul Toko (Fase C2): metode penyerahan "random_code" -- klaim
			// SATU kode ATOMIK dalam transaksi yang SAMA dengan pelunasan
			// order ini (FOR UPDATE SKIP LOCKED mencegah dua webhook/pembeli
			// bersamaan merebut kode yang sama). Kehabisan stok TIDAK
			// menggagalkan webhook ini (uang sudah diterima, tidak bisa
			// dibatalkan dari sini) -- dibiarkan tanpa kode terklaim, kreator
			// perlu menambah stok & pembeli hubungi penjual (best-effort,
			// bukan jaminan penuh, tapi lebih baik daripada menggagalkan
			// konfirmasi pembayaran yang sudah sah).
			if deliveryMethod == "random_code" {
				if _, err := tx.Exec(ctx, `
					UPDATE product_codes SET claimed_by_order_id = $1, claimed_at = now()
					WHERE id = (
						SELECT id FROM product_codes
						WHERE product_id = $2 AND claimed_by_order_id IS NULL
						ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
					)
				`, orderID, productID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengklaim kode produk"})
					return
				}
			}

			shouldNotifyBuyer = true
		}

	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	// REQ-F-405: enqueue notifikasi SETELAH commit berhasil (bukan di dalam
	// transaksi) -- pengiriman email dilakukan async oleh proses `./api
	// worker` (lihat internal/worker), supaya lambat/gagalnya SMTP tidak
	// pernah membuat webhook PSP ini timeout atau gagal. Enqueue gagal
	// hanya di-log, TIDAK mengubah respons -- pembayaran sudah sah tercatat
	// terlepas dari nasib notifikasinya.
	//
	// shouldNotifyBuyer HANYA true kalau webhook ini yang PERTAMA KALI
	// mengubah status (res.RowsAffected() > 0 di atas) -- webhook duplikat
	// (retry PSP yang sangat umum terjadi) TIDAK BOLEH mengenqueue notifikasi
	// lagi, kalau tidak pembeli bisa menerima email "pesanan siap diunduh"
	// berkali-kali untuk satu pembayaran yang sama.
	if shouldNotifyBuyer {
		if h.Queue == nil {
			log.Printf("checkout: job queue tidak tersedia, lewati notifikasi order %s", orderID)
		} else if task, err := queue.NewOrderPaidTask(orderID); err != nil {
			log.Printf("checkout: gagal membuat task notifikasi order %s: %v", orderID, err)
		} else if _, err := h.Queue.Enqueue(task); err != nil {
			log.Printf("checkout: gagal enqueue notifikasi order %s: %v", orderID, err)
		}

		// Modul Toko (Fase C3): metode penyerahan "webhook" -- enqueue
		// TERPISAH dari notifikasi email di atas, gated sama (shouldNotifyBuyer)
		// supaya webhook duplikat PSP tidak memicu POST dua kali ke server
		// kreator untuk pembayaran yang sama.
		if deliveryMethod == "webhook" {
			if h.Queue == nil {
				log.Printf("checkout: job queue tidak tersedia, lewati webhook produk order %s", orderID)
			} else if task, err := queue.NewProductWebhookDeliveryTask(orderID); err != nil {
				log.Printf("checkout: gagal membuat task webhook produk order %s: %v", orderID, err)
			} else if _, err := h.Queue.Enqueue(task); err != nil {
				log.Printf("checkout: gagal enqueue webhook produk order %s: %v", orderID, err)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "webhook diproses"})
}

// DownloadFile — REQ-F-405 (link unduhan pembeli). Endpoint PUBLIK (pembeli
// tidak punya akun, REQ-F-401) yang diklik langsung dari email notifikasi.
// Sengaja TIDAK menaruh presigned URL S3 langsung di badan email (masa
// berlaku presigned URL cuma 15 menit, lihat REQ-F-304) -- tautan di email
// mengarah ke endpoint tetap ini, yang membuatkan presigned URL BARU setiap
// kali diklik lalu redirect. Jadi tautan di email tetap berfungsi kapan pun
// dibuka, bukan cuma dalam 15 menit setelah pembayaran.
func (h *CheckoutHandler) DownloadFile(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	orderID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var status, fileKey, buyerEmail string
	var isBundle, isDonation, isCourse, isBooking, watermarkEnabled bool
	err := h.DB.QueryRow(ctx, `
		SELECT o.status, o.buyer_email, p.file_key, p.is_bundle, p.is_donation, p.is_course, p.is_booking, p.watermark_enabled FROM orders o
		JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, orderID).Scan(&status, &buyerEmail, &fileKey, &isBundle, &isDonation, &isCourse, &isBooking, &watermarkEnabled)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "pesanan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pesanan"})
		return
	}

	if status != "paid" {
		c.JSON(http.StatusForbidden, gin.H{"error": "pesanan belum lunas"})
		return
	}

	// No.70: bundel punya banyak file (satu per produk yang termasuk),
	// jadi tidak bisa langsung redirect ke satu presigned URL seperti
	// produk biasa -- arahkan ke halaman status checkout, yang menampilkan
	// daftar unduhan lewat GET /checkout/:id/bundle-items.
	// No.71: donasi tidak pernah punya file sama sekali -- arahkan juga ke
	// halaman status, yang menampilkan ucapan terima kasih tanpa tombol
	// unduh (bukan error 404 "file tidak tersedia").
	// No.91: kursus punya banyak bab video (bukan satu file) -- arahkan juga
	// ke halaman status, yang menampilkan daftar bab lewat
	// GET /checkout/:id/course-chapters.
	// No.92: booking tidak pernah punya file sama sekali -- arahkan juga ke
	// halaman status, yang menampilkan konfirmasi jadwal yang sudah dipesan.
	if isBundle || isDonation || isCourse || isBooking {
		c.Redirect(http.StatusFound, h.PublicWebURL+"/checkout/"+orderID)
		return
	}

	if fileKey == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "file produk tidak tersedia"})
		return
	}

	url, err := h.downloadURLFor(ctx, fileKey, watermarkEnabled, buyerEmail, orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat tautan unduhan"})
		return
	}

	c.Redirect(http.StatusFound, url)
}

// downloadURLFor — No.85: kalau watermark diaktifkan kreator DAN file
// berformat PDF, unduh file asli, sisipkan watermark (email pembeli + ID
// pesanan), lalu unggah SALINANNYA ke key terpisah ("watermarked/...")
// sebelum di-presign -- file asli di key produk TIDAK PERNAH diubah.
// Presigned URL dibuat ulang tiap dipanggil (pola sama seperti sebelumnya,
// lihat komentar DownloadFile), begitu juga proses watermarking -- bukan
// dipersiapkan sekali di muka, supaya perubahan pengaturan watermark
// kreator langsung berlaku untuk unduhan berikutnya tanpa perlu migrasi data.
func (h *CheckoutHandler) downloadURLFor(ctx context.Context, fileKey string, watermarkEnabled bool, buyerEmail, orderID string) (string, error) {
	if !watermarkEnabled || !isPdfKey(fileKey) {
		return h.Storage.PresignedDownloadURL(ctx, fileKey, 15*time.Minute)
	}

	original, err := h.Storage.Download(ctx, fileKey)
	if err != nil {
		return "", fmt.Errorf("gagal mengunduh file asli: %w", err)
	}

	watermarked, err := applyPdfWatermark(original, fmt.Sprintf("%s | %s", buyerEmail, orderID))
	if err != nil {
		return "", err
	}

	watermarkedKey := fmt.Sprintf("watermarked/%s/%s", orderID, fileKey)
	if err := h.Storage.Upload(ctx, watermarkedKey, bytes.NewReader(watermarked), int64(len(watermarked)), "application/pdf"); err != nil {
		return "", fmt.Errorf("gagal mengunggah salinan ber-watermark: %w", err)
	}

	return h.Storage.PresignedDownloadURL(ctx, watermarkedKey, 15*time.Minute)
}

// GetBundleItems — No.70: dipanggil dari halaman status checkout untuk
// bundel yang sudah lunas, mengembalikan presigned URL BARU per produk
// yang termasuk (pola sama seperti DownloadFile -- selalu dibuat baru
// tiap dipanggil, bukan disimpan permanen).
func (h *CheckoutHandler) GetBundleItems(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	orderID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var status, buyerEmail string
	var isBundle bool
	var bundleProductID string
	if err := h.DB.QueryRow(ctx, `
		SELECT o.status, o.buyer_email, p.is_bundle, p.id FROM orders o
		JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, orderID).Scan(&status, &buyerEmail, &isBundle, &bundleProductID); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "pesanan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pesanan"})
		return
	}
	if status != "paid" {
		c.JSON(http.StatusForbidden, gin.H{"error": "pesanan belum lunas"})
		return
	}
	if !isBundle {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pesanan ini bukan bundel"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT ip.name, ip.file_key, ip.watermark_enabled FROM bundle_items bi
		JOIN products ip ON ip.id = bi.item_product_id
		WHERE bi.bundle_product_id = $1
		ORDER BY ip.name
	`, bundleProductID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat isi bundel"})
		return
	}
	defer rows.Close()

	type bundleItem struct {
		Name        string `json:"name"`
		DownloadURL string `json:"download_url"`
	}
	items := []bundleItem{}
	for rows.Next() {
		var name, fileKey string
		var watermarkEnabled bool
		if err := rows.Scan(&name, &fileKey, &watermarkEnabled); err != nil || fileKey == "" {
			continue
		}
		// No.85: tiap produk di dalam bundel punya pengaturan watermark
		// sendiri-sendiri (bundel tidak menambah kolom baru -- item bundel
		// tetap baris products biasa).
		url, err := h.downloadURLFor(ctx, fileKey, watermarkEnabled, buyerEmail, orderID)
		if err != nil {
			continue
		}
		items = append(items, bundleItem{Name: name, DownloadURL: url})
	}

	c.JSON(http.StatusOK, gin.H{"items": items})
}

// GetCourseChapters — No.91: dipanggil dari halaman status checkout untuk
// kursus yang sudah lunas, mengembalikan seluruh bab video terurut. Video
// selalu berupa tautan embed YouTube/TikTok (lihat CourseHandler), jadi
// TIDAK perlu presigned URL sama sekali -- beda dari bundel yang filenya
// privat di storage.
func (h *CheckoutHandler) GetCourseChapters(c *gin.Context) {
	orderID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var status string
	var isCourse bool
	var courseProductID string
	if err := h.DB.QueryRow(ctx, `
		SELECT o.status, p.is_course, p.id FROM orders o
		JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, orderID).Scan(&status, &isCourse, &courseProductID); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "pesanan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pesanan"})
		return
	}
	if status != "paid" {
		c.JSON(http.StatusForbidden, gin.H{"error": "pesanan belum lunas"})
		return
	}
	if !isCourse {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pesanan ini bukan kursus"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT title, description, video_url FROM course_chapters
		WHERE course_product_id = $1 ORDER BY position ASC
	`, courseProductID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat bab kursus"})
		return
	}
	defer rows.Close()

	type chapter struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		VideoURL    string `json:"video_url"`
	}
	chapters := []chapter{}
	for rows.Next() {
		var ch chapter
		if err := rows.Scan(&ch.Title, &ch.Description, &ch.VideoURL); err == nil {
			chapters = append(chapters, ch)
		}
	}

	c.JSON(http.StatusOK, gin.H{"chapters": chapters})
}
