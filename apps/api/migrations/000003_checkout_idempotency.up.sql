-- Sprint 3: checkout & webhook PSP (REQ-F-401..406).
-- Constraint idempotensi supaya webhook yang di-retry PSP (Xendit mengirim
-- ulang kalau tidak dapat balasan 2xx tepat waktu) tidak diproses dua kali.

-- external_id yang kita kirim ke Xendit saat membuat invoice -- harus unik
-- per order supaya tidak ada ambiguitas saat webhook masuk.
CREATE UNIQUE INDEX idx_orders_psp_reference ON orders(psp_reference) WHERE psp_reference != '';

-- psp_transaction_id (invoice id dari Xendit) -- satu id transaksi PSP hanya
-- boleh menghasilkan tepat satu baris payments, walau webhook-nya diterima
-- berkali-kali (INSERT ... ON CONFLICT DO NOTHING bergantung pada index ini).
CREATE UNIQUE INDEX idx_payments_psp_transaction_id ON payments(psp_transaction_id) WHERE psp_transaction_id != '';

CREATE INDEX idx_orders_status ON orders(status);
