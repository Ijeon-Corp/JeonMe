package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/audit"
	"github.com/jeonme/api/internal/queue"
)

// AdminHandler mengimplementasikan REQ-F-701 (manajemen user), REQ-F-702
// (moderasi konten dari laporan publik), REQ-F-703 (ringkasan dashboard admin).
//
// TIDAK ADA cara self-service untuk menjadi admin -- role diubah manual
// lewat SQL langsung oleh operator (UPDATE users SET role='admin' WHERE
// id=...), sengaja tidak diekspos lewat API sama sekali supaya tidak ada
// jalur eskalasi privilese lewat aplikasi.
//
// role='support' (7 September 2026, permintaan langsung pengguna: "butuh
// role khusus untuk menangani live chat dsb jangan hak akses admin yang
// full") -- SAMA caranya (SQL manual), TAPI cuma boleh mengakses rute yang
// digerbang middleware.SupportRequired (Live Chat, lihat routes.go grup
// supportGroup), BUKAN endpoint apa pun di AdminHandler ini (semuanya
// masih murni middleware.AdminRequired, role='admin' saja).
type AdminHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
	// Queue -- audit fitur admin (5 September 2026): SEBELUMNYA tidak satu
	// pun aksi admin (suspend/aktivasi user, resolusi laporan, status
	// penarikan, review KYC) memberi tahu pengguna yang terdampak sama
	// sekali -- mereka baru sadar lewat efek samping (gagal login, saldo
	// berubah, dst). Di-set terpisah setelah NewAdminHandler (pola sama
	// seperti AuthHandler.Queue di routes.go) -- boleh nil, soft-fail sama
	// seperti operasi sampingan lain (lihat CLAUDE.md).
	Queue *asynq.Client
}

func NewAdminHandler(db *pgxpool.Pool, rdb *redis.Client) *AdminHandler {
	return &AdminHandler{DB: db, RDB: rdb}
}

// paginatedResponse -- audit fitur admin (5 September 2026): SEMUA daftar
// admin (Pengguna/Laporan/Penarikan/KYC) sebelumnya pakai LIMIT tetap tanpa
// cara melihat sisanya begitu jumlah baris melebihi limit itu. total dikirim
// terpisah dari items supaya frontend tahu kapan berhenti menampilkan
// tombol "Muat lebih" tanpa perlu request tambahan cuma untuk itu.
type paginatedResponse[T any] struct {
	Items []T `json:"items"`
	Total int `json:"total"`
}

// parseLimitOffset -- default limit 50 (maks 100, mencegah query sekali
// tarik ribuan baris), offset default 0. Dipakai seragam oleh semua list
// admin.
func parseLimitOffset(c *gin.Context) (limit, offset int) {
	limit, offset = 50, 0
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	if limit > 100 {
		limit = 100
	}
	if v, err := strconv.Atoi(c.Query("offset")); err == nil && v >= 0 {
		offset = v
	}
	return
}

// notifyUser -- insert notifikasi dalam-app, soft-fail (bukan inti transaksi
// aksi admin), pola sama persis affiliate.go/brand.go. Fungsi package-level
// (bukan method) supaya dipakai bersama AdminHandler (admin.go) DAN
// KycHandler (kyc.go) -- dua struct berbeda, satu sumber notifikasi admin.
// HANYA cocok utk pengguna yang MASIH bisa login (bell notifikasi cuma
// terlihat setelah masuk) -- utk kasus sebaliknya (mis. suspend, akun yang
// justru tidak bisa login sama sekali), enqueue email lewat
// queue.NewAccountSuspendedTask langsung di pemanggil, bukan lewat fungsi
// ini.
func notifyUser(ctx context.Context, db *pgxpool.Pool, userID, notifType, title, body, linkURL string) {
	if _, err := db.Exec(ctx, `
		INSERT INTO notifications (user_id, type, title, body, link_url) VALUES ($1, $2, $3, $4, $5)
	`, userID, notifType, title, body, linkURL); err != nil {
		log.Printf("admin: gagal membuat notifikasi %s untuk user %s: %v", notifType, userID, err)
	}
}

type adminUserItem struct {
	ID          string     `json:"id"`
	Email       string     `json:"email"`
	Username    string     `json:"username"`
	Role        string     `json:"role"`
	CreatedAt   time.Time  `json:"created_at"`
	SuspendedAt *time.Time `json:"suspended_at,omitempty"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
}

// ListUsers — REQ-F-701. search (opsional) mencocokkan email/username;
// role & status (opsional) memfilter; limit/offset mengontrol halaman
// (audit fitur admin 5 September 2026 -- lihat paginatedResponse).
func (h *AdminHandler) ListUsers(c *gin.Context) {
	search := "%" + c.Query("search") + "%"
	role := c.Query("role")
	status := c.Query("status") // "", "active", "suspended", "deleted"
	limit, offset := parseLimitOffset(c)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	where := "WHERE (email ILIKE $1 OR username ILIKE $1)"
	args := []any{search}
	if role != "" {
		args = append(args, role)
		where += fmt.Sprintf(" AND role = $%d", len(args))
	}
	switch status {
	case "active":
		where += " AND suspended_at IS NULL AND deleted_at IS NULL"
	case "suspended":
		where += " AND suspended_at IS NOT NULL"
	case "deleted":
		where += " AND deleted_at IS NOT NULL"
	}

	var total int
	if err := h.DB.QueryRow(ctx, "SELECT COUNT(*) FROM users "+where, args...).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar user"})
		return
	}

	args = append(args, limit, offset)
	rows, err := h.DB.Query(ctx, fmt.Sprintf(`
		SELECT id, email, username, role, created_at, suspended_at, deleted_at
		FROM users %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, where, len(args)-1, len(args)), args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar user"})
		return
	}
	defer rows.Close()

	items := []adminUserItem{}
	for rows.Next() {
		var it adminUserItem
		if err := rows.Scan(&it.ID, &it.Email, &it.Username, &it.Role, &it.CreatedAt, &it.SuspendedAt, &it.DeletedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, paginatedResponse[adminUserItem]{Items: items, Total: total})
}

