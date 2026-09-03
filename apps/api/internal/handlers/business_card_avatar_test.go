package handlers

import (
	"testing"

	"github.com/jeonme/api/internal/storage"
)

func TestStorageKeyFromURL(t *testing.T) {
	store, err := storage.NewClient("cdn.jeon.id", "a", "b", "jeonme", true)
	if err != nil {
		t.Fatal(err)
	}
	prefix := store.PublicURL("")
	cases := map[string]string{
		prefix + "avatars/u1.webp?v=1725000000000000000": "avatars/u1.webp",
		prefix + "avatars/u1.webp":                       "avatars/u1.webp",
		prefix + "avatars/u1.webp#x":                     "avatars/u1.webp",
		"https://lh3.googleusercontent.com/a/abc":        "",
		prefix: "",
		"":     "",
	}
	for in, want := range cases {
		got, ok := storageKeyFromURL(store, in)
		if got != want || ok != (want != "") {
			t.Errorf("storageKeyFromURL(%q) = %q,%v want %q", in, got, ok, want)
		}
	}
	if _, ok := storageKeyFromURL(nil, prefix+"a.webp"); ok {
		t.Error("store nil harus false")
	}
}
