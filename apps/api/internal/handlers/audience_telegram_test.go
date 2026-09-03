package handlers

import "testing"

func TestNormalizeTelegram(t *testing.T) {
	cases := map[string]string{
		"@Akbar_01": "akbar_01", "t.me/akbar": "akbar", "https://t.me/Akbar": "akbar", " akbar ": "akbar",
		"": "", "akbar okta": "", "akbar!": "", "abcdefghijklmnopqrstuvwxyz0123456789": "",
	}
	for in, want := range cases {
		if got := normalizeTelegram(in); got != want {
			t.Errorf("normalizeTelegram(%q) = %q, want %q", in, got, want)
		}
	}
}
