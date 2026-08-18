# Jeonme

Platform link-in-bio + monetisasi kreator Indonesia (setara Linktree/Lynk.id, tapi
dengan Toko/checkout produk digital bawaan). Domain produksi: jeon.id (migrasi
dari jeonme.com, 18 Agustus 2026 -- jeonme.com tetap aktif, redirect 301 ke
jeon.id, bukan didekomisi).

> Catatan: `README.md`/`DEVELOPER-GUIDE.md`/`SETUP-GUIDE.md` di root masih menyebut
> proyek ini "boilerplate/skeleton dengan banyak TODO" — itu SUDAH TIDAK AKURAT.
> Hampir semua fitur di tabel "belum diimplementasikan" pada README (checkout,
> Midtrans, ledger/payout, analitik, panel admin, dll) SUDAH ada dan berjalan.
> Jangan percaya status di README, cek langsung kode/handler yang relevan.

## Stack

- **Frontend**: `apps/web/` — Next.js 16 (App Router) + React 19 + TypeScript + Tailwind.
- **Backend**: `apps/api/` — Go 1.26 + Gin, pgx/v5 (bukan ORM), migrasi lewat subcommand
  binary sendiri (`./api migrate up/down/status`, gaya golang-migrate, TIDAK perlu CLI
  golang-migrate terpisah — file di `apps/api/migrations/*.up.sql`/`*.down.sql`).
- **Data**: PostgreSQL 16 (banyak kolom JSONB untuk struktur fleksibel, mis.
  `pages.stickers`), Redis 7 (cache halaman publik TTL 30 detik + job queue asynq).
- **Deploy**: Docker + GitHub Actions ke VPS **shared** (Apache jadi reverse proxy
  sistem, BUKAN Nginx+Certbot standalone) — detail lengkap di `CICD-GUIDE.md`.
  Push ke `main` auto-deploy staging; tag rilis auto-deploy production (dengan approval).

## Struktur

```
apps/api/internal/handlers/   satu file per domain fitur (product.go, page.go, checkout.go, ...)
apps/api/internal/routes/     pendaftaran semua route Gin
apps/api/migrations/          NNNNNN_name.{up,down}.sql, urut menaik, jangan renumber yang lama
apps/web/app/                 App Router: halaman publik ([username], p/[slug], card/[username],
                               checkout/[id]) + /dashboard/* (kreator) + /admin/*
apps/web/components/          komponen dipakai bersama dashboard & preview publik
apps/web/lib/api-client.ts    SATU file besar: semua tipe respons API + fungsi fetch
```

## Arsitektur halaman (paling penting untuk dipahami dulu)

Satu akun kreator punya **banyak halaman** (tabel `pages`), dua kategori:

- **Halaman utama** (`is_primary=true`, `page_type` SELALU `'bio'`) — di `jeon.id/{username}`.
  Selalu ada, dibuat saat registrasi.
- **Halaman tambahan** (`is_primary=false`) — di `jeon.id/p/{slug}`, `page_type` salah satu
  dari `bio` / `landing` / `produk`. "Halaman Toko" adalah `page_type='produk'`.
  - Toko **pertama** tiap akun dibuat **otomatis** begitu produk pertama ada
    (`ensureProdukPage`, soft-fail, dipanggil dari `ProductHandler.Create`), slug-nya
    **selalu = username** (bukan slug bebas) — jadi ini beda dari halaman tambahan lain.
  - Toko ke-2..5 (multi-brand, khusus Premium) tetap pakai slug bebas seperti biasa.
  - Kreator gratis: maks 1 Toko + 0 halaman tambahan lain. Premium: sampai 5 Toko +
    beberapa halaman tambahan lain (lihat `freeProdukPageLimit`/`premiumProdukPageLimit`/
    `premiumExtraPageLimit` di `page.go`).
- Katalog produk & seluruh blok monetisasi (donasi/event/booking/loyalty) **dibagi lintas
  SEMUA halaman** milik satu akun (per `user_id`, bukan per `page_id`) — hanya
  bio/avatar/tema/tautan/stiker/watermark-toggle yang independen PER halaman.
- Builder blok/desain (Tema/Header/Tombol/Font/Stiker) untuk halaman utama vs Toko/halaman
  tambahan sengaja **fitur paritas penuh**, tapi lewat dua jalur kode berbeda: `useDesignData.ts`
  + `/dashboard/design/*` untuk halaman utama, `ProdukPageEditor.tsx` (terkontrol dari
  `dashboard/products/page.tsx`) untuk Toko.

## Pola yang WAJIB diikuti

- **Gating Premium**: SELALU dicek ulang di backend lewat `isPremiumUser(ctx, db, userID)`
  (`subscription.go`) — bukan kolom tersendiri, bukan cuma dipercaya dari klien. Field yang
  dikirim ke halaman publik (mis. `hide_watermark`) juga digerbang server-side sebelum
  dikirim (lihat `finishPublicPageResponse` di `page.go`), jangan andalkan frontend saja.