// SuspendUser — REQ-F-701. Berbeda dari hapus akun: reversibel, identitas
// TIDAK dianonimkan, cuma diblokir login (lihat AuthHandler.Login).
func (h *AdminHandler) SuspendUser(c *gin.Context) {
	targetID := c.Param("id")
	adminID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var targetEmail string
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := tx.QueryRow(ctx, `UPDATE users SET suspended_at = now() WHERE id = $1 RETURNING email`, targetID).Scan(&targetEmail); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menangguhkan user"})
		return
	}
	if err := audit.Log(ctx, tx, adminID, "user.suspended", "user", targetID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	// Notifikasi EMAIL, bukan bell dalam-app -- audit fitur admin (5
	// September 2026): user yang disuspend justru TIDAK BISA login, jadi
	// notifikasi dalam-app (yang cuma terlihat setelah masuk) tidak akan
	// pernah terlihat olehnya. Email satu-satunya kanal yang menjangkau.
	if h.Queue != nil {
		if task, err := queue.NewAccountSuspendedTask(targetEmail); err == nil {
			_, _ = h.Queue.Enqueue(task)
		}
	}

	// Audit OWASP A01 (4 September 2026), temuan PALING SERIUS di audit
	// ini: SEBELUMNYA suspended_at cuma diperiksa di 3 titik LOGIN (login
	// password, callback Google/Apple) -- middleware.AuthRequired yang
	// menggerbang SEMUA endpoint dashboard/API TIDAK PERNAH mengecek
	// status suspend, cuma validasi signature JWT + denylist jti. Akibatnya
	// user yang di-suspend admin (mis. karena penipuan) tetap bisa memakai
	// JWT yang sudah terlanjur diterbitkan (berlaku sampai 24 jam) untuk
	// terus memakai dashboard -- TERMASUK menarik saldo lewat
	// POST /dashboard/payouts sebelum ada yang sempat mencegahnya. Dicabut
	// di sini (di luar transaksi DB -- kegagalan Redis tidak boleh
	// membatalkan suspend yang sudah berhasil, hanya berarti sesi lama
	// bertahan sedikit lebih lama, sama seperti risiko residual sebelum
	// perbaikan ini, bukan lebih buruk).
	revokeAllUserSessions(ctx, h.RDB, targetID, "")

	c.JSON(http.StatusOK, gin.H{"message": "user ditangguhkan"})
}

// ActivateUser — REQ-F-701 (lawan dari SuspendUser).
func (h *AdminHandler) ActivateUser(c *gin.Context) {
	targetID := c.Param("id")
	adminID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var targetEmail string
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := tx.QueryRow(ctx, `UPDATE users SET suspended_at = NULL WHERE id = $1 RETURNING email`, targetID).Scan(&targetEmail); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengaktifkan user"})
		return
	}
	if err := audit.Log(ctx, tx, adminID, "user.activated", "user", targetID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	if h.Queue != nil {
		if task, err := queue.NewAccountActivatedTask(targetEmail); err == nil {
			_, _ = h.Queue.Enqueue(task)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "user diaktifkan kembali"})
}

type createReportRequest struct {
	TargetType    string `json:"target_type" binding:"required,oneof=page product"`
	TargetID      string `json:"target_id" binding:"required"`
	Reason        string `json:"reason" binding:"required,max=1000"`
	ReporterEmail string `json:"reporter_email"`
}

// CreateReport — REQ-F-702 (bagian publik: siapa pun bisa melaporkan tanpa
// akun). TIDAK dilindungi AuthRequired -- ini endpoint publik.
func (h *AdminHandler) CreateReport(c *gin.Context) {
	var req createReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	_, err := h.DB.Exec(ctx, `
		INSERT INTO reports (id, target_type, target_id, reason, reporter_email, status, created_at)
		VALUES ($1, $2, $3, $4, $5, 'pending', now())
	`, uuid.NewString(), req.TargetType, req.TargetID, req.Reason, req.ReporterEmail)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengirim laporan"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "laporan diterima, tim kami akan meninjau"})
}

