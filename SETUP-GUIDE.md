# Panduan Setup CI/CD & Deploy Pertama — Jeonme

Versi 1.0 — 3 Juli 2026

Dokumen ini adalah lanjutan praktis dari `CICD-GUIDE.md`: urutan langkah dari kode di laptop developer sampai `jeonme.com` benar-benar hidup di production, mengikuti persis workflow (`.github/workflows/*.yml`) dan docker-compose yang sudah diperbaiki di audit CI/CD. Kerjakan berurutan — tiap fase mengasumsikan fase sebelumnya sudah selesai.

Skrip pendukung yang dirujuk di dokumen ini ada di `scripts/`:

| Skrip | Dipakai di | Fungsi |
|---|---|---|
| `scripts/provision-vps.sh` | Fase 2 | Instal Docker, buat user `deploy`, siapkan `/opt/jeonme` di VPS baru |
| `scripts/issue-certbot-cert.sh` | Fase 7 | Terbitkan sertifikat TLS Let's Encrypt pertama kali untuk production |
| `scripts/rollback.sh` | Fase 10 | Rollback production/staging ke `IMAGE_TAG` sebelumnya |

---

## Sebelum Mulai

Siapkan akses ke lima hal ini dulu:

- **GitHub** — repo kosong (boleh privat) untuk kode ini.
- **VPS × 2** — satu untuk staging, satu untuk production. Debian/Ubuntu terbaru.
- **Domain** — `jeonme.com` sudah dibeli, dikelola di Cloudflare.
- **SSH** — akses root/sudo sementara ke kedua VPS untuk provisioning awal.
- **Xendit** — belum wajib sekarang, baru dibutuhkan mulai Sprint 3 (checkout).

## 1. Push Kode ke GitHub

Folder ini belum jadi git repo — ini langkah paling pertama sebelum workflow apa pun bisa jalan.

