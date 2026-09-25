package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jeonme/api/internal/storage"
)

// TestUploadVideoFile_RoundTrip -- unggah video sendiri (video_file.go)
// terhadap MinIO SUNGGUHAN: file tersimpan, bisa dibaca publik lewat
// PublicURL (prefix "video-blocks" wajib terdaftar di EnsurePublicRead),
// block_data diperbarui, lalu DELETE menghapus objeknya. Skip kalau
// MINIO_TEST_ENDPOINT/VIDEO_TEST_FILE tidak diset (tidak ada MinIO di CI).
func TestUploadVideoFile_RoundTrip(t *testing.T) {
	endpoint := os.Getenv("MINIO_TEST_ENDPOINT")
	clip := os.Getenv("VIDEO_TEST_FILE")
	if endpoint == "" || clip == "" {
		t.Skip("MINIO_TEST_ENDPOINT/VIDEO_TEST_FILE tidak diset")
	}
	gin.SetMode(gin.TestMode)
	links, auth := newTestLinksHandler(t)
	userID := registerTestUser(t, auth)

	st, err := storage.NewClient(endpoint, os.Getenv("MINIO_TEST_ACCESS_KEY"), os.Getenv("MINIO_TEST_SECRET_KEY"), "jeonme-test", false)
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := st.EnsureBucket(ctx); err != nil {
		t.Fatalf("bucket: %v", err)
	}
	if err := st.EnsurePublicRead(ctx, "video-blocks"); err != nil {
		t.Fatalf("public read: %v", err)
	}
	links.Storage = st

	router := gin.New()
	g := router.Group("/", fakeAuth())
	g.POST("/blocks", links.CreateBlock)
	g.POST("/links/:id/video-file", links.UploadVideoFile)
	g.DELETE("/links/:id/video-file", links.DeleteVideoFile)
	g.GET("/links", links.List)
	headers := map[string]string{"X-Test-UserID": userID}

	rec := doJSON(t, router, http.MethodPost, "/blocks", map[string]any{"block_type": "video", "title": "Klip", "block_data": map[string]any{"source": "upload"}}, headers)
	if rec.Code >= 300 {
		t.Fatalf("buat blok: %d %s", rec.Code, rec.Body.String())
	}
	var created linkItem
	_ = json.Unmarshal(rec.Body.Bytes(), &created)

	data, err := os.ReadFile(clip)
	if err != nil {
		t.Fatalf("baca klip: %v", err)
	}
	upload := func(name string) *httptest.ResponseRecorder {
		var body bytes.Buffer
		w := multipart.NewWriter(&body)
		fw, _ := w.CreateFormFile("video", name)
		_, _ = fw.Write(data)
		_ = w.Close()
		req := httptest.NewRequest(http.MethodPost, "/links/"+created.ID+"/video-file", &body)
		req.Header.Set("Content-Type", w.FormDataContentType())
		req.Header.Set("X-Test-UserID", userID)
		r := httptest.NewRecorder()
		router.ServeHTTP(r, req)
		return r
	}
	if r := upload("klip.avi"); r.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("ekstensi .avi harus ditolak 415, dapat %d", r.Code)
	}
	r := upload("klip.mp4")
	if r.Code != http.StatusOK {
		t.Fatalf("unggah: %d %s", r.Code, r.Body.String())
	}
	var res struct {
		VideoFileURL string `json:"video_file_url"`
	}
	_ = json.Unmarshal(r.Body.Bytes(), &res)
	if !strings.Contains(res.VideoFileURL, "/video-blocks/"+created.ID+".mp4") {
		t.Fatalf("URL tak terduga: %s", res.VideoFileURL)
	}
	resp, err := http.Get(res.VideoFileURL)
	if err != nil {
		t.Fatalf("GET publik: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || resp.Header.Get("Content-Type") != "video/mp4" {
		t.Fatalf("akses publik: status %d, type %q", resp.StatusCode, resp.Header.Get("Content-Type"))
	}

	list := doJSON(t, router, http.MethodGet, "/links", nil, headers)
	if !strings.Contains(list.Body.String(), `"source":"upload"`) || !strings.Contains(list.Body.String(), "video_file_url") {
		t.Fatalf("block_data tidak diperbarui: %s", list.Body.String())
	}

	if d := doJSON(t, router, http.MethodDelete, "/links/"+created.ID+"/video-file", nil, headers); d.Code != http.StatusOK {
		t.Fatalf("hapus: %d %s", d.Code, d.Body.String())
	}
	if st.Exists(ctx, "video-blocks/"+created.ID+".mp4") {
		t.Fatalf("objek video masih ada setelah dihapus")
	}
}
