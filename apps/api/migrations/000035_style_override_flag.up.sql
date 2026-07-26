-- Bug dilaporkan pengguna (26 Juli 2026): "kenapa saya ubah warna tombol
-- ataupun font malah merubah tema yang sudah saya pilih" -- akar masalah:
-- menyentuh panel Tombol/Font SELALU memaksa theme jadi 'custom' (lihat
-- komentar lama di dashboard/design/page.tsx), yang artinya SELURUH latar/
-- mood preset yang sudah dipilih (mis. "Midnight") ikut terganti jadi
-- tampilan dasar "Custom" (base sunrise) -- padahal niat pengguna cuma
-- ingin menimpa warna tombol/font, BUKAN mengganti seluruh tema.
--
-- Diperbaiki dengan memisahkan dua konsep: `theme` (identitas latar/mood --
-- preset ATAU 'custom' custom_background_*) TETAP seperti sebelumnya, tapi
-- kustomisasi tombol/font sekarang jadi LAPISAN independen yang bisa
-- diterapkan di ATAS tema APAPUN (preset maupun custom), diaktifkan lewat
-- flag boolean ini -- bukan lagi memaksa ganti `theme`.
ALTER TABLE pages ADD COLUMN custom_style_override BOOLEAN NOT NULL DEFAULT false;

-- Kreator yang SUDAH pakai theme='custom' sebelumnya efektif SELALU
-- menerapkan kustomisasi tombol/font (itulah definisi tampilan "Custom"
-- mereka) -- nyalakan flag otomatis supaya tampilan yang sudah ada TIDAK
-- berubah sama sekali akibat migrasi ini.
UPDATE pages SET custom_style_override = true WHERE theme = 'custom';
