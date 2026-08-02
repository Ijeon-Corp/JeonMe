package crypto

import "testing"

var testKey = []byte("jeonme-dev-encryption-key-32-ok!")

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	encrypted, err := Encrypt(testKey, "1234567890")
	if err != nil {
		t.Fatalf("Encrypt gagal: %v", err)
	}
	if encrypted == "1234567890" {
		t.Fatal("hasil enkripsi sama persis dengan plaintext -- ekspektasi berbeda")
	}

	decrypted, err := Decrypt(testKey, encrypted)
	if err != nil {
		t.Fatalf("Decrypt gagal: %v", err)
	}
	if decrypted != "1234567890" {
		t.Errorf("Decrypt() = %q, ekspektasi \"1234567890\"", decrypted)
	}
}

func TestEncrypt_SameInputDifferentOutput(t *testing.T) {
	a, err := Encrypt(testKey, "1234567890")
	if err != nil {
		t.Fatalf("Encrypt gagal: %v", err)
	}
	b, err := Encrypt(testKey, "1234567890")
	if err != nil {
		t.Fatalf("Encrypt gagal: %v", err)
	}
	if a == b {
		t.Error("dua Encrypt() untuk plaintext yang sama menghasilkan ciphertext identik -- nonce seharusnya acak tiap panggilan")
	}
}

func TestDecrypt_WrongKeyFails(t *testing.T) {
	encrypted, err := Encrypt(testKey, "1234567890")
	if err != nil {
		t.Fatalf("Encrypt gagal: %v", err)
	}

	wrongKey := []byte("kunci-yang-salah-tapi-32-byte-ok")
	if _, err := Decrypt(wrongKey, encrypted); err == nil {
		t.Error("Decrypt dengan kunci salah tidak menghasilkan error, ekspektasi gagal")
	}
}

func TestMask(t *testing.T) {
	cases := map[string]string{
		"1234567890": "••••7890",
		"1234":       "••••",
		"12":         "••••",
	}
	for input, want := range cases {
		if got := Mask(input); got != want {
			t.Errorf("Mask(%q) = %q, ekspektasi %q", input, got, want)
		}
	}
}
