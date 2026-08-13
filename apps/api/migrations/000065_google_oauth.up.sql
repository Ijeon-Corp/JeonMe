-- Kolom google_id + password_hash nullable -- permintaan langsung
-- pengguna, 13 Agustus 2026: "tambahkan di login dan register login via
-- google" (alur Authorization Code penuh, lihat internal/googleoauth &
-- AuthHandler.GoogleLogin). password_hash SEBELUMNYA NOT NULL
-- (000001_init_schema) -- akun yang HANYA pernah daftar/masuk lewat Google
-- tidak pernah membuat password sendiri, jadi kolom itu harus boleh NULL.
-- AuthHandler.Login menangani NULL ini secara eksplisit (pesan "akun ini
-- terdaftar lewat Google"), bukan cuma dibiarkan gagal scan diam-diam.
--
-- google_id menyimpan klaim "sub" dari ID token Google (pengenal akun
-- Google yang stabil & unik selamanya, BUKAN email -- email pengguna
-- Google bisa diganti kapan saja, sub tidak pernah berubah selama akun
-- Google itu masih ada). UNIQUE (bukan composite dengan apa pun) karena
-- satu akun Google cuma boleh tertaut ke SATU akun Jeonme.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
