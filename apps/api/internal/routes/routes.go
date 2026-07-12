package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/config"
	"github.com/jeonme/api/internal/handlers"
	"github.com/jeonme/api/internal/middleware"
)

// Register mendaftarkan seluruh route API. Struktur mengikuti pemisahan
// modul pada Technical Design Document (auth, page, product, dst.)
// sehingga tiap modul mudah diekstraksi jadi service terpisah nanti.
func Register(r *gin.Engine, db *pgxpool.Pool, rdb *redis.Client, cfg *config.Config, version string) {
	health := handlers.NewHealthHandler(db, rdb, version)
	auth := handlers.NewAuthHandler(db, rdb, cfg.JWTSecret, cfg.AppEnv)
	page := handlers.NewPageHandler(db, rdb)
	product := handlers.NewProductHandler(db)
	links := handlers.NewLinksHandler(db)

	// Dipakai health check pipeline deploy-production.yml -- lihat CICD-GUIDE.md.
	r.GET("/api/health", health.Check)

	api := r.Group("/api/v1")
	{
		authRequired := middleware.AuthRequired(cfg.JWTSecret, rdb)

		auth_ := api.Group("/auth")
		{
			auth_.POST("/register", auth.Register)
			auth_.POST("/login", auth.Login)
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

			// TODO: saldo & penarikan dana (REQ-F-501..504), dan analitik
			// (REQ-F-601..603) -- Sprint 4 & 5 di Rencana-Sprint-Jeonme.xlsx.
		}

		// TODO: endpoint checkout publik (REQ-F-401) dan webhook PSP (REQ-F-403)
		// -- webhook WAJIB memverifikasi signature sebelum diproses (lihat
		// Technical Design Document Bagian 5 & 6).
	}
}
