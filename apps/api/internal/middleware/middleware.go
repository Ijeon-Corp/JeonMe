package middleware

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// CORS mengizinkan origin frontend (Next.js) untuk memanggil API ini.
// Di production, isi allowedOrigins hanya dengan domain resmi (jeon.id),
// jangan pernah pakai wildcard "*" untuk endpoint yang butuh cookie/auth.
func CORS(allowedOrigins string) gin.HandlerFunc {
	origins := strings.Split(allowedOrigins, ",")
	cfg := cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Act-As-Owner"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	return cors.New(cfg)
}

// SecurityHeaders -- perbaikan (audit keamanan 14 Agustus 2026): dulu API
// ini TIDAK mengirim satu pun header keamanan standar (dibuktikan lewat
// `curl -sD -` langsung). API ini murni JSON (bukan render HTML), jadi
// Content-Security-Policy tidak relevan di sini -- yang benar-benar
// berlaku: cegah browser "menebak" tipe konten (nosniff, relevan kalau ada
// endpoint yang me-refleksikan input pengguna apa adanya), cegah respons
// API ditanam di iframe (clickjacking-adjacent), dan HSTS supaya browser
// tidak pernah diam-diam turun ke HTTP polos di kunjungan berikutnya.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		c.Next()
	}
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
// Juga menolak token yang jti-nya ada di denylist Redis (lihat REQ-F-106 /
// AuthHandler.Logout) supaya sesi yang di-revoke benar-benar berhenti berlaku
// sebelum masa berlaku alaminya habis.
func AuthRequired(jwtSecret string, rdb *redis.Client) gin.HandlerFunc {
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

		jti, _ := claims["jti"].(string)
		if jti != "" && rdb != nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
			exists, err := rdb.Exists(ctx, "revoked_jti:"+jti).Result()
			cancel()
			if err == nil && exists > 0 {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "sesi sudah logout"})
				return
			}
		}

		expFloat, _ := claims["exp"].(float64)

		// userID/jti/exp disisipkan ke context supaya handler berikutnya (mis.
		// Logout) bisa memakainya tanpa perlu decode token lagi.
		c.Set("userID", claims["sub"])
		c.Set("jti", jti)
		c.Set("exp", int64(expFloat))
		c.Next()
	}
}

// AdminRequired — REQ-F-701/702/703. Dipasang SETELAH AuthRequired (butuh
// "userID" sudah ada di context). Selalu cek role langsung ke database
// (bukan klaim JWT) supaya demosi/suspend admin langsung berlaku, tidak
// menunggu token lama kedaluwarsa -- endpoint admin bukan jalur trafik
// tinggi, jadi biaya satu query tambahan ini sepadan dengan keamanannya.
func AdminRequired(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("userID")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()

		var role string
		err := db.QueryRow(ctx, `SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL`, userID).Scan(&role)
		if err != nil || role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "akses ditolak, hanya untuk admin"})
			return
		}

		c.Next()
	}
}

// SupportRequired -- permintaan langsung pengguna, 7 September 2026:
// "berarti butuh role khusus untuk menangani live chat dsb jangan hak
// akses admin yang full". Role BARU 'support' (kolom users.role, sama
// VARCHAR(20) TANPA CHECK constraint dgn 'admin'/'creator' -- tidak perlu
// migrasi skema, cuma konvensi nilai baru) -- staf yang HANYA boleh
// menangani Live Chat (dan fitur dukungan sejenis nanti, "dsb"), TIDAK
// boleh menyentuh Pengguna/Laporan/Penarikan/KYC/Moderasi sama sekali.
// 'admin' TETAP boleh mengakses rute yang digerbang ini (superset,
// admin bisa melakukan apa pun yang bisa dilakukan support), makanya
// dicek `role != "admin" && role != "support"` (bukan cuma != "support").
//
// SENGAJA middleware terpisah (bukan menambah "support" ke pengecekan
// AdminRequired di atas) -- rute admin-only (Pengguna/Laporan/Penarikan/
// KYC/Moderasi/Ringkasan) TETAP harus menolak role 'support' mentah-
// mentah, cuma rute yang benar-benar didaftarkan pakai middleware ini
// (lihat routes.go -- grup terpisah dari adminGroup) yang keduanya boleh
// akses. Belum ada cara self-service jadi 'support' -- SAMA seperti
// 'admin', operator mengubah lewat SQL manual (UPDATE users SET
// role='support' WHERE id=...).
func SupportRequired(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("userID")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()

		var role string
		err := db.QueryRow(ctx, `SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL`, userID).Scan(&role)
		if err != nil || (role != "admin" && role != "support") {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "akses ditolak, hanya untuk staf dukungan"})
			return
		}

		c.Next()
	}
}

