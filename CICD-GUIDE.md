# Panduan CI/CD Jeonme
### GitHub Actions + Docker + VPS
Versi 1.0 — 3 Juli 2026

Dokumen ini adalah panduan praktis untuk tim Jeonme dalam menyiapkan dan menjalankan pipeline CI/CD. Stack: Next.js (frontend) + Golang/Gin (backend) + PostgreSQL + Redis, dideploy ke VPS Debian menggunakan Docker. Contoh workflow di dokumen ini identik dengan file yang sudah ada di `.github/workflows/` pada boilerplate — dokumen ini menjelaskan *kenapa* tiap bagian ada.

---

## 1. Filosofi Pipeline

- **Setiap push ke `main`** → build, test, lint otomatis. Gagal test = tidak lanjut deploy.
- **Merge ke `main`** (setelah PR di-approve) → auto-deploy ke **staging**.
- **Tag rilis** (`v1.0.0`, dst.) → deploy manual/terkontrol ke **production** (perlu approval).
- **Tidak pernah** deploy langsung dari laptop developer ke production — semua lewat pipeline agar konsisten dan bisa diaudit.
- Docker image dibangun sekali di CI, image yang sama dipakai di staging maupun production (bukan build ulang di server) — menjamin apa yang diuji adalah apa yang dijalankan.

## 2. Struktur Branch & Environment

| Branch | Deploy Otomatis Ke | Catatan |
|---|---|---|
| `feature/*` | Tidak ada (hanya CI test) | Branch kerja harian developer |
| `develop` | (opsional) preview/staging ringan | Integrasi fitur sebelum ke `main` |
| `main` | **staging** (otomatis) | Selalu mencerminkan kondisi siap-QA |
| Tag `v*.*.*` | **production** (manual approval) | Rilis resmi |

## 3. Struktur Repository (contoh monorepo)

```
jeonme/
├── apps/
│   ├── web/              # Next.js (frontend + dashboard)
│   └── api/               # Golang / Gin (backend)
├── docker/
│   ├── web/Dockerfile
│   ├── api/Dockerfile
│   └── nginx/nginx.conf
├── docker-compose.yml           # untuk local dev
├── docker-compose.staging.yml
├── docker-compose.prod.yml
└── .github/workflows/
    ├── ci.yml
    ├── deploy-staging.yml
    └── deploy-production.yml
```

## 4. Dockerfile — Backend Golang (multi-stage, image ramping)

Sudah tersedia di boilerplate pada `docker/api/Dockerfile`:

```dockerfile
FROM golang:1.25-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git

COPY apps/api/go.mod apps/api/go.sum* ./
RUN go mod download

COPY apps/api .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /out/api main.go

FROM alpine:3.20 AS runner
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /out/api ./api
COPY apps/api/migrations ./migrations

EXPOSE 8080
ENTRYPOINT ["./api"]
```

Binary Go dikompilasi statis (`CGO_ENABLED=0`) sehingga image akhir bisa memakai base `alpine` yang sangat kecil (~15-20MB) tanpa runtime tambahan seperti PHP-FPM.

## 5. Dockerfile — Contoh Frontend Next.js

