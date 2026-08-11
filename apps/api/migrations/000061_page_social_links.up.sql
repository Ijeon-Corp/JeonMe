-- Kontak sosial di profil/menu Link Bio (permintaan langsung pengguna, 11
-- Agustus 2026): "dibagian profile atau menu link bio itu bisa mengisi
-- kontak instagram tiktok facebook whatsapp dll jika mengisi bisa kita
-- tampilkan di bagian bawah deskripsi nya saat akses link dan sudah built
-- in icon nya" -- baris ikon sosial di bawah bio halaman publik, TERPISAH
-- dari daftar Tautan biasa (yang sudah ada, auto-deteksi ikon dari URL
-- lewat lib/link-icons.ts, tapi selalu tampil sebagai baris list, bukan
-- ikon bulat kecil di bawah deskripsi seperti referensi Beacons yang
-- diminta pengguna).
--
-- 9 platform dipilih supaya PERSIS cocok dengan ikon brand yang SUDAH ADA
-- di components/icons.tsx (IconInstagram/Tiktok/Facebook/Whatsapp/Youtube/
-- X/Linkedin/Telegram + IconMail untuk email) -- tidak perlu bikin ikon
-- baru.
--
-- Kolom disimpan per HALAMAN (bukan per akun) -- konsisten dengan pola
-- bio/avatar/tema yang SUDAH per-halaman (lihat CLAUDE.md), BUKAN
-- dibagikan lintas semua halaman seperti katalog produk. Nilai kosong ('')
-- berarti platform itu belum diisi -- ikonnya tidak dirender di halaman
-- publik (bukan ikon mati/disabled).
--
-- Nilainya SENGAJA disimpan bebas (boleh handle SAJA atau URL LENGKAP,
-- bukan dipaksa satu format) -- dinormalisasi jadi href final saat
-- render (lib/social-links.ts di frontend), sama seperti pola urlTemplate
-- yang sudah ada di SUGGESTED_PLATFORMS (dashboard/links/page.tsx).
ALTER TABLE pages ADD COLUMN social_instagram VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN social_tiktok VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN social_facebook VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN social_whatsapp VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN social_youtube VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN social_x VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN social_linkedin VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN social_telegram VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN social_email VARCHAR(255) NOT NULL DEFAULT '';
