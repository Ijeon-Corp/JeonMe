#!/usr/bin/env bash
# Membersihkan image Docker Jeonme lama yang sudah tidak dipakai container
# mana pun -- SENGAJA dibatasi hanya ke image ghcr.io/*/jeonme/* karena VPS
# ini shared dengan proyek lain (jangan sentuh image tenant lain).
#
# `docker image prune -f` biasa di deploy-*.yml cuma menghapus image
# "dangling" (tidak bertag) -- image lama yang masih bertag (mis.
# api:<sha-commit-sebelumnya>) tetap menumpuk selamanya tanpa ini.
#
# Dijadwalkan lewat cron mingguan di VPS (bukan GitHub Actions):
#   0 4 * * 0 /opt/jeonme-production/scripts/cleanup-old-images.sh >> /var/log/jeonme-image-cleanup.log 2>&1
#
# Penggunaan: ./cleanup-old-images.sh [jumlah-image-disimpan-per-repo]
set -euo pipefail

KEEP="${1:-5}"

echo "=== $(date -Iseconds) -- membersihkan image Jeonme, simpan ${KEEP} terbaru per repo ==="

for repo in ghcr.io/ijeon-corp/jeonme/api ghcr.io/ijeon-corp/jeonme/web; do
  echo "--- ${repo} ---"

  # ID image milik repo ini, urut dari yang paling baru dibuat.
  all_ids=$(docker images "${repo}" --format '{{.ID}}' | awk '!seen[$0]++')

  # ID yang sedang dipakai container apa pun -- jangan pernah dihapus.
  in_use=$(docker ps -a --format '{{.Image}}' | xargs -r -I{} docker inspect {} --format '{{.Id}}' 2>/dev/null | cut -c8-19 || true)

  i=0
  for id in $all_ids; do
    i=$((i + 1))
    if [ "$i" -le "$KEEP" ]; then
      continue
    fi
    if echo "$in_use" | grep -q "$id"; then
      echo "  lewati ${id} (masih dipakai container aktif)"
      continue
    fi
    echo "  hapus ${id}"
    docker rmi "$id" 2>&1 || echo "  (gagal hapus ${id}, lewati)"
  done
done

echo "=== selesai ==="