```dockerfile
# docker/web/Dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

> Catatan: `output: 'standalone'` perlu diaktifkan di `next.config.js` agar image runner sekecil mungkin.

## 6. Workflow CI — Test & Build (`.github/workflows/ci.yml`)

Jalan di setiap push dan pull request. Tidak melakukan deploy apa pun. File ini persis sama dengan yang ada di boilerplate — termasuk perbaikan hasil audit CI/CD (lihat komentar inline `Temuan ... (audit CI/CD)` untuk konteks tiap perubahan): migrasi diterapkan ke database test *sebelum* `go test` (menutup celah kritis C3 di mana gate ini sebelumnya lolos tanpa menguji apa pun karena skema kosong), `npm ci` menggantikan `npm install` (temuan sedang M1), tag `:latest` dipublikasikan dari `main` sebagai fallback registry (temuan tinggi H1), dan pemindaian kerentanan non-blocking (`govulncheck`, `npm audit` — temuan sedang M3).

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: jeonme
          POSTGRES_PASSWORD: jeonme
          POSTGRES_DB: jeonme_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U jeonme"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
          cache-dependency-path: apps/api/go.sum

      - name: Download dependencies
        working-directory: apps/api
        run: go mod download

      - name: Vet
        working-directory: apps/api
        run: go vet ./...

      - name: Build binary
        working-directory: apps/api
        run: go build -o bin/api main.go

      - name: Apply migrations to test database
        working-directory: apps/api
        env:
          DATABASE_URL: postgres://jeonme:jeonme@localhost:5432/jeonme_test?sslmode=disable
        # Memakai subcommand migrate bawaan binary (internal/migrate), bukan
        # CLI golang-migrate terpisah -- lihat temuan kritis C3 di audit CI/CD:
        # sebelumnya go test berjalan melawan skema kosong tanpa migrasi apa pun.
        run: ./bin/api migrate up

      - name: Run tests
        working-directory: apps/api
        env:
          APP_ENV: test
          DATABASE_URL: postgres://jeonme:jeonme@localhost:5432/jeonme_test?sslmode=disable
          REDIS_URL: redis://localhost:6379/0
          JWT_SECRET: ci-test-secret
        run: go test ./... -v

      # Non-blocking untuk sekarang (temuan sedang M3 di audit CI/CD) -- jadikan
      # blocking setelah tim terbiasa dengan noise-nya dan backlog awal beres.
      - name: Vulnerability scan (govulncheck)
        working-directory: apps/api
        continue-on-error: true
        run: |
          go install golang.org/x/vuln/cmd/govulncheck@latest
          govulncheck ./...

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"
          cache-dependency-path: apps/web/package-lock.json
      - name: Install dependencies
        working-directory: apps/web
        run: npm ci
      - name: Lint
        working-directory: apps/web
        run: npm run lint
      - name: Type check
        working-directory: apps/web
        run: npm run typecheck
      - name: Build
        working-directory: apps/web
        run: npm run build

      # Non-blocking untuk sekarang (temuan sedang M3 di audit CI/CD).
      - name: Audit dependency vulnerabilities
        working-directory: apps/web
        continue-on-error: true
        run: npm audit --omit=dev --audit-level=high

  build-images:
    needs: [test-backend, test-frontend]
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # Tag :latest hanya dipublikasikan dari main -- dipakai sebagai fallback
      # oleh docker-compose.staging.yml (${IMAGE_TAG:-latest}) sebelum .env di
      # VPS pernah diisi tag sungguhan oleh deploy-staging.yml. Lihat temuan
      # tinggi H1 di audit CI/CD: sebelumnya tidak ada tag fallback yang benar-
      # benar ada di registry, jadi deploy pertama kali akan gagal pull.
      - name: Tentukan tag image tambahan
        id: extra_tag
        run: |
          if [ "${{ github.ref }}" = "refs/heads/main" ]; then
            echo "value=latest" >> "$GITHUB_OUTPUT"
          else
            echo "value=" >> "$GITHUB_OUTPUT"
          fi

      - name: Build & push API image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/api/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/api:${{ github.sha }}
            ${{ steps.extra_tag.outputs.value != '' && format('ghcr.io/{0}/api:{1}', github.repository, steps.extra_tag.outputs.value) || '' }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push Web image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/web/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/web:${{ github.sha }}
            ${{ steps.extra_tag.outputs.value != '' && format('ghcr.io/{0}/web:{1}', github.repository, steps.extra_tag.outputs.value) || '' }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

## 7. Workflow Deploy — Staging (`.github/workflows/deploy-staging.yml`)

Jalan otomatis setelah `ci.yml` sukses di branch `main`. Login ke GHCR dari VPS, terapkan migrasi, baru `docker compose pull && up -d` (lihat komentar `Temuan ... (audit CI/CD)` inline untuk konteks tiap langkah).

```yaml
name: Deploy Staging

