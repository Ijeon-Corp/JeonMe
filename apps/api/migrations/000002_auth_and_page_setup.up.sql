-- Sprint 1: kelengkapan auth (reset password, verifikasi email) dan
-- jaminan setiap user punya baris pages (dibutuhkan CRUD tautan REQ-F-202/203).

ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;

CREATE TABLE password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

CREATE TABLE email_verification_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);

-- Backfill: user lama (kalau ada) yang belum punya baris pages.
INSERT INTO pages (user_id)
SELECT u.id FROM users u
WHERE NOT EXISTS (SELECT 1 FROM pages p WHERE p.user_id = u.id);
