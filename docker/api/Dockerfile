# docker/api/Dockerfile
FROM golang:1.25-alpine AS builder
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
WORKDIR /app
COPY --from=builder /out/api ./api
COPY apps/api/migrations ./migrations

EXPOSE 8080
ENTRYPOINT ["./api"]