- **Soft-fail untuk operasi sampingan**: SMTP, S3, WhatsApp, `ensureProdukPage`, watermark
  PDF — semuanya gagal diam-diam tanpa menggagalkan aksi utama. Pola yang sama dipakai untuk
  fitur baru yang sifatnya pendukung, bukan inti transaksi.
- **Gambar dekoratif** (avatar, background kustom, ikon link, cover produk — utk halaman
  Bio MAUPUN Toko) otomatis dikonversi ke WebP di backend (`internal/imageconv`, pure-Go
  lewat `nativewebp`, TANPA cgo — Dockerfile API build `CGO_ENABLED=0`). Dokumen KYC dan
  file produk digital TIDAK ikut dikonversi (bukan gambar dekoratif).
- **JSONB array di Postgres** (`pages.stickers`, dll): scan sebagai `[]byte` mentah lalu
  `json.Unmarshal` manual — pgx tidak auto-marshal ke slice Go arbitrer.
- **Migrasi baru**: nomor urut berikutnya, isi komentar panjang menjelaskan KENAPA
  (permintaan pengguna / bug apa) bukan cuma APA — konvensi yang konsisten di seluruh
  `migrations/`, ikuti gaya yang sudah ada.
- **react-hooks/set-state-in-effect** (ESLint, dari `eslint-plugin-react-hooks` v7 bundel
  Next.js 16 project ini): jangan panggil setState di dalam efek (langsung atau lewat
  fungsi yang dipanggil efek) tanpa pola yang benar. Dua pola yang sudah terbukti lolos di
  repo ini:
  1. Pisahkan fungsi pengambil-data murni (return data, TANPA setState) dari fungsi
     penerap-hasil (`useCallback`, isinya setState), lalu `.then(applyResult)` langsung
     dirangkai pada promise yang direturn efek.
  2. Untuk sinkronisasi state lokal dari prop yang berubah: pola resmi React "adjust state
     during render" (bandingkan prop ke `prevXxx` yang dilacak state, panggil setState
     kondisional LANGSUNG di badan komponen, BUKAN di `useEffect`).
- **CSS overflow horizontal**: akar masalah yang berulang di repo ini adalah flex/grid child
  yang defaultnya `min-width:auto` menolak menyusut di bawah ukuran konten — kalau ada bug
  overflow horizontal di dashboard, cek dulu apakah kolom grid/flex terkait butuh `min-w-0`
  eksplisit sebelum mencari penyebab lain.

## Verifikasi lokal (WAJIB sebelum bilang "selesai")

Toolchain Go & Node **tersedia dan berfungsi** di sandbox ini — jangan asumsikan tidak bisa
dijalankan lokal tanpa mencoba dulu.

```bash
# Backend
cd apps/api
go build ./...
go vet ./...
go test ./internal/handlers/...   # test yang butuh DB (DATABASE_URL/REDIS_URL) SKIP otomatis
                                    # kalau env var tidak diset — tidak ada Postgres/Redis lokal
                                    # di sandbox ini, jadi build+vet+test non-DB adalah level
                                    # verifikasi yang realistis dicapai di sini

# Frontend — kalau `npm`/`tsc` gagal karena masalah SSL cert, set dulu:
export NODE_EXTRA_CA_CERTS="/opt/homebrew/Cellar/ca-certificates/2026-07-16/share/ca-certificates/cacert.pem"
cd apps/web
npx tsc --noEmit        # atau: npm run typecheck
npm run lint             # eslint .  ("next lint" SUDAH DIHAPUS di Next.js 16, jangan pakai)
npm run build             # next build (Turbopack)
```

Setelah build/typecheck/test frontend jalan, git akan menandai `apps/web/next-env.d.ts` dan
`apps/web/tsconfig.tsbuildinfo` sebagai berubah — itu **artefak build, bukan perubahan
sungguhan**. Selalu `git checkout -- apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo`
sebelum commit supaya commit tetap scoped ke perubahan yang disengaja. JANGAN commit
`package-lock.json` yang ikut berubah tanpa alasan jelas — repo ini punya riwayat CI break
gara-gara lockfile, jadi kalau tidak sengaja mengubah dependency, revert juga file itu.

Kalau `node_modules` bermasalah (`Permission denied` di `.bin/*`, atau Turbopack bilang cuma
WASM bindings termuat): kemungkinan besar `node_modules` lama ke-build untuk platform yang
salah (mis. Windows). Perbaiki dengan `rm -rf node_modules && npm install` — bukan workaround
lain.

## Workflow yang diharapkan pengguna (dari sesi-sesi sebelumnya)

- Commit segera setelah selesai satu unit kerja ("setiap selesai kerjakan langsung commit"),
  jangan menumpuk banyak perubahan tak terkait dalam satu commit.
- **Push dilakukan sendiri oleh Claude** (`git push`) — pengguna secara eksplisit tidak ingin
  push didelegasikan balik ke mereka. Tetap ikuti aturan umum: jangan force-push, jangan
  skip hooks, konfirmasi dulu untuk operasi berisiko lain.
- Verifikasi nyata (build/vet/typecheck/lint, dan test kalau memungkinkan) sebelum melaporkan
  sesuatu selesai — jangan cuma baca kode dan berasumsi benar.
