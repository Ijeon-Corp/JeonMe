-- Modul Settings §5 (Security). two_factor_secret disimpan begitu /2fa/enable
-- dipanggil TAPI two_factor_enabled_at tetap NULL sampai /2fa/verify sukses --
-- membedakan "sedang setup" dari "sungguh aktif" (mencegah orang mengaktifkan
-- 2FA untuk akun sendiri padahal salah scan/salah masukkan kode, lalu terkunci).
-- Sesi (daftar device aktif) SENGAJA tidak dapat tabel Postgres sendiri --
-- dibangun di atas mekanisme Redis (denylist jti) yang sudah ada di
-- AuthHandler, bukan sistem paralel baru. Lihat security.go.
ALTER TABLE users ADD COLUMN two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN two_factor_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN two_factor_snoozed_until TIMESTAMPTZ;
