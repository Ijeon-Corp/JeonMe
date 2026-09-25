package routes

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/appleoauth"
	"github.com/jeonme/api/internal/config"
	"github.com/jeonme/api/internal/duitku"
	"github.com/jeonme/api/internal/googleoauth"
	"github.com/jeonme/api/internal/handlers"
	"github.com/jeonme/api/internal/instagramoauth"
	"github.com/jeonme/api/internal/middleware"
	"github.com/jeonme/api/internal/midtrans"
	"github.com/jeonme/api/internal/moderation"
	"github.com/jeonme/api/internal/pageimport"
	"github.com/jeonme/api/internal/payment"
	"github.com/jeonme/api/internal/storage"
	"github.com/jeonme/api/internal/tiktokoauth"
)

// Register mendaftarkan seluruh route API. Struktur mengikuti pemisahan
// modul pada Technical Design Document (auth, page, product, dst.)
// sehingga tiap modul mudah diekstraksi jadi service terpisah nanti.
// s3 boleh nil (mis. kalau EnsureBucket gagal saat startup) -- ProductHandler
// akan menolak endpoint upload/download dengan pesan jelas alih-alih panic.
// queueClient boleh nil (mis. kalau REDIS_URL tidak valid) -- notifikasi
// order.paid (REQ-F-405) akan dilewati dengan log peringatan, bukan panic.
func Register(r *gin.Engine, db *pgxpool.Pool, rdb *redis.Client, s3 *storage.Client, queueClient *asynq.Client, cfg *config.Config, version string) {
	health := handlers.NewHealthHandler(db, rdb, version, cfg.HealthToken)
	auth := handlers.NewAuthHandler(db, rdb, cfg.JWTSecret, cfg.AppEnv)
	auth.GoogleOAuth = googleoauth.NewClient(cfg.GoogleClientID, cfg.GoogleClientSecret)
	auth.AppleOAuth = appleoauth.NewClient(cfg.AppleTeamID, cfg.AppleClientID, cfg.AppleKeyID, cfg.ApplePrivateKey)
	auth.Queue = queueClient
	auth.PublicWebURL = cfg.PublicWebURL
	page := handlers.NewPageHandler(db, rdb, s3)
	// Modul Koneksi Sosial (migrasi 000069, permintaan langsung pengguna:
	// "saya mau jeonme ini bisa connect ke akun kita contoh nya instagram
	// tiktok") -- KEDUA klien (dashboard connect/disconnect DAN feed
	// publik di GetPublicPage) WAJIB pakai instance yang sama-sama dibuat
	// dari kredensial yang sama di sini, bukan dua NewClient terpisah yang
	// kebetulan sama nilainya -- supaya kalau kredensial diubah lewat env
	// var, tidak ada jalur yang ketinggalan pakai yang lama.
	socialConnect := handlers.NewSocialConnectHandler(db, rdb)
	socialConnect.Instagram = instagramoauth.NewClient(cfg.InstagramAppID, cfg.InstagramAppSecret)
	socialConnect.TikTok = tiktokoauth.NewClient(cfg.TikTokClientKey, cfg.TikTokClientSecret)
	page.Instagram = socialConnect.Instagram
	page.TikTok = socialConnect.TikTok
	product := handlers.NewProductHandler(db, s3, rdb, cfg.PlatformFeePercent)
	voucher := handlers.NewVoucherHandler(db)
	review := handlers.NewReviewHandler(db)
	bundle := handlers.NewBundleHandler(db)
	event := handlers.NewEventHandler(db)
	course := handlers.NewCourseHandler(db, rdb)
	loyalty := handlers.NewLoyaltyHandler(db, rdb, queueClient, cfg.AppEnv)
	businessCard := handlers.NewBusinessCardHandler(db, s3, rdb)
	donation := handlers.NewDonationHandler(db, rdb)
	affiliate := handlers.NewAffiliateHandler(db, cfg.PublicWebURL, cfg.PlatformFeePercent)
	brand := handlers.NewBrandHandler(db)
	audience := handlers.NewAudienceHandler(db, rdb, queueClient, s3)
	socialProof := handlers.NewSocialProofHandler(db, rdb)
	links := handlers.NewLinksHandler(db, queueClient, rdb, s3)
	midtransClient := midtrans.NewClient(cfg.MidtransServerKey, cfg.MidtransIsProduction)
	// Kerangka multi-gateway (13 September 2026, permintaan langsung
	// pengguna: "buatkan kerangka payment gateway menggunakan duitku,
	// tapi tetep keep midtrans untuk transaksi sandbox") -- lihat catatan
	// lengkap lingkup & alasan di internal/payment/gateway.go.
	// PaymentGatewayProvider default "midtrans" (config.go) kalau env var
	// tidak diset, jadi sandbox/staging TETAP Midtrans tanpa perubahan apa
	// pun kecuali sengaja di-set "duitku".
	duitkuClient := duitku.NewClient(cfg.DuitkuMerchantCode, cfg.DuitkuAPIKey, cfg.DuitkuIsProduction)
	paymentGateway := payment.SelectGateway(cfg.PaymentGatewayProvider, midtransClient, duitkuClient, cfg.PublicAPIURL+"/webhooks/duitku")
	checkout := handlers.NewCheckoutHandler(db, midtransClient, paymentGateway, cfg.MidtransServerKey, cfg.PublicWebURL, cfg.PlatformFeePercent, s3, queueClient, rdb, cfg.AppEnv)
	subscription := handlers.NewSubscriptionHandler(db, midtransClient, cfg.MidtransServerKey, cfg.PublicWebURL, cfg.PremiumMonthlyPriceIDR, cfg.PremiumYearlyPriceIDR)
	encryptionKey := []byte(cfg.EncryptionKey)
	socialConnect.EncryptionKey = encryptionKey
	page.EncryptionKey = encryptionKey
	// Moderasi tautan sensitif (judi online/18+) -- permintaan langsung
	// pengguna, 22 Agustus 2026, lihat catatan lengkap di
	// handlers.LinkModerationChecker. SATU instance dibagi ke LinksHandler
	// & ProductHandler (pola sama seperti encryptionKey di atas).
	linkModeration := &handlers.LinkModerationChecker{DB: db, AI: moderation.NewClient(cfg.AnthropicAPIKey)}
	links.Moderation = linkModeration
	product.Moderation = linkModeration
	// Fitur Import (permintaan langsung pengguna, 31 Agustus 2026): generate
	// halaman dari screenshot + URL link-in-bio lama -- lihat catatan lingkap
	// di handlers.ImportHandler. Pakai ANTHROPIC_API_KEY yang SAMA dengan
	// moderasi tautan di atas (satu key Anthropic dipakai beberapa fitur),
	// TIDAK butuh secret baru.
	importHandler := handlers.NewImportHandler(db, rdb, pageimport.NewVisionClient(cfg.AnthropicAPIKey))
	balance := handlers.NewBalanceHandler(db, cfg.HoldingPeriodDays, encryptionKey)
	analytics := handlers.NewAnalyticsHandler(db, encryptionKey, cfg.PublicWebURL)
	analyticsSettings := handlers.NewAnalyticsSettingsHandler(db, rdb, encryptionKey)
	account := handlers.NewAccountHandler(db, rdb, s3)
	admin := handlers.NewAdminHandler(db, rdb, cfg.PublicWebURL)
	admin.Queue = queueClient
	kyc := handlers.NewKycHandler(db, s3)
	supportChat := handlers.NewSupportChatHandler(db)
	collaborator := handlers.NewCollaboratorHandler(db, queueClient)
	settingsProfile := handlers.NewSettingsProfileHandler(db, rdb)
	onboarding := handlers.NewOnboardingHandler(db)
	notification := handlers.NewNotificationHandler(db)
	security := handlers.NewSecurityHandler(db, rdb)
	payoutMethod := handlers.NewPayoutMethodHandler(db, encryptionKey, cfg.AppEnv, rdb, queueClient)
	payoutSchedule := handlers.NewPayoutScheduleHandler(db)

	// Dipakai health check pipeline deploy-production.yml -- lihat CICD-GUIDE.md.
	// /api/health (publik) kini hanya {"status":"ok"} -- audit keamanan 15
	// Agustus 2026, supaya git SHA + rincian komponen tidak terekspos ke publik
	// untuk fingerprint riset CVE. Request internal (loopback ATAU header
	// X-Health-Token cocok env HEALTH_TOKEN) tetap dapat version + checks,
	// dipakai runner CI -- lihat health.go.
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
		// Live-check username /register -- lebih longgar dari authRateLimit
		// (10/menit) karena dipanggil tiap kali pengguna berhenti mengetik,
		// bukan cuma sekali per submit.
		checkUsernameRateLimit := middleware.RateLimit(rdb, "check-username", 30, time.Minute)
		// Audit 4 September 2026: AvatarProxy (lihat catatan di
		// businessCard.AvatarProxy) melakukan download S3 atau fetch
		// outbound live per request TANPA cache -- endpoint publik pertama
		// yang begitu, dan sebelum ini satu-satunya tanpa rate limit sama
		// sekali. Tanpa batas, klien terskrip bisa memicu fetch origin
		// berulang (biaya S3, koneksi outbound) tanpa henti.
		avatarProxyRateLimit := middleware.RateLimit(rdb, "avatar-proxy", 30, time.Minute)
		// Audit OWASP A04 (4 September 2026): loyalitas (publik, keduanya
		// keyed cuma dari email pembeli, tanpa bukti kepemilikan -- lihat
		// catatan di LoyaltyHandler) & pengiriman dokumen KYC sebelumnya
		// tidak dibatasi sama sekali, padahal keduanya endpoint yang
		// menyentuh nilai/nilai riwayat sungguhan.
		loyaltyRateLimit := middleware.RateLimit(rdb, "loyalty", 20, time.Minute)
		kycRateLimit := middleware.RateLimit(rdb, "kyc-submit", 5, time.Minute)
		// payoutOTPRateLimit & collabInviteRateLimit -- 24 September 2026
		// (audit backend). BUCKET SENDIRI, sengaja BUKAN authRateLimit:
		// selama TRUSTED_PROXIES belum diset di produksi (tidak ada di file
		// compose mana pun, jadi default 127.0.0.1 berlaku), ClientIP() untuk
		// SEMUA pengguna adalah IP gateway Docker -- setiap bucket rate limit
		// efektif berlaku SE-SITUS. Rute OTP pencairan sempat dipasangi
		// authRateLimit (a2b6f10), artinya percobaan OTP ikut menghabiskan
		// kuota login/register seluruh situs; bucket terpisah memutus
		// keterkaitan itu. Undangan kolaborator mengirim email ke alamat
		// pihak ketiga dengan subject yang ikut dikendalikan lewat username,
		// jadi dibatasi -- juga di bucket sendiri.
		payoutOTPRateLimit := middleware.RateLimit(rdb, "payout-otp", 10, time.Minute)
		collabInviteRateLimit := middleware.RateLimit(rdb, "collab-invite", 10, time.Minute)
		// checkoutStatusRateLimit -- LEBIH LONGGAR dari checkoutRateLimit
		// (20/menit) SENGAJA: app/checkout/[id]/page.tsx (frontend) polling
		// status TIAP 2 DETIK selagi menunggu konfirmasi pembayaran (~30
		// request/menit WAJAR untuk SATU pembeli menunggu) -- limit yang
		// sama dengan checkout/review/validate-voucher akan memblokir
		// pembeli sah di tengah menunggu, bukan cuma mencegah
		// penyalahgunaan.
		checkoutStatusRateLimit := middleware.RateLimit(rdb, "checkout-status", 60, time.Minute)
		// orderHistoryRateLimit -- riwayat pembelian pembeli (permintaan
		// langsung pengguna, 10 September 2026), sama nilainya dgn
		// loyaltyRateLimit (pola verifikasi kode 6-digit identik).
		orderHistoryRateLimit := middleware.RateLimit(rdb, "order-history", 20, time.Minute)
		// supportChatSendRateLimit -- Live Chat dukungan (permintaan langsung
		// pengguna, 7 September 2026), sekelas leads/contact-form (kirim
		// teks pengguna). supportChatPollRateLimit -- SupportChatWidget.tsx
		// memanggil GET /support-chat/messages berulang: ~4.5 detik saat
		// panel terbuka, ~25 detik saat tertutup -- limit sekelas
		// leads/kyc (20/menit) akan memblokir pemakaian wajar satu kreator
		// yang sedang aktif chatting, jadi disamakan dgn checkoutStatusRateLimit.
		supportChatSendRateLimit := middleware.RateLimit(rdb, "support-chat-send", 20, time.Minute)
		supportChatPollRateLimit := middleware.RateLimit(rdb, "support-chat-poll", 60, time.Minute)
		// webhookRateLimit -- audit performa/keamanan profesional 15
		// September 2026 (Low): ketiga webhook PSP di bawah (Midtrans
		// order, Duitku, Midtrans langganan) SEBELUMNYA tidak dibatasi laju
		// sama sekali, beda dari hampir semua endpoint sensitif lain di
		// file ini. Limit sengaja JAUH lebih longgar dari
		// checkoutStatusRateLimit (60/menit, itu pun cuma utk SATU pembeli
		// polling) -- traffic webhook nyata AGREGAT dari SEMUA order SEMUA
		// kreator platform ini datang dari IP gateway Midtrans/Duitku yang
		// sama, jadi limit ketat justru menolak notifikasi SAH pas lonjakan
		// (promo/flash sale rame-rame), bukan cuma mencegah
		// penyalahgunaan. 300/menit (5 req/detik) tetap jauh di atas volume
		// wajar platform ini sekarang, tapi tetap ada sbg lapisan
		// pertahanan tambahan -- verifikasi signature_key DI DALAM handler
		// (REQ-F-403) tetap pertahanan UTAMA thd payload palsu, rate limit
		// ini murni backstop thd banjir request (mis. bug retry loop di
		// sisi PSP, atau percobaan DoS/scan).
		webhookRateLimit := middleware.RateLimit(rdb, "webhook-psp", 300, time.Minute)

		auth_ := api.Group("/auth")
		{
			auth_.POST("/register", authRateLimit, auth.Register)
			auth_.GET("/check-username", checkUsernameRateLimit, auth.CheckUsername)
			auth_.POST("/login", authRateLimit, auth.Login)
			// Modul Settings §5: langkah kedua login untuk akun ber-2FA --
			// publik seperti /login itu sendiri (belum ada JWT di titik ini),
			// rate limit sama supaya kode TOTP tidak bisa di-brute-force.
			auth_.POST("/2fa/verify-login", authRateLimit, auth.VerifyLogin2FA)
			auth_.POST("/logout", authRequired, auth.Logout)
			auth_.GET("/me", authRequired, auth.GetMe)
			// Perbaikan (audit keamanan 14 Agustus 2026): dulu KEDUA endpoint
			// ini tanpa rate limit sama sekali (beda dari /login, /register,
			// /2fa/verify-login di atas) -- dibuktikan lewat 15 request
			// beruntun ke /confirm tanpa satu pun kena 429. Dimitigasi
			// sebagian oleh entropi token reset (32 byte acak), tapi tetap
			// nol defense-in-depth. authRateLimit sama seperti endpoint auth
			// lain -- bucket dibagi per prefix "auth", bukan bucket baru.
			auth_.POST("/password-reset/request", authRateLimit, auth.RequestPasswordReset)
			auth_.POST("/password-reset/confirm", authRateLimit, auth.ConfirmPasswordReset)
			auth_.POST("/email-verification/request", authRequired, auth.RequestEmailVerification)
			auth_.POST("/email-verification/confirm", auth.ConfirmEmailVerification)
			// Aktivasi akun baru (permintaan langsung pengguna, 19 Agustus
			// 2026) -- publik seperti /register itu sendiri, rate limit sama
			// (authRateLimit) supaya kode 6 digit tidak bisa di-brute-force
			// lewat rate limit LAYER INI (di atas lockout per-email di
			// ConfirmSignupVerification sendiri -- dua lapis, sama pola
			// dengan /login+checkLoginLockout).
			auth_.POST("/signup-verification/confirm", authRateLimit, auth.ConfirmSignupVerification)
			auth_.POST("/signup-verification/resend", authRateLimit, auth.ResendSignupVerification)
			// Alur Authorization Code penuh (bukan Google Identity Services
			// popup) -- lihat AuthHandler.GoogleLogin. Melayani login MAUPUN
			// register sekaligus, satu tombol dipakai di kedua halaman
			// (apps/web/components/GoogleAuthButton.tsx), jadi cukup satu
			// rate limit bucket yang sama dengan register/login biasa.
			auth_.POST("/google", authRateLimit, auth.GoogleLogin)
			// AppleLogin -- pola SAMA PERSIS dengan /google di atas (lihat
			// AuthHandler.AppleLogin, apps/web/components/AppleAuthButton.tsx).
			auth_.POST("/apple", authRateLimit, auth.AppleLogin)
		}

		// Halaman publik -- TIDAK memerlukan auth, ini titik trafik tertinggi.
		api.GET("/pages/:username", page.GetPublicPage)

		// No.98 (Sprint 14): halaman bio TAMBAHAN. Revisi 28 Agustus 2026
		// (permintaan langsung pengguna): URL publik pindah dari
		// jeonme.com/p/{slug} (slug unik GLOBAL) ke
		// jeonme.com/{username}/{slug} (slug unik PER-USER, lihat migrasi
		// 000079) -- endpoint API ini SENGAJA tetap berprefiks "/p/"
		// (bukan jadi "/:username/:slug" telanjang di root) supaya tidak
		// bentrok dengan segmen statis rute lain di grup yang sama (/auth,
		// /dashboard, dst) -- path API publik tidak wajib sama persis
		// dengan URL halaman publik di Next.js.
		api.GET("/p/:username/:slug", page.GetPublicPageBySlug)

		// No.94 (Sprint 13): pembeli mengecek poin & menukar reward, publik
		// (tanpa akun, cukup email pembeli seperti checkout).
		// Audit OWASP A04 (4 September 2026): request-code/verify-code
		// menegakkan bukti kepemilikan email SEBELUM GetMyPoints/
		// RedeemReward mau menunjukkan/membelanjakan poin -- lihat catatan
		// lengkap di LoyaltyHandler.RequestVerificationCode.
		api.POST("/pages/:username/loyalty/request-code", loyaltyRateLimit, loyalty.RequestVerificationCode)
		api.POST("/pages/:username/loyalty/verify-code", loyaltyRateLimit, loyalty.VerifyCode)
		api.GET("/pages/:username/loyalty", loyaltyRateLimit, loyalty.GetMyPoints)
		api.POST("/loyalty/rewards/:id/redeem", loyaltyRateLimit, loyalty.RedeemReward)

		// No.95 (Sprint 13): kartu kontak digital -- endpoint dituju QR code
		// kartu (bukan halaman utama kreator), publik.
		api.GET("/cards/:username", businessCard.GetPublicCard)
		// Proxy foto profil untuk komposer PNG kartu nama (lihat AvatarProxy).
		api.GET("/cards/:username/avatar", avatarProxyRateLimit, businessCard.AvatarProxy)
		// Proxy background kustom kartu (migrasi 000094) -- sama alasan &
		// batas rate limit dengan proxy avatar di atas.
		api.GET("/cards/:username/background", avatarProxyRateLimit, businessCard.BackgroundImageProxy)
		api.POST("/cards/:username/contact", leadsRateLimit, businessCard.SubmitCardContact)

		// Modul Settings §2: dipanggil app/[username]/page.tsx SETELAH
		// GetPublicPage 404, untuk redirect permanen dari username lama.
		api.GET("/usernames/:username/redirect", page.ResolveUsernameRedirect)

		// Perbaikan SEO/marketing (temuan audit, 15 Agustus 2026): halaman
		// publik (landing page, /pricing) butuh harga Premium ASLI tanpa
		// login -- lihat komentar panjang di SubscriptionHandler.GetPlans.
		api.GET("/plans", subscription.GetPlans)

		// REQ-F-601: tracking klik/kunjungan, publik & ringan (fail-silent).
		api.POST("/pages/:username/track", trackRateLimit, analytics.Track)

		// No.98 (Sprint 14): tracking klik/kunjungan untuk halaman bio
		// TAMBAHAN -- :username ditambahkan 28 Agustus 2026 sejalan dengan
		// perubahan URL publik di atas.
		api.POST("/p/:username/:slug/track", trackRateLimit, analytics.TrackBySlug)

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
		// Kritik & Saran dari footer halaman publik (18 September 2026) --
		// per username kreator, rate limit & antrean notifikasi sama dgn
		// formulir kontak (lihat LinksHandler.SubmitPageFeedback).
		api.POST("/pages/:username/feedback", contactFormRateLimit, links.SubmitPageFeedback)

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
				// Modul Desain: stiker interaktif -- endpoint TERPISAH dari PATCH
				// /page di atas, ganti array UTUH tiap simpan (lihat catatan di
				// UpdateMyPageStickers).
				designGroup.PUT("/page/stickers", page.UpdateMyPageStickers)
				// Layout "Profil Kreator" (migrasi 000109): chip keahlian & baris
				// statistik, diganti UTUH tiap simpan -- pola sama dgn stiker.
				designGroup.PUT("/page/profile-extras", page.UpdateMyPageProfileExtras)

				// No.98 (Sprint 14): halaman bio TAMBAHAN (bukan halaman utama
				// di atas) -- lihat catatan lingkup di PageHandler.
				designGroup.GET("/pages", page.ListMyPages)
				designGroup.POST("/pages", page.CreatePage)
				designGroup.GET("/pages/:id", page.GetPage)
				designGroup.PATCH("/pages/:id", page.UpdatePage)
				designGroup.PUT("/pages/:id/stickers", page.UpdatePageStickers)
				designGroup.PUT("/pages/:id/profile-extras", page.UpdatePageProfileExtras)
				designGroup.DELETE("/pages/:id", page.DeletePage)
				// Modul Halaman Toko: panel desain penuh (Tema/Header/Tombol/
				// Font) untuk halaman TAMBAHAN, analog /page/avatar & /page/background di atas.
				designGroup.POST("/pages/:id/avatar", page.UploadAvatarForPage)
				designGroup.POST("/pages/:id/background", page.UploadCustomBackgroundForPage)
			}

			linksGroup := dashboard.Group("")
			linksGroup.Use(actAsLinks)
			{
				linksGroup.GET("/links", links.List)
				linksGroup.POST("/links", links.Create)
				linksGroup.PATCH("/links/:id", links.Update)
				linksGroup.DELETE("/links/:id", links.Delete)
				// Permintaan langsung pengguna, 20 Agustus 2026: "tambahkan fungsi
				// duplicate" -- lihat LinksHandler.Duplicate.
				linksGroup.POST("/links/:id/duplicate", links.Duplicate)
				linksGroup.PATCH("/links/reorder", links.Reorder)
				// Permintaan langsung pengguna: unggah gambar kustom per tautan
				// (menggantikan ikon platform otomatis di halaman publik).
				linksGroup.POST("/links/:id/icon", links.UploadIcon)
				linksGroup.DELETE("/links/:id/icon", links.DeleteIcon)
				// Modul "Featured Link" (permintaan langsung pengguna, referensi
				// "Featured Layout" Linktree sungguhan): thumbnail 16:9 manual --
				// pelengkap deriveYoutubeThumbnail otomatis (dipicu dari PATCH
				// /links/:id biasa, bukan endpoint terpisah) untuk tautan non-YouTube.
				linksGroup.POST("/links/:id/thumbnail", links.UploadThumbnail)
				linksGroup.DELETE("/links/:id/thumbnail", links.DeleteThumbnail)
				// Blok "gallery"/"audio" (hasil analisa galeri tema kompetitor,
				// 17 Agustus 2026) -- pola upload SAMA seperti icon/thumbnail di
				// atas, dipisah endpoint sendiri karena validasi & penyimpanan
				// block_data-nya beda (array multi-foto vs satu file audio).
				linksGroup.POST("/links/:id/gallery-images", links.UploadGalleryImage)
				linksGroup.DELETE("/links/:id/gallery-images/:index", links.DeleteGalleryImage)
				// "Foto di dalam foto" (permintaan langsung pengguna, 21 September
				// 2026) -- path TERPISAH ("gallery-nested-images", bukan
				// "gallery-images/nested") SENGAJA, supaya tidak menaruh segmen
				// statis "nested" pada kedalaman yang sama dgn parameter ":index"
				// di atas (berpotensi ambigu/konflik di router radix-tree Gin).
				linksGroup.POST("/links/:id/gallery-nested-images", links.UploadGalleryNestedImage)
				linksGroup.DELETE("/links/:id/gallery-nested-images", links.DeleteGalleryNestedImage)
				// Canvas Page Builder Fase 2 (permintaan langsung pengguna, 8
				// September 2026): blok foto-tunggal "image"/"video_image"/
				// "embed_link" berbagi SATU endpoint (lihat mediaImageBlockTypes,
				// links.go) -- "path" (field form/query, opsional) menjangkau blok
				// tertanam di dalam Section/Column, bukan cuma baris root.
				linksGroup.POST("/links/:id/media-image", links.UploadMediaImage)
				linksGroup.DELETE("/links/:id/media-image", links.DeleteMediaImage)
				linksGroup.POST("/links/:id/audio", links.UploadAudio)
				linksGroup.DELETE("/links/:id/audio", links.DeleteAudio)
				linksGroup.POST("/links/:id/video-file", links.UploadVideoFile)
				linksGroup.DELETE("/links/:id/video-file", links.DeleteVideoFile)
				// Blok "file" (permintaan langsung pengguna, 20 Agustus 2026:
				// "tambahkan file pdf download") -- pola upload SAMA seperti
				// audio di atas (satu file per blok).
				linksGroup.POST("/links/:id/file", links.UploadFile)
				linksGroup.DELETE("/links/:id/file", links.DeleteFile)
				// Blok "project_showcase" (permintaan langsung pengguna, 24
				// Agustus 2026: kartu "Project Unggulan") -- pola upload SAMA
				// seperti thumbnail di atas, gambar disimpan di block_data
				// (bukan kolom khusus), lihat UploadShowcaseImage.
				linksGroup.POST("/links/:id/showcase-image", links.UploadShowcaseImage)
				// Blok "catalog" (permintaan langsung pengguna, 25 Agustus
				// 2026: blok drill-down "Jenis Rumah" -> daftar jenis ->
				// detail per jenis) -- pola upload SAMA seperti gallery di
				// atas, tapi disisipkan ke item BERSARANG di dalam
				// block_data.items (bukan array datar), lihat
				// UploadCatalogItemImage.
				linksGroup.POST("/links/:id/catalog-items/:itemId/images", links.UploadCatalogItemImage)
				linksGroup.DELETE("/links/:id/catalog-items/:itemId/images/:index", links.DeleteCatalogItemImage)

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

				// Modul Toko (Fase E3): tab Storage & Files.
				productsGroup.GET("/storage", product.ListStorage)
				productsGroup.DELETE("/products/:id/file", product.DeleteFile)

				// Modul Toko (Fase E4): tab Webhook Events.
				productsGroup.GET("/webhook-events", product.ListWebhookEvents)

				// Modul Toko (Fase E5): tab Shop Settings.
				productsGroup.GET("/shop-settings", product.GetShopSettings)
				productsGroup.PATCH("/shop-settings", product.UpdateShopSettings)

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

				// Gap #4 benchmark kompetitif (9 Agustus 2026): wishlist ala
				// Saweria/Trakteer -- daftar barang, TIDAK digerbang blok
				// Donasi aktif/tidak (lihat catatan CreateWishlistItem).
				productsGroup.GET("/donation/wishlist", donation.ListWishlistItems)
				productsGroup.POST("/donation/wishlist", donation.CreateWishlistItem)
				productsGroup.DELETE("/donation/wishlist/:id", donation.DeleteWishlistItem)

				// No.72 (Sprint 7): program afiliasi privat -- kreator undang
				// afiliator (email) + atur komisi per produk.
				productsGroup.POST("/affiliates", affiliate.Upsert)
				productsGroup.GET("/affiliates", affiliate.ListMine)
				productsGroup.DELETE("/affiliates/:id", affiliate.Revoke)
				productsGroup.DELETE("/affiliates/:id/products/:productId", affiliate.RemoveCommission)
				productsGroup.GET("/affiliate-programs", affiliate.ListPrograms)
				// Marketplace afiliasi publik (benchmark Linktree Earn > Affiliate
				// Products, 3 September 2026): buka/tutup produk sendiri -- domain
				// produk, boleh kolaborator ber-akses produk.
				productsGroup.GET("/affiliate-public-products", affiliate.ListMyPublicProducts)
				productsGroup.PUT("/affiliate-public-products/:productId", affiliate.SetProductPublic)

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
			dashboard.POST("/collaborators", collabInviteRateLimit, collaborator.Invite)
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
			// Benchmark Linktree Earn > Contacts (3 September 2026): CRM ringan --
			// tag & catatan per kontak, lihat migrasi 000083.
			dashboard.POST("/audience/contact-meta", audience.UpsertContactMeta)
			// Gap #3 benchmark kompetitif (9 Agustus 2026): broadcast email
			// ke subscriber -- lihat catatan consent di migrations/000059.
			dashboard.GET("/audience/broadcasts", audience.ListBroadcasts)
			dashboard.POST("/audience/broadcasts", audience.CreateBroadcast)

			// No.95 (Sprint 13): kartu kontak digital -- lihat catatan lingkup
			// di BusinessCardHandler (vCard .vcf, TANPA Apple/Google Wallet).
			dashboard.GET("/business-card", businessCard.GetCard)
			dashboard.PUT("/business-card", businessCard.UpsertCard)
			dashboard.POST("/business-card/background", businessCard.UploadBackgroundImage)
			dashboard.DELETE("/business-card/background", businessCard.DeleteBackgroundImage)

			// No.76 (Sprint 8): notifikasi social proof "X baru saja membeli".
			dashboard.GET("/social-proof", socialProof.Get)
			dashboard.PUT("/social-proof", socialProof.Upsert)

			// Modul Analitik Pihak Ketiga (permintaan langsung pengguna, 12
			// Agustus 2026): Facebook Pixel + Conversions API, Google Analytics
			// (GA4), toggle UTM.
			dashboard.GET("/analytics-settings", analyticsSettings.Get)
			dashboard.PUT("/analytics-settings", analyticsSettings.Upsert)

			// Marketplace afiliasi: jelajah & bergabung atas nama DIRI SENDIRI --
			// sengaja di luar grup ActAs (kolaborator tidak boleh mendaftarkan
			// pemilik workspace sebagai afiliator produk orang lain).
			// Marketplace Brand <-> Kreator (benchmark Linktree Earn > Sponsored
			// Links & Brand Deals, 3 September 2026) -- owner-only, di luar ActAs.
			dashboard.GET("/brand/campaigns", brand.ListOpenCampaigns)
			dashboard.POST("/brand/campaigns/:id/apply", brand.Apply)
			dashboard.GET("/brand/applications", brand.ListMyApplications)
			dashboard.POST("/brand/applications/:id/publish", brand.PublishSponsoredLink)
			dashboard.GET("/brand/my-campaigns", brand.ListMyCampaigns)
			dashboard.POST("/brand/my-campaigns", brand.CreateCampaign)
			dashboard.PATCH("/brand/my-campaigns/:id", brand.UpdateCampaignStatus)
			dashboard.GET("/brand/my-campaigns/:id/applications", brand.ListCampaignApplications)
			dashboard.PATCH("/brand/my-campaigns/:id/applications/:appId", brand.DecideApplication)
			dashboard.GET("/affiliate-marketplace", affiliate.ListMarketplace)
			dashboard.POST("/affiliate-marketplace/:productId/join", affiliate.JoinMarketplace)

			dashboard.GET("/balance", balance.GetBalance)
			dashboard.POST("/payouts", balance.CreatePayout)
			dashboard.GET("/payouts", balance.ListPayouts)

			// No.89 (Sprint 10): transparansi biaya per metode pembayaran.
			dashboard.GET("/balance/fee-breakdown", balance.GetFeeBreakdown)
			// Benchmark Linktree Earn > Earnings: pendapatan per sumber.
			dashboard.GET("/balance/earnings-breakdown", balance.GetEarningsBreakdown)

			// Modul Settings §3 (Payment / Payout) -- sama seperti
			// settings/profile & security di atas, TIDAK dipasangi
			// ActAsOwner (kolaborator tidak boleh mengubah metode
			// pembayaran/jadwal auto-withdraw pemilik).
			dashboard.GET("/payout-methods", payoutMethod.List)
			dashboard.POST("/payout-methods", payoutMethod.Create)
			// payoutOTPRateLimit di kedua rute OTP -- DITAMBAHKAN 24
			// September 2026 (audit menyeluruh). SEBELUMNYA seluruh grup
			// payout-methods tidak punya middleware rate-limit sama sekali,
			// padahal rute auth di atas justru dibatasi untuk ancaman yang
			// PERSIS sama (gempur kode 6 digit). Ini lapis kedua di atas
			// lockout per-user di handler-nya: rate-limit ini per-IP,
			// lockout itu per-akun. Bucket-nya sendiri (bukan "auth") --
			// lihat catatan di deklarasi payoutOTPRateLimit soal
			// TRUSTED_PROXIES yang belum diset di produksi.
			dashboard.POST("/payout-methods/:id/request-verification", payoutOTPRateLimit, payoutMethod.RequestVerification)
			dashboard.POST("/payout-methods/:id/verify", payoutOTPRateLimit, payoutMethod.Verify)
			dashboard.PATCH("/payout-methods/:id/primary", payoutMethod.SetPrimary)
			dashboard.DELETE("/payout-methods/:id", payoutMethod.Delete)

			dashboard.GET("/payout-schedule", payoutSchedule.Get)
			dashboard.PUT("/payout-schedule", payoutSchedule.Upsert)

			// Modul Langganan Premium: status + mulai/batalkan langganan.
			dashboard.GET("/subscription", subscription.GetStatus)
			dashboard.POST("/subscription/checkout", subscription.Checkout)
			dashboard.POST("/subscription/cancel", subscription.Cancel)
			// Benchmark Linktree More > Billing: riwayat tagihan langganan.
			dashboard.GET("/subscription/payments", subscription.ListPayments)

			// No.84 (Sprint 10): verifikasi KYC dasar -- lihat catatan lingkup
			// di KycHandler (TIDAK memblokir penarikan, hanya memprioritaskan).
			dashboard.GET("/kyc", kyc.Get)
			dashboard.POST("/kyc", kycRateLimit, kyc.Submit)

			dashboard.GET("/analytics/summary", analytics.GetSummary)

			// Modul Statistik (tab "Toko"): daftar transaksi terbaru -- lihat
			// catatan lingkup lengkap di CheckoutHandler.ListRecentOrders.
			dashboard.GET("/orders/recent", checkout.ListRecentOrders)

			// Modul Toko (Fase C1): metode penyerahan "manual".
			dashboard.POST("/orders/:id/fulfill", checkout.MarkFulfilled)

			// Modul Toko (tab Transaction): daftar/detail transaksi + refund.
			dashboard.GET("/orders", checkout.ListOrders)
			dashboard.GET("/orders/:id", checkout.GetOrderDetail)
			dashboard.POST("/orders/:id/refund", checkout.RefundOrder)
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

			// Fitur Import -- TIDAK dipasangi ActAsOwner, sama alasan
			// settings/profile/balance/KYC di atas (kolaborator tidak boleh
			// akses), DITAMBAH berbiaya nyata per panggilan (Claude vision
			// API) -- lihat catatan lengkap di handlers.ImportHandler.
			dashboard.POST("/import/analyze", importHandler.Analyze)

			// Modul Koneksi Sosial (migrasi 000069, permintaan langsung
			// pengguna: "saya mau jeonme ini bisa connect ke akun kita
			// contoh nya instagram tiktok") -- TIDAK dipasangi ActAsOwner,
			// sama seperti settings/profile di atas (identitas akun,
			// kolaborator tidak boleh menyambungkan/memutus akun sosial
			// pemilik). ConnectInstagram/ConnectTikTok menerima authorization
			// code (POST, bukan redirect langsung dari server) -- lihat
			// catatan lengkap pola ini di SocialConnectHandler.ConnectInstagram.
			dashboard.GET("/social-connect", socialConnect.List)
			dashboard.POST("/social-connect/instagram", socialConnect.ConnectInstagram)
			dashboard.POST("/social-connect/tiktok", socialConnect.ConnectTikTok)
			dashboard.DELETE("/social-connect/:platform", socialConnect.Disconnect)

			// Modul Onboarding: pita pengingat "Tutorial" -- lihat catatan
			// lingkup lengkap di OnboardingHandler.
			dashboard.GET("/onboarding", onboarding.GetStatus)
			dashboard.POST("/onboarding/dismiss", onboarding.Dismiss)

			// Pusat notifikasi dalam-app (ikon lonceng di top bar dashboard).
			dashboard.GET("/notifications", notification.List)
			dashboard.POST("/notifications/:id/read", notification.MarkRead)
			dashboard.POST("/notifications/read-all", notification.MarkAllRead)

			// Live chat dukungan (permintaan langsung pengguna, 7 September
			// 2026) -- balasan dari staf Jeon.id sungguhan (BUKAN bot). FAQ
			// instan ada di frontend (lib/help-faq.ts, konten SAMA dengan
			// halaman Bantuan), TIDAK lewat backend sama sekali (murni
			// lokal, tanpa round-trip). Lihat migrasi 000095 &
			// handlers.SupportChatHandler. TIDAK dipasangi ActAsOwner --
			// kolaborator tidak boleh chat dengan staf Jeon.id atas nama
			// pemilik, sama alasan balance/KYC/settings di atas.
			dashboard.GET("/support-chat/messages", supportChatPollRateLimit, supportChat.ListMine)
			dashboard.POST("/support-chat/messages", supportChatSendRateLimit, supportChat.SendMine)
			dashboard.POST("/support-chat/read", supportChat.MarkMineRead)

			// Modul Settings §5 (Security) -- sama seperti profile di atas,
			// TIDAK dipasangi ActAsOwner (kolaborator tidak boleh mengganti
			// password/2FA/sesi pemilik).
			// Audit OWASP A01/A07 (4 September 2026): ChangePassword &
			// Disable2FA membanding-bcrypt password lama TANPA rate limit
			// atau lockout apa pun (beda dari Login yang punya keduanya) --
			// pemegang JWT curian (localStorage, bukan httpOnly by design)
			// tapi bukan password asli sebelumnya punya oracle brute-force
			// tanpa batas terhadap password sungguhan pengguna.
			// 2fa/verify (konfirmasi AKTIFKAN 2FA) juga sebelumnya tanpa
			// limit, beda dari 2fa/verify-login yang sudah dilindungi
			// authRateLimit.
			dashboard.PATCH("/security/password", authRateLimit, security.ChangePassword)
			// SetPassword -- permintaan langsung pengguna, 12 September 2026:
			// akun Google/Apple OAuth-only "Buat Password" pertama kali (tidak
			// ada password lama utk re-auth, beda dari ChangePassword di atas)
			// -- POST (buat baru) di path YANG SAMA dgn PATCH (ubah yang sudah
			// ada) di atas, method HTTP-nya sendiri yang membedakan.
			dashboard.POST("/security/password", authRateLimit, security.SetPassword)
			dashboard.POST("/security/2fa/enable", security.Enable2FA)
			dashboard.POST("/security/2fa/verify", authRateLimit, security.Verify2FA)
			dashboard.POST("/security/2fa/disable", authRateLimit, security.Disable2FA)
			dashboard.POST("/security/2fa/snooze", security.Snooze2FA)
			dashboard.GET("/security/2fa/status", security.Status2FA)
			dashboard.GET("/security/sessions", security.ListSessions)
			dashboard.DELETE("/security/sessions/:jti", security.RevokeSession)
			// Audit keamanan 15 Agustus 2026: cabut semua sesi lain (semua device
			// lain) dalam satu permintaan -- harus didaftar SEBELUM rute :jti di
			// atas supaya "/sessions/all" tidak cocok pola ":jti" (Gin prioritas
			// rute statis, tapi urutan tetap eksplisit demi kejelasan).
			dashboard.DELETE("/security/sessions/all", security.RevokeAllSessions)
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
			adminGroup.PATCH("/reports/:id/restore", admin.RestoreReport)

			// REQ-F-505: rekonsiliasi disbursement lintas kreator -- admin
			// memproses pengajuan penarikan secara manual (belum ada
			// integrasi Disbursement API sungguhan).
			adminGroup.GET("/payouts", admin.ListPayouts)
			adminGroup.PATCH("/payouts/:id", admin.UpdatePayoutStatus)

			// No.84 (Sprint 10): review pengajuan KYC kreator.
			adminGroup.GET("/kyc", kyc.AdminList)
			adminGroup.GET("/kyc/:userId", kyc.AdminGetDetail)
			adminGroup.PATCH("/kyc/:userId", kyc.AdminReview)
			adminGroup.PATCH("/kyc/:userId/revoke", kyc.AdminRevoke)

			// Moderasi tautan sensitif -- permintaan langsung pengguna, 22
			// Agustus 2026, lihat catatan lengkap di handlers.LinkModerationChecker.
			adminGroup.GET("/moderation/keywords", admin.ListBlockedKeywords)
			adminGroup.POST("/moderation/keywords", admin.CreateBlockedKeyword)
			adminGroup.DELETE("/moderation/keywords/:id", admin.DeleteBlockedKeyword)
			adminGroup.GET("/moderation/domains", admin.ListDomainVerdicts)
			adminGroup.POST("/moderation/domains", admin.UpsertDomainVerdict)
			adminGroup.DELETE("/moderation/domains/:id", admin.DeleteDomainVerdict)

			// Breakdown sumber trafik (utm_source/medium/campaign) --
			// permintaan langsung pengguna, 15 September 2026, lihat catatan
			// lengkap di AdminHandler.ListTrafficSources (admin.go).
			adminGroup.GET("/traffic-sources", admin.ListTrafficSources)
		}

		// Live chat dukungan (permintaan langsung pengguna, 7 September
		// 2026: "berarti butuh role khusus untuk menangani live chat dsb
		// jangan hak akses admin yang full") -- grup TERPISAH dari
		// adminGroup di atas (BUKAN cuma menambah rute ke situ) supaya
		// middleware-nya beda: SupportRequired (role 'admin' ATAU
		// 'support'), bukan AdminRequired (role 'admin' saja). Gin
		// mengizinkan beberapa Group() berbagi prefix path yang sama
		// selama rute yang didaftarkan di masing-masing tidak bentrok.
		// Filter default "needs_reply" (thread yg pesan terakhirnya dari
		// kreator) -- lihat SupportChatHandler & migrasi 000095.
		supportRequired := middleware.SupportRequired(db)
		supportGroup := api.Group("/admin")
		supportGroup.Use(authRequired, supportRequired)
		{
			supportGroup.GET("/support-chat", supportChat.AdminList)
			supportGroup.GET("/support-chat/:userId", supportChat.AdminGetThread)
			supportGroup.POST("/support-chat/:userId/reply", supportChat.AdminReply)
		}

		// Checkout publik -- REQ-F-401, tanpa perlu akun/login.
		api.POST("/checkout", checkoutRateLimit, checkout.Create)
		// Audit OWASP A04 (4 September 2026): status/download sebelumnya
		// tanpa rate limit sama sekali -- dimitigasi sebagian oleh orderID
		// UUID yang tak-tertebak, tapi download SECARA KHUSUS memicu
		// streaming dari S3 (mahal dipukul berulang) per request.
		api.GET("/checkout/:id/status", checkoutStatusRateLimit, checkout.GetStatus)

		// Modul Toko (Fase E1): ulasan pembeli -- publik, sama seperti seluruh
		// alur checkout (pembeli tidak punya akun).
		api.POST("/checkout/:id/review", checkoutRateLimit, review.Submit)

		// No.67: pratinjau diskon voucher sebelum checkout sungguhan --
		// rate limit sama dengan checkout supaya kode tidak bisa di-brute-force.
		api.POST("/checkout/validate-voucher", checkoutRateLimit, checkout.ValidateVoucher)

		// REQ-F-405: tautan unduhan permanen yang diklik dari email
		// notifikasi -- publik (pembeli tidak punya akun), lihat komentar
		// CheckoutHandler.DownloadFile.
		api.GET("/checkout/:id/download", checkoutRateLimit, checkout.DownloadFile)

		// No.70: daftar unduhan multi-file untuk bundel yang sudah lunas --
		// publik, cuma bisa diakses kalau tahu orderID yang valid & lunas.
		api.GET("/checkout/:id/bundle-items", checkout.GetBundleItems)
		api.GET("/checkout/:id/course-chapters", checkout.GetCourseChapters)

		// Riwayat pembelian pembeli (permintaan langsung pengguna, 10
		// September 2026) -- publik, LINTAS kreator (bukan di bawah
		// /pages/:username seperti loyalitas), pembeli tidak punya akun.
		api.POST("/orders/request-code", orderHistoryRateLimit, checkout.RequestOrderHistoryCode)
		api.POST("/orders/verify-code", orderHistoryRateLimit, checkout.VerifyOrderHistoryCode)
		api.GET("/orders/mine", orderHistoryRateLimit, checkout.ListMyOrders)

		// Webhook PSP -- REQ-F-403 (verifikasi signature_key di body DI
		// DALAM handler, sebelum payload diproses) & REQ-F-404 (idempotensi
		// lewat unique constraint psp_transaction_id). webhookRateLimit
		// (lihat catatan lengkap di deklarasinya di atas) ditambahkan lewat
		// audit performa/keamanan profesional 15 September 2026 -- ketiga
		// rute di bawah SEBELUMNYA tanpa rate limit sama sekali.
		api.POST("/webhooks/midtrans", webhookRateLimit, checkout.Webhook)
		// Duitku -- kerangka multi-gateway 13 September 2026, lihat catatan
		// lengkap di CheckoutHandler.DuitkuWebhook & payment/gateway.go.
		// Route ini SELALU terdaftar (bukan hanya kalau provider aktif
		// "duitku") -- mendaftarkannya bersyarat cuma menambah kerumitan
		// tanpa manfaat keamanan (tanpa signature Duitku yang valid,
		// payload ditolak 401 apa pun provider aktifnya).
		api.POST("/webhooks/duitku", webhookRateLimit, checkout.DuitkuWebhook)

		// Modul Langganan Premium: notifikasi siklus penagihan BERULANG --
		// endpoint TERPISAH dari webhook order biasa di atas (Midtrans
		// mengirim ke "Recurring Notification URL", field terpisah dari
		// "Payment Notification URL" di dashboard Midtrans -- WAJIB
		// didaftarkan manual, lihat catatan lingkup di subscription.go).
		api.POST("/webhooks/midtrans-subscription", webhookRateLimit, subscription.HandleCycleWebhook)
	}
}
