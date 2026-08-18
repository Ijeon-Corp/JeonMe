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
func (c *Client) Upload(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error {
	_, err := c.mc.PutObject(ctx, c.Bucket, key, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
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
