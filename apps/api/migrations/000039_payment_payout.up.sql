-- Modul Settings §3 (Payment / Payout). Nomor rekening/e-wallet dienkripsi
-- at rest (AES-256-GCM, lihat internal/crypto) -- account_number_encrypted
-- BUKAN plaintext seperti payouts.destination_account/kyc_verifications.
-- bank_account_name yang sudah ada (di luar lingkup revisi fase ini).
-- Rekening baru WAJIB verified=true (kode OTP 6 digit, lihat
-- PayoutMethodHandler -- micro-deposit sungguhan butuh integrasi bank yang
-- belum ada) sebelum bisa dijadikan is_primary=true.
CREATE TABLE payout_methods (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                     VARCHAR(20) NOT NULL CHECK (type IN ('bank_transfer', 'ewallet')),
    provider                 VARCHAR(30) NOT NULL,
    account_number_encrypted TEXT NOT NULL,
    account_name             VARCHAR(100) NOT NULL,
    is_primary               BOOLEAN NOT NULL DEFAULT false,
    verified                 BOOLEAN NOT NULL DEFAULT false,
    verification_code_hash   TEXT,
    verification_expires_at  TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payout_methods_user_id ON payout_methods(user_id);

-- Modul Settings §3: auto-withdraw terjadwal. Satu baris per user (bukan
-- riwayat) -- preferensi TERKINI, bukan log perubahan.
CREATE TABLE payout_schedule (
    user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    frequency         VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (frequency IN ('manual', 'weekly', 'monthly')),
    min_threshold_idr BIGINT NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payout_history (spec) SUDAH terpenuhi oleh tabel payouts yang ada
-- (amount_idr, fee_idr, status, requested_at, completed_at) -- lihat
-- BalanceHandler.ListPayouts. Kolom tambahan di bawah supaya tiap baris
-- tahu metode mana yang dipakai & apakah dipicu manual atau auto-withdraw.
ALTER TABLE payouts ADD COLUMN payout_method_id UUID REFERENCES payout_methods(id) ON DELETE SET NULL;
ALTER TABLE payouts ADD COLUMN triggered_by VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual', 'auto'));

-- Split payout (diferensiasi dari Lynk.id, Modul Settings §3): opsional per
-- produk, array objek [{"user_id":"...","amount_idr":0}] -- SENGAJA jumlah
-- rupiah absolut per kolaborator (bukan basis poin/persen) supaya webhook
-- checkout tidak perlu menghitung ulang apa pun, cukup baca angka dan
-- kredit -- pola sama dengan orders.affiliate_commission_idr (angka
-- absolut, bukan formula) untuk alasan yang sama: sesederhana & seaman
-- mungkin di jalur pembayaran yang paling kritis.
ALTER TABLE products ADD COLUMN collaborator_splits JSONB NOT NULL DEFAULT '[]';

-- Snapshot split PADA SAAT checkout (pola sama persis dengan
-- orders.affiliate_commission_idr) -- perubahan split di produk sesudahnya
-- TIDAK mempengaruhi order yang sudah dibuat.
ALTER TABLE orders ADD COLUMN collaborator_splits_snapshot JSONB NOT NULL DEFAULT '[]';
