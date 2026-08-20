import { IconDownload, IconFileText } from "@/components/icons";

// formatFileSize -- "2.4 MB" dari bytes (1 desimal), fallback ke KB bulat
// utk file < 1MB supaya file kecil (mis. cheat sheet 1 halaman) tidak
// tampil "0.0 MB" yang terkesan salah/kosong.
function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Blok "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
// file pdf download". Beda dari produk digital berbayar (Toko) -- ini
// gratis, tanpa checkout, cocok utk lead magnet/ebook/materi unduhan (ref:
// blok "File" Linktree/Beacons). Kartu unduh sederhana: ikon dokumen + nama
// file + ukuran + ikon unduh, seluruh kartu jadi tautan -- TANPA
// pemutar/preview (beda dari AudioPlayerBlock) karena PDF/ZIP/EPUB tidak
// punya cara preview inline yang ringan & konsisten lintas tema. Server
// component murni (tidak butuh "use client" -- tidak ada state/interaksi
// selain navigasi tautan biasa).
export default function FileDownloadBlock({
  title,
  fileUrl,
  fileName,
  fileSizeBytes,
  iconUrl,
  cardClassName,
  titleClassName,
}: {
  title: string;
  fileUrl: string;
  fileName?: string;
  fileSizeBytes?: number;
  // iconUrl -- custom_icon_url (baris kontrol ikon generik, sama seperti
  // coverUrl di AudioPlayerBlock) -- opsional, fallback ke IconFileText
  // kalau kreator belum mengunggah ikon kustom untuk blok ini.
  iconUrl?: string;
  cardClassName: string;
  titleClassName: string;
}) {
  if (!fileUrl) {
    return (
      <div className={cardClassName}>
        <p className="text-xs text-red-500">File belum diunggah.</p>
      </div>
    );
  }

  const sizeLabel = fileSizeBytes ? formatFileSize(fileSizeBytes) : "";
  const detailLabel = [fileName, sizeLabel].filter(Boolean).join(" · ");

  return (
    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 ${cardClassName}`}>
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" className="h-11 w-11 flex-shrink-0 rounded-lg object-cover" />
      ) : (
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-current/10 ${titleClassName}`}>
          <IconFileText className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${titleClassName}`}>{title || "Unduh File"}</p>
        {detailLabel && <p className={`mt-0.5 truncate text-[11px] opacity-70 ${titleClassName}`}>{detailLabel}</p>}
      </div>
      <IconDownload className={`h-5 w-5 flex-shrink-0 ${titleClassName}`} />
    </a>
  );
}
