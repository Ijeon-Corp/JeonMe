package handlers

import (
	"encoding/json"
	"sort"
	"testing"

	"github.com/jeonme/api/internal/storage"
)

// TestCollectStorageKeysFromBlockData -- regresi uxd-2 (audit UI/UX 21
// September 2026, "cleanup file yatim"): Delete (links.go) sekarang
// membersihkan objek storage yang direferensikan block_data/
// custom_icon_url/thumbnail_url sebelum ini HANYA `DELETE FROM links`,
// meninggalkan gambar/galeri/audio/file yatim selamanya di storage tiap
// kali blok yang pernah punya upload dihapus (bukan cuma skenario "Batal"
// di Builder). Test ini membuktikan DUA hal sekaligus: (a) key milik link
// ini sendiri, di SEMUA bentuk pola upload nyata di links.go (root+
// bersarang utk gallery/media, root-only utk audio/file), benar-benar
// terkumpul; (b) URL yang ditanam via block_data (JSONB bebas-bentuk,
// bisa diisi klien lewat PATCH biasa) yang MENUNJUK ke link LAIN --
// termasuk variasi "linkID sendiri jadi awalan linkID lain" seperti yang
// sudah pernah jadi celah IDOR nyata di DeleteGalleryImage dkk (lihat
// TestResolveOwnedStorageKey) -- SELALU ditolak, tidak pernah masuk hasil.
func TestCollectStorageKeysFromBlockData(t *testing.T) {
	store, err := storage.NewClient("cdn.jeon.id", "a", "b", "jeonme", true)
	if err != nil {
		t.Fatal(err)
	}
	prefix := store.PublicURL("")
	const myLinkID = "11111111-1111-1111-1111-111111111111"
	const victimLinkID = "22222222-2222-2222-2222-222222222222"
	allowed := linkOwnedStorageKeyPrefixes(myLinkID)

	blockData := map[string]any{
		// Root gallery + sub-galeri "foto di dalam foto" bersarang -- SAMA
		// prefix "gallery-images/{linkID}/" (lihat UploadGalleryNestedImage).
		"images": []any{
			prefix + "gallery-images/" + myLinkID + "/root-1.webp",
			prefix + "gallery-images/" + myLinkID + "/nested/sub-1.webp",
		},
		// Blok media root.
		"image_url": prefix + "link-media/" + myLinkID + "/" + myLinkID + ".webp",
		// Blok audio/file ROOT (nodeKey == linkID utk root, lihat UploadAudio/UploadFile).
		"audio_url": prefix + "audio-blocks/" + myLinkID + ".mp3",
		"file_url":  prefix + "file-blocks/" + myLinkID + ".pdf",
		// Blok bersarang (Section > Column > children) -- walker HARUS turun rekursif.
		"children": []any{
			map[string]any{
				"id":        "col-1",
				"blockType": "column",
				"children": []any{
					map[string]any{
						"id":        "nested-media-1",
						"blockType": "image",
						"image_url": prefix + "link-media/" + myLinkID + "/nested-media-1.webp",
					},
				},
			},
		},
		// String biasa yang BUKAN URL storage sama sekali -- harus diabaikan diam-diam.
		"title": "Judul blok biasa",
		// EKSPLOITASI: pengguna A menaruh URL foto galeri milik link B lewat
		// PATCH block_data blok A sendiri, lalu hapus blok A.
		"planted_victim_1": prefix + "gallery-images/" + victimLinkID + "/abc.webp",
		// Variasi licik: linkID SENDIRI jadi awalan id link lain (uji delimiter
		// "/" & "." benar-benar dicek, bukan cuma string.HasPrefix polos).
		"planted_victim_2": prefix + "gallery-images/" + myLinkID + "-evil/abc.webp",
		"planted_victim_3": prefix + "audio-blocks/" + myLinkID + "-evil.mp3",
		// URL storage kita tapi utk RESOURCE lain sama sekali (avatar, bukan link).
		"planted_victim_4": prefix + "avatars/" + victimLinkID + ".webp",
	}
	raw, err := json.Marshal(blockData)
	if err != nil {
		t.Fatal(err)
	}

	got := collectStorageKeysFromBlockData(raw, prefix, allowed,
		prefix+"link-icons/"+myLinkID+".webp",
		prefix+"link-thumbnails/"+myLinkID+".webp",
	)
	sort.Strings(got)

	want := []string{
		"audio-blocks/" + myLinkID + ".mp3",
		"file-blocks/" + myLinkID + ".pdf",
		"gallery-images/" + myLinkID + "/nested/sub-1.webp",
		"gallery-images/" + myLinkID + "/root-1.webp",
		"link-icons/" + myLinkID + ".webp",
		"link-media/" + myLinkID + "/" + myLinkID + ".webp",
		"link-media/" + myLinkID + "/nested-media-1.webp",
		"link-thumbnails/" + myLinkID + ".webp",
	}
	sort.Strings(want)

	if len(got) != len(want) {
		t.Fatalf("collectStorageKeysFromBlockData() = %v (len %d), want %v (len %d)", got, len(got), want, len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("collectStorageKeysFromBlockData()[%d] = %q, want %q\nfull got=%v", i, got[i], want[i], got)
		}
	}

	for _, victimKey := range []string{
		"gallery-images/" + victimLinkID + "/abc.webp",
		"gallery-images/" + myLinkID + "-evil/abc.webp",
		"audio-blocks/" + myLinkID + "-evil.mp3",
		"avatars/" + victimLinkID + ".webp",
	} {
		for _, g := range got {
			if g == victimKey {
				t.Errorf("IDOR: key milik resource LAIN (%q) ikut terkumpul, seharusnya ditolak", victimKey)
			}
		}
	}
}

func TestCollectStorageKeysFromBlockData_kosongAtauNil(t *testing.T) {
	store, err := storage.NewClient("cdn.jeon.id", "a", "b", "jeonme", true)
	if err != nil {
		t.Fatal(err)
	}
	prefix := store.PublicURL("")
	allowed := linkOwnedStorageKeyPrefixes("any-id")

	if got := collectStorageKeysFromBlockData(nil, prefix, allowed); len(got) != 0 {
		t.Errorf("block_data nil harus menghasilkan slice kosong, got %v", got)
	}
	if got := collectStorageKeysFromBlockData([]byte("null"), prefix, allowed); len(got) != 0 {
		t.Errorf("block_data JSON null harus menghasilkan slice kosong, got %v", got)
	}
	if got := collectStorageKeysFromBlockData([]byte("not valid json"), prefix, allowed); len(got) != 0 {
		t.Errorf("block_data JSON rusak harus menghasilkan slice kosong (diam-diam diabaikan), got %v", got)
	}
}
