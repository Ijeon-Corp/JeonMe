package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"

	"github.com/jeonme/api/internal/config"
	"github.com/jeonme/api/internal/database"
	"github.com/jeonme/api/internal/mailer"
	"github.com/jeonme/api/internal/middleware"
	"github.com/jeonme/api/internal/migrate"
	"github.com/jeonme/api/internal/queue"
	"github.com/jeonme/api/internal/routes"
	"github.com/jeonme/api/internal/storage"
	"github.com/jeonme/api/internal/whatsapp"
	"github.com/jeonme/api/internal/worker"
)

// Version diisi saat build lewat -ldflags "-X main.Version=<sha>" (lihat
// docker/api/Dockerfile & ci.yml). Diekspos di /api/health supaya pipeline
// deploy bisa memverifikasi versi yang SUNGGUHAN jalan cocok dengan yang
// baru saja di-deploy -- sebelumnya health check cuma mengecek "server
// merespons ok", yang tetap true walau container lama masih jalan karena
// step deploy gagal diam-diam (ketahuan waktu commit lama masih terpasang
// di staging padahal IMAGE_TAG di .env sudah menunjuk versi baru).
var Version = "dev"

func main() {
	// Subcommand `migrate` -- dipakai CI (sebelum go test) dan pipeline
	// deploy (sebelum menyalakan versi baru), lihat .github/workflows/*.yml.
	// Contoh: ./api migrate up | ./api migrate down | ./api migrate status
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		databaseURL := config.LoadDatabaseURL()
		if err := migrate.Run(os.Args[2:], databaseURL, "migrations"); err != nil {
			log.Fatalf("migrate: %v", err)
		}
		return
	}

	// Subcommand `worker` -- proses TERPISAH dari server HTTP (container
	// sendiri, lihat docker-compose*.yml service `worker`), memproses task
	// asynq dari Redis. Dipisah dari server HTTP supaya lambat/gagalnya
	// pengiriman email (REQ-F-405) tidak pernah berdampak ke latensi/
	// ketersediaan endpoint checkout & webhook PSP.
	if len(os.Args) > 1 && os.Args[1] == "worker" {
		runWorker()
		return
	}

	cfg := config.Load()

	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	db, err := database.NewPostgresPool(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("gagal konek database: %v", err)
	}
	defer db.Close()

	rdb, err := database.NewRedisClient(cfg.RedisURL)
	if err != nil {
		log.Fatalf("gagal konek redis: %v", err)
	}
	defer rdb.Close()

	// Object storage bersifat soft-fail: kalau MinIO belum siap/salah kredensial,
	// server tetap jalan (bukan mustGetEnv) -- hanya endpoint upload/download
	// produk yang akan menolak dengan pesan jelas, bukan seluruh API down.
	s3Client, err := storage.NewClient(cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket, cfg.S3UseSSL)
	if err != nil {
		log.Printf("peringatan: gagal membuat client object storage: %v (fitur upload produk tidak akan berfungsi)", err)
		s3Client = nil
	} else {
		ensureCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if err := s3Client.EnsureBucket(ensureCtx); err != nil {
			log.Printf("peringatan: gagal menyiapkan bucket object storage: %v", err)
		}
		// REQ-F-205: foto profil, sampul produk, gambar latar halaman, & ikon
		// kustom tautan harus bisa diakses publik permanen (bukan presigned
		// URL kedaluwarsa seperti file produk berbayar) -- lihat komentar
		// storage.Client.EnsurePublicRead. SEMUA prefix WAJIB dikirim dalam
		// satu panggilan yang sama (SetBucketPolicy menimpa, bukan menambah).
		//
		// Bug dilaporkan pengguna, 17 Agustus 2026 ("audio gabisa di play"):
		// "gallery-images"/"audio-blocks" (blok Galeri Foto/Audio, ditambah
		// sesi sebelumnya) KETINGGALAN dari daftar ini -- file berhasil
		// terunggah ke storage TAPI GetObject publik ditolak MinIO (403
		// AccessDenied, dikonfirmasi lewat curl -I langsung ke object yang
		// dilaporkan), browser lantas gagal memutar audio dengan pesan
		// "NotSupportedError: no supported sources" (bukan masalah format
		// audio -- responsnya memang bukan audio sama sekali, cuma badan
		// error MinIO). SetBucketPolicy berjalan lagi setiap start-up server
		// (bukan sekali saat migrasi), jadi begitu prefix ini ditambahkan &
		// di-deploy, object yang SUDAH terunggah lebih dulu ikut otomatis
		// bisa diakses publik tanpa perlu diunggah ulang.
		if err := s3Client.EnsurePublicRead(ensureCtx, "avatars", "covers", "backgrounds", "link-icons", "link-thumbnails", "gallery-images", "audio-blocks"); err != nil {
			log.Printf("peringatan: gagal mengatur akses publik untuk avatar/sampul/latar/ikon/thumbnail/galeri/audio tautan: %v", err)
		}
		cancel()
	}

	// Job queue (asynq) bersifat soft-fail sama seperti object storage --
	// kalau REDIS_URL somehow tidak valid, server tetap jalan tanpa
	// notifikasi order.paid (REQ-F-405) alih-alih ikut down.
	var queueClient *asynq.Client
	if redisOpt, err := queue.RedisOptFromURL(cfg.RedisURL); err != nil {
		log.Printf("peringatan: gagal menyiapkan job queue: %v (notifikasi otomatis tidak akan berjalan)", err)
	} else {
		queueClient = asynq.NewClient(redisOpt)
		defer queueClient.Close()
	}

	r := gin.New()
	r.Use(gin.Recovery())
	// Perbaikan SSRF/rate-limit-bypass (audit keamanan 14 Agustus 2026):
	// tanpa SetTrustedProxies, Gin's ClientIP() (dipakai middleware.RateLimit
	// sebagai kunci pembatas laju) mempercayai X-Forwarded-For dari SIAPA
	// PUN -- terbukti lewat eksploitasi langsung bisa melewati rate limit
	// login total cukup ganti header itu per request. Lihat komentar
	// panjang di internal/config/config.go (field TrustedProxies).
	trustedProxies := strings.Split(cfg.TrustedProxies, ",")
	for i := range trustedProxies {
		trustedProxies[i] = strings.TrimSpace(trustedProxies[i])
	}
	if err := r.SetTrustedProxies(trustedProxies); err != nil {
		log.Fatalf("TRUSTED_PROXIES tidak valid: %v", err)
	}
	r.Use(middleware.RequestLogger())
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CORS(cfg.CORSAllowedOrigins))

	routes.Register(r, db, rdb, s3Client, queueClient, cfg, Version)

	srv := &http.Server{
		Addr:         ":" + cfg.AppPort,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	// Graceful shutdown -- penting agar request checkout yang sedang berjalan
	// tidak terputus mendadak saat deploy/restart container.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("Jeonme API berjalan di port %s (env: %s)", cfg.AppPort, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("menerima sinyal shutdown, menutup koneksi dengan aman...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("gagal shutdown dengan aman: %v", err)
	}

	log.Println("server berhenti dengan aman")
}