1. Buat repo baru di GitHub (mis. `akbar/jeonme`), **jangan** centang "initialize with README" (supaya tidak konflik dengan commit pertama dari lokal).
2. Inisialisasi & push:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: boilerplate Jeonme"
   git branch -M main
   git remote add origin git@github.com:OWNER/jeonme.git
   git push -u origin main
   ```
3. Opsional: buat branch `develop` juga kalau tim mau memakai alur PR ke `develop` dulu sebelum `main` (lihat CICD-GUIDE §2).

> Catat nilai `OWNER/jeonme` sekarang — ini akan dipakai lagi persis sebagai `GHCR_REPO` di Fase 3.

## 2. Siapkan Dua VPS

Satu untuk staging, satu untuk production — dipisah supaya `.env`, kredensial, dan insiden di satu environment tidak menular ke yang lain.

Di **masing-masing** VPS:

1. Login sebagai root/sudo, salin `scripts/provision-vps.sh` ke VPS lalu jalankan:
   ```bash
   scp scripts/provision-vps.sh root@<IP_VPS>:/root/
   ssh root@<IP_VPS> "bash /root/provision-vps.sh"
   ```
   Skrip ini menginstal Docker Engine + plugin Compose, membuat user `deploy` (anggota grup `docker`, tanpa akses `sudo` penuh), menyiapkan direktori `/opt/jeonme`, dan mencetak instruksi langkah berikutnya.
2. Generate SSH keypair khusus CI di **laptop kamu** (satu pasang per VPS, jangan pakai key pribadi):
   ```bash
   ssh-keygen -t ed25519 -C "ci-deploy-jeonme-staging" -f jeonme_staging_deploy_key
   ssh-keygen -t ed25519 -C "ci-deploy-jeonme-prod" -f jeonme_prod_deploy_key
   ```
3. Tempel isi file `.pub` ke `~deploy/.ssh/authorized_keys` di VPS terkait:
   ```bash
   ssh-copy-id -i jeonme_staging_deploy_key.pub deploy@<IP_VPS_STAGING>
   ssh-copy-id -i jeonme_prod_deploy_key.pub deploy@<IP_VPS_PROD>
   ```
   Simpan isi file **private** (`jeonme_staging_deploy_key`, `jeonme_prod_deploy_key`) untuk secret `*_SSH_KEY` di Fase 5 — lalu hapus salinan lokalnya dari laptop kalau sudah tersimpan aman di password manager.
4. Salin file konfigurasi (bukan source code — image di-pull dari GHCR, tidak di-build di VPS) ke `/opt/jeonme`:
   ```bash
   scp docker-compose.staging.yml .env.example deploy@<IP_VPS_STAGING>:/opt/jeonme/
   scp -r docker/ deploy@<IP_VPS_STAGING>:/opt/jeonme/

   scp docker-compose.prod.yml .env.example deploy@<IP_VPS_PROD>:/opt/jeonme/
   scp -r docker/ deploy@<IP_VPS_PROD>:/opt/jeonme/
   ```
5. Buka firewall: VPS staging port 8081 (atau taruh di belakang reverse proxy lain), VPS production port 80 & 443.

> Anggaran indikatif per TDD §8: ~Rp300–600rb/bulan per VPS aplikasi. Kalau budget ketat, satu VPS untuk staging+production juga bisa — tapi butuh path direktori terpisah (mis. `/opt/jeonme-staging`, `/opt/jeonme-production`) dan penyesuaian manual di `deploy-staging.yml`/`deploy-production.yml` karena keduanya saat ini hardcode `cd /opt/jeonme`.

## 3. Isi `.env` di Tiap VPS

File ini dibaca `docker compose` langsung di VPS — terpisah dari GitHub Secrets, dan tidak pernah masuk git.

1. Di `/opt/jeonme` tiap VPS:
   ```bash
   cp .env.example .env
   ```
2. Isi minimal field berikut (nilai **beda** antara staging & production, terutama `JWT_SECRET` dan password DB):
   ```bash
   GHCR_REPO=owner/jeonme        # persis sama dengan repo GitHub Fase 1
   IMAGE_TAG=latest              # workflow akan menimpa ini otomatis tiap deploy
   POSTGRES_PASSWORD=<random panjang, beda per environment>
   JWT_SECRET=$(openssl rand -hex 32)
   CORS_ALLOWED_ORIGINS=https://staging.jeonme.com   # atau https://jeonme.com di prod
   ```
3. Biarkan `XENDIT_SECRET_KEY` & `XENDIT_WEBHOOK_VERIFICATION_TOKEN` kosong dulu — baru diisi saat Sprint 3.

> **Wajib**: baris `IMAGE_TAG=latest` harus benar-benar ada persis seperti itu di `.env` — workflow deploy memakai `sed` untuk menggantinya, dan `sed` diam-diam tidak berbuat apa-apa kalau polanya tidak ketemu (temuan tinggi H1 di audit CI/CD).

## 4. Buat Token GHCR & Uji Login Manual

Menutup temuan kritis C2 — VPS butuh login eksplisit ke registry image sebelum pipeline bisa pull otomatis.

1. GitHub → Settings akun → Developer settings → Personal access tokens (fine-grained) → buat token baru, scope **hanya** `read:packages`, tanpa akses repo lain.
2. Uji manual sekali di **masing-masing** VPS sebelum mengandalkan workflow:
   ```bash
   echo "<token>" | docker login ghcr.io -u <username-github> --password-stdin
   ```
3. Kalau berhasil ("Login Succeeded"), simpan token ini untuk secret `GHCR_PAT` di Fase 5.

## 5. Setel GitHub Secrets & Environments

Repo GitHub → Settings → Environments — buat dua environment: `staging` dan `production`.

1. Buat environment `staging`, isi secrets:

   | Secret | Isi |
   |---|---|
   | `STAGING_HOST` | IP/hostname VPS staging |
   | `STAGING_SSH_USER` | `deploy` |
   | `STAGING_SSH_KEY` | Isi private key `jeonme_staging_deploy_key` dari Fase 2 |
   | `GHCR_USERNAME` | Username GitHub pemilik token Fase 4 |
   | `GHCR_PAT` | Token dari Fase 4 |

2. Buat environment `production` dengan secrets setara (`PROD_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY`, `GHCR_USERNAME`, `GHCR_PAT`).
3. Di environment `production`, aktifkan **Required reviewers** — tambahkan minimal 1 orang (bisa diri sendiri untuk sekarang) supaya setiap deploy production butuh klik approve manual sebelum jalan.

> Kalau memakai satu VPS gabungan (opsi hemat biaya di Fase 2), `STAGING_HOST` dan `PROD_HOST` boleh bernilai sama.

## 6. Arahkan DNS di Cloudflare

Sesuai TDD §7.1 — Cloudflare di depan sebagai DNS, CDN, dan proteksi DDoS dasar.

1. Tambahkan domain `jeonme.com` ke Cloudflare (kalau belum), arahkan nameserver dari registrar.
2. Buat A record `jeonme.com` → IP VPS production, dan `www` → sama.
3. Buat A record `staging.jeonme.com` → IP VPS staging.
4. Untuk `jeonme.com`: set proxy status Cloudflare ke "DNS only" (abu-abu) dulu selama proses terbit sertifikat Certbot di Fase 7 (supaya challenge HTTP-01 langsung ke VPS, bukan lewat proxy Cloudflare), baru nyalakan "Proxied" (oranye) setelahnya.
5. Untuk `staging.jeonme.com`: boleh langsung "Proxied" — konfigurasi staging memang mengasumsikan Cloudflare yang menerminasi TLS (lihat catatan di `docker/nginx/conf.d/staging/jeonme.conf`).

## 7. Terbitkan Sertifikat TLS Production

Sekali saja. Gunakan `scripts/issue-certbot-cert.sh` di VPS production (skrip ini membungkus instruksi yang juga tertulis sebagai komentar di `docker/nginx/conf.d/production/jeonme.conf`):

```bash
cd /opt/jeonme
./scripts/issue-certbot-cert.sh jeonme.com www.jeonme.com admin@jeonme.com
```

Skrip ini akan:
1. Memverifikasi server block port 80 sudah aktif (dibutuhkan untuk challenge HTTP-01).
2. Menjalankan `certbot certonly --webroot` untuk domain yang diberikan.
3. Reload Nginx setelah sertifikat terbit.

Setelah sukses, jadwalkan renewal otomatis via cron VPS (bukan GitHub Actions):

```bash
0 3 * * * cd /opt/jeonme && docker compose -f docker-compose.prod.yml run --rm certbot renew --quiet && docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

