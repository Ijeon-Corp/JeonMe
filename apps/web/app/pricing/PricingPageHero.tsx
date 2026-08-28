"use client";

import { useLocale } from "@/lib/locale-context";

// PricingPageHero -- lihat catatan lengkap di app/features/FeaturesPageHero.tsx
// (pola identik: dipisah dari page.tsx Server Component karena useLocale()
// butuh Client Component; metadata SEO TETAP di page.tsx, tidak ikut locale).
export default function PricingPageHero() {
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden bg-app-surface pb-4 pt-36 md:pt-44">
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <span className="mb-4 inline-block rounded-full border border-primary/15 bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
          {t("pricingPage.badge")}
        </span>
        <h1 className="mb-4 font-heading text-4xl font-bold leading-tight text-app-ink sm:text-5xl">
          {t("pricingPage.title1")}
          <br />
          <span className="text-gradient">{t("pricingPage.titleGradient")}</span>
        </h1>
        <p className="mx-auto max-w-xl text-lg leading-relaxed text-app-muted">{t("pricingPage.subtitle")}</p>
      </div>
    </section>
  );
}