type reportItem struct {
	ID            string    `json:"id"`
	TargetType    string    `json:"target_type"`
	TargetID      string    `json:"target_id"`
	Reason        string    `json:"reason"`
	ReporterEmail string    `json:"reporter_email"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

// ListReports — REQ-F-702 (bagian admin). status default "pending"; pakai
// "all" utk melihat seluruh riwayat (resolved/dismissed/takedown) --
// SEBELUMNYA frontend cuma pernah memanggil "pending", laporan yang sudah
// diproses hilang total dari tampilan (audit fitur admin, 5 September
// 2026). limit/offset mengontrol halaman.
func (h *AdminHandler) ListReports(c *gin.Context) {
	status := c.DefaultQuery("status", "pending")
	limit, offset := parseLimitOffset(c)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	where := ""
	args := []any{}
	if status != "all" {
		where = "WHERE status = $1"
		args = append(args, status)
	}

	var total int
	if err := h.DB.QueryRow(ctx, "SELECT COUNT(*) FROM reports "+where, args...).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat laporan"})
		return
	}

	args = append(args, limit, offset)
	rows, err := h.DB.Query(ctx, fmt.Sprintf(`
		SELECT id, target_type, target_id, reason, reporter_email, status, created_at
		FROM reports %s ORDER BY created_at ASC LIMIT $%d OFFSET $%d
	`, where, len(args)-1, len(args)), args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat laporan"})
		return
	}
	defer rows.Close()

	items := []reportItem{}
	for rows.Next() {
		var it reportItem
		if err := rows.Scan(&it.ID, &it.TargetType, &it.TargetID, &it.Reason, &it.ReporterEmail, &it.Status, &it.CreatedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, paginatedResponse[reportItem]{Items: items, Total: total})
}

type resolveReportRequest struct {
	Action string `json:"action" binding:"required,oneof=takedown dismiss"`
}

// ResolveReport — REQ-F-702. "takedown" menonaktifkan halaman/produk yang
// dilaporkan (is_published/is_active = false); "dismiss" menutup laporan
// tanpa aksi (dianggap tidak melanggar).
func (h *AdminHandler) ResolveReport(c *gin.Context) {
	reportID := c.Param("id")
	adminID := c.GetString("userID")

	var req resolveReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// SELECT ini HANYA mengecek eksistensi laporan (buat mengambil
	// target_type/target_id, dibutuhkan utk tahu tabel mana yang diupdate
	// di bawah) -- TIDAK IKUT menggerbang status "pending" (audit keamanan
	// profesional 15 September 2026, Medium, lihat catatan TOCTOU lengkap
	// di UPDATE reports terminal di bawah). Kalau digerbang di sini juga,
	// panggilan kedua yang berurutan (bukan cuma yang genuinely bersamaan)
	// akan berhenti di 404 generik sebelum sempat menyentuh guard atomik
	// di UPDATE -- gatenya sengaja dipusatkan HANYA di satu tempat.
	var targetType, targetID string
	if err := h.DB.QueryRow(ctx, `
		SELECT target_type, target_id FROM reports WHERE id = $1
	`, reportID).Scan(&targetType, &targetID); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "laporan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat laporan"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var ownerID, contentLabel string
	newStatus := "dismissed"
	if req.Action == "takedown" {
		newStatus = "takedown"
		// moderation_locked_at (migrasi 000092) -- audit fitur admin (5
		// September 2026): SEBELUMNYA takedown cuma flip is_published/
		// is_active, kolom yang SAMA dipakai endpoint edit pemilik sendiri,
		// jadi pemilik bisa langsung mempublikasikan ulang sendiri tanpa
		// admin pernah tahu. Selama terkunci, PageHandler.UpdateMyPage &
		// ProductHandler.Update menolak menyalakan lagi -- lihat komentar
		// lengkap di kedua file itu.
		var takedownErr error
		switch targetType {
		case "page":
			takedownErr = tx.QueryRow(ctx, `
				UPDATE pages SET is_published = false, moderation_locked_at = now()
				WHERE id = $1 RETURNING user_id, COALESCE(NULLIF(display_name, ''), 'Halaman'::varchar)
			`, targetID).Scan(&ownerID, &contentLabel)
		case "product":
			takedownErr = tx.QueryRow(ctx, `
				UPDATE products SET is_active = false, moderation_locked_at = now()
				WHERE id = $1 RETURNING user_id, name
			`, targetID).Scan(&ownerID, &contentLabel)
		}
		if takedownErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menonaktifkan konten"})
			return
		}
	}

	// TOCTOU (audit keamanan profesional 15 September 2026, Medium):
	// SEBELUMNYA syarat "masih pending" cuma dicek SEKALI lewat SELECT di
	// atas, SEBELUM transaksi ini dibuka -- UPDATE terminal di bawah tidak
	// mengulang syarat itu, jadi dua panggilan bersamaan pada laporan yang
	// SAMA (klik ganda, atau dua staf berbeda) bisa lolos SELECT itu
	// berdua lalu berdua commit: moderation_locked_at sudah ditulis ke
	// halaman/produk oleh KEDUANYA, tapi reports.status cuma bisa berhenti
	// di satu nilai akhir -- kalau nilai akhirnya bukan yang RestoreReport
	// harapkan, laporan itu terjebak tanpa jalur pemulihan kecuali SQL
	// manual. Pola sama dengan KycHandler.AdminReview/AdminRevoke (kyc.go):
	// syarat status dilipat ke WHERE clause UPDATE ini sendiri (atomik di
	// level DB, bukan lagi baca-lalu-tulis terpisah), RowsAffected() dicek
	// sesudahnya -- kalau nol, batalkan transaksi (rollback lewat defer di
	// atas) & kasih pesan jelas alih-alih berpura-pura berhasil.
	tag, err := tx.Exec(ctx, `
		UPDATE reports SET status = $1, resolved_by = $2, resolved_at = now()
		WHERE id = $3 AND status = 'pending'
	`, newStatus, adminID, reportID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui laporan"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "laporan ini sudah diproses oleh orang lain, muat ulang halaman"})
		return
	}

	if err := audit.Log(ctx, tx, adminID, "report."+newStatus, "report", reportID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	if req.Action == "takedown" && ownerID != "" {
		targetLabel := "Halaman"
		if targetType == "product" {
			targetLabel = "Produk"
		}
		notifyUser(ctx, h.DB, ownerID, "content_takedown",
			targetLabel+" \""+contentLabel+"\" dinonaktifkan admin",
			targetLabel+" \""+contentLabel+"\" dinonaktifkan karena melanggar ketentuan setelah ditinjau tim kami. Hubungi support kalau menurutmu ini keliru.",
			"/admin",
		)
	}

	c.JSON(http.StatusOK, gin.H{"message": "laporan diproses"})
}

// RestoreReport — kebalikan dari ResolveReport(action=takedown): mencabut
// moderation_locked_at (migrasi 000092) supaya pemilik konten bisa
// mempublikasikan/mengaktifkan lagi sendiri, DAN langsung menyalakan
// kembali is_published/is_active (simetris dgn takedown, bukan sekadar
// membuka gembok lalu meninggalkan kontennya nonaktif tanpa penjelasan).
// Hanya berlaku utk laporan berstatus "takedown" (guard WHERE di bawah).
func (h *AdminHandler) RestoreReport(c *gin.Context) {
	reportID := c.Param("id")
	adminID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// Sama seperti ResolveReport di atas (audit keamanan profesional 15
	// September 2026, Medium) -- SELECT ini HANYA mengecek eksistensi
	// laporan, TIDAK ikut menggerbang status "takedown" lagi. Guard status
	// dipusatkan HANYA di UPDATE terminal di bawah supaya atomik (lihat
	// catatan lengkap di sana).
	var targetType, targetID string
	if err := h.DB.QueryRow(ctx, `
		SELECT target_type, target_id FROM reports WHERE id = $1
	`, reportID).Scan(&targetType, &targetID); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "laporan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat laporan"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var ownerID, contentLabel string
	var restoreErr error
	switch targetType {
	case "page":
		restoreErr = tx.QueryRow(ctx, `
			UPDATE pages SET is_published = true, moderation_locked_at = NULL
			WHERE id = $1 RETURNING user_id, COALESCE(NULLIF(display_name, ''), 'Halaman'::varchar)
		`, targetID).Scan(&ownerID, &contentLabel)
	case "product":
		restoreErr = tx.QueryRow(ctx, `
			UPDATE products SET is_active = true, moderation_locked_at = NULL
			WHERE id = $1 RETURNING user_id, name
		`, targetID).Scan(&ownerID, &contentLabel)
	}
	if restoreErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulihkan konten"})
		return
	}

	// TOCTOU (audit keamanan profesional 15 September 2026, Medium) -- lihat
	// catatan lengkap di ResolveReport di atas, celah & pola perbaikannya
	// identik: syarat status 'takedown' dilipat ke WHERE clause UPDATE ini
	// sendiri (bukan lagi cuma dicek lewat SELECT terpisah sebelum
	// transaksi), RowsAffected() dicek sesudahnya.
	tag, err := tx.Exec(ctx, `
		UPDATE reports SET status = 'restored', resolved_by = $1, resolved_at = now()
		WHERE id = $2 AND status = 'takedown'
	`, adminID, reportID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui laporan"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "laporan ini sudah diproses oleh orang lain, muat ulang halaman"})
		return
	}

	if err := audit.Log(ctx, tx, adminID, "report.restored", "report", reportID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	targetLabel := "Halaman"
	if targetType == "product" {
		targetLabel = "Produk"
	}
	notifyUser(ctx, h.DB, ownerID, "content_restored",
		targetLabel+" \""+contentLabel+"\" dipulihkan admin",
		targetLabel+" \""+contentLabel+"\" sudah diaktifkan kembali oleh admin setelah ditinjau ulang.",
		"/dashboard",
	)

	c.JSON(http.StatusOK, gin.H{"message": "konten dipulihkan"})
}

type adminPayoutItem struct {
	ID                 string     `json:"id"`
	Username           string     `json:"username"`
	Email              string     `json:"email"`
	AmountIDR          int64      `json:"amount_idr"`
	DestinationAccount string     `json:"destination_account"`
	Status             string     `json:"status"`
	KycStatusAtRequest string     `json:"kyc_status_at_request"`
	RequestedAt        time.Time  `json:"requested_at"`
	CompletedAt        *time.Time `json:"completed_at,omitempty"`
}

// ListPayouts — REQ-F-505: admin melihat SEMUA pengajuan penarikan lintas
// kreator (beda dari BalanceHandler.ListPayouts yang cuma punya kreator
// sendiri). Default filter ke "requested"+"processing" (yang masih perlu
// tindakan) -- kirim ?status=all untuk melihat riwayat lengkap termasuk
// yang sudah selesai/gagal.
func (h *AdminHandler) ListPayouts(c *gin.Context) {
	status := c.DefaultQuery("status", "")
	limit, offset := parseLimitOffset(c)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	where := ""
	args := []any{}
	switch status {
	case "", "needs_action":
		where = `WHERE p.status IN ('requested', 'processing')`
	case "all":
		// tanpa filter
	default:
		args = append(args, status)
		where = `WHERE p.status = $1`
	}

	var total int
	if err := h.DB.QueryRow(ctx, "SELECT COUNT(*) FROM payouts p "+where, args...).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar penarikan"})
		return
	}

	// Kreator terverifikasi KYC diprioritaskan lebih dulu dalam antrian
	// (No.84) -- TIDAK memblokir yang belum terverifikasi, hanya diproses
	// belakangan sesuai urutan pengajuan di antara sesama status yang sama.
	args = append(args, limit, offset)
	rows, err := h.DB.Query(ctx, fmt.Sprintf(`
		SELECT p.id, u.username, u.email, p.amount_idr, p.destination_account, p.status,
		       p.kyc_status_at_request, p.requested_at, p.completed_at
		FROM payouts p JOIN users u ON u.id = p.user_id
		%s
		ORDER BY (p.kyc_status_at_request = 'verified') DESC, p.requested_at ASC
		LIMIT $%d OFFSET $%d
	`, where, len(args)-1, len(args)), args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar penarikan"})
		return
	}
	defer rows.Close()

	items := []adminPayoutItem{}
	for rows.Next() {
		var it adminPayoutItem
		if err := rows.Scan(&it.ID, &it.Username, &it.Email, &it.AmountIDR, &it.DestinationAccount, &it.Status, &it.KycStatusAtRequest, &it.RequestedAt, &it.CompletedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, paginatedResponse[adminPayoutItem]{Items: items, Total: total})
}

// payoutTransitions — state machine eksplisit: "completed"/"failed" adalah
// status akhir, tidak bisa diubah lagi lewat endpoint ini. Mencegah admin
// (atau klik ganda tak sengaja) memproses penarikan yang sama dua kali.
var payoutTransitions = map[string]map[string]bool{
	"requested":  {"processing": true, "failed": true},
	"processing": {"completed": true, "failed": true},
}

type updatePayoutStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=processing completed failed"`
}

