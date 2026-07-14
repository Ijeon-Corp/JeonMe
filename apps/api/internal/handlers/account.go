package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/audit"
)

// AccountHandler mengimplementasikan NF-09 (mekanisme hapus data sesuai UU
// PDP). "Hapus" di sini berarti ANONIMISASI, bukan penghapusan baris fisik --
// order/ledger_entries/payments TETAP disimpan (kewajiban pembukuan/pajak
// & jejak audit finansial biasanya punya masa retensi sendiri yang terpisah
// dari hak hapus data pribadi), tapi data yang mengidentifikasi orangnya
// (email asli, username, password) diganti nilai tak-berguna dan halaman
// publik + semua produk dinonaktifkan.
type AccountHandler struct {
	DB *pgxpool.Pool
}

func NewAccountHandler(db *pgxpool.Pool) *AccountHandler {
	return &AccountHandler{DB: db}
}

// DeleteAccount — NF-09.
func (h *AccountHandler) DeleteAccount(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	anonymizedEmail := "deleted-" + userID + "@deleted.jeonme.invalid"
	anonymizedUsername := "deleted-" + userID[:8]

	if _, err := tx.Exec(ctx, `
		UPDATE users SET
			email = $1,
			username = $2,
			password_hash = 'deleted',
			deleted_at = now()
		WHERE id = $3
	`, anonymizedEmail, anonymizedUsername, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus akun"})
		return
	}

	if _, err := tx.Exec(ctx, `UPDATE pages SET is_published = false WHERE user_id = $1`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menonaktifkan halaman"})
		return
	}

	if _, err := tx.Exec(ctx, `UPDATE products SET is_active = false WHERE user_id = $1`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menonaktifkan produk"})
		return
	}

	if err := audit.Log(ctx, tx, userID, "user.deleted", "user", userID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "akun berhasil dihapus"})
}
