-- Modul Toko: jenis produk ketiga "external_link" -- permintaan langsung
-- pengguna, 17 Agustus 2026: "saya mau untuk produk bisa untuk affiliate
-- juga ke shopee dll". BEDA dari fitur "Afiliasi" yang sudah ada (migrasi
-- 000011, program referral Jeonme-internal antar kreator&afiliasi lewat
-- checkout Jeonme sendiri) -- ini murni "produk ini sebenarnya link keluar
-- ke listing di marketplace lain (Shopee/Tokopedia/dll, boleh link
-- affiliate milik kreator sendiri)", tombol "Beli" membuka external_url
-- di tab baru, TIDAK PERNAH lewat checkout Jeonme (lihat guard di
-- checkout.go). Tidak butuh file (seperti payment_link) -- aktif langsung
-- begitu dibuat (lihat product.go Create).
ALTER TABLE products ADD COLUMN external_url TEXT NOT NULL DEFAULT '';

-- Constraint product_kind sebelumnya dibuat inline tanpa nama eksplisit
-- (migrasi 000048) -- Postgres otomatis menamainya "products_product_kind_check".
ALTER TABLE products DROP CONSTRAINT products_product_kind_check;
ALTER TABLE products ADD CONSTRAINT products_product_kind_check
    CHECK (product_kind IN ('digital', 'payment_link', 'external_link'));