// UpdatePayoutStatus — REQ-F-505: admin memproses pengajuan penarikan
// secara MANUAL (belum ada integrasi Disbursement API sungguhan, lihat
// Rencana-Sprint-Jeonme.xlsx Sprint 4 No.52/53) -- transfer dana sungguhan
// dilakukan admin di luar sistem (mis. lewat internet banking), lalu
// ditandai di sini.
//
// Kalau status baru "failed": ledger debit yang dicatat saat PENGAJUAN
// (BalanceHandler.CreatePayout langsung mendebit supaya saldo yang sama
// tidak bisa diajukan dua kali) di-REVERSE (dikredit balik) DI DALAM
// transaksi yang sama -- kalau tidak, saldo kreator hilang permanen padahal
// uangnya tidak pernah benar-benar keluar dari platform.
func (h *AdminHandler) UpdatePayoutStatus(c *gin.Context) {
	payoutID := c.Param("id")
	adminID := c.GetString("userID")

	var req updatePayoutStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var currentStatus, payoutUserID string
	var amountIDR int64
	err = tx.QueryRow(ctx, `
		SELECT status, user_id, amount_idr FROM payouts WHERE id = $1 FOR UPDATE
	`, payoutID).Scan(&currentStatus, &payoutUserID, &amountIDR)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "penarikan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat penarikan"})
		return
	}

	if !payoutTransitions[currentStatus][req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("tidak bisa mengubah status dari %q ke %q", currentStatus, req.Status)})
		return
	}

	if req.Status == "completed" {
		_, err = tx.Exec(ctx, `UPDATE payouts SET status = $1, completed_at = now() WHERE id = $2`, req.Status, payoutID)
	} else {
		_, err = tx.Exec(ctx, `UPDATE payouts SET status = $1 WHERE id = $2`, req.Status, payoutID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui status"})
		return
	}

	if req.Status == "failed" {
		// Serialisasi lewat lock yang sama seperti CreatePayout/webhook
		// checkout supaya balance_after selalu benar walau ada penulisan
		// ledger lain untuk kreator yang sama bersamaan.
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, payoutUserID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunci saldo"})
			return
		}

		currentBalance, err := latestLedgerBalance(ctx, tx, payoutUserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung saldo"})
			return
		}

		newBalance := currentBalance + amountIDR
		ledgerID := uuid.NewString()
		if _, err := tx.Exec(ctx, `
			INSERT INTO ledger_entries (id, user_id, type, amount_idr, balance_after, source, created_at)
			VALUES ($1, $2, 'credit', $3, $4, 'payout_reversal', now())
		`, ledgerID, payoutUserID, amountIDR, newBalance); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengembalikan saldo"})
			return
		}

		metadata, _ := json.Marshal(gin.H{"payout_id": payoutID, "amount_idr": amountIDR, "balance_after": newBalance, "reason": "payout_failed_reversal"})
		if err := audit.Log(ctx, tx, payoutUserID, "ledger.credit", "ledger_entry", ledgerID, metadata); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
			return
		}
	}

	metadata, _ := json.Marshal(gin.H{"payout_id": payoutID, "from": currentStatus, "to": req.Status, "processed_by": adminID})
	if err := audit.Log(ctx, tx, payoutUserID, "payout."+req.Status, "payout", payoutID, metadata); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencatat audit log"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	// Notifikasi dalam-app -- audit fitur admin (5 September 2026):
	// SEBELUMNYA kreator tidak diberi tahu sama sekali saat status
	// penarikannya berubah, termasuk saat saldo dikembalikan (kasus
	// "failed" di atas) -- baru sadar kalau kebetulan buka halaman saldo.
	switch req.Status {
	case "processing":
		notifyUser(ctx, h.DB, payoutUserID, "payout_processing", "Penarikan sedang diproses",
			fmt.Sprintf("Penarikan Rp%d sedang diproses admin.", amountIDR), "/dashboard/balance")
	case "completed":
		notifyUser(ctx, h.DB, payoutUserID, "payout_completed", "Penarikan berhasil",
			fmt.Sprintf("Penarikan Rp%d sudah selesai ditransfer.", amountIDR), "/dashboard/balance")
	case "failed":
		notifyUser(ctx, h.DB, payoutUserID, "payout_failed", "Penarikan gagal, saldo dikembalikan",
			fmt.Sprintf("Penarikan Rp%d gagal diproses -- saldo sudah dikembalikan ke akunmu.", amountIDR), "/dashboard/balance")
	}

	c.JSON(http.StatusOK, gin.H{"message": "status penarikan diperbarui"})
}

