// Package netguard menyediakan http.Client "aman" untuk memanggil URL yang
// DIBERIKAN PENGGUNA (bukan hardcoded internal kita) -- SSRF ditemukan
// langsung lewat audit keamanan (14 Agustus 2026): field products.webhook_url
// (diisi bebas oleh kreator, dipanggil server-side saat produk terjual,
// worker.deliverProductWebhook) sebelumnya TIDAK divalidasi sama sekali,
// dibuktikan lewat eksploitasi langsung -- server berhasil dipaksa memanggil
// alamat loopback yang dikontrol penyerang, membawa email pembeli asli di
// body-nya.
//
// Perbedaan dengan proteksi SSRF yang SUDAH ADA di links.go
// (resolveMapsEmbedCoords, allowedMapsHosts): itu whitelist HOST ketat
// (cuma domain Google Maps) karena tujuannya memang selalu satu layanan
// tertentu. Webhook produk sebaliknya HARUS bisa memanggil server MANA PUN
// milik kreator di internet publik -- jadi strateginya bukan whitelist host,
// tapi BLOKLIST rentang IP privat/loopback/link-local/reserved, diterapkan
// di titik paling akhir yang mungkin: net.Dialer.Control, yang dipanggil
// TEPAT SEBELUM syscall connect() dengan IP yang BENAR-BENAR akan dihubungi
// (bukan cuma hasil resolusi DNS lebih awal) -- ini menutup celah DNS
// rebinding (domain resolve ke IP publik "aman" saat divalidasi, lalu diam-
// diam berubah ke IP privat sebelum benar-benar dihubungi).
package netguard

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"syscall"
	"time"
)

// ErrBlockedDestination -- dikembalikan (dibungkus dgn detail alamat) kalau
// tujuan koneksi keluar berupa alamat privat/internal.
var ErrBlockedDestination = errors.New("tujuan tidak diizinkan (alamat jaringan internal/privat)")

// isBlockedIP -- IP yang TIDAK BOLEH dihubungi dari fitur yang menerima URL
// bebas dari pengguna: loopback (127.0.0.0/8, ::1), link-local termasuk
// endpoint metadata cloud (169.254.0.0/16, fe80::/10), privat RFC1918/
// RFC4193 (10/8, 172.16/12, 192.168/16, fc00::/7), unspecified (0.0.0.0,
// ::), dan multicast -- net.IP.IsPrivate/IsLoopback/dst sudah menutupi
// hampir semua ini sejak Go 1.17, dicek eksplisit satu-satu di sini supaya
// niatnya jelas dibaca tanpa perlu buka dokumentasi stdlib.
func isBlockedIP(ip net.IP) bool {
	return ip.IsLoopback() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() ||
		ip.IsUnspecified() ||
		ip.IsMulticast() ||
		ip.IsPrivate()
}

// dialControl -- dipasang sebagai net.Dialer.Control, dipanggil runtime Go
// TEPAT SEBELUM syscall connect() dengan `address` = IP:port ASLI yang akan
// dihubungi (sudah melewati resolusi DNS) -- titik validasi paling akhir
// dan paling aman utk mencegah TOCTOU/DNS rebinding.
func dialControl(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return fmt.Errorf("alamat tidak valid: %s", host)
	}
	if isBlockedIP(ip) {
		return fmt.Errorf("%w: %s", ErrBlockedDestination, ip.String())
	}
	return nil
}

// NewOutboundClient -- http.Client utk memanggil URL yang diberikan
// pengguna (bukan hardcoded internal). timeout keseluruhan request (bukan
// cuma dial) -- caller (mis. worker webhook) tetap wajib set timeout
// pendek sendiri supaya server pengguna yang lambat/mati tidak menahan
// proses lama. Redirect dibatasi 5 hop (sama seperti resolveMapsEmbedCoords)
// -- setiap hop tetap divalidasi otomatis lewat dialControl di atas karena
// redirect membuat koneksi BARU lewat Transport yang sama.
func NewOutboundClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{
		Timeout: 5 * time.Second,
		Control: dialControl,
	}
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DialContext: dialer.DialContext,
		},
		CheckRedirect: func(_ *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("terlalu banyak redirect")
			}
			return nil
		},
	}
}

// ValidateOutboundURL -- pengecekan CEPAT saat pengguna MENYIMPAN url
// (bukan saat benar-benar dipanggil) supaya kesalahan jelas langsung
// (skema salah, host kosong, atau literal IP privat) ketahuan seketika di
// UI, bukan baru gagal diam-diam nanti di log pengiriman webhook. INI
// BUKAN pengganti dialControl di atas -- DNS record bisa berubah kapan
// saja setelah disimpan (persis celah TOCTOU yang jadi alasan dialControl
// ada), jadi validasi sesungguhnya SELALU di titik panggil (connect-time),
// bukan di sini.
func ValidateOutboundURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return errors.New("URL tidak valid")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("URL harus berskema http atau https")
	}
	host := u.Hostname()
	if host == "" {
		return errors.New("URL wajib punya host")
	}
	if ip := net.ParseIP(host); ip != nil && isBlockedIP(ip) {
		return fmt.Errorf("%w: %s", ErrBlockedDestination, ip.String())
	}
	return nil
}
