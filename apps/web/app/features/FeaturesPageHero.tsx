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
    <section className="relative overflow-hidden bg-app-surface pb-4 pt-36 md:pt-44">
      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <span className="mb-4 inline-block rounded-full border border-primary/15 bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
          {t("featuresPage.badge")}
        </span>
        <h1 className="mb-4 font-heading text-4xl font-bold leading-tight text-app-ink sm:text-5xl">
          {t("featuresPage.title1")}
          <br />
          <span className="text-gradient">{t("featuresPage.titleGradient")}</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-app-muted">{t("featuresPage.subtitle")}</p>
      </div>
    </section>
  );
}
