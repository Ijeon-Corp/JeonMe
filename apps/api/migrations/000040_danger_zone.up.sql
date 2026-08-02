-- Modul Settings §6 (Danger Zone). "Nonaktifkan" (deactivate) SELALU bisa
-- dibatalkan kapan saja, TANPA masa tunggu -- beda dari "hapus" (delete) di
-- bawah. Pola sama dengan users.suspended_at (000005) yang sudah ada, cuma
-- dikendalikan pengguna sendiri (bukan admin).
ALTER TABLE users ADD COLUMN deactivated_at TIMESTAMPTZ;

-- Perbaikan kunci dari kelemahan Lynk.id (dilaporkan bisa hapus akun dalam
-- hitungan detik tanpa masa tunggu): permintaan hapus akun TIDAK LANGSUNG
-- menganonimkan data (beda dari AccountHandler.DeleteAccount versi lama
-- yang instan) -- masuk masa tunggu 14 hari, bisa dibatalkan kapan pun
-- dalam window itu. Riwayat disimpan (bukan cuma satu baris "current
-- state") supaya kreator yang minta lalu batal lalu minta lagi tetap
-- punya jejak lengkap di audit_log & tabel ini.
CREATE TABLE account_deletion_requests (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    scheduled_purge_at   TIMESTAMPTZ NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'completed')),
    export_download_url  TEXT,
    cancelled_at         TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ
);
CREATE INDEX idx_account_deletion_requests_user_id ON account_deletion_requests(user_id);

-- Hanya SATU permintaan pending aktif per user -- ditegakkan lewat partial
-- unique index. Index yang sama juga dipakai sebagai jalur cepat query
-- "apakah user ini sedang menunggu dihapus" (GetPublicPage/GetPublicPageBySlug).
CREATE UNIQUE INDEX idx_account_deletion_requests_one_pending_per_user
    ON account_deletion_requests(user_id) WHERE status = 'pending';

-- Dipindai worker harian untuk purge yang sudah jatuh tempo (lihat
-- worker.HandleAccountPurgeScan).
CREATE INDEX idx_account_deletion_requests_pending_purge
    ON account_deletion_requests(scheduled_purge_at) WHERE status = 'pending';
