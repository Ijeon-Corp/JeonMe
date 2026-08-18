# Jeonme — Boilerplate Monorepo

> **Developer baru bergabung?** Mulai dari **`DEVELOPER-GUIDE.md`** — berisi checklist onboarding, alur kerja git, dan penjelasan cara staging/production bekerja. Dokumen ini (`README.md`) fokus ke setup lokal & catatan versi.

Boilerplate ini mengimplementasikan kerangka awal sesuai:
- `PRD-Jeonme.docx` — lingkup fitur MVP
- `SRS-Jeonme.docx` — requirement fungsional (kode REQ-F-xxx dirujuk langsung di komentar kode)
- `Technical-Design-Document-Jeonme.docx` — arsitektur & tech stack
- `CICD-GUIDE.md` — pipeline CI/CD lengkap

**Stack**: Next.js 14 (frontend) + Golang/Gin (backend) + PostgreSQL 16 + Redis 7 + Docker + GitHub Actions.

> Status: kerangka awal (skeleton). Banyak bagian ditandai `TODO` dan sengaja belum diimplementasikan penuh — lihat daftar di bagian "Yang belum diimplementasikan" di bawah.

## Struktur folder

```
jeonme/
├── apps/
│   ├── web/     # Next.js — halaman publik + dashboard kreator
│   └── api/     # Golang (Gin) — REST API
├── docker/      # Dockerfile & konfigurasi Nginx
├── docker-compose.yml            # local dev
├── docker-compose.staging.yml
├── docker-compose.prod.yml
└── .github/workflows/            # CI/CD (lihat CICD-GUIDE.md untuk penjelasan detail)
```

## Menjalankan secara lokal

Prasyarat: Docker, Docker Compose, (opsional) Go 1.22+ dan Node 20+ jika ingin jalan tanpa Docker.

```bash
# 1. Salin file environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 2. Sesuaikan JWT_SECRET dan kredensial lain di apps/api/.env

# 3. Jalankan seluruh stack
make up

# 4. Jalankan migrasi database (butuh CLI golang-migrate, lihat catatan di bawah)
make migrate-up
```

- Frontend: http://localhost:3000
- API: http://localhost:8080/api/v1
- Health check: http://localhost:8080/api/health

### Menjalankan tanpa Docker (development harian)

```bash
# Backend
cd apps/api
go mod tidy
go run main.go

# Frontend (terminal terpisah)
cd apps/web
npm install
npm run dev
```

## Migrasi database

