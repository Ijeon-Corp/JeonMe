"use client";

import { useRef, useState } from "react";
import { Link2, Trash2, Upload } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { ApiError, deleteVideoFile, uploadVideoFile, type BuilderSeg } from "@/lib/api-client";

// VideoSourceField -- pilihan sumber blok video (25 September 2026,
// permintaan langsung pengguna: "saya mau ada blok untuk mengunggah vidio
// nya sendiri update dari blok vidio yang sudah ada saja jadi buatkan
// pilihan"): "Tautan" (YouTube/TikTok, input URL biasa) atau "Unggah"
// (file sendiri, lihat video_file.go). SATU komponen utk halaman utama,
// Toko, dan Builder.
//
// Unggahan langsung terkirim (bukan menunggu tombol Simpan), sama seperti
// audio/file/galeri -- backend sekaligus menyetel source "upload".
// `linkId` null = blok belum tersimpan (form buat blok): area unggah
// diganti petunjuk bahwa video diunggah setelah blok dibuat.
const MAX_MB = 50;
const ACCEPT = ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime";

export default function VideoSourceField({
  source,
  onSourceChange,
  url,
  onUrlChange,
  urlInputClassName,
  linkId,
  path,
  fileName,
  fileUrl,
  onUploaded,
  onRemoved,
  onError,
  resolveLinkId,
}: {
  source: "url" | "upload";
  onSourceChange: (source: "url" | "upload") => void;
  url: string;
  onUrlChange: (url: string) => void;
  urlInputClassName: string;
  linkId: string | null;
  path?: BuilderSeg[];
  fileName?: string;
  fileUrl?: string;
  onUploaded?: (res: { video_file_url: string; video_file_name: string }) => void;
  onRemoved?: () => void;
  onError?: (message: string) => void;
  // resolveLinkId -- Builder: blok root baru mungkin belum tersimpan di
  // server (id sementara); dipanggil sebelum unggah/hapus utk memastikan
  // barisnya ada (onEnsureRootPersisted) & mendapat id aslinya.
  resolveLinkId?: () => Promise<string>;
}) {
  const { t } = useLocale();
  const T = (key: string) => t(`dashboard.pages.links.blockForm.video.${key}`);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !linkId) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      onError?.(T("uploadTooLarge").replace("{max}", String(MAX_MB)));
      return;
    }
    setProgress(0);
    try {
      const id = resolveLinkId ? await resolveLinkId() : linkId;
      const res = await uploadVideoFile(id, file, { path, onProgress: setProgress });
      onUploaded?.(res);
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : T("uploadFailed"));
    } finally {
      setProgress(null);
    }
  }

  async function handleRemove() {
    if (!linkId) return;
    setRemoving(true);
    try {
      await deleteVideoFile(resolveLinkId ? await resolveLinkId() : linkId, path);
      onRemoved?.();
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : T("removeFailed"));
    } finally {
      setRemoving(false);
    }
  }

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
      active ? "bg-app-surface text-app-ink shadow-sm" : "text-app-muted hover:text-app-ink"
    }`;

  // SENGAJA tidak dibungkus FormField/<label>: <label> yg membungkus
  // beberapa kontrol mengaitkan dirinya ke kontrol PERTAMA (radio
  // "Tautan") -- klik di mana pun di area unggah (teks petunjuk, dst)
  // diam-diam mengganti sumber ke Tautan. Judul dirender sendiri di sini.
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wide text-app-muted">{T("sourceLabel")}</span>
      <div role="radiogroup" aria-label={T("sourceLabel")} className="inline-flex self-start rounded-lg bg-app-surface-2 p-1">
        <button type="button" role="radio" aria-checked={source === "url"} onClick={() => onSourceChange("url")} className={tabClass(source === "url")}>
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          {T("sourceUrl")}
        </button>
        <button type="button" role="radio" aria-checked={source === "upload"} onClick={() => onSourceChange("upload")} className={tabClass(source === "upload")}>
          <Upload className="h-3.5 w-3.5" aria-hidden />
          {T("sourceUpload")}
        </button>
      </div>

      {source === "url" ? (
        <input
          type="url"
          aria-label={T("label")}
          placeholder={T("placeholder")}
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          className={urlInputClassName}
        />
      ) : !linkId ? (
        <p className="rounded-lg border border-dashed border-app-border p-3 text-xs text-app-muted">{T("uploadAfterCreate")}</p>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-app-border p-3">
          {fileUrl && (
            // Pratinjau kecil file yg sudah terunggah (tanpa autoplay).
            <video src={fileUrl} className="aspect-video w-full rounded-md bg-black object-contain" controls muted playsInline preload="metadata" />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={progress !== null || removing}
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#111111] bg-jeon-lime px-3 py-1.5 text-xs font-bold text-[#111111] disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {progress !== null ? `${T("uploading")} ${progress}%` : fileUrl ? T("replaceVideo") : T("chooseVideo")}
            </button>
            {fileUrl && progress === null && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {T("removeVideo")}
              </button>
            )}
            <input ref={inputRef} type="file" accept={ACCEPT} onChange={handleFile} className="hidden" aria-label={T("chooseVideo")} />
          </div>
          {progress !== null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-surface-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-jeon-purple transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          )}
          <p className="text-[11px] text-app-muted">
            {fileName && progress === null ? `${fileName} · ` : ""}
            {T("uploadHint").replace("{max}", String(MAX_MB))}
          </p>
        </div>
      )}
    </div>
  );
}
