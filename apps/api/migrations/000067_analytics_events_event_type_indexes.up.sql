-- Perbaikan performa ditemukan lewat audit keamanan/performa menyeluruh,
-- 14 Agustus 2026: dua query terhadap analytics_events yang memfilter
-- lewat event_type TANPA ada indeks yang membantunya sama sekali --
-- keduanya akan makin melambat seiring analytics_events tumbuh (tabel
-- paling sering ditulis di seluruh aplikasi, satu baris per pageview/klik).
--
-- 1. LinksHandler.List (links.go) -- subquery TERKORELASI di SELECT list,
--    dijalankan SEKALI PER BARIS tautan yang dikembalikan:
--    "SELECT COUNT(*) FROM analytics_events WHERE link_id = l.id AND
--    event_type = 'click'". Tanpa indeks di link_id sama sekali (dicek
--    langsung -- cuma ada indeks di page_id & product_id), tiap subquery
--    ini full scan seluruh tabel -- makin banyak tautan seorang kreator
--    ATAU makin besar analytics_events, makin lambat memuat daftar tautan.
-- 2. ProductHandler.List (product.go) -- "SELECT product_id, COUNT(*) ...
--    WHERE event_type = 'product_click' GROUP BY product_id", TANPA
--    scoping apa pun (bukan per-page/per-tanggal) -- indeks parsial
--    product_id yang sudah ada (idx_analytics_events_product_id) tidak
--    membantu di sini karena predikat WHERE-nya event_type, bukan
--    product_id.
--
-- Keduanya indeks PARSIAL (WHERE kolom terkait IS NOT NULL) -- konsisten
-- dengan idx_analytics_events_product_id yang sudah ada, dan tepat karena
-- link_id/product_id memang nullable (event "view" tidak punya keduanya).
CREATE INDEX idx_analytics_events_link_id_event_type
    ON analytics_events (link_id, event_type)
    WHERE link_id IS NOT NULL;

CREATE INDEX idx_analytics_events_event_type_product_id
    ON analytics_events (event_type, product_id)
    WHERE product_id IS NOT NULL;
