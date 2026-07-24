package handlers

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// watermarkDesc -- No.85 (Sprint 10): posisi/ukuran/opacity TETAP (bukan
// bisa diatur kreator seperti Lynk.id PRO), sengaja disederhanakan untuk
// estimasi 1.5 hari. Footer kecil semi-transparan di tengah bawah supaya
// tidak mengganggu keterbacaan dokumen aslinya.
const watermarkDesc = "fontname:Helvetica, points:9, opacity:0.35, position:bc, rotation:0, color:0.4 0.4 0.4"

// isPdfKey — watermark HANYA berlaku untuk PDF (pola sama seperti Lynk.id:
// "watermark HANYA berfungsi untuk PDF yang tidak dikunci password" --
// Jeonme tidak pernah mengenkripsi file produk sama sekali, jadi syarat
// itu otomatis terpenuhi untuk semua PDF yang diunggah).
func isPdfKey(key string) bool {
	return strings.HasSuffix(strings.ToLower(key), ".pdf")
}

// applyPdfWatermark menyisipkan teks (email pembeli + ID pesanan) ke SEMUA
// halaman PDF. Bekerja seluruhnya di memori (io.ReadSeeker/io.Writer),
// TIDAK menyentuh disk -- cocok untuk ukuran file produk saat ini
// (maksimum 100MB).
func applyPdfWatermark(data []byte, watermarkText string) ([]byte, error) {
	wm, err := api.TextWatermark(watermarkText, watermarkDesc, false, false, types.POINTS)
	if err != nil {
		return nil, fmt.Errorf("gagal membuat watermark: %w", err)
	}

	var out bytes.Buffer
	if err := api.AddWatermarks(bytes.NewReader(data), &out, nil, wm, nil); err != nil {
		return nil, fmt.Errorf("gagal menyisipkan watermark: %w", err)
	}
	return out.Bytes(), nil
}
