-- Sprint 3: checkout & webhook PSP (REQ-F-401..406).
-- Constraint idempotensi supaya webhook yang di-retry PSP (mis. PSP
-- mengirim ulang kalau tidak dapat balasan 2xx tepat waktu) tidak diproses
-- dua kali. Awalnya ditulis untuk Xendit, sekarang dipakai Midtrans --
-- constraint di level DB ini tidak berubah, hanya PSP-nya yang diganti.

-- order_id yang kita kirim ke PSP saat membuat transaksi -- harus unik per
-- order supaya tidak ada ambiguitas saat webhook masuk.
CREATE UNIQUE INDEX idx_orders_psp_reference ON orders(psp_reference) WHERE psp_reference != '';

-- psp_transaction_id (transaction_id dari PSP) -- satu id transaksi PSP
-- hanya boleh menghasilkan tepat satu baris payments, walau webhook-nya
-- diterima berkali-kali (INSERT ... ON CONFLICT DO NOTHING bergantung pada
-- index ini).
CREATE UNIQUE INDEX idx_payments_psp_transaction_id ON payments(psp_transaction_id) WHERE psp_transaction_id != '';

CREATE INDEX idx_orders_status ON orders(status);
