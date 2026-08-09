-- Gap #3 dari laporan benchmark kompetitif (permintaan langsung pengguna,
-- 9 Agustus 2026): Audiens Jeonme sebelumnya cuma capture form + ekspor
-- CSV -- tidak ada jalur mengirim email/broadcast ke subscriber dari
-- dalam produk sama sekali, padahal Beacons & Linktree Pro sudah punya ini
-- sejak lama. Tabel ini mencatat riwayat broadcast (subjek/isi/jumlah
-- penerima/status) supaya kreator bisa lihat apa yang sudah pernah
-- dikirim, dan supaya pengiriman sungguhan bisa diproses ASINKRON lewat
-- worker asynq (pola sama seperti order.paid/team.invite) -- broadcast ke
-- ratusan subscriber sekaligus TIDAK BOLEH bikin request HTTP menunggu.
--
-- SENGAJA hanya menyasar tabel `subscribers` (orang yang eksplisit isi
-- form pengumpulan lead), BUKAN seluruh "Audiens" gabungan yang juga
-- berisi pembeli produk -- pembeli belum tentu mencentang persetujuan
-- menerima email marketing saat checkout, cuma transaksional. Batas
-- consent ini keputusan produk, bukan cuma detail teknis.
CREATE TABLE audience_broadcasts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject          VARCHAR(200) NOT NULL,
    body             TEXT NOT NULL,
    recipient_count  INT NOT NULL DEFAULT 0,
    sent_count       INT NOT NULL DEFAULT 0,
    status           VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued|sending|sent|failed
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ
);

CREATE INDEX idx_audience_broadcasts_user_id ON audience_broadcasts(user_id, created_at DESC);