Boilerplate ini memakai konvensi [golang-migrate](https://github.com/golang-migrate/migrate), tapi dijalankan lewat subcommand bawaan binary sendiri (`internal/migrate`) — **tidak perlu instal CLI golang-migrate terpisah**:

```bash
make migrate-up       # menerapkan migrasi
make migrate-down     # rollback satu langkah
make migrate-status   # cek versi migrasi saat ini
```

File migrasi ada di `apps/api/migrations/`, mengikuti skema pada Bagian 4 Technical Design Document. Pipeline CI/CD (`ci.yml`, `deploy-staging.yml`, `deploy-production.yml`) juga memakai subcommand yang sama (`./api migrate up`) sebelum test dan sebelum setiap deploy — lihat catatan "Audit CI/CD" di bawah.

## Catatan versi & keamanan (per 3 Juli 2026)

Saat menyiapkan boilerplate ini, ditemukan dan diperbaiki beberapa masalah versi yang cukup serius:

- **Next.js dinaikkan dari 14.2.5 ke 16.2.10 LTS.** Next.js 14 sudah *end-of-life* sejak Oktober 2025 (tidak lagi dapat patch keamanan), dan ada rentetan CVE kritis di App Router (termasuk RCE severity 10.0 "React2Shell", CVE-2025-66478) yang memengaruhi versi 13.x–16.x sebelum dipatch. React ikut dinaikkan ke 19.2.7.
- **Node.js dinaikkan dari 20 ke 24 (Active LTS)** di Dockerfile & CI — Node 20 sudah EOL per 30 April 2026.
- **Go dinaikkan dari 1.22 ke 1.25** di `go.mod`, Dockerfile, dan CI — Go hanya mendukung dua rilis mayor terbaru (saat ini 1.25 dan 1.26), jadi 1.22 sudah di luar jendela dukungan.
- Setup ESLint diganti ke flat config (`eslint.config.mjs`) karena `next lint` dihapus total di Next.js 16.
- Route `[username]/page.tsx` disesuaikan dengan breaking change Next.js 16 (route `params` sekarang `Promise`, wajib di-`await`).
- Build frontend (`npm run build`, `npm run lint`, `npm run typecheck`) sudah **diverifikasi benar-benar jalan** di lingkungan pembuatan boilerplate ini.
- Sintaks backend Go **divalidasi dengan `gofmt`** (parse & format berhasil), tapi **belum bisa di-compile penuh** di lingkungan pembuatan boilerplate karena `proxy.golang.org` tidak dapat diakses dari sana. Jalankan `go mod tidy && go build ./...` di mesinmu sendiri sebagai langkah pertama.
- Versi dependency Go (Gin, golang-jwt, pgx, go-redis, dll di `go.mod`) adalah versi yang diketahui valid, tapi bukan hasil pengecekan "versi terbaru per hari ini" karena keterbatasan akses jaringan yang sama. Sebelum production, jalankan `go get -u ./... && go mod tidy` dan review changelog masing-masing untuk breaking changes.
- Masih ada 1 kerentanan moderate (XSS PostCSS) yang dibundel *internal* oleh Next.js sendiri (`node_modules/next/node_modules/postcss`) — bukan dependency langsung proyek ini, kemungkinan akan terpatch di rilis Next.js berikutnya. Pantau `npm audit`.

## Yang belum diimplementasikan (perlu dikerjakan tim)

Ditandai `TODO` di kode, ringkasannya:

| Area | Status | Rujukan |
|---|---|---|
| OAuth Google login | Belum ada | REQ-F-101 |
| Proses KYC (upload identitas) | Belum ada | REQ-F-105 |
| Upload file produk digital + signed URL | Belum ada | REQ-F-301, REQ-F-304 |
| Checkout publik + integrasi Midtrans | Belum ada | REQ-F-401..406 |
| Verifikasi signature webhook PSP | Belum ada (kerangka `middleware` siap ditambah) | REQ-F-403, NF-05 |
| Ledger saldo (tertahan/tersedia) & penarikan dana | Belum ada | REQ-F-501..505 |
| Analitik klik/kunjungan | Belum ada | REQ-F-601..603 |
| Panel admin | Belum ada | REQ-F-701..703 |
| Background job/queue (worker) | Selesai (asynq berbasis Redis, subcommand `./api worker`) | REQ-F-405 |
| Cache Redis untuk halaman publik | Kerangka disiapkan (komentar di `page.go`), belum diisi | NF-01, NF-02 |
| Rate limiting API | Belum ada | NF-05 |
| CI/CD | **Live di production** (`v0.1.0`, 8 Juli 2026) — push ke `main` otomatis deploy ke staging, tag rilis otomatis deploy ke production (dengan approval) — lihat `CICD-GUIDE.md` | — |

## Status Deployment (8 Juli 2026)

Pipeline CI/CD sudah live dan terbukti jalan end-to-end, bukan cuma teori:

- **Production**: https://jeon.id — rilis pertama `v0.1.0` (domain kanonik sejak migrasi 18 Agustus 2026; jeonme.com tetap aktif, redirect 301 ke sini)
- **Staging**: https://staging.jeon.id — auto-deploy dari `main`
- Keduanya dites langsung: `/api/health` mengembalikan `{"status":"ok","checks":{"database":"up","redis":"up"}}`

Ketiga workflow (`ci.yml`, `deploy-staging.yml`, `deploy-production.yml`) sudah lewat audit awal (13/14 temuan diperbaiki) **dan** rollout nyata pertama, yang menemukan **6 bug tambahan** yang tidak ketahuan lewat review kode saja (lowercase GHCR, SSH port non-default, dependency env var yang salah, service Redis hilang di CI, duplikasi entrypoint Docker, race condition healthcheck database). Katalog lengkap tiap bug — gejala, penyebab, perbaikan — ada di `CICD-GUIDE.md` Bagian 11.

Arsitektur deploy juga berubah dari rencana awal: bukan VPS terdedikasi dengan Nginx+Certbot di dalam Docker, tapi VPS **shared** (sudah menjalankan proyek lain) dengan Apache sebagai reverse proxy sistem — lihat `CICD-GUIDE.md` Bagian 2 untuk detail lengkap.

Panduan setup & referensi kondisi deployment saat ini ada di `SETUP-GUIDE.md`.

## Keamanan — jangan lewatkan sebelum production

- Ganti seluruh nilai `CHANGE_ME` di `.env`.
- Jangan pernah commit file `.env` asli (sudah masuk `.gitignore`).
- Aktifkan verifikasi signature webhook PSP sebelum menghubungkan Midtrans mode live.
- Baca checklist go-live lengkap di `CICD-GUIDE.md` bagian 12.
