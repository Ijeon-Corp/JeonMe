"use client";

import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import { CUSTOM_BUTTON_ROUNDED_OPTIONS, CUSTOM_BUTTON_SHADOW_OPTIONS, CUSTOM_BUTTON_STYLE_OPTIONS } from "@/lib/page-themes";

export default function DesignTombolPage() {
  const { page, setPage, links, products, loading, error, handleStyleOverride } = useDesignData();

  if (loading || !page) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <DesignPageShell
      page={page}
      links={links}
      products={products}
      backHref="/dashboard/design"
      title="Tombol"
      description="Warna, gaya, kelengkungan sudut, dan bayangan tombol -- berlaku untuk blok tautan & tombol Beli/Dukung di halaman publikmu."
    >
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="mt-4 flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-card">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Warna Tombol</label>
          <input
            type="color"
            value={page.custom_button_color}
            onChange={(e) => setPage({ ...page, custom_button_color: e.target.value })}
            onBlur={(e) => handleStyleOverride({ custom_button_color: e.target.value })}
            className="h-9 w-full rounded-lg border border-border"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Warna Teks Tombol</label>
          <input
            type="color"
            value={page.custom_button_text_color || "#FFFFFF"}
            onChange={(e) => setPage({ ...page, custom_button_text_color: e.target.value })}
            onBlur={(e) => handleStyleOverride({ custom_button_text_color: e.target.value })}
            className="h-9 w-full rounded-lg border border-border"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Gaya Tombol</label>
          <div className="flex gap-2">
            {CUSTOM_BUTTON_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleStyleOverride({ custom_button_style: opt.value })}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
                  page.custom_button_style === opt.value ? "border-primary bg-white text-primary" : "border-border text-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Kelengkungan Sudut</label>
          <div className="flex gap-2">
            {CUSTOM_BUTTON_ROUNDED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleStyleOverride({ custom_button_rounded: opt.value })}
                title={opt.label}
                className={`flex h-9 flex-1 items-center justify-center border py-1.5 ${opt.className} ${
                  page.custom_button_rounded === opt.value ? "border-primary bg-white" : "border-border"
                }`}
              >
                <span className={`block h-3 w-6 border-2 border-ink/60 ${opt.className}`} aria-hidden />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Bayangan Tombol</label>
          <div className="flex gap-2">
            {CUSTOM_BUTTON_SHADOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleStyleOverride({ custom_button_shadow: opt.value })}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
                  page.custom_button_shadow === opt.value ? "border-primary bg-white text-primary" : "border-border text-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </DesignPageShell>
  );
}
