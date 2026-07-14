package routes

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/config"
	"github.com/jeonme/api/internal/handlers"
	"github.com/jeonme/api/internal/middleware"
	"github.com/jeonme/api/internal/storage"
	"github.com/jeonme/api/internal/xendit"
)

// Register mendaftarkan seluruh route API. Struktur mengikuti pemisahan
// modul pada Technical Design Document (auth, page, product, dst.)
// sehingga tiap modul mudah diekstraksi jadi service terpisah nanti.
// s3 boleh nil (mis. kalau EnsureBucket gagal saat startup) -- ProductHandler
// akan menolak endpoint upload/download dengan pesan jelas alih-alih panic.
func Register(r *gin.Engine, db *pgxpool.Pool, rdb *redis.Client, s3 *storage.Client, cfg *config.Config, version string) {
	health := handlers.NewHealthHandler(db, rdb, version)
	auth := handlers.NewAuthHandler(db, rdb, cfg.JWTSecret, cfg.AppEnv)
	page := handlers.NewPageHandler(db, rdb)
	product := handlers.NewProductHandler(db, s3)
	links := handlers.NewLinksHandler(db)
	xenditClient := xendit.NewClient(cfg.XenditSecretKey)
	checkout := handlers.NewCheckoutHandler(db, xenditClient, cfg.XenditWebhookKey, cfg.PublicWebURL, cfg.PlatformFeePercent)
	balance := handlers.NewBalanceHandler(db, cfg.HoldingPeriodDays)
	analytics := handlers.NewAnalyticsHandler(db)
	account := handlers.NewAccountHandler(db)

	// Dipakai health check pipeline deploy-production.yml -- lihat CICD-GUIDE.md.
	r.GET("/api/health", health.Check)

	api := r.Group("/api/v1")
	{
		authRequired := middleware.AuthRequired(cfg.JWTSecret, rdb)

		// NF-05: rate limit lebih ketat untuk endpoint yang rawan
		// disalahgunakan (brute force login/register, spam checkout/track).
		authRateLimit := middleware.RateLimit(rdb, "auth", 10, time.Minute)
		checkoutRateLimit := middleware.RateLimit(rdb, "checkout", 20, time.Minute)
		trackRateLimit := middleware.RateLimit(rdb, "track", 60, time.Minute)

		auth_ := api.Group("/auth")
		{
			auth_.POST("/register", authRateLimit, auth.Register)
			auth_.POST("/login", authRateLimit, auth.Login)
			auth_.POST("/logout", authRequired, auth.Logout)
			auth_.POST("/password-reset/request", auth.RequestPasswordReset)
			auth_.POST("/password-reset/confirm", auth.ConfirmPasswordReset)
			auth_.POST("/email-verification/request", authRequired, auth.RequestEmailVerification)
			auth_.POST("/email-verification/confirm", auth.ConfirmEmailVerification)
			// TODO: OAuth Google (REQ-F-101) -- menunggu GOOGLE_CLIENT_ID/SECRET
			// dari Google Cloud Console, lihat CICD-GUIDE.md / Rencana-Sprint-Jeonme.xlsx.
		}

		// Halaman publik -- TIDAK memerlukan auth, ini titik trafik tertinggi.
		api.GET("/pages/:username", page.GetPublicPage)

		// REQ-F-601: tracking klik/kunjungan, publik & ringan (fail-silent).
		api.POST("/pages/:username/track", trackRateLimit, analytics.Track)

		// Endpoint dashboard kreator -- dilindungi JWT.
		dashboard := api.Group("/dashboard")
		dashboard.Use(authRequired)
		{
			dashboard.GET("/page", page.GetMyPage)
			dashboard.PATCH("/page", page.UpdateMyPage)

			dashboard.GET("/links", links.List)
			dashboard.POST("/links", links.Create)
			dashboard.PATCH("/links/:id", links.Update)
			dashboard.DELETE("/links/:id", links.Delete)
			dashboard.PATCH("/links/reorder", links.Reorder)

			dashboard.GET("/products", product.List)
			dashboard.POST("/products", product.Create)
			dashboard.PATCH("/products/:id", product.Update)
			dashboard.DELETE("/products/:id", product.Delete)
			dashboard.POST("/products/:id/upload", product.UploadFile)
			dashboard.GET("/products/:id/download-url", product.GetDownloadURL)

			dashboard.GET("/balance", balance.GetBalance)
			dashboard.POST("/payouts", balance.CreatePayout)
			dashboard.GET("/payouts", balance.ListPayouts)

			dashboard.GET("/analytics/summary", analytics.GetSummary)

			dashboard.DELETE("/account", account.DeleteAccount)
		}

		// Checkout publik -- REQ-F-401, tanpa perlu akun/login.
		api.POST("/checkout", checkoutRateLimit, checkout.Create)
		api.GET("/checkout/:id/status", checkout.GetStatus)

		// Webhook PSP -- REQ-F-403 (verifikasi signature via header
		// x-callback-token DI DALAM handler, sebelum payload diproses) &
		// REQ-F-404 (idempotensi lewat unique constraint psp_transaction_id).
		api.POST("/webhooks/xendit", checkout.Webhook)
	}
}
