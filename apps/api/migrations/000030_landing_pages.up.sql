-- No.99 (Sprint 14): builder landing page, TERPISAH dari halaman bio biasa.
-- LINGKUP DIPERSEMPIT (keputusan eksplisit pengguna): TANPA tombol
-- "Create with AI" -- fitur asli Linktree menghasilkan draft lewat LLM,
-- yang butuh keputusan biaya API LLM per-query (belum ada, sama seperti
-- catatan No.96). Sebagai gantinya: builder blok manual (heading/text/
-- image/button), pakai ulang infrastruktur halaman tambahan (No.98,
-- migrasi 000029) yang sudah ada -- landing page HANYALAH baris pages lain
-- (is_primary=false) dengan page_type='landing' alih-alih 'bio', dan
-- blok-bloknya baris links biasa (block_type baru), TIDAK perlu tabel baru
-- sama sekali.
ALTER TABLE pages ADD COLUMN page_type VARCHAR(20) NOT NULL DEFAULT 'bio';
ALTER TABLE pages ADD CONSTRAINT pages_page_type_check CHECK (page_type IN ('bio', 'landing'));
