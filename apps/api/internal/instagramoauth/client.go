// Package instagramoauth membungkus alur OAuth "Instagram API with
// Instagram Login" (produk resmi Meta, penerus Instagram Basic Display API
// yang dihentikan Desember 2024) -- permintaan langsung pengguna, 17
// Agustus 2026: "saya mau jeonme ini bisa connect ke akun kita contoh nya
// instagram tiktok", diriset dulu lewat benchmark Linktree (lihat memori
// sesi): "Connect Instagram" di sana menampilkan profil + 6 postingan/
// reels TERBARU, butuh akun Instagram Professional (Creator/Business).
//
// Endpoint di file ini disusun dari dokumentasi resmi Meta for Developers
// (developers.facebook.com/docs/instagram-platform) per Agustus 2026 --
// SENGAJA raw net/http (pola sama seperti internal/googleoauth) tanpa SDK
// resmi Meta. CATATAN PENTING: berbeda dari googleoauth yang endpointnya
// stabil bertahun-tahun, permukaan API Instagram/Meta historisnya berubah
// (Basic Display API -> Instagram API with Instagram Login pada 2024) --
// VERIFIKASI ULANG endpoint di bawah lewat dokumentasi resmi Meta for
// Developers SEBELUM dipakai production kalau sesi ini sudah lama
// berlalu, terutama kalau App Review Meta menolak dengan alasan endpoint
// usang.
//
// Kredensial (INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET) HARUS didaftarkan
// lewat Meta for Developers (developers.facebook.com/apps) -- produk
// "Instagram API with Instagram Login", scope instagram_business_basic --
// tidak bisa disintesis, kosong berarti fitur ini nonaktif (lihat
// ErrNotConfigured, pola sama seperti googleoauth).
package instagramoauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var ErrNotConfigured = errors.New("instagramoauth: INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET belum diset")

type Client struct {
	AppID     string
	AppSecret string
	HTTP      *http.Client
}

func NewClient(appID, appSecret string) *Client {
	return &Client{AppID: appID, AppSecret: appSecret, HTTP: &http.Client{Timeout: 15 * time.Second}}
}

// AuthURL -- redirect_uri WAJIB byte-per-byte identik dengan yang dipakai
// saat Exchange di bawah, DAN terdaftar persis di Meta App Dashboard
// (menu "Instagram > API setup with Instagram login > OAuth redirect
// URIs"). Scope instagram_business_basic cukup untuk profil + baca media
// (feed) -- TIDAK minta instagram_business_content_publish (Jeonme tidak
// pernah memposting APAPUN atas nama kreator, cuma membaca).
func (c *Client) AuthURL(redirectURI, state string) string {
	params := url.Values{
		"client_id":     {c.AppID},
		"redirect_uri":  {redirectURI},
		"response_type": {"code"},
		"scope":         {"instagram_business_basic"},
		"state":         {state},
	}
	return "https://api.instagram.com/oauth/authorize?" + params.Encode()
}

type Token struct {
	AccessToken string
	// ExpiresAt -- kosong (zero value) kalau token pendek (jarang dipakai
	// di sini, Exchange SELALU menukar ke token panjang, lihat di bawah).
	ExpiresAt time.Time
}

