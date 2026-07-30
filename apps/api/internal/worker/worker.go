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
	"github.com/jeonme/api/internal/whatsapp"
)

type Handler struct {
	DB           *pgxpool.Pool
	Mailer       *mailer.Client
	WhatsApp     *whatsapp.Client
	PublicAPIURL string
}

func NewHandler(db *pgxpool.Pool, mailerClient *mailer.Client, whatsappClient *whatsapp.Client, publicAPIURL string) *Handler {
	return &Handler{DB: db, Mailer: mailerClient, WhatsApp: whatsappClient, PublicAPIURL: publicAPIURL}
}

// Mux merakit ServeMux asynq -- dipanggil main.go subcommand `worker`.
func (h *Handler) Mux() *asynq.ServeMux {
	mux := asynq.NewServeMux()
	mux.HandleFunc(queue.TypeOrderPaidNotification, h.HandleOrderPaidNotification)
	mux.HandleFunc(queue.TypeContactFormNotification, h.HandleContactFormNotification)
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

	var buyerEmail, buyerContact, productName, status string
	var isDonation bool
	err := h.DB.QueryRow(ctx, `
		SELECT o.buyer_email, o.buyer_contact, p.name, o.status, p.is_donation
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE o.id = $1
	`, payload.OrderID).Scan(&buyerEmail, &buyerContact, &productName, &status, &isDonation)
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

	var subject, body, downloadURL string
	if isDonation {
		// No.71: donasi tidak pernah punya file -- ucapan terima kasih
		// saja, TANPA tautan unduhan (tidak ada yang bisa diunduh).
		subject = fmt.Sprintf("Terima kasih atas dukunganmu: %s", productName)
		body = fmt.Sprintf(
			"Terima kasih sudah memberi dukungan lewat %s di Jeonme!\n\n"+
				"Dukunganmu langsung diteruskan ke kreator. Sampai jumpa lagi!\n\n"+
				"Salam,\nTim Jeonme",
			productName,
		)
	} else {
		downloadURL = fmt.Sprintf("%s/checkout/%s/download", h.PublicAPIURL, payload.OrderID)
		subject = fmt.Sprintf("Pesananmu di Jeonme sudah bisa diunduh: %s", productName)
		body = fmt.Sprintf(
			"Terima kasih sudah membeli %s di Jeonme!\n\n"+
				"Unduh file kamu lewat tautan berikut (bisa dipakai berkali-kali):\n%s\n\n"+
				"Salam,\nTim Jeonme",
			productName, downloadURL,
		)
	}

	if err := h.Mailer.Send(buyerEmail, subject, body); err != nil {
		return fmt.Errorf("worker: gagal kirim notifikasi order %s: %w", payload.OrderID, err)
	}

	log.Printf("worker: notifikasi order %s terkirim ke %s", payload.OrderID, buyerEmail)

	// No.74 (Sprint 8, lanjutan No.47): kanal WhatsApp TAMBAHAN -- best-
	// effort, SENGAJA tidak mempengaruhi keberhasilan task ini sama sekali
	// (email di atas SUDAH berhasil terkirim, itu kanal wajib satu-satunya).
	// Kegagalan di sini (belum dikonfigurasi, nomor tidak valid, Graph API
	// menolak) hanya di-log, TIDAK mengembalikan error -- kalau
	// dikembalikan sebagai error, asynq akan retry SELURUH task termasuk
	// pengiriman email yang sudah sukses, berpotensi mengirim email
	// duplikat ke pembeli hanya karena kanal sekunder gagal.
	//
	// Donasi belum didukung (butuh template Meta terpisah tanpa parameter
	// tautan unduhan -- lihat catatan cakupan di internal/whatsapp/client.go)
	// -- sengaja dilewati dulu, fokus pada kasus pembelian dengan file yang
	// justru paling mendesak (Task No.74).
	//
	// Pengecekan h.WhatsApp.IsConfigured() SENGAJA tidak diulang di sini
	// (cukup buyerContact != "") -- SendOrderConfirmation sudah menangani &
	// MELOG sendiri kondisi belum dikonfigurasi (persis pola mailer.Send),
	// supaya order dengan nomor kontak yang genuinely dilewati karena
	// WhatsApp belum aktif tetap KETAHUAN di log, bukan diam-diam hilang.
	if !isDonation && buyerContact != "" {
		normalized, err := whatsapp.NormalizeIndonesianPhone(buyerContact)
		if err != nil {
			log.Printf("worker: order %s -- nomor kontak %q tidak valid, lewati notifikasi WhatsApp: %v", payload.OrderID, buyerContact, err)
		} else if err := h.WhatsApp.SendOrderConfirmation(ctx, normalized, []string{productName, downloadURL}); err != nil {
			log.Printf("worker: order %s -- gagal kirim notifikasi WhatsApp ke %s: %v", payload.OrderID, normalized, err)
		} else {
			log.Printf("worker: order %s -- notifikasi WhatsApp terkirim ke %s", payload.OrderID, normalized)
		}
	}

	return nil
}

// HandleContactFormNotification -- No.77 (Sprint 9): kirim email ke kreator
// begitu ada pesan baru masuk lewat blok Formulir Kontak di halaman
// publiknya. Tidak ada status untuk dicek ulang (beda dari order.paid) --
// pesan yang sudah dienqueue selalu relevan untuk dikirim.
func (h *Handler) HandleContactFormNotification(_ context.Context, t *asynq.Task) error {
	var payload queue.ContactFormPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("worker: payload tidak valid: %w", err)
	}

	subject := fmt.Sprintf("Pesan baru dari formulir kontak halamanmu (@%s)", payload.PageUsername)
	body := fmt.Sprintf(
		"Ada pesan baru dari pengunjung halamanmu:\n\nNama: %s\nEmail: %s\n\nPesan:\n%s\n\nSalam,\nTim Jeonme",
		payload.VisitorName, payload.VisitorEmail, payload.Message,
	)

	if err := h.Mailer.Send(payload.CreatorEmail, subject, body); err != nil {
		return fmt.Errorf("worker: gagal kirim notifikasi formulir kontak: %w", err)
	}

	log.Printf("worker: notifikasi formulir kontak terkirim ke %s", payload.CreatorEmail)
	return nil
}
