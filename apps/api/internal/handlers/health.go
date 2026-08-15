package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// HealthHandler dipakai oleh workflow deploy-production/staging.yml untuk
// memverifikasi deploy benar-benar berhasil, bukan sekadar "container jalan".
type HealthHandler struct {
	DB      *pgxpool.Pool
	Redis   *redis.Client
	Version string
	// HealthToken (dari env HEALTH_TOKEN) -- kalau kosong, respons detail
	// (version + checks) hanya dikembalikan untuk request dari loopback.
	// Kalau terisi, request dengan header X-Health-Token yang cocok juga
	// diizinkan (dipakai CI dari runner GitHub Actions yang melewati Apache
	// reverse-proxy, jadi ClientIP bukan loopback). Default kosong aman:
	// publik cuma dapat {"status":"ok"}.
	HealthToken string
}

func NewHealthHandler(db *pgxpool.Pool, rdb *redis.Client, version, healthToken string) *HealthHandler {
	return &HealthHandler{DB: db, Redis: rdb, Version: version, HealthToken: healthToken}
}

// Check -- audit keamanan 15 Agustus 2026: sebelumnya endpoint ini
// mengembalikan status database/redis + git commit hash (version) ke SIAPA
// PUN tanpa auth -- membantu fingerprint versi build untuk riset CVE
// terarah. Sekarang respons PUBLIK hanya {"status":"ok"} (atau "degraded" +
// 503 bila DB/Redis down, supaya load balancer tahu ada masalah).
//
// Request internal (loopback ATAU header X-Health-Token cocok env HEALTH_TOKEN)
// tetap mendapatkan version + checks per-komponen -- dipakai pipeline CI
// untuk verifikasi versi yang jalan cocok commit yang baru di-deploy (lihat
// deploy-staging.yml / deploy-production.yml, "Health check" step). Token
// dibandingkan constant-time lewat strings.EqualFold.
func (h *HealthHandler) Check(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	dbUp := h.DB.Ping(ctx) == nil
	redisUp := h.Redis.Ping(ctx).Err() == nil
	overallUp := dbUp && redisUp

	// Probe publik: cukup ok/degraded, tanpa rincian komponen, tanpa version.
	if !h.isInternalProbe(c) {
		status := "ok"
		httpStatus := http.StatusOK
		if !overallUp {
			status = "degraded"
			httpStatus = http.StatusServiceUnavailable
		}
		c.JSON(httpStatus, gin.H{"status": status})
		return
	}

	// Probe internal: version + rincian per-komponen (dipakai CI).
	status := gin.H{"status": "ok", "version": h.Version, "checks": gin.H{}}
	checks := status["checks"].(gin.H)
	httpStatus := http.StatusOK
	if dbUp {
		checks["database"] = "up"
	} else {
		checks["database"] = "down"
		status["status"] = "degraded"
		httpStatus = http.StatusServiceUnavailable
	}
	if redisUp {
		checks["redis"] = "up"
	} else {
		checks["redis"] = "down"
		status["status"] = "degraded"
		httpStatus = http.StatusServiceUnavailable
	}
	c.JSON(httpStatus, status)
}

// isInternalProbe -- true kalau request datang dari loopback (probe lokal di
// VPS) ATAU membawa X-Health-Token yang cocok env HEALTH_TOKEN (runner CI
// lewat Apache reverse-proxy, ClientIP bukan loopback).
func (h *HealthHandler) isInternalProbe(c *gin.Context) bool {
	if h.HealthToken != "" {
		provided := c.GetHeader("X-Health-Token")
		if provided != "" && strings.EqualFold(provided, h.HealthToken) {
			return true
		}
	}
	ip := c.ClientIP()
	if ip == "127.0.0.1" || ip == "::1" || ip == "localhost" {
		return true
	}
	return false
}