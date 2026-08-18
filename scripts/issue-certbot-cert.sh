#!/usr/bin/env bash
# Menerbitkan sertifikat Let's Encrypt pertama kali untuk production, lewat
# service `certbot` di docker-compose.prod.yml (lihat SETUP-GUIDE.md Fase 7
# dan komentar setup di docker/nginx/conf.d/production/jeonme.conf).
#
# Jalankan dari /opt/jeonme di VPS PRODUCTION, setelah stack Nginx sudah
# menyala dengan server block port 80 aktif (dibutuhkan untuk challenge
# HTTP-01 -- server block 443 boleh tetap aktif juga, Certbot cuma perlu
# port 80 untuk verifikasi).
#
# Penggunaan:
#   ./scripts/issue-certbot-cert.sh jeon.id www.jeon.id admin@jeon.id
#   (domain sebanyak apa pun di depan, argumen terakhir HARUS email dan
#   mengandung karakter '@')
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Penggunaan: $0 <domain1> [domain2 ...] <email>" >&2
  exit 1
fi

COMPOSE_FILE="docker-compose.prod.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Tidak menemukan $COMPOSE_FILE di direktori ini -- jalankan skrip ini dari /opt/jeonme." >&2
  exit 1
fi

EMAIL="${*: -1}"
if [[ "$EMAIL" != *"@"* ]]; then
  echo "Argumen terakhir harus alamat email (tidak ditemukan '@' di: $EMAIL)" >&2
  exit 1
fi

DOMAIN_ARGS=()
for domain in "${@:1:$#-1}"; do
  DOMAIN_ARGS+=("-d" "$domain")
done

echo "==> Memastikan Nginx sedang berjalan (dibutuhkan untuk challenge HTTP-01 di port 80)"
docker compose -f "$COMPOSE_FILE" up -d nginx

echo "==> Meminta sertifikat untuk: ${DOMAIN_ARGS[*]}"
docker compose -f "$COMPOSE_FILE" run --rm --entrypoint \
  "certbot certonly --webroot -w /var/www/certbot ${DOMAIN_ARGS[*]} --email ${EMAIL} --agree-tos --non-interactive" \
  certbot

echo "==> Reload Nginx supaya server block 443 memuat sertifikat baru"
docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload

echo ""
echo "Selesai. Verifikasi manual:"
echo "  curl -I https://${1}"
echo ""
echo "Jangan lupa jadwalkan renewal otomatis lewat cron (lihat SETUP-GUIDE.md Fase 7):"
echo "  0 3 * * * cd $(pwd) && docker compose -f $COMPOSE_FILE run --rm certbot renew --quiet && docker compose -f $COMPOSE_FILE exec nginx nginx -s reload"
