// Package crypto menyediakan enkripsi simetris (AES-256-GCM) untuk data
// sensitif yang HARUS bisa didekripsi lagi (nomor rekening/e-wallet
// payout_methods, Modul Settings §3) -- beda dari bcrypt/SHA-256 yang
// sudah dipakai di tempat lain untuk password/token (satu arah, sengaja
// tidak bisa dibalik).
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// Encrypt mengenkripsi plaintext dengan AES-256-GCM. key harus PERSIS 32
// byte (AES-256) -- lihat config.EncryptionKey. Nonce acak digabung di
// depan ciphertext (pola umum GCM) supaya Decrypt tidak perlu argumen
// terpisah.
func Encrypt(key []byte, plaintext string) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("crypto: kunci tidak valid: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("crypto: gagal menyiapkan GCM: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("crypto: gagal membuat nonce: %w", err)
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt membalikkan Encrypt.
func Decrypt(key []byte, encoded string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("crypto: gagal decode base64: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("crypto: kunci tidak valid: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("crypto: gagal menyiapkan GCM: %w", err)
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("crypto: ciphertext terlalu pendek")
	}
	nonce, ciphertext := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("crypto: gagal dekripsi (kunci salah atau data rusak): %w", err)
	}
	return string(plaintext), nil
}

// Mask menyamarkan nomor rekening/e-wallet untuk ditampilkan ke pengguna
// (mis. daftar payout_methods) -- hanya 4 digit terakhir yang terlihat,
// PERSIS SEKALI didekripsi penuh (saat resolve tujuan withdraw), tidak
// pernah dikirim utuh kembali ke klien setelah dibuat.
func Mask(accountNumber string) string {
	if len(accountNumber) <= 4 {
		return "••••"
	}
	return "••••" + accountNumber[len(accountNumber)-4:]
}
