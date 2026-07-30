package whatsapp

import "testing"

func TestNormalizeIndonesianPhone(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{"awalan nol", "081234567890", "6281234567890", false},
		{"sudah format internasional tanpa plus", "6281234567890", "6281234567890", false},
		{"format internasional dengan plus", "+6281234567890", "6281234567890", false},
		{"dengan spasi dan strip", "0812-3456-7890", "6281234567890", false},
		{"62 tertempel 0 di depan", "6208123456789", "628123456789", false},
		{"terlalu pendek", "12345", "", true},
		{"kosong", "", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeIndonesianPhone(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Errorf("NormalizeIndonesianPhone(%q) = %q, want error", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("NormalizeIndonesianPhone(%q) unexpected error: %v", tc.in, err)
			}
			if got != tc.want {
				t.Errorf("NormalizeIndonesianPhone(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
