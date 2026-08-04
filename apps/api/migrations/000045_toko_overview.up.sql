-- Modul Toko -- Fase A (Overview): "Klik Beli" per produk, dilacak sama
-- persis seperti klik tautan (analytics_events.link_id) -- product_id
-- NULLable karena kolom ini dipakai bersama seluruh baris event lain yang
-- BUKAN klik produk (view halaman, klik tautan biasa).
ALTER TABLE analytics_events ADD COLUMN product_id UUID REFERENCES products(id) ON DELETE CASCADE;

CREATE INDEX idx_analytics_events_product_id ON analytics_events(product_id) WHERE product_id IS NOT NULL;
