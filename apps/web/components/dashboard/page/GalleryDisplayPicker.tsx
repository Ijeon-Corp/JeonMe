"use client";

import { useLocale } from "@/lib/locale-context";
import { GALLERY_DISPLAY_OPTIONS, type GalleryDisplay } from "@/lib/gallery-display";

// GalleryDisplayPicker -- pemilih tampilan blok galeri, dipakai bersama
// panel galeri Links (dashboard/links/page.tsx), Toko (ProdukPageEditor.tsx)
// & Builder (GalleryGridEditor di BuilderLeftPanel.tsx). Menggantikan
// segmented "Grid | Tumpukan" 2 tombol yang dulu diduplikasi di tiga
// tempat (18 September 2026, bersamaan penambahan 4 tampilan baru --
// lihat lib/gallery-display.ts). Komponen presentasional murni: nilai &
// cara menyimpannya (PATCH langsung vs draft Builder) dipegang pemanggil.
export default function GalleryDisplayPicker({ value, onChange }: { value: GalleryDisplay; onChange: (display: GalleryDisplay) => void }) {
  const { t } = useLocale();
  const active = GALLERY_DISPLAY_OPTIONS.find((option) => option.value === value) ?? GALLERY_DISPLAY_OPTIONS[0];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-app-muted">{t("dashboard.pages.links.galleryPanel.displayLabel")}</span>
      <div className="flex flex-wrap gap-1.5">
        {GALLERY_DISPLAY_OPTIONS.map(({ value: option, labelKey, Icon }) => {
          const isActive = option === value;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={isActive}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition-colors ${
                isActive ? "border-jeon-purple bg-jeon-lavender/40 text-jeon-purple" : "border-app-border bg-app-surface text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
              }`}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              {t(`dashboard.pages.links.galleryPanel.${labelKey}`)}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-app-muted">{t(`dashboard.pages.links.galleryPanel.${active.hintKey}`)}</p>
    </div>
  );
}