on:
  workflow_run:
    workflows: ["CI"]
    branches: [main]
    types: [completed]

jobs:
  deploy:
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      # Temuan kritis C2 (audit CI/CD): tanpa login eksplisit di VPS,
      # `docker compose pull` akan gagal 401/denied terhadap GHCR privat.
      - name: Login GHCR di VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_SSH_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            echo "${{ secrets.GHCR_PAT }}" | docker login ghcr.io -u "${{ secrets.GHCR_USERNAME }}" --password-stdin

      # Sebelumnya staging tidak pernah menjalankan migrasi sama sekali --
      # skema bisa diam-diam ketinggalan dari kode yang di-deploy. Sekarang
      # konsisten dengan deploy-production.yml: migrasi dulu, baru deploy.
      - name: Jalankan migrasi database (staging)
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_SSH_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            set -e
            cd /opt/jeonme
            export IMAGE_TAG=${{ github.event.workflow_run.head_sha }}
            sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${IMAGE_TAG}/" .env
            docker compose -f docker-compose.staging.yml pull api
            docker compose -f docker-compose.staging.yml run --rm api migrate up

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_SSH_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            set -e
            cd /opt/jeonme
            export IMAGE_TAG=${{ github.event.workflow_run.head_sha }}
            sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${IMAGE_TAG}/" .env
            docker compose -f docker-compose.staging.yml pull
            docker compose -f docker-compose.staging.yml up -d --remove-orphans
            docker image prune -f

      # Temuan sedang M2 (audit CI/CD): retry berjeda, bukan satu kali sleep+curl.
      - name: Health check
        run: |
          curl --retry 8 --retry-delay 5 --retry-connrefused --retry-all-errors -sf https://staging.jeonme.com/api/health || exit 1
```

## 8. Workflow Deploy — Production (`.github/workflows/deploy-production.yml`)

Dipicu manual atau saat tag rilis dibuat. Pakai GitHub **Environment** dengan *required reviewers* agar ada gerbang approval sebelum menyentuh production.

Migrasi sekarang benar-benar dieksekusi lewat subcommand `migrate` bawaan image API (`internal/migrate`, lihat Bagian 6) — sebelumnya langkah ini hanya berisi `echo` placeholder (temuan kritis **C1**) dan tidak pernah benar-benar mengubah skema database production.

```yaml
name: Deploy Production

on:
  push:
    tags: ["v*.*.*"]
  workflow_dispatch: {}

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production   # atur "required reviewers" di Settings > Environments
    steps:
      # Temuan kritis C2 (audit CI/CD): GHCR mewarisi visibility repo (default
      # private) -- tanpa login eksplisit di sisi VPS, `docker compose pull`
      # akan gagal 401/denied. Gunakan token read-only khusus VPS (scope
      # read:packages saja), bukan PAT developer pribadi.
      - name: Login GHCR di VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_SSH_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            echo "${{ secrets.GHCR_PAT }}" | docker login ghcr.io -u "${{ secrets.GHCR_USERNAME }}" --password-stdin

      # Temuan kritis C1 (audit CI/CD): sebelumnya langkah ini hanya berisi
      # `echo` placeholder dan TIDAK menjalankan migrasi apa pun. Sekarang
      # memakai subcommand `migrate` bawaan image API yang baru saja di-pull
      # (image sudah membawa folder migrations yang persis cocok dengan versi
      # ini, lihat docker/api/Dockerfile) -- dijalankan lewat `compose run`
      # sekali pakai, terhubung ke network compose yang sama dengan db/redis.
      - name: Jalankan migrasi database (production)
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_SSH_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            set -e
            cd /opt/jeonme
            export IMAGE_TAG=${{ github.sha }}
            sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${IMAGE_TAG}/" .env
            docker compose -f docker-compose.prod.yml pull api
            docker compose -f docker-compose.prod.yml run --rm api migrate up

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_SSH_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            set -e
            cd /opt/jeonme
            export IMAGE_TAG=${{ github.sha }}
            sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${IMAGE_TAG}/" .env
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d --remove-orphans
            docker image prune -f

      # Temuan sedang M2 (audit CI/CD): retry berjeda, bukan satu kali
      # sleep+curl -- container butuh waktu bervariasi untuk siap tergantung
      # kondisi koneksi DB/Redis saat cold start.
      - name: Health check
        run: |
          curl --retry 8 --retry-delay 5 --retry-connrefused --retry-all-errors -sf https://jeonme.com/api/health || exit 1
