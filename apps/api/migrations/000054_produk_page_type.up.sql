-- Modul Halaman Produk: tipe halaman KETIGA ("produk"), khusus showcase
-- katalog Toko (produk yang sama dengan halaman utama -- lihat catatan
-- lingkup di CreatePage/PagePreview.tsx), TANPA avatar/bio/tautan seperti
-- "landing". Batas gratis/Premium-nya SENGAJA independen dari pool bio/
-- landing yang sudah ada (lihat premiumExtraPageLimit di page.go) --
-- keputusan langsung pengguna: gratis dapat 1 halaman produk (beda dari
-- bio/landing yang tetap 0 untuk gratis), Premium tetap 5 per tipe.
ALTER TABLE pages DROP CONSTRAINT pages_page_type_check;
ALTER TABLE pages ADD CONSTRAINT pages_page_type_check CHECK (page_type IN ('bio', 'landing', 'produk'));