type adminSummaryResponse struct {
	TotalUsers      int64 `json:"total_users"`
	NewUsers7Days   int64 `json:"new_users_7_days"`
	TotalOrders     int64 `json:"total_orders"`
	TotalRevenueIDR int64 `json:"total_revenue_idr"`
	PendingReports  int64 `json:"pending_reports"`
	PendingPayouts  int64 `json:"pending_payouts"`
	// PendingKyc -- audit fitur admin (5 September 2026): SEBELUMNYA
	// Ringkasan tidak menampilkan backlog KYC sama sekali walau punya
	// halaman review sendiri -- cuma terlihat kalau admin sengaja membuka
	// /admin/kyc, beda dari laporan/penarikan yang sudah tampil di sini.
	PendingKyc int64 `json:"pending_kyc"`
	// PendingSupportChats -- fitur Live Chat (permintaan langsung pengguna,
	// 7 September 2026), pola SAMA PERSIS PendingKyc di atas: tanpa ini
	// antrian chat baru tidak akan terlihat sama sekali kecuali admin
	// sengaja buka /admin/support-chat.
	PendingSupportChats int64 `json:"pending_support_chats"`
}

// GetSummary — REQ-F-703.
func (h *AdminHandler) GetSummary(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var resp adminSummaryResponse
	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')
		FROM users WHERE deleted_at IS NULL
	`).Scan(&resp.TotalUsers, &resp.NewUsers7Days); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung ringkasan user"})
		return
	}

	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE status = 'paid'), COALESCE(SUM(amount_idr) FILTER (WHERE status = 'paid'), 0)
		FROM orders
	`).Scan(&resp.TotalOrders, &resp.TotalRevenueIDR); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung ringkasan transaksi"})
		return
	}

	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM reports WHERE status = 'pending'`).Scan(&resp.PendingReports); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung laporan tertunda"})
		return
	}

	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM payouts WHERE status IN ('requested', 'processing')`).Scan(&resp.PendingPayouts); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung penarikan tertunda"})
		return
	}

	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM kyc_verifications WHERE status = 'pending'`).Scan(&resp.PendingKyc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung KYC tertunda"})
		return
	}

	// Thread "perlu dibalas" -- pesan TERBARU tiap kreator berasal dari
	// kreator (bukan status kolom, murni urutan waktu -- lihat catatan
	// panjang di migrasi 000095 & SupportChatHandler.AdminList).
	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM (
			SELECT DISTINCT ON (user_id) sender_role FROM support_messages ORDER BY user_id, created_at DESC
		) latest WHERE sender_role = 'creator'
	`).Scan(&resp.PendingSupportChats); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung live chat tertunda"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// ----------------------------------------------------------------------
