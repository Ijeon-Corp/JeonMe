package handlers

import (
	"encoding/json"
	"errors"
)

// blockStyle -- desain per blok (migrasi 000110, lihat komentar lengkap di
// sana). Semua field opsional; string kosong = ikut tema/menu Desain.
// Frontend menerapkannya lewat satu pembungkus generik (PagePreview.tsx,
// BlockStyleWrapper) sehingga berlaku utk tipe blok apa pun.
type blockStyle struct {
	Bg         string `json:"bg,omitempty"`
	Text       string `json:"text,omitempty"`
	Font       string `json:"font,omitempty"`
	FontSize   string `json:"font_size,omitempty"`
	FontWeight string `json:"font_weight,omitempty"`
	Align      string `json:"align,omitempty"`
	ButtonBg   string `json:"button_bg,omitempty"`
	ButtonText string `json:"button_text,omitempty"`
	Rounded    string `json:"rounded,omitempty"`
	// Title* -- gaya JUDUL blok (permintaan langsung pengguna, 25 September
	// 2026: "pilihan posisi blok title ini rata kiri, kanan, rata kiri
	// kanan, ukuran font bold dll, dan juga bisa di atur mau dibawah atau
	// diatas konten blok"). Terpisah dari Text/FontSize/dst di atas yang
	// berlaku ke SELURUH isi blok.
	TitleAlign    string `json:"title_align,omitempty"`
	TitleSize     string `json:"title_size,omitempty"`
	TitleWeight   string `json:"title_weight,omitempty"`
	TitleItalic   bool   `json:"title_italic,omitempty"`
	TitleColor    string `json:"title_color,omitempty"`
	TitlePosition string `json:"title_position,omitempty"`
}

var (
	blockStyleFontSizes   = map[string]bool{"sm": true, "base": true, "lg": true, "xl": true}
	blockStyleFontWeights = map[string]bool{"normal": true, "semibold": true, "bold": true}
	blockStyleAligns      = map[string]bool{"left": true, "center": true, "right": true}
	blockStyleRounded     = map[string]bool{"none": true, "sm": true, "md": true, "full": true}
	blockTitleAligns      = map[string]bool{"left": true, "center": true, "right": true, "justify": true}
	blockTitleSizes       = map[string]bool{"sm": true, "base": true, "lg": true, "xl": true, "2xl": true}
	blockTitlePositions   = map[string]bool{"top": true, "bottom": true}
)

// validateBlockStyle -- warna wajib #rrggbb (format <input type="color">),
// font dari daftar yg SAMA dgn menu Desain (availableCustomFonts), sisanya
// enum. Mengembalikan JSON siap simpan.
func validateBlockStyle(s blockStyle) ([]byte, error) {
	for _, c := range []string{s.Bg, s.Text, s.ButtonBg, s.ButtonText, s.TitleColor} {
		if c != "" && !hexColorPattern.MatchString(c) {
			return nil, errors.New("warna desain blok wajib format hex #rrggbb")
		}
	}
	if s.Font != "" && !availableCustomFonts[s.Font] {
		return nil, errors.New("font desain blok tidak dikenal")
	}
	if s.FontSize != "" && !blockStyleFontSizes[s.FontSize] {
		return nil, errors.New("ukuran font desain blok tidak dikenal")
	}
	if s.FontWeight != "" && !blockStyleFontWeights[s.FontWeight] {
		return nil, errors.New("ketebalan font desain blok tidak dikenal")
	}
	if s.Align != "" && !blockStyleAligns[s.Align] {
		return nil, errors.New("perataan teks desain blok tidak dikenal")
	}
	if s.Rounded != "" && !blockStyleRounded[s.Rounded] {
		return nil, errors.New("bentuk sudut desain blok tidak dikenal")
	}
	if s.TitleAlign != "" && !blockTitleAligns[s.TitleAlign] {
		return nil, errors.New("perataan judul blok tidak dikenal")
	}
	if s.TitleSize != "" && !blockTitleSizes[s.TitleSize] {
		return nil, errors.New("ukuran judul blok tidak dikenal")
	}
	if s.TitleWeight != "" && !blockStyleFontWeights[s.TitleWeight] {
		return nil, errors.New("ketebalan judul blok tidak dikenal")
	}
	if s.TitlePosition != "" && !blockTitlePositions[s.TitlePosition] {
		return nil, errors.New("posisi judul blok tidak dikenal")
	}
	return json.Marshal(s)
}
