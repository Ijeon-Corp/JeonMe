package handlers

import (
	"context"
	"encoding/csv"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AnalyticsHandler mengimplementasikan REQ-F-601 (pencatatan klik/kunjungan),
// REQ-F-602 (tren per rentang waktu), REQ-F-603 (produk terlaris & sumber
// trafik utama), dan No.86 (Sprint 10: rentang tanggal kustom, breakdown
// perangkat, ekspor CSV).
//
// CATATAN LINGKUP (No.86): breakdown LOKASI pengunjung (negara/kota) SENGAJA
// TIDAK dikerjakan di sini -- itu butuh geo-IP (basis data MaxMind GeoLite2
// yang perlu akun+lisensi, atau API pihak ketiga berbayar/rate-limited) yang
// belum ada keputusan/kredensial untuk itu, mirip situasi blocker WhatsApp
// Business API (No.74/75). Breakdown PERANGKAT (mobile/desktop/tablet)
// diimplementasikan penuh karena bisa diturunkan langsung dari header
// User-Agent yang SUDAH ada di tiap request, tanpa dependensi eksternal baru.
type AnalyticsHandler struct {
	DB *pgxpool.Pool
}

func NewAnalyticsHandler(db *pgxpool.Pool) *AnalyticsHandler {
	return &AnalyticsHandler{DB: db}
}

type trackEventRequest struct {
	EventType string `json:"event_type" binding:"required,oneof=view click"`
	LinkID    string `json:"link_id"`
	Referrer  string `json:"referrer"`
}

// classifyDevice -- heuristik sederhana dari User-Agent (BUKAN pustaka
// parsing UA lengkap) sengaja dipilih supaya tidak menambah dependensi baru
// untuk kebutuhan MVP: cukup 3 kategori kasar (mobile/tablet/desktop) untuk
// breakdown ringkas ala Linktree/Lynk.id, bukan deteksi merek/model detail.
func classifyDevice(userAgent string) string {
	ua := strings.ToLower(userAgent)
	if ua == "" {
		return "unknown"
	}
	if strings.Contains(ua, "ipad") || strings.Contains(ua, "tablet") ||
		(strings.Contains(ua, "android") && !strings.Contains(ua, "mobile")) {
		return "tablet"
	}
	if strings.Contains(ua, "mobi") || strings.Contains(ua, "iphone") || strings.Contains(ua, "android") {
		return "mobile"
	}
	return "desktop"
}

// Track — REQ-F-601. Publik (dipanggil dari halaman kreator saat dimuat/
// tautan diklik), TIDAK memerlukan auth. Gagal diam-diam (selalu 204) kalau
// halaman tidak ditemukan -- analytics tidak boleh menyebabkan error yang
// mengganggu pengunjung halaman publik.
func (h *AnalyticsHandler) Track(c *gin.Context) {
	username := c.Param("username")

	var req trackEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.Status(http.StatusNoContent)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	var pageID string
	if err := h.DB.QueryRow(ctx, `
		SELECT p.id FROM pages p JOIN users u ON u.id = p.user_id WHERE u.username = $1
	`, username).Scan(&pageID); err != nil {
		c.Status(http.StatusNoContent)
		return
	}

	var linkID *string
	if req.LinkID != "" {
		linkID = &req.LinkID
	}

	deviceType := classifyDevice(c.Request.UserAgent())

	_, _ = h.DB.Exec(ctx, `
		INSERT INTO analytics_events (id, page_id, event_type, link_id, referrer, device_type, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
	`, uuid.NewString(), pageID, req.EventType, linkID, req.Referrer, deviceType)

	c.Status(http.StatusNoContent)
}

// resolveDateRange — No.86: mendukung DUA cara memilih rentang: preset
// jumlah hari (?range_days=N, perilaku LAMA, default 30) ATAU rentang
// tanggal eksplisit (?from=YYYY-MM-DD&to=YYYY-MM-DD, BARU) supaya kreator
// bisa memilih tanggal bebas seperti Linktree/Lynk.id, bukan cuma preset
// 7/30/90 hari. `to` dibulatkan ke akhir hari (23:59:59) supaya hari
// terakhir yang dipilih ikut terhitung penuh.
func resolveDateRange(c *gin.Context) (from, to time.Time, rangeDays int, err error) {
	fromStr := c.Query("from")
	toStr := c.Query("to")

	if fromStr != "" || toStr != "" {
		from, err = time.Parse("2006-01-02", fromStr)
		if err != nil {
			return from, to, 0, err
		}
		to, err = time.Parse("2006-01-02", toStr)
		if err != nil {
			return from, to, 0, err
		}
		to = to.Add(24*time.Hour - time.Nanosecond)
		if to.Before(from) {
			return from, to, 0, errInvalidDateRange
		}
		if to.Sub(from) > 366*24*time.Hour {
			return from, to, 0, errDateRangeTooWide
		}
		return from, to, int(to.Sub(from).Hours()/24) + 1, nil
	}

	rangeDays = 30
	if rd := c.Query("range_days"); rd != "" {
		if n, convErr := strconv.Atoi(rd); convErr == nil && n >= 1 && n <= 90 {
			rangeDays = n
		}
	}
	to = time.Now()
	from = to.AddDate(0, 0, -rangeDays)
	return from, to, rangeDays, nil
}

var errInvalidDateRange = &dateRangeError{"tanggal \"to\" harus setelah \"from\""}
var errDateRangeTooWide = &dateRangeError{"rentang tanggal maksimum 366 hari"}
var errGagalMemuatHalaman = &dateRangeError{"gagal memuat halaman"}
var errGagalHitungRingkasan = &dateRangeError{"gagal menghitung ringkasan"}

type dateRangeError struct{ msg string }

func (e *dateRangeError) Error() string { return e.msg }

type dailyPoint struct {
	Date   string `json:"date"`
	Views  int64  `json:"views"`
	Clicks int64  `json:"clicks"`
}

type topLink struct {
	LinkID string `json:"link_id"`
	Title  string `json:"title"`
	Clicks int64  `json:"clicks"`
}

type topProduct struct {
	ProductID  string `json:"product_id"`
	Name       string `json:"name"`
	SoldCount  int64  `json:"sold_count"`
	RevenueIDR int64  `json:"revenue_idr"`
}

type topReferrer struct {
	Referrer string `json:"referrer"`
	Count    int64  `json:"count"`
}

type deviceBreakdown struct {
	DeviceType string `json:"device_type"`
	Count      int64  `json:"count"`
}

type analyticsSummaryResponse struct {
	TotalViews      int64             `json:"total_views"`
	TotalClicks     int64             `json:"total_clicks"`
	DailySeries     []dailyPoint      `json:"daily_series"`
	TopLinks        []topLink         `json:"top_links"`
	TopProducts     []topProduct      `json:"top_products"`
	TopReferrers    []topReferrer     `json:"top_referrers"`
	DeviceBreakdown []deviceBreakdown `json:"device_breakdown"`
	RangeDays       int               `json:"range_days"`
	FromDate        string            `json:"from_date"`
	ToDate          string            `json:"to_date"`
}

// GetSummary — REQ-F-602/603 + No.86 (rentang tanggal kustom & breakdown
// perangkat). Lihat resolveDateRange untuk dua cara memilih rentang.
func (h *AnalyticsHandler) GetSummary(c *gin.Context) {
	userID := c.GetString("userID")

	from, to, rangeDays, err := resolveDateRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	resp, err := h.computeSummary(ctx, userID, from, to, rangeDays)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// computeSummary — logika inti ringkasan analitik, diekstrak dari GetSummary
// supaya bisa dipakai ulang oleh AssistantHandler.Ask (No.96) TANPA
// duplikasi query. Query yang gagal untuk satu bagian (mis. top referrer)
// diam-diam dilewati (bukan gagal total) -- konsisten dengan perilaku asli
// GetSummary sebelum diekstrak.
func (h *AnalyticsHandler) computeSummary(ctx context.Context, userID string, from, to time.Time, rangeDays int) (analyticsSummaryResponse, error) {
	var pageID string
	if err := h.DB.QueryRow(ctx, `SELECT id FROM pages WHERE user_id = $1`, userID).Scan(&pageID); err != nil {
		return analyticsSummaryResponse{}, errGagalMemuatHalaman
	}

	resp := analyticsSummaryResponse{
		RangeDays: rangeDays, FromDate: from.Format("2006-01-02"), ToDate: to.Format("2006-01-02"),
		DailySeries: []dailyPoint{}, TopLinks: []topLink{}, TopProducts: []topProduct{},
		TopReferrers: []topReferrer{}, DeviceBreakdown: []deviceBreakdown{},
	}

	if err := h.DB.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE event_type = 'view'),
			COUNT(*) FILTER (WHERE event_type = 'click')
		FROM analytics_events
		WHERE page_id = $1 AND created_at BETWEEN $2 AND $3
	`, pageID, from, to).Scan(&resp.TotalViews, &resp.TotalClicks); err != nil {
		return analyticsSummaryResponse{}, errGagalHitungRingkasan
	}

	dailyRows, err := h.DB.Query(ctx, `
		SELECT date_trunc('day', created_at)::date AS day,
			COUNT(*) FILTER (WHERE event_type = 'view'),
			COUNT(*) FILTER (WHERE event_type = 'click')
		FROM analytics_events
		WHERE page_id = $1 AND created_at BETWEEN $2 AND $3
		GROUP BY day ORDER BY day ASC
	`, pageID, from, to)
	if err == nil {
		defer dailyRows.Close()
		for dailyRows.Next() {
			var d time.Time
			var pt dailyPoint
			if err := dailyRows.Scan(&d, &pt.Views, &pt.Clicks); err == nil {
				pt.Date = d.Format("2006-01-02")
				resp.DailySeries = append(resp.DailySeries, pt)
			}
		}
	}

	linkRows, err := h.DB.Query(ctx, `
		SELECT l.id, l.title, COUNT(*) AS clicks
		FROM analytics_events e JOIN links l ON l.id = e.link_id
		WHERE e.page_id = $1 AND e.event_type = 'click' AND e.created_at BETWEEN $2 AND $3
		GROUP BY l.id, l.title ORDER BY clicks DESC LIMIT 5
	`, pageID, from, to)
	if err == nil {
		defer linkRows.Close()
		for linkRows.Next() {
			var tl topLink
			if err := linkRows.Scan(&tl.LinkID, &tl.Title, &tl.Clicks); err == nil {
				resp.TopLinks = append(resp.TopLinks, tl)
			}
		}
	}

	// REQ-F-603: produk terlaris dihitung dari order yang SUDAH DIBAYAR
	// (status='paid'), bukan sekadar dibuat -- checkout yang tidak pernah
	// dibayar tidak dihitung sebagai penjualan.
	productRows, err := h.DB.Query(ctx, `
		SELECT p.id, p.name, COUNT(*) AS sold, COALESCE(SUM(o.amount_idr), 0)
		FROM orders o JOIN products p ON p.id = o.product_id
		WHERE p.user_id = $1 AND o.status = 'paid' AND o.created_at BETWEEN $2 AND $3
		GROUP BY p.id, p.name ORDER BY sold DESC LIMIT 5
	`, userID, from, to)
	if err == nil {
		defer productRows.Close()
		for productRows.Next() {
			var tp topProduct
			if err := productRows.Scan(&tp.ProductID, &tp.Name, &tp.SoldCount, &tp.RevenueIDR); err == nil {
				resp.TopProducts = append(resp.TopProducts, tp)
			}
		}
	}

	refRows, err := h.DB.Query(ctx, `
		SELECT NULLIF(referrer, '') AS ref, COUNT(*) AS cnt
		FROM analytics_events
		WHERE page_id = $1 AND event_type = 'view' AND created_at BETWEEN $2 AND $3
			AND referrer != ''
		GROUP BY ref ORDER BY cnt DESC LIMIT 5
	`, pageID, from, to)
	if err == nil {
		defer refRows.Close()
		for refRows.Next() {
			var tr topReferrer
			if err := refRows.Scan(&tr.Referrer, &tr.Count); err == nil {
				resp.TopReferrers = append(resp.TopReferrers, tr)
			}
		}
	}

	// No.86: breakdown perangkat pengunjung -- hanya event 'view' (satu per
	// kunjungan halaman), bukan 'click' (bisa banyak per kunjungan yang sama).
	deviceRows, err := h.DB.Query(ctx, `
		SELECT device_type, COUNT(*) AS cnt
		FROM analytics_events
		WHERE page_id = $1 AND event_type = 'view' AND created_at BETWEEN $2 AND $3
		GROUP BY device_type ORDER BY cnt DESC
	`, pageID, from, to)
	if err == nil {
		defer deviceRows.Close()
		for deviceRows.Next() {
			var db deviceBreakdown
			if err := deviceRows.Scan(&db.DeviceType, &db.Count); err == nil {
				resp.DeviceBreakdown = append(resp.DeviceBreakdown, db)
			}
		}
	}

	return resp, nil
}

// ExportDailyCSV — No.86: ekspor rentang tanggal yang sama seperti GetSummary
// (from/to atau range_days) sebagai CSV (tanggal, kunjungan, klik) supaya
// kreator bisa mengolahnya sendiri di spreadsheet -- data disederhanakan ke
// deret harian saja (bukan seluruh breakdown produk/referrer/perangkat
// sekaligus dalam satu file, yang akan membuat struktur CSV tidak konsisten).
func (h *AnalyticsHandler) ExportDailyCSV(c *gin.Context) {
	userID := c.GetString("userID")

	from, to, _, err := resolveDateRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var pageID string
	if err := h.DB.QueryRow(ctx, `SELECT id FROM pages WHERE user_id = $1`, userID).Scan(&pageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT date_trunc('day', created_at)::date AS day,
			COUNT(*) FILTER (WHERE event_type = 'view'),
			COUNT(*) FILTER (WHERE event_type = 'click')
		FROM analytics_events
		WHERE page_id = $1 AND created_at BETWEEN $2 AND $3
		GROUP BY day ORDER BY day ASC
	`, pageID, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat data ekspor"})
		return
	}
	defer rows.Close()

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", "attachment; filename=analitik-"+from.Format("2006-01-02")+"-sampai-"+to.Format("2006-01-02")+".csv")

	w := csv.NewWriter(c.Writer)
	_ = w.Write([]string{"Tanggal", "Kunjungan", "Klik"})
	for rows.Next() {
		var d time.Time
		var views, clicks int64
		if err := rows.Scan(&d, &views, &clicks); err == nil {
			_ = w.Write([]string{d.Format("2006-01-02"), strconv.FormatInt(views, 10), strconv.FormatInt(clicks, 10)})
		}
	}
	w.Flush()
}

