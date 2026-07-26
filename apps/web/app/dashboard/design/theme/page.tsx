"use client";

import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import { THEME_PRESETS } from "@/lib/api-client";
import { PAGE_THEMES } from "@/lib/page-themes";
import { IconCheck, IconPaintbrush } from "@/components/icons";

export default function DesignThemePage() {
  const { page, links, products, loading, error, handlePageSettingChange } = useDesignData();

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
        {/* Kartu galeri portrait ala Linktree: sampel huruf "Aa" di kiri atas
            + pil warna tombol di bawah, bukan sekadar swatch kotak kecil. */}
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          <button type="button" onClick={() => handlePageSettingChange({ theme: "custom" })} className="group flex flex-col items-center gap-1.5">
            <div
              className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-black/5 transition-transform group-hover:scale-[1.02] ${
                page.theme === "custom" ? "ring-2 ring-primary ring-offset-2" : ""
              }`}
            >
              <IconPaintbrush className="h-7 w-7 text-muted" />
              {page.theme === "custom" && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                  <IconCheck className="h-3 w-3" />
                </span>
              )}
            </div>
            <span className={`text-[11px] font-semibold ${page.theme === "custom" ? "text-primary" : "text-ink"}`}>Custom</span>
          </button>
          {THEME_PRESETS.map((theme) => {
            const meta = PAGE_THEMES[theme];
            const active = page.theme === theme;
            return (
              <button key={theme} type="button" onClick={() => handlePageSettingChange({ theme })} className="group flex flex-col items-center gap-1.5">
                <div
                  className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl ring-1 ring-black/5 transition-transform group-hover:scale-[1.02] ${
                    active ? "ring-2 ring-primary ring-offset-2" : ""
                  }`}
                  style={{ background: meta.previewBg }}
                >
                  <span
                    className={`absolute left-2.5 top-2 font-heading text-xl font-bold ${meta.previewIsDark ? "text-white" : "text-ink"}`}
                    aria-hidden
                  >
                    Aa
                  </span>
                  <span
                    className="absolute inset-x-2.5 bottom-2.5 h-6 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: meta.swatch }}
                    aria-hidden
                  />
                  {active && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                      <IconCheck className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <span className={`text-[11px] font-semibold ${active ? "text-primary" : "text-ink"}`}>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </DesignPageShell>
  );
}
