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
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // pendaftaran decoder WebP (input boleh sudah berformat webp)

	"io"
)

// ContentType -- SELALU "image/webp" untuk hasil ToWebP, diekspor supaya
// caller tidak perlu mengetik literal string berulang di tiap handler.
const ContentType = "image/webp"

// maxDimension -- audit performa (laporan Lighthouse pengguna, 3 September
// 2026: "Improve image delivery Est savings of 1,723 KiB", "Avoid enormous
// network payloads Total size was 5,010 KiB" di halaman dashboard yang
// menampilkan LivePreviewPanel/PagePreview). Akar masalah: ToWebP SEBELUMNYA
// cuma ganti format, dimensi piksel asli dipertahankan penuh -- foto kamera
// HP modern lazim 3000-4000px sisi terpanjang, jadi avatar/sampul yang
// TAMPIL cuma sebagai thumbnail kecil (mis. 48px di baris tabel produk, atau
// mockup pratinjau di panel dashboard) tetap mengirim file beresolusi penuh
// ke browser setiap kali dirender. 1600px sisi terpanjang dipilih sebagai
// batas atas yang generus -- lebih dari cukup untuk background full-bleed di
// layar HP mana pun (dekorasi terbesar yang dipakai gambar ini), sekaligus
// memotong drastis foto kamera mentah. TIDAK resize gambar yang sudah lebih
// kecil (kualitas dipertahankan penuh untuk kasus normal). Cuma memengaruhi
// UNGGAHAN BARU -- gambar lama yang sudah tersimpan di storage tidak ikut
// diproses ulang (di luar cakupan perbaikan ini).
const maxDimension = 1600

// ToWebP membaca gambar apa pun yang didukung (jpg/png/webp) dari r,
// mengecilkan dimensinya kalau sisi terpanjang melebihi maxDimension (lihat
// catatan di atas), lalu mengembalikan bytes WebP lossless hasil konversi.
// Error kalau r bukan gambar valid dari salah satu format itu.
func ToWebP(r io.Reader) ([]byte, error) {
	img, _, err := image.Decode(r)
	if err != nil {
		return nil, fmt.Errorf("gambar tidak valid atau format tidak didukung: %w", err)
	}

	img = downscale(img, maxDimension)

	var buf bytes.Buffer
	if err := nativewebp.Encode(&buf, img, nil); err != nil {
		return nil, fmt.Errorf("gagal mengonversi gambar ke WebP: %w", err)
	}
	return buf.Bytes(), nil
}

// downscale mengecilkan img secara proporsional supaya sisi terpanjangnya
// tidak melebihi max, mempertahankan rasio aspek. img yang sisi
// terpanjangnya sudah <= max dikembalikan apa adanya (tanpa re-encode,
// menghindari kehilangan kualitas sia-sia untuk unggahan yang sudah wajar
// ukurannya). CatmullRom dipilih (bukan NearestNeighbor/ApproxBiLinear)
// karena kualitas downscale-nya paling tajam di antara interpolator
// x/image/draw -- sepadan dipakai di sini karena resize cuma terjadi sekali
// per unggahan, bukan di jalur request panas.
func downscale(img image.Image, max int) image.Image {
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w <= max && h <= max {
		return img
	}

	var newW, newH int
	if w >= h {
		newW = max
		newH = int(float64(h) * float64(max) / float64(w))
	} else {
		newH = max
		newW = int(float64(w) * float64(max) / float64(h))
	}
	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Src, nil)
	return dst
}