// runWorker menjalankan proses worker asynq (subcommand `./api worker`),
// lihat komentar di main() dan service `worker` di docker-compose*.yml.
// asynq.Server.Run menangani sendiri graceful shutdown lewat SIGINT/SIGTERM
// (menunggu task yang sedang berjalan selesai) -- tidak perlu signal
// handling manual seperti server HTTP di atas.
func runWorker() {
	cfg := config.Load()

	db, err := database.NewPostgresPool(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("worker: gagal konek database: %v", err)
	}
	defer db.Close()

	redisOpt, err := queue.RedisOptFromURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("worker: gagal menyiapkan koneksi Redis: %v", err)
	}

	// Modul Settings §6: purge akun (HandleAccountPurgeScan) mencabut sesi
	// aktif lewat Redis -- worker butuh *redis.Client sungguhan untuk itu,
	// beda dari redisOpt (asynq.RedisClientOpt) di atas yang cuma dipakai
	// asynq sendiri.
	rdb, err := database.NewRedisClient(cfg.RedisURL)
	if err != nil {
		log.Fatalf("worker: gagal konek Redis: %v", err)
	}
	defer rdb.Close()

	mailerClient := mailer.NewClient(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPFromAddr)
	whatsappClient := whatsapp.NewClient(cfg.WhatsAppAPIToken, cfg.WhatsAppPhoneNumberID, cfg.WhatsAppTemplateName, cfg.WhatsAppTemplateLang)
	handler := worker.NewHandler(db, rdb, mailerClient, whatsappClient, cfg.PublicAPIURL, cfg.HoldingPeriodDays, []byte(cfg.EncryptionKey))

	// Modul Settings §3: asynq.Scheduler ENQUEUE task ke Redis sesuai jadwal
	// cron -- task-nya sendiri tetap DIPROSES oleh srv.Run(handler.Mux())
	// di bawah, sama seperti task on-demand lain (satu antrian Redis yang
	// sama). Ini scheduler PERTAMA di proyek ini (sebelumnya semua task
	// on-demand/event-triggered) -- jalan di proses `worker` yang sama,
	// BUKAN proses terpisah, supaya tidak perlu container/subcommand baru.
	scheduler := asynq.NewScheduler(redisOpt, nil)
	if _, err := scheduler.Register("@daily", queue.NewAutoWithdrawScanTask()); err != nil {
		log.Fatalf("worker: gagal mendaftarkan jadwal auto-withdraw: %v", err)
	}
	// Modul Settings §6: purge akun yang masa tunggu 14 harinya sudah habis.
	if _, err := scheduler.Register("@daily", queue.NewAccountPurgeScanTask()); err != nil {
		log.Fatalf("worker: gagal mendaftarkan jadwal purge akun: %v", err)
	}
	go func() {
		if err := scheduler.Run(); err != nil {
			log.Fatalf("worker: scheduler gagal berjalan: %v", err)
		}
	}()
	defer scheduler.Shutdown()

	srv := asynq.NewServer(redisOpt, asynq.Config{Concurrency: 5})

	log.Println("Jeonme worker berjalan, menunggu task...")
	if err := srv.Run(handler.Mux()); err != nil {
		log.Fatalf("worker: gagal berjalan: %v", err)
	}
}
