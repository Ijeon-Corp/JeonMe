-- Modul Toko (Fase D): jenis produk "Payment Link" -- kumpulkan pembayaran
-- untuk jasa/konsultasi/apa pun TANPA file yang diserahkan (beda dari
-- donasi, No.71, yang selalu bayar-seikhlasnya tanpa batas/kedaluwarsa;
-- payment_link punya harga TETAP dan opsional batas jumlah pembayaran +
-- kedaluwarsa link, ala referensi).
--
-- Buyer custom fields dinamis (dari gambar referensi: Nama/Email/WhatsApp/
-- dropdown bisa ditambah bebas) SENGAJA TIDAK dikerjakan -- checkout tetap
-- pakai email+WhatsApp opsional yang SUDAH ada untuk semua produk, supaya
-- tidak perlu form-builder terpisah yang jauh lebih besar dari lingkup ini.
ALTER TABLE products ADD COLUMN product_kind VARCHAR(20) NOT NULL DEFAULT 'digital'
    CHECK (product_kind IN ('digital', 'payment_link'));
ALTER TABLE products ADD COLUMN success_message TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN payment_limit_count INT;
ALTER TABLE products ADD COLUMN link_expires_at TIMESTAMPTZ;
