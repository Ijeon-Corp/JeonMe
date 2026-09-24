-- Layout "Profil Kreator" -- permintaan langsung pengguna, 24 September
-- 2026: "buat quick template yang seperti ini karna ini sesuai tema home
-- page nya" (gambar 5 kartu: Full-Stack Developer, Penulis Buku, Guru,
-- Freelancer, Toko Online), lalu memilih opsi "gaya penuh" -- bukan
-- sekadar isi template, tapi elemen tampilan yang SEBELUMNYA tidak ada di
-- sistem sama sekali:
--
-- 1. pages.profile_extras (JSONB) -- chip keahlian berikon di bawah bio
--    (React/Laravel/Go, Matematika/Sains) dan baris statistik 3 angka
--    ("48 Proyek - 6 Tahun - 4.9 Rating"). Bentuk:
--      {"chips":[{"label":"React","icon":"brand-react"}],
--       "stats":[{"value":"48","label":"Proyek"}]}
--    Satu kolom JSONB (bukan dua tabel/kolom) karena keduanya selalu dibaca
--    & ditulis bersama sebagai bagian header halaman, tidak pernah di-query
--    per elemen. Divalidasi di handler (jumlah & panjang), sama seperti
--    pages.stickers. Per halaman (bukan per akun) -- konsisten dgn bio/
--    avatar/tema yang juga independen per halaman.
--
-- 2. links.accent_color & links.badge_text -- tombol warna-warni per
--    tautan (lime/lavender/coral/biru di gambar) dan chip harga/label di
--    kartu penawaran ("Mulai Rp3jt", "Gratis", "30 Menit"). Kolom biasa
--    (bukan block_data) supaya berlaku utk tipe blok apa pun, pola sama
--    seperti icon_color (migrasi 000075).
--
-- Semua ADDITIVE dgn default kosong -- aman dijalankan sebelum container
-- lama diganti (lihat aturan DROP/RENAME di CLAUDE.md); kode lama tidak
-- membaca kolom baru ini sama sekali.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS profile_extras JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE links ADD COLUMN IF NOT EXISTS accent_color VARCHAR(7) NOT NULL DEFAULT '';
ALTER TABLE links ADD COLUMN IF NOT EXISTS badge_text VARCHAR(24) NOT NULL DEFAULT '';
