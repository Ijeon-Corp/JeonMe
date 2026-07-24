-- Sprint 7: Bayar Seikhlasnya / Pay-What-You-Want dengan Harga Minimum
-- (No.69, hasil analisis kompetitor Lynk.id).

-- Sengaja tidak dikombinasikan dengan flash sale (No.68) pada produk yang
-- sama -- lihat validasi di ProductHandler.Update. Kalau pwyw_enabled,
-- pembeli tentukan sendiri harganya (>= pwyw_min_price_idr) saat checkout,
-- menggantikan (bukan menumpuk) harga efektif produk.
ALTER TABLE products ADD COLUMN pwyw_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN pwyw_min_price_idr BIGINT;
