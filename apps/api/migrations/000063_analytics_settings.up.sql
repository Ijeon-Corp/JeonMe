-- Modul Analitik Pihak Ketiga (permintaan langsung pengguna, 12 Agustus
-- 2026, referensi tangkapan layar panel "Analytics" Linktree): Facebook
-- Pixel + Conversions API, Google Analytics (GA4), dan toggle parameter
-- UTM otomatis di tautan keluar.
--
-- Tabel TERPISAH dikunci per user_id (bukan kolom di `pages`) -- pola
-- SAMA PERSIS dengan social_proof_settings/lead_capture_settings/
-- loyalty_settings (migrasi 000013 dkk): ini pengaturan LINTAS SEMUA
-- halaman satu akun (satu Pixel bisnis per kreator), bukan per halaman,
-- konsisten dengan aturan proyek "monetisasi dibagi lintas semua
-- halaman milik satu akun, per user_id bukan per page_id".
--
-- fb_access_token_encrypted TEXT NULL, dienkripsi AES-256-GCM (lihat
-- internal/crypto, pola sama persis dengan payout_methods.
-- account_number_encrypted, migrasi 000039) -- token Conversions API
-- adalah SECRET sungguhan (dipakai backend memanggil Graph API atas
-- nama akun Facebook Business kreator), TIDAK BOLEH pernah balik ke
-- klien dalam bentuk utuh, beda dari fb_pixel_id/ga_measurement_id yang
-- memang publik (dikirim ke browser pengunjung untuk menjalankan skrip
-- Pixel/gtag.js).
CREATE TABLE analytics_settings (
    user_id                   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    fb_pixel_id               VARCHAR(64) NOT NULL DEFAULT '',
    fb_access_token_encrypted TEXT,
    ga_measurement_id         VARCHAR(32) NOT NULL DEFAULT '',
    utm_enabled               BOOLEAN NOT NULL DEFAULT false
);
