.PHONY: run build test migrate-up migrate-down migrate-status tidy

run:
	go run main.go

build:
	go build -o bin/api main.go

test:
	go test ./... -v

tidy:
	go mod tidy

# Memakai subcommand migrate bawaan binary (internal/migrate) -- tidak perlu
# instal CLI golang-migrate terpisah lagi. DATABASE_URL diambil dari .env
# lewat godotenv (lihat internal/config), atau override lewat env var.
migrate-up:
	go run . migrate up

migrate-down:
	go run . migrate down

migrate-status:
	go run . migrate status
