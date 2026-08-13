// Package googleoauth membungkus alur OAuth 2.0 Authorization Code Google
// (permintaan langsung pengguna, 13 Agustus 2026: "tambahkan di login dan
// register login via google") -- SENGAJA tanpa dependency google-api-go-
// client/golang.org/x/oauth2 (paket resmi Google itu berat, seluruh modul
// ikut ke go.sum walau cuma butuh satu subpaket), pola yang sama dengan
// internal/midtrans: client HTTP mentah (net/http + encoding/json) yang
// bicara langsung ke endpoint REST publik Google.
//
// Verifikasi ID token TIDAK mengimplementasikan JWKS/RSA signature
// verification manual (rawan salah di detail seperti byte-order modulus
// RSA) -- sebagai gantinya dipanggil DUA endpoint resmi Google berurutan:
// (1) token endpoint untuk menukar authorization code (server-to-server,
// diautentikasi pakai client_secret lewat TLS -- ini sendiri sudah membuat
// id_token yang dikembalikan bisa dipercaya, beda dari alur implicit/GSI
// yang id_token-nya lewat browser dan HARUS diverifikasi ulang), (2)
// endpoint tokeninfo sebagai lapisan pertahanan kedua (Google MEMVALIDASI
// signature untuk kita, kita tinggal cocokkan klaim aud).
package googleoauth

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

// ErrNotConfigured -- dikembalikan kalau GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET
// belum diisi, dipakai handler untuk membalas error yang jelas (501), bukan
// panic/500 buram -- pola sama seperti midtrans.ErrNotConfigured.
var ErrNotConfigured = errors.New("googleoauth: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET belum diset")

type Client struct {
	ClientID     string
	ClientSecret string
	HTTP         *http.Client
}

func NewClient(clientID, clientSecret string) *Client {
	return &Client{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		HTTP:         &http.Client{Timeout: 10 * time.Second},
	}
}

// Profile -- klaim relevan dari ID token Google setelah diverifikasi lewat
// tokeninfo (lihat verifyIDToken).
type Profile struct {
	Sub           string
	Email         string
	EmailVerified bool
	Name          string
	Picture       string
}

type tokenResponse struct {
	IDToken   string `json:"id_token"`
	Error     string `json:"error"`
	ErrorDesc string `json:"error_description"`
}

// Exchange menukar authorization code (dikirim frontend sesudah Google
// redirect balik ke /auth/google/callback) jadi profil pengguna
// terverifikasi. redirectURI WAJIB byte-per-byte identik dengan yang
// dipakai frontend saat membuka layar consent Google di awal -- kalau
// tidak cocok, Google menolak permintaan ini sendiri (bukan sesuatu yang
// perlu divalidasi ulang manual di sini).
func (c *Client) Exchange(ctx context.Context, code, redirectURI string) (*Profile, error) {
	if c.ClientID == "" || c.ClientSecret == "" {
		return nil, ErrNotConfigured
	}

	form := url.Values{
		"code":          {code},
		"client_id":     {c.ClientID},
		"client_secret": {c.ClientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("googleoauth: gagal menghubungi Google: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var tok tokenResponse
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, fmt.Errorf("googleoauth: gagal membaca respons token: %w", err)
	}
	if res.StatusCode != http.StatusOK || tok.Error != "" {
		msg := tok.ErrorDesc
		if msg == "" {
			msg = tok.Error
		}
		if msg == "" {
			msg = fmt.Sprintf("status %d", res.StatusCode)
		}
		return nil, fmt.Errorf("googleoauth: tukar kode gagal: %s", msg)
	}
	if tok.IDToken == "" {
		return nil, errors.New("googleoauth: respons token tidak berisi id_token")
	}

	return c.verifyIDToken(ctx, tok.IDToken)
}

type tokenInfoResponse struct {
	Aud           string `json:"aud"`
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	ErrorDesc     string `json:"error_description"`
}

// verifyIDToken -- lihat catatan panjang di komentar package soal kenapa
// dobel-cek lewat endpoint resmi ini alih-alih verifikasi JWKS/RSA manual.
func (c *Client) verifyIDToken(ctx context.Context, idToken string) (*Profile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://oauth2.googleapis.com/tokeninfo?id_token="+url.QueryEscape(idToken), nil)
	if err != nil {
		return nil, err
	}

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("googleoauth: gagal memverifikasi id_token: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var info tokenInfoResponse
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, fmt.Errorf("googleoauth: gagal membaca tokeninfo: %w", err)
	}
	if res.StatusCode != http.StatusOK {
		msg := info.ErrorDesc
		if msg == "" {
			msg = fmt.Sprintf("status %d", res.StatusCode)
		}
		return nil, fmt.Errorf("googleoauth: id_token tidak valid: %s", msg)
	}
	if info.Aud != c.ClientID {
		return nil, errors.New("googleoauth: audiensi id_token tidak cocok")
	}
	if info.Sub == "" || info.Email == "" {
		return nil, errors.New("googleoauth: id_token tidak berisi sub/email")
	}

	return &Profile{
		Sub:           info.Sub,
		Email:         info.Email,
		EmailVerified: info.EmailVerified == "true",
		Name:          info.Name,
		Picture:       info.Picture,
	}, nil
}
