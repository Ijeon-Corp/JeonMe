#!/usr/bin/env bash
# Backup harian database Postgres Jeonme (pg_dump + retensi lokal).
#
# HANYA backup lokal untuk sekarang -- belum ada object storage (MinIO/R2)
# yang disiapkan untuk upload offsite (lihat TDD & CICD-GUIDE §12). Kalau
# nanti object storage sudah ada, tambahkan langkah upload di akhir skrip
# ini (mis. `aws s3 cp` / `rclone copy` ke bucket terpisah) -- backup lokal
# saja TIDAK cukup untuk skenario disk/VPS hilang total.
#
# Dijadwalkan lewat cron di VPS (bukan GitHub Actions -- data produksi tidak
# boleh transit lewat runner pihak ketiga):
#   0 3 * * * /opt/jeonme-production/scripts/backup-database.sh production >> /var/log/jeonme-backup.log 2>&1
#   30 3 * * * /opt/jeonme-production/scripts/backup-database.sh staging >> /var/log/jeonme-backup.log 2>&1
#
# Penggunaan: ./backup-database.sh <production|staging> [hari-retensi]
set -euo pipefail

ENV_NAME="${1:?Penggunaan: $0 <production|staging> [hari-retensi]}"
RETENTION_DAYS="${2:-14}"

case "$ENV_NAME" in
  production) COMPOSE_DIR="/opt/jeonme-production"; COMPOSE_FILE="docker-compose.prod.yml" ;;
  staging)    COMPOSE_DIR="/opt/jeonme-staging";    COMPOSE_FILE="docker-compose.staging.yml" ;;
  *) echo "Environment tidak dikenal: $ENV_NAME (harus 'production' atau 'staging')" >&2; exit 1 ;;
esac

BACKUP_DIR="/opt/jeonme-backups/${ENV_NAME}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="${BACKUP_DIR}/jeonme-${ENV_NAME}-${TIMESTAMP}.sql.gz"

echo "=== $(date -Iseconds) -- backup ${ENV_NAME} ke ${OUT_FILE} ==="

cd "$COMPOSE_DIR"
POSTGRES_USER=$(grep '^POSTGRES_USER=' .env | cut -d= -f2)
POSTGRES_DB=$(grep '^POSTGRES_DB=' .env | cut -d= -f2)

docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT_FILE"

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo "Backup selesai: ${OUT_FILE} (${SIZE})"

# Retensi -- hapus backup lebih lama dari N hari.
DELETED=$(find "$BACKUP_DIR" -name "jeonme-${ENV_NAME}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
echo "Menghapus ${DELETED} backup lebih lama dari ${RETENTION_DAYS} hari."

echo "=== selesai ==="
