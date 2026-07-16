package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
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
		// REQ-F-205: foto profil & sampul produk harus bisa diakses publik
		// permanen (bukan presigned URL kedaluwarsa seperti file produk
		// berbayar) -- lihat komentar storage.Client.EnsurePublicRead. KEDUA
		// prefix WAJIB dikirim dalam satu panggilan yang sama (SetBucketPolicy
		// menimpa, bukan menambah).
		if err := s3Client.EnsurePublicRead(ensureCtx, "avatars", "covers"); err != nil {
			log.Printf("peringatan: gagal mengatur akses publik untuk avatar/sampul: %v", err)
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
	r.Use(middleware.RequestLogger())
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

	mailerClient := mailer.NewClient(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPFromAddr)
	handler := worker.NewHandler(db, mailerClient, cfg.PublicAPIURL)

	srv := asynq.NewServer(redisOpt, asynq.Config{Concurrency: 5})

	log.Println("Jeonme worker berjalan, menunggu task...")
	if err := srv.Run(handler.Mux()); err != nil {
		log.Fatalf("worker: gagal berjalan: %v", err)
	}
}
