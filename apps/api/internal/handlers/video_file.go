package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// Unggah video sendiri di blok "video" -- permintaan langsung pengguna, 25
// September 2026: "saya mau ada blok untuk mengunggah vidio nya sendiri
// update dari blok vidio yang sudah ada saja jadi buatkan pilihan". Blok
// video tetap satu tipe; block_data.source = "upload" memakai
// block_data.video_file_url (file di object storage kita) alih-alih
// video_url YouTube/TikTok. Pola SAMA PERSIS UploadAudio/DeleteAudio
// (path-aware utk node Builder tertanam, key storage per node supaya
// unggah ulang menimpa, query ?v= utk cache-busting).
//
// maxVideoFileSize 50MB: VPS shared + Cloudflare menolak body > 100MB;
// klip pendek utk halaman bio (bukan hosting video panjang -- itu tetap
// lewat YouTube). File produk digital (product.go) punya batas sendiri.
const maxVideoFileSize = 50 * 1024 * 1024

var allowedVideoExt = map[string]string{
	".mp4":  "video/mp4",
	".webm": "video/webm",
	".mov":  "video/quicktime",
}

func videoFileNodeKey(linkID string, path []builderPathSeg) string {
	if len(path) > 0 {
		if last := path[len(path)-1]; last.Kind == "child" && last.ID != "" {
			return last.ID
		}
	}
	return linkID
}

// loadVideoBlock -- muat & resolusi block_data utk node video (root atau
// tertanam). Mengembalikan false kalau respons error sudah dikirim.
func (h *LinksHandler) loadVideoBlock(ctx context.Context, c *gin.Context, linkID string) (rootData, blockData map[string]any, path []builderPathSeg, ok bool) {
	path, err := parseBuilderPath(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path blok tidak valid"})
		return nil, nil, nil, false
	}
	var rootBlockType string
	var rootDataRaw []byte
	if err := h.DB.QueryRow(ctx, `SELECT block_type, block_data FROM links WHERE id = $1`, linkID).Scan(&rootBlockType, &rootDataRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal memuat blok"})
		return nil, nil, nil, false
	}
	if len(rootDataRaw) > 0 {
		_ = json.Unmarshal(rootDataRaw, &rootData)
	}
	if rootData == nil {
		rootData = map[string]any{}
	}
	blockData, blockType, found := resolveBuilderBlockData(rootData, rootBlockType, path)
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "blok tidak ditemukan pada path yang diminta"})
		return nil, nil, nil, false
	}
	if blockType != "video" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tautan ini bukan blok video"})
		return nil, nil, nil, false
	}
	return rootData, blockData, path, true
}

// UploadVideoFile -- POST /dashboard/links/:id/video-file (field "video").
func (h *LinksHandler) UploadVideoFile(c *gin.Context) {
	if h.Storage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "object storage belum dikonfigurasi"})
		return
	}
	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Minute)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}
	rootData, blockData, path, ok := h.loadVideoBlock(ctx, c, linkID)
	if !ok {
		return
	}

	fileHeader, err := c.FormFile("video")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file tidak ditemukan di form (field \"video\")"})
		return
	}
	if fileHeader.Size > maxVideoFileSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ukuran video melebihi 50MB"})
		return
	}
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	contentType, allowed := allowedVideoExt[ext]
	if !allowed {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": fmt.Sprintf("tipe file %q tidak diizinkan, gunakan mp4/webm/mov", ext)})
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal membaca file"})
		return
	}
	defer file.Close()

	nodeKey := videoFileNodeKey(linkID, path)
	// Ekstensi lama yang berbeda (mis. .mov lalu .mp4) dihapus dulu supaya
	// tidak ada file yatim di storage.
	for other := range allowedVideoExt {
		if other != ext {
			_ = h.Storage.Delete(ctx, fmt.Sprintf("video-blocks/%s%s", nodeKey, other))
		}
	}
	key := fmt.Sprintf("video-blocks/%s%s", nodeKey, ext)
	if err := h.Storage.Upload(ctx, key, file, fileHeader.Size, contentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal mengunggah video"})
		return
	}

	videoFileURL := fmt.Sprintf("%s?v=%d", h.Storage.PublicURL(key), time.Now().UnixNano())
	blockData["video_file_url"] = videoFileURL
	blockData["video_file_name"] = fileHeader.Filename
	blockData["source"] = "upload"
	encoded, err := json.Marshal(rootData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "video terunggah tapi gagal menyimpan referensinya"})
		return
	}
	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"video_file_url": videoFileURL, "video_file_name": fileHeader.Filename, "message": "video berhasil diunggah"})
}

// DeleteVideoFile -- DELETE /dashboard/links/:id/video-file.
func (h *LinksHandler) DeleteVideoFile(c *gin.Context) {
	linkID := c.Param("id")
	userID := c.GetString("userID")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if !h.ownsLink(ctx, linkID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tautan tidak ditemukan"})
		return
	}
	rootData, blockData, path, ok := h.loadVideoBlock(ctx, c, linkID)
	if !ok {
		return
	}
	delete(blockData, "video_file_url")
	delete(blockData, "video_file_name")
	encoded, err := json.Marshal(rootData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan data blok"})
		return
	}
	if _, err := h.DB.Exec(ctx, `UPDATE links SET block_data = $1 WHERE id = $2`, encoded, linkID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menghapus video"})
		return
	}
	if h.Storage != nil {
		nodeKey := videoFileNodeKey(linkID, path)
		for ext := range allowedVideoExt {
			_ = h.Storage.Delete(ctx, fmt.Sprintf("video-blocks/%s%s", nodeKey, ext))
		}
	}
	h.invalidateLinkCache(ctx, linkID)
	c.JSON(http.StatusOK, gin.H{"message": "video dihapus dari blok"})
}
