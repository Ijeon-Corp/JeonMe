package duitku

import "testing"

// Test signature murni (tanpa panggilan API sungguhan -- TIDAK ADA
// kredensial sandbox Duitku tersedia, lihat catatan "kerangka" di
// client.go) -- memastikan minimal 3 formula MD5 yang beda-beda ini
// konsisten & tidak tertukar satu sama lain, sesuatu yang mudah salah
// ketik justru karena mirip.
func TestSignInquiryDeterministic(t *testing.T) {
	got := signInquiry("MC001", "order-1", 15000, "secret")
	want := signInquiry("MC001", "order-1", 15000, "secret")
	if got != want {
		t.Fatalf("signInquiry tidak deterministik: %q != %q", got, want)
	}
	if len(got) != 32 {
		t.Fatalf("signInquiry: panjang MD5 hex seharusnya 32 karakter, dapat %d", len(got))
	}
}

func TestSignaturesDifferBetweenEndpoints(t *testing.T) {
	inquiry := signInquiry("MC001", "order-1", 15000, "secret")
	callback := signCallback("MC001", "15000", "order-1", "secret")
	status := signStatus("MC001", "order-1", "secret")
	if inquiry == callback || inquiry == status || callback == status {
		t.Fatalf("3 formula signature Duitku (inquiry/callback/status) seharusnya beda satu sama lain, dapat: inquiry=%q callback=%q status=%q", inquiry, callback, status)
	}
}

func TestVerifyCallbackSignature(t *testing.T) {
	valid := signCallback("MC001", "15000", "order-1", "secret")
	if !VerifyCallbackSignature("MC001", "15000", "order-1", "secret", valid) {
		t.Fatal("signature valid seharusnya lolos verifikasi")
	}
	if VerifyCallbackSignature("MC001", "15000", "order-1", "secret", "signature-salah") {
		t.Fatal("signature salah seharusnya DITOLAK")
	}
	if VerifyCallbackSignature("MC001", "15000", "order-1", "", valid) {
		t.Fatal("apiKey kosong seharusnya selalu DITOLAK (bukan bypass)")
	}
}

func TestResultCodeToOrderStatus(t *testing.T) {
	if status, ok := ResultCodeToOrderStatus("00"); !ok || status != "paid" {
		t.Fatalf("resultCode 00 seharusnya paid+recognized, dapat status=%q recognized=%v", status, ok)
	}
	if _, ok := ResultCodeToOrderStatus("01"); ok {
		t.Fatal("resultCode selain 00 seharusnya belum final (recognized=false)")
	}
}

func TestStatusCodeToOrderStatus(t *testing.T) {
	cases := map[string]struct {
		wantStatus string
		wantOK     bool
	}{
		"00": {"paid", true},
		"02": {"failed", true},
		"01": {"", false},
		"99": {"", false},
	}
	for code, want := range cases {
		status, ok := StatusCodeToOrderStatus(code)
		if status != want.wantStatus || ok != want.wantOK {
			t.Errorf("StatusCodeToOrderStatus(%q) = (%q, %v), want (%q, %v)", code, status, ok, want.wantStatus, want.wantOK)
		}
	}
}
