-- Modul Toko (Fase B1, Manage Items): kategori produk bebas isi kreator
-- sendiri (pola sama seperti users.category, migrasi 000037) -- BUKAN
-- taksonomi tetap, supaya tidak memaksa kreator ke daftar kategori yang
-- belum tentu cocok dengan jualannya.
ALTER TABLE products ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT '';
