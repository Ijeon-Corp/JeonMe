-- Sprint 5: audit log (NF-10) dan consent UU PDP (NF-09).

CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),
    action      VARCHAR(50) NOT NULL, -- mis. "ledger.credit", "payout.requested", "order.paid"
    entity_type VARCHAR(30) NOT NULL, -- "order" | "payout" | "ledger_entry" | "user"
    entity_id   VARCHAR(100) NOT NULL,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_user_id_created_at ON audit_log(user_id, created_at);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

-- NF-09: waktu persetujuan consent (diisi saat registrasi) dan waktu akun
-- dihapus/dianonimkan (soft-delete -- lihat catatan di handlers/account.go
-- soal kenapa data transaksi/ledger TIDAK dihapus penuh).
ALTER TABLE users ADD COLUMN consent_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
