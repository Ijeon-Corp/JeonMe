-- "Advance Option" -- permintaan langsung pengguna, 5 September 2026:
-- pengaturan lanjutan perilaku produk (Release Time, Fee, notifikasi
-- WhatsApp saat terjual, Custom Message, Show Unit Sold).
--
-- release_at: jadwal rilis produk -- pola SAMA PERSIS dengan
-- links.starts_at (migrasi 000015), satu sisi saja (bukan window
-- starts_at/ends_at) karena ini "kapan mulai tampil", bukan tautan yang
-- juga bisa "berakhir". NULL = tampil langsung (perilaku lama, tidak
-- berubah untuk produk yang sudah ada).
ALTER TABLE products ADD COLUMN release_at TIMESTAMPTZ;

-- transaction_fee_enabled: TOGGLE per-produk, BUKAN kebijakan platform
-- global -- keputusan pengguna langsung 5 September 2026 MENGUBAH
-- kebijakan "0% fee, final" yang tercatat di config.go (9 Agustus 2026).
-- Sengaja tetap terpisah dari PlatformFeePercent (global, masih 0% per
-- kebijakan lama) -- ini dimensi BARU yang independen, opt-in per
-- produk, bukan pengganti. Jumlahnya TETAP (Rp 600, lihat konstanta
-- flatTransactionFeeIDR di checkout.go), bukan diatur kreator, jadi
-- cukup boolean, tidak perlu kolom jumlah.
ALTER TABLE products ADD COLUMN transaction_fee_enabled BOOLEAN NOT NULL DEFAULT false;

-- notify_whatsapp_enabled + notify_whatsapp_message: notifikasi WhatsApp
-- ke KREATOR (bukan pembeli -- sistem WhatsApp yang ada sebelumnya,
-- whatsapp.Client.SendOrderConfirmation, cuma mengirim ke pembeli) saat
-- produk ini terjual. message adalah teks bebas yang kreator atur
-- sendiri, diisikan sbg parameter template WhatsApp terpisah (lihat
-- whatsapp.Client.SendCreatorSaleNotification) -- BUKAN pesan bebas
-- (WhatsApp Business API tidak izinkan itu di luar sesi 24 jam, harus
-- lewat template yang sudah disetujui Meta).
ALTER TABLE products ADD COLUMN notify_whatsapp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN notify_whatsapp_message TEXT NOT NULL DEFAULT '';

-- show_sold_count: TOGGLE menampilkan jumlah terjual di halaman publik.
-- Penghitungannya SENDIRI sudah ada & teruji (ProductHandler.List,
-- "status='paid' saja") tapi SEBELUMNYA cuma utk dashboard kreator
-- sendiri, tidak pernah dikirim ke respons halaman publik sama sekali.
ALTER TABLE products ADD COLUMN show_sold_count BOOLEAN NOT NULL DEFAULT false;

-- Nomor WhatsApp kreator SENDIRI, khusus utk notifikasi internal (Fitur
-- Kartu Nama Digital sudah punya whatsapp_number tapi itu utk KONTAK
-- PUBLIK di kartu nama, beda tujuan & bisa kosong kalau kreator belum
-- pernah bikin kartu nama -- field baru ini terpisah & khusus).
ALTER TABLE users ADD COLUMN notification_whatsapp_number VARCHAR(20);
