"use client";

import Link from "next/link";
import { useLocale } from "@/lib/locale-context";

const check = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="mt-0.5 flex-shrink-0" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// PricingCards -- Modul Dark/Light Mode + Pilihan Bahasa (permintaan
// langsung pengguna, 29 Agustus 2026): dipisah dari Pricing.tsx (SERVER
// component async, memanggil getPlans() -- lihat catatan lengkap di sana)
// karena useLocale() (React Context) HANYA bisa dipakai di Client
// Component. Pricing.tsx tetap mengambil data harga di server (SSR utuh,
// tidak ada perubahan perilaku fetch), lalu mengoper monthly/yearly yang
// sudah jadi string ke sini murni untuk dirender + diterjemahkan.
export default function PricingCards({ monthly, yearly, showHeading }: { monthly: string; yearly: string; showHeading: boolean }) {
  const { t, dict } = useLocale();

  return (
    <section id="pricing" className="relative overflow-hidden bg-app-surface py-20 md:py-28" aria-label="Harga">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {showHeading && (
          <div className="reveal mx-auto mb-14 max-w-2xl text-center">
            <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-app-ink sm:text-4xl">
              {t("pricing.heading1")}
              <br />
              <span className="text-gradient">{t("pricing.headingGradient")}</span>
            </h2>
            <p className="text-lg leading-relaxed text-app-muted">{t("pricing.subtitle")}</p>
          </div>
        )}

        <div className="mx-auto grid max-w-3xl items-start gap-6 md:grid-cols-2">
          <div className="reveal rounded-3xl border border-app-border bg-app-surface p-8 shadow-card">
            <h3 className="mb-1 font-heading text-lg font-bold text-app-ink">{dict.pricing.free.name}</h3>
            <p className="mb-5 text-sm text-app-muted">{dict.pricing.free.tagline}</p>
            <p className="mb-1 font-heading text-4xl font-extrabold text-app-ink">
              Rp0<span className="text-base font-medium text-app-muted">{dict.pricing.free.perMonth}</span>
            </p>
            <Link href="/register" className="btn-ghost mb-7 mt-6 block cursor-pointer rounded-xl border border-app-border px-5 py-3 text-center text-sm font-bold text-app-ink">
              {dict.pricing.free.cta}
            </Link>
            <ul className="space-y-3">
              {dict.pricing.free.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-app-ink">
                  <span className="text-green-600">{check}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div
            className="reveal relative rounded-3xl p-8 text-white shadow-hero"
            style={{ background: "linear-gradient(160deg,#1B4D3E,#145C52 60%,#C9A24B)", transitionDelay: "0.1s" }}
          >
            <span className="absolute -top-3 right-8 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-amber-900 shadow-md">
              {dict.pricing.premium.badge}
            </span>
            <h3 className="mb-1 font-heading text-lg font-bold">{dict.pricing.premium.name}</h3>
            <p className="mb-5 text-sm text-white/70">{dict.pricing.premium.tagline}</p>
            <p className="mb-1 font-heading text-4xl font-extrabold">
              {monthly}
              <span className="text-base font-medium text-white/70">{dict.pricing.premium.perMonth}</span>
            </p>
            <p className="mb-1 text-xs text-white/60">{dict.pricing.premium.perYear.replace("{yearly}", yearly)}</p>
            <Link href="/register" className="mb-7 mt-6 block cursor-pointer rounded-xl bg-white px-5 py-3 text-center font-heading text-sm font-bold text-primary transition-shadow hover:shadow-lg">
              {dict.pricing.premium.cta}
            </Link>
            <ul className="space-y-3">
              {dict.pricing.premium.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <span className="text-yellow-300">{check}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
