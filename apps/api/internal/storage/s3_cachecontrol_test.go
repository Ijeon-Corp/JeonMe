package storage

import "testing"

// TestCacheControlForKey -- regresi audit optimasi Cloudflare 21 September
// 2026: objek privat (produk berbayar, KYC, salinan berwatermark) tidak
// boleh membawa header cache publik "immutable" (bisa di-cache CDN di depan
// storage), sementara objek publik tetap immutable seperti sebelumnya.
func TestCacheControlForKey(t *testing.T) {
	const publicCC = "public, max-age=31536000, immutable"
	const privateCC = "private, no-store"
	cases := []struct {
		key  string
		want string
	}{
		{"products/abc/file.pdf", privateCC},
		{"kyc/user-1/ktp.jpg", privateCC},
		{"watermarked/order-1/etag/file.pdf", privateCC},
		{"gallery-images/link-1/x.webp", publicCC},
		{"avatars/user-1.webp", publicCC},
		{"covers/product-1.webp", publicCC},
		{"link-media/link-1/node.webp", publicCC},
		// Bukan prefix privat sungguhan -- "products" tanpa slash / nama mirip.
		{"products-public/x.webp", publicCC},
		{"my-kyc/x.jpg", publicCC},
	}
	for _, tc := range cases {
		if got := cacheControlForKey(tc.key); got != tc.want {
			t.Errorf("cacheControlForKey(%q) = %q, want %q", tc.key, got, tc.want)
		}
	}
}
