package handlers

import (
	"testing"

	"github.com/jeonme/api/internal/storage"
)

// TestResolveOwnedStorageKey -- regresi Critical IDOR ditemukan lewat audit
// keamanan 15 September 2026: sebelum resolveOwnedStorageKey ada,
// DeleteGalleryImage/DeleteCatalogItemImage/DeleteMediaImage menerjemahkan
// URL APAPUN yang tersimpan di block_data (JSONB bebas-bentuk, bisa diisi
// klien lewat PATCH biasa tanpa pengecekan kepemilikan sama sekali) langsung
// jadi perintah hapus objek storage -- pengguna A bisa menaruh URL foto
// milik pengguna B ke bloknya sendiri lalu memanggil endpoint hapus pada
// bloknya sendiri untuk menghapus objek storage B secara permanen. Test ini
// membuktikan: URL yang KEY-nya berada di bawah prefix milik link ini
// sendiri tetap resolve normal (delete asli tidak boleh ikut rusak oleh
// fix ini), sedangkan URL milik link/produk LAIN (prefix beda) SELALU
// mengembalikan "" -- lihat catatan lengkap di resolveOwnedStorageKey/
// deleteOwnedStorageObject, links.go.
func TestResolveOwnedStorageKey(t *testing.T) {
	store, err := storage.NewClient("cdn.jeon.id", "a", "b", "jeonme", true)
	if err != nil {
		t.Fatal(err)
	}
	prefix := store.PublicURL("")
	const myLinkID = "11111111-1111-1111-1111-111111111111"
	const victimLinkID = "22222222-2222-2222-2222-222222222222"
	expectedPrefix := "gallery-images/" + myLinkID + "/"

	cases := []struct {
		name string
		url  string
		want string
	}{
		{
			name: "foto milik link sendiri -- harus tetap bisa dihapus",
			url:  prefix + "gallery-images/" + myLinkID + "/abc-123.webp",
			want: "gallery-images/" + myLinkID + "/abc-123.webp",
		},
		{
			// Eksploitasi IDOR: pengguna A menaruh URL foto galeri milik
			// link B (kreator lain) ke block_data blok A sendiri, lalu
			// panggil DeleteGalleryImage pada link A -- SEBELUM fix ini,
			// key victimLinkID langsung diteruskan ke Storage.Delete.
			name: "foto milik link LAIN (IDOR) -- HARUS ditolak",
			url:  prefix + "gallery-images/" + victimLinkID + "/abc-123.webp",
			want: "",
		},
		{
			name: "prefix resource BEDA sama sekali (mis. avatar orang lain)",
			url:  prefix + "avatars/some-other-user.webp",
			want: "",
		},
		{
			name: "prefix mirip tapi bukan sub-path sungguhan (mis. linkID sendiri jadi awalan linkID lain)",
			url:  prefix + "gallery-images/" + myLinkID + "-evil/abc.webp",
			want: "",
		},
		{
			name: "URL dari domain lain sama sekali (bukan storage kita)",
			url:  "https://evil.example.com/gallery-images/" + myLinkID + "/abc.webp",
			want: "",
		},
		{
			name: "string kosong",
			url:  "",
			want: "",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := resolveOwnedStorageKey(store, tc.url, expectedPrefix)
			if got != tc.want {
				t.Errorf("resolveOwnedStorageKey(%q, %q) = %q, want %q", tc.url, expectedPrefix, got, tc.want)
			}
		})
	}

	if got := resolveOwnedStorageKey(nil, prefix+"gallery-images/"+myLinkID+"/a.webp", expectedPrefix); got != "" {
		t.Errorf("store nil harus selalu mengembalikan \"\", got %q", got)
	}
}
