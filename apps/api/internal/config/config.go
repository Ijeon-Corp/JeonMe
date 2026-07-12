package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// Config menampung seluruh environment variable yang dibutuhkan aplikasi.
// Jangan hardcode kredensial di tempat lain -- selalu lewat struct ini.
type Config struct {
	AppEnv      string
	AppPort     string
	DatabaseURL string
	RedisURL    string
	JWTSecret   string

	XenditSecretKey  string
	XenditWebhookKey string

	CORSAllowedOrigins string

	S3Endpoint  string
	S3AccessKey string
	S3SecretKey string
	S3Bucket    string
	S3UseSSL    bool
}

// Load membaca .env (jika ada) lalu environment variable asli.
// Di production, .env biasanya tidak dipakai -- variabel di-inject oleh
// docker-compose / GitHub Actions secrets.
func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("info: file .env tidak ditemukan, menggunakan environment variable sistem")
	}

	cfg := &Config{
		AppEnv:      getEnv("APP_ENV", "local"),
		AppPort:     getEnv("APP_PORT", "8080"),
		DatabaseURL: mustGetEnv("DATABASE_URL"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:   mustGetEnv("JWT_SECRET"),

		XenditSecretKey:  getEnv("XENDIT_SECRET_KEY", ""),
		XenditWebhookKey: getEnv("XENDIT_WEBHOOK_VERIFICATION_TOKEN", ""),

		CORSAllowedOrigins: getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000"),

		// Nilai default sengaja dibuat "jalan tanpa perlu setup tambahan" (bukan
		// mustGetEnv) supaya server tetap bisa start walau VPS operator belum
		// sempat mengisi kredensial MinIO sungguhan di .env -- fitur upload
		// produk saja yang akan gagal saat dipakai, bukan seluruh API down.
		S3Endpoint:  getEnv("S3_ENDPOINT", "http://localhost:9000"),
		S3AccessKey: getEnv("S3_ACCESS_KEY", "jeonme"),
		S3SecretKey: getEnv("S3_SECRET_KEY", "jeonme12345"),
		S3Bucket:    getEnv("S3_BUCKET", "jeonme-products"),
		S3UseSSL:    getEnv("S3_USE_SSL", "false") == "true",
	}

	return cfg
}

// LoadDatabaseURL dipakai subcommand `migrate` -- migrasi hanya butuh
// DATABASE_URL, bukan seluruh konfigurasi aplikasi (JWT_SECRET, dst).
// Memakai Load() penuh di sana sebelumnya membuat migrasi gagal di CI
// karena JWT_SECRET sengaja tidak diset di step yang cuma menjalankan
// migrasi (lihat ci.yml).
func LoadDatabaseURL() string {
	if err := godotenv.Load(); err != nil {
		log.Println("info: file .env tidak ditemukan, menggunakan environment variable sistem")
	}
	return mustGetEnv("DATABASE_URL")
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

// mustGetEnv menghentikan aplikasi lebih awal (fail-fast) jika konfigurasi
// krusial tidak ada -- lebih baik gagal saat startup daripada di tengah
// request pembayaran.
func mustGetEnv(key string) string {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		log.Fatalf("environment variable wajib '%s' belum diset", key)
	}
	return v
}
