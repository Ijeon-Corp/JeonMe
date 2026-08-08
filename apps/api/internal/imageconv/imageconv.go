// Package imageconv -- Modul Desain (permintaan langsung pengguna, 8
// Agustus 2026): "semua gambar yang diupload otomatis convert ke ekstensi
// WEBP". Dipakai bersama oleh SEMUA endpoint unggah gambar dekoratif (foto
// profil, latar kustom, sampul produk, ikon tautan) supaya format
// penyimpanan konsisten satu format modern, bukan campuran jpg/png/webp
// tergantung apa yang diunggah kreator.
//
// SENGAJA pakai encoder WebP murni-Go (github.com/HugoSmits86/nativewebp,
// TANPA libwebp/cgo) -- Dockerfile backend membangun binary dengan
// CGO_ENABLED=0 (lihat docker/api/Dockerfile) supaya image tetap statis &
// kecil di atas alpine; encoder berbasis cgo/libwebp akan memaksa ubah
// arsitektur build itu (tambah libwebp-dev di kedua stage Docker, matikan
// CGO_ENABLED=0) untuk seluruh pipeline CI/CD, risiko jauh lebih besar
// daripada manfaatnya untuk kasus pemakaian ini (foto profil/sampul/ikon
// kecil, bukan galeri foto resolusi tinggi). Konsekuensinya: encoder ini
// HANYA mendukung WebP lossless (VP8L) -- untuk foto dengan banyak warna,
// hasilnya kadang sedikit lebih besar dari JPEG kualitas-sedang aslinya,
// tapi selalu lebih kecil (atau setara) dibanding PNG, dan format akhirnya
// tetap konsisten .webp sesuai permintaan.
package imageconv

import (
	"bytes"
	"fmt"
	"image"
	_ "image/jpeg" // pendaftaran decoder JPEG (image.Decode mendeteksi format otomatis)
	_ "image/png"  // pendaftaran decoder PNG

	"github.com/HugoSmits86/nativewebp"
	_ "golang.org/x/image/webp" // pendaftaran decoder WebP (input boleh sudah berformat webp)

	"io"
)

// ContentType -- SELALU "image/webp" untuk hasil ToWebP, diekspor supaya
// caller tidak perlu mengetik literal string berulang di tiap handler.
const ContentType = "image/webp"

// ToWebP membaca gambar apa pun yang didukung (jpg/png/webp) dari r dan
// mengembalikan bytes WebP lossless hasil konversi. Error kalau r bukan
// gambar valid dari salah satu format itu.
func ToWebP(r io.Reader) ([]byte, error) {
	img, _, err := image.Decode(r)
	if err != nil {
		return nil, fmt.Errorf("gambar tidak valid atau format tidak didukung: %w", err)
	}

	var buf bytes.Buffer
	if err := nativewebp.Encode(&buf, img, nil); err != nil {
		return nil, fmt.Errorf("gagal mengonversi gambar ke WebP: %w", err)
	}
	return buf.Bytes(), nil
}
