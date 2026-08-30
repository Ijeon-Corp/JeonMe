"use client";

import { useLocale } from "@/lib/locale-context";

// Ikon ilustrasi 3D yang disediakan pengguna langsung (permintaan 23
// Agustus 2026: "ganti semua icon di analytic dengan gambar yang sudah
// saya samakan namanya"), public/homepage/icon/*.png -- pola sama seperti
// Features.tsx/Monetization.tsx sebelumnya. "pelacakan konversi.png"
// SENGAJA pakai spasi (bukan tanda hubung) apa adanya sesuai nama file
// yang disediakan -- di-encode %20 di src supaya valid sebagai URL.
const points = [
  { key: "visitors" as const, image: "/homepage/icon/analitik-pengunjung.png" },
  { key: "clicks" as const, image: "/homepage/icon/analitik-klik.png" },
  { key: "conversion" as const, image: "/homepage/icon/pelacakan%20konversi.png" },
  { key: "revenue" as const, image: "/homepage/icon/analitik-pendapatan.png" },
];

export default function Analytics() {
  const { t } = useLocale();

  return (
    // Section "story" pink KONSTAN (redesign spec §11.4 "Own your
    // audience") -- teks langsung di atasnya ink konstan #111, lihat
    // catatan warna konstan di ProductShowcase.tsx.
    <section className="relative overflow-hidden bg-jeon-pink py-20 md:py-28" aria-label="Analitik">
      <div className="mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="reveal order-2 lg:order-1">
            {/* Mockup "Ringkasan Performa" -- permintaan langsung pengguna,
                23 Agustus 2026: "di section analytics ganti dengan gambar
                analytics.png". SEBELUMNYA dibangun manual dari puluhan
                div/SVG (lihat riwayat git kalau perlu versi lama itu) --
                diganti satu file gambar (public/homepage/analytics.png),
                pola yang SAMA seperti penggantian mockup Hero.tsx (hero.png)
                & Monetization.tsx (monetization.png). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/homepage/analytics.png" alt="Dashboard analitik jeon.id" className="w-full rounded-jlg border-2 border-[#111111] object-contain shadow-[10px_12px_0_rgba(17,17,17,0.92)]" />
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
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
