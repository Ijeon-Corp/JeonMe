"use client";

import { useState } from "react";

// Templates -- permintaan langsung pengguna, 23 Agustus 2026: "gunakan
// template yang sudah ada untuk ditampilkan terutama tampilkan template
// yang menggunakan bg gambar dan live wallpaper". SEBELUMNYA 6 kartu di
// sini murni dekoratif (gradien CSS acak, tidak berkaitan dengan template
// sungguhan mana pun) -- diganti kurasi 6 template ASLI dari
// lib/quick-setup-templates.ts (71 template) yang temanya termasuk
// WALLPAPER_THEME_NAMES (foto asli, lib/page-themes.ts) atau
// VIDEO_THEME_NAMES ("live wallpaper", video .mp4 sungguhan) -- bukan
// tema gradien/warna solid biasa, supaya section ini jadi pratinjau
// SUNGGUHAN dari apa yang kreator dapat, bukan mockup buatan tangan.
const templates = [
  {
    key: "gamer",
    title: "Gamer",
    tag: "Live Wallpaper" as const,
    kind: "video" as const,
    src: "/videos/neon.mp4",
    poster: "/videos/neon-poster.jpg",
  },
  {
    key: "dj",
    title: "DJ",
    tag: "Live Wallpaper" as const,
    kind: "video" as const,
    src: "/videos/citynight.mp4",
    poster: "/videos/citynight-poster.jpg",
  },
  {
    key: "musician",
    title: "Musisi",
    tag: "Live Wallpaper" as const,
    kind: "video" as const,
    src: "/videos/fireplace.mp4",
    poster: "/videos/fireplace-poster.jpg",
  },
  {
    key: "travel-agency",
    title: "Agen Wisata",
    tag: "Wallpaper" as const,
    kind: "image" as const,
    src: "/wallpapers/beach.jpg",
  },
  {
    key: "restaurant",
    title: "Restoran",
    tag: "Wallpaper" as const,
    kind: "image" as const,
    src: "/wallpapers/kilau.jpg",
  },
  {
    key: "photographer",
    title: "Fotografer",
    tag: "Wallpaper" as const,
    kind: "image" as const,
    src: "/wallpapers/stars.jpg",
  },
];

const filters = [
  { key: "all", label: "Semua" },
  { key: "Wallpaper", label: "Wallpaper" },
  { key: "Live Wallpaper", label: "Live Wallpaper" },
] as const;

export default function Templates() {
  const [active, setActive] = useState<(typeof filters)[number]["key"]>("all");
  const visible = templates.filter((t) => active === "all" || t.tag === active);

  return (
    <section id="templates" className="relative overflow-hidden bg-primary-subtle/40 py-20 md:py-28" aria-label="Template">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mx-auto mb-10 max-w-2xl text-center">
          <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
            Mulai dari
            <br />
            <span className="text-gradient">Template yang Indah</span>
          </h2>
          <p className="text-lg leading-relaxed text-muted">Pilih dari puluhan template siap pakai, sesuaikan dalam hitungan menit, dan publikasikan halamanmu sendiri.</p>
        </div>

        <div className="reveal mb-10 flex flex-wrap justify-center gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActive(f.key)}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active === f.key
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-muted hover:border-primary hover:text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => (
            <div
              key={t.key}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-white shadow-card"
            >
              <div className="relative w-full overflow-hidden bg-ink" style={{ aspectRatio: "4/3" }}>
                {t.kind === "video" ? (
                  <video
                    src={t.src}
                    poster={t.poster}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-ink/70 opacity-0 transition-opacity duration-250 group-hover:opacity-100">
                <span className="rounded-full bg-white px-4 py-2 text-xs font-bold text-ink">Lihat Template</span>
              </div>
              <div className="p-4">
                <h3 className="font-heading text-sm font-bold text-ink">{t.title}</h3>
                <p className="mt-0.5 text-xs text-muted">{t.tag}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
