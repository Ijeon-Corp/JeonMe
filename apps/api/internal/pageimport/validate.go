package pageimport

import (
	"regexp"
	"strings"
)

// themeShortlist/layoutVariants/customFonts/... -- HARUS tetap sinkron
// dengan daftar di visionSystemPrompt (vision.go) DAN dengan nilai asli di
// apps/web/lib/page-themes.ts (PageThemeName/CustomThemeConfig) &
// apps/web/lib/quick-setup-templates.ts (layoutVariant union). Dijaga
// sebagai satu-satunya sumber kebenaran validasi backend supaya JSON dari
// Claude tidak pernah diteruskan ke frontend dengan nilai di luar enum
// nyata (yang bisa membuat halaman render dengan tema/layout tidak
// dikenal).
var themeShortlist = map[string]bool{
	"default": true, "midnight": true, "minimal": true, "noir": true,
	"bloom": true, "cosmic": true, "aurora": true, "candy": true,
	"matcha": true, "obsidian": true, "corporate": true, "console": true,
}

var layoutVariants = map[string]bool{
	"centered": true, "banner": true, "card": true, "spotlight": true,
	"cover": true, "minimal": true, "hero": true, "polaroid": true,
	"split": true, "ticket": true, "headline": true, "ribbon": true,
	"duo": true, "masthead": true, "portrait": true,
}

var customFonts = map[string]bool{
	"inter": true, "playfair": true, "lora": true, "montserrat": true,
	"roboto-mono": true, "poppins": true, "quicksand": true,
	"merriweather": true, "space-grotesk": true,
}

var buttonStyleValues = map[string]bool{"fill": true, "outline": true, "glass": true}
var buttonRoundedValues = map[string]bool{"none": true, "sm": true, "md": true, "full": true}

var hexColorRe = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

const maxNotesLen = 300

// clampThemeResult -- JANGAN PERNAH percaya JSON mentah dari LLM apa
// adanya: model bisa "berhalusinasi" nilai di luar enum yang diminta,
// warna bukan hex valid, dst. Tiap field divalidasi & di-clamp ke default
// aman kalau tidak cocok, SEBELUM diteruskan ke frontend -- fungsi murni
// (tanpa I/O jaringan/DB) supaya bisa diuji langsung lewat `go test` tanpa
// perlu mock apa pun.
func clampThemeResult(r ThemeResult) ThemeResult {
	if r.Confidence != "high" && r.Confidence != "medium" && r.Confidence != "low" {
		r.Confidence = "low"
	}
	if len(r.Notes) > maxNotesLen {
		r.Notes = r.Notes[:maxNotesLen]
	}

	if r.Theme != "custom" {
		if !themeShortlist[r.Theme] {
			r.Theme = "default"
			r.Confidence = "low"
		}
		r.Custom = nil
	} else if r.Custom == nil {
		// "custom" tanpa detail warna sama sekali tidak bisa dirender
		// bermakna -- jatuh balik total ke default, bukan setengah-render.
		r.Theme = "default"
		r.Confidence = "low"
	} else {
		clamped := clampCustomTheme(*r.Custom)
		r.Custom = &clamped
	}

	if !layoutVariants[r.LayoutVariant] {
		r.LayoutVariant = "centered"
	}

	return r
}

func clampCustomTheme(c CustomTheme) CustomTheme {
	switch {
	case c.BackgroundType == "solid" && hexColorRe.MatchString(c.BackgroundValue):
		// valid apa adanya
	case c.BackgroundType == "gradient" && strings.HasPrefix(c.BackgroundValue, "linear-gradient("):
		// valid apa adanya
	default:
		c.BackgroundType = "solid"
		c.BackgroundValue = "#1a1a1a"
	}

	if !customFonts[c.Font] {
		c.Font = "inter"
	}
	if !buttonStyleValues[c.ButtonStyle] {
		c.ButtonStyle = "fill"
	}
	if !buttonRoundedValues[c.ButtonRounded] {
		c.ButtonRounded = "md"
	}
	// Field warna opsional -- "" berarti "pakai bawaan tema" (konvensi yang
	// sudah dipakai CustomThemeConfig di frontend), jadi nilai tak valid
	// di-clamp ke kosong (bukan warna tebakan), lebih aman daripada
	// menampilkan warna acak yang tidak diminta siapa pun.
	if !hexColorRe.MatchString(c.ButtonColor) {
		c.ButtonColor = ""
	}
	if !hexColorRe.MatchString(c.ButtonTextColor) {
		c.ButtonTextColor = ""
	}
	if !hexColorRe.MatchString(c.PageTextColor) {
		c.PageTextColor = ""
	}
	if !hexColorRe.MatchString(c.TitleColor) {
		c.TitleColor = ""
	}

	return c
}
