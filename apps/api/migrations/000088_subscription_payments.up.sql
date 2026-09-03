-- Riwayat tagihan langganan Premium.
--
-- KENAPA: benchmark Linktree "More > Billing" (permintaan pengguna, 3
-- September 2026): kreator perlu melihat tagihan yang sudah dibayar.
-- SEBELUMNYA hanya ada satu baris subscriptions (status + current_period_end)
-- -- webhook siklus Midtrans cuma meng-update status, pembayarannya sendiri
-- tidak pernah dicatat, jadi "kapan dan berapa saya ditagih" tidak bisa
-- dijawab.
--
-- Satu baris per transaksi: pendaftaran (enrollment, dibayar lewat Snap)
-- dan tiap siklus perpanjangan (cycle, ditagih otomatis ke kartu
-- tersimpan). order_id UNIK supaya webhook yang dikirim ulang Midtrans tidak
-- menggandakan baris (ON CONFLICT DO NOTHING di handler).
CREATE TABLE subscription_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            VARCHAR(12) NOT NULL CHECK (kind IN ('enrollment', 'cycle')),
    order_id        VARCHAR(100) NOT NULL,
    transaction_id  VARCHAR(100) NOT NULL DEFAULT '',
    amount_idr      BIGINT NOT NULL CHECK (amount_idr >= 0),
    status          VARCHAR(10) NOT NULL CHECK (status IN ('paid', 'failed')),
    paid_at         TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id)
);
CREATE INDEX idx_subscription_payments_user ON subscription_payments (user_id, created_at DESC);
