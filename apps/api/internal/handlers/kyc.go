package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/audit"
	"github.com/jeonme/api/internal/storage"
)

// KycHandler mengimplementasikan No.84 (Sprint 10): verifikasi rekening
// (KYC dasar) sebagai syarat pencairan diproses lebih cepat. Checklist &
// alur mengikuti pola Lynk.id (diverifikasi lewat FAQ resmi mereka): nama
// KTP harus sama dengan nama rekening bank, foto KTP, foto selfie pegang
// KTP, bukti rekening (buku tabungan/e-statement), alamat domisili, dan
// penjelasan bisnis+kanal promosi. Halaman kreator wajib sudah punya
// minimal 1 produk aktif sebelum bisa mengajukan (syarat sama seperti
// Lynk.id).
//
// PENTING (per catatan riset kompetitor): akun yang BELUM terverifikasi
// TETAP bisa berjualan & menarik dana -- KYC di sini TIDAK memblokir sama
// sekali, hanya dipakai admin untuk memprioritaskan proses penarikan
// (lihat kolom kyc_status_at_request di BalanceHandler.CreatePayout).
// Proses disbursement itu sendiri masih 100% manual (belum ada integrasi
// API pencairan sungguhan), jadi "instan vs lambat" di sini berarti admin
// memproses verified duluan, bukan otomasi teknis penuh.
type KycHandler struct {
	DB      *pgxpool.Pool
	Storage *storage.Client
}

func NewKycHandler(db *pgxpool.Pool, s3 *storage.Client) *KycHandler {
	return &KycHandler{DB: db, Storage: s3}
}

const maxKycDocSize = 10 * 1024 * 1024

var allowedKycImageExt = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}
var allowedKycProofExt = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".pdf": true}

type kycResponse struct {
	Status              string     `json:"status"`
	FullNameKtp         string     `json:"full_name_ktp"`
	BankAccountName     string     `json:"bank_account_name"`
	DomicileAddress     string     `json:"domicile_address"`
	BusinessDescription string     `json:"business_description"`
	PromotionChannels   string     `json:"promotion_channels"`
	HasKtpPhoto         bool       `json:"has_ktp_photo"`
	HasSelfiePhoto      bool       `json:"has_selfie_photo"`
	HasBankProof        bool       `json:"has_bank_proof"`
	RejectionReason     string     `json:"rejection_reason,omitempty"`
	SubmittedAt         *time.Time `json:"submitted_at,omitempty"`
	ReviewedAt          *time.Time `json:"reviewed_at,omitempty"`
}

