// Package mailer mengirim email notifikasi lewat SMTP polos (net/smtp
// standar library -- cukup untuk kebutuhan MVP, tidak perlu SDK provider
// pihak ketiga tertentu). Soal PROVIDER SMTP sungguhan (SES/Mailgun/dst,
// atau kredensial SMTP biasa) masih keputusan operasional yang belum
// diambil -- lihat Rencana-Sprint-Jeonme.xlsx Sprint 3, task No.47.
package mailer

import (
	"fmt"
	"log"
	"net/smtp"
	"strings"
)

type Client struct {
	Host     string
	Port     int
	Username string
	Password string
	FromAddr string
}

func NewClient(host string, port int, username, password, fromAddr string) *Client {
	return &Client{Host: host, Port: port, Username: username, Password: password, FromAddr: fromAddr}
}

// stripCRLF -- audit keamanan (28 Juli 2026, permintaan langsung pengguna
// sebelum deploy production): "subject" & "to" dulu ditulis apa adanya ke
// header SMTP mentah di bawah TANPA disaring -- "subject" bisa berasal dari
// data yang diisi kreator sendiri (mis. nama produk, lihat worker.go), yang
// BOLEH berisi CR/LF. Kreator jahat bisa menaruh "\r\nBcc: attacker@..." di
// nama produk supaya SETIAP email notifikasi pembelian produk itu diam-diam
// mem-BCC alamat pilihannya sendiri (CWE-93, SMTP header injection). CR/LF
// dibuang di SINI (bukan cuma di titik panggil worker.go) supaya SEMUA
// pemanggil Send() saat ini & masa depan otomatis terlindungi.
func stripCRLF(s string) string {
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "")
	return s
}

// Send -- kalau SMTP_HOST belum diisi, sengaja log-only dan mengembalikan
// nil (BUKAN error). Ini job asynq: kalau di sini mengembalikan error,
// asynq akan retry berkali-kali dengan backoff -- percuma diulang selama
// memang belum ada provider SMTP terkonfigurasi, beda dengan kegagalan
// sementara (SMTP down sesaat) yang justru harus retry.
func (c *Client) Send(to, subject, body string) error {
	if c.Host == "" {
		log.Printf("mailer: SMTP belum dikonfigurasi, lewati pengiriman ke %s (subjek: %q)", to, subject)
		return nil
	}

	to = stripCRLF(to)
	subject = stripCRLF(subject)

	addr := fmt.Sprintf("%s:%d", c.Host, c.Port)
	var auth smtp.Auth
	if c.Username != "" {
		auth = smtp.PlainAuth("", c.Username, c.Password, c.Host)
	}

	msg := []byte(fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n",
		c.FromAddr, to, subject, body,
	))

	if err := smtp.SendMail(addr, auth, c.FromAddr, []string{to}, msg); err != nil {
		return fmt.Errorf("mailer: gagal kirim email ke %s: %w", to, err)
	}
	return nil
}
