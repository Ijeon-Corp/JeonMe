"use client";

import { useState } from "react";
import { THEME_PRESETS } from "@/lib/api-client";
import { DOODLE_THEME_NAMES, PAGE_THEMES, THREE_D_THEME_NAMES, VIDEO_THEME_NAMES, WALLPAPER_THEME_NAMES } from "@/lib/page-themes";
import { IconCheck, IconLock, IconPaintbrush } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

// ThemeGallery -- diekstrak dari app/dashboard/design/theme/page.tsx, 27
// Agustus 2026 (redesain Quick Setup ala alur "Microsite" s.id: tab
// "Theme" di step 2 wizard baru butuh galeri tema yang SAMA PERSIS dengan
// menu Desain > Tema, bukan salinan kedua yang bisa tidak sinkron). Ini
// SATU-SATUNYA implementasi galeri tema sekarang -- dashboard/design/
// theme/page.tsx dirender lewat komponen ini juga, bukan duplikat lokal.
//
// customTile -- opsional, HANYA diisi pemanggil yang butuh gerbang Premium
// utk latar Custom (saat ini cuma /dashboard/design/theme). Quick Setup
// TIDAK mengisi field ini -- wizard baru sengaja tidak upsell Premium di
// tengah alur pembuatan halaman pertama.
export interface ThemeGalleryCustomTile {
  isPremium: boolean;
  onSelect: () => void;
  onLocked: () => void;
}

export interface ThemeGalleryProps {
  value: string;
  onChange: (theme: string) => void;
  customTile?: ThemeGalleryCustomTile;
}

const GRADIENT_PRESETS = THEME_PRESETS.filter(
  (t) =>
    !WALLPAPER_THEME_NAMES.includes(t) &&
    !THREE_D_THEME_NAMES.includes(t) &&
    !VIDEO_THEME_NAMES.includes(t) &&
    !DOODLE_THEME_NAMES.includes(t)
);
const WALLPAPER_PRESETS = THEME_PRESETS.filter((t) => WALLPAPER_THEME_NAMES.includes(t));
const THREE_D_PRESETS = THEME_PRESETS.filter((t) => THREE_D_THEME_NAMES.includes(t));
const VIDEO_PRESETS = THEME_PRESETS.filter((t) => VIDEO_THEME_NAMES.includes(t));
const DOODLE_PRESETS = THEME_PRESETS.filter((t) => DOODLE_THEME_NAMES.includes(t));

