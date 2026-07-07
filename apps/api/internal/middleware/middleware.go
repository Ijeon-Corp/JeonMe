package middleware

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// CORS mengizinkan origin frontend (Next.js) untuk memanggil API ini.
// Di production, isi allowedOrigins hanya dengan domain resmi (jeonme.com),
// jangan pernah pakai wildcard "*" untuk endpoint yang butuh cookie/auth.
func CORS(allowedOrigins string) gin.HandlerFunc {
	origins := strings.Split(allowedOrigins, ",")
	cfg := cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	return cors.New(cfg)
}

// RequestLogger mencatat setiap request masuk -- dasar untuk observability
// sebelum kita pasang APM yang lebih lengkap.
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Printf("%s %s %d %s", c.Request.Method, c.Request.URL.Path, c.Writer.Status(), time.Since(start))
	}
}

// AuthRequired memvalidasi JWT di header Authorization: Bearer <token>.
// Dipakai untuk melindungi endpoint dashboard kreator (bukan halaman publik).
func AuthRequired(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token tidak ditemukan"})
			return
		}

		tokenString := strings.TrimPrefix(header, "Bearer ")
		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token tidak valid atau kedaluwarsa"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "klaim token tidak valid"})
			return
		}

		// userID disisipkan ke context supaya handler berikutnya bisa memakainya
		// tanpa perlu decode token lagi.
		c.Set("userID", claims["sub"])
		c.Next()
	}
}
