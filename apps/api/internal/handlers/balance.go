package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/crypto"
	"github.com/jeonme/api/internal/payout"
)

// BalanceHandler mengimplementasikan REQ-F-501 (kalkulasi saldo dari
// ledger_entries), REQ-F-502 (saldo tertahan vs tersedia), REQ-F-503/504
// (pengajuan & status penarikan dana).
//
// Saldo TIDAK disimpan sebagai kolom tunggal -- selalu direkonstruksi dari
// SUM(ledger_entries.amount_idr) sesuai desain append-only di skema (lihat
// komentar di migrations/000001_init_schema.up.sql). "Tertahan" dihitung
// sebagai kredit yang lebih baru dari HoldingPeriodDays (anti-fraud/refund
// window) -- BUKAN kolom status terpisah, jadi tidak butuh job terjadwal
// untuk "melepaskan" saldo; cukup dihitung ulang tiap kali diminta.
type BalanceHandler struct {
	DB                *pgxpool.Pool
	HoldingPeriodDays int
	EncryptionKey     []byte
}

func NewBalanceHandler(db *pgxpool.Pool, holdingPeriodDays int, encryptionKey []byte) *BalanceHandler {
	return &BalanceHandler{DB: db, HoldingPeriodDays: holdingPeriodDays, EncryptionKey: encryptionKey}
}

type balanceResponse struct {
	AvailableIDR      int64 `json:"available_idr"`
	HeldIDR           int64 `json:"held_idr"`
	HoldingPeriodDays int   `json:"holding_period_days"`
}

// GetBalance — REQ-F-501/502.
func (h *BalanceHandler) GetBalance(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.balanceFor(ctx, h.DB, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung saldo"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *BalanceHandler) balanceFor(ctx context.Context, db *pgxpool.Pool, userID string) (balanceResponse, error) {
	var total, held int64
	if err := db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1
	`, userID).Scan(&total); err != nil {
		return balanceResponse{}, err
	}
	if err := db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries
		WHERE user_id = $1 AND type = 'credit' AND created_at > now() - make_interval(days => $2)
	`, userID, h.HoldingPeriodDays).Scan(&held); err != nil {
		return balanceResponse{}, err
	}

	return balanceResponse{
		AvailableIDR:      total - held,
		HeldIDR:           held,
		HoldingPeriodDays: h.HoldingPeriodDays,
	}, nil
}

type createPayoutRequest struct {
	AmountIDR      int64  `json:"amount_idr" binding:"required,min=1"`
	PayoutMethodID string `json:"payout_method_id" binding:"required"`
}

// CreatePayout — REQ-F-503 + Modul Settings §3 (keputusan pengguna
// 2026-07-31): penarikan sekarang WAJIB lewat payout_method TERSIMPAN &
// TERVERIFIKASI (bukan lagi rekening bebas ketik per pengajuan) --
// nomor rekening didekripsi di sini SEKALI untuk dicatat sebagai snapshot
// di payouts.destination_account (kolom lama, TIDAK diubah, supaya
// admin.go & tampilan lain yang membacanya tetap jalan apa adanya), lalu
// alur inti (kunci saldo, debit ledger, dst) didelegasikan ke
// internal/payout.Create supaya PERSIS sama dengan jalur auto-withdraw.
func (h *BalanceHandler) CreatePayout(c *gin.Context) {
	var req createPayoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var encryptedAccount, accountName string
	var verified bool
	err := h.DB.QueryRow(ctx, `
		SELECT account_number_encrypted, account_name, verified
		FROM payout_methods WHERE id = $1 AND user_id = $2
	`, req.PayoutMethodID, userID).Scan(&encryptedAccount, &accountName, &verified)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "metode pembayaran tidak ditemukan"})
		return
	}
	if !verified {
		c.JSON(http.StatusBadRequest, gin.H{"error": "metode pembayaran ini belum diverifikasi"})
		return
	}

	accountNumber, err := crypto.Decrypt(h.EncryptionKey, encryptedAccount)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca metode pembayaran"})
		return
	}
	destinationAccount := accountName + " - " + accountNumber

	payoutID, err := payout.Create(ctx, h.DB, userID, req.AmountIDR, h.HoldingPeriodDays, &req.PayoutMethodID, destinationAccount, "manual")
	if err != nil {
		switch {
		case errors.Is(err, payout.ErrBelowMinimum):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, payout.ErrInsufficientBalance):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat pengajuan penarikan"})
		}
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": payoutID, "message": "pengajuan penarikan diterima"})
}

