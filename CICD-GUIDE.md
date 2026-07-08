# Panduan CI/CD Jeonme
### GitHub Actions + Docker + VPS Shared (Apache)
Versi 2.0 — 8 Juli 2026 (rilis pertama `v0.1.0` sudah live di production)

Dokumen ini adalah panduan lengkap pipeline CI/CD Jeonme — bagaimana cara kerjanya, bagaimana infrastruktur nyata disusun, dan katalog bug yang ditemukan (dan diperbaiki) selama rollout pertama. Semua contoh di dokumen ini **identik** dengan file yang sungguhan ada di `.github/workflows/` dan `docker-compose*.yml` — bukan contoh generik.

> **Perubahan besar dari v1.0**: v1.0 mengasumsikan VPS terdedikasi dengan Nginx + Certbot berjalan **di dalam** Docker Compose. Rencana itu berubah total begitu diketahui VPS yang tersedia adalah **server shared** yang sudah menjalankan puluhan situs klien lain lewat Apache. Lihat Bagian 2 untuk arsitektur yang benar-benar dipakai.

---

## 1. Filosofi Pipeline

- **Setiap push ke `main`** → build, test, lint otomatis. Gagal test = tidak lanjut deploy.
- **Merge ke `main`** (setelah PR di-approve) → auto-deploy ke **staging**.
- **Tag rilis** (`v1.0.0`, dst.) → deploy manual/terkontrol ke **production** (perlu approval).
- **Tidak pernah** deploy langsung dari laptop developer ke production — semua lewat pipeline agar konsisten dan bisa diaudit.
- Docker image dibangun sekali di CI, image yang sama dipakai di staging maupun production (bukan build ulang di server) — menjamin apa yang diuji adalah apa yang dijalankan.

## 2. Arsitektur Infrastruktur Nyata

Jeonme di-deploy ke **satu VPS shared** (`103.147.33.34`, Debian 12) yang sudah menjalankan puluhan situs klien lain (blog, ERP, HRIS, dsb.) lewat **Apache** sebagai reverse proxy tunggal untuk semua domain di server itu. Karena itu arsitektur deploy Jeonme sengaja **berbeda** dari asumsi awal TDD/CICD-GUIDE v1.0 (yang membayangkan VPS terdedikasi dengan Nginx+Certbot sendiri di dalam Docker):

- **Tidak ada Nginx/Certbot di dalam `docker-compose.staging.yml`/`.prod.yml`** — port 80/443 host sudah dipakai Apache untuk domain lain, tidak boleh direbut container lain.
- Container `web` dan `api` di-bind **hanya ke `127.0.0.1`** pada port unik per environment (tidak pernah diekspos ke publik langsung).
- **Apache** (sudah terpasang & dikonfigurasi untuk semua situs lain di server ini) yang mem-proxy domain publik ke port-port tersebut, dan **Certbot** (sudah terpasang, dipakai `certbot.timer` sistem yang jalan 2x sehari untuk semua sertifikat termasuk milik Jeonme) yang menerbitkan & memperpanjang TLS.
- **Staging dan production dipisah lewat direktori**, bukan lewat VPS terpisah: `/opt/jeonme-staging` dan `/opt/jeonme-production`, masing-masing dengan `.env` dan `docker-compose*.yml` sendiri.

```
Internet
   │
   ▼
Cloudflare (proxied DNS untuk jeonme.com & staging.jeonme.com)
   │
   ▼
Apache :80/:443 di 103.147.33.34 (juga melayani puluhan domain lain)
   │
   ├── jeonme.com, www.jeonme.com ────────┐
   │     /api/  → 127.0.0.1:28080         │  (docker-compose.prod.yml,
   │     /      → 127.0.0.1:23000         │   /opt/jeonme-production)
   │                                       │
   └── staging.jeonme.com ─────────────────┤
         /api/  → 127.0.0.1:28180          │  (docker-compose.staging.yml,
         /      → 127.0.0.1:23100          │   /opt/jeonme-staging)
```

### 2.1 Tabel Referensi Infrastruktur

