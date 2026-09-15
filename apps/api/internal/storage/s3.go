package storage

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Client membungkus koneksi S3-compatible (MinIO self-hosted) untuk file
// produk digital (REQ-F-302/304). Endpoint bisa berupa MinIO lokal (dev),
// service "minio" di jaringan Docker internal (staging/production), atau
// provider S3-compatible lain di masa depan tanpa ubah kode pemanggil.
type Client struct {
	mc       *minio.Client
	Bucket   string
	endpoint string
	useSSL   bool
}

func NewClient(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*Client, error) {
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("gagal membuat client MinIO: %w", err)
	}
	return &Client{mc: mc, Bucket: bucket, endpoint: endpoint, useSSL: useSSL}, nil
}

// EnsureBucket membuat bucket kalau belum ada. Dipanggil sekali saat startup
// supaya tidak perlu langkah manual "buat bucket dulu" di server baru.
func (c *Client) EnsureBucket(ctx context.Context) error {
	exists, err := c.mc.BucketExists(ctx, c.Bucket)
	if err != nil {
		return fmt.Errorf("gagal cek bucket: %w", err)
	}
	if !exists {
		if err := c.mc.MakeBucket(ctx, c.Bucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("gagal membuat bucket: %w", err)
		}
	}
	return nil
}

// EnsurePublicRead mengizinkan GetObject anonim HANYA untuk object di bawah
// prefix tertentu (mis. "avatars", "covers") -- dipakai untuk foto profil
// (REQ-F-205) & sampul produk, yang harus bisa diakses langsung sebagai URL
// publik permanen (bukan presigned URL yang kedaluwarsa 15 menit seperti
// file produk berbayar). Prefix lain (mis. "products") TETAP privat.
//
// PENTING: SetBucketPolicy MENIMPA seluruh policy, bukan menambah -- semua
// prefix publik WAJIB dikirim dalam SATU panggilan ini (lihat main.go),
// bukan dipanggil terpisah per prefix, kalau tidak prefix yang diatur
// sebelumnya akan diam-diam kehilangan akses publiknya.
func (c *Client) EnsurePublicRead(ctx context.Context, prefixes ...string) error {
	resources := make([]string, len(prefixes))
	for i, prefix := range prefixes {
		resources[i] = fmt.Sprintf(`"arn:aws:s3:::%s/%s/*"`, c.Bucket, prefix)
	}

	policy := fmt.Sprintf(`{
		"Version": "2012-10-17",
		"Statement": [
			{
				"Effect": "Allow",
				"Principal": {"AWS": ["*"]},
				"Action": ["s3:GetObject"],
				"Resource": [%s]
			}
		]
	}`, strings.Join(resources, ","))

	if err := c.mc.SetBucketPolicy(ctx, c.Bucket, policy); err != nil {
		return fmt.Errorf("gagal mengatur bucket policy publik untuk prefix %v: %w", prefixes, err)
	}
	return nil
}

