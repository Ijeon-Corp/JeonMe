"use client";

import { useState } from "react";
import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import { THEME_PRESETS } from "@/lib/api-client";
import { PAGE_THEMES, WALLPAPER_THEME_NAMES } from "@/lib/page-themes";
import { IconCheck, IconPaintbrush } from "@/components/icons";

// Permintaan langsung pengguna: galeri tema dipisah 2 tab -- "Warna &
// Gradien" (preset solid/gradien + tile "Custom") dan "Wallpaper" (preset
// foto asli, lihat WALLPAPER_THEME_NAMES di page-themes.ts, satu-satunya
// sumber kebenaran pengelompokan supaya tidak dobel daftar di sini).
const GRADIENT_PRESETS = THEME_PRESETS.filter((t) => !WALLPAPER_THEME_NAMES.includes(t));
const WALLPAPER_PRESETS = THEME_PRESETS.filter((t) => WALLPAPER_THEME_NAMES.includes(t));

function ThemeTile({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1.5">
      <div
        className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl ring-1 ring-black/5 transition-transform group-hover:scale-[1.02] ${
          active ? "ring-2 ring-primary ring-offset-2" : ""
        }`}
      >
        {children}
        {active && (
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
            <IconCheck className="h-3 w-3" />
          </span>
        )}
      </div>
      <span className={`text-[11px] font-semibold ${active ? "text-primary" : "text-ink"}`}>{label}</span>
    </button>
  );
}

export default function DesignThemePage() {
  const { page, links, products, loading, error, handlePageSettingChange } = useDesignData();
  const [tab, setTab] = useState<"gradien" | "wallpaper">("gradien");

  if (loading || !page) return <p className="text-sm text-muted">Memuat...</p>;

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

      <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
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
              onClick={() => handlePageSettingChange({ theme: "custom", custom_style_override: false })}
              label="Custom"
            >
              <div className="flex h-full w-full items-center justify-center bg-gray-100">
                <IconPaintbrush className="h-7 w-7 text-muted" />
              </div>
            </ThemeTile>
          )}
          {(tab === "gradien" ? GRADIENT_PRESETS : WALLPAPER_PRESETS).map((theme) => {
            const meta = PAGE_THEMES[theme];
            return (
              <ThemeTile
                key={theme}
                active={page.theme === theme}
                onClick={() => handlePageSettingChange({ theme, custom_style_override: false })}
                label={meta.label}
              >
                <div className="absolute inset-0" style={{ background: meta.previewBg }} aria-hidden />
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
