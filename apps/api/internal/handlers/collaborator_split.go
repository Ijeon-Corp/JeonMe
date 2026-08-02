package handlers

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CollaboratorSplit — Modul Settings §3 (diferensiasi dari Lynk.id):
// revenue share otomatis ke kolaborator saat produk terjual, disimpan di
// products.collaborator_splits (jsonb, lihat migrasi 000039). Persen
// (BUKAN basis poin) SENGAJA mengikuti konvensi affiliates.commission_percent
// yang sudah ada -- satu cara merepresentasikan "potongan pendapatan" di
// seluruh aplikasi, bukan dua yang berbeda.
type CollaboratorSplit struct {
	UserID  string  `json:"user_id"`
	Percent float64 `json:"percent"`
}

// CollaboratorSplitSnapshot — hasil resolusi CollaboratorSplit (persen)
// jadi rupiah ABSOLUT pada saat checkout, disimpan di
// orders.collaborator_splits_snapshot. Pola sama persis dengan
// orders.affiliate_commission_idr: angka absolut, bukan formula, supaya
// CheckoutHandler.Webhook tidak perlu menghitung ulang apa pun di jalur
// pembayaran yang paling kritis.
type CollaboratorSplitSnapshot struct {
	UserID    string `json:"user_id"`
	AmountIDR int64  `json:"amount_idr"`
}

// validateCollaboratorSplits memastikan tiap user_id benar akun yang ada
// (bukan pemilik produk itu sendiri -- tidak masuk akal split ke diri
// sendiri), persennya masuk akal (0 < p <= 100), tidak ada duplikat, dan
// totalnya tidak melebihi 100% (kalau melebihi, bagian kreator sendiri
// bisa jadi negatif -- lihat checkout.go tempat ini dipotong dari netAmount
// kreator, pola sama dengan komisi afiliasi).
func validateCollaboratorSplits(ctx context.Context, db *pgxpool.Pool, splits []CollaboratorSplit, ownerUserID string) error {
	if len(splits) == 0 {
		return nil
	}

	seen := map[string]bool{}
	var total float64
	for _, s := range splits {
		if s.UserID == "" {
			return errors.New("collaborator_splits: user_id wajib diisi")
		}
		if s.UserID == ownerUserID {
			return errors.New("collaborator_splits: tidak bisa split ke akun sendiri")
		}
		if seen[s.UserID] {
			return errors.New("collaborator_splits: user_id duplikat")
		}
		seen[s.UserID] = true
		if s.Percent <= 0 || s.Percent > 100 {
			return errors.New("collaborator_splits: persen harus lebih dari 0 dan maksimal 100")
		}
		total += s.Percent

		var exists bool
		if err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL)`, s.UserID).Scan(&exists); err != nil {
			return errors.New("collaborator_splits: gagal memeriksa akun")
		}
		if !exists {
			return errors.New("collaborator_splits: salah satu user_id tidak ditemukan")
		}
	}
	if total > 100 {
		return errors.New("collaborator_splits: total persen tidak boleh lebih dari 100%")
	}
	return nil
}
