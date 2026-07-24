CREATE TABLE kyc_verifications (
    id                    UUID PRIMARY KEY,
    user_id               UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status                VARCHAR(20) NOT NULL DEFAULT 'unverified'
                              CHECK (status IN ('unverified', 'pending', 'verified', 'rejected')),
    full_name_ktp         VARCHAR(255) NOT NULL DEFAULT '',
    bank_account_name     VARCHAR(255) NOT NULL DEFAULT '',
    domicile_address      TEXT NOT NULL DEFAULT '',
    business_description  TEXT NOT NULL DEFAULT '',
    promotion_channels    TEXT NOT NULL DEFAULT '',
    ktp_photo_key         VARCHAR(500) NOT NULL DEFAULT '',
    selfie_photo_key      VARCHAR(500) NOT NULL DEFAULT '',
    bank_proof_key        VARCHAR(500) NOT NULL DEFAULT '',
    rejection_reason      TEXT NOT NULL DEFAULT '',
    submitted_at          TIMESTAMPTZ,
    reviewed_at           TIMESTAMPTZ,
    reviewed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kyc_verifications_status ON kyc_verifications(status);

-- Snapshot status KYC pada SAAT pengajuan penarikan dibuat -- bukan dari
-- JOIN live ke kyc_verifications, supaya riwayat penarikan lama tidak
-- ikut berubah kalau status KYC kreator berubah belakangan. Dipakai admin
-- untuk memprioritaskan antrian proses manual (verified duluan), BUKAN
-- untuk memblokir penarikan sama sekali -- akun belum terverifikasi tetap
-- bisa menarik dana, hanya lebih lambat diproses.
ALTER TABLE payouts ADD COLUMN kyc_status_at_request VARCHAR(20) NOT NULL DEFAULT 'unverified';
