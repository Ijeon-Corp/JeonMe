-- 2 platform sosial tambahan -- permintaan langsung pengguna, 24 Agustus
-- 2026 (bareng migrasi 000077): template "Dimas Dev" bertema developer
-- menampilkan ikon GitHub & Website/globe di baris sosial, DUA platform ini
-- belum ada di antara 9 yang sudah ada (migrasi 000061). Pola SAMA PERSIS
-- (lihat komentar lengkap 000061_page_social_links.up.sql): kolom per
-- HALAMAN, nilai bebas (handle ATAU URL lengkap, dinormalisasi saat render
-- lewat lib/social-links.ts), kosong ('') berarti belum diisi.
ALTER TABLE pages ADD COLUMN social_github VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN social_website VARCHAR(255) NOT NULL DEFAULT '';
