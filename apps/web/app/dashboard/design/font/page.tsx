"use client";

import PageSkeleton from "@/components/Skeleton";
import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import { CUSTOM_FONT_OPTIONS } from "@/lib/page-themes";
import { MyPage } from "@/lib/api-client";
import Toggle from "@/components/Toggle";

export default function DesignFontPage() {
  const { page, setPage, links, products, loading, error, handleStyleOverride } = useDesignData();

  if (loading || !page) return <PageSkeleton />;

  return (
    <DesignPageShell
      page={page}
      links={links}
      products={products}
      backHref="/dashboard/design"
      title="Font"
      description="Font halaman, warna teks umum, dan font/warna judul terpisah (opsional)."
    >
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="glass mt-4 flex flex-col gap-4 rounded-2xl p-5 shadow-card">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Font Halaman</label>
          <select
            value={page.custom_font}
            onChange={(e) => handleStyleOverride({ custom_font: e.target.value as MyPage["custom_font"] })}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            {CUSTOM_FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Warna Teks Halaman</label>
          <input
            type="color"
            value={page.custom_page_text_color || "#FFFFFF"}
            onChange={(e) => setPage({ ...page, custom_page_text_color: e.target.value })}
            onBlur={(e) => handleStyleOverride({ custom_page_text_color: e.target.value })}
            className="h-9 w-full rounded-lg border border-border"
          />
          {page.custom_page_text_color && (
            <button
              type="button"
              onClick={() => handleStyleOverride({ custom_page_text_color: "" })}
              className="mt-1 text-[11px] font-semibold text-primary hover:underline"
            >
              Kembalikan ke warna bawaan tema
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-ink">Font Judul Terpisah</p>
            <p className="text-[11px] text-muted">Default sama dengan font halaman.</p>
          </div>
          <Toggle
            checked={!!page.custom_title_font}
            onChange={() => handleStyleOverride({ custom_title_font: page.custom_title_font ? "" : page.custom_font })}
            label="Font judul terpisah"
          />
        </div>

        {page.custom_title_font && (
          <select
            value={page.custom_title_font}
            onChange={(e) => handleStyleOverride({ custom_title_font: e.target.value as MyPage["custom_font"] })}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            {CUSTOM_FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Warna Judul</label>
          <input
            type="color"
            value={page.custom_title_color || "#FFFFFF"}
            onChange={(e) => setPage({ ...page, custom_title_color: e.target.value })}
            onBlur={(e) => handleStyleOverride({ custom_title_color: e.target.value })}
            className="h-9 w-full rounded-lg border border-border"
          />
          {page.custom_title_color && (
            <button
              type="button"
              onClick={() => handleStyleOverride({ custom_title_color: "" })}
              className="mt-1 text-[11px] font-semibold text-primary hover:underline"
            >
              Kembalikan ke warna bawaan tema
            </button>
          )}
        </div>
      </section>
    </DesignPageShell>
  );
}
