// Package tiktokoauth membungkus alur OAuth TikTok Login Kit v2 +
// Display API v2 -- permintaan langsung pengguna, 17 Agustus 2026: "saya
// mau jeonme ini bisa connect ke akun kita contoh nya instagram tiktok",
// diriset dulu lewat benchmark Linktree ("Profile Kit" -- login + tampilkan
// s/d 6 video terbaru bisa diputar langsung). Pola sama dengan
// internal/googleoauth & internal/instagramoauth (raw net/http, tanpa SDK
// resmi TikTok).
//
// Endpoint disusun dari dokumentasi resmi developers.tiktok.com per
// Agustus 2026 -- kredensial (TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET)
// HARUS didaftarkan lewat TikTok for Developers (developers.tiktok.com),
// scope user.info.basic + video.list, tidak bisa disintesis (lihat
// ErrNotConfigured).
package tiktokoauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var ErrNotConfigured = errors.New("tiktokoauth: TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET belum diset")

type Client struct {
	ClientKey    string
	ClientSecret string
	HTTP         *http.Client
}

func NewClient(clientKey, clientSecret string) *Client {
	return &Client{ClientKey: clientKey, ClientSecret: clientSecret, HTTP: &http.Client{Timeout: 15 * time.Second}}
}

// AuthURL -- redirect_uri WAJIB terdaftar persis di TikTok Developer
// Portal (menu "Login Kit" app-nya). Scope user.info.basic (profil) +
// video.list (daftar video utk feed) -- TIDAK minta scope publikasi
// apa pun, Jeonme cuma membaca.
func (c *Client) AuthURL(redirectURI, state string) string {
	params := url.Values{
		"client_key":    {c.ClientKey},
		"response_type": {"code"},
		"scope":         {"user.info.basic,video.list"},
		"redirect_uri":  {redirectURI},
		"state":         {state},
	}
	return "https://www.tiktok.com/v2/auth/authorize/?" + params.Encode()
}

type Token struct {
	AccessToken      string
	RefreshToken     string
	ExpiresAt        time.Time
	RefreshExpiresAt time.Time
	OpenID           string
}

func (c *Client) Exchange(ctx context.Context, code, redirectURI string) (*Token, error) {
	form := url.Values{
		"client_key":    {c.ClientKey},
		"client_secret": {c.ClientSecret},
		"code":          {code},
		"grant_type":    {"authorization_code"},
		"redirect_uri":  {redirectURI},
	}
	return c.tokenRequest(ctx, form)
}

// Refresh -- access_token TikTok cuma bertahan 24 jam (jauh lebih pendek
// dari Instagram yang 60 hari), jadi WAJIB dijadwalkan ulang jauh lebih
// sering -- lihat TODO job terjadwal di social_connect.go. refresh_token
// sendiri bertahan 365 hari, dan (per dokumentasi resmi TikTok) BISA
// berubah tiap kali dipakai -- pemanggil WAJIB menyimpan RefreshToken yang
// baru dikembalikan di sini, bukan terus memakai yang lama.
func (c *Client) Refresh(ctx context.Context, refreshToken string) (*Token, error) {
	form := url.Values{
		"client_key":    {c.ClientKey},
		"client_secret": {c.ClientSecret},
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	}
	return c.tokenRequest(ctx, form)
}

func (c *Client) tokenRequest(ctx context.Context, form url.Values) (*Token, error) {
	if c.ClientKey == "" || c.ClientSecret == "" {
		return nil, ErrNotConfigured
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://open.tiktokapis.com/v2/oauth/token/", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Cache-Control", "no-cache")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tiktokoauth: gagal menghubungi TikTok: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var tok struct {
		AccessToken      string `json:"access_token"`
		ExpiresIn        int    `json:"expires_in"`
		RefreshToken     string `json:"refresh_token"`
		RefreshExpiresIn int    `json:"refresh_expires_in"`
		OpenID           string `json:"open_id"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, fmt.Errorf("tiktokoauth: gagal membaca respons token: %w", err)
	}
	if res.StatusCode != http.StatusOK || tok.AccessToken == "" {
		msg := tok.ErrorDescription
		if msg == "" {
			msg = tok.Error
		}
		if msg == "" {
			msg = fmt.Sprintf("status %d", res.StatusCode)
		}
		return nil, fmt.Errorf("tiktokoauth: tukar token gagal: %s", msg)
	}

	now := time.Now()
	return &Token{
		AccessToken:      tok.AccessToken,
		RefreshToken:     tok.RefreshToken,
		ExpiresAt:        now.Add(time.Duration(tok.ExpiresIn) * time.Second),
		RefreshExpiresAt: now.Add(time.Duration(tok.RefreshExpiresIn) * time.Second),
		OpenID:           tok.OpenID,
	}, nil
}

type Profile struct {
	OpenID      string
	Username    string
	DisplayName string
	AvatarURL   string
}

func (c *Client) FetchProfile(ctx context.Context, accessToken string) (*Profile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name,avatar_url", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tiktokoauth: gagal mengambil profil: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Data struct {
			User struct {
				OpenID      string `json:"open_id"`
				Username    string `json:"username"`
				DisplayName string `json:"display_name"`
				AvatarURL   string `json:"avatar_url"`
			} `json:"user"`
		} `json:"data"`
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("tiktokoauth: gagal membaca profil: %w", err)
	}
	if res.StatusCode != http.StatusOK || resp.Data.User.OpenID == "" {
		msg := resp.Error.Message
		if msg == "" {
			msg = fmt.Sprintf("status %d", res.StatusCode)
		}
		return nil, fmt.Errorf("tiktokoauth: ambil profil gagal: %s", msg)
	}
	u := resp.Data.User
	return &Profile{OpenID: u.OpenID, Username: u.Username, DisplayName: u.DisplayName, AvatarURL: u.AvatarURL}, nil
}

type Video struct {
	ID            string
	CoverImageURL string
	Title         string
	ShareURL      string
	EmbedLink     string
}

// FetchVideos -- maxCount dibatasi wajar di sisi pemanggil (social_connect.go
// memakai 6, sama seperti Linktree). API ini POST (bukan GET seperti
// kebanyakan endpoint baca lain) sesuai dokumentasi resmi TikTok Display API v2.
func (c *Client) FetchVideos(ctx context.Context, accessToken string, maxCount int) ([]Video, error) {
	bodyJSON := fmt.Sprintf(`{"max_count":%d}`, maxCount)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://open.tiktokapis.com/v2/video/list/?fields=id,cover_image_url,title,share_url,embed_link",
		strings.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tiktokoauth: gagal mengambil video: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Data struct {
			Videos []struct {
				ID            string `json:"id"`
				CoverImageURL string `json:"cover_image_url"`
				Title         string `json:"title"`
				ShareURL      string `json:"share_url"`
				EmbedLink     string `json:"embed_link"`
			} `json:"videos"`
		} `json:"data"`
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("tiktokoauth: gagal membaca daftar video: %w", err)
	}
	if res.StatusCode != http.StatusOK || (resp.Error.Code != "" && resp.Error.Code != "ok") {
		msg := resp.Error.Message
		if msg == "" {
			msg = fmt.Sprintf("status %d", res.StatusCode)
		}
		return nil, fmt.Errorf("tiktokoauth: ambil video gagal: %s", msg)
	}

	out := make([]Video, 0, len(resp.Data.Videos))
	for _, v := range resp.Data.Videos {
		out = append(out, Video{ID: v.ID, CoverImageURL: v.CoverImageURL, Title: v.Title, ShareURL: v.ShareURL, EmbedLink: v.EmbedLink})
	}
	return out, nil
}
