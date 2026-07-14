package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/xendit"
)

// CheckoutHandler mengimplementasikan REQ-F-401 (checkout tanpa akun),
// REQ-F-402 (integrasi Xendit), REQ-F-403/404 (webhook + idempotensi).
//
// PENTING: Xendit belum diuji melawan akun sungguhan -- lihat catatan di
// internal/xendit/client.go. CreateInvoice akan menolak dengan pesan jelas
// (bukan crash) selama XENDIT_SECRET_KEY kosong.
type CheckoutHandler struct {
	DB                 *pgxpool.Pool
	Xendit             *xendit.Client
	WebhookToken       string
	PublicWebURL       string
	PlatformFeePercent float64
}

func NewCheckoutHandler(db *pgxpool.Pool, xenditClient *xendit.Client, webhookToken, publicWebURL string, platformFeePercent float64) *CheckoutHandler {
	return &CheckoutHandler{
		DB: db, Xendit: xenditClient, WebhookToken: webhookToken,
		PublicWebURL: publicWebURL, PlatformFeePercent: platformFeePercent,
	}
}

type createCheckoutRequest struct {
	ProductID    string `json:"product_id" binding:"required"`
	BuyerEmail   string `json:"buyer_email" binding:"required,email"`
	BuyerContact string `json:"buyer_contact"`
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

	orderID := uuid.NewString()
	externalID := "jeonme-order-" + orderID
	platformFeeIDR := int64(float64(priceIDR) * h.PlatformFeePercent / 100)

	// Order disimpan dalam transaksi yang BELUM di-commit sampai Xendit
	// benar-benar berhasil membuat invoice -- kalau panggilan Xendit gagal,
	// transaksi di-rollback supaya tidak ada order "pending" yatim yang
	// tidak pernah bisa dibayar sama sekali.
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx, `
		INSERT INTO orders (id, product_id, buyer_email, buyer_contact, amount_idr, platform_fee_idr, status, psp_reference, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, now())
	`, orderID, req.ProductID, req.BuyerEmail, req.BuyerContact, priceIDR, platformFeeIDR, externalID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat order"})
		return
	}

	invoice, err := h.Xendit.CreateInvoice(ctx, xendit.CreateInvoiceRequest{
		ExternalID:         externalID,
		Amount:             priceIDR,
		PayerEmail:         req.BuyerEmail,
		Description:        fmt.Sprintf("Jeonme: %s", productName),
		SuccessRedirectURL: h.PublicWebURL + "/checkout/" + orderID + "?status=success",
		FailureRedirectURL: h.PublicWebURL + "/checkout/" + orderID + "?status=failed",
	})
	if err != nil {
		if err == xendit.ErrNotConfigured {
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
		"invoice_url": invoice.InvoiceURL,
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

// xenditStatusToOrderStatus memetakan status invoice Xendit ke status order kita.
func xenditStatusToOrderStatus(xenditStatus string) (string, bool) {
	switch xenditStatus {
	case "PAID", "SETTLED":
		return "paid", true
	case "EXPIRED":
		return "expired", true
	default:
		return "", false
	}
}

// Webhook — REQ-F-403 (verifikasi signature WAJIB sebelum diproses) &
// REQ-F-404 (idempotensi: webhook yang di-retry Xendit tidak boleh diproses
// dua kali). Selalu membalas 200 kalau payload valid (termasuk saat duplikat)
// supaya Xendit berhenti retry -- retry hanya berguna kalau error KITA yang
// menyebabkan gagal, bukan karena event-nya sudah pernah diproses.
func (h *CheckoutHandler) Webhook(c *gin.Context) {
	token := c.GetHeader("x-callback-token")
	if !xendit.VerifyCallbackToken(token, h.WebhookToken) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token webhook tidak valid"})
		return
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "gagal membaca payload"})
		return
	}

	var payload xendit.InvoiceWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "payload tidak valid"})
		return
	}

	orderStatus, recognized := xenditStatusToOrderStatus(payload.Status)
	if !recognized {
		// Status lain (mis. "PENDING") tidak butuh aksi -- tetap 200 supaya
		// Xendit tidak retry sia-sia.
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
	`, payload.ExternalID).Scan(&orderID, &productUserID, &amountIDR, &platformFeeIDR)
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
		VALUES ($1, $2, 'xendit', 'invoice', $3, $4, $5, now())
		ON CONFLICT (psp_transaction_id) WHERE psp_transaction_id != '' DO NOTHING
	`, uuid.NewString(), orderID, payload.ID, orderStatus, body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pembayaran"})
		return
	}

	if res.RowsAffected() > 0 {
		if _, err := tx.Exec(ctx, `UPDATE orders SET status = $1 WHERE id = $2`, orderStatus, orderID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui status order"})
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
			if _, err := tx.Exec(ctx, `
				INSERT INTO ledger_entries (id, user_id, order_id, type, amount_idr, balance_after, created_at)
				VALUES ($1, $2, $3, 'credit', $4, $5, now())
			`, uuid.NewString(), productUserID, orderID, netAmount, newBalance); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat ledger"})
				return
			}
		}

		// TODO (Sprint 3 lanjutan, butuh worker/job queue Sprint 2 No.41):
		// kirim notifikasi email/WhatsApp + link unduhan ke buyer (REQ-F-405)
		// -- belum ada infra worker & provider email/WA.
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "webhook diproses"})
}
