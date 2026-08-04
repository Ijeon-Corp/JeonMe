-- Modul Toko (Fase E2, tab Listing): urutan tampil & unggulan.
-- position dipakai mengurutkan produk di halaman publik (lihat
-- PageHandler.GetPublicPage) -- SEBELUMNYA tidak ada urutan eksplisit sama
-- sekali (bergantung urutan implisit database). is_featured menempatkan
-- produk di paling atas terlepas dari position.
ALTER TABLE products ADD COLUMN position INT NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;
