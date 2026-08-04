-- Modul Toko (Fase E1): ulasan pembeli. order_id UNIK -- satu pesanan
-- cuma boleh diulas SEKALI (mencegah spam ulasan dari pembelian yang
-- sama), dan hanya order LUNAS yang boleh mengulas (ditegakkan di
-- handler, bukan di skema, supaya pesan errornya jelas).
CREATE TABLE product_reviews (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_id   UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    buyer_email VARCHAR(255) NOT NULL,
    rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT NOT NULL DEFAULT '',
    -- is_hidden -- kreator bisa sembunyikan ulasan yang tidak pantas TANPA
    -- menghapusnya permanen (jejak tetap ada untuk kalau ada sengketa).
    is_hidden  BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_reviews_product_id ON product_reviews(product_id);
