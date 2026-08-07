-- Modul Halaman Produk: sekarang Toko dibuat OTOMATIS begitu kreator punya
-- produk pertama (lihat ensureProdukPage di page.go), bukan lagi langkah
-- manual "+Tambah Halaman" -- tapi trigger itu cuma jalan untuk produk BARU
-- ke depan. Backfill sekali ini menyamakan kreator yang SUDAH punya produk
-- dari sebelum perubahan ini, supaya mereka juga langsung dapat Toko gratis
-- tanpa perlu bikin manual. Slug = username, bio/avatar/tema disalin dari
-- halaman Bio utama (bukan dibiarkan kosong/default -- sama seperti
-- ensureProdukPage), langsung published karena kontennya (produk) sudah
-- nyata ada.
INSERT INTO pages (user_id, is_primary, name, slug, page_type, is_published, bio, avatar_url, theme)
SELECT DISTINCT
    pr.user_id,
    false,
    'Toko ' || COALESCE(NULLIF(primary_page.display_name, ''), u.username),
    u.username,
    'produk',
    true,
    primary_page.bio,
    primary_page.avatar_url,
    primary_page.theme
FROM products pr
JOIN users u ON u.id = pr.user_id
JOIN pages primary_page ON primary_page.user_id = u.id AND primary_page.is_primary = true
WHERE NOT EXISTS (
    SELECT 1 FROM pages existing
    WHERE existing.user_id = pr.user_id AND existing.page_type = 'produk'
)
ON CONFLICT DO NOTHING;
