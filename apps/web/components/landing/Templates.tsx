"use client";

import { useState } from "react";
import PagePreview from "@/components/PagePreview";
import { QUICK_SETUP_TEMPLATES, buildQuickSetupPreviewData } from "@/lib/quick-setup-templates";

// Templates -- permintaan langsung pengguna, 23 Agustus 2026: "gunakan
// template yang sudah ada untuk ditampilkan terutama tampilkan template
// yang menggunakan bg gambar dan live wallpaper", lalu susulan "coba
// tampilkan sama persis seperti yang ada di quick template beserta isi
// blok nya tetapi dengan data dummy seperti john doe dan jane doe foto
// profil juga ambil online saja". Kurasi 6 template ASLI dari
// lib/quick-setup-templates.ts (71 template) yang temanya termasuk
// WALLPAPER_THEME_NAMES (foto asli) atau VIDEO_THEME_NAMES ("live
// wallpaper", lib/page-themes.ts) -- dirender pakai KOMPONEN PagePreview
// SUNGGUHAN (sama persis dipakai halaman publik & dashboard Quick Setup,
// lihat buildQuickSetupPreviewData) supaya bio/tautan/blok yang tampil di
// sini benar-benar isi template itu, bukan mockup buatan tangan. Nama &
// foto profil dummy (John Doe/Jane Doe, foto randomuser.me -- layanan
// publik foto wajah acak, bebas dipakai tanpa API key) karena template
// belum terpasang ke akun sungguhan mana pun.
const CURATED_KEYS = [
  { key: "gamer", tag: "Live Wallpaper" as const, displayName: "John Doe", avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg" },
  { key: "dj", tag: "Live Wallpaper" as const, displayName: "Jane Doe", avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg" },
  { key: "musician", tag: "Live Wallpaper" as const, displayName: "John Doe", avatarUrl: "https://randomuser.me/api/portraits/men/56.jpg" },
  { key: "travel-agency", tag: "Wallpaper" as const, displayName: "Jane Doe", avatarUrl: "https://randomuser.me/api/portraits/women/68.jpg" },
  { key: "restaurant", tag: "Wallpaper" as const, displayName: "John Doe", avatarUrl: "https://randomuser.me/api/portraits/men/12.jpg" },
  { key: "photographer", tag: "Wallpaper" as const, displayName: "Jane Doe", avatarUrl: "https://randomuser.me/api/portraits/women/26.jpg" },
];

const templates = CURATED_KEYS.map((c) => {
  const t = QUICK_SETUP_TEMPLATES.find((x) => x.key === c.key)!;
  return {
    key: c.key,
    label: t.label,
    tag: c.tag,
    data: buildQuickSetupPreviewData(t, c.key.replace(/-/g, ""), c.displayName, c.avatarUrl),
  };
});

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
              className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-card"
            >
              {/* Mockup PagePreview SUNGGUHAN, dizoom kecil -- pola SAMA
                  PERSIS dengan galeri /dashboard/quick-setup (lihat catatan
                  lengkap di buildQuickSetupPreviewData). pointer-events-none
                  -- mockup MURNI visual, kartu ini tidak punya link tujuan
                  (beda dari quick-setup yang buka modal saat diklik). */}
              <div className="relative h-80 w-full overflow-hidden bg-white pointer-events-none" aria-hidden="true">
                <div className="h-full [zoom:0.42]">
                  <PagePreview interactive={false} rootClassName="min-h-full" data={t.data} />
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-ink/70 opacity-0 transition-opacity duration-250 group-hover:opacity-100">
                <span className="rounded-full bg-white px-4 py-2 text-xs font-bold text-ink">Lihat Template</span>
              </div>
              <div className="p-4">
                <h3 className="font-heading text-sm font-bold text-ink">{t.label}</h3>
                <p className="mt-0.5 text-xs text-muted">{t.tag}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
