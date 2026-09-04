-- Audit fitur admin (5 September 2026): AdminHandler.ResolveReport (aksi
-- "takedown") sebelumnya cuma mengubah pages.is_published/products.is_active
-- jadi false -- kolom yang SAMA PERSIS dipakai endpoint edit milik pemilik
-- sendiri (PageHandler.UpdateMyPage, ProductHandler.Update). Tidak ada apa
-- pun yang membedakan "dimatikan admin karena laporan" dari "dimatikan
-- pemiliknya sendiri sebagai draft", jadi pemilik konten yang di-takedown
-- bisa langsung menyalakan lagi lewat alur edit biasa, membatalkan
-- keputusan moderasi tanpa admin pernah tahu.
--
-- moderation_locked_at menandai KAPAN admin mengunci status publish/aktif
-- konten ini lewat takedown. Selama kolom ini terisi, endpoint edit milik
-- pemilik menolak mengubah is_published/is_active jadi true lagi (lihat
-- page.go/product.go) -- pemilik tetap bisa mengedit KONTEN lain (judul,
-- deskripsi, dst), cuma tidak bisa mempublikasikannya ulang sendiri.
-- Dicabut lewat AdminHandler.RestoreReport (kebalikan dari takedown),
-- ditautkan ke laporan yang menyebabkannya supaya jejaknya jelas.
ALTER TABLE pages ADD COLUMN moderation_locked_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN moderation_locked_at TIMESTAMPTZ;
