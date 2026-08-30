package pageimport

import "testing"

const genericFixtureHTML = `<!DOCTYPE html><html><body>
<nav>
	<a href="/login">Masuk</a>
	<a href="/about">Tentang</a>
</nav>
<main>
	<a href="https://instagram.com/contoh">Instagram Aku</a>
	<a href="https://contoh-toko.com/produk">Toko Online</a>
	<a href="mailto:hai@contoh.com">Email Aku</a>
	<a href="#section">Lompat ke bawah</a>
	<a href="javascript:void(0)">Tombol JS</a>
	<a href="https://contoh-toko.com/produk">Duplikat Toko</a>
	<a href="https://tanpa-judul.com"></a>
</main>
<footer>
	<a href="/terms">Syarat</a>
</footer>
</body></html>`

func TestParseGenericLinks_FiltersInternalAndKeepsExternal(t *testing.T) {
	links, err := parseGenericLinks([]byte(genericFixtureHTML), "https://sumber-lama.com/profil")
	if err != nil {
		t.Fatalf("parseGenericLinks gagal: %v", err)
	}

	want := []ScrapedLink{
		{Title: "Instagram Aku", URL: "https://instagram.com/contoh"},
		{Title: "Toko Online", URL: "https://contoh-toko.com/produk"},
		{Title: "Email Aku", URL: "mailto:hai@contoh.com"},
		{Title: "tanpa-judul.com", URL: "https://tanpa-judul.com"},
	}
	if len(links) != len(want) {
		t.Fatalf("jumlah link = %d, want %d (dapat: %+v)", len(links), len(want), links)
	}
	for i, w := range want {
		if links[i] != w {
			t.Errorf("link[%d] = %+v, want %+v", i, links[i], w)
		}
	}
}

func TestParseGenericLinks_NoLinksReturnsEmptyNotNil(t *testing.T) {
	links, err := parseGenericLinks([]byte(`<html><body>tidak ada tautan sama sekali</body></html>`), "https://sumber.com")
	if err != nil {
		t.Fatalf("parseGenericLinks gagal: %v", err)
	}
	if links == nil {
		t.Error("ekspektasi slice kosong non-nil, dapat nil")
	}
	if len(links) != 0 {
		t.Errorf("ekspektasi 0 link, dapat %d", len(links))
	}
}
