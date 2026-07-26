-- Permintaan langsung pengguna: unggah gambar kustom per tautan (menggantikan
-- ikon platform yang terdeteksi otomatis dari URL, lihat lib/link-icons.ts di
-- sisi klien) -- kosong berarti tetap pakai deteksi otomatis seperti sebelumnya.
ALTER TABLE links ADD COLUMN custom_icon_url VARCHAR(500) NOT NULL DEFAULT '';
