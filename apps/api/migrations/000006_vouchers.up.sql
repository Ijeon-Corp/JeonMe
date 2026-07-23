-- Sprint 7: Voucher/Diskon per Produk (No.67, hasil analisis kompetitor Lynk.id).

-- Precedent pertama untuk relasi many-to-many di skema ini -- sebelumnya
-- semua relasi FK satu-ke-banyak sederhana. voucher_products kosong berarti
-- voucher berlaku untuk SEMUA produk milik kreator ybs, bukan produk tertentu.
CREATE TABLE vouchers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code             VARCHAR(50) NOT NULL,
    batch_label      VARCHAR(100) NOT NULL DEFAULT '', -- pengelompokan kode hasil generate massal; kosong = kode tunggal manual
    discount_type    VARCHAR(20) NOT NULL, -- "percentage" | "fixed"
    discount_value   BIGINT NOT NULL, -- persen (1-100) kalau percentage, IDR kalau fixed
    max_discount_idr BIGINT, -- cap opsional, hanya berlaku utk tipe percentage
    min_purchase_idr BIGINT NOT NULL DEFAULT 0,
    max_uses         INTEGER, -- NULL = tak terbatas (kode tunggal biasanya begini)
    used_count       INTEGER NOT NULL DEFAULT 0,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    expires_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_vouchers_user_id_code ON vouchers(user_id, code);
CREATE INDEX idx_vouchers_user_id_batch ON vouchers(user_id, batch_label) WHERE batch_label != '';

CREATE TABLE voucher_products (
    voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (voucher_id, product_id)
);
CREATE INDEX idx_voucher_products_product_id ON voucher_products(product_id);

ALTER TABLE orders ADD COLUMN voucher_id UUID REFERENCES vouchers(id);
ALTER TABLE orders ADD COLUMN discount_idr BIGINT NOT NULL DEFAULT 0;
