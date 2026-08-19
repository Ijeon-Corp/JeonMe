"use client";

import { useState } from "react";

const categories = [
  { key: "all", label: "Semua" },
  { key: "minimal", label: "Minimal" },
  { key: "dark", label: "Gelap" },
  { key: "creator", label: "Kreator" },
  { key: "business", label: "Bisnis" },
  { key: "portfolio", label: "Portofolio" },
  { key: "education", label: "Edukasi" },
];

const templates = [
  { cat: "minimal", title: "Pure Minimal", label: "Minimal", bg: "from-slate-50 to-slate-100", accent: "bg-ink", dark: false },
  { cat: "dark", title: "Midnight Mode", label: "Gelap", bg: "from-slate-900 to-ink", accent: "", dark: true, gradient: "linear-gradient(135deg,#1F7A6C,#1B4D3E)" },
  { cat: "creator", title: "Creator Spotlight", label: "Kreator", bg: "from-teal-100 to-emerald-100", accent: "", dark: false, gradient: "linear-gradient(135deg,#1B4D3E,#1F7A6C)" },
  { cat: "business", title: "Corporate Edge", label: "Bisnis", bg: "from-teal-50 to-cyan-100", accent: "", dark: false, gradient: "linear-gradient(135deg,#1F7A6C,#1B4D3E)" },
  { cat: "portfolio", title: "Visual Folio", label: "Portofolio", bg: "from-amber-50 to-rose-50", accent: "", dark: false, gradient: "linear-gradient(135deg,#C9A24B,#1F7A6C)" },
  { cat: "education", title: "Learn Hub", label: "Edukasi", bg: "from-emerald-50 to-teal-100", accent: "", dark: false, gradient: "linear-gradient(135deg,#1B4D3E,#C9A24B)" },
];

export default function Templates() {
  const [active, setActive] = useState("all");
  const visible = templates.filter((t) => active === "all" || t.cat === active);

  return (
    <section id="templates" className="relative overflow-hidden bg-primary-subtle/40 py-20 md:py-28" aria-label="Template">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mx-auto mb-10 max-w-2xl text-center">
          <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
            Mulai dari
            <br />
            <span className="text-gradient">Template yang Indah</span>
          </h2>
          <p className="text-lg leading-relaxed text-muted">Pilih kategori, sesuaikan dalam hitungan menit, dan publikasikan halamanmu sendiri.</p>
        </div>

        <div className="reveal mb-10 flex flex-wrap justify-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActive(cat.key)}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active === cat.key
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-muted hover:border-primary hover:text-primary"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => (
            <div
              key={t.title}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-white shadow-card"
            >
              <div className={`bg-gradient-to-br p-6 ${t.bg}`} style={{ aspectRatio: "4/3" }}>
                <div
                  className="mx-auto mb-3 h-10 w-10 rounded-full"
                  style={{ background: t.gradient ?? "#1B4D3E" }}
                />
                <div className={`mx-auto mb-4 h-3 w-20 rounded ${t.dark ? "bg-white/20" : "bg-ink/20"}`} />
                <div className="mx-auto max-w-[180px] space-y-2">
                  <div className={`h-7 rounded-lg ${t.dark ? "bg-white/10" : "bg-white shadow-sm"}`} />
                  <div className={`h-7 rounded-lg ${t.dark ? "bg-white/10" : "bg-white shadow-sm"}`} />
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-ink/70 opacity-0 transition-opacity duration-250 group-hover:opacity-100">
                <span className="rounded-full bg-white px-4 py-2 text-xs font-bold text-ink">Lihat Template</span>
              </div>
              <div className="p-4">
                <h3 className="font-heading text-sm font-bold text-ink">{t.title}</h3>
                <p className="mt-0.5 text-xs text-muted">{t.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
