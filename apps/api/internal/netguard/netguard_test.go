package netguard

import (
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestIsBlockedIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1",     // loopback
		"127.0.0.53",    // loopback range
		"::1",           // loopback IPv6
		"169.254.169.254", // link-local -- cloud metadata endpoint
		"169.254.1.1",   // link-local
		"fe80::1",       // link-local IPv6
		"10.0.0.1",      // RFC1918
		"172.16.5.5",    // RFC1918
		"192.168.1.1",   // RFC1918
		"fc00::1",       // RFC4193 unique local
		"0.0.0.0",       // unspecified
		"::",            // unspecified IPv6
		"224.0.0.1",     // multicast
	}
	for _, ip := range blocked {
		t.Run(ip, func(t *testing.T) {
			parsed := net.ParseIP(ip)
			if parsed == nil {
				t.Fatalf("gagal parse IP uji %q", ip)
			}
			if !isBlockedIP(parsed) {
				t.Errorf("isBlockedIP(%q) = false, ekspektasi true (harus diblokir)", ip)
			}
		})
	}
}

func TestIsBlockedIP_PublicAddressesAllowed(t *testing.T) {
	public := []string{
		"8.8.8.8",         // Google DNS
		"1.1.1.1",         // Cloudflare DNS
		"93.184.216.34",   // example.com (dulu)
		"2606:4700:4700::1111", // Cloudflare IPv6
	}
	for _, ip := range public {
		t.Run(ip, func(t *testing.T) {
			parsed := net.ParseIP(ip)
			if parsed == nil {
				t.Fatalf("gagal parse IP uji %q", ip)
			}
			if isBlockedIP(parsed) {
				t.Errorf("isBlockedIP(%q) = true, ekspektasi false (alamat publik harus diizinkan)", ip)
			}
		})
	}
}

func TestValidateOutboundURL(t *testing.T) {
	cases := []struct {
		url     string
		wantErr bool
	}{
		{"https://example.com/webhook", false},
		{"http://example.com/webhook", false},
		{"ftp://example.com/webhook", true},           // skema tidak diizinkan
		{"not a url at all", true},                     // tidak valid
		{"https://127.0.0.1/webhook", true},             // literal IP loopback
		{"https://169.254.169.254/latest/meta-data", true}, // literal IP metadata cloud
		{"https://10.0.0.5/webhook", true},              // literal IP privat
		{"https://", true},                              // host kosong
		// Hostname yang RESOLVE ke IP privat (bukan literal IP) SENGAJA
		// TIDAK ditangkap di sini -- itu tanggung jawab dialControl saat
		// koneksi sungguhan terjadi (lihat komentar ValidateOutboundURL).
	}
	for _, tc := range cases {
		t.Run(tc.url, func(t *testing.T) {
			err := ValidateOutboundURL(tc.url)
			if tc.wantErr && err == nil {
				t.Errorf("ValidateOutboundURL(%q) = nil, ekspektasi error", tc.url)
			}
			if !tc.wantErr && err != nil {
				t.Errorf("ValidateOutboundURL(%q) = %v, ekspektasi nil", tc.url, err)
			}
		})
	}
}

// TestNewOutboundClient_BlocksLoopback -- pengujian end-to-end paling
// penting: server HTTP sungguhan didengarkan di loopback, klien yang
// dihasilkan NewOutboundClient WAJIB menolak menghubunginya walau URL-nya
// sendiri sintaksnya valid (ini persis skenario yang dieksploitasi
// langsung saat audit keamanan 14 Agustus 2026).
func TestNewOutboundClient_BlocksLoopback(t *testing.T) {
	hit := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := NewOutboundClient(3 * time.Second)
	resp, err := client.Get(srv.URL)
	if err == nil {
		if resp != nil {
			resp.Body.Close()
		}
		t.Fatalf("client.Get(%q) sukses, ekspektasi ditolak (tujuan loopback)", srv.URL)
	}
	if !errors.Is(err, ErrBlockedDestination) {
		t.Errorf("error = %v, ekspektasi membungkus ErrBlockedDestination", err)
	}
	if hit {
		t.Error("server test loopback SEMPAT menerima request -- proteksi gagal total")
	}
}

// TestNewOutboundClient_BlocksLANAddress -- perlindungan HARUS mencakup
// seluruh rentang privat (RFC1918), bukan cuma loopback -- disambungkan ke
// alamat LAN sungguhan mesin uji ini sendiri (di sandbox/CI manapun,
// interface non-loopback HAMPIR SELALU berupa IP privat 192.168.x.x/
// 10.x.x.x, bukan IP publik asli -- makanya defense-in-depth di sini
// justru diverifikasi lewat itu, bukan dihindari).
func TestNewOutboundClient_BlocksLANAddress(t *testing.T) {
	addrs, _ := net.InterfaceAddrs()
	var host string
	for _, a := range addrs {
		if ipNet, ok := a.(*net.IPNet); ok && !ipNet.IP.IsLoopback() && ipNet.IP.To4() != nil && ipNet.IP.IsPrivate() {
			host = ipNet.IP.String()
			break
		}
	}
	if host == "" {
		t.Skip("tidak ada interface LAN privat tersedia di lingkungan ini")
	}

	client := NewOutboundClient(3 * time.Second)
	resp, err := client.Get("http://" + net.JoinHostPort(host, "1") + "/")
	if err == nil {
		if resp != nil {
			resp.Body.Close()
		}
		t.Fatalf("client.Get ke alamat LAN %s sukses, ekspektasi ditolak", host)
	}
	if !errors.Is(err, ErrBlockedDestination) {
		t.Errorf("error = %v, ekspektasi membungkus ErrBlockedDestination", err)
	}
}
