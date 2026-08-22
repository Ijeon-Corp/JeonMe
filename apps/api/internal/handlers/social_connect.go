package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/jeonme/api/internal/crypto"
	"github.com/jeonme/api/internal/instagramoauth"
	"github.com/jeonme/api/internal/tiktokoauth"
)

// SocialConnectHandler -- Modul Koneksi Sosial (migrasi 000069), permintaan
// langsung pengguna, 17 Agustus 2026: "saya mau jeonme ini bisa connect ke
// akun kita contoh nya instagram tiktok". Diriset dulu lewat benchmark
// Linktree (bukan Lynk.id, yang "connect"-nya cuma tautan biasa yang SUDAH
// ada di Jeonme lewat SOCIAL_PLATFORMS/link()) -- "Connect Instagram/
// TikTok" ASLI Linktree adalah OAuth: profil + 6 postingan/video TERBARU
// tampil otomatis di halaman publik, bisa dilihat/diputar tanpa keluar.
//
// Instagram/TikTok -- di-set terpisah sesudah NewSocialConnectHandler
// (pola SAMA seperti AuthHandler.GoogleOAuth), selalu non-nil, kredensial
// kosong ditangani sendiri oleh instagramoauth/tiktokoauth (ErrNotConfigured).
//
// EncryptionKey -- audit keamanan 22 Agustus 2026: access_token/
// refresh_token SEBELUMNYA tersimpan polos (migrasi 000069 menyamakan
// dengan products.webhook_secret, tapi analoginya salah -- webhook_secret
// itu SERVER yang menghasilkan, bukan token OAuth pihak ketiga bernilai
// tinggi yang bisa dipakai langsung terhadap API Instagram/TikTok). Pola
// sama seperti payout_methods.account_number_encrypted (payment_settings.go)
// & analytics_settings.fb_access_token_encrypted -- AES-256-GCM lewat
// internal/crypto, di-set terpisah sesudah NewSocialConnectHandler
// (pola sama seperti Instagram/TikTok), lihat routes.go.
//
// TIDAK ada migrasi backfill utk baris yang SUDAH ada (token polos lama) --
// crypto.Decrypt akan gagal terhadap nilai polos (bukan format base64+GCM
// yang valid), fetchInstagramFeed/fetchTikTokFeed sudah soft-fail (return
// nil) begitu Decrypt gagal, jadi koneksi lama BUKAN error/crash, cuma
// feed-nya berhenti tampil sampai kreator connect ulang -- trade-off yang
// wajar utk fitur soft-fail non-inti, konsisten dgn filosofi codebase ini
// (lihat CLAUDE.md), daripada menulis skrip migrasi Go sekali pakai yang
// tidak ada pola presedennya di proyek ini (migrasi selalu murni .sql).
type SocialConnectHandler struct {
	DB            *pgxpool.Pool
	RDB           *redis.Client
	Instagram     *instagramoauth.Client
	TikTok        *tiktokoauth.Client
	EncryptionKey []byte
}

func NewSocialConnectHandler(db *pgxpool.Pool, rdb *redis.Client) *SocialConnectHandler {
	return &SocialConnectHandler{DB: db, RDB: rdb, Instagram: instagramoauth.NewClient("", ""), TikTok: tiktokoauth.NewClient("", "")}
}

type socialConnectionItem struct {
	Platform         string    `json:"platform"`
	ExternalUsername string    `json:"external_username"`
	AvatarURL        string    `json:"avatar_url"`
	ConnectedAt      time.Time `json:"connected_at"`
}

// List -- TIDAK PERNAH mengembalikan access_token/refresh_token ke
// frontend, cuma info tampilan (username/avatar) + status tersambung.
func (h *SocialConnectHandler) List(c *gin.Context) {
	userID := c.GetString("userID")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT platform, external_username, avatar_url, connected_at
		FROM social_connections WHERE user_id = $1 ORDER BY platform
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat koneksi sosial"})
		return
	}
	defer rows.Close()

	items := []socialConnectionItem{}
	for rows.Next() {
		var it socialConnectionItem
		if err := rows.Scan(&it.Platform, &it.ExternalUsername, &it.AvatarURL, &it.ConnectedAt); err == nil {
			items = append(items, it)
		}
	}
	c.JSON(http.StatusOK, items)
}

