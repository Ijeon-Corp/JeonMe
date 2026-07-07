#!/usr/bin/env bash
# Provisioning awal VPS baru (staging ATAU production -- jalankan sekali per VPS).
# Dipakai di SETUP-GUIDE.md Fase 2. Idempoten: aman dijalankan ulang.
#
# Penggunaan (sebagai root/sudo, di VPS yang baru):
#   bash provision-vps.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan skrip ini sebagai root (atau lewat sudo)." >&2
  exit 1
fi

echo "==> Update paket sistem"
apt-get update -y
apt-get upgrade -y

echo "==> Instal Docker Engine + plugin Compose (docs.docker.com/engine/install/debian)"
if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "    Docker sudah terpasang, lewati."
fi

echo "==> Buat user 'deploy' (anggota grup docker, TANPA akses sudo penuh)"
if ! id -u deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

echo "==> Siapkan direktori kerja /opt/jeonme"
mkdir -p /opt/jeonme
chown deploy:deploy /opt/jeonme

echo "==> Selesai."
echo ""
echo "Langkah berikutnya (dari laptop kamu, lihat SETUP-GUIDE.md Fase 2):"
echo "  1. ssh-keygen -t ed25519 -C \"ci-deploy-jeonme\" -f jeonme_deploy_key"
echo "  2. ssh-copy-id -i jeonme_deploy_key.pub deploy@$(curl -s ifconfig.me 2>/dev/null || echo '<IP_VPS_INI>')"
echo "  3. scp docker-compose.<staging|prod>.yml .env.example deploy@<IP_VPS_INI>:/opt/jeonme/"
echo "  4. scp -r docker/ deploy@<IP_VPS_INI>:/opt/jeonme/"
echo "  5. Lanjut ke Fase 3 (isi .env) di SETUP-GUIDE.md"
