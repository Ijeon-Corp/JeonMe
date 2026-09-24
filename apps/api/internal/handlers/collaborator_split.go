package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// blockMoneyRoutingByCollaborator — penjaga bersama untuk SEMUA jalur yang
// mengarahkan ke mana uang penjualan mengalir (bagi hasil kolaborator &
// komisi afiliasi). Mengembalikan true (dan sudah menulis respons 403)
// kalau request datang lewat impersonasi X-Act-As-Owner.
//
// Alasannya, temuan audit menyeluruh 24 September 2026: CollaboratorHandler
// mendokumentasikan kontrak "kolaborator TIDAK PERNAH bisa menyentuh
// saldo/penarikan" dan menegakkannya SECARA ARSITEKTUR -- rute uang sengaja
// tidak dipasangi middleware.ActAsOwner sama sekali. Tapi dua jalur lolos
// dari pola itu karena menumpang grup produk yang MEMANG ber-ActAsOwner:
// field collaborator_splits di ProductHandler.Create/Update, dan
// AffiliateHandler.Upsert. Akibatnya kolaborator ber-izin can_edit_products
// saja (peran "sales_admin") bisa menyetel dirinya sendiri sebagai penerima
// 100% pendapatan, lalu mencairkannya lewat rute payout sebagai DIRINYA
// SENDIRI (rute payout tidak ber-ActAsOwner, jadi tidak terhalang apa pun).
// Penjaga anti-self-dealing yang sudah ada tidak menangkap ini karena
// membandingkan ke ownerUserID, yang di bawah impersonasi justru sudah
// bernilai ID pemilik.
//
// Diblokir TOTAL (bukan sekadar "tidak boleh ke diri sendiri") supaya
// konsisten dengan kontrak arsitekturnya dan sekaligus menutup kolusi
// (mengarahkan ke rekan, bukan ke diri sendiri). Pemilik tetap bisa
// mengubahnya sendiri; ini aksi langka & berisiko tinggi, bukan penyuntingan
// produk rutin. Dicek juga di frontend (products/page.tsx) supaya
// kolaborator tidak disuguhi form yang pasti ditolak.
func blockMoneyRoutingByCollaborator(c *gin.Context) bool {
	if !c.GetBool("actingAsOwner") {
		return false
	}
	c.JSON(http.StatusForbidden, gin.H{
		"error": "hanya pemilik akun yang bisa mengatur bagi hasil & komisi afiliasi -- minta pemilik akun yang mengubahnya",
	})
	return true
}

// CollaboratorSplit — Modul Settings §3 (diferensiasi dari Lynk.id):
// revenue share otomatis ke kolaborator saat produk terjual, disimpan di
// products.collaborator_splits (jsonb, lihat migrasi 000039). Persen
// (BUKAN basis poin) SENGAJA mengikuti konvensi affiliates.commission_percent
// yang sudah ada -- satu cara merepresentasikan "potongan pendapatan" di
// seluruh aplikasi, bukan dua yang berbeda.
type CollaboratorSplit struct {
	UserID  string  `json:"user_id"`
	Percent float64 `json:"percent"`
}

// CollaboratorSplitSnapshot — hasil resolusi CollaboratorSplit (persen)
// jadi rupiah ABSOLUT pada saat checkout, disimpan di
// orders.collaborator_splits_snapshot. Pola sama persis dengan
// orders.affiliate_commission_idr: angka absolut, bukan formula, supaya
// CheckoutHandler.Webhook tidak perlu menghitung ulang apa pun di jalur
// pembayaran yang paling kritis.
type CollaboratorSplitSnapshot struct {
	UserID    string `json:"user_id"`
	AmountIDR int64  `json:"amount_idr"`
}

