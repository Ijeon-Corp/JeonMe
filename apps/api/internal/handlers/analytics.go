package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AnalyticsHandler mengimplementasikan REQ-F-601 (pencatatan klik/kunjungan),
// REQ-F-602 (tren per rentang waktu), REQ-F-603 (produk terlaris & sumber
// trafik utama).
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

	_, _ = h.DB.Exec(ctx, `
		INSERT INTO analytics_events (id, page_id, event_type, link_id, referrer, created_at)
		VALUES ($1, $2, $3, $4, $5, now())
	`, uuid.NewString(), pageID, req.EventType, linkID, req.Referrer)

	c.Status(http.StatusNoContent)
}

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
	ProductID string `json:"product_id"`
	Name      string `json:"name"`
	SoldCount int64  `json:"sold_count"`
	RevenueIDR int64 `json:"revenue_idr"`
}

type topReferrer struct {
	Referrer string `json:"referrer"`
	Count    int64  `json:"count"`
}

type analyticsSummaryResponse struct {
	TotalViews   int64         `json:"total_views"`
	TotalClicks  int64         `json:"total_clicks"`
	DailySeries  []dailyPoint  `json:"daily_series"`
	TopLinks     []topLink     `json:"top_links"`
	TopProducts  []topProduct  `json:"top_products"`
	TopReferrers []topReferrer `json:"top_referrers"`
	RangeDays    int           `json:"range_days"`
}

// GetSummary — REQ-F-602/603. rangeDays default 30, dibatasi 1..90 supaya
// query tidak dipakai untuk menarik seluruh histori sekaligus.
func (h *AnalyticsHandler) GetSummary(c *gin.Context) {
	userID := c.GetString("userID")

	rangeDays := 30
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var pageID string
	if err := h.DB.QueryRow(ctx, `SELECT id FROM pages WHERE user_id = $1`, userID).Scan(&pageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat halaman"})
		return
	}

	resp := analyticsSummaryResponse{RangeDays: rangeDays, DailySeries: []dailyPoint{}, TopLinks: []topLink{}, TopProducts: []topProduct{}, TopReferrers: []topReferrer{}}

	err := h.DB.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE event_type = 'view'),
			COUNT(*) FILTER (WHERE event_type = 'click')
		FROM analytics_events
		WHERE page_id = $1 AND created_at > now() - make_interval(days => $2)
	`, pageID, rangeDays).Scan(&resp.TotalViews, &resp.TotalClicks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghitung ringkasan"})
		return
	}

	dailyRows, err := h.DB.Query(ctx, `
		SELECT date_trunc('day', created_at)::date AS day,
			COUNT(*) FILTER (WHERE event_type = 'view'),
			COUNT(*) FILTER (WHERE event_type = 'click')
		FROM analytics_events
		WHERE page_id = $1 AND created_at > now() - make_interval(days => $2)
		GROUP BY day ORDER BY day ASC
	`, pageID, rangeDays)
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
		WHERE e.page_id = $1 AND e.event_type = 'click' AND e.created_at > now() - make_interval(days => $2)
		GROUP BY l.id, l.title ORDER BY clicks DESC LIMIT 5
	`, pageID, rangeDays)
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
		WHERE p.user_id = $1 AND o.status = 'paid' AND o.created_at > now() - make_interval(days => $2)
		GROUP BY p.id, p.name ORDER BY sold DESC LIMIT 5
	`, userID, rangeDays)
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
		WHERE page_id = $1 AND event_type = 'view' AND created_at > now() - make_interval(days => $2)
			AND referrer != ''
		GROUP BY ref ORDER BY cnt DESC LIMIT 5
	`, pageID, rangeDays)
	if err == nil {
		defer refRows.Close()
		for refRows.Next() {
			var tr topReferrer
			if err := refRows.Scan(&tr.Referrer, &tr.Count); err == nil {
				resp.TopReferrers = append(resp.TopReferrers, tr)
			}
		}
	}

	c.JSON(http.StatusOK, resp)
}
