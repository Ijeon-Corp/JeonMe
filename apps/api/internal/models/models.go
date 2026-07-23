package models

import "time"

// User merepresentasikan kreator maupun admin.
// Kolom mengikuti entitas "users" pada Technical Design Document Jeonme.
type User struct {
	ID           string    `json:"id" db:"id"`
	Email        string    `json:"email" db:"email"`
	PasswordHash string    `json:"-" db:"password_hash"` // tidak pernah diserialisasi ke JSON
	Username     string    `json:"username" db:"username"`
	Role         string    `json:"role" db:"role"` // "creator" | "admin"
	KYCStatus    string    `json:"kyc_status" db:"kyc_status"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

// Page merepresentasikan halaman publik link-in-bio milik kreator.
type Page struct {
	ID          string `json:"id" db:"id"`
	UserID      string `json:"user_id" db:"user_id"`
	Theme       string `json:"theme" db:"theme"`
	Bio         string `json:"bio" db:"bio"`
	AvatarURL   string `json:"avatar_url" db:"avatar_url"`
	IsPublished bool   `json:"is_published" db:"is_published"`
}

// Link merepresentasikan satu tautan pada halaman publik.
type Link struct {
	ID       string `json:"id" db:"id"`
	PageID   string `json:"page_id" db:"page_id"`
	Title    string `json:"title" db:"title"`
	URL      string `json:"url" db:"url"`
	Position int    `json:"position" db:"position"`
	IsActive bool   `json:"is_active" db:"is_active"`
}

// Product merepresentasikan produk digital yang dijual kreator.
type Product struct {
	ID          string `json:"id" db:"id"`
	UserID      string `json:"user_id" db:"user_id"`
	Name        string `json:"name" db:"name"`
	Description string `json:"description" db:"description"`
	PriceIDR    int64  `json:"price_idr" db:"price_idr"`
	FileKey     string `json:"-" db:"file_key"` // jangan diekspos langsung, selalu lewat signed URL
	CoverImage  string `json:"cover_image_url" db:"cover_image_url"`
	IsActive    bool   `json:"is_active" db:"is_active"`
}

// Order merepresentasikan satu transaksi pembelian.
// Status mengikuti alur pada Bagian 3.2 Technical Design Document.
type Order struct {
	ID             string    `json:"id" db:"id"`
	ProductID      string    `json:"product_id" db:"product_id"`
	BuyerEmail     string    `json:"buyer_email" db:"buyer_email"`
	BuyerContact   string    `json:"buyer_contact" db:"buyer_contact"`
	AmountIDR      int64     `json:"amount_idr" db:"amount_idr"`
	PlatformFeeIDR int64     `json:"platform_fee_idr" db:"platform_fee_idr"`
	Status         string    `json:"status" db:"status"` // pending | paid | failed | expired
	PSPReference   string    `json:"psp_reference" db:"psp_reference"`
	VoucherID      *string   `json:"voucher_id,omitempty" db:"voucher_id"`
	DiscountIDR    int64     `json:"discount_idr" db:"discount_idr"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}

// Voucher merepresentasikan kode diskon yang dibuat kreator untuk produknya
// sendiri -- kode tunggal (dipakai berkali-kali sampai max_uses) atau hasil
// generate massal (batch_label diisi, tiap kode max_uses=1).
type Voucher struct {
	ID             string     `json:"id" db:"id"`
	UserID         string     `json:"user_id" db:"user_id"`
	Code           string     `json:"code" db:"code"`
	BatchLabel     string     `json:"batch_label" db:"batch_label"`
	DiscountType   string     `json:"discount_type" db:"discount_type"` // percentage | fixed
	DiscountValue  int64      `json:"discount_value" db:"discount_value"`
	MaxDiscountIDR *int64     `json:"max_discount_idr,omitempty" db:"max_discount_idr"`
	MinPurchaseIDR int64      `json:"min_purchase_idr" db:"min_purchase_idr"`
	MaxUses        *int       `json:"max_uses,omitempty" db:"max_uses"`
	UsedCount      int        `json:"used_count" db:"used_count"`
	IsActive       bool       `json:"is_active" db:"is_active"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty" db:"expires_at"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
}
