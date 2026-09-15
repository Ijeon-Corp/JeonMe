package handlers

import (
	"testing"

	"github.com/google/uuid"
)

// TestPrewarmWatermark_SkipsUnpaidOrder -- audit performa profesional 15
// September 2026 (Medium-High, lihat catatan lengkap di
// queue.TypeWatermarkPrewarm & CheckoutHandler.PrewarmWatermark): task ini
// dienqueue TANPA syarat oleh ApplyOrderStatus, jadi PrewarmWatermark
// SENDIRI yang wajib menyaring order yang belum/bukan lagi "paid" --
// terutama penting karena test handler ini punya h.Storage == nil
// (newTestCheckoutHandler), jadi kalau gating status gagal & fungsi
// mencoba lanjut ke downloadURLFor, test ini akan panic (nil pointer)
// alih-alih cuma gagal assert.
func TestPrewarmWatermark_SkipsUnpaidOrder(t *testing.T) {
	checkout, auth := newTestCheckoutHandler(t, "")
	userID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)

	orderID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status) VALUES ($1, $2, 'buyer@example.com', 25000, 'pending')
	`, orderID, productID); err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	if err := checkout.PrewarmWatermark(t.Context(), orderID); err != nil {
		t.Fatalf("PrewarmWatermark (order pending) = %v, ekspektasi nil", err)
	}
}

// TestPrewarmWatermark_SkipsDonationAndCourseOrders -- donasi tidak pernah
// punya file (REQ-F-71) & kursus bukan PDF (bab video, No.91) -- keduanya
// harus dilewati SEBELUM fungsi ini pernah menyentuh h.Storage sama sekali
// (h.Storage == nil di test handler, jadi salah gating berarti panic).
func TestPrewarmWatermark_SkipsDonationAndCourseOrders(t *testing.T) {
	checkout, auth := newTestCheckoutHandler(t, "")
	userID := registerTestUser(t, auth)

	donationProductID := createActiveTestProduct(t, checkout, userID, 25000)
	if _, err := checkout.DB.Exec(t.Context(), `UPDATE products SET is_donation = true, watermark_enabled = true WHERE id = $1`, donationProductID); err != nil {
		t.Fatalf("gagal set is_donation: %v", err)
	}
	donationOrderID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status) VALUES ($1, $2, 'buyer@example.com', 25000, 'paid')
	`, donationOrderID, donationProductID); err != nil {
		t.Fatalf("gagal setup order donasi: %v", err)
	}
	if err := checkout.PrewarmWatermark(t.Context(), donationOrderID); err != nil {
		t.Fatalf("PrewarmWatermark (donasi) = %v, ekspektasi nil", err)
	}

	courseProductID := createActiveTestProduct(t, checkout, userID, 25000)
	if _, err := checkout.DB.Exec(t.Context(), `UPDATE products SET is_course = true, watermark_enabled = true WHERE id = $1`, courseProductID); err != nil {
		t.Fatalf("gagal set is_course: %v", err)
	}
	courseOrderID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status) VALUES ($1, $2, 'buyer@example.com', 25000, 'paid')
	`, courseOrderID, courseProductID); err != nil {
		t.Fatalf("gagal setup order kursus: %v", err)
	}
	if err := checkout.PrewarmWatermark(t.Context(), courseOrderID); err != nil {
		t.Fatalf("PrewarmWatermark (kursus) = %v, ekspektasi nil", err)
	}
}

// TestPrewarmWatermark_SkipsWhenStorageUnconfigured -- soft-fail konsisten
// dgn seluruh pola operasi sampingan lain di codebase ini (SMTP/S3/dst,
// lihat CLAUDE.md): kalau h.Storage nil (S3 belum dikonfigurasi), order
// yang SEBENARNYA butuh watermark tetap TIDAK boleh error keras -- worker
// yang menjalankan task ini seharusnya diam-diam melewati, bukan menandai
// task gagal & retry berulang tanpa akhir.
func TestPrewarmWatermark_SkipsWhenStorageUnconfigured(t *testing.T) {
	checkout, auth := newTestCheckoutHandler(t, "")
	userID := registerTestUser(t, auth)
	productID := createActiveTestProduct(t, checkout, userID, 25000)
	if _, err := checkout.DB.Exec(t.Context(), `UPDATE products SET watermark_enabled = true, file_key = 'products/test/file.pdf' WHERE id = $1`, productID); err != nil {
		t.Fatalf("gagal set watermark_enabled: %v", err)
	}

	orderID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status) VALUES ($1, $2, 'buyer@example.com', 25000, 'paid')
	`, orderID, productID); err != nil {
		t.Fatalf("gagal setup order test: %v", err)
	}

	if checkout.Storage != nil {
		t.Fatalf("test handler seharusnya punya Storage nil (lihat newTestCheckoutHandler)")
	}
	if err := checkout.PrewarmWatermark(t.Context(), orderID); err != nil {
		t.Fatalf("PrewarmWatermark (storage nil) = %v, ekspektasi nil (soft-fail)", err)
	}
}

// TestPrewarmWatermark_BundleQueriesItemsWithoutError -- order bundel harus
// menyusuri bundle_items (bukan file_key bundel itu sendiri, yang selalu
// kosong -- lihat migrasi 000009_bundles) tanpa error, walau tiap item
// akhirnya dilewati karena h.Storage nil di test handler (sama seperti
// test di atas) -- membuktikan query JOIN bundle_items/products di
// PrewarmWatermark benar secara sintaks & tidak menyentuh kolom yang salah.
func TestPrewarmWatermark_BundleQueriesItemsWithoutError(t *testing.T) {
	checkout, auth := newTestCheckoutHandler(t, "")
	userID := registerTestUser(t, auth)

	itemProductID := createActiveTestProduct(t, checkout, userID, 15000)
	if _, err := checkout.DB.Exec(t.Context(), `UPDATE products SET watermark_enabled = true WHERE id = $1`, itemProductID); err != nil {
		t.Fatalf("gagal set watermark_enabled item: %v", err)
	}

	bundleProductID := createActiveTestProduct(t, checkout, userID, 25000)
	if _, err := checkout.DB.Exec(t.Context(), `UPDATE products SET is_bundle = true, file_key = '' WHERE id = $1`, bundleProductID); err != nil {
		t.Fatalf("gagal set is_bundle: %v", err)
	}
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO bundle_items (bundle_product_id, item_product_id) VALUES ($1, $2)
	`, bundleProductID, itemProductID); err != nil {
		t.Fatalf("gagal setup bundle_items: %v", err)
	}

	orderID := uuid.NewString()
	if _, err := checkout.DB.Exec(t.Context(), `
		INSERT INTO orders (id, product_id, buyer_email, amount_idr, status) VALUES ($1, $2, 'buyer@example.com', 25000, 'paid')
	`, orderID, bundleProductID); err != nil {
		t.Fatalf("gagal setup order bundel: %v", err)
	}

	if err := checkout.PrewarmWatermark(t.Context(), orderID); err != nil {
		t.Fatalf("PrewarmWatermark (bundel) = %v, ekspektasi nil", err)
	}
}
