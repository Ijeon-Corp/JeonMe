-- Modul Toko (Fase E3, tab Storage & Files): ukuran file, dicatat SEKALI
-- saat unggah (lihat ProductHandler.UploadFile) -- SEBELUMNYA ukuran cuma
-- divalidasi di memori lalu dibuang, tidak pernah disimpan ke mana pun.
-- NULL untuk file yang diunggah SEBELUM kolom ini ada (tidak bisa dihitung
-- ulang tanpa panggilan HeadObject live ke storage, di luar cakupan
-- migrasi skema) -- ditampilkan jujur sebagai "tidak diketahui", bukan 0.
ALTER TABLE products ADD COLUMN file_size_bytes BIGINT;
