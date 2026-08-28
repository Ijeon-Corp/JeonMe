-- Permintaan langsung pengguna, 28 Agustus 2026: URL Halaman Tambahan
-- berubah dari jeonme.com/p/{slug} (slug UNIK GLOBAL lintas semua akun --
-- lihat idx_pages_slug di 000029_multi_page.up.sql) jadi
-- jeonme.com/{username}/{slug} (slug dinamespace di bawah username).
-- Begitu slug sudah bernaung di bawah username di URL, tidak ada alasan
-- lagi dua akun BERBEDA dilarang pakai slug yang sama ("promo" milik akun
-- A vs "promo" milik akun B tidak akan pernah tabrakan lagi karena
-- diakses lewat /a/promo vs /b/promo) -- unique index diganti dari
-- GLOBAL (slug saja) jadi PER-USER (user_id, slug).
DROP INDEX idx_pages_slug;
CREATE UNIQUE INDEX idx_pages_user_slug ON pages(user_id, slug) WHERE slug IS NOT NULL;
