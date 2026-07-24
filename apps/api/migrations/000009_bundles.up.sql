-- Sprint 7: Bundel Produk (No.70, hasil analisis kompetitor Lynk.id).

-- Bundel dimodelkan sebagai baris `products` biasa (is_bundle=true) yang
-- menaungi produk lain lewat bundle_items -- BUKAN entitas terpisah. Ini
-- membuat mesin checkout/webhook/ledger yang sudah ada langsung berfungsi
-- tanpa perubahan, karena semuanya sudah generik atas "baris apa saja di
-- products". file_key bundel selalu kosong (tidak pernah punya file sendiri).
ALTER TABLE products ADD COLUMN is_bundle BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE bundle_items (
    bundle_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    item_product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (bundle_product_id, item_product_id)
);
CREATE INDEX idx_bundle_items_item_product_id ON bundle_items(item_product_id);
