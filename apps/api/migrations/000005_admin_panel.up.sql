-- Sprint 6: Panel Admin (REQ-F-701/702/703).

-- REQ-F-701: suspend berbeda dari hapus akun (deleted_at) -- suspend bersifat
-- sementara & reversibel (admin bisa aktifkan lagi), identitas tetap utuh.
ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;

-- REQ-F-702: laporan dari pengunjung publik terhadap halaman/produk yang
-- dianggap melanggar, ditinjau admin lalu di-takedown atau ditolak.
CREATE TABLE reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(20) NOT NULL, -- "page" | "product"
    target_id   UUID NOT NULL,
    reason      TEXT NOT NULL,
    reporter_email VARCHAR(255) DEFAULT '',
    status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | takedown | dismissed
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_status_created_at ON reports(status, created_at);
