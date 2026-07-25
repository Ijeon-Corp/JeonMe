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
	var priceIDR int64
	var flashSaleActive bool
	var pwywEnabled bool
	var pwywMinPriceIDR *int64
	// No.68: priceIDR di sini SUDAH harga efektif (harga flash sale kalau
	// sedang aktif) -- voucher (No.67) di bawah menumpuk di atas harga ini,
	// bukan di atas harga asli.
	err := h.DB.QueryRow(ctx, `
		SELECT name, `+effectivePriceExpr+`, pwyw_enabled, pwyw_min_price_idr
		FROM products WHERE id = $1 AND is_active = true
	`, req.ProductID).Scan(&productName, &priceIDR, &flashSaleActive, &pwywEnabled, &pwywMinPriceIDR)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan atau belum aktif"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
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
		INSERT INTO orders (id, product_id, buyer_email, buyer_contact, amount_idr, platform_fee_idr, status, psp_reference, voucher_id, discount_idr, affiliate_id, affiliate_commission_idr, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, now())
	`, orderID, req.ProductID, req.BuyerEmail, req.BuyerContact, finalAmountIDR, platformFeeIDR, externalID, voucherID, discountIDR, affiliateID, affiliateCommissionIDR)
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
	OrderID     string               `json:"order_id"`
	Status      string               `json:"status"`
	Product     string               `json:"product_name"`
	IsBundle    bool                 `json:"is_bundle"`
	IsDonation  bool                 `json:"is_donation"`
	SocialProof *checkoutSocialProof `json:"social_proof"`
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
	var productID, creatorUserID string
	resp.OrderID = orderID
	err := h.DB.QueryRow(ctx, `
		SELECT o.status, p.id, p.name, p.is_bundle, p.is_donation, p.user_id FROM orders o
		JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, orderID).Scan(&resp.Status, &productID, &resp.Product, &resp.IsBundle, &resp.IsDonation, &creatorUserID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "order tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat status order"})
		return
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

	orderStatus, recognized := midtrans.StatusToOrderStatus(payload.TransactionStatus, payload.FraudStatus)
	if !recognized {
		// Status lain (mis. "pending", "capture" yang masih "challenge")
		// tidak butuh aksi -- tetap 200 supaya Midtrans tidak retry sia-sia.
		c.JSON(http.StatusOK, gin.H{"message": "diterima, tidak ada aksi untuk status ini"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var orderID, productUserID string
	var amountIDR, platformFeeIDR, affiliateCommissionIDR int64
	var affiliateID *string
	err = h.DB.QueryRow(ctx, `
		SELECT o.id, p.user_id, o.amount_idr, o.platform_fee_idr, o.affiliate_id, o.affiliate_commission_idr
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE o.psp_reference = $1
	`, payload.OrderID).Scan(&orderID, &productUserID, &amountIDR, &platformFeeIDR, &affiliateID, &affiliateCommissionIDR)
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

			// No.72: komisi afiliasi dipotong dari bagian kreator (afiliator
			// dibayar dari pendapatan kreator, BUKAN biaya tambahan platform).
			netAmount := amountIDR - platformFeeIDR - affiliateCommissionIDR
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
	var isBundle, isDonation, watermarkEnabled bool
	err := h.DB.QueryRow(ctx, `
		SELECT o.status, o.buyer_email, p.file_key, p.is_bundle, p.is_donation, p.watermark_enabled FROM orders o
		JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, orderID).Scan(&status, &buyerEmail, &fileKey, &isBundle, &isDonation, &watermarkEnabled)
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
	if isBundle || isDonation {
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
