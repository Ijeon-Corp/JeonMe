# Catatan Deployment — Jeonme

Versi 2.0 — 8 Juli 2026. Status: **staging dan production sudah live** (`v0.1.0`).

Dokumen ini awalnya ditulis sebagai panduan *sebelum* deploy pertama (asumsi 2 VPS terdedikasi). Setelah eksekusi nyata, ternyata infrastruktur yang tersedia adalah **1 VPS shared** yang sudah menjalankan puluhan situs klien lain lewat Apache — jadi beberapa langkah di bawah sudah disesuaikan dengan apa yang **benar-benar dijalankan**, bukan rencana awal. Untuk arsitektur lengkap, lihat `CICD-GUIDE.md` Bagian 2.

Dokumen ini sekarang berfungsi sebagai:
1. **Referensi** kondisi deployment saat ini (Bagian 1).
2. **Template** kalau nanti perlu setup ulang di VPS baru — dedicated atau shared (Bagian 2 dst.).

Skrip pendukung ada di `scripts/`:

| Skrip | Fungsi |
|---|---|
| `scripts/provision-vps.sh` | Instal Docker, buat user `deploy`, siapkan direktori kerja |
| `scripts/issue-certbot-cert.sh` | Terbitkan sertifikat TLS Let's Encrypt (varian VPS terdedikasi dengan Nginx sendiri) |
| `scripts/rollback.sh` | Rollback production/staging ke `IMAGE_TAG` sebelumnya |

---

## 1. Kondisi Deployment Saat Ini

| Item | Nilai |
|---|---|
| VPS | `103.147.33.34` (Debian 12, shared dengan proyek lain) |
| SSH | Port `61512`, user `deploy` (grup `docker`, tanpa sudo) |
| Repo GitHub | `Ijeon-Corp/JeonMe` |
| Production | `https://jeonme.com` — direktori `/opt/jeonme-production` |
| Staging | `https://staging.jeonme.com` — direktori `/opt/jeonme-staging` |
| Reverse proxy + TLS | Apache + Certbot **sistem** (bukan di dalam Docker) — lihat CICD-GUIDE.md §2 |
| CI/CD | `.github/workflows/{ci,deploy-staging,deploy-production}.yml` |

Rilis pertama (`v0.1.0`) berhasil di-deploy ke production pada 8 Juli 2026 setelah 6 bug ditemukan & diperbaiki selama rollout — katalog lengkap ada di `CICD-GUIDE.md` Bagian 11. Endpoint health check kedua environment sudah diverifikasi hidup:

```bash
curl https://jeonme.com/api/health
curl https://staging.jeonme.com/api/health
# ekspektasi: {"status":"ok","checks":{"database":"up","redis":"up"}}
```

## 2. Template Setup — VPS Baru (Dedicated)

Bagian ini untuk kalau nanti pindah ke VPS terdedikasi (bukan shared) — misalnya karena traffic sudah butuh resource sendiri. Kalau VPS baru itu **juga shared** (menjalankan situs lain lewat Apache/Nginx), ikuti pola di CICD-GUIDE.md §2 (bind container ke `127.0.0.1`, proxy dari web server sistem) alih-alih Bagian 2.3 di bawah (yang mengasumsikan Nginx+Certbot **di dalam** Docker Compose, hanya cocok untuk VPS 100% didedikasikan untuk Jeonme).

### 2.1 Prasyarat

- **GitHub** — repo (sudah ada: `Ijeon-Corp/JeonMe`).
- **VPS** — Debian/Ubuntu terbaru, akses root/sudo sementara untuk provisioning.
- **Domain** — sudah dikelola di Cloudflare.

### 2.2 Provisioning VPS

```bash
scp scripts/provision-vps.sh root@<IP_VPS>:/root/
ssh root@<IP_VPS> "bash /root/provision-vps.sh"
```

Skrip ini menginstal Docker Engine + plugin Compose, membuat user `deploy` (anggota grup `docker`, **tanpa** akses `sudo` penuh — penting kalau VPS shared dengan proyek lain), dan menyiapkan direktori kerja.

Generate SSH keypair khusus CI (jangan pakai key pribadi developer):

```bash
ssh-keygen -t ed25519 -C "ci-deploy-jeonme" -f jeonme_ci_deploy_key
```

