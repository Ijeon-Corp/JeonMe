-- Marketplace Brand <-> Kreator: Sponsored Links & Brand Deals.
--
-- KENAPA: benchmark Linktree "Earn > Sponsored Links" dan "Earn > Brand
-- Deals" (permintaan pengguna, 3 September 2026). Keduanya satu mekanisme
-- -- sebuah BRAND memasang penawaran, KREATOR melamar, brand memutuskan --
-- yang beda hanya wujud hasilnya: sponsored_link = satu tautan berbayar
-- dipublikasikan di halaman kreator; brand_deal = kerja sama yang
-- bentuknya disepakati di luar (konten, endorsement), platform hanya
-- mempertemukan & melacak status. Karena itu SATU tabel campaign dengan
-- kolom `kind`, bukan dua tabel.
--
-- Siapa "brand": akun Jeonme mana pun. Tidak ada role baru -- UMKM yang
-- jualan di Jeonme adalah calon brand paling wajar, dan memaksa akun
-- terpisah cuma menambah gesekan. Kalau nanti perlu verifikasi brand,
-- tambahkan flag di users, bukan role.
--
-- CAKUPAN MVP (sengaja): fee_idr bersifat INFORMATIF -- pembayaran fee dari
-- brand ke kreator BELUM diselesaikan lewat platform (butuh escrow/checkout
-- brand yang belum ada). Status 'completed' dicatat brand secara manual
-- setelah membayar di luar. Ini keputusan lingkup yang dilaporkan ke
-- pengguna, bukan kelalaian.
CREATE TABLE brand_campaigns (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind          VARCHAR(20) NOT NULL CHECK (kind IN ('sponsored_link', 'brand_deal')),
    title         VARCHAR(120) NOT NULL,
    brief         TEXT NOT NULL DEFAULT '',
    url           TEXT NOT NULL DEFAULT '',
    category      VARCHAR(60) NOT NULL DEFAULT '',
    fee_idr       BIGINT NOT NULL DEFAULT 0 CHECK (fee_idr >= 0),
    slots         INT NOT NULL DEFAULT 1 CHECK (slots >= 1 AND slots <= 100),
    status        VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brand_campaigns_open ON brand_campaigns (kind, created_at DESC) WHERE status = 'open';
CREATE INDEX idx_brand_campaigns_brand ON brand_campaigns (brand_user_id, created_at DESC);

CREATE TABLE brand_campaign_applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES brand_campaigns(id) ON DELETE CASCADE,
    creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(10) NOT NULL DEFAULT 'applied'
                    CHECK (status IN ('applied', 'accepted', 'rejected', 'completed')),
    pitch           TEXT NOT NULL DEFAULT '',
    -- link_id: tautan bersponsor yang dipublikasikan kreator (hanya
    -- sponsored_link). ON DELETE SET NULL: kalau kreator menghapus
    -- tautannya, lamaran tetap ada -- brand berhak tahu tautan sudah tidak
    -- tayang, bukan kehilangan riwayatnya.
    link_id         UUID REFERENCES links(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, creator_user_id)
);
CREATE INDEX idx_brand_applications_creator ON brand_campaign_applications (creator_user_id, created_at DESC);