// validateCollaboratorSplits memastikan tiap user_id benar akun yang ada
// (bukan pemilik produk itu sendiri -- tidak masuk akal split ke diri
// sendiri), persennya masuk akal (0 < p <= 100), tidak ada duplikat, dan
// totalnya tidak melebihi 100% (kalau melebihi, bagian kreator sendiri
// bisa jadi negatif -- lihat checkout.go tempat ini dipotong dari netAmount
// kreator, pola sama dengan komisi afiliasi).
//
// productID + platformFeePercent -- audit 4 September 2026: SEBELUMNYA
// fungsi ini cuma mengecek total split KOLABORATOR sendiri <= 100%, tanpa
// tahu produk yang sama mungkin JUGA punya komisi afiliasi aktif (private
// lewat affiliate_commissions, atau marketplace publik lewat
// products.affiliate_public_commission_percent) -- affiliate.go Upsert/
// SetProductPublic sebaliknya juga cuma mengecek komisinya sendiri, tanpa
// tahu produk sudah punya split kolaborator. checkout.go memotong KEDUANYA
// (plus platform fee) dari amountIDR yang SAMA (netAmount := amountIDR -
// platformFeeIDR - affiliateCommissionIDR - totalCollaboratorSplitIDR) --
// kalau totalnya lebih dari 100%, netAmount kreator jadi NEGATIF dan
// tetap dicatat begitu saja sebagai ledger 'credit' (tidak ada CHECK
// constraint yang mencegahnya). productID "" (produk belum dibuat, lewat
// ProductHandler.Create) berarti belum mungkin ada komisi afiliasi untuk
// dicek -- affiliate.go mensyaratkan produk sudah ada lebih dulu.
func validateCollaboratorSplits(ctx context.Context, db *pgxpool.Pool, splits []CollaboratorSplit, ownerUserID string, actorUserID string, productID string, platformFeePercent float64) error {
	if len(splits) == 0 {
		return nil
	}

	// Cek eksistensi SEMUA user_id sekaligus, SEBELUM loop validasi di bawah
	// (audit performa profesional 15 September 2026, Low) -- SEBELUMNYA
	// "SELECT EXISTS(...)" jalan SATU KALI PER kolaborator DI DALAM loop
	// (N+1: makin banyak kolaborator di-split, makin banyak round-trip DB
	// murni utk cek eksistensi), padahal semua bisa dijawab satu query
	// tunggal `= ANY($1)` (pola sama seperti bundle.go/brand.go di
	// codebase ini). userIDs dikumpulkan dulu dari s.UserID mentah (BUKAN
	// hasil validasi lain di bawah) supaya urutan pesan error utk kasus
	// user_id kosong/duplikat/persen invalid TIDAK berubah -- existingUsers
	// cuma dipakai utk gantikan pengecekan "exists" per-item di loop asli.
	userIDs := make([]string, 0, len(splits))
	for _, s := range splits {
		if s.UserID != "" {
			userIDs = append(userIDs, s.UserID)
		}
	}
	existingUsers := map[string]bool{}
	if len(userIDs) > 0 {
		rows, err := db.Query(ctx, `SELECT id FROM users WHERE id = ANY($1) AND deleted_at IS NULL`, userIDs)
		if err != nil {
			return errors.New("collaborator_splits: gagal memeriksa akun")
		}
		defer rows.Close()
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return errors.New("collaborator_splits: gagal memeriksa akun")
			}
			existingUsers[id] = true
		}
		if err := rows.Err(); err != nil {
			return errors.New("collaborator_splits: gagal memeriksa akun")
		}
	}

	seen := map[string]bool{}
	var total float64
	for _, s := range splits {
		if s.UserID == "" {
			return errors.New("collaborator_splits: user_id wajib diisi")
		}
		if s.UserID == ownerUserID {
			return errors.New("collaborator_splits: tidak bisa split ke akun sendiri")
		}
		// actorUserID -- jaring KEDUA di bawah blockMoneyRoutingByCollaborator
		// (lihat catatan panjang di sana). Pemanggil ASLI tidak boleh jadi
		// penerima split, walau ownerUserID di atas sudah berbeda dengannya.
		// Hari ini kondisi ini tidak pernah tercapai lewat HTTP karena jalur
		// impersonasi sudah ditolak lebih dulu -- ini sengaja dipertahankan
		// supaya celah yang sama tidak terbuka lagi diam-diam kalau suatu saat
		// rute ini diekspos ulang ke kolaborator.
		if actorUserID != "" && s.UserID == actorUserID {
			return errors.New("collaborator_splits: tidak bisa split ke akun sendiri")
		}
		if seen[s.UserID] {
			return errors.New("collaborator_splits: user_id duplikat")
		}
		seen[s.UserID] = true
		if s.Percent <= 0 || s.Percent > 100 {
			return errors.New("collaborator_splits: persen harus lebih dari 0 dan maksimal 100")
		}
		total += s.Percent

		if !existingUsers[s.UserID] {
			return errors.New("collaborator_splits: salah satu user_id tidak ditemukan")
		}
	}
	if total > 100 {
		return errors.New("collaborator_splits: total persen tidak boleh lebih dari 100%")
	}

	if productID != "" {
		maxAffiliateCommission, err := maxAffiliateCommissionPercent(ctx, db, productID)
		if err != nil {
			return errors.New("collaborator_splits: gagal memeriksa komisi afiliasi produk")
		}
		if total+maxAffiliateCommission+platformFeePercent > 100 {
			return fmt.Errorf(
				"collaborator_splits: total split (%.2f%%) + komisi afiliasi produk ini (%.2f%%) + biaya platform (%.2f%%) melebihi 100%% -- kurangi salah satunya",
				total, maxAffiliateCommission, platformFeePercent,
			)
		}
	}
	return nil
}

// maxAffiliateCommissionPercent -- persen komisi afiliasi TERTINGGI yang
// aktif untuk satu produk, dari kedua jalur yang ada (private lewat
// affiliate_commissions, marketplace publik lewat
// products.affiliate_public_commission_percent). Dipakai sebagai batas
// atas konservatif -- checkout memakai SATU komisi (siapa pun afiliator
// yang kode referralnya dipakai), jadi yang perlu dijamin aman adalah
// kasus TERBURUK (komisi tertinggi yang mungkin terpakai), bukan rata-rata.
func maxAffiliateCommissionPercent(ctx context.Context, db *pgxpool.Pool, productID string) (float64, error) {
	var maxPercent float64
	err := db.QueryRow(ctx, `
		SELECT COALESCE(MAX(percent), 0) FROM (
			SELECT commission_percent AS percent FROM affiliate_commissions WHERE product_id = $1
			UNION ALL
			SELECT affiliate_public_commission_percent AS percent FROM products
				WHERE id = $1 AND affiliate_public = true
		) combined
	`, productID).Scan(&maxPercent)
	return maxPercent, err
}
