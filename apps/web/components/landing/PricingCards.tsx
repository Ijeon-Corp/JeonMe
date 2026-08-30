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
//
// Restyle redesign Fase 2 (DESIGN-JEONID-REDESIGN.md §11.6): sumber
// harga/checkout TIDAK berubah -- kartu Premium jadi ungu solid (bukan
// gradien hijau-emas identitas lama), badge "Populer" tetap hanya di
// Premium (paket yang memang direkomendasikan).
export default function PricingCards({ monthly, yearly, showHeading }: { monthly: string; yearly: string; showHeading: boolean }) {
  const { t, dict } = useLocale();

  return (
    <section id="pricing" className="relative overflow-hidden bg-jeon-paper py-20 md:py-28" aria-label="Harga">
      <div className="relative mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        {showHeading && (
          <div className="reveal mx-auto mb-14 max-w-3xl text-center">
            <h2 className="mb-4 font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-jeon-ink sm:text-5xl md:text-6xl">
              {t("pricing.heading1")}
              <br />
              <span className="text-jeon-purple">{t("pricing.headingGradient")}</span>
            </h2>
            <p className="text-lg leading-relaxed text-jeon-muted">{t("pricing.subtitle")}</p>
          </div>
        )}

        <div className="mx-auto grid max-w-3xl items-start gap-6 md:grid-cols-2">
          <div className="reveal rounded-jlg border-2 border-jeon-ink bg-jeon-surface p-8 shadow-brutal">
            <h3 className="mb-1 font-display text-lg font-bold text-jeon-ink">{dict.pricing.free.name}</h3>
            <p className="mb-5 text-sm text-jeon-muted">{dict.pricing.free.tagline}</p>
            <p className="mb-1 font-display text-4xl font-extrabold text-jeon-ink">
              Rp0<span className="text-base font-medium text-jeon-muted">{dict.pricing.free.perMonth}</span>
            </p>
            <Link
              href="/register"
              className="mb-7 mt-6 block cursor-pointer rounded-jmd border-2 border-jeon-ink bg-jeon-surface px-5 py-3 text-center text-sm font-bold text-jeon-ink transition-transform duration-150 hover:-translate-y-0.5"
            >
              {dict.pricing.free.cta}
            </Link>
            <ul className="space-y-3">
              {dict.pricing.free.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-jeon-ink">
                  <span className="text-jeon-success">{check}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Kartu Premium: ungu brand KONSTAN (sama di kedua mode) --
              semua teks di atasnya putih/putih-transparan konstan. */}
          <div
            className="reveal relative rounded-jlg border-2 border-[#111111] bg-jeon-purple p-8 text-white shadow-[10px_12px_0_rgba(17,17,17,0.92)]"
            style={{ transitionDelay: "0.1s" }}
          >
            <span className="absolute -top-3 right-8 rounded-full border-2 border-[#111111] bg-jeon-lime px-3 py-1 text-[11px] font-bold text-[#111111]">
              {dict.pricing.premium.badge}
            </span>
            <h3 className="mb-1 font-display text-lg font-bold">{dict.pricing.premium.name}</h3>
            <p className="mb-5 text-sm text-white/75">{dict.pricing.premium.tagline}</p>
            <p className="mb-1 font-display text-4xl font-extrabold">
              {monthly}
              <span className="text-base font-medium text-white/75">{dict.pricing.premium.perMonth}</span>
            </p>
            <p className="mb-1 text-xs text-white/60">{dict.pricing.premium.perYear.replace("{yearly}", yearly)}</p>
            <Link
              href="/register"
              className="mb-7 mt-6 block cursor-pointer rounded-jmd border-2 border-[#111111] bg-white px-5 py-3 text-center font-display text-sm font-bold text-[#111111] transition-transform duration-150 hover:-translate-y-0.5"
            >
              {dict.pricing.premium.cta}
            </Link>
            <ul className="space-y-3">
              {dict.pricing.premium.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <span className="text-jeon-lime">{check}</span>
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
