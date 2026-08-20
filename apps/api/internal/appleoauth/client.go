// Package appleoauth membungkus alur "Sign in with Apple" Authorization
// Code (permintaan langsung pengguna, 20 Agustus 2026: "tambahkan juga
// login via apple", susulan internal/googleoauth) -- pola HTTP mentah yang
// sama (net/http + encoding/json, tanpa SDK resmi Apple yang tidak ada
// untuk Go), TAPI dua perbedaan struktural dari Google yang tidak bisa
// dihindari:
//
// (1) Client authentication Apple BUKAN client_secret statis -- Apple
// mewajibkan JWT (ES256, ditandatangani private key .p8 dari Apple
// Developer) yang di-generate ULANG tiap panggilan (buildClientSecret),
// bukan disimpan sebagai string konfigurasi.
//
// (2) Apple TIDAK PUNYA endpoint verifikasi semacam tokeninfo Google --
// id_token harus diverifikasi manual lewat JWKS (https://appleid.apple.com/
// auth/keys), dicocokkan "kid" di header JWT ke kunci publik RSA yang
// sesuai (verifyIDToken). golang-jwt/jwt/v5 SUDAH jadi dependency proyek
// ini (dipakai issueToken di auth.go untuk token sesi sendiri), jadi
// dipakai ulang di sini alih-alih menambah dependency verifikasi JWT baru.
//
// response_mode SENGAJA "query" (bukan "form_post") di sisi frontend
// (lib/apple-oauth.ts) -- form_post cuma wajib kalau scope diminta (untuk
// mengirim JSON "user" berisi nama, yang HANYA muncul di otorisasi
// PERTAMA). App ini tidak pernah menyimpan nama dari Apple (konsisten
// dengan Google -- createGoogleUser juga tidak pernah pakai profile.Name),
// jadi scope sengaja tidak diminta sama sekali, redirect Apple pun bisa
// tetap GET query string sederhana sama seperti Google -- SATU pola
// callback page yang sama (baca ?code=&state= dari URL), bukan endpoint
// terpisah yang menangani POST form.
package appleoauth

