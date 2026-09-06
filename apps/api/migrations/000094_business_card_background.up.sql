-- Kartu Nama Digital -- background kustom (permintaan langsung pengguna, 7
-- September 2026: "di business card / contact card bisa atur background
-- nya"). SEBELUMNYA satu-satunya kustomisasi visual kartu adalah 5 preset
-- warna pita atas (card_theme) -- badan kartu selalu putih polos. Kolom
-- ini menyimpan URL gambar (dikonversi ke WebP di backend seperti gambar
-- dekoratif lain, lihat internal/imageconv) yang dipakai sebagai
-- background kartu di dashboard, halaman publik /card/{username}, DAN
-- komposer PNG (lib/business-card-png.ts) -- kosong berarti tetap pakai
-- card_theme seperti sebelumnya (tidak ada perubahan visual untuk kartu
-- yang belum diatur backgroundnya).
ALTER TABLE business_cards
    ADD COLUMN background_image_url TEXT NOT NULL DEFAULT '';
