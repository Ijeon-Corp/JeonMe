// Package audit menyediakan pencatatan jejak audit (NF-10) untuk setiap
// perubahan saldo & status transaksi -- dipanggil DI DALAM transaksi
// database yang sama dengan perubahan itu sendiri, supaya catatan audit
// tidak pernah "hilang" kalau transaksi utamanya di-rollback.
package audit

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

// Executor dipenuhi baik *pgxpool.Pool maupun pgx.Tx (keduanya punya method
// Exec dengan signature persis ini) -- Log() dipakai baik di luar transaksi
// (jarang) maupun di dalam transaksi (umum, supaya audit ikut rollback kalau
// perubahan utamanya gagal).
type Executor interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Log mencatat satu baris audit_log. entityID diterima sebagai string
// supaya bisa dipakai untuk entity apa pun (order/payout/ledger_entry/user)
// tanpa perlu tipe berbeda per pemanggil.
func Log(ctx context.Context, exec Executor, userID, action, entityType, entityID string, metadata []byte) error {
	_, err := exec.Exec(ctx, `
		INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, metadata, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
	`, uuid.NewString(), userID, action, entityType, entityID, metadata)
	return err
}
