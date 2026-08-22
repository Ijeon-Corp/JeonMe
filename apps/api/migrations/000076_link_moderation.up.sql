-- Blokir link sensitif (judi online/18+) -- permintaan langsung pengguna,
-- 22 Agustus 2026: "sistem bisa memblokir jika memasukkan link yang
-- sensitif contoh nya link judol link 18+ dll". Dua tabel, dua lapis
-- kontrol:
--
--   blocked_keywords: kata kunci yang dicek terhadap URL+judul lengkap
--   kalau domain tautan belum pernah dilihat sebelumnya -- menangkap pola
--   spam SEO judi online ("judol") yang rutin ganti-ganti domain tapi kata
--   kuncinya (mis. "slot gacor") tetap sama. Dikurasi admin lewat panel
--   admin baru, bukan cuma seed di migrasi ini.
--
--   link_domain_verdicts: cache keputusan PER DOMAIN (bukan per link) --
--   baik yang dikurasi admin manual MAUPUN hasil klasifikasi otomatis
--   Claude API untuk domain yang belum pernah dilihat & tidak cocok kata
--   kunci mana pun. Begitu satu domain sudah diputuskan (oleh kreator
--   MANAPUN), keputusan itu dipakai ulang untuk kreator lain yang
--   memasukkan domain sama -- supaya panggilan AI (berbayar & ada
--   latensi) hanya terjadi sekali per domain baru, bukan sekali per link.
--   source membedakan asal keputusan untuk keperluan audit/override admin.
CREATE TABLE blocked_keywords (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword    VARCHAR(100) NOT NULL UNIQUE,
    category   VARCHAR(50) NOT NULL DEFAULT 'lainnya',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE link_domain_verdicts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain     VARCHAR(255) NOT NULL UNIQUE,
    verdict    VARCHAR(10) NOT NULL CHECK (verdict IN ('allowed', 'blocked')),
    category   VARCHAR(50),
    source     VARCHAR(10) NOT NULL CHECK (source IN ('manual', 'keyword', 'ai')),
    reason     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_link_domain_verdicts_verdict ON link_domain_verdicts(verdict);

-- Seed kata kunci awal -- dipilih yang cukup spesifik (frasa, bukan kata
-- tunggal umum) supaya minim false-positive terhadap bisnis sah (mis.
-- TIDAK termasuk "toto" sendirian krn nabrak brand Toto/nama orang, tapi
-- "situs toto"/"togel" cukup spesifik ke judi online).
INSERT INTO blocked_keywords (keyword, category) VALUES
    ('slot gacor', 'judi_online'),
    ('slot88', 'judi_online'),
    ('slot demo', 'judi_online'),
    ('slot online', 'judi_online'),
    ('maxwin', 'judi_online'),
    ('rtp slot', 'judi_online'),
    ('togel', 'judi_online'),
    ('bandar judi', 'judi_online'),
    ('judi online', 'judi_online'),
    ('situs judi', 'judi_online'),
    ('situs toto', 'judi_online'),
    ('agen bola', 'judi_online'),
    ('sbobet', 'judi_online'),
    ('domino99', 'judi_online'),
    ('pragmatic play', 'judi_online'),
    ('bokep', 'konten_dewasa'),
    ('video porno', 'konten_dewasa'),
    ('situs bokep', 'konten_dewasa'),
    ('link bokep', 'konten_dewasa');
