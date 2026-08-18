// Perbaikan (audit keamanan 14 Agustus 2026): dulu TIDAK ada header
// keamanan sama sekali di respons web ini (dibuktikan lewat `curl -sI`
// langsung) -- tidak ada middleware.ts maupun headers() di file ini sama
// sekali. Dua tingkat CSP dipisah SENGAJA (bukan satu CSP longgar utk
// semua rute):
// - Halaman publik kreator (username/p/slug/card, MEMUAT script pihak
//   ketiga sungguhan kalau kreator mengisi Facebook Pixel/GA4 di
//   AnalyticsScripts.tsx, dan meng-iframe embed peta Google Maps kalau
//   blok "maps" dibuat dgn mode tertanam) -- allowlist eksplisit host yang
//   BENAR-BENAR dipakai, bukan menebak.
// - Semua rute lain (dashboard/admin/login/register) TIDAK PERNAH memuat
//   script pihak ketiga apa pun (Google OAuth = full redirect browser ke
//   accounts.google.com, BUKAN script/iframe -- lihat GoogleAuthButton.tsx)
//   -- CSP jauh lebih ketat, tanpa allowlist eksternal.
// 'unsafe-inline' di script-src/style-src TETAP dibutuhkan (Next.js inline
// hydration script + Tailwind/analytics inline init script di atas) --
// menghapusnya butuh migrasi ke CSP nonce per-request lewat middleware.ts,
// perubahan lebih besar di luar cakupan perbaikan ini.
//
// BUG NYATA ditemukan lewat verifikasi Playwright (bukan cuma `curl -sI` --
// curl TIDAK PERNAH benar-benar menegakkan CSP, jadi awalnya lolos tanpa
// ketahuan): api-client.ts memanggil API browser-side lewat
// NEXT_PUBLIC_API_BASE_URL, yang di lokal/staging berupa origin BEDA
// (mis. "http://localhost:8080", port beda dari Next.js sendiri) --
// `connect-src 'self'` polos memblokir SEMUA fetch ke situ, membuat
// login/register/dashboard rusak total di browser sungguhan (seluruh
// suite E2E gagal serentak). loadEnvConfig (utilitas SAMA yang dipakai
// Next.js sendiri secara internal) supaya next.config.js baca
// .env.local/.env dengan presedensi PERSIS sama seperti app runtime --
// origin API otomatis ditambahkan ke connect-src kalau memang beda origin
// dari web ini sendiri (di staging/production Apache reverse-proxy
// /api/ ke origin YANG SAMA, jadi 'self' saja sudah cukup di sana).
// next.config.js murni CommonJS (module.exports di bawah, konvensi
// Next.js) -- require() di sini valid & satu-satunya cara load @next/env
// sebelum config dievaluasi.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(__dirname);

