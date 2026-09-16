// Perbaikan (audit keamanan 14 Agustus 2026): dulu TIDAK ada header
// keamanan sama sekali di respons web ini (dibuktikan lewat `curl -sI`
// langsung) -- tidak ada middleware.ts maupun headers() di file ini sama
// sekali. Dua tingkat CSP dipisah SENGAJA (bukan satu CSP longgar utk
// semua rute):
// - Halaman publik kreator (username/username/slug/card, MEMUAT script pihak
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
// CLOUDFLARE_INSIGHTS_SRC -- audit Lighthouse 16-17 September 2026 (Best
// Practices, "Browser errors logged to console"): Cloudflare Web Analytics
// (aktif di dashboard zona Cloudflare, BUKAN kode kita) menyuntik tag
// `<script src="https://static.cloudflareinsights.com/beacon.min.js/...">`
// ke SETIAP respons HTML lewat edge -- berlaku di SELURUH domain, bukan
// cuma halaman publik, jadi ditambahkan ke KEDUA CSP di bawah (public &
// strict). Sebelum ini script-src menolaknya (CSP violation di konsol
// browser, request gagal total, nol manfaat) -- beacon-nya sendiri
// melapor ke path relatif `/cdn-cgi/rum` di origin yang SAMA (diintersep
// Cloudflare di edge), jadi `connect-src 'self'` yang sudah ada di kedua
// CSP TIDAK perlu tambahan apa pun, cukup izinkan skripnya dimuat.
const CLOUDFLARE_INSIGHTS_SRC = "https://static.cloudflareinsights.com";
const VIDEO_EMBED_FRAME_SRC = "https://www.youtube.com https://www.tiktok.com";
// EMBED_BLOCK_FRAME_SRC -- Canvas Page Builder Fase 3, block_type "embed"
// (iframe generik dgn whitelist provider, permintaan langsung pengguna 8
// September 2026, provider dikonfirmasi via AskUserQuestion: Google
// Forms/Calendly/Spotify -- Google Maps TIDAK di sini, www.google.com
// SUDAH ada di frame-src sejak lama). WAJIB satu commit dengan
// EmbedBlock.tsx/isAllowedEmbedHost (links.go) -- frame-src SUDAH 2x lupa
// diperbarui saat blok iframe baru ditambah (lihat catatan VIDEO_EMBED_
// FRAME_SRC & STRICT_CSP di bawah), pola bug yang sama PERSIS dgn
// EnsurePublicRead di backend (main.go) yang sudah 4x terulang.
const EMBED_BLOCK_FRAME_SRC = "https://docs.google.com https://calendly.com https://open.spotify.com";

const PUBLIC_PAGE_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://connect.facebook.net https://www.googletagmanager.com ${CLOUDFLARE_INSIGHTS_SRC}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  MEDIA_SRC,
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC} https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.facebook.com https://connect.facebook.net`,
  `frame-src https://www.google.com ${VIDEO_EMBED_FRAME_SRC} ${EMBED_BLOCK_FRAME_SRC}`,
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

// NOMINATIM_ORIGIN -- permintaan langsung pengguna, 25 Agustus 2026:
// "user bisa memilih langsung lokasi dia saat ini lewat blok nya
// langsung jadi bisa pop up gmaps dan bisa memilih" (blok Lokasi/Maps) --
// LocationPickerModal.tsx cari alamat lewat Nominatim (geocoding
// OpenStreetMap, GRATIS tanpa API key -- dikonfirmasi lewat
// AskUserQuestion, alternatif Google Maps JS API perlu billing GCP baru).
// Tile peta sendiri TIDAK butuh entri baru (img-src di bawah sudah
// mengizinkan https: apa saja).
const NOMINATIM_ORIGIN = 'https://nominatim.openstreetmap.org';