Pasang public key ke `~deploy/.ssh/authorized_keys`, simpan private key untuk secret `*_SSH_KEY` (Bagian 2.5).

> **Catat port SSH VPS-nya** — kalau bukan port 22 default, wajib diisi juga ke secret `*_SSH_PORT` (lihat CICD-GUIDE.md §11, bug #2 — ini bug nyata yang pernah bikin semua deploy gagal connect).

### 2.3 Kalau VPS 100% Didedikasikan untuk Jeonme (opsional)

Kalau VPS ini **tidak** shared dengan proyek lain, boleh pakai varian Nginx+Certbot di dalam Docker (lebih simpel, tidak perlu konfigurasi Apache sistem terpisah) — lihat `docker/nginx/conf.d/production/jeonme.conf` untuk instruksi lengkap dan `scripts/issue-certbot-cert.sh` untuk otomasi penerbitan sertifikatnya. Ini **bukan** yang dipakai deployment saat ini (lihat Bagian 1), disimpan sebagai opsi kalau kebutuhan berubah.

### 2.4 Isi `.env`

```bash
cd /opt/jeonme-production   # atau /opt/jeonme-staging
cp .env.example .env
```

Isi minimal:

```bash
GHCR_REPO=ijeon-corp/jeonme   # HARUS huruf kecil -- lihat CICD-GUIDE.md §11 bug #1
IMAGE_TAG=latest              # baris ini harus ada persis, workflow menimpanya via sed
WEB_HOST_PORT=23000           # unik per environment kalau 1 VPS dipakai bersama
API_HOST_PORT=28080
POSTGRES_PASSWORD=$(openssl rand -hex 20)
JWT_SECRET=$(openssl rand -hex 32)
CORS_ALLOWED_ORIGINS=https://jeonme.com
```

### 2.5 GitHub Secrets & Environments

Lihat tabel lengkap di `CICD-GUIDE.md` Bagian 9 — termasuk `*_SSH_PORT` yang mudah terlewat.

### 2.6 DNS & TLS

DNS di Cloudflare (proxied atau DNS-only, sertifikat HTTP-01 tetap jalan lewat proxy Cloudflare — sudah diverifikasi bekerja di deployment saat ini). Untuk TLS: kalau shared-VPS-lewat-Apache, ikuti pola vhost + `certbot certonly --webroot` di CICD-GUIDE.md §10.1. Kalau dedicated dengan Docker Nginx, pakai `scripts/issue-certbot-cert.sh`.

## 3. Alur Harian & Rollback Darurat

**Alur harian** (detail lengkap di CICD-GUIDE.md §15): branch fitur dari `main` → PR + review → merge (auto-deploy staging) → QA di staging → tag rilis → approve → production.

**Rollback darurat** — belum otomatis lewat GitHub Actions (item L2 di CICD-GUIDE.md §12). Gunakan `scripts/rollback.sh` di VPS:

```bash
cd /opt/jeonme-production    # atau /opt/jeonme-staging
./scripts/rollback.sh docker-compose.prod.yml <sha-commit-rilis-sebelumnya>
```

Cari sha valid dari tab Actions (histori run **Deploy Production**/**Deploy Staging** sebelumnya yang sukses) atau `git log --oneline`. Skrip ini **tidak** menjalankan migrasi turun — kalau migrasi baru sudah terlanjur jalan dan tidak backward-compatible, rollback image saja tidak cukup, perlu keputusan manual.

## Rekap Checklist (deployment saat ini)

- [x] Kode di-push ke `Ijeon-Corp/JeonMe`
- [x] VPS shared diprovisioning: user `deploy`, direktori `/opt/jeonme-{production,staging}`
- [x] `.env` terisi lengkap di kedua direktori, termasuk `GHCR_REPO` huruf kecil
- [x] `docker login ghcr.io` sukses sebagai user `deploy`
- [x] GitHub Environments `staging` & `production` terisi secrets lengkap (termasuk `*_SSH_PORT`), `production` punya required reviewer
- [x] DNS `jeonme.com`, `www`, `staging.jeonme.com` proxied lewat Cloudflare ke VPS
- [x] Apache vhost + sertifikat TLS terbit untuk ketiga domain, renewal tercakup `certbot.timer` sistem
- [x] Push ke `main` → staging ter-deploy otomatis → `/api/health` "ok"
- [x] Tag `v0.1.0` → approval → production ter-deploy → `/api/health` "ok"
