-- Turunkan google_id dulu (drop) sebelum mengembalikan NOT NULL ke
-- password_hash -- akun Google-only (password_hash NULL) HARUS diisi
-- placeholder dulu supaya constraint NOT NULL tidak gagal dipasang balik
-- kalau migrasi ini di-rollback saat akun seperti itu sudah ada.
UPDATE users SET password_hash = '' WHERE password_hash IS NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE users DROP COLUMN google_id;