type payoutItem struct {
	ID                 string     `json:"id"`
	AmountIDR          int64      `json:"amount_idr"`
	DestinationAccount string     `json:"destination_account"`
	Status             string     `json:"status"`
	RequestedAt        time.Time  `json:"requested_at"`
	CompletedAt        *time.Time `json:"completed_at,omitempty"`
}

// ListPayouts — REQ-F-504: status penarikan (diajukan/diproses/berhasil/gagal).
func (h *BalanceHandler) ListPayouts(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, amount_idr, destination_account, status, requested_at, completed_at
		FROM payouts WHERE user_id = $1 ORDER BY requested_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat riwayat penarikan"})
		return
	}
	defer rows.Close()

	items := []payoutItem{}
	for rows.Next() {
		var it payoutItem
		if err := rows.Scan(&it.ID, &it.AmountIDR, &it.DestinationAccount, &it.Status, &it.RequestedAt, &it.CompletedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// paymentMethodLabel — No.89 (Sprint 10): nama tampilan untuk nilai
// payment_type mentah dari Midtrans (lihat midtrans.NotificationPayload).
func paymentMethodLabel(method string) string {
	switch method {
	case "qris":
		return "QRIS"
	case "bank_transfer", "echannel", "permata_va":
		return "Transfer Bank/Virtual Account"
	case "gopay":
		return "GoPay"
	case "shopeepay":
		return "ShopeePay"
	case "credit_card":
		return "Kartu Kredit/Debit"
	case "":
		return "Belum ada transaksi lunas"
	default:
		return method
	}
}

type feeReferenceItem struct {
	Method         string `json:"method"`
	Label          string `json:"label"`
	FeeDescription string `json:"fee_description"`
}

// feeReferenceTable -- PLACEHOLDER bisnis (belum ada keputusan resmi biaya
// per kanal Jeonme sendiri, mirip status payout.MinIDR), sumber
// angka dari riset publik Lynk.id (QRIS ~0.70%, VA flat Rp3-4rb) sebagai
// estimasi kasar sampai ada kontrak Midtrans/keputusan bisnis resmi.
// TIDAK dipakai untuk menghitung platform_fee_idr sungguhan di manapun --
// murni referensi/edukasi untuk kreator, angka aktual tetap flat lewat
// PlatformFeePercent (lihat CreatePayout/CheckoutHandler.Create).
var feeReferenceTable = []feeReferenceItem{
	{Method: "qris", Label: "QRIS", FeeDescription: "±0,7% dari nilai transaksi"},
	{Method: "bank_transfer", Label: "Transfer Bank/Virtual Account", FeeDescription: "Flat ±Rp4.000 per transaksi"},
	{Method: "gopay", Label: "GoPay", FeeDescription: "±1,5%–2% dari nilai transaksi"},
	{Method: "shopeepay", Label: "ShopeePay", FeeDescription: "±1,5%–2% dari nilai transaksi"},
	{Method: "credit_card", Label: "Kartu Kredit/Debit", FeeDescription: "±2,9% + Rp2.000 per transaksi"},
}

type feeBreakdownItem struct {
	Method           string `json:"method"`
	Label            string `json:"label"`
	TransactionCount int64  `json:"transaction_count"`
	TotalFeeIDR      int64  `json:"total_fee_idr"`
}

type feeBreakdownResponse struct {
	Reference []feeReferenceItem `json:"reference"`
	Actual    []feeBreakdownItem `json:"actual"`
}

// GetFeeBreakdown — No.89: transparansi biaya per metode pembayaran.
// "reference" adalah estimasi umum (lihat feeReferenceTable); "actual"
// adalah rincian SUNGGUHAN dari transaksi lunas kreator ini, dikelompokkan
// per kanal pembayaran ASLI yang dipilih pembeli (payments.method, diisi
// dari payload.PaymentType webhook -- lihat CheckoutHandler.Webhook).
func (h *BalanceHandler) GetFeeBreakdown(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT COALESCE(NULLIF(pay.method, ''), '') AS method, COUNT(*), COALESCE(SUM(o.platform_fee_idr), 0)
		FROM payments pay
		JOIN orders o ON o.id = pay.order_id
		JOIN products p ON p.id = o.product_id
		WHERE p.user_id = $1 AND o.status = 'paid'
		GROUP BY method ORDER BY COUNT(*) DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat rincian biaya"})
		return
	}
	defer rows.Close()

	actual := []feeBreakdownItem{}
	for rows.Next() {
		var it feeBreakdownItem
		if err := rows.Scan(&it.Method, &it.TransactionCount, &it.TotalFeeIDR); err == nil {
			it.Label = paymentMethodLabel(it.Method)
			actual = append(actual, it)
		}
	}

	c.JSON(http.StatusOK, feeBreakdownResponse{Reference: feeReferenceTable, Actual: actual})
}
