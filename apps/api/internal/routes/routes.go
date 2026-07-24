package routes

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/config"
	"github.com/jeonme/api/internal/handlers"
	"github.com/jeonme/api/internal/middleware"
	"github.com/jeonme/api/internal/midtrans"
	"github.com/jeonme/api/internal/storage"
)

// Register mendaftarkan seluruh route API. Struktur mengikuti pemisahan
// modul pada Technical Design Document (auth, page, product, dst.)
// sehingga tiap modul mudah diekstraksi jadi service terpisah nanti.
// s3 boleh nil (mis. kalau EnsureBucket gagal saat startup) -- ProductHandler
// akan menolak endpoint upload/download dengan pesan jelas alih-alih panic.
// queueClient boleh nil (mis. kalau REDIS_URL tidak valid) -- notifikasi
// order.paid (REQ-F-405) akan dilewati dengan log peringatan, bukan panic.
func Register(r *gin.Engine, db *pgxpool.Pool, rdb *redis.Client, s3 *storage.Client, queueClient *asynq.Client, cfg *config.Config, version string) {
	health := handlers.NewHealthHandler(db, rdb, version)
	auth := handlers.NewAuthHandler(db, rdb, cfg.JWTSecret, cfg.AppEnv)
	page := handlers.NewPageHandler(db, rdb, s3)
	product := handlers.NewProductHandler(db, s3, rdb)
	voucher := handlers.NewVoucherHandler(db)
	bundle := handlers.NewBundleHandler(db)
	donation := handlers.NewDonationHandler(db)
	affiliate := handlers.NewAffiliateHandler(db, cfg.PublicWebURL)
	audience := handlers.NewAudienceHandler(db)
	socialProof := handlers.NewSocialProofHandler(db)
	links := handlers.NewLinksHandler(db)
	midtransClient := midtrans.NewClient(cfg.MidtransServerKey, cfg.MidtransIsProduction)
	checkout := handlers.NewCheckoutHandler(db, midtransClient, cfg.MidtransServerKey, cfg.PublicWebURL, cfg.PlatformFeePercent, s3, queueClient)
	balance := handlers.NewBalanceHandler(db, cfg.HoldingPeriodDays)
	analytics := handlers.NewAnalyticsHandler(db)
	account := handlers.NewAccountHandler(db)
	admin := handlers.NewAdminHandler(db)

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
		leadsRateLimit := middleware.RateLimit(rdb, "leads", 20, time.Minute)
		// No.79: batasi lebih ketat dari leads -- ini juga jalur brute-force
		// menebak kode akses tautan terkunci.
		linkUnlockRateLimit := middleware.RateLimit(rdb, "link-unlock", 15, time.Minute)

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

		// REQ-F-702 (bagian publik): siapa pun bisa melaporkan halaman/produk
		// tanpa perlu akun.
		api.POST("/reports", checkoutRateLimit, admin.CreateReport)

		// No.73 (Sprint 8): blok pengumpulan lead di halaman publik -- siapa
		// pun bisa submit tanpa akun, sama seperti /reports.
		api.POST("/leads", leadsRateLimit, audience.SubscribeLead)

		// No.79 (Sprint 9): buka tautan terkunci (usia/kode/subscribe).
		api.POST("/links/:id/unlock", linkUnlockRateLimit, links.Unlock)

		// Endpoint dashboard kreator -- dilindungi JWT.
		dashboard := api.Group("/dashboard")
		dashboard.Use(authRequired)
		{
			dashboard.GET("/page", page.GetMyPage)
			dashboard.PATCH("/page", page.UpdateMyPage)
			dashboard.POST("/page/avatar", page.UploadAvatar)

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
			dashboard.POST("/products/:id/cover", product.UploadCover)
			dashboard.GET("/products/:id/download-url", product.GetDownloadURL)

			// No.67 (Sprint 7): voucher/diskon per produk, milik kreator
			// sendiri seperti produk -- pola CRUD & ownership sama persis.
			dashboard.GET("/vouchers", voucher.List)
			dashboard.POST("/vouchers", voucher.Create)
			dashboard.PATCH("/vouchers/:id", voucher.Update)
			dashboard.DELETE("/vouchers/:id", voucher.Delete)

			// No.70 (Sprint 7): bundel adalah baris products biasa --
			// toggle aktif/hapus pakai product.Update/Delete yang sudah
			// ada, jadi cuma perlu List+Create di sini.
			dashboard.GET("/bundles", bundle.List)
			dashboard.POST("/bundles", bundle.Create)

			// No.71 (Sprint 7): blok dukungan/donasi -- juga baris products
			// (is_donation=true), tapi cuma SATU per kreator, jadi cukup
			// Get+Upsert (bukan CRUD list biasa).
			dashboard.GET("/donation", donation.Get)
			dashboard.PUT("/donation", donation.Upsert)

			// No.72 (Sprint 7): program afiliasi privat -- kreator undang
			// afiliator (email) + atur komisi per produk.
			dashboard.POST("/affiliates", affiliate.Upsert)
			dashboard.GET("/affiliates", affiliate.ListMine)
			dashboard.DELETE("/affiliates/:id", affiliate.Revoke)
			dashboard.DELETE("/affiliates/:id/products/:productId", affiliate.RemoveCommission)
			dashboard.GET("/affiliate-programs", affiliate.ListPrograms)

			// No.73 (Sprint 8): blok pengumpulan lead + Manajer Audiens.
			dashboard.GET("/lead-capture", audience.GetLeadCaptureSettings)
			dashboard.PUT("/lead-capture", audience.UpsertLeadCaptureSettings)
			dashboard.GET("/audience", audience.GetAudience)

			// No.76 (Sprint 8): notifikasi social proof "X baru saja membeli".
			dashboard.GET("/social-proof", socialProof.Get)
			dashboard.PUT("/social-proof", socialProof.Upsert)

			dashboard.GET("/balance", balance.GetBalance)
			dashboard.POST("/payouts", balance.CreatePayout)
			dashboard.GET("/payouts", balance.ListPayouts)

			dashboard.GET("/analytics/summary", analytics.GetSummary)

			dashboard.DELETE("/account", account.DeleteAccount)
		}

		// Panel Admin -- REQ-F-701/702/703. Tidak ada jalur self-service untuk
		// jadi admin (lihat komentar AdminHandler); dilindungi dua lapis:
		// AuthRequired (harus login) + AdminRequired (role='admin' di DB).
		adminRequired := middleware.AdminRequired(db)
		adminGroup := api.Group("/admin")
		adminGroup.Use(authRequired, adminRequired)
		{
			adminGroup.GET("/summary", admin.GetSummary)

			adminGroup.GET("/users", admin.ListUsers)
			adminGroup.PATCH("/users/:id/suspend", admin.SuspendUser)
			adminGroup.PATCH("/users/:id/activate", admin.ActivateUser)

			adminGroup.GET("/reports", admin.ListReports)
			adminGroup.PATCH("/reports/:id/resolve", admin.ResolveReport)

			// REQ-F-505: rekonsiliasi disbursement lintas kreator -- admin
			// memproses pengajuan penarikan secara manual (belum ada
			// integrasi Disbursement API sungguhan).
			adminGroup.GET("/payouts", admin.ListPayouts)
			adminGroup.PATCH("/payouts/:id", admin.UpdatePayoutStatus)
		}

		// Checkout publik -- REQ-F-401, tanpa perlu akun/login.
		api.POST("/checkout", checkoutRateLimit, checkout.Create)
		api.GET("/checkout/:id/status", checkout.GetStatus)

		// No.67: pratinjau diskon voucher sebelum checkout sungguhan --
		// rate limit sama dengan checkout supaya kode tidak bisa di-brute-force.
		api.POST("/checkout/validate-voucher", checkoutRateLimit, checkout.ValidateVoucher)

		// REQ-F-405: tautan unduhan permanen yang diklik dari email
		// notifikasi -- publik (pembeli tidak punya akun), lihat komentar
		// CheckoutHandler.DownloadFile.
		api.GET("/checkout/:id/download", checkout.DownloadFile)

		// No.70: daftar unduhan multi-file untuk bundel yang sudah lunas --
		// publik, cuma bisa diakses kalau tahu orderID yang valid & lunas.
		api.GET("/checkout/:id/bundle-items", checkout.GetBundleItems)

		// Webhook PSP -- REQ-F-403 (verifikasi signature_key di body DI
		// DALAM handler, sebelum payload diproses) & REQ-F-404 (idempotensi
		// lewat unique constraint psp_transaction_id).
		api.POST("/webhooks/midtrans", checkout.Webhook)
	}
}
