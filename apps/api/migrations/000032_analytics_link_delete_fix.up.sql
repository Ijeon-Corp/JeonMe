-- Perbaikan bug: menghapus tautan yang PERNAH mendapat klik/kunjungan
-- (baris analytics_events dengan link_id itu) selalu gagal 500 -- FK
-- link_id REFERENCES links(id) di migrasi awal (000001) TIDAK punya
-- klausa ON DELETE, jadi default Postgres (NO ACTION) menolak DELETE FROM
-- links selama masih ada baris analytics_events yang merujuknya. Makin
-- populer sebuah tautan (makin banyak klik), makin PASTI tidak bisa
-- dihapus -- bug ini terbukti nyata dilaporkan pengguna untuk tautan
-- dengan 2000+ klik.
--
-- ON DELETE SET NULL (bukan CASCADE) -- riwayat klik/kunjungan pada
-- LEVEL HALAMAN (page_id) tetap harus utuh untuk laporan analitik
-- agregat (total kunjungan/klik halaman) walau tautan tertentu sudah
-- dihapus; cuma referensi ke tautan yang sudah tidak ada itu yang
-- di-null-kan, event-nya sendiri tidak ikut terhapus.
ALTER TABLE analytics_events DROP CONSTRAINT analytics_events_link_id_fkey;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_link_id_fkey
    FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE SET NULL;