| Item | Production | Staging |
|---|---|---|
| Domain | `jeonme.com`, `www.jeonme.com` | `staging.jeonme.com` |
| Direktori di VPS | `/opt/jeonme-production` | `/opt/jeonme-staging` |
| File compose | `docker-compose.prod.yml` | `docker-compose.staging.yml` |
| Port web (127.0.0.1) | `23000` | `23100` |
| Port api (127.0.0.1) | `28080` | `28180` |
| Vhost Apache | `/etc/apache2/sites-available/jeonme.com.conf` | `/etc/apache2/sites-available/staging.jeonme.com.conf` |
| Sertifikat TLS | `/etc/letsencrypt/live/jeonme.com/` | `/etc/letsencrypt/live/staging.jeonme.com/` |
| Trigger deploy | Tag `v*.*.*` + approval | Otomatis setelah CI sukses di `main` |

- **VPS**: `103.147.33.34`, SSH port `61512` (bukan port default 22 — **wajib** diisi lewat secret `*_SSH_PORT`, lihat Bagian 9).
- **User deploy**: `deploy` (anggota grup `docker`, **tanpa** akses `sudo`) — dipilih daripada root persis karena server ini shared dengan banyak klien lain; kalau SSH key CI ini bocor, dampaknya terbatas ke container Jeonme, bukan seluruh server.
- **Renewal TLS**: sudah ditangani `certbot.timer` sistem yang sudah berjalan (cek 2x sehari, otomatis mencakup sertifikat baru begitu diterbitkan) — **tidak perlu** cron tambahan khusus Jeonme.

## 3. Struktur Repository

```
jeonme/
├── apps/
│   ├── web/              # Next.js 16 (frontend + dashboard)
│   └── api/               # Golang 1.25 / Gin (backend)
├── docker/
│   ├── web/Dockerfile
│   ├── api/Dockerfile
│   └── nginx/              # TIDAK dipakai di deployment shared-VPS saat ini --
│                            # disimpan sebagai referensi kalau nanti pindah ke
│                            # VPS terdedikasi (lihat Bagian 2 & 10).
├── docker-compose.yml           # local dev
├── docker-compose.staging.yml
├── docker-compose.prod.yml
├── scripts/
│   ├── provision-vps.sh
│   ├── issue-certbot-cert.sh
│   └── rollback.sh
└── .github/workflows/
    ├── ci.yml
    ├── deploy-staging.yml
    └── deploy-production.yml
```

## 4. Dockerfile — Backend Golang (multi-stage, image ramping)

