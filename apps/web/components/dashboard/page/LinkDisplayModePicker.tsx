"use client";

import { useLocale } from "@/lib/locale-context";

// LinkDisplayModePicker -- pemilih tampilan Classic/Featured utk blok Link,
// permintaan langsung pengguna 19 September 2026 (referensi screenshot
// Linktree: 2 kotak besar "Classic"/"Featured", bukan ikon kecil). Sebelum
// ini konsep yang SAMA PERSIS sudah ada (is_featured + thumbnail_url,
// dirender sebagai kartu 16:9 di halaman publik -- lihat PagePreview.tsx
// isFeatured/thumbnailUrl), cuma sebagai SATU ikon bintang kecil ("Unggulan")
// yang diselipkan di antara ikon Jadwal/Kunci di BlockToolsStrip -- tidak
// jelas/prominent seperti referensi. Komponen ini murni reskin tampilan dari
// boolean `is_featured` yang sama, dipakai bersama Simple Mode (halaman
// penuh baru) & Builder (RootToolsPanel) supaya konsisten di kedua editor.
export default function LinkDisplayModePicker({ active, onSelect }: { active: boolean; onSelect: (featured: boolean) => void }) {
  const { t } = useLocale();
  const L = (key: string) => t(`dashboard.pages.links.displayModePicker.${key}`);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">{L("sectionLabel")}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onSelect(false)}
          aria-pressed={!active}
          className={`flex flex-col items-center gap-2.5 rounded-xl border-2 p-3 transition-colors ${
            !active ? "border-jeon-ink bg-app-surface" : "border-app-border bg-app-surface hover:border-app-ink/30"
          }`}
        >
          <div className="flex h-14 w-full items-center justify-center rounded-lg bg-app-surface-2">
            <div className="flex w-20 items-center gap-1.5 rounded-full border border-app-border bg-app-surface px-2 py-1.5">
              <span className="h-3.5 w-3.5 flex-shrink-0 rounded bg-app-muted/50" aria-hidden />
              <span className="h-1.5 flex-1 rounded-full bg-app-muted/40" aria-hidden />
            </div>
          </div>
          <span className="text-xs font-bold text-app-ink">{L("classicLabel")}</span>
        </button>
        <button
          type="button"
          onClick={() => onSelect(true)}
          aria-pressed={active}
          className={`flex flex-col items-center gap-2.5 rounded-xl border-2 p-3 transition-colors ${
            active ? "border-jeon-ink bg-app-surface" : "border-app-border bg-app-surface hover:border-app-ink/30"
          }`}
        >
          <div className="flex h-14 w-full items-center justify-center rounded-lg bg-app-surface-2">
            <div className="aspect-video w-20 rounded-md border border-app-border bg-app-muted/25" aria-hidden />
          </div>
          <span className="text-xs font-bold text-app-ink">{L("featuredLabel")}</span>
        </button>
      </div>
    </div>
  );
}
