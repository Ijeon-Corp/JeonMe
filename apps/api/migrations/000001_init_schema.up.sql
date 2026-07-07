-- Skema awal Jeonme, mengikuti Bagian 4 Technical-Design-Document-Jeonme.docx
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username      VARCHAR(30) UNIQUE NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'creator',
    kyc_status    VARCHAR(20) NOT NULL DEFAULT 'unverified',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme        VARCHAR(50) NOT NULL DEFAULT 'default',
    bio          VARCHAR(160) DEFAULT '',
    avatar_url   TEXT DEFAULT '',
    is_published BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(user_id)
);

CREATE TABLE links (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id   UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    title     VARCHAR(100) NOT NULL,
    url       TEXT NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    description     TEXT DEFAULT '',
    price_idr       BIGINT NOT NULL CHECK (price_idr >= 0),
    file_key        TEXT DEFAULT '',
    cover_image_url TEXT DEFAULT '',
    is_active       BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE orders (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       UUID NOT NULL REFERENCES products(id),
    buyer_email      VARCHAR(255) NOT NULL,
    buyer_contact    VARCHAR(50) DEFAULT '',
    amount_idr       BIGINT NOT NULL,
    platform_fee_idr BIGINT NOT NULL DEFAULT 0,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    psp_reference    VARCHAR(100) DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id),
    psp                 VARCHAR(20) NOT NULL,
    method              VARCHAR(20) NOT NULL,
    psp_transaction_id  VARCHAR(100) DEFAULT '',
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    raw_webhook_payload JSONB,
    verified_at         TIMESTAMPTZ
);

-- Append-only: baris di sini TIDAK BOLEH di-UPDATE/DELETE oleh aplikasi.
-- Saldo selalu direkonstruksi dari SUM(amount_idr) per user_id.
CREATE TABLE ledger_entries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id),
    order_id     UUID REFERENCES orders(id),
    type         VARCHAR(20) NOT NULL, -- credit | debit | hold | release
    amount_idr   BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payouts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    amount_idr          BIGINT NOT NULL,
    destination_account VARCHAR(100) NOT NULL,
    psp_disbursement_id VARCHAR(100) DEFAULT '',
    status              VARCHAR(20) NOT NULL DEFAULT 'requested',
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

CREATE TABLE analytics_events (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id    UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL, -- click | view
    link_id    UUID REFERENCES links(id),
    referrer   TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_links_page_id ON links(page_id);
CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_orders_product_id ON orders(product_id);
CREATE INDEX idx_ledger_entries_user_id ON ledger_entries(user_id);
CREATE INDEX idx_analytics_events_page_id_created_at ON analytics_events(page_id, created_at);
