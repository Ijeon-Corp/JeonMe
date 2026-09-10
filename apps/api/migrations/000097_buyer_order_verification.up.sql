-- Riwayat pembelian pembeli (permintaan langsung pengguna, 10 September
-- 2026: "alur pembelian product ini terasa ui dan ux nya masih sangat
-- kurang" -> pilih cakupan paling besar termasuk riwayat pembelian).
-- SEBELUM migrasi ini, satu-satunya cara pembeli melihat status pesanan
-- lamanya adalah menyimpan sendiri URL /checkout/{id} -- tidak ada akun
-- pembeli, dan tidak ada cara aman melihat SEMUA pesanan milik satu email
-- lintas kreator.
--
-- Tabel ini SENGAJA meniru persis loyalty_verifications (migrasi 000090,
-- lihat catatan panjang di sana soal alasan keamanannya -- bukti
-- kepemilikan email lewat kode 6-digit, bukan cuma mempercayai string
-- email yang dikirim klien) MINUS kolom creator_user_id: riwayat
-- pembelian ini LINTAS SEMUA kreator di platform (satu pembeli bisa
-- belanja di banyak toko berbeda), bukan per-toko seperti poin loyalitas.
CREATE TABLE buyer_order_verifications (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_email        VARCHAR(255) NOT NULL,
    code_hash          TEXT NOT NULL,
    verified_at        TIMESTAMPTZ,
    session_token_hash TEXT,
    expires_at         TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_buyer_order_verifications_lookup ON buyer_order_verifications(buyer_email);