function apiOriginFromEnv() {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

const API_ORIGIN = apiOriginFromEnv();
const CONNECT_SRC = API_ORIGIN ? `'self' ${API_ORIGIN}` : "'self'";

// Bug dilaporkan pengguna, 17 Agustus 2026 (konsol browser sungguhan di
// halaman publik): dua celah CSP ditemukan begitu blok "audio"/"video"
// (baru ditambahkan sesi ini) benar-benar dipakai --
// 1. Tidak ada `media-src` sama sekali -> jatuh balik ke `default-src
//    'self'`, blok elemen <audio> (AudioPlayerBlock.tsx) yang src-nya
//    SELALU cross-origin (storage.jeon.id/storage-staging.jeon.id,
//    domain object storage terpisah dari domain web ini, sama seperti
//    `img-src` yang sudah lebih dulu perlu `https:` bukan cuma 'self'
//    untuk alasan yang sama).
// 2. `frame-src` cuma mengizinkan Google Maps -- VideoEmbedBlock.tsx sudah
//    lama bisa merender embed YouTube MAUPUN TikTok, tapi frame-src tidak
//    pernah diperbarui untuk keduanya (blok video sebenarnya SUDAH lama
//    ada sebelum sesi ini, cuma baru ketahuan karena kreator baru benar-
//    benar memakainya).
// STRICT_CSP (dashboard) ikut diperbaiki sama persis -- PagePreview.tsx
// (lewat LivePreviewPanel) dipakai ULANG apa adanya di pratinjau dashboard,
// blok video/audio di situ merender iframe/elemen <audio> yang SAMA,
// jadi celah yang sama persis berlaku di sana (belum sempat dilaporkan
// tapi akar masalahnya identik, diperbaiki sekalian).
const MEDIA_SRC = "media-src 'self' https:";
const VIDEO_EMBED_FRAME_SRC = "https://www.youtube.com https://www.tiktok.com";

const PUBLIC_PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  MEDIA_SRC,
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC} https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.facebook.com https://connect.facebook.net`,
  `frame-src https://www.google.com ${VIDEO_EMBED_FRAME_SRC}`,
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const STRICT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  MEDIA_SRC,
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC}`,
  `frame-src ${VIDEO_EMBED_FRAME_SRC}`,
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const COMMON_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Audit keamanan 15 Agustus 2026: Permissions-Policy restriktif. Jeonme
  // tidak memakai API kamera/mikrofon/geolokasi/USB/pembayaran native dll.
  // Google Maps dirender lewat iframe (frame-src di CSP), BUKAN API
  // geolocation browser, jadi aman di-disable. Mencegah skrip pihak ketiga
  // (Pixel/GA4 di halaman publik kreator) diam-diam meminta izin fitur
  // sensitif. '=()' = tolak semua origin, termasuk same-origin.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' membuat image Docker jauh lebih kecil -- lihat docker/web/Dockerfile
  output: 'standalone',
  reactStrictMode: true,
  // X-Powered-By: Next.js -- fingerprint framework, tidak perlu dibocorkan.
  poweredByHeader: false,

  async headers() {
    // Urutan array INI PENTING (ditemukan lewat verifikasi langsung --
    // `curl -sI /login` sempat balas CSP longgar, bukan yang ketat):
    // Next.js menggabungkan SEMUA rule yang cocok dgn satu path, rule yang
    // datang BELAKANGAN menimpa header berkey sama dari rule sebelumnya.
    // "/login" & "/register" JUGA cocok dgn pola dinamis "/:username" (satu
    // segmen path, tidak ada bedanya bagi matcher headers() -- beda dgn
    // resolusi RUTE HALAMAN sungguhan yang memang memprioritaskan rute
    // statis) -- jadi rule publik (permisif) HARUS didaftar LEBIH DULU,
    // rule ketat (dashboard/admin/login/register) HARUS BELAKANGAN supaya
    // dialah yang menang untuk path-path spesifik itu.
    const publicRoutes = [
      { source: '/', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }] },
      // /pricing & /features (perbaikan SEO, 15 Agustus 2026) -- halaman
      // marketing baru, dikelompokkan sama dengan "/" (bukan strictRoutes)
      // supaya konsisten dgn kategorisasi yang sudah ada di sini: rute
      // marketing/top-level vs rute aplikasi (dashboard/admin/login/register).
      { source: '/pricing', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }] },
      { source: '/features', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }] },
      { source: '/:username', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }] },
      { source: '/p/:slug', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }] },
      { source: '/card/:username', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }] },
      { source: '/checkout/:id', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }] },
    ];
    const strictRoutes = [
      { source: '/dashboard/:path*', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: STRICT_CSP }] },
      { source: '/admin/:path*', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: STRICT_CSP }] },
      { source: '/login', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: STRICT_CSP }] },
      { source: '/register', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: STRICT_CSP }] },
      // /verify-email (kode aktivasi akun, permintaan langsung pengguna 19
      // Agustus 2026) -- SATU segmen path SAMA seperti /login & /register
      // di atas, jadi TANPA entri eksplisit ini juga akan diam-diam cocok
      // dengan pola publik "/:username" (lihat catatan urutan array di
      // atas) dan dapat CSP longgar yang salah untuk halaman auth.
      { source: '/verify-email', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: STRICT_CSP }] },
      // /reset-password (perbaikan 20 Agustus 2026 -- reset password
      // SEBELUMNYA tidak pernah benar-benar mengirim email, lihat
      // queue.TypePasswordResetEmail) -- gap yang SAMA seperti /verify-email
      // di atas, satu segmen path yang tanpa entri eksplisit akan diam-diam
      // cocok dengan pola publik "/:username".
      { source: '/reset-password', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: STRICT_CSP }] },
    ];
    return [...publicRoutes, ...strictRoutes];
  },

  // Jaring pengaman untuk `docker compose up` LOKAL (root docker-compose.yml)
  // yang TIDAK punya Apache di depannya seperti staging/production -- lihat
  // resolveApiBaseUrl() di lib/api-client.ts. Browser sekarang default ke
  // path relatif "/api/v1"; rule ini meneruskannya ke container `api` lewat
  // Next.js sendiri. Di staging/production, Apache SUDAH meng-intercept
  // /api/ SEBELUM permintaan sampai ke Next.js (lihat CICD-GUIDE.md
  // ProxyPass /api/), jadi rule ini tidak pernah tersentuh di sana.
  async rewrites() {
    const internalApiOrigin = (process.env.INTERNAL_API_BASE_URL || 'http://localhost:8080/api/v1').replace(/\/api\/v1\/?$/, '');
    return [
      { source: '/api/:path*', destination: `${internalApiOrigin}/api/:path*` },
    ];
  },

  // Perbaikan SEO (temuan audit, 15 Agustus 2026): /signup 404 -- rute
  // pendaftaran sungguhan selalu /register (lihat app/register/), tapi
  // "/signup" tetap ekspektasi umum (istilah generik SaaS) & kemungkinan
  // ditautkan dari luar (backlink/iklan lama). Redirect permanen (308,
  // permanent:true) supaya mesin pencari mengalihkan nilai SEO-nya ke
  // /register, bukan cuma redirect sementara.
  async redirects() {
    return [
      { source: '/signup', destination: '/register', permanent: true },
    ];
  },
};

module.exports = nextConfig;
