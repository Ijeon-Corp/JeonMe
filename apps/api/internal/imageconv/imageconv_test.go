package imageconv

import (
	"bytes"
	"errors"
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

// decodedSize -- helper dekode balik output ToWebP (lewat decoder x/image/
// webp yang sudah didaftarkan package ini) supaya test bisa memverifikasi
// dimensi PIKSEL hasil akhir, bukan cuma "berhasil tanpa error".
func decodedSize(t *testing.T, webpBytes []byte) (w, h int) {
	t.Helper()
	cfg, _, err := image.DecodeConfig(bytes.NewReader(webpBytes))
	if err != nil {
		t.Fatalf("gagal decode config hasil WebP: %v", err)
	}
	return cfg.Width, cfg.Height
}

// Gambar sisi terpanjang melebihi maxDimension harus dikecilkan proporsional
// -- ini akar perbaikan Lighthouse "Improve image delivery" (avatar/sampul
// foto kamera HP 3000-4000px yang cuma tampil sebagai thumbnail kecil).
func TestToWebP_DownscalesOversizedImage(t *testing.T) {
	out, err := ToWebP(bytes.NewReader(solidPNG(t, 3000, 2000)))
	if err != nil {
		t.Fatalf("ToWebP gagal untuk gambar besar: %v", err)
	}
	w, h := decodedSize(t, out)
	if w != maxDimension {
		t.Errorf("lebar = %d, ekspektasi sisi terpanjang dikecilkan ke %d", w, maxDimension)
	}
	wantH := 2000 * maxDimension / 3000
	if h != wantH {
		t.Errorf("tinggi = %d, ekspektasi %d (rasio aspek dipertahankan)", h, wantH)
	}
}

// Gambar yang sudah lebih kecil dari maxDimension TIDAK boleh diubah
// dimensinya (kualitas dipertahankan penuh untuk unggahan yang sudah wajar).
func TestToWebP_KeepsSmallImageDimensionsUnchanged(t *testing.T) {
	out, err := ToWebP(bytes.NewReader(solidPNG(t, 400, 300)))
	if err != nil {
		t.Fatalf("ToWebP gagal untuk gambar kecil: %v", err)
	}
	w, h := decodedSize(t, out)
	if w != 400 || h != 300 {
		t.Errorf("dimensi = %dx%d, ekspektasi tetap 400x300 (tidak di-resize)", w, h)
	}
}

// TestToWebP_RejectsDecompressionBomb -- PNG kecil (warna polos terkompresi
// habis) tapi dimensinya melebihi maxPixelsOther harus ditolak lewat
// DecodeConfig SEBELUM decode penuh, dengan ErrTooManyPixels (pesan
// khusus utk kreator, bukan "gambar tidak valid").
func TestToWebP_RejectsDecompressionBomb(t *testing.T) {
	data := solidPNG(t, 8000, 7000) // 56MP > 50MP
	if len(data) > MaxUploadSize {
		t.Fatalf("fixture terlalu besar: %d byte", len(data))
	}
	_, err := ToWebP(bytes.NewReader(data))
	if !errors.Is(err, ErrTooManyPixels) {
		t.Fatalf("expected ErrTooManyPixels, got %v", err)
	}
	if !strings.Contains(UserMessage(err), "megapiksel") {
		t.Fatalf("pesan kreator tidak menyebut resolusi: %q", UserMessage(err))
	}
}