```dockerfile
# docker/api/Dockerfile
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

> **Penting**: `ENTRYPOINT` sudah `./api`. Setiap kali memanggil `docker compose run --rm api <command>`, `<command>` adalah argumen yang ditambahkan **setelah** entrypoint — jangan tulis `./api migrate up` (akan jadi `./api ./api migrate up`, dua kali), cukup `migrate up`. Ini persis bug nyata yang ditemukan di rollout pertama, lihat Bagian 11.

Binary Go dikompilasi statis (`CGO_ENABLED=0`) sehingga image akhir bisa memakai base `alpine` yang sangat kecil (~15-20MB).

## 5. Dockerfile — Frontend Next.js

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

> `output: 'standalone'` wajib aktif di `next.config.js` agar image runner sekecil mungkin (sudah aktif).

## 6. Workflow CI — Test & Build (`.github/workflows/ci.yml`)

Jalan di setiap push dan pull request ke `main`/`develop`. Tidak melakukan deploy apa pun.

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
      # Sebelumnya tidak ada service Redis sama sekali di sini walau
      # health_test.go butuh koneksi Redis sungguhan -- REDIS_URL menunjuk
      # ke localhost:6379 yang tidak pernah ada yang dengarkan, jadi test
      # selalu gagal "connection refused".
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
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
          DATABASE_URL: postgres://jeonme:jeonme@127.0.0.1:5432/jeonme_test?sslmode=disable
        run: ./bin/api migrate up

      - name: Run tests
        working-directory: apps/api
        env:
          APP_ENV: test
          DATABASE_URL: postgres://jeonme:jeonme@127.0.0.1:5432/jeonme_test?sslmode=disable
          REDIS_URL: redis://127.0.0.1:6379/0
          JWT_SECRET: ci-test-secret
        run: go test ./... -v

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

      # GHCR HANYA menerima nama repository huruf kecil, sedangkan
      # ${{ github.repository }} mengembalikan case asli repo
      # (mis. "Ijeon-Corp/JeonMe") -- tanpa langkah ini, push image gagal
      # "invalid reference format".
      - name: Nama repository huruf kecil (wajib untuk GHCR)
        id: repo
        run: echo "lower=${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"

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
            ghcr.io/${{ steps.repo.outputs.lower }}/api:${{ github.sha }}
            ${{ steps.extra_tag.outputs.value != '' && format('ghcr.io/{0}/api:{1}', steps.repo.outputs.lower, steps.extra_tag.outputs.value) || '' }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push Web image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/web/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ steps.repo.outputs.lower }}/web:${{ github.sha }}
            ${{ steps.extra_tag.outputs.value != '' && format('ghcr.io/{0}/web:{1}', steps.repo.outputs.lower, steps.extra_tag.outputs.value) || '' }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

## 7. Workflow Deploy — Staging (`.github/workflows/deploy-staging.yml`)

Trigger: `workflow_run` setelah `CI` sukses di `main`.

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
      - name: Login GHCR di VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_SSH_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          port: ${{ secrets.STAGING_SSH_PORT }}
          script: |
            echo "${{ secrets.GHCR_PAT }}" | docker login ghcr.io -u "${{ secrets.GHCR_USERNAME }}" --password-stdin

      - name: Jalankan migrasi database (staging)
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_SSH_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          port: ${{ secrets.STAGING_SSH_PORT }}
          script: |
            set -e
            cd /opt/jeonme-staging
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
          port: ${{ secrets.STAGING_SSH_PORT }}
          script: |
            set -e
            cd /opt/jeonme-staging
            export IMAGE_TAG=${{ github.event.workflow_run.head_sha }}
            sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${IMAGE_TAG}/" .env
            docker compose -f docker-compose.staging.yml pull
            docker compose -f docker-compose.staging.yml up -d --remove-orphans
            docker image prune -f

      - name: Health check
        run: |
          curl --retry 8 --retry-delay 5 --retry-connrefused --retry-all-errors -sf https://staging.jeonme.com/api/health || exit 1
```

## 8. Workflow Deploy — Production (`.github/workflows/deploy-production.yml`)

Trigger: push tag `v*.*.*` atau manual (`workflow_dispatch`). Environment `production` punya **required reviewers** — deploy tertahan menunggu approval manual sebelum langkah apa pun jalan.

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
      - name: Login GHCR di VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_SSH_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          port: ${{ secrets.PROD_SSH_PORT }}
          script: |
            echo "${{ secrets.GHCR_PAT }}" | docker login ghcr.io -u "${{ secrets.GHCR_USERNAME }}" --password-stdin

      - name: Jalankan migrasi database (production)
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_SSH_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          port: ${{ secrets.PROD_SSH_PORT }}
          script: |
            set -e
            cd /opt/jeonme-production
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
          port: ${{ secrets.PROD_SSH_PORT }}
          script: |
            set -e
            cd /opt/jeonme-production
            export IMAGE_TAG=${{ github.sha }}
            sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${IMAGE_TAG}/" .env
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d --remove-orphans
            docker image prune -f

      - name: Health check
        run: |
          curl --retry 8 --retry-delay 5 --retry-connrefused --retry-all-errors -sf https://jeonme.com/api/health || exit 1
