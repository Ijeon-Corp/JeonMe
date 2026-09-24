package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AffiliateHandler mengimplementasikan No.72 (Sprint 7): program afiliasi.
// Versi awal sengaja mode PRIVAT saja (kreator undang afiliator yang sudah
// jadi pengguna Jeonme lewat email, komisi custom per produk) -- marketplace
// afiliasi publik lintas kreator dicatat sebagai pekerjaan lanjutan di
// backlog kalau permintaannya tervalidasi.
//
// Satu baris affiliates = satu hubungan kreator<->afiliator (dengan SATU
// referral_code untuk semuanya), sedangkan komisi per produk ada di tabel
// terpisah affiliate_commissions -- satu afiliator bisa punya komisi beda
// untuk tiap produk kreator yang sama.
type AffiliateHandler struct {
	DB           *pgxpool.Pool
	PublicWebURL string
	// PlatformFeePercent -- lihat catatan panjang di
	// collaborator_split.go/validateCollaboratorSplits (audit 4 September
	// 2026): dipakai di sini utk arah SEBALIKNYA -- validasi komisi
	// afiliasi baru harus tahu produk yang sama sudah "menjatah" berapa
	// persen ke split kolaborator, supaya keduanya + biaya platform tidak
	// pernah lebih dari 100% dari amount yang sama.
	PlatformFeePercent float64
}

func NewAffiliateHandler(db *pgxpool.Pool, publicWebURL string, platformFeePercent float64) *AffiliateHandler {
	return &AffiliateHandler{DB: db, PublicWebURL: publicWebURL, PlatformFeePercent: platformFeePercent}
}

// collaboratorSplitsTotalPercent -- total persen split kolaborator yang
// SUDAH aktif di satu produk (products.collaborator_splits, jsonb -- lihat
// CollaboratorSplit di collaborator_split.go). Dipakai sebagai batas bawah
// "jatah" yang tersisa saat memvalidasi komisi afiliasi baru.
func collaboratorSplitsTotalPercent(ctx context.Context, db *pgxpool.Pool, productID string) (float64, error) {
	var raw []byte
	if err := db.QueryRow(ctx, `SELECT COALESCE(collaborator_splits, '[]') FROM products WHERE id = $1`, productID).Scan(&raw); err != nil {
		return 0, err
	}
	var splits []CollaboratorSplit
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &splits); err != nil {
			return 0, err
		}
	}
	var total float64
	for _, s := range splits {
		total += s.Percent
	}
	return total, nil
}

type upsertAffiliateRequest struct {
	AffiliateEmail    string  `json:"affiliate_email" binding:"required,email"`
	ProductID         string  `json:"product_id" binding:"required"`
	CommissionPercent float64 `json:"commission_percent" binding:"required,min=0.01,max=100"`
}