import (
	"context"
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrNotConfigured -- dikembalikan kalau APPLE_TEAM_ID/APPLE_CLIENT_ID/
// APPLE_KEY_ID/APPLE_PRIVATE_KEY belum semuanya diisi, pola sama persis
// dengan googleoauth.ErrNotConfigured (handler membalas 501 yang jelas).
var ErrNotConfigured = errors.New("appleoauth: APPLE_TEAM_ID/APPLE_CLIENT_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY belum diset")

type Client struct {
	TeamID     string
	ClientID   string // Services ID dari Apple Developer, BUKAN App ID/bundle ID
	KeyID      string
	PrivateKey string // isi file .p8 (PEM), lihat catatan format di config.go
	HTTP       *http.Client
}

func NewClient(teamID, clientID, keyID, privateKey string) *Client {
	return &Client{
		TeamID:     teamID,
		ClientID:   clientID,
		KeyID:      keyID,
		PrivateKey: privateKey,
		HTTP:       &http.Client{Timeout: 10 * time.Second},
	}
}

// Profile -- klaim relevan dari ID token Apple setelah diverifikasi lewat
// JWKS (lihat verifyIDToken). TIDAK ADA Name/Picture (beda dari
// googleoauth.Profile) -- Apple tidak pernah menyertakan keduanya di
// id_token sama sekali (nama cuma pernah lewat payload "user" terpisah
// pada otorisasi pertama via form_post, sengaja tidak dipakai app ini,
// lihat catatan package di atas; Apple juga tidak pernah punya foto profil).
type Profile struct {
	Sub           string
	Email         string
	EmailVerified bool
}

type tokenResponse struct {
	IDToken   string `json:"id_token"`
	Error     string `json:"error"`
	ErrorDesc string `json:"error_description"`
}

// Exchange menukar authorization code (dikirim frontend sesudah Apple
// redirect balik ke /auth/apple/callback) jadi profil pengguna
// terverifikasi. redirectURI WAJIB byte-per-byte identik dengan Return URL
// yang didaftarkan di Apple Developer (Certificates, Identifiers & Profiles
// > Identifiers > Services ID > Sign in with Apple > Configure) -- sama
// seperti Google, ketidakcocokan ditolak Apple sendiri.
func (c *Client) Exchange(ctx context.Context, code, redirectURI string) (*Profile, error) {
	if c.TeamID == "" || c.ClientID == "" || c.KeyID == "" || c.PrivateKey == "" {
		return nil, ErrNotConfigured
	}

	clientSecret, err := c.buildClientSecret()
	if err != nil {
		return nil, fmt.Errorf("appleoauth: gagal membuat client_secret: %w", err)
	}

	form := url.Values{
		"code":          {code},
		"client_id":     {c.ClientID},
		"client_secret": {clientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://appleid.apple.com/auth/token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("appleoauth: gagal menghubungi Apple: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var tok tokenResponse
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, fmt.Errorf("appleoauth: gagal membaca respons token: %w", err)
	}
	if res.StatusCode != http.StatusOK || tok.Error != "" {
		msg := tok.ErrorDesc
		if msg == "" {
			msg = tok.Error
		}
		if msg == "" {
			msg = fmt.Sprintf("status %d", res.StatusCode)
		}
		return nil, fmt.Errorf("appleoauth: tukar kode gagal: %s", msg)
	}
	if tok.IDToken == "" {
		return nil, errors.New("appleoauth: respons token tidak berisi id_token")
	}

	return c.verifyIDToken(ctx, tok.IDToken)
}

// buildClientSecret -- Apple TIDAK menerima client_secret statis seperti
// Google, harus JWT ES256 baru yang membuktikan kepemilikan private key
// .p8. Masa berlaku SENGAJA pendek (5 menit, jauh di bawah batas maksimal
// Apple 6 bulan) -- token ini cuma dipakai sekali untuk SATU permintaan
// exchange yang terjadi detik itu juga, tidak ada alasan membuatnya
// berumur panjang/di-cache.
func (c *Client) buildClientSecret() (string, error) {
	key, err := c.parsePrivateKey()
	if err != nil {
		return "", err
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"iss": c.TeamID,
		"iat": now.Unix(),
		"exp": now.Add(5 * time.Minute).Unix(),
		"aud": "https://appleid.apple.com",
		"sub": c.ClientID,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	token.Header["kid"] = c.KeyID
	return token.SignedString(key)
}

// parsePrivateKey -- file .p8 yang diunduh dari Apple Developer berformat
// PKCS8 PEM ("-----BEGIN PRIVATE KEY-----", BUKAN "-----BEGIN EC PRIVATE
// KEY-----" format SEC1 lama) berisi kurva P-256. \n literal (bukan
// newline sungguhan) DIGANTI dulu -- lihat catatan format lengkap di
// config.go APPLE_PRIVATE_KEY, konvensi supaya key multi-baris tetap muat
// satu baris di file .env.
func (c *Client) parsePrivateKey() (*ecdsa.PrivateKey, error) {
	normalized := strings.ReplaceAll(c.PrivateKey, "\\n", "\n")
	block, _ := pem.Decode([]byte(normalized))
	if block == nil {
		return nil, errors.New("private key PEM tidak valid")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("gagal parse private key: %w", err)
	}
	ecKey, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("private key bukan ECDSA (P-256) -- pastikan file .p8 asli dari Apple Developer, jangan diubah manual")
	}
	return ecKey, nil
}

type appleJWK struct {
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type appleJWKS struct {
	Keys []appleJWK `json:"keys"`
}

// verifyIDToken -- lihat catatan panjang di komentar package soal kenapa
// verifikasi manual lewat JWKS di sini (Apple tidak punya endpoint
// tokeninfo semacam Google).
func (c *Client) verifyIDToken(ctx context.Context, idToken string) (*Profile, error) {
	jwks, err := c.fetchJWKS(ctx)
	if err != nil {
		return nil, err
	}

	token, err := jwt.Parse(idToken, func(t *jwt.Token) (interface{}, error) {
		kid, _ := t.Header["kid"].(string)
		for _, k := range jwks.Keys {
			if k.Kid == kid {
				return jwkToRSAPublicKey(k)
			}
		}
		return nil, fmt.Errorf("kid %q tidak ditemukan di JWKS Apple", kid)
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer("https://appleid.apple.com"))
	if err != nil {
		return nil, fmt.Errorf("appleoauth: id_token tidak valid: %w", err)
	}
	if !token.Valid {
		return nil, errors.New("appleoauth: id_token tidak valid")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("appleoauth: klaim id_token tidak terbaca")
	}

	aud, _ := claims["aud"].(string)
	if aud != c.ClientID {
		return nil, errors.New("appleoauth: audiensi id_token tidak cocok")
	}
	sub, _ := claims["sub"].(string)
	email, _ := claims["email"].(string)
	if sub == "" || email == "" {
		return nil, errors.New("appleoauth: id_token tidak berisi sub/email")
	}

	// email_verified -- Apple mengirimnya sebagai boolean ATAUPUN string
	// "true"/"false" tergantung jalur klien, ditangani dua-duanya supaya
	// tidak salah tolak.
	emailVerified := false
	switch v := claims["email_verified"].(type) {
	case bool:
		emailVerified = v
	case string:
		emailVerified = v == "true"
	}

	return &Profile{Sub: sub, Email: email, EmailVerified: emailVerified}, nil
}

func (c *Client) fetchJWKS(ctx context.Context) (*appleJWKS, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://appleid.apple.com/auth/keys", nil)
	if err != nil {
		return nil, err
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("appleoauth: gagal mengambil JWKS Apple: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	var jwks appleJWKS
	if err := json.Unmarshal(body, &jwks); err != nil {
		return nil, fmt.Errorf("appleoauth: gagal membaca JWKS Apple: %w", err)
	}
	return &jwks, nil
}

// jwkToRSAPublicKey -- kunci publik JWKS Apple selalu RSA (kty="RSA"),
// modulus (n) & eksponen (e) dikodekan base64url TANPA padding standar
// JWK (RFC 7518 §6.3).
func jwkToRSAPublicKey(k appleJWK) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		return nil, fmt.Errorf("gagal decode modulus JWK: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
	if err != nil {
		return nil, fmt.Errorf("gagal decode eksponen JWK: %w", err)
	}
	e := 0
	for _, b := range eBytes {
		e = e<<8 + int(b)
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: e}, nil
}
