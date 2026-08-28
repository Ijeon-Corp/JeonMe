"use client";

import Link from "next/link";
import { IconBox, IconLink, IconSparkle } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

// Modul Onboarding: halaman Tutorial STATIS (dipilih pengguna lewat
// AskUserQuestion, bukan tur interaktif spotlight/tooltip) -- dua alur
// utama yang ditanyakan langsung: "cara membuat link bio ataupun product".
// Tidak butuh data dinamis apa pun -- SEBELUMNYA server component biasa,
// diubah jadi "use client" (permintaan susulan pengguna, 29 Agustus 2026:
// terjemahkan seluruh isi halaman dashboard) supaya bisa memanggil
// useLocale() untuk t(), sama seperti pola buildNavItems(t) di
// dashboard/layout.tsx -- LINK_BIO_STEPS/PRODUCT_STEPS dipindah jadi
// fungsi pembangun yang dipanggil di dalam komponen (bukan konstanta
// modul lagi) supaya labelnya ikut berganti begitu locale berubah.
function buildLinkBioSteps(t: (key: string) => string) {
  return [
    {
      title: t("dashboard.pages.tutorial.linkBio.step1.title"),
      body: t("dashboard.pages.tutorial.linkBio.step1.body"),
      href: "/dashboard/design",
    },
    {
      title: t("dashboard.pages.tutorial.linkBio.step2.title"),
      body: t("dashboard.pages.tutorial.linkBio.step2.body"),
      href: "/dashboard/links",
    },
  ];
}

function buildProductSteps(t: (key: string) => string) {
  return [
    {
      title: t("dashboard.pages.tutorial.product.step1.title"),
      body: t("dashboard.pages.tutorial.product.step1.body"),
      href: "/dashboard/products",
    },
    {
      title: t("dashboard.pages.tutorial.product.step2.title"),
      body: t("dashboard.pages.tutorial.product.step2.body"),
      href: "/dashboard/products",
    },
    {
      title: t("dashboard.pages.tutorial.product.step3.title"),
      body: t("dashboard.pages.tutorial.product.step3.body"),
      href: "/dashboard/balance",
    },
  ];
}

function StepCard({ index, title, body, href }: { index: number; title: string; body: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex gap-3 rounded-2xl border border-app-border bg-app-surface p-4 transition-colors hover:border-primary"
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-bold text-primary">
        {index}
      </span>
      <span>
        <span className="block text-sm font-bold text-app-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-app-muted">{body}</span>
      </span>
    </Link>
  );
}

export default function TutorialPage() {
  const { t } = useLocale();
  const linkBioSteps = buildLinkBioSteps(t);
  const productSteps = buildProductSteps(t);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-app-ink">
        <IconSparkle className="h-6 w-6 text-primary" />
        {t("dashboard.pages.tutorial.pageHeading")}
      </h1>
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.tutorial.intro")}</p>

      <section className="mt-6">
        <h2 className="flex items-center gap-1.5 font-heading text-sm font-bold text-app-ink">
          <IconLink className="h-4 w-4 text-primary" />
          {t("dashboard.pages.tutorial.linkBioHeading")}
        </h2>
        <div className="mt-3 flex flex-col gap-2.5">
          {linkBioSteps.map((s, i) => (
            <StepCard key={s.title} index={i + 1} title={s.title} body={s.body} href={s.href} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-1.5 font-heading text-sm font-bold text-app-ink">
          <IconBox className="h-4 w-4 text-primary" />
          {t("dashboard.pages.tutorial.sellProductsHeading")}
        </h2>
        <div className="mt-3 flex flex-col gap-2.5">
          {productSteps.map((s, i) => (
            <StepCard key={s.title} index={i + 1} title={s.title} body={s.body} href={s.href} />
          ))}
        </div>
      </section>

      <p className="mt-8 rounded-xl border border-dashed border-app-border p-4 text-center text-xs text-app-muted">
        {t("dashboard.pages.tutorial.helpPrefix")}{" "}
        <Link href="/dashboard/audience" className="font-semibold text-primary hover:underline">
          {t("dashboard.pages.tutorial.audienceLinkText")}
        </Link>{" "}
        {t("dashboard.pages.tutorial.helpSuffix")}
      </p>
    </div>
  );
}