```

**Wajib**: endpoint `/api/health` mengecek koneksi DB + Redis sungguhan (bukan cuma "container jalan") — lihat `internal/handlers/health.go`.

## 9. Secrets & GitHub Environments

Repo → **Settings → Environments** → buat `staging` dan `production`, isi secrets berikut di masing-masing:

| Secret | Isi | Nilai (deployment saat ini) |
|---|---|---|
| `STAGING_HOST` / `PROD_HOST` | IP VPS | `103.147.33.34` (sama untuk keduanya — 1 VPS shared) |
| `STAGING_SSH_USER` / `PROD_SSH_USER` | User deploy | `deploy` |
| `STAGING_SSH_PORT` / `PROD_SSH_PORT` | Port SSH | `61512` (**bukan** 22 — VPS ini pakai port non-default) |
| `STAGING_SSH_KEY` / `PROD_SSH_KEY` | Private key SSH khusus CI | Sama untuk keduanya, terpasang di `/home/deploy/.ssh/authorized_keys` |
| `GHCR_USERNAME` | Username GitHub pemilik PAT | — |
| `GHCR_PAT` | Personal Access Token scope `read:packages` **saja** | — |
| `GITHUB_TOKEN` | Otomatis tersedia | dipakai `build-images` push ke GHCR |

**Praktik keamanan yang dipakai**: user `deploy` di VPS anggota grup `docker`, **tanpa** akses `sudo` — dipilih secara sadar karena VPS ini shared dengan puluhan klien lain (lihat Bagian 2). SSH key khusus CI (bukan key pribadi developer) supaya bisa dicabut sewaktu-waktu tanpa mengganggu akses siapa pun.

Selain secrets GitHub, siapkan juga **variabel `.env`** langsung di tiap direktori VPS (`/opt/jeonme-production/.env`, `/opt/jeonme-staging/.env`) — lihat `.env.example`. Yang penting: `GHCR_REPO` harus **huruf kecil** (`ijeon-corp/jeonme`), `WEB_HOST_PORT`/`API_HOST_PORT` sesuai Bagian 2.1, dan `IMAGE_TAG=latest` harus ada persis seperti itu di baris awal supaya `sed` di workflow bisa menimpanya.

## 10. `docker-compose.prod.yml` — Referensi Lengkap

```yaml
# VPS ini adalah server SHARED yang sudah menjalankan banyak proyek lain di
# balik Apache (reverse proxy + TLS per-domain via certbot --apache di level
# sistem, bukan di dalam Docker). Karena itu stack ini SENGAJA tidak punya
# service nginx/certbot sendiri.
services:
  web:
    image: ghcr.io/${GHCR_REPO}/web:${IMAGE_TAG}
    restart: unless-stopped
    env_file: .env
    depends_on: [api]
    ports:
      - "127.0.0.1:${WEB_HOST_PORT:-3000}:3000"

  api:
    image: ghcr.io/${GHCR_REPO}/api:${IMAGE_TAG}
    restart: unless-stopped
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    ports:
      - "127.0.0.1:${API_HOST_PORT:-8080}:8080"

  # worker: (belum aktif -- lihat Bagian 12, temuan L4)

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes: ["pgdata:/var/lib/postgresql/data"]
    env_file: .env
    # Tanpa healthcheck ini, `docker compose run --rm api migrate ...` bisa
    # mulai sebelum Postgres benar-benar siap menerima koneksi -- lihat
    # Bagian 11, bug #6.
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-jeonme}"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pgdata:
```

`docker-compose.staging.yml` identik strukturnya, hanya beda nama volume (`pgdata_staging`) dan `IMAGE_TAG` punya fallback `:-latest` (staging boleh fallback ke tag `latest` sebelum deploy pertama; production tidak — harus selalu diisi tag eksplisit oleh workflow).

### 10.1 Apache Vhost (contoh production, `jeonme.com.conf`)

```apache
<VirtualHost *:80>
    ServerName jeonme.com
    ServerAlias www.jeonme.com

    Alias /.well-known/acme-challenge/ /var/www/certbot/.well-known/acme-challenge/
    <Directory /var/www/certbot/.well-known/acme-challenge/>
        Options None
        AllowOverride None
        Require all granted
    </Directory>

    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
    RewriteRule ^/?(.*)$ https://%{SERVER_NAME}/$1 [R=301,L]
</VirtualHost>

<VirtualHost *:443>
    ServerName jeonme.com
    ServerAlias www.jeonme.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/jeonme.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/jeonme.com/privkey.pem

    ProxyPreserveHost On
    ProxyRequests Off
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass        /.well-known/acme-challenge/ !

    ProxyPass        /api/  http://127.0.0.1:28080/api/
    ProxyPassReverse /api/  http://127.0.0.1:28080/api/
    ProxyPass        /  http://127.0.0.1:23000/
    ProxyPassReverse /  http://127.0.0.1:23000/

    ErrorLog  ${APACHE_LOG_DIR}/jeonme.com_error.log
    CustomLog ${APACHE_LOG_DIR}/jeonme.com_access.log combined