// Get — dipakai halaman pengaturan dashboard. Belum-pernah-mengajukan
// mengembalikan state kosong (status="unverified"), bukan 404.
func (h *KycHandler) Get(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.getFor(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat status KYC"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *KycHandler) getFor(ctx context.Context, userID string) (kycResponse, error) {
	var resp kycResponse
	var ktpKey, selfieKey, bankProofKey string
	err := h.DB.QueryRow(ctx, `
		SELECT status, full_name_ktp, bank_account_name, domicile_address, business_description,
		       promotion_channels, ktp_photo_key, selfie_photo_key, bank_proof_key, rejection_reason,
		       submitted_at, reviewed_at
		FROM kyc_verifications WHERE user_id = $1
	`, userID).Scan(
		&resp.Status, &resp.FullNameKtp, &resp.BankAccountName, &resp.DomicileAddress, &resp.BusinessDescription,
		&resp.PromotionChannels, &ktpKey, &selfieKey, &bankProofKey, &resp.RejectionReason,
		&resp.SubmittedAt, &resp.ReviewedAt,
	)
	if err == pgx.ErrNoRows {
		resp.Status = "unverified"
		return resp, nil
	}
	if err != nil {
		return kycResponse{}, err
	}
	resp.HasKtpPhoto = ktpKey != ""
	resp.HasSelfiePhoto = selfieKey != ""
	resp.HasBankProof = bankProofKey != ""
	return resp, nil
}

// Submit — REQ pengajuan KYC. Multipart form: field teks (full_name_ktp,
// bank_account_name, domicile_address, business_description,
// promotion_channels) + 3 file (ktp_photo, selfie_photo, bank_proof).
// Boleh diajukan ulang dari status "unverified" atau "rejected" (reset ke
// "pending"), TAPI ditolak kalau statusnya masih "pending" (menunggu
// review) atau sudah "verified" (harus dilepas dulu lewat kontak admin --
// belum ada endpoint self-service untuk melepas verifikasi, sengaja,
// supaya tidak disalahgunakan untuk "reset" status verified berulang-ulang).
func (h *KycHandler) Submit(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	var currentStatus string
	err := h.DB.QueryRow(ctx, `SELECT status FROM kyc_verifications WHERE user_id = $1`, userID).Scan(&currentStatus)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa status KYC"})
		return
	}
	if currentStatus == "pending" {
		c.JSON(http.StatusConflict, gin.H{"error": "pengajuan KYC sebelumnya masih menunggu review"})
		return
	}
	if currentStatus == "verified" {
		c.JSON(http.StatusConflict, gin.H{"error": "akun sudah terverifikasi"})
		return
	}

	var activeProductCount int
	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM products WHERE user_id = $1 AND is_active = true
	`, userID).Scan(&activeProductCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa produk"})
		return
	}
	if activeProductCount < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "halaman harus punya minimal 1 produk aktif sebelum mengajukan KYC"})
		return
	}

	fullNameKtp := strings.TrimSpace(c.PostForm("full_name_ktp"))
	bankAccountName := strings.TrimSpace(c.PostForm("bank_account_name"))
	domicileAddress := strings.TrimSpace(c.PostForm("domicile_address"))
	businessDescription := strings.TrimSpace(c.PostForm("business_description"))
	promotionChannels := strings.TrimSpace(c.PostForm("promotion_channels"))

	if fullNameKtp == "" || bankAccountName == "" || domicileAddress == "" || businessDescription == "" || promotionChannels == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "semua kolom teks wajib diisi"})
		return
	}

	ktpKey, err := h.uploadKycDoc(ctx, userID, c, "ktp_photo", "ktp", allowedKycImageExt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	selfieKey, err := h.uploadKycDoc(ctx, userID, c, "selfie_photo", "selfie", allowedKycImageExt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	bankProofKey, err := h.uploadKycDoc(ctx, userID, c, "bank_proof", "bank-proof", allowedKycProofExt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO kyc_verifications (
			id, user_id, status, full_name_ktp, bank_account_name, domicile_address, business_description,
			promotion_channels, ktp_photo_key, selfie_photo_key, bank_proof_key, rejection_reason,
			submitted_at, reviewed_at, reviewed_by, updated_at
		) VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, '', now(), NULL, NULL, now())
		ON CONFLICT (user_id) DO UPDATE SET
			status = 'pending', full_name_ktp = $3, bank_account_name = $4, domicile_address = $5,
			business_description = $6, promotion_channels = $7, ktp_photo_key = $8, selfie_photo_key = $9,
			bank_proof_key = $10, rejection_reason = '', submitted_at = now(), reviewed_at = NULL,
			reviewed_by = NULL, updated_at = now()
	`, uuid.NewString(), userID, fullNameKtp, bankAccountName, domicileAddress, businessDescription,
		promotionChannels, ktpKey, selfieKey, bankProofKey); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pengajuan KYC"})
		return
	}

	metadata, _ := json.Marshal(gin.H{"full_name_ktp": fullNameKtp})
	_ = audit.Log(ctx, h.DB, userID, "kyc.submitted", "kyc_verification", userID, metadata)

	c.JSON(http.StatusOK, gin.H{"message": "pengajuan KYC diterima, akan direview dalam 3x24 jam hari kerja"})
}

func (h *KycHandler) uploadKycDoc(ctx context.Context, userID string, c *gin.Context, field, keyName string, allowedExt map[string]bool) (string, error) {
	fileHeader, err := c.FormFile(field)
	if err != nil {
		return "", fmt.Errorf("file %q wajib diunggah", field)
	}
	if fileHeader.Size > maxKycDocSize {
		return "", fmt.Errorf("ukuran file %q melebihi 10MB", field)
	}
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !allowedExt[ext] {
		return "", fmt.Errorf("tipe file %q tidak diizinkan untuk %q", ext, field)
	}
	file, err := fileHeader.Open()
	if err != nil {
		return "", fmt.Errorf("gagal membaca file %q", field)
	}
	defer file.Close()

	key := fmt.Sprintf("kyc/%s/%s%s", userID, keyName, ext)
	contentType := fileHeader.Header.Get("Content-Type")
	if err := h.Storage.Upload(ctx, key, file, fileHeader.Size, contentType); err != nil {
		return "", fmt.Errorf("gagal mengunggah file %q", field)
	}
	return key, nil
}

