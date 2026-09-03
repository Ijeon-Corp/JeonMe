package handlers

import "testing"

func TestNormalizeCardTheme(t *testing.T) {
	cases := map[string]string{"": "lavender", "LIME": "lime", " pink ": "pink", "blue": "blue", "ink": "ink", "neon": "lavender"}
	for in, want := range cases {
		if got := normalizeCardTheme(in); got != want {
			t.Errorf("normalizeCardTheme(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeHandle(t *testing.T) {
	cases := map[string]string{
		"@akbar": "akbar", "akbar": "akbar", "instagram.com/akbar": "akbar",
		"https://www.tiktok.com/@akbar.okta": "akbar.okta", "  @Akbar  ": "Akbar", "": "",
	}
	for in, want := range cases {
		if got := normalizeHandle(in); got != want {
			t.Errorf("normalizeHandle(%q) = %q, want %q", in, got, want)
		}
	}
}
