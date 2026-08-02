-- Langganan Premium (permintaan langsung pengguna, "Custom Background By
-- User Premium" + watermark gratis/berbayar): satu baris per SIKLUS
-- langganan (bukan riwayat penuh transaksi -- itu sudah ada di tabel
-- `payments`/`orders` yang dipakai lagi untuk pembayaran pendaftaran
-- pertama, lihat kolom enrollment_order_id).
--
-- status:
--   pending_card -- baris dibuat, menunggu pembayaran pendaftaran pertama
--                   (Snap dengan kartu tersimpan/save_card) selesai.
--   active       -- kartu tersimpan berhasil, langganan Midtrans aktif,
--                   ditagih otomatis tiap siklus oleh Midtrans sendiri.
--   past_due     -- penagihan siklus gagal setelah retry Midtrans habis
--                   (lihat internal/midtrans Subscription notification).
--   canceled     -- dibatalkan kreator (Midtrans subscription di-disable),
--                   akses premium TETAP berlaku sampai current_period_end
--                   (masa yang sudah dibayar tidak hilang begitu saja).
--
-- Hanya SATU baris pending_card/active/past_due aktif per user -- kalau
-- kreator berhenti lalu berlangganan lagi nanti, baris lama tetap ada
-- (status canceled) sebagai riwayat, baris baru dibuat.
CREATE TABLE subscriptions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan                     VARCHAR(10) NOT NULL CHECK (plan IN ('monthly', 'yearly')),
    amount_idr               BIGINT NOT NULL,
    status                   VARCHAR(20) NOT NULL DEFAULT 'pending_card'
        CHECK (status IN ('pending_card', 'active', 'past_due', 'canceled')),
    enrollment_order_id      VARCHAR(100) NOT NULL,
    midtrans_subscription_id VARCHAR(100),
    current_period_end      TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    canceled_at              TIMESTAMPTZ
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);

-- Jalur cepat "apakah user ini premium sekarang" (GetMyPage dkk) +
-- menegakkan aturan satu langganan hidup per user sekaligus.
CREATE UNIQUE INDEX idx_subscriptions_one_live_per_user
    ON subscriptions(user_id) WHERE status IN ('pending_card', 'active', 'past_due');

CREATE INDEX idx_subscriptions_midtrans_id ON subscriptions(midtrans_subscription_id)
    WHERE midtrans_subscription_id IS NOT NULL;
