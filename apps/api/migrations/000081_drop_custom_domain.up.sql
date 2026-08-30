-- Hapus fitur domain kustom (permintaan langsung pengguna, 31 Agustus
-- 2026: "hilangkan semua yang ada custom domain nya karna project ini
-- tidak ada itu") -- fitur ini (migrasi 000019) tidak pernah punya wiring
-- infra produksi (Apache/reverse-proxy belum diarahkan menerima Host
-- header sembarang, belum ada SSL otomatis per domain kreator, lihat
-- catatan lama di apps/web/proxy.ts yang ikut dihapus di komit yang sama)
-- dan diputuskan bukan bagian dari produk ini. Migrasi maju baru (bukan
-- mengedit 000019 langsung) karena 000019 kemungkinan sudah diterapkan di
-- staging/produksi -- lebih aman menambah migrasi yang membalikkannya.
DROP INDEX idx_pages_custom_domain;
ALTER TABLE pages DROP COLUMN custom_domain_token;
ALTER TABLE pages DROP COLUMN custom_domain_verified;
ALTER TABLE pages DROP COLUMN custom_domain;
