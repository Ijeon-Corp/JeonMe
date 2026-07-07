package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// NewPostgresPool membuat connection pool ke PostgreSQL.
// Menggunakan pgxpool (bukan database/sql biasa) karena performanya
// lebih baik untuk beban baca/tulis tinggi seperti endpoint checkout.
func NewPostgresPool(databaseURL string) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	poolCfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("gagal parse DATABASE_URL: %w", err)
	}

	poolCfg.MaxConns = 20
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
