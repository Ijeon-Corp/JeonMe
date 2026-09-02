-- Marketplace afiliasi PUBLIK.
--
-- KENAPA: benchmark Linktree "Earn > Affiliate Products" (permintaan
-- pengguna, 3 September 2026): kreator bisa MENEMUKAN produk kreator lain
-- untuk dipromosikan dan mendapat komisi. SEBELUMNYA program afiliasi
-- Jeonme hanya mode privat -- pemilik produk mengundang afiliator lewat
-- email satu-satu (lihat catatan kepala handlers/affiliate.go yang
-- mencatat marketplace publik sebagai backlog "kalau tervalidasi").
--
-- Desain: dua kolom di products, BUKAN tabel program baru. Yang dibuka ke
-- publik memang produk (dengan satu komisi standar), dan alur join
-- memakai ulang tabel affiliates + affiliate_commissions yang sudah ada --
-- jadi checkout, resolveAffiliate(), dan ledger komisi TIDAK perlu diubah
-- sama sekali: afiliator marketplace = afiliator biasa yang mendaftar
-- sendiri, bukan diundang.
ALTER TABLE products
    ADD COLUMN affiliate_public BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN affiliate_public_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (affiliate_public_commission_percent >= 0 AND affiliate_public_commission_percent <= 100);

-- Partial index: daftar marketplace hanya memindai produk yang dibuka.
CREATE INDEX idx_products_affiliate_public ON products (affiliate_public) WHERE affiliate_public = true;
