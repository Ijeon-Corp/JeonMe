-- Kartu Nama Digital v2: tema kartu + data lengkap kartu nama.
--
-- KENAPA: benchmark Linktree "Tools > Business Cards" (permintaan pengguna,
-- 3 September 2026): "yang tampil bukan hanya QR code-nya saja tapi semua
-- data yang dibutuhkan business card ditampilkan dengan bentuk tema card
-- Jeonme". SEBELUMNYA tombol "Generate QR" hanya menampilkan kode QR polos,
-- dan halaman publik /card/{username} kartu putih generik.
--
-- card_theme: warna aksen kartu (palet homepage) -- dipilih kreator supaya
-- kartu yang diunduh/di-scan sama persis dengan yang tampil di dashboard.
-- tagline/address/sosial: data yang lazim ada di kartu nama fisik dan
-- sebelumnya tidak punya tempat.
ALTER TABLE business_cards
    ADD COLUMN card_theme VARCHAR(20) NOT NULL DEFAULT 'lavender'
        CHECK (card_theme IN ('lavender', 'lime', 'pink', 'blue', 'ink')),
    ADD COLUMN tagline   VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN address   VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN instagram VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN tiktok    VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN linkedin  VARCHAR(200) NOT NULL DEFAULT '';
