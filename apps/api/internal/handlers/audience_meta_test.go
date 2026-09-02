package handlers

import (
	"reflect"
	"testing"
)

func TestContactKey(t *testing.T) {
	if got := contactKey("  Budi@Mail.com ", "0812"); got != "budi@mail.com" {
		t.Errorf("email harus jadi kunci lowercase, dapat %q", got)
	}
	if got := contactKey("", " 0812 "); got != "wa:0812" {
		t.Errorf("tanpa email harus jatuh ke WA, dapat %q", got)
	}
	if got := contactKey("", ""); got != "" {
		t.Errorf("tanpa keduanya harus kosong, dapat %q", got)
	}
}

func TestNormalizeTags(t *testing.T) {
	got := normalizeTags([]string{" Reseller ", "", "reseller", "VIP", "vip "})
	want := []string{"Reseller", "VIP"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("dedupe case-insensitive gagal: %v", got)
	}
	long := normalizeTags([]string{"abcdefghijklmnopqrstuvwxyz0123456789"})
	if len([]rune(long[0])) != 30 {
		t.Errorf("tag harus dipotong ke 30 rune, dapat %d", len([]rune(long[0])))
	}
	many := make([]string, 0, 25)
	for i := 0; i < 25; i++ {
		many = append(many, string(rune('a'+i)))
	}
	if n := len(normalizeTags(many)); n != 20 {
		t.Errorf("maksimal 20 tag, dapat %d", n)
	}
}