</VirtualHost>
```

Vhost staging (`staging.jeonme.com.conf`) sama persis, ganti domain dan port ke `23100`/`28180`.

## 11. Katalog Bug Rollout &amp; Review Lanjutan (8 Juli 2026)

Sepuluh bug/celah nyata ditemukan lewat proses coba-jalan-sungguhan dan inspeksi langsung VPS (bukan review kode saja). Dicatat di sini supaya tidak terulang dan sebagai referensi debugging kalau muncul gejala serupa.

| # | Gejala | Penyebab | Perbaikan |
|---|---|---|---|
| 1 | `build-images` gagal "invalid reference format" | GHCR menolak nama repo berhuruf besar (`Ijeon-Corp/JeonMe`), `${{ github.repository }}` mengembalikan case asli | Tambah step lowercase (`${GITHUB_REPOSITORY,,}`) sebelum dipakai sebagai tag image |
| 2 | Semua step SSH gagal connect | VPS pakai port SSH `61512`, `appleboy/ssh-action` default ke port 22 | Tambah parameter `port:` di tiap step, dibaca dari secret `*_SSH_PORT` |
| 3 | `ci/test-backend` gagal di step migrasi: `JWT_SECRET belum diset` | `config.Load()` mewajibkan seluruh env termasuk `JWT_SECRET` walau dipanggil dari subcommand `migrate` yang cuma butuh `DATABASE_URL` | Tambah `config.LoadDatabaseURL()` yang scoped khusus migrate |
| 4 | `ci/test-backend` gagal: `dial tcp [::1]:6379: connect: connection refused` | Job `test-backend` tidak pernah punya service Redis, cuma Postgres | Tambah service `redis:7-alpine` ke job; sekalian ganti `localhost`→`127.0.0.1` di semua connection string |
| 5 | Deploy Staging "sukses" tapi container `api`/`web` tidak pernah nyala, log menunjukkan API server malah start penuh saat migrasi | `docker compose run --rm api ./api migrate up` — image sudah `ENTRYPOINT ["./api"]`, jadi command efektifnya `./api ./api migrate up`; `os.Args[1]` jadi `"./api"`, bukan `"migrate"` | Ganti command jadi `migrate up` saja (tanpa `./api` di depan) |
| 6 | Deploy Production gagal migrasi: `dial tcp ...5432: connect: connection refused` | `api` `depends_on: [db, redis]` tanpa kondisi — compose cuma menunggu container db "Started", bukan Postgres benar-benar siap menerima koneksi (race condition) | Tambah `healthcheck: pg_isready` ke `db`, ubah `depends_on` jadi `condition: service_healthy` |
| 7 | Staging diam-diam menjalankan image commit lama padahal `.env` sudah menunjuk commit terbaru — ketahuan lewat inspeksi manual, bukan dari Actions | Kemungkinan step "Deploy via SSH" gagal transient setelah step migrasi sempat menimpa `IMAGE_TAG` di `.env`; health check tidak bisa mendeteksi ini karena cuma cek "server merespons ok" | `/api/health` sekarang mengembalikan field `version` (commit sha, disuntik `-ldflags -X` saat build); step Health check di kedua workflow deploy memverifikasi field ini cocok dengan commit yang di-deploy — kalau tidak, job gagal eksplisit |
| 8 | `govulncheck` sudah ada di CI sejak awal (non-blocking) tapi tidak pernah benar-benar dicek isinya | Ternyata melaporkan 15 kerentanan *reachable*, 3 di antaranya dependency langsung dengan patch tersedia (`golang-jwt` di jalur auth, `pgx`, `go-redis`) | Upgrade ketiganya ke versi patched; 12 sisanya kerentanan Go stdlib, otomatis teratasi saat base image `golang:1.25-alpine` menarik patch 1.25.x terbaru |
| 9 | Container log tidak dibatasi ukurannya | Driver `json-file` default tanpa `max-size`/`max-file` — risiko disk penuh pelan-pelan di server yang jalan lama | Tambah `max-size: 10m`, `max-file: 3` ke semua service via YAML anchor, staging &amp; production |
| 10 | Image Docker jeonme menumpuk terus (12 image dalam &lt;24 jam) | `docker image prune -f` yang sudah ada di deploy-*.yml cuma menghapus image *dangling* (tak bertag), bukan image lama yang masih bertag | `scripts/cleanup-old-images.sh` — dibatasi hanya ke image `ghcr.io/*/jeonme/*` (VPS shared, tidak boleh sentuh image tenant lain), dijadwalkan cron mingguan (Minggu 04:00) |

Bug #1–6 diperbaiki di commit `edae5a8` s.d. `f6c6010`; #7–10 di commit `47c51f4` s.d. `c421ab0`. Semua diverifikasi manual langsung di VPS sebelum dan sesudah fix, bukan cuma lewat CI.

## 12. Yang Belum Dikerjakan

- ~~**L2**: Rollback belum otomatis~~ — **selesai**: `deploy-staging.yml` & `deploy-production.yml` menerima input `workflow_dispatch` opsional `image_tag` untuk rollback lewat GitHub Actions UI. `scripts/rollback.sh` tetap ada sebagai fallback SSH manual.
- ~~**L3**: Linting Go masih minim~~ — **selesai**: `golangci-lint` (errcheck, staticcheck, unused, gosimple, ineffassign, bodyclose) ditambahkan ke job `test-backend`, config di `apps/api/.golangci.yml`.
- ~~**CI `build-images` jalan juga di `develop`**~~ — **selesai**: dibatasi ke `main` saja.
- **Backup database** — `scripts/backup-database.sh` (pg_dump + gzip + retensi 14 hari lokal) sudah dibuat dan diuji langsung di VPS untuk staging & production. **Belum** dijadwalkan cron dan **belum** ada upload offsite ke object storage (MinIO/R2 belum disiapkan) — backup lokal saja tidak cukup untuk skenario VPS hilang total.
- **L4**: Service `worker` untuk job queue async (email, notifikasi WA) belum ada subcommand-nya di `main.go` — sengaja ditunda karena belum ada pekerjaan async nyata untuk diproses (checkout & notifikasi belum dibangun, lihat rencana sprint Sprint 2/3). Membangun infrastruktur queue sebelum ada job yang butuh antre adalah kerja sia-sia.

## 13. Zero/Minim-Downtime saat Deploy

Untuk MVP dengan 1 VPS, downtime beberapa detik saat `docker compose up -d` biasanya dapat diterima. Jika ingin benar-benar zero-downtime di fase lanjutan: jalankan 2 instance `api`/`web` di belakang Apache dengan rolling restart, atau pindah ke orchestrator (Docker Swarm/Kubernetes) — bukan prioritas MVP.

## 14. Checklist Sebelum Rilis Production Berikutnya

- [x] `GHCR_REPO` di `.env` VPS staging & production sudah diisi `ijeon-corp/jeonme` (huruf kecil).
- [x] Secret `GHCR_USERNAME` + `GHCR_PAT` sudah dibuat dan `docker login` teruji.
- [x] Secret `*_SSH_PORT` sudah diisi `61512`.
- [x] Perintah migrasi teruji idempoten, dijalankan otomatis oleh pipeline.
- [x] Sertifikat TLS terbit untuk `jeonme.com`, `www.jeonme.com`, `staging.jeonme.com`; renewal tercakup `certbot.timer` sistem.
- [x] Health check endpoint teruji gagal→sukses (real rollout, bukan simulasi).
- [x] GitHub Environment "production" sudah diberi *required reviewers*.
- [ ] `.env` production sudah pakai kredensial live PSP (Xendit) — **belum**, masih kosong (fitur checkout belum dikerjakan, lihat rencana sprint).
- [ ] Backup otomatis database production — **belum**.
- [ ] Smoke test transaksi dengan uang sungguhan — **belum relevan** sampai fitur checkout ada.

## 15. Alur Kerja Sehari-hari Tim

1. Developer membuat branch dari `main`: `feature/nama-fitur`.
2. Push → CI (`ci.yml`) jalan otomatis, developer memastikan hijau sebelum minta review.
3. PR di-review minimal 1 orang → merge ke `main` (squash merge disarankan).
4. Merge ke `main` men-trigger `deploy-staging.yml` otomatis → cek `staging.jeonme.com`.
5. Jika staging OK, buat tag rilis (`git tag v1.2.0 && git push origin v1.2.0`) → `deploy-production.yml` jalan, menunggu approval reviewer → deploy ke `jeonme.com`.
6. Pantau health check + log setelah deploy. Kalau ada masalah: `scripts/rollback.sh docker-compose.prod.yml <sha-sebelumnya>` di VPS (lihat SETUP-GUIDE.md Bagian 10).
