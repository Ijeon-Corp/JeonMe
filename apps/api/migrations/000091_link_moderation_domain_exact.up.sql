-- Lubang deteksi ditemukan pengguna 5 September 2026: "https://slot.com"
-- masih lolos moderasi tautan (migrasi 000076) dan tampil normal di
-- Halaman Saya. blocked_keywords SELALU dicek sbg SUBSTRING longgar
-- terhadap URL+judul -- kata generik satu-suku-kata seperti "slot" SENGAJA
-- tidak diikutkan bare (cuma sbg frasa "slot gacor"/"slot88"/"slot demo"/
-- "slot online") supaya tidak salah blokir teks bebas yang kebetulan
-- memuat kata itu (mis. "waktu slot konsultasi", "slot iklan tersedia").
-- Tapi proteksi kehati-hatian itu justru membuat DOMAIN yang HANYA berupa
-- kata itu sendiri, tanpa hiasan apa pun, lolos total dari dua lapis
-- deterministik dan jatuh ke lapis AI yang best-effort/bisa fail-open diam-
-- diam -- padahal domain sepersis itu (bkn cuma memuat kata itu di suatu
-- tempat) praktis SELALU judol/konten dewasa.
--
-- match_type membedakan dua strategi pencocokan PADA TABEL YANG SAMA (satu
-- sumber kebenaran & satu panel admin, bukan tabel/alur terpisah):
--   'substring' (default, perilaku lama) -- cocok kalau kata kunci muncul
--   di MANA PUN dalam teks URL+judul, cocok utk frasa spesifik multi-kata.
--   'domain_exact' -- HANYA cocok kalau salah satu label domain (bagian
--   antar titik, mis. "slot" pada "slot.com" atau "slot.co.id") PERSIS
--   SAMA dgn kata kunci ini -- bukan substring longgar. Aman dipakai utk
--   kata generik yang tidak aman sbg substring bebas, karena domain harus
--   PERSIS kata itu (path/teks bebas yang cuma menyebut kata itu TIDAK
--   ikut cocok).
ALTER TABLE blocked_keywords
    ADD COLUMN match_type VARCHAR(20) NOT NULL DEFAULT 'substring'
    CHECK (match_type IN ('substring', 'domain_exact'));

-- Hanya "slot" yang ditambahkan -- kata generik lain yang sudah bare di
-- migrasi 000076 ("togel", "maxwin", "sbobet", "bokep") sudah otomatis
-- menjaring kasus domain-persis-kata-itu lewat substring match yang ada
-- (tidak perlu didaftar dobel). "toto"/"gacor" sengaja TIDAK ditambahkan
-- di sini juga -- keduanya punya makna sah non-judol (nama orang/merek
-- keramik utk "toto", istilah hobi burung utk "gacor") yang masih relevan
-- walau dicek sbg domain persis, bukan cuma substring -- kurasi manual
-- lewat panel admin /admin/moderasi kalau memang perlu diblokir khusus.
INSERT INTO blocked_keywords (keyword, category, match_type) VALUES
    ('slot', 'judi_online', 'domain_exact');