```

**Wajib** siapkan endpoint `/api/health` di backend (cek koneksi DB + Redis) agar step terakhir benar-benar memverifikasi deploy berhasil, bukan cuma "container jalan".

## 9. Secrets yang Perlu Disiapkan di GitHub

Buka **Settings → Secrets and variables → Actions**, atau lebih baik di level **Environment** (staging/production terpisah):

| Secret | Isi |
|---|---|
| `STAGING_HOST` / `PROD_HOST` | IP atau hostname VPS |
| `STAGING_SSH_USER` / `PROD_SSH_USER` | User deploy khusus (bukan root) |
| `STAGING_SSH_KEY` / `PROD_SSH_KEY` | Private key SSH (buat key khusus deploy, jangan pakai key pribadi) |
| `GITHUB_TOKEN` | Otomatis tersedia, dipakai push ke GHCR dari GitHub Actions runner |
| `GHCR_USERNAME` | Username GitHub yang akan login ke GHCR **dari VPS** (temuan kritis C2) — bisa akun yang sama dengan pemilik PAT di bawah |
| `GHCR_PAT` | Personal Access Token dengan scope `read:packages` **saja** — dipakai VPS untuk `docker login ghcr.io` sebelum `pull`. Jangan pakai token dengan scope lebih luas dari yang perlu, dan simpan sebagai secret Environment (staging/production bisa pakai token yang sama atau terpisah) |

**Praktik keamanan**: buat user `deploy` di VPS dengan akses terbatas (bisa `docker`, tidak bisa `sudo` penuh), dan buat SSH key khusus untuk CI yang bisa dicabut sewaktu-waktu tanpa mengganggu akses developer. `GHCR_PAT` juga sebaiknya dibuat sebagai token khusus (bukan PAT pribadi developer) agar bisa dicabut terpisah.

Selain secrets di atas, siapkan juga **variabel** `.env` di VPS itu sendiri (bukan di GitHub) — lihat `.env.example`, terutama `GHCR_REPO` (harus persis `owner/repo`, lihat Bagian 10) yang sebelumnya adalah placeholder `OWNER` yang mudah terlewat diganti (temuan tinggi H2).

## 10. Contoh `docker-compose.prod.yml` (VPS)

`GHCR_REPO` menggantikan placeholder `OWNER` yang sebelumnya tidak pernah diganti (temuan tinggi H2) — isi di `.env` VPS dengan `owner/repo` GitHub sungguhan, persis seperti yang dipakai `ci.yml` lewat `${{ github.repository }}`. Konfigurasi Nginx juga sudah dipisah per environment: `docker/nginx/conf.d/production/` (dipakai di sini, sudah termasuk server block 443 + TLS — lihat isi filenya untuk instruksi setup Certbot awal) vs `docker/nginx/conf.d/staging/` (HTTP saja, asumsi TLS diterminasi Cloudflare di depan — lihat Technical Design Document §7.1).

```yaml
services:
  web:
    image: ghcr.io/${GHCR_REPO}/web:${IMAGE_TAG}
    restart: unless-stopped
    env_file: .env
    depends_on: [api]

  api:
    image: ghcr.io/${GHCR_REPO}/api:${IMAGE_TAG}
    restart: unless-stopped
    env_file: .env
    depends_on: [db, redis]

  # worker:
  #   image: ghcr.io/${GHCR_REPO}/api:${IMAGE_TAG}
  #   restart: unless-stopped
  #   command: ["./api", "worker"]
  #   env_file: .env
  #   depends_on: [db, redis]
  #   TODO: main.go belum punya subcommand "worker" -- tambahkan job queue
  #   (mis. library "asynq" berbasis Redis) untuk proses async (kirim email,
  #   notifikasi WA, dsb.) sebelum mengaktifkan service ini.

  db:
    image: postgres:16
    restart: unless-stopped
    volumes: ["pgdata:/var/lib/postgresql/data"]
    env_file: .env

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/nginx/conf.d/production:/etc/nginx/conf.d:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on: [web, api]

  # Sekali pakai untuk penerbitan sertifikat awal, rutin (cron di VPS) untuk
  # renewal -- lihat instruksi lengkap di docker/nginx/conf.d/production/jeonme.conf.
  certbot:
    image: certbot/certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: "true"

