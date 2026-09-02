-- Sumber pendapatan per entri ledger.
--
-- KENAPA: benchmark Linktree "Earn > Earnings" (permintaan pengguna, 3
-- September 2026) menuntut laporan pendapatan PER SUMBER -- produk digital,
-- booking, donasi, event, kursus, bundel, komisi afiliasi, split kolaborator.
-- SEBELUMNYA ledger_entries.type cuma credit/debit/hold/release/refund_debit:
-- saldo bisa dihitung, tapi "uang ini dari mana" tidak bisa dijawab tanpa
-- join berlapis ke orders->products->flag is_* yang TIDAK konsisten antar
-- handler (komisi afiliasi & split kolaborator sama-sama 'credit' dengan
-- order_id yang sama, cuma beda user_id).
--
-- Klasifikasi dipusatkan di SATU fungsi SQL (ledger_source_for_product)
-- yang dipakai oleh backfill di bawah DAN oleh INSERT di handler checkout,
-- supaya tidak ada dua definisi yang bisa saling menyimpang.
CREATE OR REPLACE FUNCTION ledger_source_for_product(pid UUID) RETURNS VARCHAR(30) AS $$
    SELECT CASE
        WHEN p.is_donation THEN 'donation'
        WHEN p.is_booking  THEN 'booking'
        WHEN p.is_event    THEN 'event'
        WHEN p.is_course   THEN 'course'
        WHEN p.is_bundle   THEN 'bundle'
        ELSE 'product'
    END
    FROM products p WHERE p.id = pid
$$ LANGUAGE sql STABLE;

ALTER TABLE ledger_entries
    ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'other'
    CHECK (source IN (
        'product', 'bundle', 'course', 'booking', 'event', 'donation',
        'affiliate_commission', 'collaborator_split',
        'refund', 'payout', 'payout_reversal', 'other'
    ));

-- Backfill entri lama, urutan penting: yang paling spesifik dulu.
-- 1) Kredit dengan order_id yang user-nya BUKAN pemilik produk = komisi
--    afiliasi (kalau cocok dengan afiliator di order) atau split kolaborator.
UPDATE ledger_entries le
SET source = 'affiliate_commission'
FROM orders o
JOIN affiliates a ON a.id = o.affiliate_id
WHERE le.order_id = o.id AND le.type = 'credit' AND le.user_id = a.affiliate_user_id;

UPDATE ledger_entries le
SET source = 'collaborator_split'
FROM orders o
JOIN products p ON p.id = o.product_id
WHERE le.order_id = o.id AND le.type = 'credit' AND le.user_id <> p.user_id AND le.source = 'other';

-- 2) Kredit pemilik produk: jenis dari flag produk.
UPDATE ledger_entries le
SET source = ledger_source_for_product(o.product_id)
FROM orders o
WHERE le.order_id = o.id AND le.type = 'credit' AND le.source = 'other';

-- 3) Pembalik refund, penarikan, dan pengembalian saldo saat payout gagal.
UPDATE ledger_entries SET source = 'refund' WHERE type = 'refund_debit' AND source = 'other';
UPDATE ledger_entries SET source = 'payout' WHERE type = 'debit' AND order_id IS NULL AND source = 'other';
UPDATE ledger_entries SET source = 'payout_reversal' WHERE type = 'credit' AND order_id IS NULL AND source = 'other';

CREATE INDEX IF NOT EXISTS idx_ledger_entries_user_source_created
    ON ledger_entries (user_id, source, created_at DESC);
