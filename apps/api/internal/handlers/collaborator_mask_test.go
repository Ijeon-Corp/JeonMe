package handlers

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// Email pembeli & mitra afiliasi disamarkan HANYA untuk kolaborator yang
// sedang bertindak lewat X-Act-As-Owner (audit backend 24 September 2026).
// Pemilik sendiri tetap melihat alamat utuh.
func TestMaskEmailForCollaborator(t *testing.T) {
	gin.SetMode(gin.TestMode)
	newCtx := func(acting bool) *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		if acting {
			c.Set("actingAsOwner", true)
		}
		return c
	}

	cases := []struct {
		name   string
		acting bool
		in     string
		want   string
	}{
		{"pemilik melihat utuh", false, "budi@example.com", "budi@example.com"},
		{"kolaborator disamarkan", true, "budi@example.com", "b***@example.com"},
		{"kolaborator, string kosong tetap kosong", true, "", ""},
		{"kolaborator, tanpa @ tidak bocor", true, "bukan-email", "***"},
		{"kolaborator, @ di awal tidak bocor", true, "@example.com", "***"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := maskEmailForCollaborator(newCtx(tc.acting), tc.in); got != tc.want {
				t.Fatalf("maskEmailForCollaborator(%q, acting=%v) = %q, ekspektasi %q", tc.in, tc.acting, got, tc.want)
			}
		})
	}
}
