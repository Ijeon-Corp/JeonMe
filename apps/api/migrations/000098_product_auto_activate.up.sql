-- Permintaan langsung pengguna, 13 September 2026: "hilangkan status on
-- atau off untuk menampilkan di pratinjau nya, karna saya mau ini menu
-- untuk menyimpan data produk yang nantinya bisa di fetch menggunakan
-- blok product" -- toggle "Aktifkan" manual utk produk digital (dashboard
-- Produk) DIHAPUS dari UI; product.go UploadFile sekarang otomatis
-- mengaktifkan produk begitu file diunggah (asalkan sampul sudah ada,
-- SELALU wajib diisi sejak create). Pola SAMA PERSIS
-- 000074_auto_publish_pages.up.sql: hapus toggle manual, backfill data
-- lama supaya tidak ada yang terkunci tanpa jalan keluar begitu
-- toggle-nya hilang dari UI.
--
-- Cuma product_kind='digital' -- payment_link/external_link SUDAH SELALU
-- auto-aktif sejak dibuat (CreateProductForm.tsx memanggil
-- updateProduct({is_active:true}) langsung setelah unggah sampul, tidak
-- pernah lewat toggle manual), jadi seharusnya sudah is_active=true;
-- backfill di sini murni jaring pengaman utk kedua jenis itu juga kalau
-- ada baris lama yang entah kenapa lolos tanpa aktif (defense-in-depth,
-- bukan asumsi ada bug).
UPDATE products
SET is_active = true
WHERE is_active = false
  AND cover_image_url != ''
  AND (
    (product_kind = 'digital' AND file_key != '')
    OR product_kind IN ('payment_link', 'external_link')
  );
