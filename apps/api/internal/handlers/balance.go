package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/audit"
)

// minPayoutIDR -- PLACEHOLDER bisnis, belum ada keputusan resmi. Rp50.000
// adalah nilai umum di platform sejenis untuk menghindari biaya transfer
// bank/e-wallet yang tidak sepadan dengan penarikan nominal kecil.
const minPayoutIDR = 50_000

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
}

func NewBalanceHandler(db *pgxpool.Pool, holdingPeriodDays int) *BalanceHandler {
	return &BalanceHandler{DB: db, HoldingPeriodDays: holdingPeriodDays}
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
	AmountIDR          int64  `json:"amount_idr" binding:"required,min=1"`
	DestinationAccount string `json:"destination_account" binding:"required"`
}

// CreatePayout — REQ-F-503. Rekening/e-wallet tujuan diterima apa adanya
// dari input pengguna (belum ada validasi bahwa rekening benar-benar milik
// pemilik akun di luar cross-check nama lewat proses KYC manual, lihat
// KycHandler No.84) -- status KYC dicatat sebagai snapshot untuk
// memprioritaskan proses, bukan untuk memvalidasi nomor rekening itu sendiri.
func (h *BalanceHandler) CreatePayout(c *gin.Context) {
	var req createPayoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.AmountIDR < minPayoutIDR {
		c.JSON(http.StatusBadRequest, gin.H{"error": "minimum penarikan Rp50.000"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Kunci per-user supaya dua pengajuan penarikan beruntun (atau webhook
	// pembayaran yang masuk bersamaan) tidak balapan membaca saldo yang sama.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunci saldo"})
		return
	}

	var total, held int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung saldo"})
		return
	}
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries
		WHERE user_id = $1 AND type = 'credit' AND created_at > now() - make_interval(days => $2)
	`, userID, h.HoldingPeriodDays).Scan(&held); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung saldo tertahan"})
		return
	}

	available := total - held
	if req.AmountIDR > available {
		c.JSON(http.StatusBadRequest, gin.H{"error": "saldo tersedia tidak cukup"})
		return
	}

	// Snapshot status KYC SAAT pengajuan dibuat (No.84) -- dipakai admin untuk
	// memprioritaskan antrian proses manual (verified duluan), BUKAN untuk
	// memblokir penarikan. Default 'unverified' kalau kreator belum pernah
	// mengajukan KYC sama sekali (belum ada baris di kyc_verifications).
	var kycStatus string
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE((SELECT status FROM kyc_verifications WHERE user_id = $1), 'unverified')
	`, userID).Scan(&kycStatus); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa status KYC"})
		return
	}

	payoutID := uuid.NewString()
	if _, err := tx.Exec(ctx, `
		INSERT INTO payouts (id, user_id, amount_idr, destination_account, status, requested_at, kyc_status_at_request)
		VALUES ($1, $2, $3, $4, 'requested', now(), $5)
	`, payoutID, userID, req.AmountIDR, req.DestinationAccount, kycStatus); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat pengajuan penarikan"})
		return
	}

	// Debit langsung dicatat saat PENGAJUAN (bukan saat benar-benar cair) --
	// supaya saldo yang sama tidak bisa diajukan dua kali sebelum penarikan
	// pertama selesai diproses. Kalau penarikan gagal, entry ini di-reverse
	// (lihat TODO di bagian admin/Sprint 6 -- proses disbursement sungguhan
	// belum ada, jadi status penarikan untuk sekarang tetap "requested"
	// sampai ditindaklanjuti manual).
	newBalance := total - req.AmountIDR
	if _, err := tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, type, amount_idr, balance_after, created_at)
		VALUES ($1, $2, 'debit', $3, $4, now())
	`, uuid.NewString(), userID, -req.AmountIDR, newBalance); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat ledger penarikan"})
		return
	}

	metadata, _ := json.Marshal(gin.H{
		"amount_idr": req.AmountIDR, "destination_account": req.DestinationAccount, "balance_after": newBalance,
	})
	if err := audit.Log(ctx, tx, userID, "payout.requested", "payout", payoutID, metadata); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pengajuan"})
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
