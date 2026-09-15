package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// MaxRequestBodySize -- audit keamanan/performa profesional 15 September
// 2026 (Low): SEBELUMNYA tidak ada satu pun batas ukuran BODY request di
// level server (main.go cuma set ReadTimeout 10s, tidak ada
// r.MaxMultipartMemory ATAU middleware ukuran) -- pengecekan ukuran file
// per-handler (mis. `fileHeader.Size > maxProductFileSize` di product.go)
// baru jalan SETELAH Gin selesai membaca & mem-parsing SELURUH body
// multipart ke memori/disk sementara. Artinya klien jahat bisa mengirim
// body raksasa (puluhan/ratusan GB) yang tetap dibaca habis dulu oleh
// server sebelum ditolak -- potensi resource-exhaustion (memori/disk/CPU
// parsing) di VPS shared, terlepas dari limit per-file yang sudah benar.
//
// Nilai 120MB dipilih dari batas per-file LEGITIMATE terbesar yang ada di
// seluruh handler saat ini: maxProductFileSize (product.go) = 100MB.
// Dilebihkan sedikit (bukan pas 100MB) supaya field multipart lain dalam
// request yang sama (nama produk, deskripsi, boundary multipart, dst)
// tetap muat -- bukan ceiling yang pas-pasan sampai menolak upload sah.
// Endpoint lain (avatar/cover/audio/dst) semua jauh lebih kecil (2-20MB,
// lihat maxLinkIconSize/maxAudioFileSize/maxFileBlockSize dkk di links.go),
// jadi satu batas global di sini tidak perlu di-scope per rute -- rute
// yang TIDAK menerima upload (JSON biasa) juga tidak pernah mendekati
// ukuran ini, jadi tidak ada dampak ke lalu lintas normal.
const MaxRequestBodySize = 120 * 1024 * 1024

// MaxBodySize membungkus c.Request.Body dengan http.MaxBytesReader --
// begitu body yang DIBACA melebihi maxBytes, pembacaan berikutnya
// (termasuk oleh ParseMultipartForm/FormFile Gin di handler) langsung
// gagal dengan error "http: request body too large" alih-alih terus
// membaca. Dipasang sebagai middleware GLOBAL (lihat main.go) supaya
// berlaku SEBELUM handler mana pun (termasuk sebelum Gin mem-parsing
// multipart), bukan cuma dicek balik setelah upload selesai seperti
// validasi ukuran per-handler yang sudah ada.
func MaxBodySize(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}
