package handlers

import "testing"

func TestValidateBlockStyle(t *testing.T) {
	ok := blockStyle{Bg: "#111111", Text: "#FFFFFF", Font: "poppins", FontSize: "lg", FontWeight: "bold", Align: "center", ButtonBg: "#d7ff60", ButtonText: "#111111", Rounded: "full"}
	if _, err := validateBlockStyle(ok); err != nil {
		t.Fatalf("valid style ditolak: %v", err)
	}
	if b, err := validateBlockStyle(blockStyle{}); err != nil || string(b) != "{}" {
		t.Fatalf("style kosong harus jadi {}: %s %v", b, err)
	}
	bad := []blockStyle{
		{Bg: "red"}, {Text: "#12345"}, {Font: "comic-sans"}, {FontSize: "huge"},
		{FontWeight: "900"}, {Align: "justify"}, {ButtonBg: "url(x)"}, {Rounded: "pill"},
	}
	for _, s := range bad {
		if _, err := validateBlockStyle(s); err == nil {
			t.Errorf("harus ditolak: %+v", s)
		}
	}
}
