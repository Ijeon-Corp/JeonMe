-- Modul "Featured Link" (permintaan langsung pengguna, 12 Agustus 2026,
-- susulan dari perbandingan Linktree/Lynk.id -- "Featured Layout"
-- Linktree sungguhan): tautan tertentu bisa ditandai tampil sebagai kartu
-- thumbnail besar (16:9), bukan baris teks polos -- dipakai selektif utk
-- 1-2 tautan terpenting (video/promo), bukan semua tautan sekaligus.
--
-- thumbnail_url DIISI OTOMATIS dari pola thumbnail publik YouTube kalau
-- URL tautan dikenali sebagai video YouTube (lihat deriveYoutubeThumbnail,
-- links.go) -- tidak perlu API key/panggilan keluar. Untuk platform lain
-- (Instagram, dll) kreator unggah manual (endpoint sendiri, pola SAMA
-- PERSIS dengan custom_icon_url yang sudah ada -- lihat UploadLinkThumbnail
-- di links.go), TIDAK pakai kolom custom_icon_url yang sudah ada karena
-- tujuan visualnya beda (ikon bulat kecil pengganti ikon platform vs
-- thumbnail 16:9 besar pengganti seluruh baris tautan).
--
-- is_featured DEFAULT false -- tautan lama/baru TETAP tampil sebagai baris
-- klasik sampai kreator secara aktif menandainya, tidak ada perubahan
-- tampilan diam-diam untuk tautan yang sudah ada.
ALTER TABLE links ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE links ADD COLUMN thumbnail_url TEXT NOT NULL DEFAULT '';
