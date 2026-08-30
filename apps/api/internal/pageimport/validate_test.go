package pageimport

import "testing"

func TestClampThemeResult_ValidShortlistThemePassesThrough(t *testing.T) {
	in := ThemeResult{Theme: "midnight", LayoutVariant: "banner", Confidence: "high", Notes: "cocok"}
	out := clampThemeResult(in)
	if out.Theme != "midnight" || out.LayoutVariant != "banner" || out.Confidence != "high" {
		t.Errorf("tema valid seharusnya lolos apa adanya, dapat %+v", out)
	}
	if out.Custom != nil {
		t.Errorf("theme bukan \"custom\" seharusnya Custom=nil, dapat %+v", out.Custom)
	}
}

func TestClampThemeResult_UnknownThemeClampsToDefault(t *testing.T) {
	out := clampThemeResult(ThemeResult{Theme: "tema-halusinasi-ai", LayoutVariant: "centered", Confidence: "high"})
	if out.Theme != "default" {
		t.Errorf("theme di luar shortlist seharusnya clamp ke \"default\", dapat %q", out.Theme)
	}
	if out.Confidence != "low" {
		t.Errorf("clamp theme seharusnya turunkan confidence ke \"low\", dapat %q", out.Confidence)
	}
}

func TestClampThemeResult_UnknownLayoutVariantClampsToCentered(t *testing.T) {
	out := clampThemeResult(ThemeResult{Theme: "default", LayoutVariant: "layout-tidak-ada", Confidence: "medium"})
	if out.LayoutVariant != "centered" {
		t.Errorf("layout_variant di luar 15 nilai asli seharusnya clamp ke \"centered\", dapat %q", out.LayoutVariant)
	}
}

func TestClampThemeResult_CustomWithoutDetailFallsBackToDefault(t *testing.T) {
	out := clampThemeResult(ThemeResult{Theme: "custom", LayoutVariant: "centered", Custom: nil})
	if out.Theme != "default" {
		t.Errorf("\"custom\" tanpa field Custom seharusnya jatuh balik ke \"default\", dapat %q", out.Theme)
	}
}

func TestClampThemeResult_ValidCustomThemePassesThrough(t *testing.T) {
	custom := &CustomTheme{
		BackgroundType: "solid", BackgroundValue: "#112233",
		Font: "poppins", ButtonColor: "#ffffff", ButtonStyle: "outline",
		ButtonRounded: "full", ButtonTextColor: "#000000",
		PageTextColor: "#eeeeee", TitleColor: "#ff00ff",
	}
	out := clampThemeResult(ThemeResult{Theme: "custom", LayoutVariant: "card", Custom: custom, Confidence: "high"})
	if out.Theme != "custom" || out.Custom == nil {
		t.Fatalf("custom theme valid seharusnya lolos, dapat %+v", out)
	}
	if *out.Custom != *custom {
		t.Errorf("custom theme valid seharusnya tidak berubah, dapat %+v, want %+v", *out.Custom, *custom)
	}
}

func TestClampThemeResult_InvalidCustomFieldsClampToSafeDefaults(t *testing.T) {
	custom := &CustomTheme{
		BackgroundType:  "image", // tidak pernah valid dari analisis visual
		BackgroundValue: "tidak-relevan",
		Font:            "font-halusinasi",
		ButtonColor:     "bukan-hex",
		ButtonStyle:     "gaya-aneh",
		ButtonRounded:   "super-bulat",
		ButtonTextColor: "red", // nama warna CSS, bukan hex -- harus ditolak
		PageTextColor:   "#zzzzzz",
		TitleColor:      "",
	}
	out := clampThemeResult(ThemeResult{Theme: "custom", LayoutVariant: "centered", Custom: custom})
	if out.Custom == nil {
		t.Fatal("custom theme dengan field tidak valid tetap seharusnya di-clamp, bukan nil")
	}
	c := out.Custom
	if c.BackgroundType != "solid" || c.BackgroundValue != "#1a1a1a" {
		t.Errorf("background tidak valid seharusnya clamp ke solid/#1a1a1a, dapat %s/%s", c.BackgroundType, c.BackgroundValue)
	}
	if c.Font != "inter" {
		t.Errorf("font tidak valid seharusnya clamp ke \"inter\", dapat %q", c.Font)
	}
	if c.ButtonStyle != "fill" {
		t.Errorf("button_style tidak valid seharusnya clamp ke \"fill\", dapat %q", c.ButtonStyle)
	}
	if c.ButtonRounded != "md" {
		t.Errorf("button_rounded tidak valid seharusnya clamp ke \"md\", dapat %q", c.ButtonRounded)
	}
	if c.ButtonColor != "" || c.ButtonTextColor != "" || c.PageTextColor != "" {
		t.Errorf("warna tidak valid seharusnya clamp ke string kosong, dapat button=%q text=%q page=%q", c.ButtonColor, c.ButtonTextColor, c.PageTextColor)
	}
}

func TestClampThemeResult_ValidGradientBackgroundPassesThrough(t *testing.T) {
	custom := &CustomTheme{
		BackgroundType: "gradient", BackgroundValue: "linear-gradient(to right, #111, #222)",
		Font: "inter", ButtonStyle: "fill", ButtonRounded: "md",
	}
	out := clampThemeResult(ThemeResult{Theme: "custom", LayoutVariant: "centered", Custom: custom})
	if out.Custom.BackgroundType != "gradient" || out.Custom.BackgroundValue != custom.BackgroundValue {
		t.Errorf("gradient valid seharusnya lolos apa adanya, dapat %+v", out.Custom)
	}
}

func TestClampThemeResult_InvalidConfidenceClampsToLow(t *testing.T) {
	out := clampThemeResult(ThemeResult{Theme: "default", LayoutVariant: "centered", Confidence: "sangat-yakin"})
	if out.Confidence != "low" {
		t.Errorf("confidence di luar enum seharusnya clamp ke \"low\", dapat %q", out.Confidence)
	}
}

func TestClampThemeResult_LongNotesTruncated(t *testing.T) {
	long := make([]byte, maxNotesLen+50)
	for i := range long {
		long[i] = 'a'
	}
	out := clampThemeResult(ThemeResult{Theme: "default", LayoutVariant: "centered", Confidence: "low", Notes: string(long)})
	if len(out.Notes) != maxNotesLen {
		t.Errorf("notes seharusnya dipotong ke %d karakter, dapat %d", maxNotesLen, len(out.Notes))
	}
}
