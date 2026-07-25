-- No.98 (Sprint 14): dukungan multi-halaman bio per akun. Ditemukan lewat
-- fitur "Your Pages" Linktree -- satu akun bisa kelola beberapa halaman bio
-- terpisah (masing-masing URL sendiri), berguna untuk kreator yang mengelola
-- beberapa brand/proyek dari satu login. LINGKUP: halaman TAMBAHAN berbagi
-- katalog produk/monetisasi yang SAMA dengan kreatornya (produk/event/
-- booking/dst tetap per-USER, bukan per-halaman, konsisten dengan model yang
-- sudah ada) -- yang benar-benar independen per halaman cuma bio/avatar/
-- tema/desain kustom & daftar tautannya sendiri (links.page_id sudah
-- generik sejak awal, tidak perlu perubahan skema di tabel links).
--
-- Halaman UTAMA (is_primary=true) TIDAK berubah perilakunya sama sekali --
-- tetap diakses lewat jeonme.com/{username} seperti sebelumnya. Halaman
-- TAMBAHAN (is_primary=false) diakses lewat jeonme.com/p/{slug}, namespace
-- terpisah supaya tidak bentrok dengan username akun mana pun.
ALTER TABLE pages DROP CONSTRAINT pages_user_id_key;
ALTER TABLE pages ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE pages ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN slug VARCHAR(50);

CREATE UNIQUE INDEX idx_pages_one_primary_per_user ON pages(user_id) WHERE is_primary = true;
CREATE UNIQUE INDEX idx_pages_slug ON pages(slug) WHERE slug IS NOT NULL;
