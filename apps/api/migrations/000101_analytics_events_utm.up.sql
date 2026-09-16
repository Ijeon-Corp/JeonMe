-- Simpan UTM masuk (utm_source/medium/campaign) di analytics_events --
-- permintaan langsung pengguna, 15 September 2026: "untuk sumber trafic
-- misal seperti dari facebook ig dan lain lain apakah itu sudah bisa
-- tercatat atau di tracking untuk admin". SEBELUM ini, UTM yang dibaca
-- dari query string pengunjung (getUtmParamsFromWindow, api-client.ts)
-- CUMA diteruskan sbg pass-through ke Facebook Conversions API/GA4 milik
-- kreator sendiri (maybeSendConversionsEvent, analytics.go) -- TIDAK
-- PERNAH disimpan ke database Jeonme sendiri, jadi tidak ada satu pun
-- tempat di dashboard kreator ATAU panel admin yang bisa menampilkan
-- breakdown sumber trafik platform. DEFAULT '' (bukan NULL) supaya
-- konsisten dengan kolom string lain di tabel ini (mis. referrer) --
-- GROUP BY di query admin nanti butuh nilai kosong yang bisa dibedakan
-- rapi dari "belum pernah diisi" tanpa perlu COALESCE/NULLIF di tiap
-- pemakaian.
ALTER TABLE analytics_events ADD COLUMN utm_source VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE analytics_events ADD COLUMN utm_medium VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE analytics_events ADD COLUMN utm_campaign VARCHAR(255) NOT NULL DEFAULT '';

-- idx_analytics_events_created_at -- tabel ini (satu baris per pageview/
-- klik, paling sering ditulis di seluruh aplikasi) SEBELUM ini TIDAK
-- PUNYA satu pun indeks dengan created_at sbg kolom PERTAMA (yang ada
-- semua diawali page_id/link_id/product_id, lihat migrasi 000001/000045/
-- 000067) -- query breakdown sumber trafik BARU di bawah ini sengaja
-- PLATFORM-WIDE (lintas SEMUA kreator, bukan per-page), jadi tidak ada
-- kolom page_id/dst yang bisa dipakai menyaring lebih dulu. Tanpa indeks
-- ini, query itu (dan query time-range platform-wide lain di masa
-- depan) akan full table scan, makin lambat seiring tabel tumbuh.
CREATE INDEX idx_analytics_events_created_at ON analytics_events (created_at);
