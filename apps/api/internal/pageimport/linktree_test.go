package pageimport

import "testing"

// linktreeFixtureHTML -- bentuk minimal tapi struktural APA ADANYA seperti
// yang dikonfirmasi langsung dari halaman Linktree sungguhan saat mendesain
// fitur ini (tag <script id="__NEXT_DATA__">, path props.pageProps.links[]).
// Sengaja disusun manual (bukan file testdata) mengikuti konvensi test lain
// di repo ini (imageconv_test.go, netguard_test.go) yang membangun fixture
// inline lewat kode, bukan berkas eksternal.
const linktreeFixtureHTML = `<!DOCTYPE html><html><head></head><body>
<div id="__next"></div>
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"links":[
	{"id":"2","title":"Kedua","url":"https://contoh.com/kedua","type":"CLASSIC","position":1},
	{"id":"1","title":"Pertama","url":"https://contoh.com/pertama","type":"CLASSIC","position":0},
	{"id":"3","title":"","url":"https://contoh.com/tanpa-judul","type":"CLASSIC","position":2},
	{"id":"4","title":"Kosong","url":"","type":"CLASSIC","position":3},
	{"id":"5","title":"Terkunci Kode","url":"https://contoh.com/terkunci","type":"CLASSIC","position":4,"rules":{"gate":{"passcode":"1234"}}},
	{"id":"6","title":"Terkunci Umur","url":"https://contoh.com/dewasa","type":"CLASSIC","position":5,"rules":{"gate":{"age":18}}},
	{"id":"7","title":"Duplikat","url":"https://contoh.com/pertama","type":"CLASSIC","position":6}
]}}}</script>
</body></html>`

func TestParseLinktree_OrdersFiltersAndDedupes(t *testing.T) {
	links, err := parseLinktree([]byte(linktreeFixtureHTML))
	if err != nil {
		t.Fatalf("parseLinktree gagal untuk fixture valid: %v", err)
	}

	// Ekspektasi: "Pertama" (position 0), "Kedua" (position 1), lalu link
	// tanpa judul (fallback title = URL, position 2) -- link kosong (4),
	// dua link terkunci (5,6), dan duplikat "Pertama" (7) semuanya dibuang.
	want := []ScrapedLink{
		{Title: "Pertama", URL: "https://contoh.com/pertama"},
		{Title: "Kedua", URL: "https://contoh.com/kedua"},
		{Title: "https://contoh.com/tanpa-judul", URL: "https://contoh.com/tanpa-judul"},
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

func TestParseLinktree_MissingNextDataReturnsError(t *testing.T) {
	_, err := parseLinktree([]byte(`<html><body>bukan halaman Linktree</body></html>`))
	if err == nil {
		t.Error("ekspektasi error kalau tag __NEXT_DATA__ tidak ada, dapat nil")
	}
}

func TestParseLinktree_MalformedJSONReturnsError(t *testing.T) {
	html := `<script id="__NEXT_DATA__" type="application/json">{bukan json valid</script>`
	_, err := parseLinktree([]byte(html))
	if err == nil {
		t.Error("ekspektasi error untuk JSON __NEXT_DATA__ rusak, dapat nil")
	}
}
