package handlers

import (
	"testing"
)

// TestLatestLedgerBalance_MatchesFullHistorySum -- regresi audit performa
// profesional 15 September 2026 (Medium-High): latestLedgerBalance (baca
// balance_after baris TERBARU) menggantikan "SELECT SUM(amount_idr) FROM
// ledger_entries WHERE user_id=$1" (baca ulang SELURUH riwayat) di 5 titik
// (RefundOrder, webhook kredit kreator, komisi afiliasi, split kolaborator
// di checkout.go + pembalikan payout gagal di admin.go). Test ini
// mensimulasikan pola PERSIS yang dipakai kelima titik itu -- setiap
// kredit/debit jalan di TRANSAKSI TERPISAHNYA SENDIRI (bukan digabung satu
// transaksi, karena tiap webhook/refund/payout memang request terpisah),
// dikunci pg_advisory_xact_lock per-user (menyerialkan write, sama seperti
// produksi), lalu membuktikan hasil akhir latestLedgerBalance SAMA PERSIS
// dengan SUM manual atas seluruh baris yang benar-benar tersimpan --
// membuktikan optimasi O(1) ini tidak mengubah angka saldo yang dihasilkan.
func TestLatestLedgerBalance_MatchesFullHistorySum(t *testing.T) {
	checkout, auth := newTestCheckoutHandler(t, "")
	userID := registerTestUser(t, auth)
	ctx := t.Context()

	deltas := []int64{50000, 120000, -30000, 75000, -10000, 200000}

	for _, delta := range deltas {
		tx, err := checkout.DB.Begin(ctx)
		if err != nil {
			t.Fatalf("gagal begin tx: %v", err)
		}

		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, userID); err != nil {
			t.Fatalf("gagal lock: %v", err)
		}

		currentBalance, err := latestLedgerBalance(ctx, tx, userID)
		if err != nil {
			t.Fatalf("latestLedgerBalance gagal: %v", err)
		}

		newBalance := currentBalance + delta
		entryType := "credit"
		if delta < 0 {
			entryType = "debit"
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO ledger_entries (user_id, type, amount_idr, balance_after, created_at)
			VALUES ($1, $2, $3, $4, now())
		`, userID, entryType, delta, newBalance); err != nil {
			t.Fatalf("gagal insert ledger entry: %v", err)
		}

		if err := tx.Commit(ctx); err != nil {
			t.Fatalf("gagal commit tx: %v", err)
		}
	}

	var expectedSum int64
	if err := checkout.DB.QueryRow(ctx, `SELECT COALESCE(SUM(amount_idr), 0) FROM ledger_entries WHERE user_id = $1`, userID).Scan(&expectedSum); err != nil {
		t.Fatalf("gagal hitung SUM ground-truth: %v", err)
	}

	verifyTx, err := checkout.DB.Begin(ctx)
	if err != nil {
		t.Fatalf("gagal begin tx verifikasi: %v", err)
	}
	defer func() { _ = verifyTx.Rollback(ctx) }()

	finalBalance, err := latestLedgerBalance(ctx, verifyTx, userID)
	if err != nil {
		t.Fatalf("latestLedgerBalance (final) gagal: %v", err)
	}

	if finalBalance != expectedSum {
		t.Fatalf("latestLedgerBalance = %d, ekspektasi sama dgn SUM manual = %d", finalBalance, expectedSum)
	}

	var wantBalance int64
	for _, d := range deltas {
		wantBalance += d
	}
	if finalBalance != wantBalance {
		t.Fatalf("latestLedgerBalance = %d, ekspektasi %d (jumlah aritmatika delta)", finalBalance, wantBalance)
	}
}

// TestLatestLedgerBalance_NoRowsIsZero -- user baru tanpa riwayat ledger
// sama sekali harus dianggap saldo 0 (COALESCE), bukan error/NULL --
// dibutuhkan supaya kredit PERTAMA seorang kreator baru tetap benar
// (newBalance = 0 + amountIDR).
func TestLatestLedgerBalance_NoRowsIsZero(t *testing.T) {
	checkout, auth := newTestCheckoutHandler(t, "")
	userID := registerTestUser(t, auth)
	ctx := t.Context()

	tx, err := checkout.DB.Begin(ctx)
	if err != nil {
		t.Fatalf("gagal begin tx: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	balance, err := latestLedgerBalance(ctx, tx, userID)
	if err != nil {
		t.Fatalf("latestLedgerBalance gagal: %v", err)
	}
	if balance != 0 {
		t.Fatalf("latestLedgerBalance (user baru) = %d, ekspektasi 0", balance)
	}
}