type connectInstagramRequest struct {
	Code        string `json:"code" binding:"required"`
	RedirectURI string `json:"redirect_uri" binding:"required"`
}

// ConnectInstagram -- pola SAMA PERSIS dengan AuthHandler.GoogleLogin:
// frontend menangani redirect penuh ke layar consent Instagram sendiri
// (lib/social-oauth.ts), lalu POST authorization code ke sini LEWAT
// permintaan yang SUDAH terautentikasi JWT kreator yang sedang login --
// beda dari GoogleLogin yang membuat/mencari akun BARU, endpoint ini
// SELALU menyambungkan ke akun yang SUDAH login.
func (h *SocialConnectHandler) ConnectInstagram(c *gin.Context) {
	var req connectInstagramRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	token, externalUserID, err := h.Instagram.Exchange(ctx, req.Code, req.RedirectURI)
	if err != nil {
		if err == instagramoauth.ErrNotConfigured {
			c.JSON(http.StatusNotImplemented, gin.H{"error": "koneksi Instagram belum dikonfigurasi di server ini"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "gagal menyambungkan akun Instagram, coba lagi"})
		return
	}

	profile, err := h.Instagram.FetchProfile(ctx, token.AccessToken)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "akun tersambung tapi gagal mengambil profil Instagram"})
		return
	}

	encryptedToken, err := crypto.Encrypt(h.EncryptionKey, token.AccessToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengenkripsi token Instagram"})
		return
	}
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO social_connections (user_id, platform, external_user_id, external_username, access_token, token_expires_at, connected_at)
		VALUES ($1, 'instagram', $2, $3, $4, $5, now())
		ON CONFLICT (user_id, platform) DO UPDATE SET
			external_user_id = EXCLUDED.external_user_id,
			external_username = EXCLUDED.external_username,
			access_token = EXCLUDED.access_token,
			token_expires_at = EXCLUDED.token_expires_at,
			connected_at = now()
	`, userID, externalUserID, profile.Username, encryptedToken, token.ExpiresAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan koneksi Instagram"})
		return
	}

	h.invalidateFeedCache(ctx, userID, "instagram")
	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusOK, gin.H{"message": "akun Instagram tersambung", "username": profile.Username})
}

type connectTikTokRequest struct {
	Code        string `json:"code" binding:"required"`
	RedirectURI string `json:"redirect_uri" binding:"required"`
}

func (h *SocialConnectHandler) ConnectTikTok(c *gin.Context) {
	var req connectTikTokRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	token, err := h.TikTok.Exchange(ctx, req.Code, req.RedirectURI)
	if err != nil {
		if err == tiktokoauth.ErrNotConfigured {
			c.JSON(http.StatusNotImplemented, gin.H{"error": "koneksi TikTok belum dikonfigurasi di server ini"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "gagal menyambungkan akun TikTok, coba lagi"})
		return
	}

	profile, err := h.TikTok.FetchProfile(ctx, token.AccessToken)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "akun tersambung tapi gagal mengambil profil TikTok"})
		return
	}

	encryptedAccessToken, err := crypto.Encrypt(h.EncryptionKey, token.AccessToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengenkripsi token TikTok"})
		return
	}
	encryptedRefreshToken, err := crypto.Encrypt(h.EncryptionKey, token.RefreshToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengenkripsi token TikTok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO social_connections (user_id, platform, external_user_id, external_username, avatar_url, access_token, refresh_token, token_expires_at, connected_at)
		VALUES ($1, 'tiktok', $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (user_id, platform) DO UPDATE SET
			external_user_id = EXCLUDED.external_user_id,
			external_username = EXCLUDED.external_username,
			avatar_url = EXCLUDED.avatar_url,
			access_token = EXCLUDED.access_token,
			refresh_token = EXCLUDED.refresh_token,
			token_expires_at = EXCLUDED.token_expires_at,
			connected_at = now()
	`, userID, token.OpenID, profile.Username, profile.AvatarURL, encryptedAccessToken, encryptedRefreshToken, token.ExpiresAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan koneksi TikTok"})
		return
	}

	h.invalidateFeedCache(ctx, userID, "tiktok")
	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusOK, gin.H{"message": "akun TikTok tersambung", "username": profile.Username})
}

