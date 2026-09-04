-- Audit OWASP Top 10 (A04 Insecure Design, 4 September 2026): GetMyPoints
-- dan RedeemReward (loyalty.go) SEBELUMNYA cuma mengandalkan buyer_email
-- yang dikirim klien tanpa bukti kepemilikan apa pun -- siapa pun yang
-- tahu email pembeli sungguhan (bocor lewat data breach, atau sekadar
-- terlihat publik di media sosial/ulasan) bisa melihat saldo poin orang
-- itu DAN menukarnya jadi voucher diskon nyata, di kreator mana pun tempat
-- email itu pernah belanja. Beda dari checkout (yang juga cuma pakai email
-- polos, tapi "membelanjakan uang milik pemanggil sendiri"), redemption
-- ini MEMBELANJAKAN nilai yang sudah dikumpulkan pembeli asli -- butuh
-- bukti kepemilikan, bukan cuma tahu string emailnya.
--
-- Tabel ini menyimpan kode verifikasi 6-digit (pola SAMA PERSIS dengan
-- email_verification_tokens/generateVerificationCode di auth.go -- hash
-- SHA-256 disimpan, bukan kode mentah) DAN, setelah kode terverifikasi,
-- token sesi acak (session_token_hash) yang dipakai ulang oleh
-- GetMyPoints/RedeemReward selama sesi berlangsung (30 menit) supaya
-- pembeli tidak perlu memasukkan kode 6-digit lagi setiap kali menukar
-- reward yang berbeda dalam satu kunjungan.
CREATE TABLE loyalty_verifications (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    buyer_email        VARCHAR(255) NOT NULL,
    code_hash          TEXT NOT NULL,
    verified_at        TIMESTAMPTZ,
    session_token_hash TEXT,
    expires_at         TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_verifications_lookup ON loyalty_verifications(creator_user_id, buyer_email);
