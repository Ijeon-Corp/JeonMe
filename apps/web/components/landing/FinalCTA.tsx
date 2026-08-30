"use client";

import Link from "next/link";
import { useLocale } from "@/lib/locale-context";

// FinalCTA -- redesign Fase 2 (DESIGN-JEONID-REDESIGN.md): panel gelap
// --jeon-sidebar KONSTAN (identitas ungu-hitam baru menggantikan gradien
// hijau-emas lama) dengan CTA coral (spec §6: CTA marketing = coral).
// Teks di atasnya putih konstan -- panel ini gelap di KEDUA mode.
export default function FinalCTA() {
  const { t } = useLocale();

  return (
    <section className="bg-jeon-paper px-4 pb-20 pt-4 sm:px-6 lg:px-8" aria-label="Ajakan bertindak">
      <div className="relative mx-auto max-w-[var(--container)] overflow-hidden rounded-jsection border-2 border-[#111111] bg-jeon-sidebar py-20 md:py-28">
        <div aria-hidden="true" className="absolute left-8 top-8 select-none font-display text-4xl text-jeon-lime">
          ✦
        </div>
        <div aria-hidden="true" className="absolute bottom-8 right-10 h-10 w-10 rotate-12 rounded-jsm border-2 border-white/25 bg-jeon-purple" />

        <div className="reveal relative mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="mb-5 font-display text-4xl font-extrabold leading-[0.92] tracking-tight text-white sm:text-5xl lg:text-7xl">
            {t("finalCta.title1")}
            <br />
            {t("finalCta.title2")}
          </h2>
          <p className="mx-auto mb-9 max-w-xl text-lg text-white/70">{t("finalCta.subtitle")}</p>
          <Link
            href="/register"
            className="inline-flex cursor-pointer rounded-jmd border-2 border-[#111111] bg-jeon-coral px-10 py-4 font-display text-base font-bold text-white shadow-[10px_12px_0_rgba(0,0,0,0.5)] transition-transform duration-150 hover:-translate-y-1 active:translate-y-0 active:shadow-none"
          >
            {t("finalCta.cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
