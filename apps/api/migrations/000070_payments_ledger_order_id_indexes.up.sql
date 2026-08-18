-- Temuan audit performa 16 Agustus 2026 (report-audit-2026-08-16.html,
-- "Index hilang pada payments.order_id & ledger_entries.order_id"),
-- baru dieksekusi sekarang lewat analisa & optimasi menyeluruh 18 Agustus
-- 2026 -- rekomendasinya sudah tercatat sejak audit itu tapi belum pernah
-- benar-benar dibuatkan migrasinya.
--
-- Kedua kolom adalah FK ke orders(id) tapi TIDAK punya indeks sama sekali
-- (beda dengan idx_orders_product_id/idx_ledger_entries_user_id yang sudah
-- ada sejak migrasi awal) -- dipakai di jalur GetOrderDetail (checkout.go,
-- dibuka kreator setiap kali melihat detail satu transaksi) dan
-- RefundOrder (checkout.go, query pembalikan ledger credit saat refund).
-- Tanpa indeks, keduanya sequential scan seluruh tabel yang makin lambat
-- seiring volume transaksi bertambah. Biaya tulis (INSERT ke payments/
-- ledger_entries) minim terdampak -- order_id stabil, tidak pernah di-UPDATE
-- setelah baris dibuat.
CREATE INDEX idx_payments_order_id ON payments (order_id);
CREATE INDEX idx_ledger_entries_order_id ON ledger_entries (order_id);
