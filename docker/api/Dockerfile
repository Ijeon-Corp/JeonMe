# docker/api/Dockerfile
FROM golang:1.26-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git

COPY apps/api/go.mod apps/api/go.sum* ./
RUN go mod download

COPY apps/api .

# VERSION disuntik lewat --build-arg dari ci.yml (commit sha) dan diekspos di
# /api/health -- supaya pipeline deploy bisa memverifikasi commit yang
# SUNGGUHAN jalan, bukan cuma "server merespons ok" (lihat main.go).
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s -X main.Version=${VERSION}" -o /out/api main.go

FROM alpine:3.20 AS runner
RUN apk add --no-cache ca-certificates tzdata
# Audit keamanan infra (15 September 2026, temuan High): image sebelumnya
# tidak punya USER sama sekali sehingga proses API jalan sebagai root di
# container produksi. Binary statis ini tidak menulis apa pun ke disk lokal
# (storage produk lewat MinIO/S3, bukan filesystem container -- lihat
# internal/storage), jadi cukup user non-root polos tanpa perlu chown
# tambahan; file yang di-COPY di bawah tetap default owner root tapi
# world-readable/executable sehingga user "app" bisa membacanya.
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /out/api ./api
COPY apps/api/migrations ./migrations

USER app

EXPOSE 8080
ENTRYPOINT ["./api"]
