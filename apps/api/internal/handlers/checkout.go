package handlers

import (
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
	ProductID    string `json:"product_id" binding:"required"`
	BuyerEmail   string `json:"buyer_email" binding:"required,email"`
	BuyerContact string `json:"buyer_contact"`
	VoucherCode  string `json:"voucher_code"`
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
	err := h.DB.QueryRow(ctx, `
		SELECT name, price_idr FROM products WHERE id = $1 AND is_active = true
	`, req.ProductID).Scan(&productName, &priceIDR)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan atau belum aktif"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
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
		INSERT INTO orders (id, product_id, buyer_email, buyer_contact, amount_idr, platform_fee_idr, status, psp_reference, voucher_id, discount_idr, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, now())
	`, orderID, req.ProductID, req.BuyerEmail, req.BuyerContact, finalAmountIDR, platformFeeIDR, externalID, voucherID, discountIDR)
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
	Code      string `json:"code" binding:"required"`
	ProductID string `json:"product_id" binding:"required"`
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
	if err := h.DB.QueryRow(ctx, `
		SELECT price_idr FROM products WHERE id = $1 AND is_active = true
	`, req.ProductID).Scan(&priceIDR); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan atau belum aktif"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
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
	OrderID string `json:"order_id"`
	Status  string `json:"status"`
	Product string `json:"product_name"`
}

// GetStatus — dipakai halaman konfirmasi pembeli untuk menampilkan status
// terbaru (REQ-F-406: pesan gagal bayar yang jelas).
func (h *CheckoutHandler) GetStatus(c *gin.Context) {
	orderID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var resp checkoutStatusResponse
	resp.OrderID = orderID
	err := h.DB.QueryRow(ctx, `
		SELECT o.status, p.name FROM orders o
		JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, orderID).Scan(&resp.Status, &resp.Product)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "order tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat status order"})
		return
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
	var amountIDR, platformFeeIDR int64
	err = h.DB.QueryRow(ctx, `
		SELECT o.id, p.user_id, o.amount_idr, o.platform_fee_idr
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE o.psp_reference = $1
	`, payload.OrderID).Scan(&orderID, &productUserID, &amountIDR, &platformFeeIDR)
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
		VALUES ($1, $2, 'midtrans', 'snap', $3, $4, $5, now())
		ON CONFLICT (psp_transaction_id) WHERE psp_transaction_id != '' DO NOTHING
	`, uuid.NewString(), orderID, payload.TransactionID, orderStatus, body)
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

			netAmount := amountIDR - platformFeeIDR
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

	var status, fileKey string
	err := h.DB.QueryRow(ctx, `
		SELECT o.status, p.file_key FROM orders o
		JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, orderID).Scan(&status, &fileKey)
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
	if fileKey == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "file produk tidak tersedia"})
		return
	}

	url, err := h.Storage.PresignedDownloadURL(ctx, fileKey, 15*time.Minute)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat tautan unduhan"})
		return
	}

	c.Redirect(http.StatusFound, url)
}
