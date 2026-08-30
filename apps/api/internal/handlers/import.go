package handlers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/errgroup"

	"github.com/jeonme/api/internal/netguard"
	"github.com/jeonme/api/internal/pageimport"
)

// ImportHandler -- Fitur Import (permintaan langsung pengguna, 31 Agustus
// 2026): "bisa ga buat fungsi... membuat bentuk visual persis seperti foto
// yang diunggah dan juga bisa mengambil seluruh link". Generate halaman
// Jeon.id dari 2 input: screenshot link-in-bio lama (dicocokkan ke sistem
// tema Jeon.id lewat Claude vision, lihat pageimport.VisionClient) + URL
// halaman yang sama (di-scrape semua link-nya, lihat pageimport.ScrapeLinks).
//
// Dua sub-tugas berjalan PARALEL & masing-masing independen boleh gagal
// (pola errgroup dengan tiap g.Go SELALU return nil, sama persis GetPublicPage
// di page.go -- supaya satu sub-tugas gagal/timeout TIDAK membatalkan yang
// lain lewat context sharing bawaan errgroup) -- respons SELALU 200 dengan
// kedua "belahan" hasil (Theme/ThemeError, Links/LinksError), frontend yang
// memutuskan alur lanjut sesuai belahan mana yang sukses (lihat
// app/dashboard/import/page.tsx).
//
// Owner-only -- TIDAK dipasangi middleware.ActAsOwner di routes.go, pola
// sama seperti /balance, /kyc, /settings/profile (kolaborator tidak boleh
// akses): endpoint ini berbiaya nyata per panggilan (Claude vision API) DAN
// sekaligus menyentuh domain desain (tema/layout) & link, tidak ada satu
// izin can_edit_* yang mencakup keduanya.
type ImportHandler struct {
	DB     *pgxpool.Pool
	RDB    *redis.Client
	Vision *pageimport.VisionClient
}

func NewImportHandler(db *pgxpool.Pool, rdb *redis.Client, vision *pageimport.VisionClient) *ImportHandler {
	return &ImportHandler{DB: db, RDB: rdb, Vision: vision}
}

// maxScreenshotSize -- 8MB. Foto profil/produk lain di codebase ini 5MB,
// tapi screenshot layar penuh (sering full-page, bukan cuma viewport)
// biasanya lebih besar dari foto biasa -- lagipula ukuran unggahan asli
// tidak berdampak ke biaya API (lihat resizeForVision di vision.go, selalu
// di-downscale sebelum dikirim).
const maxScreenshotSize = 8 * 1024 * 1024

var allowedScreenshotExt = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true,
}

// importDailyLimit -- proteksi lapis KEDUA selain gate Premium di bawah:
// batasi panggilan per user per hari (bukan per IP seperti
// middleware.RateLimit yang ada -- IP kantor/NAT bisa salah membatasi
// banyak user Premium berbeda sekaligus, key per-user lebih tepat utk
// kontrol biaya per akun) supaya satu akun Premium tidak bisa menghabiskan
// biaya Anthropic API tak terbatas.
const importDailyLimit = 10

// importThemeJSON -- bentuk respons theme ke frontend, field JSON snake_case
// sengaja sama dengan input updateMyPage() (apps/web/lib/api-client.ts)
// supaya frontend bisa oper sebagian besar field nyaris langsung tanpa
// remapping manual.
type importThemeJSON struct {
	Theme         string                  `json:"theme"`
	LayoutVariant string                  `json:"layout_variant"`
	Custom        *pageimport.CustomTheme `json:"custom,omitempty"`
	Confidence    string                  `json:"confidence"`
	Notes         string                  `json:"notes"`
}

type importAnalyzeResponse struct {
	Platform   string                   `json:"platform"`
	Theme      *importThemeJSON         `json:"theme"`
	ThemeError string                   `json:"theme_error,omitempty"`
	Links      []pageimport.ScrapedLink `json:"links"`
	LinksError string                   `json:"links_error,omitempty"`
}

