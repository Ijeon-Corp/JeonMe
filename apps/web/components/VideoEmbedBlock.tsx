"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
// autoplayEmbedUrl -- versi URL embed yang langsung main TANPA SUARA.
// Browser (Chrome/Safari/Firefox) hanya mengizinkan autoplay tanpa gestur
// kalau video di-mute, jadi mute=1 wajib -- pengunjung menyalakan suara
// dari kontrol player. YouTube: loop butuh playlist=<id yg sama>. TikTok:
// embed/v2 tidak mengenal parameter autoplay, player/v1 (Embed Player
// resmi) yang mendukung autoplay & loop.
function autoplayEmbedUrl(embedUrl: string): string {
  const yt = embedUrl.match(/youtube\.com\/embed\/([^/?]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${yt[1]}`;
  const tt = embedUrl.match(/tiktok\.com\/embed\/v2\/(\d+)/);
  if (tt) return `https://www.tiktok.com/player/v1/${tt[1]}?autoplay=1&loop=1&muted=1`;
  return embedUrl;
}

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
  autoplay = false,
  fileUrl,
}: {
  title: string;
  videoUrl: string;
  // fileUrl -- video unggahan sendiri (block_data.source "upload"); kalau
  // terisi, dirender <video> bawaan browser, bukan iframe embed.
  fileUrl?: string;
  // autoplay -- permintaan langsung pengguna, 25 September 2026 ("buat blok
  // untuk video itu auto play"): block_data.autoplay, BAWAAN aktif (hanya
  // `false` eksplisit yang mematikan, lihat PagePreview.tsx). Iframe baru
  // dimuat saat blok >= 50% terlihat di layar -- manfaat performa pola
  // klik-utk-buka di atas tetap terjaga utk video di bawah lipatan -- dan
  // dilewati kalau pengunjung memilih prefers-reduced-motion.
  autoplay?: boolean;
  cardClassName: string;
  titleClassName: string;
  // icon -- permintaan langsung pengguna, 14 Agustus 2026: ikon kustom/galeri
  // yang dipilih dari dashboard (lihat resolveBlockIcon di PagePreview.tsx).
  icon?: React.ReactNode;
}) {
  const embedUrl = fileUrl ? null : toEmbedUrl(videoUrl);
  const [playing, setPlaying] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoplay || !embedUrl) return;
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setAutoStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoplay, embedUrl]);
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
      {fileUrl ? (
        // Video unggahan: autoplay HARUS muted + playsInline (syarat iOS
        // Safari & Chrome), loop spt klip pendek. Tanpa autoplay: kontrol
        // biasa, preload metadata saja (hemat kuota pengunjung).
        <video
          src={fileUrl}
          className="aspect-video w-full rounded-xl bg-black object-contain"
          controls
          playsInline
          muted={autoplay}
          autoPlay={autoplay}
          loop={autoplay}
          preload={autoplay ? "auto" : "metadata"}
        />
      ) : embedUrl ? (
        <div ref={boxRef} className="aspect-video w-full overflow-hidden rounded-xl">
          {autoStarted && !playing ? (
            <iframe
              src={autoplayEmbedUrl(embedUrl)}
              title={title || "Video"}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : playing ? (
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
        // Netral, bukan gaya-error -- lihat catatan lengkap di AudioPlayerBlock.tsx.
        <p className={`text-xs opacity-50 ${titleClassName}`}>Video tidak dapat ditampilkan.</p>
      )}
    </div>
  );
}
