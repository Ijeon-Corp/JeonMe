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

	"github.com/jeonme/api/internal/config"
	"github.com/jeonme/api/internal/database"
	"github.com/jeonme/api/internal/middleware"
	"github.com/jeonme/api/internal/migrate"
	"github.com/jeonme/api/internal/routes"
)

func main() {
	// Subcommand `migrate` -- dipakai CI (sebelum go test) dan pipeline
	// deploy (sebelum menyalakan versi baru), lihat .github/workflows/*.yml.
	// Contoh: ./api migrate up | ./api migrate down | ./api migrate status
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		cfg := config.Load()
		if err := migrate.Run(os.Args[2:], cfg.DatabaseURL, "migrations"); err != nil {
			log.Fatalf("migrate: %v", err)
		}
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

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.RequestLogger())
	r.Use(middleware.CORS(cfg.CORSAllowedOrigins))

	routes.Register(r, db, rdb, cfg)

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
