package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"github.com/jeonme/api/internal/audit"
	"github.com/jeonme/api/internal/storage"
)

// accountDeletionGracePeriod -- Modul Settings §6, angka eksplisit dari spec
// (14 hari), bukan placeholder seperti payout.MinIDR/minPayoutIDR di tempat lain.
const accountDeletionGracePeriod = 14 * 24 * time.Hour

// AccountHandler mengimplementasikan Modul Settings §6 (Danger Zone).
// Perbaikan kunci dari kelemahan Lynk.id (dilaporkan bisa hapus akun dalam
// hitungan detik tanpa masa tunggu): permintaan hapus TIDAK LANGSUNG
// menganonimkan data -- masuk masa tunggu 14 hari (account_deletion_requests,
// lihat migrasi 000040), bisa dibatalkan kapan pun, baru benar-benar
// dianonimkan oleh worker terjadwal (worker.HandleAccountPurgeScan) setelah
// window itu habis. Anonimisasi INSTAN lewat jalur self-service SENGAJA
// TIDAK ADA lagi -- satu-satunya pengecualian ("compliance request eksplisit
// dari user via support", per spec) ditangani manual lewat support/DB
// langsung, di luar sistem ini (tidak butuh endpoint self-service terpisah).
type AccountHandler struct {
	DB      *pgxpool.Pool
	RDB     *redis.Client
	Storage *storage.Client
}

func NewAccountHandler(db *pgxpool.Pool, rdb *redis.Client, s3 *storage.Client) *AccountHandler {
	return &AccountHandler{DB: db, RDB: rdb, Storage: s3}
}

type deactivateAccountRequest struct {
	Password string `json:"password" binding:"required"`
}

// Deactivate — reversible KAPAN SAJA, TANPA masa tunggu (beda dari hapus
// akun di bawah). Halaman publik langsung tidak tampil (lihat gate di
// PageHandler.GetPublicPage/GetPublicPageBySlug), tapi semua data &
// preferensi (tema, produk, dst) tetap utuh -- Reactivate mengembalikannya
// persis seperti semula. Cukup re-auth password (bukan ketik username juga)
// -- friksi sebanding risikonya, beda dari hapus akun yang jauh lebih sulit
// dibalik (14 hari) dan karena itu butuh konfirmasi lebih berlapis.
func (h *AccountHandler) Deactivate(c *gin.Context) {
	userID := c.GetString("userID")

	var req deactivateAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var currentHash string
	if err := h.DB.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&currentHash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "password salah"})
		return
	}

	if _, err := h.DB.Exec(ctx, `UPDATE users SET deactivated_at = now() WHERE id = $1`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menonaktifkan akun"})
		return
	}
	_ = audit.Log(ctx, h.DB, userID, "account.deactivated", "user", userID, nil)
	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)

	c.JSON(http.StatusOK, gin.H{"message": "akun dinonaktifkan, halaman publikmu tidak lagi tampil"})
}

// Reactivate — kebalikan Deactivate, tidak butuh konfirmasi tambahan
// (pengguna sudah login, itu cukup untuk aksi yang sepenuhnya reversibel).
func (h *AccountHandler) Reactivate(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `UPDATE users SET deactivated_at = NULL WHERE id = $1`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengaktifkan kembali akun"})
		return
	}
	_ = audit.Log(ctx, h.DB, userID, "account.reactivated", "user", userID, nil)
	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)

	c.JSON(http.StatusOK, gin.H{"message": "akun diaktifkan kembali"})
}

type requestDeletionRequest struct {
	UsernameConfirmation string `json:"username_confirmation" binding:"required"`
	Password             string `json:"password" binding:"required"`
}

// RequestDeletion — konfirmasi berlapis (ketik username + password, persis
// sesuai spec) sebelum menjadwalkan penghapusan. TIDAK menganonimkan apa
// pun di sini -- cuma menjadwalkan (lihat komentar AccountHandler di atas).
// Unique index parsial di account_deletion_requests menegakkan "cuma satu
// permintaan pending sekaligus" -- pelanggaran ditangkap sebagai 23505 di
// bawah dan dibalas 409, bukan dianggap error server.
func (h *AccountHandler) RequestDeletion(c *gin.Context) {
	userID := c.GetString("userID")

	var req requestDeletionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var username, passwordHash string
	if err := h.DB.QueryRow(ctx, `SELECT username, password_hash FROM users WHERE id = $1`, userID).Scan(&username, &passwordHash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}
	if req.UsernameConfirmation != username {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username konfirmasi tidak cocok"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "password salah"})
		return
	}

	id := uuid.NewString()
	scheduledPurgeAt := time.Now().Add(accountDeletionGracePeriod)
	_, err := h.DB.Exec(ctx, `
		INSERT INTO account_deletion_requests (id, user_id, scheduled_purge_at)
		VALUES ($1, $2, $3)
	`, id, userID, scheduledPurgeAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			c.JSON(http.StatusConflict, gin.H{"error": "sudah ada permintaan penghapusan yang berjalan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menjadwalkan penghapusan akun"})
		return
	}

	metadata, _ := json.Marshal(gin.H{"scheduled_purge_at": scheduledPurgeAt})
	_ = audit.Log(ctx, h.DB, userID, "account.deletion_requested", "account_deletion_request", id, metadata)
	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)

	c.JSON(http.StatusOK, gin.H{"message": "penghapusan akun dijadwalkan", "scheduled_purge_at": scheduledPurgeAt})
}