// PublicURL membangun URL publik permanen (BUKAN presigned/kedaluwarsa)
// untuk object yang sudah diizinkan baca publik lewat EnsurePublicRead.
// endpoint di sini SUDAH berupa domain publik (storage.jeon.id/
// storage-staging.jeon.id di staging/production, localhost:9000 di
// lokal) -- lihat komentar S3_ENDPOINT di config.go.
func (c *Client) PublicURL(key string) string {
	scheme := "http"
	if c.useSSL {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s/%s/%s", scheme, c.endpoint, c.Bucket, key)
}

// Upload menaruh file produk di bawah key yang sudah ditentukan pemanggil
// (biasanya "products/<product_id>/<nama_file>"). Bukan presigned PUT dari
// browser langsung -- file mengalir lewat API (proxy upload) supaya validasi
// tipe/ukuran (REQ-F-302) bisa dilakukan di satu tempat sebelum sampai ke storage.
//
// CacheControl "public, max-age=31536000, immutable" -- audit performa 15
// September 2026: sebelumnya TIDAK ada Cache-Control sama sekali, jadi
// browser/CDN selalu revalidate/re-fetch setiap kunjungan ulang untuk
// SEMUA aset kreator (avatar, sampul produk, gambar katalog/galeri, ikon
// link, thumbnail, background kartu nama, dll). Aman diset "immutable"
// untuk SEMUA pemanggil karena sudah diverifikasi satu per satu (grep
// ".Upload(" di internal/handlers/*.go & internal/worker/*.go) bahwa
// SETIAP key yang ditulis lewat Upload mengikuti salah satu dari dua pola
// berikut, yang sama-sama membuat isi di balik satu URL TIDAK PERNAH
// berubah setelah dibuat:
//  1. Key deterministik ("avatars/<userID>.webp", "covers/<productID>.webp",
//     dst) yang URL publiknya SELALU ditempeli "?v=<timestamp>" yang dibuat
//     SEKALI saat upload lalu disimpan ke kolom DB (lihat komentar panjang
//     di UploadAvatar/page.go & UploadCoverImage/product.go) -- unggah ulang
//     menghasilkan URL BARU, URL lama tidak pernah dipakai lagi.
//  2. Key yang mengandung UUID acak (gallery-images/, catalog-images/) atau
//     ETag file asli (watermarked/<order>/<etag>/... di checkout.go) --
//     re-generate otomatis menghasilkan key baru, key lama tidak pernah
//     ditimpa.
//
// Dua kasus lain yang TIDAK cocok persis dengan pola di atas tapi tetap aman
// dengan alasan berbeda: (a) file produk digital mentah ("products/<id>/
// <nama_file>", product.go UploadFile) key-nya memang deterministik dan BISA
// ditimpa saat kreator unggah ulang file dengan nama sama -- tapi prefix
// "products" SENGAJA tidak dibuat publik (lihat EnsurePublicRead di atas),
// jadi satu-satunya jalan akses adalah PresignedDownloadURL yang di-generate
// ULANG setiap kali (signature+expiry unik per panggilan), bukan URL publik
// permanen yang di-cache lintas kunjungan. (b) dokumen KYC (kyc.go) juga
// key deterministik yang bisa ditimpa saat pengajuan ulang, tapi juga HANYA
// pernah diserahkan lewat presigned URL yang dibuat ulang tiap kali admin
// membuka halaman review (lihat kyc.go GetForReview), bukan URL tersimpan.
// Kalau di masa depan ada pemanggil BARU yang menimpa key stabil DAN
// mengekspos key itu sebagai PublicURL tanpa query cache-buster, "immutable"
// di sini akan salah untuknya -- jangan tambahkan pemanggil seperti itu
// tanpa meninjau ulang komentar ini.
func (c *Client) Upload(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error {
	_, err := c.mc.PutObject(ctx, c.Bucket, key, reader, size, minio.PutObjectOptions{
		ContentType:  contentType,
		CacheControl: "public, max-age=31536000, immutable",
	})
	if err != nil {
		return fmt.Errorf("gagal unggah file: %w", err)
	}
	return nil
}

// Delete menghapus object -- dipanggil saat produk dihapus supaya file lama
// tidak menumpuk selamanya di storage.
func (c *Client) Delete(ctx context.Context, key string) error {
	if key == "" {
		return nil
	}
	return c.mc.RemoveObject(ctx, c.Bucket, key, minio.RemoveObjectOptions{})
}

// Download mengambil seluruh isi object ke memori -- dipakai No.85
// (watermark PDF) yang perlu memproses seluruh byte file produk sebelum
// diunggah ulang sebagai salinan ber-watermark. Cukup aman untuk ukuran
// file produk saat ini (maksimum 100MB, lihat maxProductFileSize) --
// BUKAN pola streaming, jangan dipakai untuk file yang bisa jauh lebih
// besar di masa depan.
func (c *Client) Download(ctx context.Context, key string) ([]byte, error) {
	obj, err := c.mc.GetObject(ctx, c.Bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil file: %w", err)
	}
	defer obj.Close()

	data, err := io.ReadAll(obj)
	if err != nil {
		return nil, fmt.Errorf("gagal membaca file: %w", err)
	}
	return data, nil
}

// PresignedDownloadURL — REQ-F-304: URL unduhan aman & kedaluwarsa, bukan
// tautan permanen ke file. Dipakai dashboard kreator untuk mengecek file yang
// diunggah, dan nantinya oleh alur checkout (Sprint 3) untuk pembeli.
func (c *Client) PresignedDownloadURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	u, err := c.mc.PresignedGetObject(ctx, c.Bucket, key, expiry, nil)
	if err != nil {
		return "", fmt.Errorf("gagal membuat signed URL: %w", err)
	}
	return u.String(), nil
}

// ETag — audit performa 4 September 2026: dipakai checkout.go
// (downloadURLFor) supaya bisa membuat KEY salinan ber-watermark yang
// mengikutsertakan versi file asli, bukan cuma nama file. Tanpa ini, kalau
// kreator mengunggah ULANG file dengan nama yang sama (key S3 identik --
// lihat product.go UploadFile: key = "products/<id>/<nama file>"), salinan
// ber-watermark LAMA yang di-cache di bawah key yang sama akan tetap
// dianggap "sudah ada" dan diserahkan ke pembeli walau isinya sudah usang.
// Menyertakan ETag di key watermarked membuat perubahan file otomatis
// menghasilkan key baru (cache miss, diproses ulang), tanpa perlu logika
// invalidasi eksplisit di mana pun.
func (c *Client) ETag(ctx context.Context, key string) (string, error) {
	info, err := c.mc.StatObject(ctx, c.Bucket, key, minio.StatObjectOptions{})
	if err != nil {
		return "", fmt.Errorf("gagal memeriksa file: %w", err)
	}
	return info.ETag, nil
}

// Exists — cek murah (HEAD, bukan download) apakah object dengan key
// tertentu sudah ada. Dipakai untuk short-circuit pekerjaan mahal (watermark
// PDF) yang menulis ke key deterministik, supaya panggilan berulang untuk
// order yang sama (buyer klik link unduhan dua kali, atau dari 2 perangkat)
// tidak mengunduh+watermark+unggah ulang file yang identik.
func (c *Client) Exists(ctx context.Context, key string) bool {
	_, err := c.mc.StatObject(ctx, c.Bucket, key, minio.StatObjectOptions{})
	return err == nil
}