// Moderasi tautan sensitif -- permintaan langsung pengguna, 22 Agustus
// 2026: "sistem bisa memblokir jika memasukkan link yang sensitif contoh
// nya link judol link 18+ dll". Panel admin untuk mengelola dua tabel yang
// dipakai handlers.LinkModerationChecker (moderation.go) -- lihat catatan
// lengkap arsitektur di sana. Endpoint di bawah HANYA mengelola data,
// keputusan blokir sungguhan terjadi di LinksHandler/ProductHandler saat
// kreator menyimpan tautan.
// ----------------------------------------------------------------------

type blockedKeywordItem struct {
	ID        string    `json:"id"`
	Keyword   string    `json:"keyword"`
	Category  string    `json:"category"`
	MatchType string    `json:"match_type"`
	CreatedAt time.Time `json:"created_at"`
}

// ListBlockedKeywords — daftar kata kunci yang dicek terhadap URL+judul
// tautan baru dari domain yang belum pernah dilihat.
// limit/offset (parseLimitOffset) ditambahkan lewat audit performa
// profesional 15 September 2026 (Low) -- tabel ini genuinely rendah
// kardinalitas (dikurasi admin manual lewat CreateBlockedKeyword, BUKAN
// tumbuh otomatis dari hasil scan spt link_domain_verdicts di
// ListDomainVerdicts di bawah), jadi risiko unbounded-result di sini murni
// teoretis. Ditambahkan cuma demi konsistensi & jaga-jaga kalau tabel ini
// suatu saat tumbuh tak terduga -- pola sama persis ListDomainVerdicts.
func (h *AdminHandler) ListBlockedKeywords(c *gin.Context) {
	limit, offset := parseLimitOffset(c)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, keyword, category, match_type, created_at FROM blocked_keywords
		ORDER BY created_at DESC LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat kata kunci"})
		return
	}
	defer rows.Close()

	items := []blockedKeywordItem{}
	for rows.Next() {
		var it blockedKeywordItem
		if err := rows.Scan(&it.ID, &it.Keyword, &it.Category, &it.MatchType, &it.CreatedAt); err == nil {
			items = append(items, it)
		}
	}
	c.JSON(http.StatusOK, items)
}

