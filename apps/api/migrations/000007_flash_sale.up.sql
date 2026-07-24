-- Sprint 7: Flash Sale / Diskon Waktu Terbatas per Produk (No.68, hasil
-- analisis kompetitor Lynk.id+Linktree).

-- Ketiga kolom selalu diisi/dikosongkan bersamaan -- lihat validasi di
-- ProductHandler.Update. "Otomatis kembali ke harga normal" dihitung live
-- dari now() di setiap query yang butuh harga efektif (List/GetPublicPage/
-- checkout), BUKAN lewat job terjadwal -- pola yang sama seperti holding
-- period saldo (internal/handlers/balance.go).
ALTER TABLE products ADD COLUMN flash_sale_price_idr BIGINT;
ALTER TABLE products ADD COLUMN flash_sale_starts_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN flash_sale_ends_at TIMESTAMPTZ;
