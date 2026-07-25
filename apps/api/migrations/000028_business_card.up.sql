-- No.95 (Sprint 13): kartu kontak digital -- versi tanpa Apple/Google
-- Wallet (butuh kredensial developer yang belum ada). Sebagai gantinya,
-- pengunjung mengunduh file vCard (.vcf) standar yang didukung native oleh
-- Kontak iOS/Android tanpa integrasi pihak ketiga apa pun. Pertukaran DUA
-- ARAH ("Let visitors share their details back" di Linktree) memakai
-- kembali tabel subscribers (No.73) sebagai satu Manajer Audiens terpadu,
-- bukan tabel kontak terpisah.
CREATE TABLE business_cards (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    is_active            BOOLEAN NOT NULL DEFAULT false,
    full_name            VARCHAR(200) NOT NULL DEFAULT '',
    job_title            VARCHAR(200) NOT NULL DEFAULT '',
    company              VARCHAR(200) NOT NULL DEFAULT '',
    phone                VARCHAR(30) NOT NULL DEFAULT '',
    whatsapp_number      VARCHAR(30) NOT NULL DEFAULT '',
    email                VARCHAR(255) NOT NULL DEFAULT '',
    website              VARCHAR(500) NOT NULL DEFAULT '',
    collect_contact_back BOOLEAN NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- subscribers (No.73) sebelumnya cuma menampung dua sumber implisit
-- (form lead capture & pembeli lunas) yang labelnya di-hardcode di kode
-- Go. Sekarang ditambah sumber ketiga (kartu kontak) + field nama, jadi
-- kolom source dibuat eksplisit supaya GetAudience tidak perlu menebak.
ALTER TABLE subscribers ADD COLUMN name VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE subscribers ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'lead_capture';
