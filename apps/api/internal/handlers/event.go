package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EventHandler mengimplementasikan No.90 (Sprint 11): blok event -- tiket
// berbayar dengan tanggal/waktu/zona waktu/kuota peserta, dijual seperti
// produk biasa lewat mesin checkout yang sudah ada (REQ-F-401..405 tidak
// berubah sama sekali). Event adalah baris `products` biasa (is_event=true,
// file_key selalu kosong -- yang dijual adalah tiket/kehadiran, bukan file)
// -- toggle aktif/nonaktif & hapus memakai ProductHandler.Update/Delete
// yang sudah ada, sama seperti pola BundleHandler/DonationHandler.
type EventHandler struct {
	DB *pgxpool.Pool
}

func NewEventHandler(db *pgxpool.Pool) *EventHandler {
	return &EventHandler{DB: db}
}

type createEventRequest struct {
	Name        string `json:"name" binding:"required,max=200"`
	Description string `json:"description"`
	PriceIDR    int64  `json:"price_idr" binding:"required,min=1000"`
	StartsAt    string `json:"starts_at" binding:"required"`
	EndsAt      string `json:"ends_at" binding:"required"`
	Timezone    string `json:"timezone" binding:"required"`
	Location    string `json:"location"`
	IsOnline    bool   `json:"is_online"`
	Capacity    *int   `json:"capacity" binding:"omitempty,min=1"`
}

// Create — REQ waktu event WAJIB masuk akal (berakhir setelah mulai) dan
// zona waktu harus nama IANA valid (divalidasi lewat time.LoadLocation,
// BUKAN daftar putih manual, supaya otomatis mendukung seluruh zona waktu
// yang dikenal Go tanpa perlu di-maintain).
func (h *EventHandler) Create(c *gin.Context) {
	var req createEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if _, err := time.LoadLocation(req.Timezone); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "zona waktu tidak dikenal (gunakan nama IANA, mis. Asia/Jakarta)"})
		return
	}

	starts, err := time.Parse(time.RFC3339, req.StartsAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "format starts_at tidak valid (pakai RFC3339)"})
		return
	}
	ends, err := time.Parse(time.RFC3339, req.EndsAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "format ends_at tidak valid (pakai RFC3339)"})
		return
	}
	if !ends.After(starts) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "waktu berakhir event harus setelah waktu mulai"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	eventID := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO products (
			id, user_id, name, description, price_idr, is_active, is_event,
			event_starts_at, event_ends_at, event_timezone, event_location, event_is_online, event_capacity
		) VALUES ($1, $2, $3, $4, $5, false, true, $6, $7, $8, $9, $10, $11)
	`, eventID, userID, req.Name, req.Description, req.PriceIDR, starts, ends, req.Timezone, req.Location, req.IsOnline, req.Capacity); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat event"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": eventID, "message": "event dibuat, aktifkan dari daftar event supaya bisa dibeli"})
}

type eventListItem struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	PriceIDR      int64     `json:"price_idr"`
	IsActive      bool      `json:"is_active"`
	StartsAt      time.Time `json:"starts_at"`
	EndsAt        time.Time `json:"ends_at"`
	Timezone      string    `json:"timezone"`
	Location      string    `json:"location"`
	IsOnline      bool      `json:"is_online"`
	Capacity      *int      `json:"capacity"`
	AttendeeCount int64     `json:"attendee_count"`
}

// List — REQ jumlah peserta dihitung dari SELURUH order produk ini
// (status apa pun), BUKAN cuma yang lunas -- pola sama persis dengan
// vouchers.used_count (No.67): slot dianggap terpakai sejak checkout
// DIBUAT (bukan setelah pembayaran benar-benar sukses) supaya dua pembeli
// tidak bisa berebut slot terakhir yang sama selagi salah satunya masih
// menunggu pembayaran. Konsekuensinya sedikit konservatif (checkout yang
// gagal/kedaluwarsa tetap "memakan" kuota selamanya), tapi konsisten
// dengan batasan yang sudah diterima untuk voucher.
func (h *EventHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, p.description, p.price_idr, p.is_active,
			p.event_starts_at, p.event_ends_at, p.event_timezone, p.event_location, p.event_is_online, p.event_capacity,
			(SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id)
		FROM products p WHERE p.user_id = $1 AND p.is_event = true
		ORDER BY p.event_starts_at ASC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat event"})
		return
	}
	defer rows.Close()

	items := []eventListItem{}
	for rows.Next() {
		var it eventListItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Description, &it.PriceIDR, &it.IsActive,
			&it.StartsAt, &it.EndsAt, &it.Timezone, &it.Location, &it.IsOnline, &it.Capacity, &it.AttendeeCount); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}
