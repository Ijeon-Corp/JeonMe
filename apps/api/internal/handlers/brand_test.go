package handlers

import "testing"

func TestValidateCampaignInput(t *testing.T) {
	ok := brandCampaignInput{Kind: "sponsored_link", Title: "Promo Kopi", URL: "https://brand.id/promo"}
	if msg := validateCampaignInput(&ok); msg != "" {
		t.Fatalf("input valid ditolak: %s", msg)
	}
	if ok.Slots != 1 {
		t.Errorf("slots kosong harus default 1, dapat %d", ok.Slots)
	}
	bad := []brandCampaignInput{
		{Kind: "x", Title: "Promo", URL: "https://a.b"},
		{Kind: "sponsored_link", Title: "ab", URL: "https://a.b"},
		{Kind: "sponsored_link", Title: "Promo", URL: "ftp://a.b"},
		{Kind: "sponsored_link", Title: "Promo", URL: ""},
		{Kind: "brand_deal", Title: "Promo", URL: "bukan-url"},
		{Kind: "brand_deal", Title: "Promo", FeeIDR: -1},
		{Kind: "brand_deal", Title: "Promo", Slots: 101},
	}
	for i, in := range bad {
		if msg := validateCampaignInput(&in); msg == "" {
			t.Errorf("kasus %d harus ditolak: %+v", i, in)
		}
	}
	deal := brandCampaignInput{Kind: "brand_deal", Title: "Kolab Konten"}
	if msg := validateCampaignInput(&deal); msg != "" {
		t.Errorf("brand_deal tanpa URL harus boleh: %s", msg)
	}
}

func TestBrandTransitionAllowed(t *testing.T) {
	allowed := [][2]string{{"applied", "accepted"}, {"applied", "rejected"}, {"accepted", "completed"}, {"accepted", "rejected"}}
	for _, p := range allowed {
		if !brandTransitionAllowed(p[0], p[1]) {
			t.Errorf("%s -> %s harus diizinkan", p[0], p[1])
		}
	}
	denied := [][2]string{{"applied", "completed"}, {"rejected", "accepted"}, {"completed", "accepted"}, {"completed", "rejected"}, {"accepted", "applied"}}
	for _, p := range denied {
		if brandTransitionAllowed(p[0], p[1]) {
			t.Errorf("%s -> %s harus ditolak", p[0], p[1])
		}
	}
}
