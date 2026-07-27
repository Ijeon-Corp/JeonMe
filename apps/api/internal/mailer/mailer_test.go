package mailer

import "testing"

// Audit keamanan (28 Juli 2026): regresi untuk perbaikan injeksi header SMTP
// (CWE-93) -- subject email notifikasi pembelian bisa berisi nama produk
// yang diisi kreator sendiri, yang sebelumnya bisa menyisipkan header SMTP
// tambahan (mis. "Bcc: attacker@...") lewat CR/LF di dalamnya.
func TestStripCRLF(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"tanpa CR/LF", "Judul Produk Biasa", "Judul Produk Biasa"},
		{"CRLF injeksi header", "Judul\r\nBcc: attacker@evil.com", "JudulBcc: attacker@evil.com"},
		{"LF saja", "Judul\nBaris Kedua", "JudulBaris Kedua"},
		{"CR saja", "Judul\rBaris Kedua", "JudulBaris Kedua"},
		{"string kosong", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := stripCRLF(tc.in)
			if got != tc.want {
				t.Errorf("stripCRLF(%q) = %q, want %q", tc.in, got, tc.want)
			}
			if got != tc.in && (containsByte(got, '\r') || containsByte(got, '\n')) {
				t.Errorf("stripCRLF(%q) = %q masih mengandung CR/LF", tc.in, got)
			}
		})
	}
}

func containsByte(s string, b byte) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return true
		}
	}
	return false
}
