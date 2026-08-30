"use client";

import { useLocale } from "@/lib/locale-context";

// Monetization -- rework konten Fase 2 lanjutan (permintaan langsung
// pengguna, 31 Agustus 2026: "isinya di sesuaikan dengan tema dulu saja
// tidak usah pakai image dan icon yang sudah ada dari lama"): ikon
// ilustrasi 3D PNG + mockup monetization.png identitas lama DIHAPUS --
// diganti ikon garis SVG seragam + mini-dashboard pendapatan yang
// dibangun langsung dari token redesign (angka & produk FIKTIF, pola
// sama seperti flip card Hero.tsx). Section tint lime KONSTAN -- semua
// teks/outline di atasnya ink konstan #111 (lihat catatan warna konstan
// di ProductShowcase.tsx).
const items = [
  {
    key: "sellDigitalProducts" as const,
    icon: <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zM3 6h18M16 10a4 4 0 0 1-8 0" />,
  },
  {
    key: "membership" as const,
    icon: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  },
  {
    key: "affiliator" as const,
    icon: <path d="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />,
  },
  {
    key: "hosting" as const,
    icon: (
      <>
        <rect x="3" y="4" width="18" height="6" rx="1.5" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" />
        <path d="M7 7h.01M7 17h.01M11 7h7M11 17h7" />
      </>
    ),
  },
];

// Baris penjualan fiktif di mini-dashboard -- kunci i18n monetization.mock.*.
const MOCK_SALES = [
  { key: "product1" as const, amount: "Rp149rb", chip: "bg-jeon-lavender" },
  { key: "product2" as const, amount: "Rp299rb", chip: "bg-jeon-pink" },
  { key: "product3" as const, amount: "Rp79rb", chip: "bg-jeon-blue" },
];

export default function Monetization() {
  const { t } = useLocale();

  return (
    <section id="monetization" className="relative overflow-hidden bg-jeon-lime py-20 md:py-28" aria-label="Monetisasi">
      <div className="relative mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="reveal">
            <h2 className="mb-5 font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-[#111111] sm:text-5xl md:text-6xl">
              {t("monetization.heading1")}
              <br />
              <span className="text-jeon-purple-dark">{t("monetization.headingGradient")}</span>
            </h2>
            <p className="mb-8 text-lg leading-relaxed text-[#111111]/70">{t("monetization.subtitle")}</p>

            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-2.5 rounded-jmd border-2 border-[#111111] bg-white p-3.5 transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-lavender">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {item.icon}
                    </svg>
                  </span>
                  <p className="text-xs font-bold leading-snug text-[#111111]">{t(`monetization.items.${item.key}`)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Mini-dashboard pendapatan FIKTIF, dibangun dari token redesign
              (menggantikan monetization.png). */}
          <div className="reveal flex justify-center lg:justify-end" style={{ transitionDelay: "0.15s" }}>
            <div className="w-full max-w-md rounded-jxl border-2 border-[#111111] bg-white p-6 shadow-[10px_12px_0_rgba(17,17,17,0.92)]">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-bold uppercase tracking-wider text-[#111111]/60">{t("monetization.mock.title")}</p>
                <span className="rounded-full bg-jeon-lime px-2.5 py-1 text-[10px] font-bold text-[#111111]">+24%</span>
              </div>
              <p className="mt-2 font-display text-5xl font-extrabold tracking-tight text-[#111111]">Rp4,2jt</p>

              {/* Grafik batang mingguan murni div (tanpa library chart). */}
              <div className="mt-6 flex h-24 items-end gap-2" aria-hidden="true">
                {[35, 55, 40, 70, 60, 90, 78].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-jxs border-2 border-b-0 border-[#111111] bg-jeon-purple" style={{ height: `${h}%`, opacity: 0.55 + (i / 7) * 0.45 }} />
                ))}
              </div>

              <p className="mt-6 mb-2 text-[11px] font-bold uppercase tracking-wider text-[#111111]/50">{t("monetization.mock.salesLabel")}</p>
              <div className="flex flex-col gap-2">
                {MOCK_SALES.map((s) => (
                  <div key={s.key} className="flex items-center justify-between rounded-jsm border-2 border-[#111111] px-3 py-2">
                    <span className="flex items-center gap-2 text-xs font-bold text-[#111111]">
                      <span className={`h-5 w-5 rounded-jxs border-2 border-[#111111] ${s.chip}`} aria-hidden="true" />
                      {t(`monetization.mock.${s.key}`)}
                    </span>
                    <span className="font-display text-xs font-extrabold text-[#111111]">{s.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
