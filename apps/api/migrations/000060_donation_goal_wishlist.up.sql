-- Gap #4 dari laporan benchmark kompetitif (permintaan langsung pengguna,
-- 9 Agustus 2026): blok Donasi Jeonme sebelumnya cuma toggle+judul+nominal
-- minimum -- dibanding Saweria/Trakteer (goal milestone dengan progress
-- bar, wishlist barang yang bisa "dibelikan" penonton) jauh lebih tipis,
-- padahal pasar streamer Indonesia sudah terbiasa dengan fitur itu di
-- kompetitor. Donasi Jeonme dimodelkan sebagai SATU baris products per
-- kreator (is_donation=true, lihat donation.go) -- goal jadi kolom
-- tambahan di baris yang sama, bukan tabel terpisah (konsisten dengan pola
-- yang sudah ada).
--
-- donation_goal_started_at SENGAJA ada (bukan cuma goal_amount_idr) --
-- tanpa ini, mengganti/reset target akan ikut menghitung donasi LAMA dari
-- goal sebelumnya sebagai progress goal BARU (SUM semua order paid produk
-- donasi ini, tidak dibatasi rentang waktu). Diisi ulang setiap kali goal
-- dibuat/diubah lewat DonationHandler.Upsert.
ALTER TABLE products ADD COLUMN donation_goal_title VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN donation_goal_amount_idr BIGINT NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN donation_goal_started_at TIMESTAMPTZ;

-- Wishlist -- daftar barang/keinginan yang bisa "diwujudkan" pendukung.
-- raised_idr dikreditkan SINKRON di dalam transaksi webhook yang sama
-- dengan ledger kreator (lihat creditDonationWishlistItem di donation.go,
-- dipanggil dari CheckoutHandler.Webhook persis seperti awardLoyaltyPoints)
-- -- bukan dihitung ulang dari SUM(orders) tiap request, supaya baca
-- publik cepat tanpa agregasi.
CREATE TABLE donation_wishlist_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(200) NOT NULL,
    price_idr  BIGINT NOT NULL DEFAULT 0,
    link       VARCHAR(500) NOT NULL DEFAULT '',
    raised_idr BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_donation_wishlist_items_user_id ON donation_wishlist_items(user_id, created_at);

-- Penanda item wishlist mana yang didukung pendonor tertentu -- opsional
-- (donasi umum tanpa memilih item TETAP boleh, kolom ini NULL).
-- ON DELETE SET NULL (bukan CASCADE) -- riwayat order pembeli tidak boleh
-- ikut hilang cuma karena kreator menghapus satu item wishlist lama.
ALTER TABLE orders ADD COLUMN donation_wishlist_item_id UUID REFERENCES donation_wishlist_items(id) ON DELETE SET NULL;
