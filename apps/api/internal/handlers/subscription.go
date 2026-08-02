package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jeonme/api/internal/midtrans"
)

// SubscriptionHandler -- Modul Langganan Premium (permintaan langsung
// pengguna 3 Agustus 2026: "custom background by user premium", hilangkan
// watermark untuk versi berbayar, langganan berulang bulanan/tahunan lewat
// Midtrans Subscription API). Harga BELUM keputusan bisnis final -- lihat
// PremiumMonthlyPriceIDR/PremiumYearlyPriceIDR (config.go, PLACEHOLDER
// dengan pola sama seperti PLATFORM_FEE_PERCENT), pengguna memilih siklus
// "Bulanan + Tahunan" tapi tidak menyebutkan angka pastinya.
//
// Alur (lihat juga catatan panjang di internal/midtrans/client.go):
//  1. Checkout -- bikin baris subscriptions (pending_card) + transaksi Snap
//     dengan kartu tersimpan (EnableSaveCard) untuk siklus PERTAMA.
//  2. Webhook pembayaran siklus pertama (order_id berawalan
//     enrollmentOrderIDPrefix) DITANGKAP LEBIH DULU oleh
//     checkout.go Webhook (lihat maybeHandleSubscriptionEnrollment), BUKAN
//     diproses sebagai order produk biasa -- begitu lunas, CreateSubscription
//     dipanggil dengan token kartu yang baru tersimpan.
//  3. Midtrans menagih otomatis tiap siklus berikutnya & mengirim notifikasi
//     KE ENDPOINT TERPISAH (Recurring Notification URL, beda dari Payment
//     Notification URL yang dipakai order biasa) -- lihat HandleCycleWebhook.
//     URL ini WAJIB didaftarkan manual di dashboard Midtrans (Settings >
//     Configuration > Recurring Notification URL) -- BUKAN sesuatu yang bisa
//     diatur lewat API, mirip keputusan bisnis WhatsApp Business API yang
//     juga butuh langkah manual di luar kode.
//
// CATATAN JUJUR (di luar cakupan v1 ini): hanya kartu kredit/debit yang
// didukung untuk penagihan berulang -- GoPay tokenization (jalur terpisah,
// beda API) TIDAK diimplementasikan, konsisten dengan disiplin "jangan
// setengah jadi" (lebih baik satu metode yang benar-benar berfungsi
// daripada dua metode yang keduanya rapuh).
type SubscriptionHandler struct {
	DB                *pgxpool.Pool
	Midtrans          *midtrans.Client
	MidtransServerKey string
	PublicWebURL      string
	MonthlyPriceIDR   int64
	YearlyPriceIDR    int64
}

func NewSubscriptionHandler(db *pgxpool.Pool, midtransClient *midtrans.Client, midtransServerKey, publicWebURL string, monthlyPriceIDR, yearlyPriceIDR int64) *SubscriptionHandler {
	return &SubscriptionHandler{
		DB: db, Midtrans: midtransClient, MidtransServerKey: midtransServerKey,
		PublicWebURL: publicWebURL, MonthlyPriceIDR: monthlyPriceIDR, YearlyPriceIDR: yearlyPriceIDR,
	}
}

// enrollmentOrderIDPrefix -- pembeda order_id transaksi PENDAFTARAN
// langganan dari order_id pembelian produk biasa ("jeonme-order-...") di
// webhook pembayaran yang SAMA (satu Payment Notification URL untuk semua
// transaksi Snap, tidak bisa dipisah per jenis lewat Midtrans). Lihat
// checkout.go Webhook.
//
// SENGAJA pendek ("jeonme-sub-", 11 karakter): Midtrans membatasi
// transaction_details.order_id maksimal 50 karakter TOTAL (dibuktikan lewat
// panggilan sandbox sungguhan saat menulis test -- prefix yang lebih
// deskriptif seperti "jeonme-sub-enroll-" (19 karakter) + UUID (36 karakter)
// = 55 karakter, DITOLAK Midtrans dengan "order_id is too long"). 11 + 36 =
// 47, aman di bawah batas.
const enrollmentOrderIDPrefix = "jeonme-sub-"

