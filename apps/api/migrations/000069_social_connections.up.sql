-- Modul Koneksi Sosial -- permintaan langsung pengguna, 17 Agustus 2026:
-- "saya mau jeonme ini bisa connect ke akun kita contoh nya instagram
-- tiktok". Diriset lewat benchmark kompetitor (Linktree): "Connect
-- Instagram/TikTok" BUKAN sekadar tautan biasa (yang sudah ada, lihat
-- SOCIAL_PLATFORMS/link() di quick-setup-templates.ts) -- kreator
-- OTORISASI (OAuth) akunnya, lalu halaman publik menampilkan profil +
-- beberapa postingan/video TERBARU secara otomatis, bisa diputar/dilihat
-- tanpa keluar dari halaman Jeonme.
--
-- Token disimpan APA ADANYA (bukan terenkripsi) -- pola yang SAMA dengan
-- products.webhook_secret (migrasi 000047) yang sudah ada di kolom TEXT
-- polos, konsisten dengan tingkat proteksi data sensitif lain di skema
-- ini (perlindungan utamanya di akses DB tingkat infrastruktur, bukan
-- enkripsi kolom).
--
-- UNIQUE(user_id, platform) -- satu kreator maksimal SATU akun terhubung
-- per platform (menyambungkan ulang MENIMPA yang lama, bukan menumpuk).
CREATE TABLE social_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('instagram', 'tiktok')),
    external_user_id TEXT NOT NULL,
    external_username TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL DEFAULT '',
    token_expires_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, platform)
);

CREATE INDEX idx_social_connections_user_id ON social_connections (user_id);
