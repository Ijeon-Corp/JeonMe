#!/usr/bin/env bash
# Rollback darurat: redeploy image dengan IMAGE_TAG (sha commit) sebelumnya.
# Dipakai selama belum ada workflow_dispatch rollback otomatis di GitHub
# Actions (dicatat sebagai perbaikan prioritas rendah di audit CI/CD).
#
# Jalankan dari /opt/jeonme di VPS terkait (staging ATAU production).
#
# Penggunaan:
#   ./scripts/rollback.sh docker-compose.prod.yml <sha-commit-sebelumnya>
#   ./scripts/rollback.sh docker-compose.staging.yml <sha-commit-sebelumnya>
#
# CATATAN PENTING: skrip ini HANYA mengganti image (kode), tidak menjalankan
# migrasi turun (`migrate down`). Kalau rilis yang bermasalah sudah
# menjalankan migrasi skema yang tidak backward-compatible dengan image
# lama, rollback image saja tidak cukup -- perlu keputusan manual (migrasi
# turun manual, atau restore dari backup) sebelum melanjutkan.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Penggunaan: $0 <docker-compose.staging.yml|docker-compose.prod.yml> <sha-commit-sebelumnya>" >&2
  exit 1
fi

COMPOSE_FILE="$1"
IMAGE_TAG="$2"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Tidak menemukan $COMPOSE_FILE di direktori ini -- jalankan skrip ini dari /opt/jeonme." >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "Tidak menemukan .env di direktori ini." >&2
  exit 1
fi

echo "==> Rollback $COMPOSE_FILE ke IMAGE_TAG=$IMAGE_TAG"
read -r -p "Lanjutkan? Pastikan tag ini pernah sukses ter-deploy sebelumnya (lihat histori run 'Deploy' di GitHub Actions). [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Dibatalkan."
  exit 0
fi

sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${IMAGE_TAG}/" .env

docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
docker image prune -f

echo ""
echo "Selesai. Verifikasi manual (ganti domain sesuai environment):"
echo "  curl -sf https://jeon.id/api/health || curl -sf https://staging.jeon.id/api/health"