// isPremiumUser -- SATU-SATUNYA sumber kebenaran status premium, dipakai
// baik oleh GetMyPage/UpdateMyPage (dashboard, gating tema custom) maupun
// finishPublicPageResponse (halaman publik, gating watermark). "canceled"
// TETAP dihitung premium sampai current_period_end -- masa yang sudah
// dibayar tidak hilang begitu saja saat kreator berhenti berlangganan.
func isPremiumUser(ctx context.Context, db *pgxpool.Pool, userID string) bool {
	var isPremium bool
	_ = db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM subscriptions
			WHERE user_id = $1
				AND (status = 'active' OR (status = 'canceled' AND current_period_end > now()))
		)
	`, userID).Scan(&isPremium)
	return isPremium
}

type subscriptionStatusResponse struct {
	Plan             string  `json:"plan"`
	Status           string  `json:"status"`
	AmountIDR        int64   `json:"amount_idr"`
	CurrentPeriodEnd *string `json:"current_period_end"`
	IsPremium        bool    `json:"is_premium"`
	MonthlyPriceIDR  int64   `json:"monthly_price_idr"`
	YearlyPriceIDR   int64   `json:"yearly_price_idr"`
}

// GetStatus -- status langganan kreator yang sedang login + daftar harga
// (supaya frontend tidak perlu hardcode harga, satu sumber kebenaran).
func (h *SubscriptionHandler) GetStatus(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	resp := subscriptionStatusResponse{
		Plan: "free", Status: "none",
		MonthlyPriceIDR: h.MonthlyPriceIDR, YearlyPriceIDR: h.YearlyPriceIDR,
	}

	var currentPeriodEnd *time.Time
	err := h.DB.QueryRow(ctx, `
		SELECT plan, status, amount_idr, current_period_end FROM subscriptions
		WHERE user_id = $1
		ORDER BY created_at DESC LIMIT 1
	`, userID).Scan(&resp.Plan, &resp.Status, &resp.AmountIDR, &currentPeriodEnd)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat status langganan"})
		return
	}
	if currentPeriodEnd != nil {
		s := currentPeriodEnd.Format(time.RFC3339)
		resp.CurrentPeriodEnd = &s
	}
	resp.IsPremium = isPremiumUser(ctx, h.DB, userID)

	c.JSON(http.StatusOK, resp)
}

type checkoutSubscriptionRequest struct {
	Plan string `json:"plan" binding:"required,oneof=monthly yearly"`
}

// Checkout -- mulai pendaftaran langganan baru: bikin baris subscriptions
// (pending_card) + transaksi Snap siklus pertama dengan kartu tersimpan
// diaktifkan. Menolak kalau kreator SUDAH punya langganan hidup
// (pending_card/active/past_due) -- lihat index unik di migrasi 000043,
// dicek dulu di sini supaya pesan errornya jelas (bukan 500 dari constraint
// violation database).
func (h *SubscriptionHandler) Checkout(c *gin.Context) {
	var req checkoutSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var existingCount int
	if err := h.DB.QueryRow(ctx, `
		SELECT count(*) FROM subscriptions WHERE user_id = $1 AND status IN ('pending_card', 'active', 'past_due')
	`, userID).Scan(&existingCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memeriksa langganan yang sudah ada"})
		return
	}
	if existingCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "kamu sudah punya langganan aktif atau menunggu pembayaran"})
		return
	}

	var email string
	if err := h.DB.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat data akun"})
		return
	}

	amountIDR := h.MonthlyPriceIDR
	itemName := "Jeonme Premium (Bulanan)"
	if req.Plan == "yearly" {
		amountIDR = h.YearlyPriceIDR
		itemName = "Jeonme Premium (Tahunan)"
	}

	subscriptionID := uuid.NewString()
	enrollmentOrderID := enrollmentOrderIDPrefix + subscriptionID

	if _, err := h.DB.Exec(ctx, `
		INSERT INTO subscriptions (id, user_id, plan, amount_idr, status, enrollment_order_id)
		VALUES ($1, $2, $3, $4, 'pending_card', $5)
	`, subscriptionID, userID, req.Plan, amountIDR, enrollmentOrderID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat langganan"})
		return
	}

	txn, err := h.Midtrans.CreateTransaction(ctx, midtrans.CreateTransactionRequest{
		OrderID:           enrollmentOrderID,
		GrossAmountIDR:    amountIDR,
		ItemName:          itemName,
		CustomerEmail:     email,
		FinishRedirectURL: h.PublicWebURL + "/dashboard/settings/subscription",
		EnableSaveCard:    true,
		UserID:            userID,
	})
	if err != nil {
		// Baris subscriptions dibiarkan (status pending_card) -- kreator bisa
		// coba lagi, endpoint ini menolak duplikat lewat pengecekan
		// existingCount di atas, JADI perlu dibersihkan supaya tidak
		// mengunci diri sendiri selamanya kalau Midtrans gagal.
		_, _ = h.DB.Exec(ctx, `DELETE FROM subscriptions WHERE id = $1`, subscriptionID)
		if err == midtrans.ErrNotConfigured {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "pembayaran belum dikonfigurasi, hubungi admin"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "gagal menghubungi penyedia pembayaran, coba lagi"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"invoice_url": txn.RedirectURL})
}

// Cancel -- hentikan penagihan berulang lewat Midtrans CancelSubscription,
// TAPI akses premium tetap berlaku sampai current_period_end (masa yang
// sudah dibayar) -- lihat isPremiumUser di atas.
func (h *SubscriptionHandler) Cancel(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var subID, midtransSubID string
	err := h.DB.QueryRow(ctx, `
		SELECT id, coalesce(midtrans_subscription_id, '') FROM subscriptions
		WHERE user_id = $1 AND status IN ('active', 'past_due')
	`, userID).Scan(&subID, &midtransSubID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "kamu tidak punya langganan aktif"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat langganan"})
		return
	}

	if midtransSubID != "" {
		if err := h.Midtrans.CancelSubscription(ctx, midtransSubID); err != nil {
			log.Printf("subscription: gagal membatalkan langganan %s di Midtrans: %v", midtransSubID, err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "gagal membatalkan langganan di penyedia pembayaran, coba lagi"})
			return
		}
	}

	if _, err := h.DB.Exec(ctx, `
		UPDATE subscriptions SET status = 'canceled', canceled_at = now() WHERE id = $1
	`, subID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan pembatalan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "langganan dibatalkan, akses premium tetap berlaku sampai akhir periode yang sudah dibayar"})
}

// maybeHandleSubscriptionEnrollmentPayment -- dipanggil checkout.go Webhook
// SEBELUM logika order produk biasa. Mengembalikan handled=true kalau
// order_id ini memang pendaftaran langganan (SENGAJA tidak menyentuh tabel
// orders/products/ledger sama sekali -- pendaftaran langganan BUKAN
// transaksi produk).
func maybeHandleSubscriptionEnrollmentPayment(ctx context.Context, db *pgxpool.Pool, mt *midtrans.Client, payload midtrans.NotificationPayload) (handled bool, err error) {
	if !strings.HasPrefix(payload.OrderID, enrollmentOrderIDPrefix) {
		return false, nil
	}

	orderStatus, recognized := midtrans.StatusToOrderStatus(payload.TransactionStatus, payload.FraudStatus)
	if !recognized || orderStatus != "paid" {
		// Belum final (pending) atau gagal -- baris subscriptions dibiarkan
		// pending_card, kreator akan lihat status itu & bisa coba lagi lewat
		// endpoint Checkout (yang membersihkan baris lama kalau perlu).
		return true, nil
	}

	if payload.SavedTokenID == "" {
		return true, fmt.Errorf("subscription: pembayaran pendaftaran %s lunas tapi saved_token_id kosong (kartu tidak tersimpan)", payload.OrderID)
	}

	var subscriptionID, userID, plan string
	var amountIDR int64
	var status string
	err = db.QueryRow(ctx, `
		SELECT id, user_id, plan, amount_idr, status FROM subscriptions WHERE enrollment_order_id = $1
	`, payload.OrderID).Scan(&subscriptionID, &userID, &plan, &amountIDR, &status)
	if err != nil {
		if err == pgx.ErrNoRows {
			return true, nil
		}
		return true, fmt.Errorf("subscription: gagal memuat baris langganan untuk %s: %w", payload.OrderID, err)
	}
	if status != "pending_card" {
		// Sudah diproses webhook sebelumnya (retry notifikasi Midtrans) --
		// idempoten, tidak boleh bikin langganan Midtrans dua kali.
		return true, nil
	}

	var email string
	_ = db.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email)

	interval, intervalUnit := 1, "month"
	if plan == "yearly" {
		interval, intervalUnit = 12, "month"
	}
	startTime := time.Now().AddDate(0, interval, 0)
	if plan == "yearly" {
		startTime = time.Now().AddDate(1, 0, 0)
	}

	sub, err := mt.CreateSubscription(ctx, midtrans.CreateSubscriptionRequest{
		Name:          subscriptionID,
		AmountIDR:     amountIDR,
		Token:         payload.SavedTokenID,
		CustomerEmail: email,
		Schedule: midtrans.SubscriptionSchedule{
			Interval:     interval,
			IntervalUnit: intervalUnit,
			StartTime:    startTime.Format("2006-01-02 15:04:05 -0700"),
		},
	})
	if err != nil {
		return true, fmt.Errorf("subscription: gagal membuat langganan Midtrans untuk %s: %w", payload.OrderID, err)
	}

	var currentPeriodEnd *time.Time
	if t, parseErr := time.Parse("2006-01-02 15:04:05", sub.Schedule.NextExecutionAt); parseErr == nil {
		currentPeriodEnd = &t
	}

	if _, err := db.Exec(ctx, `
		UPDATE subscriptions SET status = 'active', midtrans_subscription_id = $1, current_period_end = $2 WHERE id = $3
	`, sub.ID, currentPeriodEnd, subscriptionID); err != nil {
		return true, fmt.Errorf("subscription: gagal menyimpan status aktif untuk %s: %w", payload.OrderID, err)
	}

	log.Printf("subscription: langganan %s (user %s, plan %s) aktif, midtrans_subscription_id=%s", subscriptionID, userID, plan, sub.ID)
	return true, nil
}

// HandleCycleWebhook -- endpoint PUBLIK terpisah untuk notifikasi siklus
// penagihan BERULANG (Recurring Notification URL Midtrans, WAJIB
// didaftarkan manual di dashboard Midtrans -- lihat catatan lingkup di atas
// struct SubscriptionHandler). SENGAJA TIDAK mempercayai isi payload
// webhook untuk keputusan status -- cukup ambil `subscription.id`-nya lalu
// panggil GetSubscription (sumber kebenaran dari Midtrans sendiri lewat
// kredensial server key KITA) sebelum mengubah apa pun. Ini juga
// menghindari kebutuhan verifikasi signature_key yang formatnya untuk
// notifikasi Subscription API TIDAK didokumentasikan sejelas notifikasi
// order biasa -- payload webhook di sini murni "pemicu untuk mengecek
// ulang", bukan sumber kebenaran, jadi keliru/dipalsukan pun paling parah
// cuma memicu pengecekan ulang yang sah terhadap ID yang disebutkan.
func (h *SubscriptionHandler) HandleCycleWebhook(c *gin.Context) {
	var payload struct {
		Subscription struct {
			ID string `json:"id"`
		} `json:"subscription"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil || payload.Subscription.ID == "" {
		// Bentuk payload tidak dikenal -- balas 200 supaya Midtrans tidak
		// retry sia-sia (sama seperti status tidak dikenal di webhook order).
		c.JSON(http.StatusOK, gin.H{"message": "payload tidak dikenal, diabaikan"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var subID, currentStatus string
	if err := h.DB.QueryRow(ctx, `
		SELECT id, status FROM subscriptions WHERE midtrans_subscription_id = $1
	`, payload.Subscription.ID).Scan(&subID, &currentStatus); err != nil {
		// ID tidak dikenal ATAU sudah canceled di sisi kita -- diamkan, tidak
		// perlu aksi apa pun.
		c.JSON(http.StatusOK, gin.H{"message": "langganan tidak ditemukan, diabaikan"})
		return
	}
	if currentStatus == "canceled" {
		c.JSON(http.StatusOK, gin.H{"message": "langganan sudah dibatalkan, diabaikan"})
		return
	}

	truth, err := h.Midtrans.GetSubscription(ctx, payload.Subscription.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memverifikasi status langganan ke Midtrans"})
		return
	}

	newStatus := "past_due"
	if truth.Status == "active" {
		newStatus = "active"
	}

	var currentPeriodEnd *time.Time
	if t, parseErr := time.Parse("2006-01-02 15:04:05", truth.Schedule.NextExecutionAt); parseErr == nil {
		currentPeriodEnd = &t
	}

	if _, err := h.DB.Exec(ctx, `
		UPDATE subscriptions SET status = $1, current_period_end = $2 WHERE id = $3
	`, newStatus, currentPeriodEnd, subID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan status langganan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "status langganan diperbarui"})
}