// Bug ditemukan 26 Agustus 2026 (pengguna: "link youtube maps error tidak
// bisa tampil" saat menguji semua blok di dashboard): STRICT_CSP di sini
// TIDAK PERNAH memasukkan https://www.google.com ke frame-src (beda dari
// PUBLIC_PAGE_CSP di atas yang sudah benar sejak 17 Agustus) -- blok
// "maps" dengan embed=true SELALU gagal tampil di pratinjau dashboard
// (LivePreviewPanel, lewat PagePreview.tsx yang sama), sementara YouTube/
// TikTok sudah lama benar (VIDEO_EMBED_FRAME_SRC). Halaman publik
// sungguhan TIDAK terdampak (sudah benar), makanya bug ini baru ketahuan
// sekarang saat kreator menguji lewat pratinjau dashboard.
const STRICT_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${CLOUDFLARE_INSIGHTS_SRC}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  MEDIA_SRC,
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC} ${NOMINATIM_ORIGIN}`,
  `frame-src https://www.google.com ${VIDEO_EMBED_FRAME_SRC} ${EMBED_BLOCK_FRAME_SRC}`,
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const COMMON_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Cross-Origin-Opener-Policy -- audit Lighthouse 16-17 September 2026
  // (Best Practices, "Ensure proper origin isolation with COOP"), TIDAK
  // ADA sama sekali sebelumnya. 'same-origin' aman dipasang di sini: satu
  // per satu dicek SETIAP pemakaian window.open() di codebase ini
  // (LockedLinkButton/ShareButton/BuyProductButton/danger-zone/products)
  // SUDAH memakai flag `noopener` eksplisit, dan login Google (satu-
  // satunya OAuth di sini) adalah REDIRECT PENUH ke accounts.google.com
  // (GoogleAuthButton.tsx), BUKAN popup+postMessage -- jadi tidak ada alur
  // yang bergantung pada window.opener lintas origin yang bisa diputus
  // header ini.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Audit keamanan 15 Agustus 2026: Permissions-Policy restriktif. Jeonme
  // tidak memakai API kamera/mikrofon/geolokasi/USB/pembayaran native dll.
  // Google Maps dirender lewat iframe (frame-src di CSP), BUKAN API
  // geolocation browser, jadi aman di-disable. Mencegah skrip pihak ketiga
  // (Pixel/GA4 di halaman publik kreator) diam-diam meminta izin fitur
  // sensitif. '=()' = tolak semua origin, termasuk same-origin.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()' },
];

// DASHBOARD_SECURITY_HEADERS -- permintaan langsung pengguna, 25 Agustus
// 2026: tombol "Lokasi Saya Saat Ini" di LocationPickerModal.tsx (blok
// Maps) BUTUH navigator.geolocation.getCurrentPosition() sungguhan --
// beda dari asumsi 15 Agustus di atas ("TIDAK memakai API geolokasi
// browser") yang sekarang sudah tidak berlaku LAGI khusus di dashboard.
// 'self' saja (bukan '*') -- kreator memberi izin ke jeon.id sendiri,
// BUKAN mengizinkan skrip pihak ketiga mana pun. Halaman publik/login/
// admin/register TIDAK ikut berubah (tetap pakai COMMON_SECURITY_HEADERS,
// geolocation=() ditolak) -- fitur ini murni dashboard kreator.
const DASHBOARD_SECURITY_HEADERS = COMMON_SECURITY_HEADERS.map((h) =>
  h.key === 'Permissions-Policy'
    ? { key: h.key, value: h.value.replace('geolocation=()', 'geolocation=(self)') }
    : h
);

