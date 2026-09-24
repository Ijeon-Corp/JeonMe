package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// TestNormalizeProfileExtras -- validasi murni layout "Profil Kreator"
// (migrasi 000109): batas jumlah & panjang ditolak jelas, spasi dirapikan.
func TestNormalizeProfileExtras(t *testing.T) {
	chips := make([]ProfileChip, maxProfileChips+1)
	for i := range chips {
		chips[i] = ProfileChip{Label: "x"}
	}
	cases := []struct {
		name string
		in   ProfileExtras
		ok   bool
	}{
		{"kosong valid", ProfileExtras{}, true},
		{"chip terlalu banyak", ProfileExtras{Chips: chips}, false},
		{"label chip kosong", ProfileExtras{Chips: []ProfileChip{{Label: "  "}}}, false},
		{"label chip terlalu panjang", ProfileExtras{Chips: []ProfileChip{{Label: strings.Repeat("a", maxProfileChipLabel+1)}}}, false},
		{"ikon tidak valid", ProfileExtras{Chips: []ProfileChip{{Label: "Go", Icon: "<script>"}}}, false},
		{"statistik tanpa angka", ProfileExtras{Stats: []ProfileStat{{Label: "Proyek"}}}, false},
		{"statistik terlalu banyak", ProfileExtras{Stats: []ProfileStat{{"1", "a"}, {"2", "b"}, {"3", "c"}, {"4", "d"}}}, false},
		{"valid lengkap", ProfileExtras{Chips: []ProfileChip{{Label: " React ", Icon: "brand-react"}}, Stats: []ProfileStat{{" 48 ", "Proyek"}}}, true},
	}
	for _, tc := range cases {
		out, msg, ok := normalizeProfileExtras(tc.in)
		if ok != tc.ok {
			t.Errorf("%s: ok=%v (msg %q), ekspektasi %v", tc.name, ok, msg, tc.ok)
		}
		if ok && (out.Chips == nil || out.Stats == nil) {
			t.Errorf("%s: slice hasil harus non-nil", tc.name)
		}
	}
	out, _, _ := normalizeProfileExtras(ProfileExtras{Chips: []ProfileChip{{Label: " React ", Icon: "brand-react"}}, Stats: []ProfileStat{{" 48 ", " Proyek "}}})
	if out.Chips[0].Label != "React" || out.Stats[0].Value != "48" || out.Stats[0].Label != "Proyek" {
		t.Errorf("spasi tidak dirapikan: %+v", out)
	}
}

// TestProfileExtras_SaveAndReadBack -- halaman utama: tersimpan, terbaca
// di GetMyPage & halaman publik; halaman tambahan: cuma pemilik yang bisa
// menyimpan (404 utk halaman milik orang lain).
func TestProfileExtras_SaveAndReadBack(t *testing.T) {
	gin.SetMode(gin.TestMode)
	page, auth := newTestPageHandler(t)
	userID := registerTestUser(t, auth)
	otherID := registerTestUser(t, auth)
	makeTestUserPremium(t, page, userID)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.GET("/page", page.GetMyPage)
	g.PUT("/page/profile-extras", page.UpdateMyPageProfileExtras)
	g.POST("/pages", page.CreatePage)
	g.GET("/pages/:id", page.GetPage)
	g.PUT("/pages/:id/profile-extras", page.UpdatePageProfileExtras)
	router.GET("/public/:username", page.GetPublicPage)
	h := map[string]string{"X-Test-UserID": userID}

	payload := map[string]any{"profile_extras": map[string]any{
		"chips": []map[string]string{{"label": "React", "icon": "brand-react"}, {"label": "Go", "icon": ""}},
		"stats": []map[string]string{{"value": "48", "label": "Proyek"}, {"value": "4.9", "label": "Rating"}},
	}}
	if rec := doJSON(t, router, http.MethodPut, "/page/profile-extras", payload, h); rec.Code != http.StatusOK {
		t.Fatalf("simpan profil: status %d body %s", rec.Code, rec.Body.String())
	}
	bad := map[string]any{"profile_extras": map[string]any{"stats": []map[string]string{{"value": "", "label": "x"}}}}
	if rec := doJSON(t, router, http.MethodPut, "/page/profile-extras", bad, h); rec.Code != http.StatusBadRequest {
		t.Fatalf("statistik tanpa angka: status %d, ekspektasi 400", rec.Code)
	}

	var mine myPageResponse
	_ = json.Unmarshal(doJSON(t, router, http.MethodGet, "/page", nil, h).Body.Bytes(), &mine)
	if len(mine.ProfileExtras.Chips) != 2 || mine.ProfileExtras.Stats[1].Value != "4.9" {
		t.Fatalf("GetMyPage profile_extras = %+v", mine.ProfileExtras)
	}
	var pub publicPageResponse
	pubRec := doJSON(t, router, http.MethodGet, "/public/"+mine.Username, nil, nil)
	_ = json.Unmarshal(pubRec.Body.Bytes(), &pub)
	if len(pub.ProfileExtras.Stats) != 2 || pub.ProfileExtras.Chips[0].Icon != "brand-react" {
		t.Fatalf("halaman publik profile_extras = %+v (status %d)", pub.ProfileExtras, pubRec.Code)
	}

	createRec := doJSON(t, router, http.MethodPost, "/pages", map[string]string{"name": "Toko", "slug": "toko-" + uuid.NewString()[:8], "page_type": "landing"}, h)
	var created struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(createRec.Body.Bytes(), &created)
	if rec := doJSON(t, router, http.MethodPut, "/pages/"+created.ID+"/profile-extras", payload, map[string]string{"X-Test-UserID": otherID}); rec.Code != http.StatusNotFound {
		t.Fatalf("simpan ke halaman milik orang lain: status %d, ekspektasi 404", rec.Code)
	}
	if rec := doJSON(t, router, http.MethodPut, "/pages/"+created.ID+"/profile-extras", payload, h); rec.Code != http.StatusOK {
		t.Fatalf("simpan profil halaman tambahan: status %d body %s", rec.Code, rec.Body.String())
	}
	var detail extraPageDetailResponse
	_ = json.Unmarshal(doJSON(t, router, http.MethodGet, "/pages/"+created.ID, nil, h).Body.Bytes(), &detail)
	if len(detail.ProfileExtras.Chips) != 2 {
		t.Fatalf("GetPage profile_extras = %+v", detail.ProfileExtras)
	}
}

