-- Hapus fitur Booking Konsultasi.
--
-- KENAPA: permintaan langsung pengguna, 3 September 2026 -- "hapus menu
-- consultation booking beserta fungsi dll". Dikonfirmasi ke pengguna dulu
-- (tidak ada kreator yang diketahui memakai produk Booking Konsultasi di
-- staging/produksi) sebelum menjalankan drop yang tidak bisa dibatalkan ini.
--
-- ledger_source_for_product() dibuat migrasi 000082 dan mereferensikan
-- kolom products.is_booking langsung di badan fungsi SQL -- HARUS diganti
-- lebih dulu di migrasi yang sama sebelum kolomnya di-drop, kalau tidak
-- fungsi ini gagal setiap kali dipanggil checkout.go setelah kolomnya
-- hilang. 'booking' SENGAJA dipertahankan di CHECK constraint
-- ledger_entries.source (bukan ditarik) -- itu accepted-values utk baris
-- LAMA yang sudah tercatat dengan source itu; entri ledger finansial tidak
-- boleh sampai melanggar constraint-nya sendiri gara-gara fitur sumbernya
-- kemudian dihapus. Yang berubah cuma fungsi ini TIDAK PERNAH lagi
-- MENGHASILKAN 'booking' untuk baris baru, karena tidak mungkin lagi ada
-- produk is_booking=true yang baru dibuat.
CREATE OR REPLACE FUNCTION ledger_source_for_product(pid UUID) RETURNS VARCHAR(30) AS $$
    SELECT CASE
        WHEN p.is_donation THEN 'donation'
        WHEN p.is_event    THEN 'event'
        WHEN p.is_course   THEN 'course'
        WHEN p.is_bundle   THEN 'bundle'
        ELSE 'product'
    END
    FROM products p WHERE p.id = pid
$$ LANGUAGE sql STABLE;

DROP TABLE IF EXISTS booking_slots;
ALTER TABLE products
    DROP COLUMN IF EXISTS is_booking,
    DROP COLUMN IF EXISTS booking_duration_minutes;
