package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// ProfileExtras -- layout "Profil Kreator" (migrasi 000109, permintaan
// langsung pengguna 24 September 2026): chip keahlian berikon di bawah bio
// dan baris statistik 3 angka di header halaman. Disimpan utuh di
// pages.profile_extras (JSONB) dan diganti UTUH tiap simpan lewat endpoint
// terpisah -- pola sama persis dgn stiker (UpdateMyPageStickers), BUKAN
// ditambahkan ke COALESCE raksasa UpdateMyPage.
type ProfileChip struct {
	Label string `json:"label"`
	// Icon -- key galeri ikon frontend (lib/icon-library.ts, mis.
	// "brand-react", "graduation-cap", "ph-fill-heart"). Tidak divalidasi
	// terhadap daftar (daftar itu hidup di frontend); key tak dikenal cukup
	// dirender tanpa ikon. Hanya bentuknya yang dibatasi.
	Icon string `json:"icon"`
}

type ProfileStat struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type ProfileExtras struct {
	Chips []ProfileChip `json:"chips"`
	Stats []ProfileStat `json:"stats"`
}

const (
	maxProfileChips     = 5
	maxProfileStats     = 3
	maxProfileChipLabel = 24
	maxProfileStatValue = 8
	maxProfileStatLabel = 16
)

var profileIconKeyPattern = regexp.MustCompile(`^[a-z0-9-]{0,40}$`)

// decodeProfileExtras -- JSONB mentah -> struct dgn slice SELALU non-nil
// (klien tidak perlu cek null). Data rusak/kosong jatuh ke nilai kosong,
// tidak menggagalkan pemuatan halaman (fitur tampilan, bukan data inti).
func decodeProfileExtras(raw []byte) ProfileExtras {
	var p ProfileExtras
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &p)
	}
	if p.Chips == nil {
		p.Chips = []ProfileChip{}
	}
	if p.Stats == nil {
		p.Stats = []ProfileStat{}
	}
	return p
}

// normalizeProfileExtras -- trim spasi lalu validasi. Ditolak (400), bukan
// dipangkas diam-diam, supaya kreator tahu persis kenapa gagal -- sama
// semangatnya dgn validateStickers.
func normalizeProfileExtras(p ProfileExtras) (ProfileExtras, string, bool) {
	out := ProfileExtras{Chips: []ProfileChip{}, Stats: []ProfileStat{}}
	if len(p.Chips) > maxProfileChips {
		return out, fmt.Sprintf("maksimal %d chip keahlian", maxProfileChips), false
	}
	if len(p.Stats) > maxProfileStats {
		return out, fmt.Sprintf("maksimal %d statistik", maxProfileStats), false
	}
	for _, ch := range p.Chips {
		label := strings.TrimSpace(ch.Label)
		icon := strings.TrimSpace(ch.Icon)
		if label == "" {
			return out, "label chip keahlian tidak boleh kosong", false
		}
		if utf8.RuneCountInString(label) > maxProfileChipLabel {
			return out, fmt.Sprintf("label chip maksimal %d karakter", maxProfileChipLabel), false
		}
		if !profileIconKeyPattern.MatchString(icon) {
			return out, "ikon chip tidak valid", false
		}
		out.Chips = append(out.Chips, ProfileChip{Label: label, Icon: icon})
	}
	for _, st := range p.Stats {
		value := strings.TrimSpace(st.Value)
		label := strings.TrimSpace(st.Label)
		if value == "" || label == "" {
			return out, "angka dan keterangan statistik wajib diisi", false
		}
		if utf8.RuneCountInString(value) > maxProfileStatValue {
			return out, fmt.Sprintf("angka statistik maksimal %d karakter", maxProfileStatValue), false
		}
		if utf8.RuneCountInString(label) > maxProfileStatLabel {
			return out, fmt.Sprintf("keterangan statistik maksimal %d karakter", maxProfileStatLabel), false
		}
		out.Stats = append(out.Stats, ProfileStat{Value: value, Label: label})
	}
	return out, "", true
}

type updateProfileExtrasRequest struct {
	ProfileExtras ProfileExtras `json:"profile_extras"`
}

// UpdateMyPageProfileExtras -- PUT /dashboard/page/profile-extras (halaman
// utama). Cache halaman publik dihapus supaya perubahan langsung terlihat.
func (h *PageHandler) UpdateMyPageProfileExtras(c *gin.Context) {
	var req updateProfileExtrasRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	extras, msg, ok := normalizeProfileExtras(req.ProfileExtras)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	userID := c.GetString("userID")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	raw, _ := json.Marshal(extras)
	var username string
	if err := h.DB.QueryRow(ctx, `
		UPDATE pages SET profile_extras = $1 WHERE user_id = $2 AND is_primary = true RETURNING (SELECT username FROM users WHERE id = $2)
	`, raw, userID).Scan(&username); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan profil"})
		return
	}
	if h.RDB != nil {
		h.RDB.Del(ctx, "page:"+username)
	}
	c.JSON(http.StatusOK, gin.H{"profile_extras": extras})
}

// UpdatePageProfileExtras -- PUT /dashboard/pages/:id/profile-extras
// (halaman TAMBAHAN: Toko/landing/bio kedua). Kepemilikan dicek di WHERE
// (id + user_id + is_primary=false), pola sama dgn UpdatePageStickers.
func (h *PageHandler) UpdatePageProfileExtras(c *gin.Context) {
	pageID := c.Param("id")
	userID := c.GetString("userID")

	var req updateProfileExtrasRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationMessage(err)})
		return
	}
	extras, msg, ok := normalizeProfileExtras(req.ProfileExtras)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	raw, _ := json.Marshal(extras)
	var slug string
	if err := h.DB.QueryRow(ctx, `
		UPDATE pages SET profile_extras = $1
		WHERE id = $2 AND user_id = $3 AND is_primary = false
		RETURNING COALESCE(slug, '')
	`, raw, pageID, userID).Scan(&slug); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "halaman tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan profil"})
		return
	}
	if h.RDB != nil && slug != "" {
		var ownerUsername string
		if scanErr := h.DB.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&ownerUsername); scanErr == nil {
			h.RDB.Del(ctx, "page-slug:"+ownerUsername+":"+slug)
		}
	}
	c.JSON(http.StatusOK, gin.H{"profile_extras": extras})
}