// ---------- No.96 (Sprint 13): asisten analitik "AI" ----------
//
// LINGKUP DIPERSEMPIT (keputusan eksplisit pengguna, 25 Juli 2026): TANPA
// panggilan API LLM sungguhan (OpenAI/Anthropic/dst), yang berbayar per-query
// dan belum ada keputusan anggaran untuk itu -- lihat catatan lingkup asli
// backlog ("hitung dulu biaya API LLM per-query sebelum komit"). Sebagai
// gantinya: pencocokan kata kunci sederhana atas pertanyaan bahasa natural,
// dipetakan ke query analitik yang SUDAH ADA (computeSummary), lalu dirangkai
// jadi kalimat jawaban dari angka NYATA -- nol biaya per-query, jujur soal
// keterbatasannya (bukan "AI" sungguhan, cuma templat + data asli).
type assistantIntent struct {
	keywords []string
	answer   func(resp analyticsSummaryResponse) string
}

var assistantIntents = []assistantIntent{
	{
		keywords: []string{"traffic", "trafik", "sumber", "referrer", "dari mana"},
		answer: func(resp analyticsSummaryResponse) string {
			if len(resp.TopReferrers) == 0 {
				return "Belum ada data sumber trafik yang tercatat dalam " + strconv.Itoa(resp.RangeDays) +
					" hari terakhir (kemungkinan pengunjung datang langsung tanpa referrer, atau memang belum ada kunjungan)."
			}
			var b strings.Builder
			b.WriteString("Sumber trafik terbesarmu dalam " + strconv.Itoa(resp.RangeDays) + " hari terakhir: ")
			for i, r := range resp.TopReferrers {
				if i > 0 {
					b.WriteString(", ")
				}
				b.WriteString(strconv.Itoa(i+1) + ". " + r.Referrer + " (" + strconv.FormatInt(r.Count, 10) + " kunjungan)")
			}
			b.WriteString(".")
			return b.String()
		},
	},
	{
		keywords: []string{"produk", "laku", "terjual", "jual", "best seller"},
		answer: func(resp analyticsSummaryResponse) string {
			if len(resp.TopProducts) == 0 {
				return "Belum ada produk yang terjual dalam " + strconv.Itoa(resp.RangeDays) + " hari terakhir."
			}
			var b strings.Builder
			b.WriteString("Produk terlaris dalam " + strconv.Itoa(resp.RangeDays) + " hari terakhir: ")
			for i, p := range resp.TopProducts {
				if i > 0 {
					b.WriteString(", ")
				}
				b.WriteString(strconv.Itoa(i+1) + ". " + p.Name + " (" + strconv.FormatInt(p.SoldCount, 10) +
					"x terjual, Rp" + strconv.FormatInt(p.RevenueIDR, 10) + ")")
			}
			b.WriteString(".")
			return b.String()
		},
	},
	{
		keywords: []string{"tren", "trend", "naik", "turun", "grafik"},
		answer: func(resp analyticsSummaryResponse) string {
			if len(resp.DailySeries) < 2 {
				return "Data kunjungan masih terlalu sedikit untuk melihat tren dalam " + strconv.Itoa(resp.RangeDays) + " hari terakhir."
			}
			mid := len(resp.DailySeries) / 2
			var firstHalf, secondHalf int64
			for _, d := range resp.DailySeries[:mid] {
				firstHalf += d.Views
			}
			for _, d := range resp.DailySeries[mid:] {
				secondHalf += d.Views
			}
			verdict := "stabil"
			if secondHalf > firstHalf {
				verdict = "naik"
			} else if secondHalf < firstHalf {
				verdict = "turun"
			}
			return "Tren kunjungan halamanmu " + verdict + " -- paruh pertama " + strconv.Itoa(resp.RangeDays) +
				" hari terakhir tercatat " + strconv.FormatInt(firstHalf, 10) + " kunjungan, paruh kedua " +
				strconv.FormatInt(secondHalf, 10) + " kunjungan."
		},
	},
	{
		keywords: []string{"perangkat", "device", "hp", "desktop", "mobile", "tablet"},
		answer: func(resp analyticsSummaryResponse) string {
			if len(resp.DeviceBreakdown) == 0 {
				return "Belum ada data perangkat pengunjung dalam " + strconv.Itoa(resp.RangeDays) + " hari terakhir."
			}
			var b strings.Builder
			b.WriteString("Perangkat pengunjungmu dalam " + strconv.Itoa(resp.RangeDays) + " hari terakhir: ")
			for i, d := range resp.DeviceBreakdown {
				if i > 0 {
					b.WriteString(", ")
				}
				b.WriteString(d.DeviceType + " (" + strconv.FormatInt(d.Count, 10) + " kunjungan)")
			}
			b.WriteString(".")
			return b.String()
		},
	},
	{
		keywords: []string{"tautan", "link", "klik", "diklik"},
		answer: func(resp analyticsSummaryResponse) string {
			if len(resp.TopLinks) == 0 {
				return "Belum ada tautan yang diklik dalam " + strconv.Itoa(resp.RangeDays) + " hari terakhir."
			}
			var b strings.Builder
			b.WriteString("Tautan paling banyak diklik dalam " + strconv.Itoa(resp.RangeDays) + " hari terakhir: ")
			for i, l := range resp.TopLinks {
				if i > 0 {
					b.WriteString(", ")
				}
				b.WriteString(strconv.Itoa(i+1) + ". " + l.Title + " (" + strconv.FormatInt(l.Clicks, 10) + "x klik)")
			}
			b.WriteString(".")
			return b.String()
		},
	},
}

const assistantFallbackHint = "Aku belum paham pertanyaan itu. Coba tanya soal: sumber trafik, produk terlaris, " +
	"tren kunjungan, perangkat pengunjung, atau tautan paling banyak diklik."

type askAssistantRequest struct {
	Question string `json:"question" binding:"required,max=500"`
}

// Ask — No.96, versi TANPA LLM API (lihat catatan lingkup di atas).
func (h *AnalyticsHandler) Ask(c *gin.Context) {
	var req askAssistantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")
	question := strings.ToLower(req.Question)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	to := time.Now()
	from := to.AddDate(0, 0, -30)
	resp, err := h.computeSummary(ctx, userID, from, to, 30)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, intent := range assistantIntents {
		for _, kw := range intent.keywords {
			if strings.Contains(question, kw) {
				c.JSON(http.StatusOK, gin.H{"answer": intent.answer(resp)})
				return
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"answer": assistantFallbackHint})
}