function ThemeTile({
  active,
  onClick,
  children,
  label,
  locked,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  // locked -- Modul Langganan Premium: latar kustom khusus kreator Premium.
  // Diblokir DI SISI KLIEN supaya kreator gratis langsung diarahkan ke
  // halaman langganan, TAPI backend (UpdateMyPage) tetap menolak permintaan
  // langsung ke API juga -- gerbang ini murni untuk UX, bukan satu-satunya
  // penjagaan (lihat isPremiumUser di page.go).
  locked?: boolean;
}) {
  const { t } = useLocale();
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1.5">
      <div
        className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl ring-1 ring-black/5 transition-transform group-hover:scale-[1.02] ${
          active ? "ring-2 ring-jeon-purple ring-offset-2" : ""
        }`}
      >
        {children}
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <IconLock className="h-5 w-5 text-white" />
          </div>
        )}
        {active && !locked && (
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-jeon-purple text-white">
            <IconCheck className="h-3 w-3" />
          </span>
        )}
      </div>
      <span className={`text-[11px] font-semibold ${active ? "text-jeon-purple" : "text-app-ink"}`}>
        {label}
        {locked && t("dashboard.components.themeGallery.premiumSuffix")}
      </span>
    </button>
  );
}

export default function ThemeGallery({ value, onChange, customTile }: ThemeGalleryProps) {
  const { t } = useLocale();
  const [tab, setTab] = useState<"gradien" | "wallpaper" | "3d" | "video" | "doodle">("gradien");

  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto border-b border-app-border">
        <button
          type="button"
          onClick={() => setTab("gradien")}
          className={`flex-shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === "gradien" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
          }`}
        >
          {t("dashboard.components.themeGallery.tabGradient")}
        </button>
        <button
          type="button"
          onClick={() => setTab("wallpaper")}
          className={`flex-shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === "wallpaper" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
          }`}
        >
          {t("dashboard.components.themeGallery.tabWallpaper")}
        </button>
        <button
          type="button"
          onClick={() => setTab("3d")}
          className={`flex-shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === "3d" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
          }`}
        >
          {t("dashboard.components.themeGallery.tab3d")}
        </button>
        <button
          type="button"
          onClick={() => setTab("video")}
          className={`flex-shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === "video" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
          }`}
        >
          {t("dashboard.components.themeGallery.tabVideo")}
        </button>
        <button
          type="button"
          onClick={() => setTab("doodle")}
          className={`flex-shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === "doodle" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
          }`}
        >
          {t("dashboard.components.themeGallery.tabDoodle")}
        </button>
      </div>

      {/* Kartu galeri portrait ala Linktree: sampel huruf "Aa" di kiri atas
          + pil warna tombol di bawah, bukan sekadar swatch kotak kecil. */}
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {tab === "gradien" && customTile && (
          <ThemeTile
            active={value === "custom"}
            locked={!customTile.isPremium}
            onClick={() => (customTile.isPremium ? customTile.onSelect() : customTile.onLocked())}
            label={t("dashboard.components.themeGallery.customTileLabel")}
          >
            <div className="flex h-full w-full items-center justify-center bg-gray-100">
              <IconPaintbrush className="h-7 w-7 text-app-muted" />
            </div>
          </ThemeTile>
        )}
        {(tab === "gradien"
          ? GRADIENT_PRESETS
          : tab === "wallpaper"
          ? WALLPAPER_PRESETS
          : tab === "3d"
          ? THREE_D_PRESETS
          : tab === "video"
          ? VIDEO_PRESETS
          : DOODLE_PRESETS
        ).map((theme) => {
          const meta = PAGE_THEMES[theme];
          // "Live Wallpaper" -- 3 preset flow/pulse/drift pakai kelas CSS
          // animasi (bukan style inline biasa) di properti `page` -- pakai
          // kelas yang SAMA di kartu galeri ini supaya kreator lihat
          // pratinjau BERGERAK sungguhan sebelum memilih, bukan cuma
          // cuplikan diam dari previewBg.
          const isLiveWallpaper = meta.page.includes("theme-live-");
          // Preset "Video" -- sama alasannya seperti live wallpaper di
          // atas: tampilkan <video> BERPUTAR sungguhan di kartu galeri,
          // bukan cuma poster diam, supaya kreator benar-benar lihat hasil
          // sebelum memilih.
          const isVideoTheme = !!meta.videoSrc;
          return (
            <ThemeTile key={theme} active={value === theme} onClick={() => onChange(theme)} label={meta.label}>
              {isVideoTheme ? (
                <video
                  className="absolute inset-0 h-full w-full object-cover"
                  src={meta.videoSrc}
                  poster={meta.posterSrc}
                  autoPlay
                  loop
                  muted
                  playsInline
                  aria-hidden
                />
              ) : (
                <div
                  className={`absolute inset-0 ${isLiveWallpaper ? meta.page : ""}`}
                  style={isLiveWallpaper ? undefined : { background: meta.previewBg }}
                  aria-hidden
                />
              )}
              <span
                className={`absolute left-2.5 top-2 font-heading text-xl font-bold ${meta.previewIsDark ? "text-white" : "text-app-ink"}`}
                aria-hidden
              >
                Aa
              </span>
              <span className={`absolute inset-x-2.5 bottom-2.5 h-6 rounded-full ring-1 ring-black/10 ${meta.buyButton}`} aria-hidden />
            </ThemeTile>
          );
        })}
      </div>
    </div>
  );
}