// Disconnect -- :platform dibatasi "instagram"/"tiktok" lewat routes.go
// (binding:"oneof" tidak berlaku utk path param, dicek manual di sini).
func (h *SocialConnectHandler) Disconnect(c *gin.Context) {
	platform := c.Param("platform")
	if platform != "instagram" && platform != "tiktok" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "platform tidak dikenali"})
		return
	}
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `DELETE FROM social_connections WHERE user_id = $1 AND platform = $2`, userID, platform); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memutus koneksi"})
		return
	}

	h.invalidateFeedCache(ctx, userID, platform)
	invalidateUserPageCache(ctx, h.DB, h.RDB, userID)
	c.JSON(http.StatusOK, gin.H{"message": "koneksi diputus"})
}

func (h *SocialConnectHandler) invalidateFeedCache(ctx context.Context, userID, platform string) {
	if h.RDB == nil {
		return
	}
	_ = h.RDB.Del(ctx, "social-feed:"+platform+":"+userID).Err()
}

// ---------- Pengambilan feed publik (dipanggil dari page.go) ----------

// PublicSocialFeed -- ditampilkan di halaman publik (lihat resp.InstagramFeed/
// resp.TikTokFeed, GetPublicPage). Item.URL -- utk Instagram, tautan
// Permalink postingan; utk TikTok, ShareURL video (keduanya membuka
// postingan/video ASLI di platform asalnya saat diklik, konsisten dgn
// perilaku Linktree yang diriset).
type PublicSocialFeed struct {
	Platform string                 `json:"platform"`
	Username string                 `json:"username"`
	Items    []PublicSocialFeedItem `json:"items"`
}

type PublicSocialFeedItem struct {
	ID           string `json:"id"`
	ThumbnailURL string `json:"thumbnail_url"`
	URL          string `json:"url"`
	Caption      string `json:"caption"`
}

// feedCacheTTL -- jauh lebih lama dari cache halaman publik biasa (30
// detik, lihat GetPublicPage) -- feed Instagram/TikTok TIDAK perlu
// real-time, dan API kedua platform ini punya rate limit yang jauh lebih
// ketat daripada database Jeonme sendiri.
const feedCacheTTL = time.Hour

// fetchInstagramFeed -- soft-fail total (selalu return nil, TIDAK PERNAH
// error ke pemanggil) -- kalau kreator belum connect Instagram sama
// sekali, ATAU token sudah kedaluwarsa/API Instagram sedang bermasalah,
// halaman publik tetap tampil normal TANPA widget feed, bukan error 500,
// pola sama seperti soft-fail lain di seluruh kodebase ini (SMTP/S3/
// WhatsApp/ensureProdukPage).
func fetchInstagramFeed(ctx context.Context, db *pgxpool.Pool, rdb *redis.Client, ig *instagramoauth.Client, userID string, encryptionKey []byte) *PublicSocialFeed {
	cacheKey := "social-feed:instagram:" + userID
	if rdb != nil {
		if cached, err := rdb.Get(ctx, cacheKey).Result(); err == nil {
			var feed PublicSocialFeed
			if json.Unmarshal([]byte(cached), &feed) == nil {
				return &feed
			}
		}
	}

	var encryptedToken, username string
	var expiresAt *time.Time
	err := db.QueryRow(ctx, `
		SELECT access_token, external_username, token_expires_at FROM social_connections
		WHERE user_id = $1 AND platform = 'instagram'
	`, userID).Scan(&encryptedToken, &username, &expiresAt)
	if err != nil {
		return nil
	}
	accessToken, err := crypto.Decrypt(encryptionKey, encryptedToken)
	if err != nil {
		return nil
	}

	// Perpanjang token yang mendekati kedaluwarsa (kurang dari 7 hari lagi)
	// SEBELUM dipakai -- token Instagram bertahan ~60 hari, TODO: job
	// terjadwal terpisah yang memperpanjang SEMUA koneksi aktif secara
	// proaktif (di luar lingkup scaffold ini) supaya tidak bergantung pada
	// "kebetulan ada pengunjung" utk memicu perpanjangan.
	if expiresAt != nil && time.Until(*expiresAt) < 7*24*time.Hour {
		if newToken, newExpiry, rerr := ig.Refresh(ctx, accessToken); rerr == nil {
			accessToken = newToken
			if newEncrypted, eerr := crypto.Encrypt(encryptionKey, newToken); eerr == nil {
				_, _ = db.Exec(ctx, `UPDATE social_connections SET access_token = $1, token_expires_at = $2 WHERE user_id = $3 AND platform = 'instagram'`, newEncrypted, newExpiry, userID)
			}
		}
	}

	media, err := ig.FetchMedia(ctx, accessToken, 6)
	if err != nil || len(media) == 0 {
		return nil
	}

	feed := &PublicSocialFeed{Platform: "instagram", Username: username, Items: make([]PublicSocialFeedItem, 0, len(media))}
	for _, m := range media {
		thumb := m.ThumbnailURL
		if thumb == "" {
			thumb = m.MediaURL
		}
		feed.Items = append(feed.Items, PublicSocialFeedItem{ID: m.ID, ThumbnailURL: thumb, URL: m.Permalink, Caption: m.Caption})
	}

	if rdb != nil {
		if encoded, err := json.Marshal(feed); err == nil {
			_ = rdb.Set(ctx, cacheKey, encoded, feedCacheTTL).Err()
		}
	}
	return feed
}

