-- Metadata CRM ringan untuk kontak Audiens: tag + catatan.
--
-- KENAPA: benchmark Linktree "Earn > Contacts" (permintaan pengguna, 3
-- September 2026): "tambahkan CRM sederhana untuk UMKM". SEBELUMNYA Manajer
-- Audiens hanya daftar email/WA gabungan subscriber + pembeli tanpa cara
-- menandai ("pelanggan setia", "reseller", "sudah di-follow-up") atau
-- mencatat sesuatu tentang seseorang.
--
-- Kenapa tabel TERPISAH, bukan kolom di subscribers: kontak Audiens adalah
-- GABUNGAN subscribers + pembeli (orders.buyer_email) yang dihitung saat
-- baca -- pembeli tidak punya baris di subscribers sama sekali. Kunci
-- kontak = email (lowercase) kalau ada, kalau tidak 'wa:' + nomor WA,
-- supaya satu orang yang subscribe lalu membeli tetap satu catatan.
CREATE TABLE audience_contact_meta (
    creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_key     VARCHAR(300) NOT NULL,
    tags            TEXT[] NOT NULL DEFAULT '{}',
    notes           TEXT NOT NULL DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (creator_user_id, contact_key)
);