// Exchange -- DUA langkah berurutan sesuai dokumentasi resmi Meta: (1)
// tukar authorization code jadi token PENDEK (valid ~1 jam), (2) LANGSUNG
// tukar lagi jadi token PANJANG (valid ~60 hari) -- token pendek dari
// langkah pertama TIDAK PERNAH disimpan, cuma perantara. Refresh (di
// bawah) memperpanjang token panjang ini sebelum kedaluwarsa, TIDAK PERNAH
// perlu mengulang alur redirect penuh selama kreator masih memakai
// Jeonme rutin.
func (c *Client) Exchange(ctx context.Context, code, redirectURI string) (*Token, string, error) {
	if c.AppID == "" || c.AppSecret == "" {
		return nil, "", ErrNotConfigured
	}

	form := url.Values{
		"client_id":     {c.AppID},
		"client_secret": {c.AppSecret},
		"grant_type":    {"authorization_code"},
		"redirect_uri":  {redirectURI},
		"code":          {code},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.instagram.com/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("instagramoauth: gagal menghubungi Instagram: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, "", err
	}

	var short struct {
		AccessToken string `json:"access_token"`
		UserID      string `json:"user_id"`
		ErrorType   string `json:"error_type"`
		ErrorMsg    string `json:"error_message"`
	}
	if err := json.Unmarshal(body, &short); err != nil {
		return nil, "", fmt.Errorf("instagramoauth: gagal membaca respons token pendek: %w", err)
	}
	if res.StatusCode != http.StatusOK || short.AccessToken == "" {
		msg := short.ErrorMsg
		if msg == "" {
			msg = short.ErrorType
		}
		if msg == "" {
			msg = fmt.Sprintf("status %d", res.StatusCode)
		}
		return nil, "", fmt.Errorf("instagramoauth: tukar kode gagal: %s", msg)
	}

	longToken, expiresAt, err := c.exchangeLongLived(ctx, short.AccessToken)
	if err != nil {
		return nil, "", err
	}
	return &Token{AccessToken: longToken, ExpiresAt: expiresAt}, short.UserID, nil
}

func (c *Client) exchangeLongLived(ctx context.Context, shortToken string) (string, time.Time, error) {
	params := url.Values{
		"grant_type":    {"ig_exchange_token"},
		"client_secret": {c.AppSecret},
		"access_token":  {shortToken},
	}
	return c.doTokenExchange(ctx, "https://graph.instagram.com/access_token?"+params.Encode())
}

// Refresh -- WAJIB dipanggil sebelum token panjang kedaluwarsa (~60 hari),
// idealnya lewat job terjadwal terpisah (DI LUAR lingkup scaffold ini --
// lihat TODO di social_connect.go) supaya kreator tidak pernah perlu
// menyambungkan ulang akunnya secara manual. Token yang dikembalikan
// SELALU baru (beda dari token lama), simpan menimpa yang lama.
func (c *Client) Refresh(ctx context.Context, currentToken string) (string, time.Time, error) {
	if c.AppID == "" || c.AppSecret == "" {
		return "", time.Time{}, ErrNotConfigured
	}
	params := url.Values{
		"grant_type":   {"ig_refresh_token"},
		"access_token": {currentToken},
	}
	return c.doTokenExchange(ctx, "https://graph.instagram.com/refresh_access_token?"+params.Encode())
}

func (c *Client) doTokenExchange(ctx context.Context, fullURL string) (string, time.Time, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return "", time.Time{}, err
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("instagramoauth: gagal menghubungi Instagram: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return "", time.Time{}, err
	}

	var long struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &long); err != nil {
		return "", time.Time{}, fmt.Errorf("instagramoauth: gagal membaca respons token panjang: %w", err)
	}
	if res.StatusCode != http.StatusOK || long.AccessToken == "" {
		msg := long.Error.Message
		if msg == "" {
			msg = fmt.Sprintf("status %d", res.StatusCode)
		}
		return "", time.Time{}, fmt.Errorf("instagramoauth: tukar token panjang gagal: %s", msg)
	}

	expiresAt := time.Now().Add(time.Duration(long.ExpiresIn) * time.Second)
	return long.AccessToken, expiresAt, nil
}

type Profile struct {
	ID          string
	Username    string
	AccountType string
	MediaCount  int
}

func (c *Client) FetchProfile(ctx context.Context, accessToken string) (*Profile, error) {
	params := url.Values{
		"fields":       {"id,username,account_type,media_count"},
		"access_token": {accessToken},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://graph.instagram.com/me?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("instagramoauth: gagal mengambil profil: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var p struct {
		ID          string `json:"id"`
		Username    string `json:"username"`
		AccountType string `json:"account_type"`
		MediaCount  int    `json:"media_count"`
		Error       struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, fmt.Errorf("instagramoauth: gagal membaca profil: %w", err)
	}
	if res.StatusCode != http.StatusOK || p.ID == "" {
		msg := p.Error.Message
		if msg == "" {
			msg = fmt.Sprintf("status %d", res.StatusCode)
		}
		return nil, fmt.Errorf("instagramoauth: ambil profil gagal: %s", msg)
	}
	return &Profile{ID: p.ID, Username: p.Username, AccountType: p.AccountType, MediaCount: p.MediaCount}, nil
}

type Media struct {
	ID           string
	Caption      string
	MediaType    string // IMAGE, VIDEO, CAROUSEL_ALBUM
	MediaURL     string
	Permalink    string
	ThumbnailURL string
}

// FetchMedia -- limit dibatasi wajar di sisi pemanggil (social_connect.go
// memakai 6, sama seperti jumlah yang ditampilkan Linktree) lewat param
// "limit" bawaan Graph API.
func (c *Client) FetchMedia(ctx context.Context, accessToken string, limit int) ([]Media, error) {
	params := url.Values{
		"fields":       {"id,caption,media_type,media_url,permalink,thumbnail_url"},
		"access_token": {accessToken},
		"limit":        {strconv.Itoa(limit)},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://graph.instagram.com/me/media?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("instagramoauth: gagal mengambil media: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var list struct {
		Data []struct {
			ID           string `json:"id"`
			Caption      string `json:"caption"`
			MediaType    string `json:"media_type"`
			MediaURL     string `json:"media_url"`
			Permalink    string `json:"permalink"`
			ThumbnailURL string `json:"thumbnail_url"`
		} `json:"data"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &list); err != nil {
		return nil, fmt.Errorf("instagramoauth: gagal membaca daftar media: %w", err)
	}
	if res.StatusCode != http.StatusOK {
		msg := list.Error.Message
		if msg == "" {
			msg = fmt.Sprintf("status %d", res.StatusCode)
		}
		return nil, fmt.Errorf("instagramoauth: ambil media gagal: %s", msg)
	}

	out := make([]Media, 0, len(list.Data))
	for _, d := range list.Data {
		out = append(out, Media{
			ID: d.ID, Caption: d.Caption, MediaType: d.MediaType,
			MediaURL: d.MediaURL, Permalink: d.Permalink, ThumbnailURL: d.ThumbnailURL,
		})
	}
	return out, nil
}
