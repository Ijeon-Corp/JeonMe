-- Blok Subscribe v2: Telegram, lead magnet, voucher sambutan.
--
-- KENAPA: benchmark Linktree menu "Member" (permintaan pengguna, 3 September
-- 2026) -- Subscribe ("tambahkan WhatsApp, Telegram, dan Email sekaligus"),
-- Digital Download ("file diberikan setelah pengunjung mengisi data --
-- cocok untuk lead magnet & ebook"), dan Discount Code ("integrasikan dengan
-- voucher toko"). SEBELUMNYA blok pengumpulan hanya email/WA dan tidak
-- memberi apa pun setelah pengunjung mendaftar; tidak ada alur produk gratis
-- sama sekali (checkout tidak menangani harga 0), jadi lead magnet memang
-- belum bisa dibuat dengan fitur yang ada.
--
-- Desain: lead magnet MENUNJUK produk yang sudah ada (file-nya sudah
-- tersimpan di storage lewat alur upload produk yang ada), bukan upload
-- terpisah -- satu tempat kelola file, dan produk yang sama bisa tetap
-- dijual. Voucher sambutan menunjuk voucher toko yang sudah ada, supaya
-- batas pemakaian/kedaluwarsa/produk tetap satu sumber kebenaran.
-- ON DELETE SET NULL: menghapus produk/voucher tidak boleh mematikan blok
-- subscribe, cukup melepas hadiahnya.
ALTER TABLE lead_capture_settings
    ADD COLUMN collect_telegram   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN magnet_product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
    ADD COLUMN welcome_voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL;

ALTER TABLE subscribers ADD COLUMN telegram_username VARCHAR(64) NOT NULL DEFAULT '';
