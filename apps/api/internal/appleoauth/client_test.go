package appleoauth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

// Tidak ada test end-to-end untuk Exchange/verifyIDToken di sini -- itu
// butuh benar-benar menghubungi appleid.apple.com (token endpoint + JWKS),
// pola yang SAMA seperti internal/googleoauth (GoogleLogin juga tidak
// pernah ditest langsung, lihat catatan lengkap di handlers/oauth_apple.go).
// Test di bawah fokus ke bagian yang MURNI (kriptografi/JWT), yang justru
// paling rawan salah detail & BISA ditest tanpa jaringan sama sekali.

// generateTestP8Key -- private key ECDSA P-256 baru + encode PKCS8 PEM,
// meniru PERSIS format file .p8 asli dari Apple Developer (bukan format
// SEC1 lama "-----BEGIN EC PRIVATE KEY-----").
func generateTestP8Key(t *testing.T) (*ecdsa.PrivateKey, string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("gagal generate key test: %v", err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("gagal marshal PKCS8: %v", err)
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})
	return key, string(pemBytes)
}

func TestParsePrivateKey_ValidPKCS8PEM_Succeeds(t *testing.T) {
	_, pemStr := generateTestP8Key(t)
	c := NewClient("team", "client", "key", pemStr)

	parsed, err := c.parsePrivateKey()
	if err != nil {
		t.Fatalf("parsePrivateKey: error tidak terduga: %v", err)
	}
	if parsed.Curve != elliptic.P256() {
		t.Errorf("kurva = %v, ekspektasi P-256", parsed.Curve)
	}
}

// Konvensi penyimpanan APPLE_PRIVATE_KEY di .env: newline literal "\n"
// (bukan newline sungguhan) supaya nilai tetap satu baris -- lihat catatan
// lengkap di config.go. parsePrivateKey WAJIB menormalisasi ini balik.
func TestParsePrivateKey_NormalizesLiteralNewlines(t *testing.T) {
	_, pemStr := generateTestP8Key(t)
	oneLine := strings.ReplaceAll(pemStr, "\n", "\\n")
	c := NewClient("team", "client", "key", oneLine)

	if _, err := c.parsePrivateKey(); err != nil {
		t.Fatalf("parsePrivateKey dengan newline literal: error tidak terduga: %v", err)
	}
}

func TestParsePrivateKey_InvalidPEM_ReturnsError(t *testing.T) {
	c := NewClient("team", "client", "key", "bukan pem sama sekali")
	if _, err := c.parsePrivateKey(); err == nil {
		t.Fatal("ekspektasi error untuk PEM tidak valid, dapat nil")
	}
}

func TestParsePrivateKey_RSAKeyInsteadOfEC_ReturnsError(t *testing.T) {
	rsaKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("gagal generate RSA key test: %v", err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(rsaKey)
	if err != nil {
		t.Fatalf("gagal marshal PKCS8: %v", err)
	}
	pemStr := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	c := NewClient("team", "client", "key", pemStr)

	if _, err := c.parsePrivateKey(); err == nil {
		t.Fatal("ekspektasi error untuk key RSA (bukan ECDSA P-256), dapat nil")
	}
}

// buildClientSecret harus menghasilkan JWT ES256 dengan klaim iss/aud/sub
// yang benar & header kid -- ini yang dikirim sebagai client_secret ke
// token endpoint Apple, salah satu detail salah di sini bikin SELURUH
// login Apple gagal di production tanpa pernah ketahuan lewat compile/vet.
func TestBuildClientSecret_ProducesValidJWTWithExpectedClaims(t *testing.T) {
	key, pemStr := generateTestP8Key(t)
	c := NewClient("TEAM123456", "id.jeon.web", "KEY1234567", pemStr)

	secret, err := c.buildClientSecret()
	if err != nil {
		t.Fatalf("buildClientSecret: error tidak terduga: %v", err)
	}

	parsed, err := jwt.Parse(secret, func(t *jwt.Token) (interface{}, error) {
		return &key.PublicKey, nil
	}, jwt.WithValidMethods([]string{"ES256"}))
	if err != nil || !parsed.Valid {
		t.Fatalf("JWT client_secret yang dihasilkan tidak valid: %v", err)
	}

	if kid, _ := parsed.Header["kid"].(string); kid != "KEY1234567" {
		t.Errorf("header kid = %q, ekspektasi %q", kid, "KEY1234567")
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatal("klaim JWT tidak terbaca")
	}
	if iss, _ := claims["iss"].(string); iss != "TEAM123456" {
		t.Errorf("iss = %q, ekspektasi Team ID %q", iss, "TEAM123456")
	}
	if sub, _ := claims["sub"].(string); sub != "id.jeon.web" {
		t.Errorf("sub = %q, ekspektasi Client ID %q", sub, "id.jeon.web")
	}
	if aud, _ := claims["aud"].(string); aud != "https://appleid.apple.com" {
		t.Errorf("aud = %q, ekspektasi https://appleid.apple.com", aud)
	}
}

// jwkToRSAPublicKey -- modulus/eksponen JWKS Apple asli dikodekan
// base64url TANPA padding (RFC 7518 §6.3), bukan base64 standar -- test
// ini pakai kunci RSA sungguhan (bukan angka bulat kecil) supaya byte-order
// modulus benar-benar teruji, bukan cuma format yang kebetulan lolos.
func TestJwkToRSAPublicKey_ReconstructsKnownKey(t *testing.T) {
	rsaKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("gagal generate RSA key test: %v", err)
	}
	pub := rsaKey.PublicKey

	nBytes := pub.N.Bytes()
	eBytes := []byte{byte(pub.E >> 16), byte(pub.E >> 8), byte(pub.E)}
	for len(eBytes) > 1 && eBytes[0] == 0 {
		eBytes = eBytes[1:]
	}

	jwk := appleJWK{
		Kid: "test-kid",
		N:   base64.RawURLEncoding.EncodeToString(nBytes),
		E:   base64.RawURLEncoding.EncodeToString(eBytes),
	}

	reconstructed, err := jwkToRSAPublicKey(jwk)
	if err != nil {
		t.Fatalf("jwkToRSAPublicKey: error tidak terduga: %v", err)
	}
	if reconstructed.E != pub.E {
		t.Errorf("E = %d, ekspektasi %d", reconstructed.E, pub.E)
	}
	if reconstructed.N.Cmp(pub.N) != 0 {
		t.Error("N (modulus) tidak cocok dengan kunci asli")
	}
}

func TestExchange_NotConfigured_ReturnsErrNotConfigured(t *testing.T) {
	c := NewClient("", "", "", "")
	_, err := c.Exchange(context.Background(), "some-code", "https://jeon.id/auth/apple/callback")
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("Exchange tanpa kredensial: error = %v, ekspektasi ErrNotConfigured", err)
	}
}