// Upsert — mengundang afiliator (kalau belum pernah diundang kreator ini
// sebelumnya) sekaligus mengatur/memperbarui komisi untuk SATU produk.
// Dipanggil ulang dengan product_id berbeda untuk menambah komisi produk
// lain ke afiliator yang sama -- referral_code tetap satu untuk semuanya.
func (h *AffiliateHandler) Upsert(c *gin.Context) {
	// Komisi afiliasi = pengarahan uang, jadi tidak boleh lewat impersonasi
	// kolaborator -- lihat catatan lengkap di
	// blockMoneyRoutingByCollaborator (collaborator_split.go). Tanpa ini,
	// kolaborator ber-izin produk bisa mendaftarkan emailnya SENDIRI dengan
	// commission_percent 100 (penjaga di bawah cuma menolak kalau sama
	// dengan creatorUserID, yang di bawah impersonasi sudah bernilai ID
	// pemilik). Endpoint BACA afiliasi (ListMine/ListPrograms) sengaja tidak
	// ikut digerbang -- melihat program bukan mengarahkan uang.
	if blockMoneyRoutingByCollaborator(c) {
		return
	}

	var req upsertAffiliateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}

	creatorUserID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var affiliateUserID string
	if err := h.DB.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`,
		strings.ToLower(strings.TrimSpace(req.AffiliateEmail))).Scan(&affiliateUserID); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "belum ada pengguna Jeonme dengan email tersebut"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencari afiliator"})
		return
	}
	if affiliateUserID == creatorUserID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tidak bisa mengundang diri sendiri sebagai afiliator"})
		return
	}
	// Jaring KEDUA di bawah blockMoneyRoutingByCollaborator di atas: pemanggil
	// ASLI tidak boleh jadi afiliator, walau creatorUserID sudah berbeda
	// dengannya. Tidak tercapai lewat HTTP hari ini (impersonasi sudah
	// ditolak di awal fungsi) -- dipertahankan supaya celah yang sama tidak
	// terbuka lagi diam-diam kalau rute ini suatu saat diekspos ulang.
	if actorUserID := c.GetString("actorUserID"); actorUserID != "" && affiliateUserID == actorUserID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tidak bisa mengundang diri sendiri sebagai afiliator"})
		return
	}

	var productOwnerID string
	if err := h.DB.QueryRow(ctx, `SELECT user_id FROM products WHERE id = $1`, req.ProductID).Scan(&productOwnerID); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}
	if productOwnerID != creatorUserID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "produk ini bukan milikmu"})
		return
	}

	// Audit 4 September 2026: lihat catatan panjang di
	// collaborator_split.go/validateCollaboratorSplits -- komisi afiliasi +
	// split kolaborator + biaya platform tidak boleh lebih dari 100% dari
	// amount yang sama, atau bagian kreator sendiri bisa jadi negatif saat
	// checkout.
	collaboratorTotal, err := collaboratorSplitsTotalPercent(ctx, h.DB, req.ProductID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa split kolaborator produk"})
		return
	}
	if req.CommissionPercent+collaboratorTotal+h.PlatformFeePercent > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf(
			"komisi afiliasi (%.2f%%) + split kolaborator produk ini (%.2f%%) + biaya platform (%.2f%%) melebihi 100%% -- kurangi salah satunya",
			req.CommissionPercent, collaboratorTotal, h.PlatformFeePercent,
		)})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var affiliateID string
	err = tx.QueryRow(ctx, `
		SELECT id FROM affiliates WHERE creator_user_id = $1 AND affiliate_user_id = $2
	`, creatorUserID, affiliateUserID).Scan(&affiliateID)
	if err == pgx.ErrNoRows {
		for attempt := 0; attempt < 5; attempt++ {
			code, genErr := generateVoucherCode()
			if genErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode referral"})
				return
			}
			insertErr := tx.QueryRow(ctx, `
				INSERT INTO affiliates (creator_user_id, affiliate_user_id, referral_code)
				VALUES ($1, $2, $3) RETURNING id
			`, creatorUserID, affiliateUserID, code).Scan(&affiliateID)
			if insertErr == nil {
				break
			}
			if isUniqueViolation(insertErr) && attempt < 4 {
				continue
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengundang afiliator"})
			return
		}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat afiliator"})
		return
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO affiliate_commissions (affiliate_id, product_id, commission_percent)
		VALUES ($1, $2, $3)
		ON CONFLICT (affiliate_id, product_id) DO UPDATE SET commission_percent = EXCLUDED.commission_percent
	`, affiliateID, req.ProductID, req.CommissionPercent); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan komisi"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan perubahan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "afiliator & komisi disimpan", "affiliate_id": affiliateID})
}

type affiliateProductCommission struct {
	ProductID         string  `json:"product_id"`
	ProductName       string  `json:"product_name"`
	CommissionPercent float64 `json:"commission_percent"`
}

type myAffiliateItem struct {
	ID              string                       `json:"id"`
	AffiliateEmail  string                       `json:"affiliate_email"`
	ReferralCode    string                       `json:"referral_code"`
	ReferralBaseURL string                       `json:"referral_base_url"`
	Commissions     []affiliateProductCommission `json:"commissions"`
}

