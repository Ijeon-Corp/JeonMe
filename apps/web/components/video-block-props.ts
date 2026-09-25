// Modul terpisah (bukan di VideoEmbedBlock.tsx) supaya pemanggil bisa
// memakainya tanpa ikut memuat komponen video yang di-import dinamis.
// videoBlockProps -- SATU pemetaan block_data -> props utk semua pemanggil
// (PagePreview/Builder/Landing, blok "video" & "video_image"). source
// "upload" (25 September 2026, unggah video sendiri) memakai
// video_file_url; selain itu video_url YouTube/TikTok. autoplay bawaan
// aktif (hanya false eksplisit yang mematikan).
export function videoBlockProps(blockData: Record<string, unknown> | undefined): { videoUrl: string; fileUrl?: string; autoplay: boolean } {
  const d = blockData ?? {};
  const fileUrl = d.source === "upload" ? ((d.video_file_url as string) || undefined) : undefined;
  return { videoUrl: (d.video_url as string) ?? "", fileUrl, autoplay: d.autoplay !== false };
}
