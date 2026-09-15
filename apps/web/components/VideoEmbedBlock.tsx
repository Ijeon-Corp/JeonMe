"use client";

import Image from "next/image";
import { useState } from "react";
import { IconPlayCircle } from "@/components/icons";

// No.77 (Sprint 9): blok video embed (YouTube/TikTok).
//
// Pola thumbnail-klik-buka -- susulan 14 September 2026 (audit benchmark
// Linktree: "video opens out from the link and plays natively", pola
// thumbnail dulu baru expand & main -- BEDA dari Jeon.id sebelumnya yang
// SELALU merender iframe aktif penuh langsung). Jadi Client Component
// (dulu Server Component murni) HANYA utk state klik-utk-main -- kalau
// halaman publik kreator punya banyak blok video sekaligus, sebelumnya
// SEMUA iframe termuat &amp; aktif bersamaan sejak page load (boros bandwidth
// &amp; performa nyata, bukan cuma kosmetik); sekarang cuma iframe yang
// benar-benar diklik yang dimuat.
function toEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    if (id) return `https://www.youtube.com/embed/${id}`;
    const shorts = u.pathname.match(/\/shorts\/([^/]+)/);
    if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
    return null;
  }
  if (host === "tiktok.com") {
    const match = u.pathname.match(/\/video\/(\d+)/);
    return match ? `https://www.tiktok.com/embed/v2/${match[1]}` : null;
  }
  return null;
}

// getYoutubeThumbnail -- URL thumbnail YouTube TERPREDIKSI dari ID video
// saja (tanpa panggilan API terpisah, format publik resmi img.youtube.com)
// -- BEDA dari TikTok yang tidak punya pola URL thumbnail statis serupa
// tanpa panggilan oEmbed tambahan (di luar cakupan perbaikan ini, lihat
// catatan lengkap riset benchmark: "TikTok tidak sesederhana itu tanpa
// oEmbed call tambahan"). TikTok tetap dapat manfaat performa dari pola
// klik-utk-buka ini, cuma tanpa gambar pratinjau sungguhan (placeholder
// ikon generik).
function getYoutubeThumbnail(embedUrl: string): string | null {
  const match = embedUrl.match(/\/embed\/([^/?]+)/);
  if (!match) return null;
  return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
}

export default function VideoEmbedBlock({
  title,
  videoUrl,
  cardClassName,
  titleClassName,
  icon,
}: {
  title: string;
  videoUrl: string;
  cardClassName: string;
  titleClassName: string;
  // icon -- permintaan langsung pengguna, 14 Agustus 2026: ikon kustom/galeri
  // yang dipilih dari dashboard (lihat resolveBlockIcon di PagePreview.tsx).
  icon?: React.ReactNode;
}) {
  const embedUrl = toEmbedUrl(videoUrl);
  const [playing, setPlaying] = useState(false);
  const isYoutube = embedUrl?.includes("youtube.com/embed/") ?? false;
  const thumbnail = embedUrl && isYoutube ? getYoutubeThumbnail(embedUrl) : null;

  return (
    <div className={cardClassName}>
      {title && (
        <p className={`mb-2 flex items-center gap-1.5 truncate text-sm font-semibold ${titleClassName}`}>
          {icon}
          <span className="truncate">{title}</span>
        </p>
      )}
      {embedUrl ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl">
          {playing ? (
            <iframe
              src={`${embedUrl}${embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
              title={title || "Video"}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={`Putar video${title ? `: ${title}` : ""}`}
              className="group relative flex h-full w-full items-center justify-center bg-black"
            >
              {thumbnail ? (
                // `fill` -- tombol pembungkusnya `h-full w-full` di dalam
                // kotak ber-aspect-video, jadi tidak ada angka lebar literal.
                // Butuh `relative`, sudah ada di class tombolnya ("group
                // relative flex h-full w-full ..."). thumbnail SELALU
                // img.youtube.com (getYoutubeThumbnail di atas) -- host itu
                // sudah didaftarkan di images.remotePatterns, lihat catatannya
                // di next.config.js.
                <Image src={thumbnail} alt="" fill sizes="(max-width: 448px) 100vw, 448px" className="object-cover opacity-90 transition-opacity group-hover:opacity-100" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-app-surface-2 to-black/40" />
              )}
              <span className="absolute flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-110">
                <IconPlayCircle className="h-8 w-8" />
              </span>
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-red-500">Video tidak dapat ditampilkan.</p>
      )}
    </div>
  );
}
