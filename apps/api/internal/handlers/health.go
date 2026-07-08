package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// HealthHandler dipakai oleh workflow deploy-production.yml untuk
// memverifikasi deploy benar-benar berhasil, bukan sekadar "container jalan".
type HealthHandler struct {
	DB      *pgxpool.Pool
	Redis   *redis.Client
	Version string
}

func NewHealthHandler(db *pgxpool.Pool, rdb *redis.Client, version string) *HealthHandler {
	return &HealthHandler{DB: db, Redis: rdb, Version: version}
}

// Check menguji koneksi DB dan Redis secara aktif -- bukan cuma "server nyala".
// Version disertakan supaya pipeline deploy bisa memverifikasi commit yang
// SUNGGUHAN jalan cocok dengan yang baru saja di-deploy, bukan cuma "server
// merespons ok" (yang tetap true walau container lama masih jalan karena
// step deploy gagal diam-diam di tengah jalan).
func (h *HealthHandler) Check(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	status := gin.H{"status": "ok", "version": h.Version, "checks": gin.H{}}
	checks := status["checks"].(gin.H)
	httpStatus := http.StatusOK

	if err := h.DB.Ping(ctx); err != nil {
		checks["database"] = "down"
		status["status"] = "degraded"
		httpStatus = http.StatusServiceUnavailable
	} else {
		checks["database"] = "up"
	}

	if err := h.Redis.Ping(ctx).Err(); err != nil {
		checks["redis"] = "down"
		status["status"] = "degraded"
		httpStatus = http.StatusServiceUnavailable
	} else {
		checks["redis"] = "up"
	}

	c.JSON(httpStatus, status)
}
