package handlers

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// invalidateUserPageCache — helper bersama dipakai SEMUA handler yang
// mengubah data yang tampil di halaman publik UTAMA kreator (produk/donasi/
// event/booking/bundel/kursus), supaya perubahan langsung terlihat alih-alih
// menunggu cache Redis "page:<username>" (page.go, publicPageCacheTTL 30
// detik) kedaluwarsa sendiri.
//
// Bug ditemukan 16 Juli 2026 untuk produk (lihat catatan lama di
// product.go) -- baru sekarang (26 Juli 2026) ketahuan bug yang SAMA juga
// berlaku di donation.go (dilaporkan pengguna: toggle nonaktif tidak
// langsung hilang dari halaman publik) DAN belum pernah ada sama sekali di
// bundle.go/course.go/event.go/booking.go -- kelimanya sama-sama mengubah
// baris `products` (donasi/bundel/kursus/event/booking semua dimodelkan
// sebagai varian baris products, pola yang sama seperti dicatat di
// masing-masing file) yang tampil di GetPublicPage, tapi TIDAK PERNAH
// menghapus cache-nya. Dipanggil best-effort: kegagalan invalidasi cache
// TIDAK menggagalkan request utama (mis. Redis sedang down).
func invalidateUserPageCache(ctx context.Context, db *pgxpool.Pool, rdb *redis.Client, userID string) {
	if rdb == nil {
		return
	}
	var username string
	if err := db.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err == nil {
		rdb.Del(ctx, "page:"+username)
	}
}
