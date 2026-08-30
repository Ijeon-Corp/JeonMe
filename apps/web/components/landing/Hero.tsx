"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/locale-context";

// Hero -- Redesign "Modern Playful Creator Platform"
// (DESIGN-JEONID-REDESIGN.md §11.2, Fase 2): headline display raksasa 2
// baris ("Bangun / kehadiranmu."), CTA coral (semantic mapping spec §6:
// CTA marketing = coral), dan FLIP CARD interaktif menggantikan gambar
// hero-v2.png lama (mockup hijau identitas lama). Kartu memakai data
// FIKTIF "maya.lin" (spec §9 contoh URL jeon.id/mayalin; §11.3
// mengizinkan fictional placeholder) -- flip lewat KLIK (bukan cuma
// hover) supaya tetap bisa dioperasikan keyboard/sentuh, transisi murni
// transform (spec §17) dan berhenti mulus di prefers-reduced-motion
// lewat media query global yang sudah ada.
//
// Badge "Dipercaya 10.000+ kreator" LAMA DIHAPUS -- spec §11.2: badge
// jumlah kreator hanya boleh kalau datanya benar & bisa dibuktikan;
// tidak ada sumber angka terverifikasi (REDESIGN-AUDIT.md konflik #8).
export default function Hero() {
  const { t } = useLocale();
  const [flipped, setFlipped] = useState(false);

  return (
    <section className="relative overflow-hidden bg-jeon-paper pb-20 pt-28 md:pb-28 md:pt-40" aria-label="Hero">
      {/* Dekorasi geometris playful -- bentuk kecil ber-outline ink di
          tepi, jauh dari CTA (spec: dekorasi tidak boleh menghalangi CTA). */}
      <div aria-hidden="true" className="absolute left-[6%] top-24 hidden h-10 w-10 rotate-12 rounded-jsm border-2 border-[#111111] bg-jeon-lime md:block" />
      <div aria-hidden="true" className="absolute right-[8%] top-32 hidden h-8 w-8 rounded-full border-2 border-[#111111] bg-jeon-pink md:block" />
      <div aria-hidden="true" className="absolute bottom-16 left-[12%] hidden select-none font-display text-3xl text-jeon-purple md:block">
        ✦
      </div>

      <div className="relative mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-[1.2fr_1fr] lg:gap-8">
          <div className="text-center lg:text-left">
            <h1 className="reveal mb-7 font-display font-extrabold leading-[0.88] tracking-[-0.03em] text-jeon-ink">
              <span className="block text-[clamp(3.5rem,10vw,9rem)]">{t("hero.title1")}</span>
              <span className="block text-[clamp(3.5rem,10vw,9rem)] text-jeon-purple">{t("hero.titleGradient")}</span>
            </h1>

            <p className="reveal mx-auto mb-9 max-w-lg text-lg leading-relaxed text-jeon-muted sm:text-xl lg:mx-0" style={{ transitionDelay: "0.1s" }}>
              {t("hero.subtitle")}
            </p>

            <div className="reveal flex flex-col justify-center gap-3 sm:flex-row lg:justify-start" style={{ transitionDelay: "0.15s" }}>
              <Link
                href="/register"
                className="cursor-pointer rounded-jmd border-2 border-jeon-ink bg-jeon-coral px-8 py-4 text-center font-display text-base font-bold text-white shadow-brutal transition-transform duration-150 hover:-translate-y-1 active:translate-y-0 active:shadow-none"
              >
                {t("hero.ctaPrimary")}
              </Link>
              <a
                href="#features"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-jmd border-2 border-jeon-ink bg-jeon-surface px-8 py-4 text-center text-base font-bold text-jeon-ink transition-transform duration-150 hover:-translate-y-1"
              >
                {t("hero.ctaSecondary")}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </a>
            </div>
          </div>

          {/* Flip card interaktif (spec §11.2) -- depan: mini halaman bio
              fiktif; belakang: mini statistik. Data 100% fiktif. */}
          <div className="flex justify-center pb-4 lg:justify-end">
            <button
              type="button"
              onClick={() => setFlipped((v) => !v)}
              aria-label={flipped ? "Lihat sisi halaman bio" : "Lihat sisi statistik"}
              className="group cursor-pointer [perspective:1400px]"
            >
              <div
                className={`relative h-[480px] w-[300px] transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${
                  flipped ? "[transform:rotateY(180deg)]" : ""
                }`}
              >
                {/* Sisi depan: halaman bio fiktif */}
                <div className="absolute inset-0 flex flex-col rounded-jxl border-2 border-jeon-ink bg-jeon-surface p-6 shadow-brutal [backface-visibility:hidden]">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#111111] bg-jeon-lavender font-display text-xl font-extrabold text-[#111111]">
                    M
                  </div>
                  <p className="mt-3 text-center font-display text-lg font-bold text-jeon-ink">maya.lin</p>
                  <p className="text-center text-xs text-jeon-muted">jeon.id/mayalin</p>
                  <div className="mt-5 flex flex-col gap-2.5">
                    <span className="rounded-jmd border-2 border-[#111111] bg-jeon-lime px-4 py-3 text-center text-sm font-bold text-[#111111]">Playbook Kreator ✦</span>
                    <span className="rounded-jmd border-2 border-jeon-ink bg-jeon-surface px-4 py-3 text-center text-sm font-bold text-jeon-ink">Kelas Editing</span>
                    <span className="rounded-jmd border-2 border-[#111111] bg-jeon-pink px-4 py-3 text-center text-sm font-bold text-[#111111]">Booking 1-on-1</span>
                    <span className="rounded-jmd border-2 border-jeon-ink bg-jeon-surface px-4 py-3 text-center text-sm font-bold text-jeon-ink">YouTube Terbaru</span>
                  </div>
                  <p className="mt-auto text-center text-[11px] font-semibold text-jeon-muted">
                    {t("hero.flipHint")}
                  </p>
                </div>
                {/* Sisi belakang: statistik fiktif */}
                <div className="absolute inset-0 flex flex-col rounded-jxl border-2 border-jeon-ink bg-jeon-sidebar p-6 shadow-brutal [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <p className="font-display text-lg font-bold text-white">✦ {t("hero.flipStatsTitle")}</p>
                  <div className="mt-5 flex flex-col gap-3">
                    <div className="rounded-jmd border-2 border-white/20 bg-white/5 p-4 text-left">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-jeon-lime">{t("hero.flipStatViews")}</p>
                      <p className="font-display text-3xl font-extrabold text-white">12.480</p>
                    </div>
                    <div className="rounded-jmd border-2 border-white/20 bg-white/5 p-4 text-left">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-jeon-blue">{t("hero.flipStatClicks")}</p>
                      <p className="font-display text-3xl font-extrabold text-white">3.921</p>
                    </div>
                    <div className="rounded-jmd border-2 border-white/20 bg-white/5 p-4 text-left">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-jeon-pink">{t("hero.flipStatSales")}</p>
                      <p className="font-display text-3xl font-extrabold text-white">Rp2,4jt</p>
                    </div>
                  </div>
                  <p className="mt-auto text-center text-[11px] font-semibold text-white/60">{t("hero.flipHintBack")}</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
