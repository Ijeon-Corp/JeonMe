# docker/web/Dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm install

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web .
# NEXT_PUBLIC_GOOGLE_CLIENT_ID -- login/register via Google (permintaan
# langsung pengguna, 13 Agustus 2026). BEDA dari NEXT_PUBLIC_API_BASE_URL
# (SENGAJA tidak diinjeksi di sini, lihat lib/api-client.ts -- staging/
# production pakai path relatif "/api/v1"): variabel ini TIDAK PUNYA
# fallback relatif yang masuk akal, harus benar-benar diisi Client ID
# OAuth asli supaya tombol Google muncul di bundle browser. Ditemukan
# hilang total dari pipeline ini (bug ditemukan pengguna: tombol tidak
# pernah muncul di staging) -- ARG+ENV di sini WAJIB dipasangkan dengan
# build-args di .github/workflows/ci.yml, keduanya harus ada sekaligus.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
