-- Halaman Tambahan Fase 2 lanjutan (permintaan langsung pengguna, 28 Agustus
-- 2026): "biasanya page baru untuk landing page biasanya bisa juga tidak
-- menampilkan foto profile nama dsb gitu" -- toggle independen PER HALAMAN
-- supaya halaman tambahan bertipe "bio" bisa dipakai gaya landing (tanpa
-- avatar/nama/bio di atas) tanpa harus ganti page_type jadi "landing" (yang
-- kehilangan tautan/blok Link Bio biasa demi blok manual penuh-lebar).
-- Default true supaya SEMUA halaman yang sudah ada (termasuk halaman utama)
-- tidak berubah tampilan sama sekali begitu migrasi ini jalan.
ALTER TABLE pages ADD COLUMN show_profile_header BOOLEAN NOT NULL DEFAULT true;
