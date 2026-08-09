package handlers

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// invalidateUserPageCache — helper bersama dipakai SEMUA handler yang
// mengubah data yang tampil di halaman publik kreator (produk/donasi/
// event/booking/bundel/kursus), supaya perubahan langsung terlihat alih-alih
// menunggu cache Redis (page.go, publicPageCacheTTL 30 detik) kedaluwarsa
// sendiri.
//
// Bug ditemukan 16 Juli 2026 untuk produk (lihat catatan lama di
// product.go) -- 26 Juli 2026 ketahuan bug yang SAMA juga berlaku di
// donation.go (dilaporkan pengguna: toggle nonaktif tidak langsung hilang
// dari halaman publik) DAN belum pernah ada sama sekali di
// bundle.go/course.go/event.go/booking.go -- kelimanya sama-sama mengubah
// baris `products` (donasi/bundel/kursus/event/booking semua dimodelkan
// sebagai varian baris products, pola yang sama seperti dicatat di
// masing-masing file) yang tampil di GetPublicPage, tapi TIDAK PERNAH
// menghapus cache-nya.
//
// Bug KEDUA ditemukan 8 Agustus 2026 lewat E2E Playwright (produk baru
// tetap tidak muncul di halaman Toko publik sampai TTL 30 detik penuh
// habis, padahal DB & toggle "Aktifkan" sudah benar): fungsi ini HANYA
// pernah menghapus cache "page:<username>" (halaman utama/bio,
// GetPublicPage), tidak pernah menyentuh "page-slug:<slug>" (GetPublicPageBySlug,
// dipakai /p/{slug} -- Toko DAN semua halaman tambahan). Katalog produk
// dibagi lintas SEMUA halaman satu akun (lihat CLAUDE.md), jadi perubahan
// produk harus membatalkan cache SETIAP halaman non-utama juga, bukan cuma
// halaman utama. Dipanggil best-effort: kegagalan invalidasi cache TIDAK
// menggagalkan request utama (mis. Redis sedang down).
func invalidateUserPageCache(ctx context.Context, db *pgxpool.Pool, rdb *redis.Client, userID string) {
	if rdb == nil {
		return
	}
	var username string
	if err := db.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err == nil {
		rdb.Del(ctx, "page:"+username)
	}

	rows, err := db.Query(ctx, `SELECT slug FROM pages WHERE user_id = $1 AND is_primary = false AND slug != ''`, userID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err == nil {
			rdb.Del(ctx, "page-slug:"+slug)
		}
	}
}
