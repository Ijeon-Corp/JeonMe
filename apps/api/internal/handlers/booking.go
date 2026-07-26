package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// BookingHandler mengimplementasikan No.92 (Sprint 11): booking konsultasi
// berbayar. Booking adalah baris `products` biasa (is_booking=true,
// file_key selalu kosong -- yang dijual adalah slot waktu, bukan file),
// toggle aktif/nonaktif & hapus memakai ProductHandler.Update/Delete yang
// sudah ada, sama seperti pola BundleHandler/EventHandler/CourseHandler.
//
// CATATAN LINGKUP (per keputusan eksplisit pengguna, 25 Juli 2026): SENGAJA
// TIDAK terhubung ke Google Calendar API sama sekali -- itu butuh proyek
// Google Cloud + OAuth client TERPISAH dari login yang kredensialnya belum
// ada (situasinya sama seperti blocker WhatsApp Business API, No.74/75).
// Pencegahan bentrok jadwal ("cegah bentrok jadwal" dari catatan riset)
// tetap SUNGGUHAN, hanya dijamin oleh database Jeonme sendiri (klaim slot
// atomik lewat UPDATE ... WHERE order_id IS NULL, lihat CheckoutHandler.
// Create), BUKAN oleh sinkronisasi ke kalender pribadi kreator. Kreator
// menambah slot yang tersedia SATU PER SATU secara manual (bukan generator
// jadwal berulang mingguan) -- disederhanakan dari fitur penuh Booking
// Linktree/Appointment Lynk.id sesuai keterbatasan waktu.
type BookingHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
}

func NewBookingHandler(db *pgxpool.Pool, rdb *redis.Client) *BookingHandler {
	return &BookingHandler{DB: db, RDB: rdb}
}

type createBookingRequest struct {
	Name            string `json:"name" binding:"required,max=200"`
	Description     string `json:"description"`
	PriceIDR        int64  `json:"price_idr" binding:"required,min=1000"`
	DurationMinutes int    `json:"duration_minutes" binding:"required,min=5,max=480"`
}