// ActAsOwner — No.87 (Sprint 10): dipasang SETELAH AuthRequired HANYA pada
// grup rute yang boleh diakses kolaborator (tautan/produk/desain -- lihat
// routes.go), TIDAK PERNAH pada saldo/penarikan/KYC/hapus akun/domain
// kustom/admin. Kalau header X-Act-As-Owner ada DAN pengguna yang login
// adalah kolaborator AKTIF dengan flag izin `permissionColumn`=true untuk
// pemilik tersebut, "userID" di context DIGANTI ke ID pemilik supaya
// handler di baliknya (yang semua sudah memakai c.GetString("userID") apa
// adanya) otomatis beroperasi atas nama pemilik TANPA perlu diubah satu per
// satu. Kalau header kosong, middleware ini tidak melakukan apa-apa (jalur
// normal: bertindak sebagai diri sendiri).
func ActAsOwner(db *pgxpool.Pool, permissionColumn string) gin.HandlerFunc {
	return func(c *gin.Context) {
		ownerID := c.GetHeader("X-Act-As-Owner")
		if ownerID == "" {
			c.Next()
			return
		}

		requesterID := c.GetString("userID")
		if ownerID == requesterID {
			c.Next()
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()

		var allowed bool
		query := `SELECT ` + permissionColumn + ` FROM collaborators WHERE owner_user_id = $1 AND collaborator_user_id = $2 AND status = 'active'`
		if err := db.QueryRow(ctx, query, ownerID, requesterID).Scan(&allowed); err != nil || !allowed {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "kamu tidak punya akses ke ruang kerja ini"})
			return
		}

		// actorUserID & actingAsOwner -- DITAMBAHKAN 24 September 2026 (audit
		// menyeluruh). Sampai sebelum ini, begitu "userID" ditimpa jadi
		// ownerID identitas pemanggil ASLI hilang total dari context, jadi
		// handler di balik middleware ini MUSTAHIL membedakan "pemilik
		// sendiri" dari "kolaborator yang sedang menyamar". Itu melahirkan
		// celah nyata: validateCollaboratorSplits menolak split ke
		// `ownerUserID`, yang di bawah impersonasi justru sudah bernilai ID
		// PEMILIK -- sehingga kolaborator bisa lolos menyetel split 100% ke
		// akunnya sendiri lalu mencairkannya lewat rute payout (yang memang
		// tidak ber-ActAsOwner, jadi dia mencairkan sebagai dirinya sendiri).
		// Dua nilai ini yang memungkinkan handler menegakkan batas "kolaborator
		// tidak pernah mengarahkan uang" yang sudah jadi kontrak di
		// CollaboratorHandler.
		c.Set("actorUserID", requesterID)
		c.Set("actingAsOwner", true)
		c.Set("userID", ownerID)
		c.Next()
	}
}

// RateLimit — NF-05. Fixed-window counter di Redis, dikunci per IP client +
// prefix (supaya endpoint berbeda punya kuota terpisah, mis. login vs
// checkout). Kalau Redis sedang bermasalah, request DIBIARKAN LEWAT (fail-
// open) -- rate limit adalah pertahanan tambahan, bukan satu-satunya lapisan,
// jadi Redis down tidak boleh membuat seluruh API ikut down.
func RateLimit(rdb *redis.Client, keyPrefix string, limit int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rdb == nil {
			c.Next()
			return
		}

		key := "ratelimit:" + keyPrefix + ":" + c.ClientIP()

		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		count, err := rdb.Incr(ctx, key).Result()
		if err == nil && count == 1 {
			rdb.Expire(ctx, key, window)
		}
		cancel()

		if err != nil {
			c.Next()
			return
		}

		if count > int64(limit) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "terlalu banyak permintaan, coba lagi nanti"})
			return
		}

		c.Next()
	}
}
