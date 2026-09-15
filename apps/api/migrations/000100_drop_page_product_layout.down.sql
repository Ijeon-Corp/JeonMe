-- Rollback: kembalikan kolom persis seperti definisi asli (migrasi
-- 000072) -- data lama TIDAK bisa dipulihkan (DROP COLUMN destruktif),
-- baris yang ada akan kembali ke DEFAULT 'grid', bukan nilai historisnya.
ALTER TABLE pages ADD COLUMN product_layout VARCHAR(10) NOT NULL DEFAULT 'grid';
