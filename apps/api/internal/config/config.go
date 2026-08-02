package config

import (
	"log"
	"os"
	"strconv"

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

	MidtransServerKey    string
	MidtransClientKey    string
	MidtransIsProduction bool

	CORSAllowedOrigins string
	PublicWebURL       string
	// PublicAPIURL -- origin backend yang bisa diakses publik, dipakai
	// membangun tautan unduhan di email notifikasi (REQ-F-405), BUKAN
	// hostname internal Docker (mis. "api:8080"). Padanan sisi Go dari
	// NEXT_PUBLIC_API_BASE_URL di frontend.
	PublicAPIURL string

	// CustomDomainCnameTarget -- No.81 (Sprint 9): target CNAME yang harus
	// diarahkan kreator untuk domain kustomnya. BELUM ada wiring Apache/SSL
	// produksi untuk menerima Host header sembarang (lihat CustomDomainHandler),
	// jadi nilai ini murni dipakai untuk instruksi DNS & verifikasi CNAME,
	// bukan bukti bahwa request sungguhan sudah bisa diterima lewat domain
	// tersebut.
	CustomDomainCnameTarget string

	S3Endpoint  string
	S3AccessKey string
	S3SecretKey string
	S3Bucket    string
	S3UseSSL    bool

	PlatformFeePercent float64
	HoldingPeriodDays  int

	// EncryptionKey (AES-256-GCM, lihat internal/crypto) -- Modul Settings
	// §3: nomor rekening/e-wallet di payout_methods dienkripsi at rest,
	// BUKAN plaintext seperti payouts.destination_account/kyc
	// bank_account_name yang sudah ada sebelumnya (di luar lingkup revisi
	// fase ini). HARUS PERSIS 32 byte (AES-256) -- divalidasi fail-fast di
	// bawah, bukan cuma di production (kunci salah panjang membuat SEMUA
	// enkripsi/dekripsi gagal, beda dari S3/SMTP yang gagal per-fitur).
	EncryptionKey string

	// SMTP dipakai worker (subcommand `worker`) untuk mengirim notifikasi
	// email (REQ-F-405). Kosong secara default -- job pengiriman akan
	// log-only (bukan gagal/crash) selama belum ada provider SMTP asli,
	// pola yang sama seperti S3/object storage soft-fail di atas.
	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	SMTPFromAddr string

	// WhatsApp (No.74, Sprint 8) -- kanal notifikasi TAMBAHAN untuk pembeli
	// (email di atas tetap kanal utama & satu-satunya yang wajib). Dibangun
	// terhadap WhatsApp Business Cloud API (Meta) -- kosong secara default,
	// worker akan log-only (SAMA PERSIS pola soft-fail SMTP/S3 di atas)
	// sampai kredensial sungguhan tersedia (perlu verifikasi bisnis Meta +
	// nomor terdaftar + template pesan disetujui, KEPUTUSAN BISNIS yang
	// belum diambil per permintaan pengguna -- lihat No.75 & catatan di
	// internal/whatsapp/client.go).
	WhatsAppAPIToken      string
	WhatsAppPhoneNumberID string
	WhatsAppTemplateName  string
	WhatsAppTemplateLang  string
}

