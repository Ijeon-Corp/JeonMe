-- Permintaan langsung pengguna (tangkapan layar referensi): panel "Tombol"
-- & "Font" di halaman Desain perlu kontrol lebih lengkap ala Linktree --
-- kelengkungan sudut tombol, intensitas bayangan (independen dari gaya
-- tombol), warna teks tombol, warna teks halaman, font judul terpisah, dan
-- warna judul terpisah dari warna teks umum.
ALTER TABLE pages ADD COLUMN custom_button_rounded VARCHAR(10) NOT NULL DEFAULT 'full';
ALTER TABLE pages ADD COLUMN custom_button_shadow VARCHAR(10) NOT NULL DEFAULT 'soft';
ALTER TABLE pages ADD COLUMN custom_button_text_color VARCHAR(7) NOT NULL DEFAULT '#FFFFFF';
-- Kosong = pakai warna teks bawaan tema (belum pernah diisi kreator),
-- BUKAN dipaksa putih/hitam -- beda dari custom_button_color yang SELALU
-- terisi sejak awal (No.80).
ALTER TABLE pages ADD COLUMN custom_page_text_color VARCHAR(7) NOT NULL DEFAULT '';
-- Kosong = "samakan dengan font halaman" (custom_font), sesuai toggle
-- "Alternative title font" di referensi yang default MATI.
ALTER TABLE pages ADD COLUMN custom_title_font VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN custom_title_color VARCHAR(7) NOT NULL DEFAULT '';

-- "shadow" sebagai GAYA tombol (mutually exclusive dengan fill/outline)
-- dilebur jadi axis terpisah custom_button_shadow supaya bisa dipakai
-- bareng gaya apa pun (persis seperti referensi: "Button style" & "Button
-- shadow" dua baris independen) -- data lama dimigrasikan supaya tampilan
-- kreator yang sudah pakai gaya "shadow" tidak berubah drastis.
UPDATE pages SET custom_button_shadow = 'strong' WHERE custom_button_style = 'shadow';
UPDATE pages SET custom_button_style = 'fill' WHERE custom_button_style = 'shadow';