func (h *BookingHandler) Create(c *gin.Context) {
	var req createBookingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	bookingID := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO products (id, user_id, name, description, price_idr, is_active, is_booking, booking_duration_minutes)
		VALUES ($1, $2, $3, $4, $5, false, true, $6)
	`, bookingID, userID, req.Name, req.Description, req.PriceIDR, req.DurationMinutes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat booking"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": bookingID, "message": "booking dibuat, tambahkan slot waktu lalu aktifkan supaya bisa dipesan"})
}

type bookingListItem struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	PriceIDR           int64  `json:"price_idr"`
	IsActive           bool   `json:"is_active"`
	DurationMinutes    int    `json:"duration_minutes"`
	AvailableSlotCount int    `json:"available_slot_count"`
	BookedSlotCount    int    `json:"booked_slot_count"`
}

func (h *BookingHandler) List(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, p.description, p.price_idr, p.is_active, p.booking_duration_minutes,
			(SELECT COUNT(*) FROM booking_slots bs WHERE bs.booking_product_id = p.id AND bs.order_id IS NULL AND bs.starts_at > now()),
			(SELECT COUNT(*) FROM booking_slots bs WHERE bs.booking_product_id = p.id AND bs.order_id IS NOT NULL)
		FROM products p WHERE p.user_id = $1 AND p.is_booking = true
		ORDER BY p.name
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat booking"})
		return
	}
	defer rows.Close()

	items := []bookingListItem{}
	for rows.Next() {
		var it bookingListItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Description, &it.PriceIDR, &it.IsActive, &it.DurationMinutes,
			&it.AvailableSlotCount, &it.BookedSlotCount); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type createSlotsRequest struct {
	StartTimes []string `json:"start_times" binding:"required,min=1"`
}

// CreateSlots — REQ waktu berakhir dihitung otomatis dari durasi booking
// (booking_duration_minutes), kreator cukup memasukkan waktu MULAI tiap
// slot. Slot yang waktunya sudah lewat ditolak -- tidak ada gunanya
// membuka slot di masa lalu.
func (h *BookingHandler) CreateSlots(c *gin.Context) {
	bookingID := c.Param("id")
	userID := c.GetString("userID")

	var req createSlotsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var durationMinutes int
	if err := h.DB.QueryRow(ctx, `
		SELECT booking_duration_minutes FROM products WHERE id = $1 AND user_id = $2 AND is_booking = true
	`, bookingID, userID).Scan(&durationMinutes); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "booking tidak ditemukan"})
		return
	}

	type parsedSlot struct {
		starts time.Time
		ends   time.Time
	}
	parsed := make([]parsedSlot, 0, len(req.StartTimes))
	for _, raw := range req.StartTimes {
		starts, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format waktu slot tidak valid (pakai RFC3339): " + raw})
			return
		}
		if starts.Before(time.Now()) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tidak bisa menambah slot di waktu yang sudah lewat"})
			return
		}
		parsed = append(parsed, parsedSlot{starts: starts, ends: starts.Add(time.Duration(durationMinutes) * time.Minute)})
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	created := 0
	for _, s := range parsed {
		tag, err := tx.Exec(ctx, `
			INSERT INTO booking_slots (id, booking_product_id, starts_at, ends_at)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (booking_product_id, starts_at) DO NOTHING
		`, uuid.NewString(), bookingID, s.starts, s.ends)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan slot"})
			return
		}
		created += int(tag.RowsAffected())
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan slot"})
		return
	}

	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusOK, gin.H{"message": "slot ditambahkan", "created_count": created})
}

type slotItem struct {
	ID         string    `json:"id"`
	StartsAt   time.Time `json:"starts_at"`
	EndsAt     time.Time `json:"ends_at"`
	IsBooked   bool      `json:"is_booked"`
	BuyerEmail string    `json:"buyer_email,omitempty"`
}

// ListSlots — dashboard (pemilik) melihat SELURUH slot (tersedia & sudah
// dipesan, dengan email pemesan) untuk booking miliknya.
func (h *BookingHandler) ListSlots(c *gin.Context) {
	bookingID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var exists int
	if err := h.DB.QueryRow(ctx, `SELECT 1 FROM products WHERE id = $1 AND user_id = $2 AND is_booking = true`, bookingID, userID).Scan(&exists); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "booking tidak ditemukan"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT bs.id, bs.starts_at, bs.ends_at, bs.order_id IS NOT NULL, COALESCE(o.buyer_email, '')
		FROM booking_slots bs LEFT JOIN orders o ON o.id = bs.order_id
		WHERE bs.booking_product_id = $1
		ORDER BY bs.starts_at ASC
	`, bookingID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat slot"})
		return
	}
	defer rows.Close()

	items := []slotItem{}
	for rows.Next() {
		var it slotItem
		if err := rows.Scan(&it.ID, &it.StartsAt, &it.EndsAt, &it.IsBooked, &it.BuyerEmail); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

// DeleteSlot — hanya bisa menghapus slot yang BELUM dipesan -- slot yang
// sudah ada pemesannya tidak boleh dihapus begitu saja (pembeli sudah
// membayar untuk waktu itu).
func (h *BookingHandler) DeleteSlot(c *gin.Context) {
	bookingID := c.Param("id")
	slotID := c.Param("slotId")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var exists int
	if err := h.DB.QueryRow(ctx, `SELECT 1 FROM products WHERE id = $1 AND user_id = $2 AND is_booking = true`, bookingID, userID).Scan(&exists); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "booking tidak ditemukan"})
		return
	}

	tag, err := h.DB.Exec(ctx, `
		DELETE FROM booking_slots WHERE id = $1 AND booking_product_id = $2 AND order_id IS NULL
	`, slotID, bookingID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus slot"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "slot tidak ditemukan atau sudah dipesan"})
		return
	}

	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusOK, gin.H{"message": "slot dihapus"})
}

type publicSlotItem struct {
	ID       string    `json:"id"`
	StartsAt time.Time `json:"starts_at"`
	EndsAt   time.Time `json:"ends_at"`
}

// ListAvailableSlots — REQ publik: hanya slot yang BELUM dipesan DAN
// waktunya belum lewat -- dipanggil dari halaman publik saat pengunjung
// membuka blok booking untuk memilih jadwal sebelum checkout.
func (h *BookingHandler) ListAvailableSlots(c *gin.Context) {
	bookingID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var isActive, isBooking bool
	if err := h.DB.QueryRow(ctx, `SELECT is_active, is_booking FROM products WHERE id = $1`, bookingID).Scan(&isActive, &isBooking); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "booking tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat booking"})
		return
	}
	if !isActive || !isBooking {
		c.JSON(http.StatusNotFound, gin.H{"error": "booking tidak ditemukan atau belum aktif"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT id, starts_at, ends_at FROM booking_slots
		WHERE booking_product_id = $1 AND order_id IS NULL AND starts_at > now()
		ORDER BY starts_at ASC
	`, bookingID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat slot"})
		return
	}
	defer rows.Close()

	items := []publicSlotItem{}
	for rows.Next() {
		var it publicSlotItem
		if err := rows.Scan(&it.ID, &it.StartsAt, &it.EndsAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}
