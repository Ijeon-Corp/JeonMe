-- Modul Toko (Fase C): 4 metode penyerahan produk digital ala referensi.
-- download_link (SUDAH ADA, file_key + presigned URL, TIDAK berubah sama
-- sekali -- default untuk semua produk lama) ditambah 3 metode baru:
--   manual       -- kreator menandai pesanan "selesai diproses" sendiri
--                   (dikirim lewat kanal lain, mis. WhatsApp/email manual).
--   random_code  -- kreator unggah daftar kode unik (lisensi/voucher),
--                   satu kode DIKLAIM ATOMIK per pesanan lunas.
--   webhook      -- server kreator sendiri diberi tahu lewat POST saat
--                   pesanan lunas (integrasi otomatis, mis. auto-aktivasi
--                   akun/membership).
ALTER TABLE products ADD COLUMN delivery_method VARCHAR(20) NOT NULL DEFAULT 'download_link'
    CHECK (delivery_method IN ('download_link', 'manual', 'random_code', 'webhook'));
ALTER TABLE products ADD COLUMN webhook_url TEXT NOT NULL DEFAULT '';
-- webhook_secret -- dibuat sekali (acak, hex) begitu kreator PERTAMA kali
-- memilih metode "webhook", dipakai menandatangani (HMAC-SHA256) tiap POST
-- ke webhook_url mereka supaya server kreator bisa memverifikasi
-- pengirimnya benar-benar Jeonme (pola sama seperti Midtrans
-- signature_key, tapi arah terbalik -- di sini KITA pengirimnya).
ALTER TABLE products ADD COLUMN webhook_secret VARCHAR(64) NOT NULL DEFAULT '';

-- manual: waktu kreator menandai pesanan selesai diproses.
ALTER TABLE orders ADD COLUMN fulfilled_at TIMESTAMPTZ;

-- random_code: satu baris = satu kode. claimed_by_order_id NULL berarti
-- "stok" tersedia -- COUNT(*) WHERE claimed_by_order_id IS NULL adalah
-- angka stok yang JUJUR (bukan rekaan), beda dari produk file biasa yang
-- memang tidak terbatas.
CREATE TABLE product_codes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    code                TEXT NOT NULL,
    claimed_by_order_id UUID UNIQUE REFERENCES orders(id),
    claimed_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, code)
);
CREATE INDEX idx_product_codes_unclaimed ON product_codes(product_id) WHERE claimed_by_order_id IS NULL;

-- webhook: log pengiriman -- ditampilkan di tab "Webhook Events" (Fase E4).
-- "Trust the API, not the payload" TIDAK relevan di sini (ini KITA yang
-- mengirim, bukan menerima) -- tapi log percobaan tetap dicatat supaya
-- kreator bisa lihat kenapa integrasinya gagal (URL salah, server mati, dst).
CREATE TABLE webhook_deliveries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    url            TEXT NOT NULL,
    status         VARCHAR(20) NOT NULL, -- success | failed
    response_code  INT,
    error_message  TEXT NOT NULL DEFAULT '',
    attempt        INT NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_user_id ON webhook_deliveries(user_id, created_at DESC);
