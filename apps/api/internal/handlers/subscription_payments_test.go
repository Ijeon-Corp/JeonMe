package handlers

import "testing"

func TestCyclePaymentStatus(t *testing.T) {
	if st, ok := cyclePaymentStatus("settlement", ""); !ok || st != "paid" {
		t.Errorf("settlement harus paid, dapat %q %v", st, ok)
	}
	if st, ok := cyclePaymentStatus("capture", "accept"); !ok || st != "paid" {
		t.Errorf("capture+accept harus paid, dapat %q %v", st, ok)
	}
	for _, s := range []string{"deny", "cancel", "expire", "failure"} {
		if st, ok := cyclePaymentStatus(s, ""); !ok || st != "failed" {
			t.Errorf("%s harus failed, dapat %q %v", s, st, ok)
		}
	}
	if _, ok := cyclePaymentStatus("pending", ""); ok {
		t.Error("pending tidak boleh dicatat")
	}
}

func TestParseGrossAmountIDR(t *testing.T) {
	cases := map[string]int64{"49000.00": 49000, "490000": 490000, "": 123, "abc": 123, "0.00": 123, " 49000.5 ": 49000}
	for in, want := range cases {
		if got := parseGrossAmountIDR(in, 123); got != want {
			t.Errorf("parseGrossAmountIDR(%q) = %d, want %d", in, got, want)
		}
	}
}