// TestLinksUpdate_AccentColorAndBadgeText -- warna tombol & chip harga per
// tautan (migrasi 000109): hex divalidasi, string kosong membatalkan, label
// dirapikan; ListForPage (daftar tautan editor Toko) kini ikut mengembalikan
// field tampilan yang SEBELUMNYA tidak pernah dikirim (ikon, deskripsi, dst).
func TestLinksUpdate_AccentColorAndBadgeText(t *testing.T) {
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userID := registerTestUser(t, auth)

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/links", links.Create)
	g.PATCH("/links/:id", links.Update)
	g.GET("/links", links.List)
	g.GET("/pages/:id/links", links.ListForPage)
	h := map[string]string{"X-Test-UserID": userID}

	var created linkItem
	_ = json.Unmarshal(doJSON(t, router, http.MethodPost, "/links", map[string]string{"title": "Buat Website", "url": "https://example.com/web", "description": "Website profesional"}, h).Body.Bytes(), &created)

	if rec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"accent_color": "lime"}, h); rec.Code != http.StatusBadRequest {
		t.Fatalf("accent_color bukan hex: status %d, ekspektasi 400", rec.Code)
	}
	if rec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"badge_text": strings.Repeat("x", 25)}, h); rec.Code != http.StatusBadRequest {
		t.Fatalf("badge_text 25 karakter: status %d, ekspektasi 400", rec.Code)
	}
	if rec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"accent_color": "#d7ff60", "badge_text": " Mulai Rp3jt ", "icon_key": "monitor"}, h); rec.Code != http.StatusOK {
		t.Fatalf("set warna & label: status %d body %s", rec.Code, rec.Body.String())
	}

	var items []linkItem
	_ = json.Unmarshal(doJSON(t, router, http.MethodGet, "/links", nil, h).Body.Bytes(), &items)
	if len(items) != 1 || items[0].AccentColor != "#d7ff60" || items[0].BadgeText != "Mulai Rp3jt" {
		t.Fatalf("List = %+v", items)
	}

	var pageID string
	if err := links.DB.QueryRow(t.Context(), `SELECT page_id FROM links WHERE id = $1`, created.ID).Scan(&pageID); err != nil {
		t.Fatalf("page_id: %v", err)
	}
	var forPage []linkItem
	_ = json.Unmarshal(doJSON(t, router, http.MethodGet, "/pages/"+pageID+"/links", nil, h).Body.Bytes(), &forPage)
	if len(forPage) != 1 || forPage[0].AccentColor != "#d7ff60" || forPage[0].IconKey != "monitor" || forPage[0].Description != "Website profesional" {
		t.Fatalf("ListForPage = %+v", forPage)
	}

	if rec := doJSON(t, router, http.MethodPatch, "/links/"+created.ID, map[string]any{"accent_color": "", "badge_text": ""}, h); rec.Code != http.StatusOK {
		t.Fatalf("membatalkan warna/label: status %d", rec.Code)
	}
	var cleared []linkItem
	_ = json.Unmarshal(doJSON(t, router, http.MethodGet, "/links", nil, h).Body.Bytes(), &cleared)
	if cleared[0].AccentColor != "" || cleared[0].BadgeText != "" {
		t.Fatalf("setelah dibatalkan = %+v", cleared[0])
	}
}
