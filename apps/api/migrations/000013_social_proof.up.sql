CREATE TABLE social_proof_settings (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    is_active            BOOLEAN NOT NULL DEFAULT false,
    show_on_product_page BOOLEAN NOT NULL DEFAULT true,
    show_on_checkout     BOOLEAN NOT NULL DEFAULT true,
    display_seconds      INTEGER NOT NULL DEFAULT 5 CHECK (display_seconds IN (5, 10, 15)),
    interval_seconds     INTEGER NOT NULL DEFAULT 15 CHECK (interval_seconds IN (10, 15, 30, 45, 60))
);
