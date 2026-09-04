package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// NewPostgresPool membuat connection pool ke PostgreSQL dengan ukuran pool
// default (dipakai test suite -- skenario test selalu concurrency rendah,
// tidak butuh tuning). Untuk proses produksi (api/worker), pakai
// NewPostgresPoolWithMaxConns supaya ukuran pool bisa dibedakan per proses.
func NewPostgresPool(databaseURL string) (*pgxpool.Pool, error) {
	return NewPostgresPoolWithMaxConns(databaseURL, 20)
}

// NewPostgresPoolWithMaxConns sama seperti NewPostgresPool tapi maxConns
// bisa diatur pemanggil.
//
// Load test produksi 4 September 2026 (ramp concurrency sampai jeon.id
// benar-benar timeout massal di atas ~2000 koneksi bersamaan) menemukan
// MaxConns=20 di SEMUA proses -- termasuk `api` yang melayani trafik HTTP
// langsung -- terlalu kecil: throughput mentok datar di ~420 req/s dari
// concurrency 250 s/d 2000 (tanda pool sudah jadi bottleneck, bukan CPU/DB
// itu sendiri), lalu berbalik turun (congestive collapse) di atas 4000.
// Postgres default max_connections=100 (image postgres:16-alpine tanpa
// override) dipakai BERSAMA oleh proses `api` dan `worker` (masing-masing
// pool terpisah) -- `api` dapat porsi lebih besar karena melayani
// concurrency user langsung, `worker` cukup kecil karena throughput-nya
// dibatasi sendiri oleh concurrency asynq, bukan oleh jumlah pengguna aktif.
// Menggunakan pgxpool (bukan database/sql biasa) karena performanya
// lebih baik untuk beban baca/tulis tinggi seperti endpoint checkout.
func NewPostgresPoolWithMaxConns(databaseURL string, maxConns int32) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	poolCfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("gagal parse DATABASE_URL: %w", err)
	}

	poolCfg.MaxConns = maxConns
	poolCfg.MinConns = 2

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("gagal membuat pool koneksi database: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("gagal ping database: %w", err)
	}

	return pool, nil
}

// NewRedisClient membuat client Redis untuk cache halaman publik dan job queue ringan.
func NewRedisClient(redisURL string) (*redis.Client, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("gagal parse REDIS_URL: %w", err)
	}

	client := redis.NewClient(opt)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("gagal ping redis: %w", err)
	}

	return client, nil
}
