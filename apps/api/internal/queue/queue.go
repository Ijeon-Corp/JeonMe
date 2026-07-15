// Package queue mendefinisikan task asynq (Redis-backed job queue) yang
// dipakai untuk pekerjaan asinkron -- saat ini hanya notifikasi email
// pembeli setelah pembayaran dikonfirmasi (REQ-F-405), yang sengaja TIDAK
// dilakukan sinkron di dalam CheckoutHandler.Webhook supaya lambat/gagalnya
// pengiriman email tidak pernah membuat webhook PSP itu sendiri gagal atau
// timeout.
package queue

import (
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

// TypeOrderPaidNotification -- REQ-F-405: kirim email + link unduhan ke
// pembeli setelah order berstatus "paid".
const TypeOrderPaidNotification = "order:paid_notification"

type OrderPaidPayload struct {
	OrderID string `json:"order_id"`
}

// NewOrderPaidTask membungkus payload jadi *asynq.Task siap di-enqueue.
func NewOrderPaidTask(orderID string) (*asynq.Task, error) {
	payload, err := json.Marshal(OrderPaidPayload{OrderID: orderID})
	if err != nil {
		return nil, fmt.Errorf("queue: gagal encode payload order_id=%s: %w", orderID, err)
	}
	return asynq.NewTask(TypeOrderPaidNotification, payload), nil
}

// RedisOptFromURL menerjemahkan REDIS_URL (format yang sama dipakai
// database.NewRedisClient) ke opsi koneksi asynq -- supaya konfigurasi
// Redis cukup didaftarkan sekali lewat REDIS_URL, tidak perlu format host/
// port/password terpisah khusus untuk asynq.
func RedisOptFromURL(redisURL string) (asynq.RedisClientOpt, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return asynq.RedisClientOpt{}, fmt.Errorf("queue: gagal parse REDIS_URL: %w", err)
	}
	return asynq.RedisClientOpt{Addr: opt.Addr, Password: opt.Password, DB: opt.DB}, nil
}