## 8. Deploy Pertama ke Staging

Ini sepenuhnya otomatis begitu Fase 1–6 beres — cukup push, lalu amati.

1. Push commit apa pun ke `main` (atau merge PR pertama).
2. Buka tab **Actions** di GitHub → pastikan workflow **CI** hijau (test-backend, test-frontend, build-images).
3. Workflow **Deploy Staging** otomatis terpicu setelah CI sukses — pantau sampai selesai.
4. Verifikasi manual:
   ```bash
   curl https://staging.jeonme.com/api/health
   # ekspektasi: {"status":"ok","checks":{"database":"up","redis":"up"}}
   ```

> Kalau gagal di step "Login GHCR di VPS" atau "Jalankan migrasi database" — kembali cek Fase 3 & 4, ini dua titik yang paling sering salah konfigurasi saat setup pertama kali.

## 9. Deploy Pertama ke Production

Butuh tag rilis + approval manual — tidak pernah otomatis penuh, sesuai filosofi pipeline di CICD-GUIDE §1.

1. Setelah staging teruji OK, buat tag rilis dari `main`:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
2. Buka tab **Actions** → workflow **Deploy Production** menunggu di status "Waiting" karena environment `production` punya required reviewer.
3. Reviewer yang ditunjuk di Fase 5 klik **Review deployments → Approve and deploy**.
4. Verifikasi:
   ```bash
   curl https://jeonme.com/api/health
   ```

## 10. Alur Harian & Rollback Darurat

**Alur harian** (detail lengkap di CICD-GUIDE §13): branch fitur dari `main` → PR + review → merge (auto-deploy staging) → QA di staging → tag rilis → approve → production.

**Rollback darurat** — belum ada tombol otomatis untuk ini (dicatat sebagai perbaikan prioritas rendah di audit CI/CD). Gunakan `scripts/rollback.sh` di VPS terkait:

```bash
cd /opt/jeonme
./scripts/rollback.sh docker-compose.prod.yml <sha-commit-rilis-sebelumnya>
```

Cari sha yang valid dari tab Actions (histori run **Deploy Production** sebelumnya yang sukses) atau dari `git log --oneline` pada commit yang berhasil di-tag sebelumnya. Skrip ini **tidak** menjalankan migrasi turun — kalau migrasi baru sudah terlanjur jalan dan tidak backward-compatible, rollback image saja tidak cukup, perlu keputusan manual (lihat catatan di dalam skrip).

## Rekap Checklist

- [ ] Kode sudah di-push ke GitHub (`git remote -v` menunjuk ke repo yang benar)
- [ ] Dua VPS siap lewat `provision-vps.sh`, SSH key khusus CI terpasang
- [ ] `.env` di kedua VPS terisi lengkap, termasuk `GHCR_REPO` & `IMAGE_TAG=latest`
- [ ] `docker login ghcr.io` manual sukses di kedua VPS
- [ ] GitHub Environments `staging` & `production` terisi secrets lengkap, `production` punya required reviewer
- [ ] DNS `jeonme.com`, `www`, `staging.jeonme.com` mengarah ke VPS yang benar
- [ ] Sertifikat TLS production terbit lewat `issue-certbot-cert.sh`, cron renewal terjadwal
- [ ] Push ke `main` → staging ter-deploy otomatis → `/api/health` "ok"
- [ ] Tag rilis pertama → approval → production ter-deploy → `/api/health` "ok"