// ---------------------------------------------------------------------------
// images.remotePatterns -- audit performa 15 September 2026 (temuan: 34 file di
// app/ & components/ memakai <img> mentah, jadi TIDAK ada srcset responsif /
// lazy-loading / optimasi format otomatis sama sekali). Blok `images` di file
// ini SEBELUMNYA TIDAK ADA SAMA SEKALI -- tanpa ini, SETIAP <Image> yang src-nya
// URL absolut akan ditolak (dev: melempar Error dan merusak render; production:
// /_next/image balas 400 dan gambar tampil patah). Jadi daftar di bawah WAJIB
// benar-benar lengkap, bukan tebakan.
//
// KENAPA storage kreator perlu dioptimasi padahal backend SUDAH mengonversi
// gambar dekoratif ke WebP: internal/imageconv (Go) memang sudah WebP + resize
// sisi terpanjang ke maks 1600px (audit Lighthouse 3 September 2026), TAPI itu
// SATU ukuran untuk semua tempat pakai. Avatar 1600px yang dirender 40px (h-10
// w-10 di kartu dashboard) atau sampul produk 1600px yang dirender 48px tetap
// diunduh utuh. Justru srcset per-lebar inilah sisa keuntungan yang belum
// diambil, bukan konversi formatnya.
//
// Host di bawah DIVERIFIKASI satu per satu dari kode/dokumen, BUKAN diasumsikan:
//
// 1. storage.jeonme.com / storage-staging.jeonme.com -- host storage yang
//    BENAR-BENAR melayani traffic HARI INI (CICD-GUIDE.md §2.1 "Tabel Referensi
//    Infrastruktur" + diagram vhost Apache: storage.jeonme.com -> 127.0.0.1:29000,
//    storage-staging.jeonme.com -> 127.0.0.1:29100). JANGAN dihapus.
// 2. storage.jeon.id / storage-staging.jeon.id -- host storage SETELAH migrasi
//    domain (SETUP-GUIDE.md §1.1). Komentar di apps/api/.env.example & internal/
//    storage/s3.go sudah menyebut pasangan .jeon.id ini seolah-olah aktif, TAPI
//    checklist infra di SETUP-GUIDE.md §1.1 masih KOSONG semua (DNS/vhost/TLS
//    belum dieksekusi di VPS). Keduanya didaftarkan sekaligus supaya migrasi
//    domain nanti tidak diam-diam mematahkan SELURUH gambar kreator di produksi
//    -- persis pola "tambahkan jeon.id ke CORS_ALLOWED_ORIGINS, jangan ganti
//    seluruhnya" di checklist yang sama.
// 3. **.googleusercontent.com -- pages.avatar_url BISA berisi URL foto profil
//    Google MENTAH, tidak pernah di-rehost: oauth_google.go createGoogleUser()
//    langsung `INSERT INTO pages (user_id, avatar_url) VALUES ($1, profile.Picture)`.
//    Dikonfirmasi juga oleh business_card_avatar_test.go yang memperlakukan
//    "https://lh3.googleusercontent.com/a/abc" sebagai kasus nyata, dan komentar
//    AvatarProxy di business_card.go ("avatar dari login Google bahkan URL
//    eksternal (googleusercontent)"). Wildcard karena Google memakai lh3/lh4/
//    lh5/lh6. Apple TIDAK perlu didaftar -- oauth_apple.go eksplisit mencatat
//    Apple tidak pernah mengirim foto profil sama sekali.
// 4. img.youtube.com -- links.thumbnail_url BISA berisi URL thumbnail YouTube
//    yang diturunkan otomatis dari ID video (links.go: fmt.Sprintf(
//    "https://img.youtube.com/vi/%s/hqdefault.jpg", id) saat kreator menandai
//    tautan YouTube sebagai "featured"), dan VideoEmbedBlock.tsx
//    getYoutubeThumbnail() membangun URL yang SAMA di sisi klien. i.ytimg.com
//    ikut didaftar karena img.youtube.com me-redirect ke sana untuk sebagian
//    ukuran (image-optimizer Next mengikuti redirect, maksimum 3 kali).
//
// Yang SENGAJA TIDAK didaftarkan (dan callsite-nya sengaja tetap <img> mentah):
// CDN Instagram/TikTok (scontent-*.cdninstagram.com, *.fbcdn.net,
// p16-sign-*.tiktokcdn.com, ...). Host-host itu BERROTASI & URL-nya
// bertanda-tangan + berumur pendek, jadi tidak bisa dienumerasi dengan jujur di
// allowlist, dan meng-cache-nya di image optimizer pun sia-sia karena URL-nya
// berubah tiap fetch. Lihat catatan di PagePreview.tsx renderSocialFeed &
// dashboard/social-connect/page.tsx.
const STORAGE_HOSTNAMES = [
  'storage.jeonme.com',
  'storage-staging.jeonme.com',
  'storage.jeon.id',
  'storage-staging.jeon.id',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' membuat image Docker jauh lebih kecil -- lihat docker/web/Dockerfile
  output: 'standalone',
  reactStrictMode: true,
  // X-Powered-By: Next.js -- fingerprint framework, tidak perlu dibocorkan.
  poweredByHeader: false,

  images: {
    remotePatterns: [
      ...STORAGE_HOSTNAMES.map((hostname) => ({ protocol: 'https', hostname })),
      { protocol: 'https', hostname: '**.googleusercontent.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      // localhost -- MinIO lokal. `port` SENGAJA tidak diisi: matchRemotePattern()
      // Next.js hanya membandingkan port kalau field-nya ada, jadi tanpa `port`
      // pola ini cocok untuk port MANA PUN. Dibutuhkan karena nomor portnya
      // memang berbeda-beda antar setup: 9000 (docker-compose.yml root &
      // apps/api/.env.example) vs 19000 (apps/api/.env di mesin dev ini, dipilih
      // supaya tidak bentrok). Hanya aktif di luar production.
      ...(process.env.NODE_ENV === 'production'
        ? []
        : [{ protocol: 'http', hostname: 'localhost' }]),
    ],
    // dangerouslyAllowLocalIP -- BARU di Next.js 16 (lihat tabel "Version
    // History" di node_modules/next/dist/docs/.../components/image.md), default
    // false. Proteksi SSRF: /_next/image menolak (400) meng-optimasi gambar yang
    // hostname-nya RESOLVE ke IP privat/loopback. Tanpa ini SELURUH gambar
    // kreator di `next dev` lokal patah, karena MinIO lokal ada di
    // http://localhost:19000 -> 127.0.0.1. Digerbang ke non-production supaya
    // proteksi SSRF-nya TETAP UTUH di staging/production (di sana host
    // storage.* resolve ke IP publik VPS, jadi memang tidak butuh flag ini).
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
  },

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
      // /:username/:slug -- revisi 28 Agustus 2026 (permintaan langsung
      // pengguna): URL halaman tambahan pindah dari /p/{slug} (slug unik
      // GLOBAL) ke /{username}/{slug} (slug unik PER-USER, migrasi 000079).
      // Path 2 segmen ini TIDAK bentrok dengan "/:username" 1 segmen di
      // atas (matcher headers() cocok berdasar JUMLAH segmen persis).
      { source: '/:username/:slug', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }] },
      { source: '/card/:username', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }] },
      { source: '/checkout/:id', headers: [...COMMON_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }] },
    ];
    const strictRoutes = [
      { source: '/dashboard/:path*', headers: [...DASHBOARD_SECURITY_HEADERS, { key: 'Content-Security-Policy', value: STRICT_CSP }] },
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
