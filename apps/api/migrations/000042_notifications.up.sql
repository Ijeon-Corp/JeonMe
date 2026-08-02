-- Pusat notifikasi dalam-app (ikon lonceng di top bar dashboard, permintaan
-- langsung pengguna berdasar tangkapan layar top bar Linktree). Sengaja
-- SATU tabel generik (type + title + body + link_url) bukan tabel per jenis
-- kejadian -- pola sama seperti audit_log yang sudah ada, supaya menambah
-- pemicu notifikasi baru di masa depan (payout selesai, KYC disetujui, dst)
-- tidak perlu migrasi skema baru, cukup INSERT baris dengan type baru.
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(30) NOT NULL,
    title      VARCHAR(200) NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    link_url   TEXT,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id_created_at ON notifications(user_id, created_at DESC);

-- Jalur cepat hitung badge "belum dibaca" tanpa scan seluruh riwayat per user.
CREATE INDEX idx_notifications_user_id_unread ON notifications(user_id) WHERE read_at IS NULL;
