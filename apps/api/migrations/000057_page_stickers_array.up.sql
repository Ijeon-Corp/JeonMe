-- Modul Desain (koreksi langsung pengguna, 8 Agustus 2026): stiker
-- SEHARUSNYA interaktif -- kreator bisa taruh BEBERAPA stiker, masing-
-- masing punya posisi & ukuran sendiri yang diatur lewat drag/resize di
-- pratinjau, bukan cuma satu pilihan tetap nempel di pojok avatar
-- (migrasi 000056, baru sehari, ternyata lingkupnya kurang tepat -- diganti
-- di sini, bukan ditambah kolom baru terpisah, supaya tidak ada 2 sumber
-- kebenaran untuk "stiker halaman").
--
-- Array JSON, tiap elemen: {"id": "<uuid klien>", "type": "<nama bentuk>",
-- "x": <persen 0-100>, "y": <persen 0-100>, "scale": <0.4-2.5>}. "x"/"y"
-- posisi TITIK TENGAH stiker relatif terhadap kanvas halaman (persen, bukan
-- piksel) supaya tetap proporsional di ukuran layar berapa pun. Divalidasi
-- di backend (page.go), bukan cuma dipercaya dari klien.
ALTER TABLE pages DROP COLUMN sticker;
ALTER TABLE pages ADD COLUMN stickers JSONB NOT NULL DEFAULT '[]';
