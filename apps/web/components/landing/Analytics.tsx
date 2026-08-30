"use client";

import { useLocale } from "@/lib/locale-context";

// Analytics -- rework konten Fase 2 lanjutan (permintaan langsung
// pengguna, 31 Agustus 2026: hapus image/icon lama, sesuaikan dengan
// tema): mockup analytics.png + 4 ikon ilustrasi 3D PNG DIHAPUS --
// diganti ikon garis SVG + kartu statistik FIKTIF yang dibangun langsung
// dari token redesign. Section tint pink KONSTAN -- semua teks/outline
// ink konstan #111 (lihat catatan warna konstan di ProductShowcase.tsx).
const points = [
  {
    key: "visitors" as const,
    icon: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
    chip: "bg-jeon-lavender",
  },
  {
    key: "clicks" as const,
    icon: <path d="m9 9 5 12 1.8-5.2L21 14 9 9zM7.2 2.2 8 5.1M5.1 8l-2.9-.8M14 4.1 12 6M6 12l-1.9 2" />,
    chip: "bg-jeon-lime",
  },
  {
    key: "conversion" as const,
    icon: <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />,
    chip: "bg-jeon-blue",
  },
  {
    key: "revenue" as const,
    icon: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
    chip: "bg-jeon-lavender",
  },
];

export default function Analytics() {
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden bg-jeon-pink py-20 md:py-28" aria-label="Analitik">
      <div className="mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Kartu analitik FIKTIF dari token redesign (menggantikan
              analytics.png). */}
          <div className="reveal order-2 lg:order-1">
            <div className="w-full max-w-md rounded-jxl border-2 border-[#111111] bg-white p-6 shadow-[10px_12px_0_rgba(17,17,17,0.92)]">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-bold uppercase tracking-wider text-[#111111]/60">{t("analytics.mock.title")}</p>
                <span className="rounded-full border-2 border-[#111111] bg-white px-2.5 py-0.5 text-[10px] font-bold text-[#111111]">{t("analytics.mock.range")}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-jmd border-2 border-[#111111] bg-jeon-lavender p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#111111]/60">{t("analytics.points.visitors.title")}</p>
                  <p className="font-display text-2xl font-extrabold text-[#111111]">8.214</p>
                </div>
                <div className="rounded-jmd border-2 border-[#111111] bg-jeon-lime p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#111111]/60">{t("analytics.points.clicks.title")}</p>
                  <p className="font-display text-2xl font-extrabold text-[#111111]">2.967</p>
                </div>
              </div>

              {/* Grafik tren murni div -- deretan batang tipis naik-turun. */}
              <div className="mt-5 flex h-20 items-end gap-1.5" aria-hidden="true">
                {[30, 45, 38, 60, 52, 66, 58, 74, 68, 88, 80, 95].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-jxs bg-jeon-purple" style={{ height: `${h}%`, opacity: 0.45 + (i / 12) * 0.55 }} />
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between rounded-jmd border-2 border-[#111111] bg-jeon-sidebar px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-jeon-lime">{t("analytics.points.revenue.title")}</span>
                <span className="font-display text-lg font-extrabold text-white">Rp1,8jt</span>
              </div>
            </div>
          </div>

          <div className="reveal order-1 lg:order-2" style={{ transitionDelay: "0.1s" }}>
            <h2 className="mb-5 font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-[#111111] sm:text-5xl md:text-6xl">
              {t("analytics.heading1")}
              <br />
              <span className="text-jeon-purple-dark">{t("analytics.headingGradient")}</span>
            </h2>
            <p className="mb-8 text-lg leading-relaxed text-[#111111]/70">{t("analytics.subtitle")}</p>
            <div className="space-y-4">
              {points.map((p) => (
                <div key={p.key} className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] ${p.chip}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {p.icon}
                    </svg>
                  </span>
                  <div>
                    <h3 className="mb-0.5 font-display text-sm font-bold text-[#111111]">{t(`analytics.points.${p.key}.title`)}</h3>
                    <p className="text-xs leading-relaxed text-[#111111]/70">{t(`analytics.points.${p.key}.desc`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