// createBlockedKeywordRequest -- MatchType default "substring" (perilaku
// lama, aman utk frasa multi-kata). "domain_exact" (migrasi 000091) HANYA
// dipakai utk kata generik satu-suku-kata yang tidak aman dicek sbg
// substring bebas (mis. "slot") -- lihat komentar match_type di
// moderation.go utk penjelasan lengkap kenapa dua strategi ini perlu
// dipisah, bukan satu mode saja.
type createBlockedKeywordRequest struct {
	Keyword   string `json:"keyword" binding:"required,max=100"`
	Category  string `json:"category" binding:"omitempty,oneof=judi_online konten_dewasa lainnya"`
	MatchType string `json:"match_type" binding:"omitempty,oneof=substring domain_exact"`
}

// CreateBlockedKeyword — tambah satu kata kunci baru ke blocklist.
func (h *AdminHandler) CreateBlockedKeyword(c *gin.Context) {
	adminID := c.GetString("userID")

	var req createBlockedKeywordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	if req.Category == "" {
		req.Category = "lainnya"
	}
	if req.MatchType == "" {
		req.MatchType = "substring"
	}
	keyword := strings.ToLower(strings.TrimSpace(req.Keyword))
	if keyword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "kata kunci tidak boleh kosong"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	id := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO blocked_keywords (id, keyword, category, match_type, created_at) VALUES ($1, $2, $3, $4, now())
	`, id, keyword, req.Category, req.MatchType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menambah kata kunci (mungkin sudah ada)"})
		return
	}
	_ = audit.Log(ctx, h.DB, adminID, "blocked_keyword.created", "blocked_keyword", id, nil)

	c.JSON(http.StatusCreated, gin.H{"id": id, "keyword": keyword, "category": req.Category, "match_type": req.MatchType})
}

// DeleteBlockedKeyword — hapus satu kata kunci dari blocklist.
func (h *AdminHandler) DeleteBlockedKeyword(c *gin.Context) {
	id := c.Param("id")
	adminID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM blocked_keywords WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus kata kunci"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "kata kunci tidak ditemukan"})
		return
	}
	_ = audit.Log(ctx, h.DB, adminID, "blocked_keyword.deleted", "blocked_keyword", id, nil)

	c.JSON(http.StatusOK, gin.H{"message": "kata kunci dihapus"})
}

type domainVerdictItem struct {
	ID        string    `json:"id"`
	Domain    string    `json:"domain"`
	Verdict   string    `json:"verdict"`
	Category  string    `json:"category"`
	Source    string    `json:"source"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListDomainVerdicts — cache reputasi per-domain (hasil kurasi admin
// manual MAUPUN klasifikasi AI otomatis). ?verdict=blocked|allowed
// (opsional) untuk memfilter, mis. meninjau semua domain yang pernah
// diblokir AI untuk kemungkinan false-positive.
// ListDomainVerdicts -- limit/offset (parseLimitOffset) ditambahkan lewat
// audit performa profesional 15 September 2026 (Low-Medium): "LIMIT 200"
// tetap sebelumnya adalah plafon PERMANEN (tabel ini tumbuh otomatis dari
// hasil scan moderasi tautan, bukan dikurasi admin) -- domain lama tidak
// akan pernah terlihat lagi lewat endpoint ini begitu tabel lewat 200
// baris. Query di-parameterkan (bukan lagi literal "LIMIT 200") supaya
// argumen limit/offset ikut lewat args slice yang sudah ada, konsisten
// dgn pola filter verdict opsional yang sudah ada di sini.
func (h *AdminHandler) ListDomainVerdicts(c *gin.Context) {
	verdictFilter := c.Query("verdict")
	limit, offset := parseLimitOffset(c)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	query := `SELECT id, domain, verdict, COALESCE(category, ''), source, COALESCE(reason, ''), created_at, updated_at FROM link_domain_verdicts`
	args := []any{}
	if verdictFilter == "blocked" || verdictFilter == "allowed" {
		query += ` WHERE verdict = $1`
		args = append(args, verdictFilter)
	}
	args = append(args, limit, offset)
	query += fmt.Sprintf(` ORDER BY updated_at DESC LIMIT $%d OFFSET $%d`, len(args)-1, len(args))

	rows, err := h.DB.Query(ctx, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat reputasi domain"})
		return
	}
	defer rows.Close()

	items := []domainVerdictItem{}
	for rows.Next() {
		var it domainVerdictItem
		if err := rows.Scan(&it.ID, &it.Domain, &it.Verdict, &it.Category, &it.Source, &it.Reason, &it.CreatedAt, &it.UpdatedAt); err == nil {
			items = append(items, it)
		}
	}
	c.JSON(http.StatusOK, items)
}

type upsertDomainVerdictRequest struct {
	Domain   string `json:"domain" binding:"required,max=255"`
	Verdict  string `json:"verdict" binding:"required,oneof=allowed blocked"`
	Category string `json:"category" binding:"omitempty,oneof=judi_online konten_dewasa lainnya"`
	Reason   string `json:"reason" binding:"omitempty,max=500"`
}

// UpsertDomainVerdict — override manual admin: langsung memblokir/
// mengizinkan satu domain (mis. domain baru yang jelas judol tapi belum
// sempat dicoba kreator mana pun, ATAU membatalkan false-positive AI/kata
// kunci). source selalu "manual" supaya beda dari cache otomatis di
// tampilan admin.
func (h *AdminHandler) UpsertDomainVerdict(c *gin.Context) {
	adminID := c.GetString("userID")

	var req upsertDomainVerdictRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	if req.Verdict == "blocked" && req.Category == "" {
		req.Category = "lainnya"
	}
	domain := normalizeModerationDomain(strings.TrimSpace(req.Domain))
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain tidak boleh kosong"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var categoryVal any
	if req.Category != "" {
		categoryVal = req.Category
	}
	var reasonVal any
	if req.Reason != "" {
		reasonVal = req.Reason
	}

	id := uuid.NewString()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO link_domain_verdicts (id, domain, verdict, category, source, reason, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 'manual', $5, now(), now())
		ON CONFLICT (domain) DO UPDATE SET verdict = $3, category = $4, source = 'manual', reason = $5, updated_at = now()
	`, id, domain, req.Verdict, categoryVal, reasonVal); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan reputasi domain"})
		return
	}
	_ = audit.Log(ctx, h.DB, adminID, "domain_verdict."+req.Verdict, "link_domain_verdict", domain, nil)

	c.JSON(http.StatusOK, gin.H{"domain": domain, "verdict": req.Verdict})
}

// DeleteDomainVerdict — hapus entri reputasi (mis. override manual yang
// sudah tidak relevan) supaya domain itu dievaluasi ulang dari awal
// (kata kunci lalu AI) di percobaan berikutnya.
func (h *AdminHandler) DeleteDomainVerdict(c *gin.Context) {
	id := c.Param("id")
	adminID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM link_domain_verdicts WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus reputasi domain"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "entri tidak ditemukan"})
		return
	}
	_ = audit.Log(ctx, h.DB, adminID, "domain_verdict.deleted", "link_domain_verdict", id, nil)

	c.JSON(http.StatusOK, gin.H{"message": "entri dihapus"})
}

type trafficSourceRow struct {
	UtmSource   string `json:"utm_source"`
	UtmMedium   string `json:"utm_medium"`
	UtmCampaign string `json:"utm_campaign"`
	Views       int64  `json:"views"`
	Clicks      int64  `json:"clicks"`
}

type trafficSourcesResponse struct {
	// TotalViews/ViewsWithUTM -- konteks cepat SEBELUM tabel breakdown:
	// berapa persen trafik dalam rentang ini yang benar-benar bawa tag
	// kampanye, vs organik/langsung/referrer tanpa UTM sama sekali.
	TotalViews   int64              `json:"total_views"`
	ViewsWithUTM int64              `json:"views_with_utm"`
	RangeDays    int                `json:"range_days"`
	Sources      []trafficSourceRow `json:"sources"`
	HasMore      bool               `json:"has_more"`
}

// ListTrafficSources — permintaan langsung pengguna, 15 September 2026
// ("untuk sumber trafic misal seperti dari facebook ig dan lain lain
// apakah itu sudah bisa tercatat atau di tracking untuk admin"): breakdown
// utm_source/medium/campaign PLATFORM-WIDE (lintas SEMUA kreator, bukan
// per-page seperti top_referrers milik kreator di computeSummary) --
// SEBELUM ini UTM masuk cuma diteruskan ke Facebook Conversions API/GA4
// milik kreator sendiri (maybeSendConversionsEvent), tidak pernah
// tersimpan/terlihat di mana pun di dalam Jeonme sendiri. Lihat migrasi
// 000101 utk penyimpanannya.
//
// Sengaja HANYA baris dengan utm_source terisi yang masuk tabel breakdown
// (WHERE utm_source != '') -- trafik organik/direct/referrer-tanpa-UTM
// diringkas jadi satu angka (TotalViews - ViewsWithUTM) di atas tabel,
// bukan dipaksa masuk satu baris "(direct/organic)" yang medium/campaign-
// nya selalu kosong dan cuma mengotori pagination. resolveDateRange sama
// persis dgn AnalyticsHandler.GetSummary (analytics.go) -- ?range_days=N
// ATAU ?from&to eksplisit.
func (h *AdminHandler) ListTrafficSources(c *gin.Context) {
	from, to, rangeDays, err := resolveDateRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	limit, offset := parseLimitOffset(c)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	resp := trafficSourcesResponse{RangeDays: rangeDays, Sources: []trafficSourceRow{}}
	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE event_type = 'view'),
			COUNT(*) FILTER (WHERE event_type = 'view' AND utm_source != '')
		FROM analytics_events WHERE created_at BETWEEN $1 AND $2
	`, from, to).Scan(&resp.TotalViews, &resp.ViewsWithUTM); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung total trafik"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT utm_source, utm_medium, utm_campaign,
			COUNT(*) FILTER (WHERE event_type = 'view') AS views,
			COUNT(*) FILTER (WHERE event_type = 'click') AS clicks
		FROM analytics_events
		WHERE created_at BETWEEN $1 AND $2 AND utm_source != ''
		GROUP BY utm_source, utm_medium, utm_campaign
		ORDER BY views DESC
		LIMIT $3 OFFSET $4
	`, from, to, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat sumber trafik"})
		return
	}
	defer rows.Close()

	for rows.Next() {
		var row trafficSourceRow
		if err := rows.Scan(&row.UtmSource, &row.UtmMedium, &row.UtmCampaign, &row.Views, &row.Clicks); err == nil {
			resp.Sources = append(resp.Sources, row)
		}
	}
	resp.HasMore = len(resp.Sources) == limit

	c.JSON(http.StatusOK, resp)
}
