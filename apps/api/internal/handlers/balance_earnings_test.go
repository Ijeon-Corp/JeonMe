package handlers

import "testing"

// Range harus di-clamp ke pilihan yang didukung; nilai aneh jatuh ke 30 hari
// (bukan error 400) supaya klien lama tanpa parameter tetap dapat data.
func TestEarningsRangeDays(t *testing.T) {
	cases := map[string]int{"": 30, "30": 30, "7": 7, "90": 90, "365": 365, "0": 0, "all": 0, "abc": 30, "-5": 30}
	for in, want := range cases {
		if got := earningsRangeDays(in); got != want {
			t.Errorf("earningsRangeDays(%q) = %d, want %d", in, got, want)
		}
	}
}
