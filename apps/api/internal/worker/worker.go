// Package worker mengimplementasikan handler task asynq yang dijalankan
// oleh subcommand `./api worker` (proses terpisah dari server HTTP utama --
// lihat main.go). Task saat ini hanya notifikasi order.paid (REQ-F-405).
package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/mailer"
	"github.com/jeonme/api/internal/queue"
)

type Handler struct {
	DB           *pgxpool.Pool
	Mailer       *mailer.Client
	PublicAPIURL string
}

func NewHandler(db *pgxpool.Pool, mailerClient *mailer.Client, publicAPIURL string) *Handler {
	return &Handler{DB: db, Mailer: mailerClient, PublicAPIURL: publicAPIURL}
}

// Mux merakit ServeMux asynq -- dipanggil main.go subcommand `worker`.
func (h *Handler) Mux() *asynq.ServeMux {
	mux := asynq.NewServeMux()
	mux.HandleFunc(queue.TypeOrderPaidNotification, h.HandleOrderPaidNotification)
	return mux
}

// HandleOrderPaidNotification -- REQ-F-405: kirim email notifikasi + link
// unduhan ke pembeli setelah pembayaran dikonfirmasi. Link unduhan mengarah
// ke endpoint API kita sendiri (bukan presigned URL S3 langsung) supaya
// tautan di email TETAP VALID kapan pun dibuka -- endpoint itu yang
// membuatkan presigned URL baru (berumur pendek) setiap kali diklik, lihat
// CheckoutHandler.DownloadFile.
func (h *Handler) HandleOrderPaidNotification(ctx context.Context, t *asynq.Task) error {
	var payload queue.OrderPaidPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("worker: payload tidak valid: %w", err)
	}

	var buyerEmail, productName, status string
	err := h.DB.QueryRow(ctx, `
		SELECT o.buyer_email, p.name, o.status
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, payload.OrderID).Scan(&buyerEmail, &productName, &status)
	if err != nil {
		if err == pgx.ErrNoRows {
			log.Printf("worker: order %s tidak ditemukan, lewati notifikasi", payload.OrderID)
			return nil
		}
		return fmt.Errorf("worker: gagal memuat order %s: %w", payload.OrderID, err)
	}

	if status != "paid" {
		// Race jarang (mis. refund langsung setelah lunas) -- kondisi
		// terbaru bukan "paid" lagi, tidak perlu retry.
		log.Printf("worker: order %s statusnya sekarang %q (bukan paid), lewati notifikasi", payload.OrderID, status)
		return nil
	}

	downloadURL := fmt.Sprintf("%s/checkout/%s/download", h.PublicAPIURL, payload.OrderID)
	subject := fmt.Sprintf("Pesananmu di Jeonme sudah bisa diunduh: %s", productName)
	body := fmt.Sprintf(
		"Terima kasih sudah membeli %s di Jeonme!\n\n"+
			"Unduh file kamu lewat tautan berikut (bisa dipakai berkali-kali):\n%s\n\n"+
			"Salam,\nTim Jeonme",
		productName, downloadURL,
	)

	if err := h.Mailer.Send(buyerEmail, subject, body); err != nil {
		return fmt.Errorf("worker: gagal kirim notifikasi order %s: %w", payload.OrderID, err)
	}

	log.Printf("worker: notifikasi order %s terkirim ke %s", payload.OrderID, buyerEmail)
	return nil
}
