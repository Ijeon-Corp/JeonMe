# E2E Tests (Playwright)

Test end-to-end sungguhan terhadap browser Chromium asli -- membuat akun
kreator uji lewat form register asli, mengklik lewat UI dashboard yang
sesungguhnya, dan memverifikasi hasil render di halaman publik. Ini
BERBEDA dari verifikasi curl manual yang dipakai sepanjang riwayat proyek
ini (yang membuktikan data/API benar) -- test ini membuktikan UI/interaksi
browser sungguhan benar (klik tile tema, isi form, dsb).

## Menjalankan

Butuh stack lokal lengkap sudah berjalan (server dev TIDAK di-start
otomatis oleh Playwright di sini karena API Go ada di luar workspace npm):

1. Docker: `docker compose up -d` (Postgres, Redis, MinIO) dari root repo.
2. API: build & jalankan binary Go (`go build` lalu jalankan dari `apps/api`,
   pastikan `.env` terisi).
3. Web: `npm run dev` dari `apps/web` (port 3000).
4. Jalankan test: `npm run test:e2e` (atau `npm run test:e2e:ui` untuk mode
   UI interaktif Playwright).

## Yang perlu diketahui

- **Rate limit auth** (`middleware.RateLimit`, 10 request/menit per IP,
  gabungan register+login) -- `fixtures.ts` `registerAndLogin()` otomatis
  mendeteksi pesan "terlalu banyak permintaan" dan menunggu 15 detik sebelum
  mencoba lagi. Kalau menjalankan test satu-satu berulang kali dengan cepat
  (bukan lewat `npm run test:e2e` penuh), bisa kena limit ini.
- **`pages.is_published` default `false`** -- akun baru daftar TIDAK
  otomatis tampil di halaman publik. Test yang memeriksa halaman publik
  HARUS memanggil `publishPage(page)` dari `fixtures.ts` dulu (sakelar
  "Terbitkan halaman publik" di `/dashboard/design`).
- **Cache ISR 60 detik** (`next: { revalidate: 60 }` di halaman publik) --
  perubahan lewat dashboard tidak langsung tampil di halaman publik kalau
  URL yang sama baru saja diambil. Test memakai `expect(...).toPass({
  timeout: 75000, intervals: [5000] })` untuk menunggu ini lewat, BUKAN
  `waitForTimeout` tetap -- lebih cepat kalau cache belum penuh 60 detik,
  dan tetap sabar kalau memang belum lewat.
- **Panel pratinjau langsung** (`LivePreviewPanel`) merender ulang konten
  yang sama (judul tautan, dll) di sebelah kanan HAMPIR SETIAP halaman
  dashboard/design -- locator `getByText(...)` polos akan bentrok dengan
  ini. Batasi ke `getByRole("listitem")` atau elemen spesifik lain saat
  memeriksa daftar tautan/produk di dashboard.
- **Data uji**: semua akun dibuat dengan awalan `e2e` + timestamp (lihat
  `uniqueUsername()`). Test TIDAK membersihkan sendiri (Playwright tidak
  punya akses langsung ke database) -- bersihkan manual sesekali lewat
  `DELETE FROM users WHERE username LIKE 'e2e%'` di database lokal (perlu
  urutan aman FK kalau ada data starter/riwayat lama: payments -> orders ->
  ledger_entries/audit_log -> users, lihat riwayat kerja No.134).
