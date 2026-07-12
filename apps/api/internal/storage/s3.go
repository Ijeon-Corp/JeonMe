package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Client membungkus koneksi S3-compatible (MinIO self-hosted) untuk file
// produk digital (REQ-F-302/304). Endpoint bisa berupa MinIO lokal (dev),
// service "minio" di jaringan Docker internal (staging/production), atau
// provider S3-compatible lain di masa depan tanpa ubah kode pemanggil.
type Client struct {
	mc     *minio.Client
	Bucket string
}

func NewClient(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*Client, error) {
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("gagal membuat client MinIO: %w", err)
	}
	return &Client{mc: mc, Bucket: bucket}, nil
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
