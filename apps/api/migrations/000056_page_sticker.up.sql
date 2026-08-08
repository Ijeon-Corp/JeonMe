-- Modul Desain (permintaan langsung pengguna, 8 Agustus 2026): galeri
-- stiker dekoratif ala Linktree -- kreator pilih satu stiker preset untuk
-- ditempel di halaman publiknya (dekat avatar), murni visual, tidak
-- interaktif. Kosong ("") berarti tidak pakai stiker sama sekali (default).
-- Kolom generik di `pages` (bukan tabel terpisah) supaya berlaku sama untuk
-- halaman utama MAUPUN halaman tambahan (Toko/Landing/Bio kedua), sama
-- seperti custom_font/custom_button_color/dst.
ALTER TABLE pages ADD COLUMN sticker VARCHAR(20) NOT NULL DEFAULT '';