// ListMine — daftar afiliator yang SUDAH diundang kreator yang login,
// beserta komisi per produk & tautan referral siap-pakai (kreator tinggal
// menyalin, base URL-nya sudah pakai username kreator sendiri).
func (h *AffiliateHandler) ListMine(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var username string
	if err := h.DB.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&username); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat data kreator"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT a.id, u.email, a.referral_code
		FROM affiliates a JOIN users u ON u.id = a.affiliate_user_id
		WHERE a.creator_user_id = $1
		ORDER BY a.created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat afiliator"})
		return
	}
	defer rows.Close()

	items := []myAffiliateItem{}
	for rows.Next() {
		var it myAffiliateItem
		if err := rows.Scan(&it.ID, &it.AffiliateEmail, &it.ReferralCode); err == nil {
			// Email mitra afiliasi pemilik disamarkan untuk kolaborator --
			// lihat maskEmailForCollaborator (collaborator_split.go).
			it.AffiliateEmail = maskEmailForCollaborator(c, it.AffiliateEmail)
			it.ReferralBaseURL = h.PublicWebURL + "/" + username
			items = append(items, it)
		}
	}

	for i := range items {
		items[i].Commissions = h.loadCommissions(ctx, items[i].ID)
	}

	c.JSON(http.StatusOK, items)
}

func (h *AffiliateHandler) loadCommissions(ctx context.Context, affiliateID string) []affiliateProductCommission {
	rows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, ac.commission_percent
		FROM affiliate_commissions ac JOIN products p ON p.id = ac.product_id
		WHERE ac.affiliate_id = $1
		ORDER BY p.name
	`, affiliateID)
	if err != nil {
		return []affiliateProductCommission{}
	}
	defer rows.Close()

	out := []affiliateProductCommission{}
	for rows.Next() {
		var it affiliateProductCommission
		if err := rows.Scan(&it.ProductID, &it.ProductName, &it.CommissionPercent); err == nil {
			out = append(out, it)
		}
	}
	return out
}

type affiliateProgramItem struct {
	ID              string                       `json:"id"`
	CreatorUsername string                       `json:"creator_username"`
	ReferralCode    string                       `json:"referral_code"`
	ReferralURL     string                       `json:"referral_url"`
	Commissions     []affiliateProductCommission `json:"commissions"`
}

// ListPrograms — daftar program afiliasi yang DIIKUTI pengguna yang login
// (dia diundang kreator lain sebagai afiliator), lengkap dengan tautan
// referral siap-pakai per kreator.
func (h *AffiliateHandler) ListPrograms(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT a.id, u.username, a.referral_code
		FROM affiliates a JOIN users u ON u.id = a.creator_user_id
		WHERE a.affiliate_user_id = $1
		ORDER BY a.created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat program afiliasi"})
		return
	}
	defer rows.Close()

	items := []affiliateProgramItem{}
	for rows.Next() {
		var it affiliateProgramItem
		if err := rows.Scan(&it.ID, &it.CreatorUsername, &it.ReferralCode); err == nil {
			it.ReferralURL = h.PublicWebURL + "/" + it.CreatorUsername + "?ref=" + it.ReferralCode
			items = append(items, it)
		}
	}

	for i := range items {
		items[i].Commissions = h.loadCommissions(ctx, items[i].ID)
	}

	c.JSON(http.StatusOK, items)
}

// Revoke — mencabut seluruh hubungan afiliasi (semua komisi produk ikut
// terhapus lewat ON DELETE CASCADE). Hanya kreator yang mengundang yang
// boleh mencabut.
func (h *AffiliateHandler) Revoke(c *gin.Context) {
	affiliateID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM affiliates WHERE id = $1 AND creator_user_id = $2`, affiliateID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mencabut afiliator"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "afiliator tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "afiliator dicabut"})
}