type adminKycItem struct {
	UserID      string     `json:"user_id"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	Status      string     `json:"status"`
	FullNameKtp string     `json:"full_name_ktp"`
	SubmittedAt *time.Time `json:"submitted_at,omitempty"`
}

// AdminList — daftar pengajuan KYC lintas kreator. Default filter ke
// "pending" (yang perlu ditindak) -- kirim ?status=all untuk riwayat penuh.
func (h *KycHandler) AdminList(c *gin.Context) {
	status := c.DefaultQuery("status", "pending")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT k.user_id, u.username, u.email, k.status, k.full_name_ktp, k.submitted_at
		FROM kyc_verifications k JOIN users u ON u.id = k.user_id
	`
	args := []any{}
	if status != "all" {
		query += ` WHERE k.status = $1`
		args = append(args, status)
	}
	query += ` ORDER BY k.submitted_at ASC NULLS LAST LIMIT 200`

	rows, err := h.DB.Query(ctx, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat daftar KYC"})
		return
	}
	defer rows.Close()

	items := []adminKycItem{}
	for rows.Next() {
		var it adminKycItem
		if err := rows.Scan(&it.UserID, &it.Username, &it.Email, &it.Status, &it.FullNameKtp, &it.SubmittedAt); err == nil {
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, items)
}

type adminKycDetailResponse struct {
	adminKycItem
	BankAccountName     string `json:"bank_account_name"`
	DomicileAddress     string `json:"domicile_address"`
	BusinessDescription string `json:"business_description"`
	PromotionChannels   string `json:"promotion_channels"`
	KtpPhotoURL         string `json:"ktp_photo_url,omitempty"`
	SelfiePhotoURL      string `json:"selfie_photo_url,omitempty"`
	BankProofURL        string `json:"bank_proof_url,omitempty"`
	RejectionReason     string `json:"rejection_reason,omitempty"`
}

// AdminGetDetail — detail satu pengajuan KYC termasuk URL presigned
// (kedaluwarsa 15 menit) ke tiap dokumen, supaya admin bisa membuka &
// memeriksa foto KTP/selfie/bukti rekening tanpa dokumen tersebut jadi
// dapat diakses publik permanen (data sensitif).
func (h *KycHandler) AdminGetDetail(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}

	targetUserID := c.Param("userId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var resp adminKycDetailResponse
	var ktpKey, selfieKey, bankProofKey string
	err := h.DB.QueryRow(ctx, `
		SELECT k.user_id, u.username, u.email, k.status, k.full_name_ktp, k.bank_account_name,
		       k.domicile_address, k.business_description, k.promotion_channels,
		       k.ktp_photo_key, k.selfie_photo_key, k.bank_proof_key, k.rejection_reason, k.submitted_at
		FROM kyc_verifications k JOIN users u ON u.id = k.user_id
		WHERE k.user_id = $1
	`, targetUserID).Scan(
		&resp.UserID, &resp.Username, &resp.Email, &resp.Status, &resp.FullNameKtp, &resp.BankAccountName,
		&resp.DomicileAddress, &resp.BusinessDescription, &resp.PromotionChannels,
		&ktpKey, &selfieKey, &bankProofKey, &resp.RejectionReason, &resp.SubmittedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "pengajuan KYC tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat detail KYC"})
		return
	}

	if ktpKey != "" {
		if u, err := h.Storage.PresignedDownloadURL(ctx, ktpKey, 15*time.Minute); err == nil {
			resp.KtpPhotoURL = u
		}
	}
	if selfieKey != "" {
		if u, err := h.Storage.PresignedDownloadURL(ctx, selfieKey, 15*time.Minute); err == nil {
			resp.SelfiePhotoURL = u
		}
	}
	if bankProofKey != "" {
		if u, err := h.Storage.PresignedDownloadURL(ctx, bankProofKey, 15*time.Minute); err == nil {
			resp.BankProofURL = u
		}
	}

	c.JSON(http.StatusOK, resp)
}

type reviewKycRequest struct {
	Status          string `json:"status" binding:"required,oneof=verified rejected"`
	RejectionReason string `json:"rejection_reason"`
}

// AdminReview — admin menyetujui/menolak pengajuan KYC. Hanya bisa
// memproses pengajuan yang statusnya masih "pending" -- mencegah admin
// (atau klik ganda) memproses ulang pengajuan yang sudah final.
func (h *KycHandler) AdminReview(c *gin.Context) {
	targetUserID := c.Param("userId")
	adminID := c.GetString("userID")

	var req reviewKycRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Status == "rejected" && strings.TrimSpace(req.RejectionReason) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "alasan penolakan wajib diisi"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		UPDATE kyc_verifications SET status = $1, rejection_reason = $2, reviewed_at = now(),
		       reviewed_by = $3, updated_at = now()
		WHERE user_id = $4 AND status = 'pending'
	`, req.Status, req.RejectionReason, adminID, targetUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memperbarui status KYC"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "pengajuan KYC tidak ditemukan atau sudah diproses"})
		return
	}

	metadata, _ := json.Marshal(gin.H{"status": req.Status, "rejection_reason": req.RejectionReason, "reviewed_by": adminID})
	_ = audit.Log(ctx, h.DB, targetUserID, "kyc."+req.Status, "kyc_verification", targetUserID, metadata)

	c.JSON(http.StatusOK, gin.H{"message": "status KYC diperbarui"})
}
