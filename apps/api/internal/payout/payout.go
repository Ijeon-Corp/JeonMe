// Package payout membungkus alur inti pengajuan penarikan (kunci saldo,
// cek cukup, insert baris payouts, debit ledger, audit log) dalam SATU
// fungsi -- dipakai BalanceHandler.CreatePayout (manual, lewat HTTP)
// MAUPUN worker.HandleAutoWithdrawScan (otomatis, lewat scheduler asynq),
// supaya logika finansialnya PERSIS SAMA dari kedua jalur, tidak
// terduplikasi. Ini SATU pengecualian sengaja dari pola "SQL inline per
// handler, tanpa lapisan service" yang dipakai proyek ini di tempat lain
// -- di sini dipisah karena benar-benar dipanggil dari DUA proses
// terpisah (server HTTP dan worker), bukan sekadar preferensi arsitektur.
package payout

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/audit"
)

// MinIDR -- PLACEHOLDER bisnis (sama seperti minPayoutIDR lama di
// balance.go, dipindah ke sini supaya satu sumber kebenaran).
const MinIDR = 50_000

var ErrBelowMinimum = errors.New("minimum penarikan Rp50.000")
var ErrInsufficientBalance = errors.New("saldo tersedia tidak cukup")

// Create menjalankan pengajuan penarikan. payoutMethodID boleh nil (jalur
// lama tanpa metode tersimpan sudah tidak dipakai UI baru, tapi kolomnya
// tetap nullable untuk fleksibilitas/histori). destinationAccount adalah
// nilai yang SUDAH di-resolve (didekripsi) oleh pemanggil -- fungsi ini
// tidak tahu apa pun soal enkripsi, cuma menyimpan apa yang diberikan
// (sama seperti alur lama), supaya admin.go & tampilan lain yang membaca
// payouts.destination_account tidak perlu berubah sama sekali.
func Create(ctx context.Context, db *pgxpool.Pool, userID string, amountIDR int64, holdingPeriodDays int, payoutMethodID *string, destinationAccount, triggeredBy string) (payoutID string, err error) {
	if amountIDR < MinIDR {
		return "", ErrBelowMinimum
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("payout: gagal memulai transaksi: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Kunci per-user supaya dua pengajuan penarikan beruntun (atau webhook
	// pembayaran yang masuk bersamaan) tidak balapan membaca saldo yang
	// sama -- lihat komentar asli di balance.go (pola dipindah apa adanya).
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, userID); err != nil {
		return "", fmt.Errorf("payout: gagal mengunci saldo: %w", err)
	}

	var total, held int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return "", fmt.Errorf("payout: gagal menghitung saldo: %w", err)
	}
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries
		WHERE user_id = $1 AND type = 'credit' AND created_at > now() - make_interval(days => $2)
	`, userID, holdingPeriodDays).Scan(&held); err != nil {
		return "", fmt.Errorf("payout: gagal menghitung saldo tertahan: %w", err)
	}

	available := total - held
	if amountIDR > available {
		return "", ErrInsufficientBalance
	}

	var kycStatus string
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE((SELECT status FROM kyc_verifications WHERE user_id = $1), 'unverified')
	`, userID).Scan(&kycStatus); err != nil {
		return "", fmt.Errorf("payout: gagal memeriksa status KYC: %w", err)
	}

	payoutID = uuid.NewString()
	if _, err := tx.Exec(ctx, `
		INSERT INTO payouts (id, user_id, amount_idr, destination_account, payout_method_id, status, requested_at, kyc_status_at_request, triggered_by)
		VALUES ($1, $2, $3, $4, $5, 'requested', now(), $6, $7)
	`, payoutID, userID, amountIDR, destinationAccount, payoutMethodID, kycStatus, triggeredBy); err != nil {
		return "", fmt.Errorf("payout: gagal membuat pengajuan penarikan: %w", err)
	}

	newBalance := total - amountIDR
	if _, err := tx.Exec(ctx, `
		INSERT INTO ledger_entries (id, user_id, type, amount_idr, balance_after, created_at)
		VALUES ($1, $2, 'debit', $3, $4, now())
	`, uuid.NewString(), userID, -amountIDR, newBalance); err != nil {
		return "", fmt.Errorf("payout: gagal mencatat ledger penarikan: %w", err)
	}

	metadata, _ := json.Marshal(map[string]any{
		"amount_idr": amountIDR, "destination_account": destinationAccount,
		"balance_after": newBalance, "triggered_by": triggeredBy,
	})
	if err := audit.Log(ctx, tx, userID, "payout.requested", "payout", payoutID, metadata); err != nil {
		return "", fmt.Errorf("payout: gagal mencatat audit log: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("payout: gagal menyimpan pengajuan: %w", err)
	}

	return payoutID, nil
}
