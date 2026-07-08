# Panduan Developer — Jeonme

Versi 1.0 — 8 Juli 2026

Dokumen ini adalah titik masuk utama untuk siapa pun yang bergabung mengerjakan Jeonme — baik developer baru yang belum pernah menyentuh repo ini, maupun sebagai referensi harian "bagaimana cara staging/production bekerja". Dokumen lain (`README.md`, `CICD-GUIDE.md`, `SETUP-GUIDE.md`) tetap jadi rujukan detail; dokumen ini merangkum dan menautkan ke sana supaya tidak perlu loncat-loncat di hari pertama.

---

## Daftar Isi

1. [Ringkasan Proyek](#1-ringkasan-proyek)
2. [Sebelum Mulai — Akses & Tools yang Dibutuhkan](#2-sebelum-mulai--akses--tools-yang-dibutuhkan)
3. [Setup Development Lokal](#3-setup-development-lokal)
4. [Struktur Repository](#4-struktur-repository)
5. [Alur Kerja Git & Kontribusi](#5-alur-kerja-git--kontribusi)
6. [Bagaimana Staging Bekerja](#6-bagaimana-staging-bekerja)
7. [Bagaimana Production Bekerja](#7-bagaimana-production-bekerja)
8. [Environment & Secrets — Ringkasan](#8-environment--secrets--ringkasan)
9. [Troubleshooting & Pertanyaan Umum](#9-troubleshooting--pertanyaan-umum)
10. [Peta Dokumentasi Lain](#10-peta-dokumentasi-lain)

---

## 1. Ringkasan Proyek

Jeonme adalah platform link-in-bio + monetisasi produk digital untuk kreator Indonesia (referensi: Linktree, lynk.id). Lihat `docs/Dokumentasi-Frontend-Jeonme.pdf` dan `docs/Dokumentasi-Backend-Jeonme.pdf` untuk detail fitur, dan `docs/Rencana-Sprint-Jeonme.xlsx` untuk backlog & prioritas kerja saat ini.

**Stack teknis:**

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS |
| Backend | Go 1.25 + Gin |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Container | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Registry image | GitHub Container Registry (GHCR) |

**Status saat ini**: rilis pertama (`v0.1.0`) sudah live di production. Fitur inti (auth dasar, halaman publik, produk — parsial) sudah ada; checkout, saldo/penarikan, dan analitik masih dalam pengerjaan (lihat rencana sprint).

## 2. Sebelum Mulai — Akses & Tools yang Dibutuhkan

Kalau kamu developer baru, minta akses berikut ke pengelola proyek sebelum mulai:

| Akses | Untuk Apa | Wajib? |
|---|---|---|
| Kolaborator repo `Ijeon-Corp/JeonMe` di GitHub | Push branch, buka PR | Wajib |
| — | Akses VPS (SSH) | **Tidak** untuk kerja harian — deploy sepenuhnya lewat CI/CD otomatis. Hanya pengelola infra yang perlu ini. |
| — | GitHub Secrets/Environments | **Tidak** — kamu tidak perlu tahu isi secrets untuk mengembangkan fitur |

**Tools yang perlu diinstal di komputer:**

- Git
- Go 1.25+ ([go.dev](https://go.dev/dl/)) — untuk backend
- Node.js 24+ — untuk frontend
- Docker + Docker Compose — kalau mau jalankan lewat container (opsional, bisa juga jalankan langsung tanpa Docker, lihat Bagian 3)

Tidak perlu tools tambahan untuk kerja sehari-hari (tidak perlu `golangci-lint` terinstal lokal kecuali mau cek sebelum push — lihat Bagian 5).

## 3. Setup Development Lokal

Ringkas dari `README.md` (baca file itu untuk detail lengkap, termasuk troubleshooting versi).

```bash
git clone https://github.com/Ijeon-Corp/JeonMe.git jeonme
cd jeonme

# 1. Salin file environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Sesuaikan JWT_SECRET di apps/api/.env (bebas isi random untuk lokal)

# 2a. Jalankan lewat Docker (paling gampang, semua service sekaligus)
make up
make migrate-up

# 2b. ATAU jalankan tanpa Docker (lebih cepat untuk iterasi harian)
cd apps/api && go run main.go        # terminal 1
cd apps/web && npm install && npm run dev   # terminal 2
```

- Frontend: http://localhost:3000
- API: http://localhost:8080/api/v1
- Health check: http://localhost:8080/api/health

**Sebelum push**, jalankan ini secara lokal supaya tidak kaget CI merah (persis yang dijalankan `ci.yml`):

```bash
cd apps/api
go vet ./...
go test ./... -v
# opsional tapi disarankan: golangci-lint run ./... (kalau sudah terinstal)

cd apps/web
npm run lint
npm run typecheck
npm run build
```

## 4. Struktur Repository

```
jeonme/
├── apps/
│   ├── web/                 # Next.js — halaman publik + dashboard kreator
│   └── api/                 # Go/Gin — REST API
│       └── internal/
│           ├── config/      # Baca & validasi environment variable
│           ├── database/    # Koneksi Postgres (pgxpool) & Redis
│           ├── handlers/    # HTTP handler per modul (auth, page, product, health)
│           ├── middleware/  # CORS, request logger, auth JWT
│           ├── migrate/     # Wrapper golang-migrate (subcommand `migrate`)
│           ├── models/      # Struct Go merepresentasikan tabel DB
│           └── routes/      # Pendaftaran seluruh route
├── docker/                  # Dockerfile api & web
├── docker-compose.yml               # local dev
├── docker-compose.staging.yml       # staging (VPS)
├── docker-compose.prod.yml          # production (VPS)
├── scripts/                 # Skrip operasional (provisioning, backup, rollback, cleanup)
├── docs/                    # Dokumentasi PDF & rencana sprint (Excel)
└── .github/workflows/       # ci.yml, deploy-staging.yml, deploy-production.yml
```

Kode di `internal/handlers` dan `apps/web/app` sering menautkan komentar ke kode requirement (`REQ-F-xxx`) dari SRS — kalau bingung kenapa sebuah endpoint ditulis dengan cara tertentu, cari kode itu di `docs/Dokumentasi-Backend-Jeonme.pdf` / `Dokumentasi-Frontend-Jeonme.pdf`.

## 5. Alur Kerja Git & Kontribusi

Belum ada branch `develop` — semua kerja bercabang langsung dari `main`.

```
main ●───●───●───●───●───●──────────▶  (selalu deploy-able, auto ke staging)
      \       \       \
       feature/x        feature/y      (branch kerja harian, dihapus setelah merge)
        (PR)             (PR)
```

1. **Buat branch** dari `main`: `git checkout -b feature/nama-fitur-singkat`
2. **Commit** — pesan jelas, fokus pada *kenapa* bukan *apa* (`git diff` sudah menunjukkan apa). Tidak ada format commit message yang dipaksakan, tapi ikuti gaya `fix(area): ...` / `feat(area): ...` / `docs: ...` yang sudah ada di histori (`git log --oneline`) kalau bisa.
3. **Push & buka PR** ke `main`. CI (`ci.yml`) jalan otomatis — pastikan hijau (test-backend, test-frontend, build-images) sebelum minta review.
4. **Review minimal 1 orang** → merge (squash merge disarankan supaya histori `main` bersih).
5. Begitu masuk `main` → **otomatis ter-deploy ke staging** dalam beberapa menit (lihat Bagian 6). Tidak perlu langkah manual apa pun.
6. Kalau staging OK dan siap rilis ke publik → lihat Bagian 7 (butuh approval, bukan kerjaan developer biasa sehari-hari kecuali kamu juga jadi reviewer rilis).

**Yang CI cek otomatis di tiap PR** (lihat `CICD-GUIDE.md` §6 untuk detail penuh):
- Backend: `go vet`, `go test` (dengan Postgres+Redis sungguhan), `golangci-lint`, `govulncheck` (non-blocking)
- Frontend: `eslint`, `tsc --noEmit`, `next build`, `npm audit` (non-blocking)
- Image Docker dibangun & di-push ke GHCR (hanya kalau push ke `main`, bukan di PR)

## 6. Bagaimana Staging Bekerja

**Staging = `https://staging.jeonme.com`**, mencerminkan `main` secara real-time.

```
push/merge ke main
     │
     ▼
ci.yml (test-backend, test-frontend, build-images)
     │  sukses
     ▼
deploy-staging.yml  (workflow_run, otomatis)
     │
     ├─ Login GHCR di VPS
     ├─ Jalankan migrasi database
     ├─ Pull image baru + docker compose up -d
     └─ Health check (retry + verifikasi versi)
     │
     ▼
staging.jeonme.com live dengan kode terbaru
```

**Sebagai developer, yang perlu kamu tahu:**
- Tidak ada langkah manual — begitu PR-mu di-merge ke `main`, staging otomatis update dalam ±3-5 menit.
- Cek status: tab **Actions** di GitHub, cari run **"Deploy Staging"** paling atas.
- Cek staging benar-benar jalan versi terbarumu:
  ```bash
  curl https://staging.jeonme.com/api/health
  # respons menyertakan "version": "<sha-commit>" -- cocokkan dengan
  # commit terbarumu di `git log`
  ```
- Kalau **Deploy Staging** merah: itu bukan berarti kodemu salah (CI sudah lolos duluan) — biasanya masalah infra/VPS. Kabari pengelola infra, jangan coba akses VPS sendiri kecuali memang bagian tugasmu.
- Staging **boleh** untuk eksperimen/demo ke tim non-teknis, tapi jangan anggap datanya permanen — database staging terpisah dari production dan bisa di-reset kapan saja.

## 7. Bagaimana Production Bekerja

**Production = `https://jeonme.com`** — hanya berubah lewat **tag rilis**, tidak pernah otomatis dari sekadar push ke `main`.

```
git tag v1.2.0 && git push origin v1.2.0
     │
     ▼
deploy-production.yml terpicu, TERTAHAN menunggu approval
     │  (GitHub Environment "production" punya required reviewer)
     ▼
Reviewer klik "Review deployments → Approve and deploy"
     │
     ▼
Login GHCR → migrasi → deploy → health check (verifikasi versi)
     │
     ▼
jeonme.com live dengan rilis ini
```

**Cara membuat rilis** (biasanya dikerjakan lead/pengelola rilis, bukan tiap developer per-PR):

1. Pastikan staging sudah diuji dan OK.
2. Tentukan nomor versi ([semver](https://semver.org): `v1.2.0` untuk fitur baru, `v1.2.1` untuk bugfix kecil).
3. ```bash
   git checkout main && git pull
   git tag v1.2.0
   git push origin v1.2.0
   ```
4. Buka tab **Actions** → **Deploy Production** akan menunggu di status "Waiting" → reviewer approve.
5. Verifikasi: `curl https://jeonme.com/api/health` — cek field `version` cocok dengan sha yang di-tag.

**Kalau ada masalah setelah rilis (rollback):**

Tanpa perlu SSH manual — di tab Actions, jalankan ulang **Deploy Production** lewat **Run workflow**, isi input `image_tag` dengan sha commit rilis sebelumnya yang diketahui sehat (lihat histori run yang sukses, atau `git log --oneline`). Lihat `CICD-GUIDE.md` §8 untuk detail mekanismenya, dan `scripts/rollback.sh` sebagai jalan pintas manual via SSH kalau Actions sendiri tidak bisa diakses.

> **Penting**: rollback image saja tidak menjalankan migrasi turun. Kalau rilis yang bermasalah sudah mengubah skema database secara tidak backward-compatible, rollback butuh keputusan manual tambahan — bukan sekadar redeploy tag lama.

## 8. Environment & Secrets — Ringkasan

Kamu **tidak perlu** tahu isi secrets untuk mengembangkan fitur. Ringkasan untuk konteks (detail penuh di `CICD-GUIDE.md` §9):

- **GitHub Secrets** (per Environment `staging`/`production`): kredensial SSH ke VPS + token GHCR. Dikelola lewat Settings repo, bukan file di repo.
- **`.env` di VPS** (`/opt/jeonme-production/.env`, `/opt/jeonme-staging/.env`): kredensial database, `JWT_SECRET`, dsb — **beda nilai** antara staging dan production, tidak pernah masuk git.
- **`.env` di lokalmu** (`apps/api/.env`, `apps/web/.env.local`): kamu isi sendiri saat setup (Bagian 3), bebas nilainya asal valid, tidak pernah dipakai environment lain.

Kalau kerja butuh menambah environment variable baru (mis. integrasi API baru), update `*.env.example` di repo (placeholder, bukan nilai asli) dan informasikan ke pengelola infra supaya nilai sungguhannya ditambahkan ke `.env` VPS staging & production.

## 9. Troubleshooting & Pertanyaan Umum

**CI merah di PR-ku, kenapa?**
Buka run yang gagal di tab Actions, expand step yang merah, baca error-nya. Kalau terlihat seperti masalah infra (bukan kode kamu), cek `CICD-GUIDE.md` §11 (katalog bug) — mungkin sudah pernah terjadi dan dicatat penyebabnya.

**Staging tidak ter-update padahal PR-ku sudah di-merge.**
Cek tab Actions — kemungkinan **Deploy Staging** gagal (lihat Bagian 6). Bisa juga masih dalam proses (tunggu beberapa menit). Field `version` di `/api/health` adalah cara paling pasti mengonfirmasi versi apa yang sungguhan jalan.

**Aku butuh mengubah migrasi database.**
Tambah file baru di `apps/api/migrations/` mengikuti konvensi [golang-migrate](https://github.com/golang-migrate/migrate) (`00000X_nama_deskriptif.up.sql` + `.down.sql`). Jangan edit migrasi yang sudah ada dan sudah pernah di-deploy — selalu tambah migrasi baru. Migrasi diterapkan otomatis oleh pipeline (lihat `internal/migrate/migrate.go`), tidak perlu langkah manual.

**Aku ingin tes perubahan sebelum masuk staging (butuh environment sendiri).**
Belum ada preview environment per-PR — jalankan lokal (Bagian 3) untuk iterasi cepat, dan staging untuk pengujian sebelum rilis. Ini area yang bisa diperluas nanti kalau kebutuhan tim tumbuh.

**Aku tidak yakin fitur X sudah ada atau belum.**
Cek `docs/Dokumentasi-Backend-Jeonme.pdf` / `Dokumentasi-Frontend-Jeonme.pdf` bagian "Status Implementasi vs SRS", atau `docs/Rencana-Sprint-Jeonme.xlsx` untuk peta backlog per sprint.

## 10. Peta Dokumentasi Lain

| Dokumen | Isi | Kapan Dibaca |
|---|---|---|
| `README.md` | Setup lokal detail, catatan versi & keamanan | Hari pertama, setup environment |
| `CICD-GUIDE.md` | Arsitektur infrastruktur lengkap, isi tiap workflow, katalog bug, checklist go-live | Kalau perlu paham/debug pipeline lebih dalam |
| `SETUP-GUIDE.md` | Catatan kondisi deployment nyata (VPS, port, dsb) + template setup VPS baru | Kalau mengelola infra atau setup environment baru |
| `docs/Dokumentasi-Frontend-Jeonme.pdf` | Detail struktur & status implementasi frontend | Kerja di `apps/web` |
| `docs/Dokumentasi-Backend-Jeonme.pdf` | Detail struktur, routing, skema DB, status implementasi backend | Kerja di `apps/api` |
| `docs/Dokumentasi-Docker-Infrastruktur-Jeonme.pdf` | Dockerfile, docker-compose, Nginx/Apache, TLS | Kerja dengan container/deployment |
| `docs/Dokumentasi-CICD-Deployment-Jeonme.pdf` | Ringkasan pipeline dalam format PDF | Referensi offline/presentasi |
| `docs/Rencana-Sprint-Jeonme.xlsx` | Backlog task per sprint, status, prioritas | Cari kerjaan / lapor progres |