// CancelDeletion — bisa dibatalkan KAPAN PUN sebelum scheduled_purge_at
// (acceptance criteria Modul Settings §6).
func (h *AccountHandler) CancelDeletion(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		UPDATE account_deletion_requests SET status = 'cancelled', cancelled_at = now()
		WHERE user_id = $1 AND status = 'pending'
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membatalkan penghapusan"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "tidak ada permintaan penghapusan yang berjalan"})
		return
	}
	_ = audit.Log(ctx, h.DB, userID, "account.deletion_cancelled", "user", userID, nil)
	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)

	c.JSON(http.StatusOK, gin.H{"message": "penghapusan akun dibatalkan"})
}

type deletionStatusResponse struct {
	Pending          bool       `json:"pending"`
	ScheduledPurgeAt *time.Time `json:"scheduled_purge_at,omitempty"`
	Deactivated      bool       `json:"deactivated"`
}

// DeletionStatus — dipanggil dashboard untuk menampilkan pita peringatan
// "akun dijadwalkan hapus tanggal X, batalkan?" (lihat TwoFactorPrompt di
// frontend untuk pola pita serupa dari Modul Settings §5).
func (h *AccountHandler) DeletionStatus(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var scheduledPurgeAt *time.Time
	err := h.DB.QueryRow(ctx, `
		SELECT scheduled_purge_at FROM account_deletion_requests WHERE user_id = $1 AND status = 'pending'
	`, userID).Scan(&scheduledPurgeAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat status akun"})
		return
	}

	var deactivatedAt *time.Time
	if err := h.DB.QueryRow(ctx, `SELECT deactivated_at FROM users WHERE id = $1`, userID).Scan(&deactivatedAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat status akun"})
		return
	}

	c.JSON(http.StatusOK, deletionStatusResponse{
		Pending: scheduledPurgeAt != nil, ScheduledPurgeAt: scheduledPurgeAt, Deactivated: deactivatedAt != nil,
	})
}

type accountExportProduct struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	PriceIDR int64  `json:"price_idr"`
	IsActive bool   `json:"is_active"`
}

type accountExportOrder struct {
	ID          string    `json:"id"`
	ProductName string    `json:"product_name"`
	BuyerEmail  string    `json:"buyer_email"`
	AmountIDR   int64     `json:"amount_idr"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

type accountExportCustomer struct {
	Email         string `json:"email"`
	OrderCount    int    `json:"order_count"`
	TotalSpentIDR int64  `json:"total_spent_idr"`
}

type accountExportData struct {
	ExportedAt time.Time               `json:"exported_at"`
	Username   string                  `json:"username"`
	Email      string                  `json:"email"`
	Products   []accountExportProduct  `json:"products"`
	Orders     []accountExportOrder    `json:"orders"`
	Customers  []accountExportCustomer `json:"customers"`
}

// Export — Modul Settings §6: JSON produk + histori transaksi + daftar
// pelanggan (spec menyebut JSON/CSV, fase ini JSON saja -- format
// alternatif, bukan cakupan data yang berbeda). Diunggah sebagai object
// sementara lalu dikembalikan sebagai signed URL, pola SAMA PERSIS dengan
// ProductHandler.GetDownloadURL/CheckoutHandler.DownloadFile (expiry 15
// menit).
func (h *AccountHandler) Export(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var username, email string
	if err := h.DB.QueryRow(ctx, `SELECT username, email FROM users WHERE id = $1`, userID).Scan(&username, &email); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat akun"})
		return
	}

	data := accountExportData{ExportedAt: time.Now(), Username: username, Email: email, Products: []accountExportProduct{}, Orders: []accountExportOrder{}, Customers: []accountExportCustomer{}}

	prodRows, err := h.DB.Query(ctx, `SELECT id, name, price_idr, is_active FROM products WHERE user_id = $1`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}
	for prodRows.Next() {
		var p accountExportProduct
		if err := prodRows.Scan(&p.ID, &p.Name, &p.PriceIDR, &p.IsActive); err == nil {
			data.Products = append(data.Products, p)
		}
	}
	prodRows.Close()

	orderRows, err := h.DB.Query(ctx, `
		SELECT o.id, p.name, o.buyer_email, o.amount_idr, o.status, o.created_at
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE p.user_id = $1
		ORDER BY o.created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat histori transaksi"})
		return
	}
	for orderRows.Next() {
		var o accountExportOrder
		if err := orderRows.Scan(&o.ID, &o.ProductName, &o.BuyerEmail, &o.AmountIDR, &o.Status, &o.CreatedAt); err == nil {
			data.Orders = append(data.Orders, o)
		}
	}
	orderRows.Close()

	custRows, err := h.DB.Query(ctx, `
		SELECT o.buyer_email, COUNT(*), COALESCE(SUM(o.amount_idr), 0)
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE p.user_id = $1 AND o.status = 'paid'
		GROUP BY o.buyer_email
		ORDER BY o.buyer_email
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar pelanggan"})
		return
	}
	for custRows.Next() {
		var item accountExportCustomer
		if err := custRows.Scan(&item.Email, &item.OrderCount, &item.TotalSpentIDR); err == nil {
			data.Customers = append(data.Customers, item)
		}
	}
	custRows.Close()

	body, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyusun data ekspor"})
		return
	}

	key := "exports/" + userID + "/" + uuid.NewString() + ".json"
	if err := h.Storage.Upload(ctx, key, bytes.NewReader(body), int64(len(body)), "application/json"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah data ekspor"})
		return
	}

	url, err := h.Storage.PresignedDownloadURL(ctx, key, 15*time.Minute)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat tautan unduhan"})
		return
	}

	_ = audit.Log(ctx, h.DB, userID, "account.exported", "user", userID, nil)

	c.JSON(http.StatusOK, gin.H{"download_url": url, "expires_in_seconds": 900})
}
