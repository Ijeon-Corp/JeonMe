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
	review := handlers.NewReviewHandler(db)
	bundle := handlers.NewBundleHandler(db)
	event := handlers.NewEventHandler(db)
	course := handlers.NewCourseHandler(db, rdb)
	booking := handlers.NewBookingHandler(db, rdb)
	loyalty := handlers.NewLoyaltyHandler(db, rdb)
	businessCard := handlers.NewBusinessCardHandler(db)
	donation := handlers.NewDonationHandler(db, rdb)
	affiliate := handlers.NewAffiliateHandler(db, cfg.PublicWebURL)
	audience := handlers.NewAudienceHandler(db, rdb)
	socialProof := handlers.NewSocialProofHandler(db, rdb)
	customDomain := handlers.NewCustomDomainHandler(db, cfg.CustomDomainCnameTarget)
	links := handlers.NewLinksHandler(db, queueClient, rdb, s3)
	midtransClient := midtrans.NewClient(cfg.MidtransServerKey, cfg.MidtransIsProduction)
	checkout := handlers.NewCheckoutHandler(db, midtransClient, cfg.MidtransServerKey, cfg.PublicWebURL, cfg.PlatformFeePercent, s3, queueClient)
	subscription := handlers.NewSubscriptionHandler(db, midtransClient, cfg.MidtransServerKey, cfg.PublicWebURL, cfg.PremiumMonthlyPriceIDR, cfg.PremiumYearlyPriceIDR)
	encryptionKey := []byte(cfg.EncryptionKey)
	balance := handlers.NewBalanceHandler(db, cfg.HoldingPeriodDays, encryptionKey)
	analytics := handlers.NewAnalyticsHandler(db)
	account := handlers.NewAccountHandler(db, rdb, s3)
	admin := handlers.NewAdminHandler(db)
	kyc := handlers.NewKycHandler(db, s3)
	collaborator := handlers.NewCollaboratorHandler(db, queueClient)
	settingsProfile := handlers.NewSettingsProfileHandler(db, rdb)
	onboarding := handlers.NewOnboardingHandler(db)
	notification := handlers.NewNotificationHandler(db)
	security := handlers.NewSecurityHandler(db, rdb)
	payoutMethod := handlers.NewPayoutMethodHandler(db, encryptionKey, cfg.AppEnv)
	payoutSchedule := handlers.NewPayoutScheduleHandler(db)

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
		// No.77: batasi spam formulir kontak.
		contactFormRateLimit := middleware.RateLimit(rdb, "contact-form", 10, time.Minute)

		auth_ := api.Group("/auth")
		{
			auth_.POST("/register", authRateLimit, auth.Register)
			auth_.POST("/login", authRateLimit, auth.Login)
			// Modul Settings §5: langkah kedua login untuk akun ber-2FA --
			// publik seperti /login itu sendiri (belum ada JWT di titik ini),
			// rate limit sama supaya kode TOTP tidak bisa di-brute-force.
			auth_.POST("/2fa/verify-login", authRateLimit, auth.VerifyLogin2FA)
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

		// No.98 (Sprint 14): halaman bio TAMBAHAN, namespace slug terpisah
		// dari username akun -- lihat catatan lingkup di PageHandler.
		api.GET("/p/:slug", page.GetPublicPageBySlug)

		// No.92 (Sprint 11): daftar slot booking yang tersedia -- dimuat
		// pengunjung saat memilih jadwal sebelum checkout.
		api.GET("/products/:id/available-slots", booking.ListAvailableSlots)

		// No.94 (Sprint 13): pembeli mengecek poin & menukar reward, publik
		// (tanpa akun, cukup email pembeli seperti checkout).
		api.GET("/pages/:username/loyalty", loyalty.GetMyPoints)
		api.POST("/loyalty/rewards/:id/redeem", loyalty.RedeemReward)

		// No.95 (Sprint 13): kartu kontak digital -- endpoint dituju QR code
		// kartu (bukan halaman utama kreator), publik.
		api.GET("/cards/:username", businessCard.GetPublicCard)
		api.POST("/cards/:username/contact", leadsRateLimit, businessCard.SubmitCardContact)

		// No.81 (Sprint 9): resolusi domain kustom -> username, dipanggil
		// proxy.ts (bukan browser).
		api.GET("/domains/:domain/resolve", customDomain.ResolveUsername)

		// Modul Settings §2: dipanggil app/[username]/page.tsx SETELAH
		// GetPublicPage 404, untuk redirect permanen dari username lama.
		api.GET("/usernames/:username/redirect", page.ResolveUsernameRedirect)

		// REQ-F-601: tracking klik/kunjungan, publik & ringan (fail-silent).
		api.POST("/pages/:username/track", trackRateLimit, analytics.Track)

		// No.98 (Sprint 14): tracking klik/kunjungan untuk halaman bio TAMBAHAN.
		api.POST("/p/:slug/track", trackRateLimit, analytics.TrackBySlug)

		// REQ-F-702 (bagian publik): siapa pun bisa melaporkan halaman/produk
		// tanpa perlu akun.
		api.POST("/reports", checkoutRateLimit, admin.CreateReport)

		// No.73 (Sprint 8): blok pengumpulan lead di halaman publik -- siapa
		// pun bisa submit tanpa akun, sama seperti /reports.
		api.POST("/leads", leadsRateLimit, audience.SubscribeLead)

		// No.79 (Sprint 9): buka tautan terkunci (usia/kode/subscribe).
		api.POST("/links/:id/unlock", linkUnlockRateLimit, links.Unlock)

		// No.77 (Sprint 9): kirim pesan lewat blok Formulir Kontak.
		api.POST("/links/:id/contact", contactFormRateLimit, links.SubmitContactForm)

		// Endpoint dashboard kreator -- dilindungi JWT.
		dashboard := api.Group("/dashboard")
		dashboard.Use(authRequired)
		{
			// No.87 (Sprint 10): kolaborator dengan akses terbatas. Ketiga
			// sub-grup di bawah dipasangi middleware.ActAsOwner supaya
			// kolaborator AKTIF dengan izin terkait bisa mengelola rute-rute
			// ini ATAS NAMA pemiliknya (lewat header X-Act-As-Owner) --
			// saldo/penarikan/KYC/domain/audiens/hapus akun SENGAJA TIDAK
			// dipasangi middleware ini sama sekali (lihat CollaboratorHandler).
			actAsDesign := middleware.ActAsOwner(db, "can_edit_design")
			actAsLinks := middleware.ActAsOwner(db, "can_edit_links")
			actAsProducts := middleware.ActAsOwner(db, "can_edit_products")

			designGroup := dashboard.Group("")
			designGroup.Use(actAsDesign)
			{
				designGroup.GET("/page", page.GetMyPage)
				designGroup.PATCH("/page", page.UpdateMyPage)
				designGroup.POST("/page/avatar", page.UploadAvatar)
				designGroup.POST("/page/background", page.UploadCustomBackground)

				// No.98 (Sprint 14): halaman bio TAMBAHAN (bukan halaman utama
				// di atas) -- lihat catatan lingkup di PageHandler.
				designGroup.GET("/pages", page.ListMyPages)
				designGroup.POST("/pages", page.CreatePage)
				designGroup.PATCH("/pages/:id", page.UpdatePage)
				designGroup.DELETE("/pages/:id", page.DeletePage)
			}

			linksGroup := dashboard.Group("")
			linksGroup.Use(actAsLinks)
			{
				linksGroup.GET("/links", links.List)
				linksGroup.POST("/links", links.Create)
				linksGroup.PATCH("/links/:id", links.Update)
				linksGroup.DELETE("/links/:id", links.Delete)
				linksGroup.PATCH("/links/reorder", links.Reorder)
				// Permintaan langsung pengguna: unggah gambar kustom per tautan
				// (menggantikan ikon platform otomatis di halaman publik).
				linksGroup.POST("/links/:id/icon", links.UploadIcon)
				linksGroup.DELETE("/links/:id/icon", links.DeleteIcon)

				// No.77 (Sprint 9): blok konten baru (video/formulir kontak/FAQ)
				// -- baris links yang sama, cuma butuh endpoint create sendiri
				// (validasi berbeda dari tautan biasa); edit/hapus/reorder pakai
				// endpoint yang sudah ada di atas.
				linksGroup.POST("/blocks", links.CreateBlock)

				// No.98 (Sprint 14): tautan untuk halaman bio TAMBAHAN --
				// edit/hapus/kunci tautan tetap pakai endpoint /links/:id di atas
				// (ownsLink tidak peduli is_primary), lihat catatan di links.go.
				linksGroup.GET("/pages/:id/links", links.ListForPage)
				linksGroup.POST("/pages/:id/links", links.CreateForPage)
				linksGroup.PATCH("/pages/:id/links/reorder", links.ReorderForPage)

				// No.99 (Sprint 14): blok builder landing page (heading/text/
				// image/button/dst) untuk halaman TAMBAHAN.
				linksGroup.POST("/pages/:id/blocks", links.CreateBlockForPage)
			}

			productsGroup := dashboard.Group("")
			productsGroup.Use(actAsProducts)
			{
				productsGroup.GET("/products", product.List)
				productsGroup.POST("/products", product.Create)
				productsGroup.PATCH("/products/:id", product.Update)
				productsGroup.DELETE("/products/:id", product.Delete)
				productsGroup.POST("/products/:id/upload", product.UploadFile)
				productsGroup.POST("/products/:id/cover", product.UploadCover)
				productsGroup.GET("/products/:id/download-url", product.GetDownloadURL)

				// Modul Toko (Fase C2/C3): metode penyerahan "random_code" (kelola
				// stok kode) dan "webhook" (lihat kunci tanda tangan sekali lagi).
				productsGroup.POST("/products/:id/codes", product.AddCodes)
				productsGroup.GET("/products/:id/codes", product.ListCodes)
				productsGroup.DELETE("/products/:id/codes/:codeId", product.DeleteCode)
				productsGroup.GET("/products/:id/webhook-secret", product.GetWebhookSecret)

				// Modul Toko (Fase E2): tab Listing (urutan & unggulan).
				productsGroup.PATCH("/products/reorder", product.Reorder)

				// Modul Toko (Fase E1): moderasi ulasan.
				productsGroup.GET("/reviews", review.List)
				productsGroup.PATCH("/reviews/:id", review.SetHidden)
				productsGroup.DELETE("/reviews/:id", review.Delete)

				// No.67 (Sprint 7): voucher/diskon per produk, milik kreator
				// sendiri seperti produk -- pola CRUD & ownership sama persis.
				productsGroup.GET("/vouchers", voucher.List)
				productsGroup.POST("/vouchers", voucher.Create)
				productsGroup.PATCH("/vouchers/:id", voucher.Update)
				productsGroup.DELETE("/vouchers/:id", voucher.Delete)

				// No.70 (Sprint 7): bundel adalah baris products biasa --
				// toggle aktif/hapus pakai product.Update/Delete yang sudah
				// ada, jadi cuma perlu List+Create di sini.
				productsGroup.GET("/bundles", bundle.List)
				productsGroup.POST("/bundles", bundle.Create)

				// No.71 (Sprint 7): blok dukungan/donasi -- juga baris products
				// (is_donation=true), tapi cuma SATU per kreator, jadi cukup
				// Get+Upsert (bukan CRUD list biasa).
				productsGroup.GET("/donation", donation.Get)
				productsGroup.PUT("/donation", donation.Upsert)

				// No.72 (Sprint 7): program afiliasi privat -- kreator undang
				// afiliator (email) + atur komisi per produk.
				productsGroup.POST("/affiliates", affiliate.Upsert)
				productsGroup.GET("/affiliates", affiliate.ListMine)
				productsGroup.DELETE("/affiliates/:id", affiliate.Revoke)
				productsGroup.DELETE("/affiliates/:id/products/:productId", affiliate.RemoveCommission)
				productsGroup.GET("/affiliate-programs", affiliate.ListPrograms)

				// No.90 (Sprint 11): blok event -- juga baris products biasa
				// (is_event=true), toggle aktif/hapus pakai product.Update/Delete
				// yang sudah ada, jadi cuma perlu List+Create di sini.
				productsGroup.GET("/events", event.List)
				productsGroup.POST("/events", event.Create)

				// No.91 (Sprint 11): blok kelas/kursus video -- juga baris
				// products biasa (is_course=true), toggle aktif/hapus pakai
				// product.Update/Delete yang sudah ada.
				productsGroup.GET("/courses", course.List)
				productsGroup.POST("/courses", course.Create)
				productsGroup.GET("/courses/:id/chapters", course.GetChapters)
				productsGroup.PUT("/courses/:id/chapters", course.ReplaceChapters)

				// No.92 (Sprint 11): booking konsultasi -- lihat catatan lingkup
				// di BookingHandler (TIDAK terhubung Google Calendar, kuota
				// dijamin lewat klaim slot atomik di database sendiri).
				productsGroup.GET("/bookings", booking.List)
				productsGroup.POST("/bookings", booking.Create)
				productsGroup.GET("/bookings/:id/slots", booking.ListSlots)
				productsGroup.POST("/bookings/:id/slots", booking.CreateSlots)
				productsGroup.DELETE("/bookings/:id/slots/:slotId", booking.DeleteSlot)

				// No.94 (Sprint 13): program poin loyalitas + katalog reward.
				// Penukaran reward menghasilkan voucher lewat tabel vouchers
				// yang sudah ada -- lihat catatan lingkup di LoyaltyHandler.
				productsGroup.GET("/loyalty/settings", loyalty.GetSettings)
				productsGroup.PUT("/loyalty/settings", loyalty.UpsertSettings)
				productsGroup.GET("/loyalty/rewards", loyalty.ListRewards)
				productsGroup.POST("/loyalty/rewards", loyalty.CreateReward)
				productsGroup.PATCH("/loyalty/rewards/:id", loyalty.UpdateReward)
				productsGroup.DELETE("/loyalty/rewards/:id", loyalty.DeleteReward)
			}

			// No.87: manajemen kolaborator itu sendiri SELALU beroperasi
			// sebagai diri sendiri (bukan lewat ActAsOwner) -- pemilik
			// mengundang/mencabut, siapa pun bisa melihat & menerima
			// undangan yang ditujukan ke emailnya sendiri.
			dashboard.POST("/collaborators", collaborator.Invite)
			dashboard.GET("/collaborators", collaborator.ListMine)
			dashboard.PATCH("/collaborators/:id/role", collaborator.UpdateRole)
			dashboard.DELETE("/collaborators/:id", collaborator.Revoke)
			dashboard.GET("/collaboration-invites", collaborator.ListInvitesForMe)
			dashboard.POST("/collaboration-invites/:id/accept", collaborator.AcceptInvite)
			dashboard.GET("/workspaces", collaborator.ListWorkspaces)

			// Modul Settings §4 acceptance criteria: pemilik bisa lihat
			// siapa mengubah apa dan kapan dari UI.
			dashboard.GET("/team/audit-log", collaborator.ListAuditLog)

			// No.73 (Sprint 8): blok pengumpulan lead + Manajer Audiens.
			dashboard.GET("/lead-capture", audience.GetLeadCaptureSettings)
			dashboard.PUT("/lead-capture", audience.UpsertLeadCaptureSettings)
			dashboard.GET("/audience", audience.GetAudience)

			// No.95 (Sprint 13): kartu kontak digital -- lihat catatan lingkup
			// di BusinessCardHandler (vCard .vcf, TANPA Apple/Google Wallet).
			dashboard.GET("/business-card", businessCard.GetCard)
			dashboard.PUT("/business-card", businessCard.UpsertCard)

			// No.76 (Sprint 8): notifikasi social proof "X baru saja membeli".
			dashboard.GET("/social-proof", socialProof.Get)
			dashboard.PUT("/social-proof", socialProof.Upsert)

			// No.81 (Sprint 9): domain kustom -- lihat catatan lingkup di
			// CustomDomainHandler (bagian aplikasi saja, belum wiring infra).
			dashboard.GET("/domain", customDomain.Get)
			dashboard.PUT("/domain", customDomain.Set)
			dashboard.POST("/domain/verify", customDomain.Verify)
			dashboard.DELETE("/domain", customDomain.Delete)

			dashboard.GET("/balance", balance.GetBalance)
			dashboard.POST("/payouts", balance.CreatePayout)
			dashboard.GET("/payouts", balance.ListPayouts)

			// No.89 (Sprint 10): transparansi biaya per metode pembayaran.
			dashboard.GET("/balance/fee-breakdown", balance.GetFeeBreakdown)

			// Modul Settings §3 (Payment / Payout) -- sama seperti
			// settings/profile & security di atas, TIDAK dipasangi
			// ActAsOwner (kolaborator tidak boleh mengubah metode
			// pembayaran/jadwal auto-withdraw pemilik).
			dashboard.GET("/payout-methods", payoutMethod.List)
			dashboard.POST("/payout-methods", payoutMethod.Create)
			dashboard.POST("/payout-methods/:id/request-verification", payoutMethod.RequestVerification)
			dashboard.POST("/payout-methods/:id/verify", payoutMethod.Verify)
			dashboard.PATCH("/payout-methods/:id/primary", payoutMethod.SetPrimary)
			dashboard.DELETE("/payout-methods/:id", payoutMethod.Delete)

			dashboard.GET("/payout-schedule", payoutSchedule.Get)
			dashboard.PUT("/payout-schedule", payoutSchedule.Upsert)

			// Modul Langganan Premium: status + mulai/batalkan langganan.
			dashboard.GET("/subscription", subscription.GetStatus)
			dashboard.POST("/subscription/checkout", subscription.Checkout)
			dashboard.POST("/subscription/cancel", subscription.Cancel)

			// No.84 (Sprint 10): verifikasi KYC dasar -- lihat catatan lingkup
			// di KycHandler (TIDAK memblokir penarikan, hanya memprioritaskan).
			dashboard.GET("/kyc", kyc.Get)
			dashboard.POST("/kyc", kyc.Submit)

			dashboard.GET("/analytics/summary", analytics.GetSummary)

			// Modul Statistik (tab "Toko"): daftar transaksi terbaru -- lihat
			// catatan lingkup lengkap di CheckoutHandler.ListRecentOrders.
			dashboard.GET("/orders/recent", checkout.ListRecentOrders)

			// Modul Toko (Fase C1): metode penyerahan "manual".
			dashboard.POST("/orders/:id/fulfill", checkout.MarkFulfilled)
			dashboard.GET("/analytics/export", analytics.ExportDailyCSV)

			// No.96 (Sprint 13): asisten analitik TANPA LLM API sungguhan --
			// lihat catatan lingkup di AnalyticsHandler.Ask.
			dashboard.POST("/analytics/ask", analytics.Ask)

			// Modul Settings §6 (Danger Zone): DeleteAccount instan LAMA
			// dihapus -- diganti alur nonaktifkan (reversibel kapan saja) +
			// ajukan hapus (masa tunggu 14 hari, lihat AccountHandler).
			dashboard.POST("/account/deactivate", account.Deactivate)
			dashboard.POST("/account/reactivate", account.Reactivate)
			dashboard.POST("/account/request-deletion", account.RequestDeletion)
			dashboard.POST("/account/cancel-deletion", account.CancelDeletion)
			dashboard.GET("/account/deletion-status", account.DeletionStatus)
			dashboard.GET("/account/export", account.Export)

			// Modul Settings §2 (Profile & Account): identitas akun --
			// TIDAK dipasangi ActAsOwner, sama seperti balance/KYC/domain/
			// hapus akun di atas (batas keamanan yang sama, kolaborator
			// tidak boleh mengubah identitas pemilik).
			dashboard.GET("/settings/profile", settingsProfile.Get)
			dashboard.PATCH("/settings/profile", settingsProfile.Update)

			// Modul Onboarding: pita pengingat "Tutorial" -- lihat catatan
			// lingkup lengkap di OnboardingHandler.
			dashboard.GET("/onboarding", onboarding.GetStatus)
			dashboard.POST("/onboarding/dismiss", onboarding.Dismiss)

			// Pusat notifikasi dalam-app (ikon lonceng di top bar dashboard).
			dashboard.GET("/notifications", notification.List)
			dashboard.POST("/notifications/:id/read", notification.MarkRead)
			dashboard.POST("/notifications/read-all", notification.MarkAllRead)

			// Modul Settings §5 (Security) -- sama seperti profile di atas,
			// TIDAK dipasangi ActAsOwner (kolaborator tidak boleh mengganti
			// password/2FA/sesi pemilik).
			dashboard.PATCH("/security/password", security.ChangePassword)
			dashboard.POST("/security/2fa/enable", security.Enable2FA)
			dashboard.POST("/security/2fa/verify", security.Verify2FA)
			dashboard.POST("/security/2fa/disable", security.Disable2FA)
			dashboard.POST("/security/2fa/snooze", security.Snooze2FA)
			dashboard.GET("/security/2fa/status", security.Status2FA)
			dashboard.GET("/security/sessions", security.ListSessions)
			dashboard.DELETE("/security/sessions/:jti", security.RevokeSession)
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

			// No.84 (Sprint 10): review pengajuan KYC kreator.
			adminGroup.GET("/kyc", kyc.AdminList)
			adminGroup.GET("/kyc/:userId", kyc.AdminGetDetail)
			adminGroup.PATCH("/kyc/:userId", kyc.AdminReview)
		}

		// Checkout publik -- REQ-F-401, tanpa perlu akun/login.
		api.POST("/checkout", checkoutRateLimit, checkout.Create)
		api.GET("/checkout/:id/status", checkout.GetStatus)

		// Modul Toko (Fase E1): ulasan pembeli -- publik, sama seperti seluruh
		// alur checkout (pembeli tidak punya akun).
		api.POST("/checkout/:id/review", checkoutRateLimit, review.Submit)

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
		api.GET("/checkout/:id/course-chapters", checkout.GetCourseChapters)

		// Webhook PSP -- REQ-F-403 (verifikasi signature_key di body DI
		// DALAM handler, sebelum payload diproses) & REQ-F-404 (idempotensi
		// lewat unique constraint psp_transaction_id).
		api.POST("/webhooks/midtrans", checkout.Webhook)

		// Modul Langganan Premium: notifikasi siklus penagihan BERULANG --
		// endpoint TERPISAH dari webhook order biasa di atas (Midtrans
		// mengirim ke "Recurring Notification URL", field terpisah dari
		// "Payment Notification URL" di dashboard Midtrans -- WAJIB
		// didaftarkan manual, lihat catatan lingkup di subscription.go).
		api.POST("/webhooks/midtrans-subscription", subscription.HandleCycleWebhook)
	}
}
