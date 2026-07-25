CREATE TABLE loyalty_settings (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    is_active        BOOLEAN NOT NULL DEFAULT false,
    point_type       VARCHAR(20) NOT NULL DEFAULT 'nominal' CHECK (point_type IN ('percentage', 'nominal')),
    points_rate      NUMERIC NOT NULL DEFAULT 1,
    points_limit     INT,
    min_purchase_idr BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE loyalty_rewards (
    id              UUID PRIMARY KEY,
    creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    points_needed   INT NOT NULL,
    discount_type   VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'nominal')),
    discount_value  BIGINT NOT NULL,
    valid_until     TIMESTAMPTZ,
    is_published    BOOLEAN NOT NULL DEFAULT false,
    redeemed_count  INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE loyalty_points_ledger (
    id              UUID PRIMARY KEY,
    creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    buyer_email     VARCHAR(255) NOT NULL,
    points          INT NOT NULL,
    reason          VARCHAR(20) NOT NULL CHECK (reason IN ('earned', 'redeemed')),
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    reward_id       UUID REFERENCES loyalty_rewards(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_points_ledger_creator_buyer ON loyalty_points_ledger(creator_user_id, buyer_email);
CREATE INDEX idx_loyalty_rewards_creator_user_id ON loyalty_rewards(creator_user_id);