// Analyze -- multipart: field "screenshot" (file, opsional -- lihat catatan
// di bawah) + "url" (teks, wajib).
func (h *ImportHandler) Analyze(c *gin.Context) {
	userID := c.GetString("userID")

	if !isPremiumUser(c.Request.Context(), h.DB, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Fitur Import hanya untuk kreator Premium -- upgrade dulu di Pengaturan > Langganan."})
		return
	}

	if h.RDB != nil {
		key := "import:count:" + userID
		count, err := h.RDB.Incr(c.Request.Context(), key).Result()
		if err == nil {
			if count == 1 {
				h.RDB.Expire(c.Request.Context(), key, 24*time.Hour)
			}
			if count > importDailyLimit {
				c.JSON(http.StatusTooManyRequests, gin.H{"error": "Batas Import harian tercapai (maks 10x/hari), coba lagi besok."})
				return
			}
		}
		// err != nil (mis. Redis down): fail-open -- jangan blokir fitur
		// berbayar yang diminta eksplisit gara-gara masalah infra cache
		// kita sendiri, gate Premium di atas tetap berlaku sebagai batas
		// utama.
	}

	rawURL := c.PostForm("url")
	if rawURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "URL wajib diisi"})
		return
	}
	if err := netguard.ValidateOutboundURL(rawURL); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "URL tidak valid: " + err.Error()})
		return
	}

	// Screenshot SENGAJA opsional di lapis ini (bukan wajib seperti url) --
	// kalau kreator entah bagaimana submit tanpa file (bug klien/koneksi
	// gagal upload), lebih baik tetap proses scraping link daripada
	// menolak seluruh permintaan (konsisten dengan filosofi "dua belahan
	// independen" di seluruh fitur ini).
	var screenshotBytes []byte
	var missingScreenshotMsg string
	fileHeader, ferr := c.FormFile("screenshot")
	if ferr != nil {
		missingScreenshotMsg = "Screenshot tidak disertakan."
	} else {
		if fileHeader.Size > maxScreenshotSize {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran screenshot melebihi 8MB"})
			return
		}
		ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
		if !allowedScreenshotExt[ext] {
			c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan jpg/png/webp", ext)})
			return
		}
		f, err := fileHeader.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file screenshot"})
			return
		}
		screenshotBytes, err = io.ReadAll(f)
		f.Close()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file screenshot"})
			return
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	var (
		platform  string
		themeJSON *importThemeJSON
		themeErr  = missingScreenshotMsg
		links     []pageimport.ScrapedLink
		linksErr  string
	)

	g, gctx := errgroup.WithContext(ctx)

	if len(screenshotBytes) > 0 {
		g.Go(func() error {
			visionCtx, cancel := context.WithTimeout(gctx, 25*time.Second)
			defer cancel()
			result, err := h.Vision.AnalyzeScreenshot(visionCtx, bytes.NewReader(screenshotBytes))
			if err != nil {
				if errors.Is(err, pageimport.ErrNotConfigured) {
					themeErr = "Fitur pencocokan tema belum dikonfigurasi di server."
				} else {
					themeErr = "Gagal menganalisis screenshot, coba lagi."
				}
				return nil
			}
			themeJSON = &importThemeJSON{
				Theme:         result.Theme,
				LayoutVariant: result.LayoutVariant,
				Custom:        result.Custom,
				Confidence:    result.Confidence,
				Notes:         result.Notes,
			}
			return nil
		})
	}

	g.Go(func() error {
		scrapeCtx, cancel := context.WithTimeout(gctx, 12*time.Second)
		defer cancel()
		p, l, err := pageimport.ScrapeLinks(scrapeCtx, rawURL)
		platform = p
		if err != nil {
			linksErr = err.Error()
			return nil
		}
		links = l
		return nil
	})

	_ = g.Wait() // selalu nil -- tiap g.Go di atas selalu return nil, error asli sudah ditangkap ke var lokal masing-masing

	if links == nil {
		links = []pageimport.ScrapedLink{}
	}

	c.JSON(http.StatusOK, importAnalyzeResponse{
		Platform:   platform,
		Theme:      themeJSON,
		ThemeError: themeErr,
		Links:      links,
		LinksError: linksErr,
	})
}
