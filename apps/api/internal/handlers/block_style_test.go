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

// TestValidateBlockData_VideoSource -- sumber video "upload" (25 September
// 2026, video_file.go): source hanya url/upload, video_file_url wajib
// http(s) kalau diisi, blok upload boleh tanpa video_url.
func TestValidateBlockData_VideoSource(t *testing.T) {
	cases := []struct {
		data map[string]any
		ok   bool
	}{
		{map[string]any{"source": "upload"}, true},
		{map[string]any{"source": "upload", "video_file_url": "https://cdn.example.com/v.mp4"}, true},
		{map[string]any{"source": "url", "video_url": "https://www.youtube.com/watch?v=abc"}, true},
		{map[string]any{"source": "vimeo"}, false},
		{map[string]any{"source": "upload", "video_file_url": "javascript:alert(1)"}, false},
	}
	for _, tc := range cases {
		if _, ok := validateBlockDataAtDepth("video", tc.data, 0); ok != tc.ok {
			t.Errorf("data %v: ok=%v, harap %v", tc.data, ok, tc.ok)
		}
	}
}