// fetchTikTokFeed -- soft-fail sama seperti fetchInstagramFeed di atas.
func fetchTikTokFeed(ctx context.Context, db *pgxpool.Pool, rdb *redis.Client, tt *tiktokoauth.Client, userID string, encryptionKey []byte) *PublicSocialFeed {
	cacheKey := "social-feed:tiktok:" + userID
	if rdb != nil {
		if cached, err := rdb.Get(ctx, cacheKey).Result(); err == nil {
			var feed PublicSocialFeed
			if json.Unmarshal([]byte(cached), &feed) == nil {
				return &feed
			}
		}
	}

	var encryptedAccessToken, encryptedRefreshToken, username string
	var expiresAt *time.Time
	err := db.QueryRow(ctx, `
		SELECT access_token, refresh_token, external_username, token_expires_at FROM social_connections
		WHERE user_id = $1 AND platform = 'tiktok'
	`, userID).Scan(&encryptedAccessToken, &encryptedRefreshToken, &username, &expiresAt)
	if err != nil {
		return nil
	}
	accessToken, err := crypto.Decrypt(encryptionKey, encryptedAccessToken)
	if err != nil {
		return nil
	}
	refreshToken, err := crypto.Decrypt(encryptionKey, encryptedRefreshToken)
	if err != nil {
		return nil
	}

	// access_token TikTok cuma bertahan 24 jam (jauh lebih pendek dari
	// Instagram) -- refresh kalau sudah/hampir lewat, sama seperti di atas
	// TODO job terjadwal proaktif juga berlaku di sini, malah lebih
	// penting mengingat masa berlakunya yang pendek.
	if expiresAt == nil || time.Until(*expiresAt) < time.Hour {
		if refreshToken == "" {
			return nil
		}
		if newToken, rerr := tt.Refresh(ctx, refreshToken); rerr == nil {
			accessToken = newToken.AccessToken
			newEncryptedAccess, aerr := crypto.Encrypt(encryptionKey, newToken.AccessToken)
			newEncryptedRefresh, rerr2 := crypto.Encrypt(encryptionKey, newToken.RefreshToken)
			if aerr == nil && rerr2 == nil {
				_, _ = db.Exec(ctx, `
					UPDATE social_connections SET access_token = $1, refresh_token = $2, token_expires_at = $3
					WHERE user_id = $4 AND platform = 'tiktok'
				`, newEncryptedAccess, newEncryptedRefresh, newToken.ExpiresAt, userID)
			}
		} else {
			return nil
		}
	}

	videos, err := tt.FetchVideos(ctx, accessToken, 6)
	if err != nil || len(videos) == 0 {
		return nil
	}

	feed := &PublicSocialFeed{Platform: "tiktok", Username: username, Items: make([]PublicSocialFeedItem, 0, len(videos))}
	for _, v := range videos {
		feed.Items = append(feed.Items, PublicSocialFeedItem{ID: v.ID, ThumbnailURL: v.CoverImageURL, URL: v.ShareURL, Caption: v.Title})
	}

	if rdb != nil {
		if encoded, err := json.Marshal(feed); err == nil {
			_ = rdb.Set(ctx, cacheKey, encoded, feedCacheTTL).Err()
		}
	}
	return feed
}
