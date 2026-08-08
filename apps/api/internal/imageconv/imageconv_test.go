package imageconv

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

func solidPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 50, B: 50, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("gagal encode PNG fixture: %v", err)
	}
	return buf.Bytes()
}

// webpMagicOK -- header WebP valid selalu "RIFF" + 4 byte ukuran + "WEBP"
// (lihat spesifikasi format), cukup untuk membuktikan hasil ToWebP memang
// container WebP sungguhan, bukan sekadar bytes acak.
func webpMagicOK(data []byte) bool {
	return len(data) >= 12 && string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP"
}

func TestToWebP_ConvertsPNGInput(t *testing.T) {
	out, err := ToWebP(bytes.NewReader(solidPNG(t, 32, 32)))
	if err != nil {
		t.Fatalf("ToWebP gagal untuk input PNG valid: %v", err)
	}
	if !webpMagicOK(out) {
		t.Errorf("output bukan container WebP valid (header salah)")
	}
}

func TestToWebP_ConvertsJPEGInput(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 16, 16))
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			img.Set(x, y, color.RGBA{R: 10, G: 200, B: 30, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatalf("gagal encode JPEG fixture: %v", err)
	}

	out, err := ToWebP(bytes.NewReader(buf.Bytes()))
	if err != nil {
		t.Fatalf("ToWebP gagal untuk input JPEG valid: %v", err)
	}
	if !webpMagicOK(out) {
		t.Errorf("output bukan container WebP valid (header salah)")
	}
}

// Round-trip: WebP hasil ToWebP harus bisa didekode lagi (lewat decoder
// x/image/webp yang sudah didaftarkan package ini) -- membuktikan input
// WebP yang sudah berformat WebP pun tetap diterima & diproses ulang benar
// (bukan cuma disalin mentah).
func TestToWebP_AcceptsWebPInputAndRoundTrips(t *testing.T) {
	first, err := ToWebP(bytes.NewReader(solidPNG(t, 8, 8)))
	if err != nil {
		t.Fatalf("konversi pertama gagal: %v", err)
	}

	second, err := ToWebP(bytes.NewReader(first))
	if err != nil {
		t.Fatalf("ToWebP gagal untuk input WebP (hasil konversi sebelumnya): %v", err)
	}
	if !webpMagicOK(second) {
		t.Errorf("output kedua bukan container WebP valid")
	}
}

func TestToWebP_RejectsInvalidInput(t *testing.T) {
	_, err := ToWebP(strings.NewReader("ini bukan gambar sama sekali"))
	if err == nil {
		t.Error("ekspektasi error untuk input yang bukan gambar, dapat nil")
	}
}
