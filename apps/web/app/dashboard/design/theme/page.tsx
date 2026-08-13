"use client";

import PageSkeleton from "@/components/Skeleton";
import { useState } from "react";
import { useRouter } from "next/navigation";
import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import { THEME_PRESETS } from "@/lib/api-client";
import { PAGE_THEMES, THREE_D_THEME_NAMES, VIDEO_THEME_NAMES, WALLPAPER_THEME_NAMES } from "@/lib/page-themes";
import { IconCheck, IconLock, IconPaintbrush } from "@/components/icons";

// Permintaan langsung pengguna: galeri tema dipisah 2 tab -- "Warna &
// Gradien" (preset solid/gradien + tile "Custom") dan "Wallpaper" (preset
// foto asli, lihat WALLPAPER_THEME_NAMES di page-themes.ts, satu-satunya
// sumber kebenaran pengelompokan supaya tidak dobel daftar di sini).
// Tab ketiga "3D" (permintaan susulan, tab baru persis di sebelah
// "Wallpaper") -- lihat THREE_D_THEME_NAMES untuk catatan lingkup lengkap.
// Tab keempat "Video" (permintaan langsung pengguna, 13 Agustus 2026:
// "background yang bergerak seperti menggunakan mov atau gif") -- TERPISAH
// dari "3D/Live" karena ini <video> sungguhan (file .mp4, ukuran jauh
// lebih besar dari animasi CSS flow/pulse/drift), lihat VIDEO_THEME_NAMES.
const GRADIENT_PRESETS = THEME_PRESETS.filter(
  (t) => !WALLPAPER_THEME_NAMES.includes(t) && !THREE_D_THEME_NAMES.includes(t) && !VIDEO_THEME_NAMES.includes(t)
);
const WALLPAPER_PRESETS = THEME_PRESETS.filter((t) => WALLPAPER_THEME_NAMES.includes(t));
const THREE_D_PRESETS = THEME_PRESETS.filter((t) => THREE_D_THEME_NAMES.includes(t));
const VIDEO_PRESETS = THEME_PRESETS.filter((t) => VIDEO_THEME_NAMES.includes(t));

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
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1.5">
      <div
        className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl ring-1 ring-black/5 transition-transform group-hover:scale-[1.02] ${
          active ? "ring-2 ring-primary ring-offset-2" : ""
        }`}
      >
        {children}
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <IconLock className="h-5 w-5 text-white" />
          </div>
        )}
        {active && !locked && (
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
            <IconCheck className="h-3 w-3" />
          </span>
        )}
      </div>
      <span className={`text-[11px] font-semibold ${active ? "text-primary" : "text-ink"}`}>
        {label}
        {locked && " (Premium)"}
      </span>
    </button>
  );
}

export default function DesignThemePage() {
  const { page, links, products, loading, error, handlePageSettingChange } = useDesignData();
  const [tab, setTab] = useState<"gradien" | "wallpaper" | "3d" | "video">("gradien");
  const router = useRouter();

  if (loading || !page) return <PageSkeleton />;

  return (
    <DesignPageShell
      page={page}
      links={links}
      products={products}
      backHref="/dashboard/design"
      title="Tema"
      description="Pilih salah satu template siap pakai, atau lanjut sesuaikan sendiri lewat Tombol & Font (otomatis jadi Custom)."
    >
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="glass mt-4 rounded-3xl p-5 shadow-card">
        <div className="mb-4 flex gap-2 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("gradien")}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "gradien" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Warna & Gradien
          </button>
          <button
            type="button"
            onClick={() => setTab("wallpaper")}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "wallpaper" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Wallpaper
          </button>
          <button
            type="button"
            onClick={() => setTab("3d")}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "3d" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            3D/Live
          </button>
          <button
            type="button"
            onClick={() => setTab("video")}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "video" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Video
          </button>
        </div>

        {/* Kartu galeri portrait ala Linktree: sampel huruf "Aa" di kiri atas
            + pil warna tombol di bawah, bukan sekadar swatch kotak kecil. */}
        {/* Bug dilaporkan pengguna (27 Juli 2026): "jika pilih tema warna
            button text button dan juga semua warna font dan tipe font juga
            ikut disesuaikan berdasarkan tema yang dipilih jadi bukan
            background nya saja yang berubah" -- akar masalah: custom_style_
            override (diaktifkan begitu kreator pernah menyentuh panel Tombol/
            Font) TIDAK pernah direset saat memilih tema baru, jadi warna
            tombol/font KUSTOM lama tetap "menang" menimpa warna bawaan tema
            yang baru dipilih (button/nama/bio-nya sendiri sebenarnya SUDAH
            berbeda per tema di PAGE_THEMES, tapi tertutup override lama).
            Memilih tema dari galeri ini sekarang SELALU mereset override ke
            false supaya kombinasi warna & font bawaan tema yang baru dipilih
            langsung berlaku penuh -- kreator yang mau menyesuaikan lagi
            secara manual tetap bisa lewat panel Tombol/Font seperti biasa. */}
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {tab === "gradien" && (
            <ThemeTile
              active={page.theme === "custom"}
              locked={!page.is_premium}
              onClick={() =>
                page.is_premium
                  ? handlePageSettingChange({ theme: "custom", custom_style_override: false })
                  : router.push("/dashboard/settings/subscription")
              }
              label="Custom"
            >
              <div className="flex h-full w-full items-center justify-center bg-gray-100">
                <IconPaintbrush className="h-7 w-7 text-muted" />
              </div>
            </ThemeTile>
          )}
          {(tab === "gradien"
            ? GRADIENT_PRESETS
            : tab === "wallpaper"
            ? WALLPAPER_PRESETS
            : tab === "3d"
            ? THREE_D_PRESETS
            : VIDEO_PRESETS
          ).map((theme) => {
            const meta = PAGE_THEMES[theme];
            // "Live Wallpaper" (permintaan susulan): 3 preset flow/pulse/drift
            // pakai kelas CSS animasi (bukan style inline biasa) di properti
            // `page` -- pakai kelas yang SAMA di kartu galeri ini supaya
            // kreator lihat pratinjau BERGERAK sungguhan sebelum memilih,
            // bukan cuma cuplikan diam dari previewBg.
            const isLiveWallpaper = meta.page.includes("theme-live-");
            // Preset "Video" (permintaan langsung pengguna, 13 Agustus
            // 2026): sama alasannya seperti live wallpaper di atas --
            // tampilkan <video> BERPUTAR sungguhan di kartu galeri, bukan
            // cuma poster diam, supaya kreator benar-benar lihat hasil
            // sebelum memilih.
            const isVideoTheme = !!meta.videoSrc;
            return (
              <ThemeTile
                key={theme}
                active={page.theme === theme}
                onClick={() => handlePageSettingChange({ theme, custom_style_override: false })}
                label={meta.label}
              >
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
                  className={`absolute left-2.5 top-2 font-heading text-xl font-bold ${meta.previewIsDark ? "text-white" : "text-ink"}`}
                  aria-hidden
                >
                  Aa
                </span>
                <span
                  className={`absolute inset-x-2.5 bottom-2.5 h-6 rounded-full ring-1 ring-black/10 ${meta.buyButton}`}
                  aria-hidden
                />
              </ThemeTile>
            );
          })}
        </div>
      </section>
    </DesignPageShell>
  );
}