volumes:
  pgdata:
```

## 11. Zero/Minim-Downtime saat Deploy

Untuk MVP dengan 1 VPS, downtime beberapa detik saat `docker compose up -d` biasanya dapat diterima (Docker akan restart container dengan image baru). Jika ingin benar-benar zero-downtime di fase lanjutan:

- Jalankan 2 instance `api`/`web` di belakang Nginx dengan strategi rolling restart (matikan satu, update, nyalakan, baru lanjut ke instance kedua).
- Atau pindah ke orchestrator yang mendukung rolling update secara native (mis. Docker Swarm mode atau, jika skala sudah besar, Kubernetes) — **bukan prioritas untuk MVP**, cukup dicatat sebagai opsi masa depan.

## 12. Checklist Sebelum Rilis Production Pertama Kali

- [ ] `.env` production sudah pakai kredensial live PSP (bukan sandbox), sudah di-.gitignore, tidak pernah masuk repo.
- [ ] `GHCR_REPO` di `.env` VPS staging & production sudah diisi `owner/repo` sungguhan (bukan placeholder) — lihat Bagian 9/10.
- [ ] Secret `GHCR_USERNAME` + `GHCR_PAT` (scope `read:packages` saja) sudah dibuat dan `docker login ghcr.io` dari VPS sudah diuji manual sekali sebelum mengandalkan pipeline.
- [ ] Endpoint webhook PSP sudah diarahkan ke domain production dan signature verification aktif.
- [ ] Perintah migrasi (`./api migrate up`, lihat Bagian 6-8) sudah teruji berjalan aman berkali-kali (idempoten) di staging — dijalankan otomatis oleh pipeline, bukan manual.
- [ ] Backup otomatis database (mis. `pg_dump` terjadwal cron + upload ke object storage) sudah berjalan sebelum trafik nyata masuk.
- [ ] Sertifikat Certbot awal sudah diterbitkan (lihat instruksi di `docker/nginx/conf.d/production/jeonme.conf`) dan server block 443 aktif; cron renewal sudah terjadwal di VPS.
- [ ] Health check endpoint (`/api/health`) sudah dipasang dan dites gagal→sukses.
- [ ] GitHub Environment "production" sudah diberi *required reviewers* (minimal 1 approval sebelum deploy jalan).
- [ ] Smoke test transaksi dengan uang sungguhan (nominal kecil) sudah dilakukan sebelum go-live publik.

## 13. Alur Kerja Sehari-hari Tim

1. Developer membuat branch dari `develop`/`main`: `feature/nama-fitur`.
2. Push → CI (`ci.yml`) jalan otomatis, developer memastikan hijau sebelum minta review.
3. PR di-review minimal 1 orang → merge ke `main` (squash merge disarankan agar histori bersih).
4. Merge ke `main` men-trigger `deploy-staging.yml` otomatis → tim QA/kreator test di staging.
5. Jika staging OK, buat tag rilis (`git tag v1.2.0 && git push origin v1.2.0`) → `deploy-production.yml` jalan, menunggu approval reviewer → deploy ke jeonme.com.
6. Pantau health check + log setelah deploy; siapkan rencana rollback (redeploy tag/image sebelumnya) jika ada masalah.
