CREATE TABLE lead_capture_settings (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    is_active        BOOLEAN NOT NULL DEFAULT false,
    title            VARCHAR(200) NOT NULL DEFAULT 'Dapatkan info terbaru dariku',
    collect_email    BOOLEAN NOT NULL DEFAULT true,
    collect_whatsapp BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE subscribers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL DEFAULT '',
    whatsapp_number VARCHAR(30) NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscribers_creator_user_id ON subscribers(creator_user_id);

-- Cegah duplikat kasar (pengunjung sama submit form dua kali) -- hanya
-- dedupe lewat email (identifier paling universal), bukan whatsapp_number
-- (banyak kreator collect_whatsapp=false, dan format nomor lebih rawan
-- variasi ketik daripada email).
CREATE UNIQUE INDEX idx_subscribers_dedup_email ON subscribers(creator_user_id, email) WHERE email <> '';
