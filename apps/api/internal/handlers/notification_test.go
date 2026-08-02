package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/jeonme/api/internal/database"
)

func newTestNotificationHandler(t *testing.T) (*NotificationHandler, *AuthHandler) {
	t.Helper()
	dbURL := mustEnv(t, "DATABASE_URL")
	redisURL := mustEnv(t, "REDIS_URL")

	db, err := database.NewPostgresPool(dbURL)
	if err != nil {
		t.Fatalf("gagal konek database test: %v", err)
	}
	t.Cleanup(db.Close)

	rdb, err := database.NewRedisClient(redisURL)
	if err != nil {
		t.Fatalf("gagal konek redis test: %v", err)
	}
	t.Cleanup(func() { rdb.Close() })

	return NewNotificationHandler(db), NewAuthHandler(db, rdb, "test-secret", "test")
}

func TestNotification_ListReturnsUnreadCountAndOwnNotificationsOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	notif, auth := newTestNotificationHandler(t)
	userA := registerTestUser(t, auth)
	userB := registerTestUser(t, auth)

	if _, err := notif.DB.Exec(t.Context(), `
		INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'order_paid', 'Judul A', 'Isi A')
	`, userA); err != nil {
		t.Fatalf("gagal setup notifikasi userA: %v", err)
	}
	if _, err := notif.DB.Exec(t.Context(), `
		INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'order_paid', 'Judul B', 'Isi B')
	`, userB); err != nil {
		t.Fatalf("gagal setup notifikasi userB: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/notifications", notif.List)

	rec := doJSON(t, router, http.MethodGet, "/notifications", nil, map[string]string{"X-Test-UserID": userA})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Notifications []struct {
			Title string `json:"title"`
			Read  bool   `json:"read"`
		} `json:"notifications"`
		UnreadCount int `json:"unread_count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("gagal decode response: %v", err)
	}
	if len(resp.Notifications) != 1 || resp.Notifications[0].Title != "Judul A" {
		t.Fatalf("notifications = %+v, ekspektasi cuma 1 milik userA sendiri", resp.Notifications)
	}
	if resp.Notifications[0].Read {
		t.Error("notifikasi baru seharusnya belum dibaca")
	}
	if resp.UnreadCount != 1 {
		t.Errorf("unread_count = %d, ekspektasi 1", resp.UnreadCount)
	}
}

func TestNotification_MarkRead_OnlyAffectsOwnNotification(t *testing.T) {
	gin.SetMode(gin.TestMode)
	notif, auth := newTestNotificationHandler(t)
	userA := registerTestUser(t, auth)
	userB := registerTestUser(t, auth)

	var idA, idB string
	if err := notif.DB.QueryRow(t.Context(), `
		INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'order_paid', 'Judul A', 'Isi A') RETURNING id
	`, userA).Scan(&idA); err != nil {
		t.Fatalf("gagal setup notifikasi userA: %v", err)
	}
	if err := notif.DB.QueryRow(t.Context(), `
		INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'order_paid', 'Judul B', 'Isi B') RETURNING id
	`, userB).Scan(&idB); err != nil {
		t.Fatalf("gagal setup notifikasi userB: %v", err)
	}

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/notifications/:id/read", notif.MarkRead)

	// userA mencoba menandai notifikasi milik userB -- harus diam-diam
	// tidak berpengaruh (bukan 403, konsisten dengan pola kepemilikan lain).
	rec := doJSON(t, router, http.MethodPost, "/notifications/"+idB+"/read", nil, map[string]string{"X-Test-UserID": userA})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var stillUnread bool
	if err := notif.DB.QueryRow(t.Context(), `SELECT read_at IS NULL FROM notifications WHERE id = $1`, idB).Scan(&stillUnread); err != nil {
		t.Fatalf("gagal query notifikasi userB: %v", err)
	}
	if !stillUnread {
		t.Error("notifikasi milik userB seharusnya TIDAK ikut ditandai dibaca oleh userA")
	}

	rec2 := doJSON(t, router, http.MethodPost, "/notifications/"+idA+"/read", nil, map[string]string{"X-Test-UserID": userA})
	if rec2.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec2.Code, rec2.Body.String())
	}
	var nowRead bool
	if err := notif.DB.QueryRow(t.Context(), `SELECT read_at IS NOT NULL FROM notifications WHERE id = $1`, idA).Scan(&nowRead); err != nil {
		t.Fatalf("gagal query notifikasi userA: %v", err)
	}
	if !nowRead {
		t.Error("notifikasi milik userA sendiri seharusnya berhasil ditandai dibaca")
	}
}
