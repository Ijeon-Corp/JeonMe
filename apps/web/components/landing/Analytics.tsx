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
    <section className="relative overflow-hidden bg-app-surface py-20 md:py-28" aria-label="Analitik">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
            <img src="/homepage/analytics.png" alt="Dashboard analitik Jeon.id" className="w-full rounded-2xl object-contain shadow-hero" />
          </div>

          <div className="reveal order-1 lg:order-2" style={{ transitionDelay: "0.1s" }}>
            <h2 className="mb-5 font-heading text-3xl font-bold leading-tight text-app-ink sm:text-4xl">
              {t("analytics.heading1")}
              <br />
              <span className="text-gradient">{t("analytics.headingGradient")}</span>
            </h2>
            <p className="mb-8 text-lg leading-relaxed text-app-muted">{t("analytics.subtitle")}</p>
            <div className="space-y-4">
              {points.map((p) => (
                <div key={p.key} className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
                  <div>
                    <h3 className="mb-0.5 font-heading text-sm font-bold text-app-ink">{t(`analytics.points.${p.key}.title`)}</h3>
                    <p className="text-xs leading-relaxed text-app-muted">{t(`analytics.points.${p.key}.desc`)}</p>
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
