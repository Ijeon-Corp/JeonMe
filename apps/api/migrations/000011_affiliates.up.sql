CREATE TABLE affiliates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    affiliate_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referral_code     VARCHAR(20) NOT NULL UNIQUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (creator_user_id, affiliate_user_id)
);

CREATE INDEX idx_affiliates_affiliate_user_id ON affiliates(affiliate_user_id);

CREATE TABLE affiliate_commissions (
    affiliate_id       UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    product_id         UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    commission_percent NUMERIC(5,2) NOT NULL CHECK (commission_percent > 0 AND commission_percent <= 100),
    PRIMARY KEY (affiliate_id, product_id)
);

-- ON DELETE SET NULL -- mencabut afiliator (lihat AffiliateHandler.Revoke)
-- tidak boleh gagal atau menghapus histori order lama yang pernah memakai
-- referral code-nya; affiliate_commission_idr di order tetap tersimpan apa
-- adanya (snapshot angka, bukan referensi hidup) walau affiliate_id-nya NULL.
ALTER TABLE orders ADD COLUMN affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN affiliate_commission_idr BIGINT NOT NULL DEFAULT 0;
