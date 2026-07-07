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
func Register(r *gin.Engine, db *pgxpool.Pool, rdb *redis.Client, cfg *config.Config) {
	health := handlers.NewHealthHandler(db, rdb)
	auth := handlers.NewAuthHandler(db, cfg.JWTSecret)
	page := handlers.NewPageHandler(db)
	product := handlers.NewProductHandler(db)

	// Dipakai health check pipeline deploy-production.yml -- lihat CICD-GUIDE.md.
	r.GET("/api/health", health.Check)

	api := r.Group("/api/v1")
	{
		auth_ := api.Group("/auth")
		{
			auth_.POST("/register", auth.Register)
			auth_.POST("/login", auth.Login)
		}

		// Halaman publik -- TIDAK memerlukan auth, ini titik trafik tertinggi.
		api.GET("/pages/:username", page.GetPublicPage)

		// Endpoint dashboard kreator -- dilindungi JWT.
		dashboard := api.Group("/dashboard")
		dashboard.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			dashboard.GET("/products", product.List)
			dashboard.POST("/products", product.Create)

			// TODO: tambahkan endpoint links CRUD (REQ-F-202/203),
			// saldo & penarikan dana (REQ-F-501..504), dan analitik (REQ-F-601..603)
			// sesuai SRS-Jeonme.docx.
		}

		// TODO: endpoint checkout publik (REQ-F-401) dan webhook PSP (REQ-F-403)
		// -- webhook WAJIB memverifikasi signature sebelum diproses (lihat
		// Technical Design Document Bagian 5 & 6).
	}
}
