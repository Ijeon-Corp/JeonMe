"use client";

import { useLocale } from "@/lib/locale-context";

// FeaturesPageHero -- Modul Dark/Light Mode + Pilihan Bahasa (permintaan
// langsung pengguna, 29 Agustus 2026): dipisah dari page.tsx (Server
// Component, punya export const metadata statis) karena useLocale() cuma
// bisa dipakai di Client Component. metadata (title/description SEO) TETAP
// di page.tsx, TIDAK ikut locale toggle -- lihat catatan lingkup lengkap
// di lib/i18n/dictionaries.ts (metadata dievaluasi di server sebelum JS
// klien jalan, tidak bisa tahu preferensi bahasa yang tersimpan browser).
export default function FeaturesPageHero() {
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden bg-jeon-paper pb-4 pt-36 md:pt-44">
      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <span className="mb-4 inline-block rounded-full border border-primary/15 bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
          {t("featuresPage.badge")}
        </span>
        <h1 className="mb-4 font-display text-5xl font-extrabold leading-[0.92] tracking-tight text-jeon-ink sm:text-6xl md:text-7xl">
          {t("featuresPage.title1")}
          <br />
          <span className="text-jeon-purple">{t("featuresPage.titleGradient")}</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-jeon-muted">{t("featuresPage.subtitle")}</p>
      </div>
    </section>
  );
}
