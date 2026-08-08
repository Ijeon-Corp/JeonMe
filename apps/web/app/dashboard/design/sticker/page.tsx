"use client";

import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import { STICKER_OPTIONS } from "@/lib/page-themes";
import { IconCheck } from "@/components/icons";

// DesignStickerPage -- Modul Desain (permintaan langsung pengguna, 8 Agustus
// 2026): galeri stiker dekoratif ala Linktree, ditempel di sudut avatar
// halaman publik (lihat StickerBadge di PagePreview.tsx). Pola halaman
// SAMA dengan theme/header/tombol/font (DesignPageShell + useDesignData).
export default function DesignStickerPage() {
  const { page, loading, error, links, products, handlePageSettingChange } = useDesignData();

  if (loading || !page) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <DesignPageShell
      page={page}
      links={links}
      products={products}
      backHref="/dashboard/design"
      title="Stiker"
      description="Tempel satu stiker dekoratif di pojok foto profilmu -- murni visual, opsional."
    >
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
          <button
            type="button"
            onClick={() => handlePageSettingChange({ sticker: "" })}
            className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border text-[11px] font-semibold ${
              !page.sticker ? "border-primary bg-primary-subtle text-primary" : "border-border text-muted"
            }`}
          >
            Tanpa stiker
            {!page.sticker && (
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white">
                <IconCheck className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
          {STICKER_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => handlePageSettingChange({ sticker: s.value })}
              title={s.label}
              className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border text-2xl ${
                page.sticker === s.value ? "border-primary bg-primary-subtle" : "border-border"
              }`}
            >
              {s.emoji}
              {page.sticker === s.value && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white">
                  <IconCheck className="h-2.5 w-2.5" />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
    </DesignPageShell>
  );
}
