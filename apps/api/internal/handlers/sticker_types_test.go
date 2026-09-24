package handlers

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestValidateStickers_AcceptsFluentEmojiTypes -- stiker 3D Fluent Emoji
// (24 September 2026) diterima validator, tipe fluent yang tidak terdaftar
// tetap ditolak.
func TestValidateStickers_AcceptsFluentEmojiTypes(t *testing.T) {
	if msg, ok := validateStickers([]PageSticker{{ID: "a", Type: "fluent-fire", X: 50, Y: 50, Scale: 1}}); !ok {
		t.Fatalf("fluent-fire ditolak: %s", msg)
	}
	if _, ok := validateStickers([]PageSticker{{ID: "a", Type: "fluent-tidak-ada", X: 50, Y: 50, Scale: 1}}); ok {
		t.Fatal("tipe fluent tak terdaftar seharusnya ditolak")
	}
}

// TestFluentStickerTypes_HaveAssetFiles -- setiap tipe "fluent-<slug>" yang
// diterima backend WAJIB punya berkas public/stickers/fluent/<slug>.webp di
// frontend; kalau tidak, stiker yang lolos validasi akan tampil sbg gambar
// rusak di halaman publik. Dilewati kalau direktori web tidak ada (mis.
// build image API yang cuma berisi apps/api).
func TestFluentStickerTypes_HaveAssetFiles(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "web", "public", "stickers", "fluent")
	if _, err := os.Stat(dir); err != nil {
		t.Skipf("direktori aset stiker tidak tersedia: %v", err)
	}
	count := 0
	for typ := range availableStickerTypes {
		slug, ok := strings.CutPrefix(typ, "fluent-")
		if !ok {
			continue
		}
		count++
		if _, err := os.Stat(filepath.Join(dir, slug+".webp")); err != nil {
			t.Errorf("tipe %s tidak punya aset %s.webp: %v", typ, slug, err)
		}
	}
	if count == 0 {
		t.Fatal("tidak ada tipe fluent-* terdaftar")
	}
}
