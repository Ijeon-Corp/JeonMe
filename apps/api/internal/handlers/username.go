package handlers

import (
	"context"
	"regexp"

	"github.com/jackc/pgx/v5"
)

var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_]{3,30}$`)

// queryRower dipenuhi baik *pgxpool.Pool maupun pgx.Tx -- dipakai supaya
// checkUsernameAvailable bisa dipanggil dari luar transaksi (Register) atau
// di dalam transaksi yang sama dengan perubahan (SettingsProfileHandler.Update).
type queryRower interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// checkUsernameAvailable memvalidasi format lalu memastikan username belum
// dipakai (case-insensitive, lihat idx_users_username_lower) DAN belum jadi
// nama lama milik pengguna LAIN yang masih dalam window redirect 90 hari --
// lihat Spec Settings §2 (cegah squatting pasca-redirect). excludeUserID
// dilewatkan supaya (a) pemilik akun yang sedang mengganti username sendiri
// tidak terblokir oleh baris usernamenya sendiri, dan (b) pemilik asli boleh
// mengambil kembali username lamanya sendiri kapan pun. Saat dipanggil dari
// Register (belum ada user id), lewatkan string kosong.
func checkUsernameAvailable(ctx context.Context, q queryRower, username, excludeUserID string) (bool, string) {
	if !usernamePattern.MatchString(username) {
		return false, "username harus 3-30 karakter, hanya huruf/angka/underscore"
	}

	// id/user_id di-cast ::text sebelum dibandingkan -- excludeUserID kosong
	// (dipanggil dari Register, belum ada user id) TIDAK BISA di-cast ke
	// uuid oleh Postgres (gagal parse "" sebagai uuid), padahal untuk kasus
	// itu memang tidak ada baris yang perlu dikecualikan sama sekali.
	// Perbandingan teks selalu valid secara sintaks, string kosong sekadar
	// tidak akan pernah cocok dengan id sungguhan mana pun.
	var exists bool
	if err := q.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE lower(username) = lower($1) AND id::text != $2)`,
		username, excludeUserID,
	).Scan(&exists); err != nil {
		return false, "gagal memeriksa ketersediaan username"
	}
	if exists {
		return false, "username sudah dipakai"
	}

	var squatted bool
	if err := q.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM username_history
			WHERE lower(old_username) = lower($1)
				AND changed_at > now() - interval '90 days'
				AND user_id::text != $2
		)
	`, username, excludeUserID).Scan(&squatted); err != nil {
		return false, "gagal memeriksa ketersediaan username"
	}
	if squatted {
		return false, "username ini baru saja ditinggalkan pemilik sebelumnya, masih direservasi sementara untuk redirect (coba lagi nanti)"
	}

	return true, ""
}
