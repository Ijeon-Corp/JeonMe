package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CustomDomainHandler mengimplementasikan No.81 (Sprint 9): domain kustom
// untuk halaman kreator. Diferensiator nyata -- Linktree eksplisit TIDAK
// menyediakan domain kustom sama sekali (dikonfirmasi help center mereka),
// Lynk.id menyediakannya sebagai fitur PRO.
//
// CATATAN LINGKUP (per keputusan eksplisit pengguna, 25 Juli 2026): handler
// ini HANYA mengerjakan bagian aplikasi -- penyimpanan domain, verifikasi
// kepemilikan lewat DNS (CNAME+TXT), dan resolusi domain->username publik
// (dipakai proxy.ts). BELUM mengerjakan wiring infrastruktur produksi
// (konfigurasi Apache/reverse-proxy untuk menerima Host header sembarang +
// otomasi sertifikat SSL per domain, mis. Certbot) -- itu perlu domain uji
// sungguhan & perubahan langsung ke server produksi, sengaja ditunda
// sampai ada domain uji nyata untuk diverifikasi, dicatat sebagai
// pekerjaan lanjutan di backlog.
type CustomDomainHandler struct {
	DB          *pgxpool.Pool
	CnameTarget string
}

func NewCustomDomainHandler(db *pgxpool.Pool, cnameTarget string) *CustomDomainHandler {
	return &CustomDomainHandler{DB: db, CnameTarget: cnameTarget}
}

var domainPattern = regexp.MustCompile(`^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$`)

func generateVerificationToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

type domainSettingsResponse struct {
	Domain            string `json:"domain"`
	Verified          bool   `json:"verified"`
	VerificationToken string `json:"verification_token"`
	CnameTarget       string `json:"cname_target"`
	TxtRecordName     string `json:"txt_record_name"`
}

func (h *CustomDomainHandler) buildResponse(domain, token string, verified bool) domainSettingsResponse {
	resp := domainSettingsResponse{Domain: domain, Verified: verified, VerificationToken: token, CnameTarget: h.CnameTarget}
	if domain != "" {
		resp.TxtRecordName = "_jeonme-verify." + domain
	}
	return resp
}

// Get — dipakai halaman pengaturan dashboard. Belum-pernah-diisi
// mengembalikan state kosong (domain=""), bukan 404.
func (h *CustomDomainHandler) Get(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var domain, token string
	var verified bool
	if err := h.DB.QueryRow(ctx, `
		SELECT custom_domain, custom_domain_verified, custom_domain_token FROM pages WHERE user_id = $1 AND is_primary = true
	`, userID).Scan(&domain, &verified, &token); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat pengaturan domain"})
		return
	}

	c.JSON(http.StatusOK, h.buildResponse(domain, token, verified))
}

type setDomainRequest struct {
	Domain string `json:"domain" binding:"required,max=255"`
}

// Set — mengatur domain kustom yang ingin dipakai kreator. SELALU direset
// ke belum-terverifikasi (kreator harus memverifikasi ulang lewat DNS) --
// mengganti domain kustom tanpa verifikasi ulang bisa membajak halaman
// kreator lain kalau domain lama sempat dipakai orang lain.
func (h *CustomDomainHandler) Set(c *gin.Context) {
	var req setDomainRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	domain := strings.ToLower(strings.TrimSpace(req.Domain))
	if !domainPattern.MatchString(domain) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "format domain tidak valid (mis. toko.namamu.com)"})
		return
	}

	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	token, err := generateVerificationToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membuat token verifikasi"})
		return
	}

	if _, err := h.DB.Exec(ctx, `
		UPDATE pages SET custom_domain = $1, custom_domain_verified = false, custom_domain_token = $2
		WHERE user_id = $3 AND is_primary = true
	`, domain, token, userID); err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "domain ini sudah dipakai kreator lain"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan domain"})
		return
	}

	c.JSON(http.StatusOK, h.buildResponse(domain, token, false))
}

// Verify — memeriksa DNS sungguhan (bukan cuma menerima klaim kreator):
// CNAME domain harus mengarah ke CnameTarget, DAN TXT record
// _jeonme-verify.{domain} harus berisi token yang sama seperti yang
// ditampilkan di dashboard. Keduanya wajib lolos -- CNAME saja tidak cukup
// karena siapa pun bisa mengarahkan CNAME ke jeonme.com tanpa benar-benar
// memiliki domainnya (mis. sekadar ingin tahu bisakah tampil), TXT
// membuktikan mereka juga bisa menambah record DNS sembarang di domain
// tersebut (proof of ownership).
func (h *CustomDomainHandler) Verify(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var domain, token string
	if err := h.DB.QueryRow(ctx, `SELECT custom_domain, custom_domain_token FROM pages WHERE user_id = $1 AND is_primary = true`, userID).
		Scan(&domain, &token); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat domain"})
		return
	}
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "belum ada domain untuk diverifikasi"})
		return
	}

	cnameOK := false
	if cname, err := net.LookupCNAME(domain); err == nil {
		cnameOK = strings.TrimSuffix(strings.ToLower(cname), ".") == strings.TrimSuffix(strings.ToLower(h.CnameTarget), ".")
	}

	txtOK := false
	if txtRecords, err := net.LookupTXT("_jeonme-verify." + domain); err == nil {
		for _, rec := range txtRecords {
			if strings.TrimSpace(rec) == token {
				txtOK = true
				break
			}
		}
	}

	verified := cnameOK && txtOK
	if _, err := h.DB.Exec(ctx, `UPDATE pages SET custom_domain_verified = $1 WHERE user_id = $2 AND is_primary = true`, verified, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan status verifikasi"})
		return
	}

	resp := h.buildResponse(domain, token, verified)
	if !verified {
		reason := "CNAME dan TXT record belum ditemukan atau belum sesuai"
		if cnameOK && !txtOK {
			reason = "CNAME sudah benar, tapi TXT record verifikasi belum ditemukan/belum sesuai"
		} else if !cnameOK && txtOK {
			reason = "TXT record sudah benar, tapi CNAME belum mengarah ke " + h.CnameTarget
		}
		c.JSON(http.StatusOK, gin.H{"domain_settings": resp, "message": reason})
		return
	}

	c.JSON(http.StatusOK, gin.H{"domain_settings": resp, "message": "domain terverifikasi"})
}

// Delete — melepas domain kustom (mis. kreator mau ganti domain lain atau
// berhenti pakai).
func (h *CustomDomainHandler) Delete(c *gin.Context) {
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.DB.Exec(ctx, `
		UPDATE pages SET custom_domain = '', custom_domain_verified = false, custom_domain_token = '' WHERE user_id = $1 AND is_primary = true
	`, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal melepas domain"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "domain kustom dilepas"})
}

// ResolveUsername — endpoint PUBLIK dipanggil proxy.ts (bukan
// browser) untuk menerjemahkan Host header domain kustom ke username,
// supaya Next.js bisa me-rewrite request ke /{username} secara internal.
// Hanya domain yang SUDAH terverifikasi yang di-resolve -- domain yang
// baru diklaim tapi belum diverifikasi tidak boleh bisa menyamar sebagai
// halaman kreator manapun.
func (h *CustomDomainHandler) ResolveUsername(c *gin.Context) {
	domain := strings.ToLower(c.Param("domain"))

	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	var username string
	err := h.DB.QueryRow(ctx, `
		SELECT u.username FROM pages p JOIN users u ON u.id = p.user_id
		WHERE p.custom_domain = $1 AND p.custom_domain_verified = true AND p.is_published = true
	`, domain).Scan(&username)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "domain tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat domain"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"username": username})
}