// Load membaca .env (jika ada) lalu environment variable asli.
// Di production, .env biasanya tidak dipakai -- variabel di-inject oleh
// docker-compose / GitHub Actions secrets.
func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("info: file .env tidak ditemukan, menggunakan environment variable sistem")
	}

	appEnv := getEnv("APP_ENV", "local")

	cfg := &Config{
		AppEnv:      appEnv,
		AppPort:     getEnv("APP_PORT", "8080"),
		DatabaseURL: mustGetEnv("DATABASE_URL"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:   mustGetEnv("JWT_SECRET"),

		MidtransServerKey:    getEnv("MIDTRANS_SERVER_KEY", ""),
		MidtransClientKey:    getEnv("MIDTRANS_CLIENT_KEY", ""),
		MidtransIsProduction: getEnv("MIDTRANS_IS_PRODUCTION", "false") == "true",

		CORSAllowedOrigins: getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000"),
		// Dipakai membangun finish redirect URL Midtrans Snap (REQ-F-402) --
		// harus origin frontend yang benar-benar dipakai pembeli, bukan cuma
		// daftar CORS.
		PublicWebURL: getEnv("PUBLIC_WEB_URL", "http://localhost:3000"),
		PublicAPIURL: getEnv("PUBLIC_API_URL", "http://localhost:8080/api/v1"),

		CustomDomainCnameTarget: getEnv("CUSTOM_DOMAIN_CNAME_TARGET", "custom.jeonme.com"),

		// Nilai default sengaja dibuat "jalan tanpa perlu setup tambahan" (bukan
		// mustGetEnv) supaya server tetap bisa start walau VPS operator belum
		// sempat mengisi kredensial MinIO sungguhan di .env -- fitur upload
		// produk saja yang akan gagal saat dipakai, bukan seluruh API down.
		//
		// PENTING: S3_ENDPOINT harus "host:port" TANPA skema (bukan
		// "http://host:port") -- minio-go menolak endpoint dengan skema
		// ("Endpoint url cannot have fully qualified paths"). Skema diatur
		// lewat S3_USE_SSL, bukan lewat endpoint string. Ketahuan dari log
		// error nyata saat verifikasi Sprint 2 di staging.
		//
		// Audit keamanan (28 Juli 2026, permintaan langsung pengguna sebelum
		// deploy production): S3_ACCESS_KEY/S3_SECRET_KEY dulu SELALU jatuh
		// balik ke kredensial default ("jeonme"/"jeonme12345") yang tertulis
		// LANGSUNG di source ini -- kalau env var itu KELUPAAN diisi saat
		// deploy production (mis. secret CI belum diset), API tetap START
		// NORMAL tapi diam-diam memakai kredensial publik yang siapa pun bisa
		// baca dari repo ini untuk mengambil-alih seluruh object storage
		// (avatar/produk/dst) kalau endpoint MinIO-nya kebetulan terjangkau.
		// mustGetEnvInProd() menjaga kenyamanan dev lokal (jalan tanpa setup
		// lewat default di atas) TAPI gagal-cepat (fail-fast, sama seperti
		// DATABASE_URL/JWT_SECRET) begitu APP_ENV=production.
		S3Endpoint:  getEnv("S3_ENDPOINT", "localhost:9000"),
		S3AccessKey: mustGetEnvInProd(appEnv, "S3_ACCESS_KEY", "jeonme"),
		S3SecretKey: mustGetEnvInProd(appEnv, "S3_SECRET_KEY", "jeonme12345"),
		S3Bucket:    getEnv("S3_BUCKET", "jeonme-products"),
		S3UseSSL:    getEnv("S3_USE_SSL", "false") == "true",

		// PLACEHOLDER bisnis (Sprint 4, REQ-F-501/502) -- 5% & 3 hari adalah
		// nilai umum di platform sejenis (Gumroad/Lemonsqueezy sekitar 5-10%,
		// holding period anti-fraud beberapa hari), BUKAN keputusan bisnis
		// resmi Jeonme. Ganti lewat env begitu ada keputusan final, tidak
		// perlu ubah kode.
		PlatformFeePercent: getEnvFloat("PLATFORM_FEE_PERCENT", 5.0),
		HoldingPeriodDays:  getEnvInt("HOLDING_PERIOD_DAYS", 3),

		// Dev default HANYA untuk kenyamanan lokal (pola sama dengan
		// S3_ACCESS_KEY di atas) -- 32 byte persis, sengaja diverifikasi di
		// bawah supaya kesalahan panjang ketahuan SAAT STARTUP, bukan saat
		// kreator pertama kali mencoba simpan rekening.
		EncryptionKey: mustGetEnvInProd(appEnv, "ENCRYPTION_KEY", "jeonme-dev-encryption-key-32-ok!"),

		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnvInt("SMTP_PORT", 587),
		SMTPUsername: getEnv("SMTP_USER", ""),
		SMTPPassword: getEnv("SMTP_PASS", ""),
		SMTPFromAddr: getEnv("SMTP_FROM", "no-reply@jeonme.com"),

		WhatsAppAPIToken:      getEnv("WHATSAPP_API_TOKEN", ""),
		WhatsAppPhoneNumberID: getEnv("WHATSAPP_PHONE_NUMBER_ID", ""),
		WhatsAppTemplateName:  getEnv("WHATSAPP_TEMPLATE_NAME", "order_confirmation"),
		WhatsAppTemplateLang:  getEnv("WHATSAPP_TEMPLATE_LANG", "id"),
	}

	if len(cfg.EncryptionKey) != 32 {
		log.Fatalf("ENCRYPTION_KEY harus persis 32 byte (AES-256), dapat %d byte", len(cfg.EncryptionKey))
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

func getEnvFloat(key string, fallback float64) float64 {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		log.Printf("peringatan: %s=%q bukan angka valid, pakai default %v", key, v, fallback)
		return fallback
	}
	return f
}

func getEnvInt(key string, fallback int) int {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Printf("peringatan: %s=%q bukan bilangan bulat valid, pakai default %v", key, v, fallback)
		return fallback
	}
	return n
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

// mustGetEnvInProd -- audit keamanan (28 Juli 2026): sama seperti getEnv
// (jatuh balik ke devDefault) di local/staging supaya tetap nyaman dipakai
// tanpa setup tambahan, TAPI gagal-cepat seperti mustGetEnv begitu
// appEnv=="production" -- mencegah kredensial default yang tertulis di
// source (mis. S3_ACCESS_KEY/S3_SECRET_KEY) diam-diam terpakai di production
// hanya karena env var-nya kelupaan diisi saat deploy.
func mustGetEnvInProd(appEnv, key, devDefault string) string {
	if appEnv == "production" {
		return mustGetEnv(key)
	}
	return getEnv(key, devDefault)
}
