package handlers

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// Modul Settings §5: daftar sesi/device aktif dibangun DI ATAS mekanisme
// denylist jti yang sudah ada di AuthHandler (revoked_jti:<jti>), BUKAN
// tabel Postgres terpisah -- satu sesi = satu key Redis dengan TTL = sisa
// umur token JWT-nya, jadi otomatis bersih sendiri begitu token kedaluwarsa
// tanpa perlu job pembersihan berkala.
type sessionRecord struct {
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	UserAgent string    `json:"user_agent"`
	IP        string    `json:"ip"`
}

func sessionKey(userID, jti string) string {
	return "session:" + userID + ":" + jti
}

// recordSession dipanggil tiap kali JWT sungguhan diterbitkan (Login biasa
// MAUPUN AuthHandler.VerifyLogin2FA). Fail-silent SENGAJA -- gagal mencatat
// sesi tidak boleh menggagalkan login itu sendiri, sama seperti pola RDB
// opsional lain di handler ini.
func recordSession(ctx context.Context, rdb *redis.Client, userID, jti string, exp time.Time, userAgent, ip string) {
	if rdb == nil || jti == "" {
		return
	}
	ttl := time.Until(exp)
	if ttl <= 0 {
		return
	}
	data, err := json.Marshal(sessionRecord{CreatedAt: time.Now(), ExpiresAt: exp, UserAgent: userAgent, IP: ip})
	if err != nil {
		return
	}
	_ = rdb.Set(ctx, sessionKey(userID, jti), data, ttl).Err()
}

// forgetSession menghapus catatan sesi (dipanggil dari Logout, & dari
// SecurityHandler.RevokeSession sesudah menaruh jti ke denylist).
func forgetSession(ctx context.Context, rdb *redis.Client, userID, jti string) {
	if rdb == nil || jti == "" {
		return
	}
	_ = rdb.Del(ctx, sessionKey(userID, jti)).Err()
}