// RemoveCommission — menghapus komisi SATU produk dari afiliator tanpa
// mencabut seluruh hubungan (referral_code tetap berlaku untuk produk lain
// yang masih ada komisinya).
func (h *AffiliateHandler) RemoveCommission(c *gin.Context) {
	affiliateID := c.Param("id")
	productID := c.Param("productId")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var ownerID string
	if err := h.DB.QueryRow(ctx, `SELECT creator_user_id FROM affiliates WHERE id = $1`, affiliateID).Scan(&ownerID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "afiliator tidak ditemukan"})
		return
	}
	if ownerID != userID {
		c.JSON(http.StatusNotFound, gin.H{"error": "afiliator tidak ditemukan"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		DELETE FROM affiliate_commissions WHERE affiliate_id = $1 AND product_id = $2
	`, affiliateID, productID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus komisi"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "komisi dihapus"})
}

// resolveAffiliate -- No.72: dipanggil checkout.Create untuk kode referral
// opsional. Kode yang salah/tidak cocok dengan produk (bukan bagian dari
// program afiliasi produk ini) SENGAJA diabaikan diam-diam (checkout tetap
// jalan tanpa komisi), bukan menolak pembelian -- ref link basi/salah tidak
// boleh memblokir pembeli.
func resolveAffiliate(ctx context.Context, db *pgxpool.Pool, referralCode, productID string) (affiliateID, affiliateUserID string, commissionPercent float64, ok bool) {
	if referralCode == "" {
		return "", "", 0, false
	}
	err := db.QueryRow(ctx, `
		SELECT a.id, a.affiliate_user_id, ac.commission_percent
		FROM affiliates a
		JOIN affiliate_commissions ac ON ac.affiliate_id = a.id
		JOIN products p ON p.id = ac.product_id
		WHERE a.referral_code = $1 AND ac.product_id = $2 AND p.user_id = a.creator_user_id
	`, referralCode, productID).Scan(&affiliateID, &affiliateUserID, &commissionPercent)
	if err != nil {
		return "", "", 0, false
	}
	return affiliateID, affiliateUserID, commissionPercent, true
}

// ---------- Marketplace afiliasi publik ----------
//
// Benchmark Linktree "Earn > Affiliate Products" (3 September 2026). Mode
// privat di atas (kreator mengundang) tetap ada; marketplace menambah jalur
// kedua: pemilik produk MEMBUKA produknya dengan satu komisi standar
// (migrasi 000084), afiliator mana pun bisa bergabung sendiri. Join
// menghasilkan baris affiliates + affiliate_commissions yang PERSIS sama
// dengan undangan privat, jadi checkout/ledger tidak tahu bedanya.

type affiliatePublicProduct struct {
	ProductID         string  `json:"product_id"`
	Name              string  `json:"name"`
	IsActive          bool    `json:"is_active"`
	Public            bool    `json:"affiliate_public"`
	CommissionPercent float64 `json:"commission_percent"`
}

// ListMyPublicProducts -- produk milik sendiri beserta status buka/tutup
// marketplace. Endpoint kecil tersendiri (bukan menambah kolom ke daftar
// produk umum) supaya handler produk yang besar tidak perlu disentuh.
func (h *AffiliateHandler) ListMyPublicProducts(c *gin.Context) {
	userID := c.GetString("userID")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, name, is_active, affiliate_public, affiliate_public_commission_percent
		FROM products WHERE user_id = $1 ORDER BY name
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat produk"})
		return
	}
	defer rows.Close()
	out := []affiliatePublicProduct{}
	for rows.Next() {
		var it affiliatePublicProduct
		if err := rows.Scan(&it.ProductID, &it.Name, &it.IsActive, &it.Public, &it.CommissionPercent); err == nil {
			out = append(out, it)
		}
	}
	c.JSON(http.StatusOK, out)
}

type setProductPublicRequest struct {
	Enabled           bool    `json:"enabled"`
	CommissionPercent float64 `json:"commission_percent"`
}

// SetProductPublic -- buka/tutup satu produk untuk marketplace. Komisi
// wajib 0.01-100 saat dibuka; saat ditutup komisi dibiarkan (supaya kalau
// dibuka lagi nilainya tidak hilang). Afiliator yang SUDAH bergabung tetap
// punya komisinya sendiri di affiliate_commissions -- menutup marketplace
// tidak memutus hubungan yang sudah terbentuk, sama seperti mencabut
// undangan harus eksplisit lewat Revoke.
func (h *AffiliateHandler) SetProductPublic(c *gin.Context) {
	userID := c.GetString("userID")
	productID := c.Param("productId")
	var req setProductPublicRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "payload tidak valid"})
		return
	}
	if req.Enabled && (req.CommissionPercent < 0.01 || req.CommissionPercent > 100) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "komisi harus antara 0.01% dan 100%"})
		return
	}
	// Menetapkan komisi marketplace publik juga pengarahan uang (audit 24
	// September 2026, jalur sejenis dengan Upsert di atas): kolaborator bisa
	// menyetel komisi 100% lalu mengambil sendiri tautan afiliasi produk itu
	// -- hasilnya sama dengan mengalihkan seluruh pendapatan ke dirinya.
	// Digerbang HANYA saat req.Enabled: MEMATIKAN produk dari marketplace
	// tidak mengarahkan uang ke mana pun, jadi keputusan lama "boleh
	// kolaborator ber-akses produk" (lihat komentar rutenya di routes.go)
	// tetap berlaku untuk sisi itu.
	if req.Enabled && blockMoneyRoutingByCollaborator(c) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// Audit 4 September 2026: lihat catatan panjang di
	// collaborator_split.go/validateCollaboratorSplits -- dicek lewat query
	// yang SAMA (WHERE id = $1 AND user_id = $2) yang nanti dipakai UPDATE
	// di bawah, supaya tidak membuka info split kolaborator produk ORANG
	// LAIN lewat pesan error (produk yang bukan milik pemanggil harus tetap
	// 404, bukan 400 dengan detail persen).
	if req.Enabled {
		var collaboratorTotal float64
		var raw []byte
		if err := h.DB.QueryRow(ctx, `
			SELECT COALESCE(collaborator_splits, '[]') FROM products WHERE id = $1 AND user_id = $2
		`, productID, userID).Scan(&raw); err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa split kolaborator produk"})
			return
		}
		var splits []CollaboratorSplit
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &splits); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca split kolaborator produk"})
				return
			}
		}
		for _, s := range splits {
			collaboratorTotal += s.Percent
		}
		if req.CommissionPercent+collaboratorTotal+h.PlatformFeePercent > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf(
				"komisi afiliasi (%.2f%%) + split kolaborator produk ini (%.2f%%) + biaya platform (%.2f%%) melebihi 100%% -- kurangi salah satunya",
				req.CommissionPercent, collaboratorTotal, h.PlatformFeePercent,
			)})
			return
		}
	}

	var tag pgconn.CommandTag
	var err error
	if req.Enabled {
		tag, err = h.DB.Exec(ctx, `
			UPDATE products SET affiliate_public = true, affiliate_public_commission_percent = $3
			WHERE id = $1 AND user_id = $2
		`, productID, userID, req.CommissionPercent)
	} else {
		tag, err = h.DB.Exec(ctx, `UPDATE products SET affiliate_public = false WHERE id = $1 AND user_id = $2`, productID, userID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pengaturan marketplace"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type marketplaceItem struct {
	ProductID         string  `json:"product_id"`
	Name              string  `json:"name"`
	PriceIDR          int64   `json:"price_idr"`
	CoverImageURL     string  `json:"cover_image_url"`
	CreatorUsername   string  `json:"creator_username"`
	CommissionPercent float64 `json:"commission_percent"`
	Joined            bool    `json:"joined"`
	ReferralURL       string  `json:"referral_url,omitempty"`
}

// ListMarketplace -- produk kreator LAIN yang dibuka untuk afiliator.
// Produk sendiri dikecualikan (tidak masuk akal mengafiliasi diri sendiri
// -- dan resolveAffiliate() memang mensyaratkan p.user_id = a.creator_user_id
// yang berbeda dari afiliator). Untuk yang sudah bergabung, tautan
// referral ikut dikirim supaya UI tidak perlu panggilan kedua.
func (h *AffiliateHandler) ListMarketplace(c *gin.Context) {
	userID := c.GetString("userID")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, p.price_idr, COALESCE(p.cover_image_url, ''), u.username,
		       p.affiliate_public_commission_percent,
		       COALESCE((
		           SELECT a.referral_code FROM affiliates a
		           JOIN affiliate_commissions ac ON ac.affiliate_id = a.id
		           WHERE a.affiliate_user_id = $1 AND a.creator_user_id = p.user_id AND ac.product_id = p.id
		           LIMIT 1
		       ), '') AS my_code
		FROM products p
		JOIN users u ON u.id = p.user_id
		WHERE p.affiliate_public = true AND p.is_active = true AND p.user_id <> $1
		ORDER BY p.affiliate_public_commission_percent DESC, p.name ASC
		LIMIT 200
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat marketplace"})
		return
	}
	defer rows.Close()
	out := []marketplaceItem{}
	for rows.Next() {
		var it marketplaceItem
		var code string
		if err := rows.Scan(&it.ProductID, &it.Name, &it.PriceIDR, &it.CoverImageURL, &it.CreatorUsername, &it.CommissionPercent, &code); err != nil {
			continue
		}
		if code != "" {
			it.Joined = true
			it.ReferralURL = h.PublicWebURL + "/" + it.CreatorUsername + "?ref=" + code
		}
		out = append(out, it)
	}
	c.JSON(http.StatusOK, out)
}

// JoinMarketplace -- afiliator mendaftar sendiri ke satu produk publik.
// Idempoten: bergabung dua kali cuma menyegarkan komisi ke nilai publik
// saat ini. Hubungan affiliates (satu per pasangan kreator<->afiliator,
// satu kode referral untuk semua produk kreator itu) dibuat kalau belum ada
// -- pola & retry kode SAMA dengan Upsert (undangan privat).
func (h *AffiliateHandler) JoinMarketplace(c *gin.Context) {
	userID := c.GetString("userID")
	productID := c.Param("productId")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()

	var ownerID, ownerUsername, productName string
	var isPublic, isActive bool
	var pct float64
	if err := h.DB.QueryRow(ctx, `
		SELECT p.user_id, u.username, p.name, p.affiliate_public, p.is_active, p.affiliate_public_commission_percent
		FROM products p JOIN users u ON u.id = p.user_id WHERE p.id = $1
	`, productID).Scan(&ownerID, &ownerUsername, &productName, &isPublic, &isActive, &pct); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "produk tidak ditemukan"})
		return
	}
	if ownerID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tidak bisa mengafiliasi produk sendiri"})
		return
	}
	if !isPublic || !isActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "produk ini tidak dibuka untuk afiliator"})
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memulai transaksi"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var affiliateID, code string
	err = tx.QueryRow(ctx, `
		SELECT id, referral_code FROM affiliates WHERE creator_user_id = $1 AND affiliate_user_id = $2
	`, ownerID, userID).Scan(&affiliateID, &code)
	if err == pgx.ErrNoRows {
		for attempt := 0; attempt < 5; attempt++ {
			newCode, genErr := generateVoucherCode()
			if genErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode referral"})
				return
			}
			insertErr := tx.QueryRow(ctx, `
				INSERT INTO affiliates (creator_user_id, affiliate_user_id, referral_code)
				VALUES ($1, $2, $3) RETURNING id
			`, ownerID, userID, newCode).Scan(&affiliateID)
			if insertErr == nil {
				code = newCode
				break
			}
			if attempt == 4 {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat kode referral unik"})
				return
			}
		}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat afiliasi"})
		return
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO affiliate_commissions (affiliate_id, product_id, commission_percent)
		VALUES ($1, $2, $3)
		ON CONFLICT (affiliate_id, product_id) DO UPDATE SET commission_percent = EXCLUDED.commission_percent
	`, affiliateID, productID, pct); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan komisi"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan afiliasi"})
		return
	}

	// Notifikasi ke pemilik produk -- soft-fail, bukan inti transaksi.
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO notifications (user_id, type, title, body, link_url)
		VALUES ($1, 'affiliate_joined', 'Afiliator baru bergabung', $2, '/dashboard/affiliates')
	`, ownerID, "Seseorang bergabung sebagai afiliator produk \""+productName+"\" lewat marketplace."); err != nil {
		log.Printf("affiliate: gagal membuat notifikasi join marketplace untuk %s: %v", ownerID, err)
	}

	c.JSON(http.StatusOK, gin.H{
		"referral_code":      code,
		"referral_url":       h.PublicWebURL + "/" + ownerUsername + "?ref=" + code,
		"commission_percent": pct,
	})
}
