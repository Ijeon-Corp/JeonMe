"use client";

import Link from "next/link";
import { useLocale } from "@/lib/locale-context";

// AISection -- Redesign "Modern Playful Creator Platform"
// (DESIGN-JEONID-REDESIGN.md §11.5, Fase 2). Aturan spec yang dipegang
// KETAT di sini: "Jelaskan fungsi yang benar-benar tersedia" -- Jeonme
// TIDAK punya "AI Assistant" umum (lihat REDESIGN-AUDIT.md §2), yang
// nyata cuma dua dan keduanya dijelaskan apa adanya:
//  1. Import (AI sungguhan -- Claude vision menganalisis screenshot
//     link-in-bio lama & mencocokkan tema; Premium-only, digerbang
//     server-side).
//  2. Tanya Analitik (BUKAN LLM -- jawaban dirangkai dari templat + data
//     analitik asli; keputusan produk eksplisit, jangan diklaim sebagai
//     "AI" di copy).
// JANGAN menambahkan klaim fitur AI lain di sini tanpa fiturnya
// benar-benar ada dulu (spec: status "Coming soon" pun hanya untuk yang
// sudah direncanakan production).
export default function AISection() {
  const { t } = useLocale();

  return (
    <section className="bg-jeon-paper py-20 md:py-28" aria-label="AI">
      <div className="mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="reveal mb-12 max-w-2xl">
          <p className="mb-3 inline-block rounded-full border-2 border-[#111111] bg-jeon-lime px-4 py-1 font-display text-xs font-bold uppercase tracking-wider text-[#111111]">
            ✦ {t("aiSection.badge")}
          </p>
          <h2 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-jeon-ink sm:text-5xl md:text-6xl">
            {t("aiSection.heading")}
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="reveal flex flex-col rounded-jlg border-2 border-[#111111] bg-jeon-lavender p-7 shadow-brutal">
            <p className="font-display text-xl font-bold text-[#111111]">{t("aiSection.importTitle")}</p>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-[#111111]/75">{t("aiSection.importDesc")}</p>
            <div className="mt-5 flex items-center justify-between">
              <span className="rounded-full bg-[#111111] px-3 py-1 text-[11px] font-bold text-white">{t("aiSection.premiumBadge")}</span>
              <Link href="/register" className="cursor-pointer font-display text-sm font-bold text-[#111111] underline underline-offset-4 hover:text-jeon-purple-dark">
                {t("aiSection.importCta")} →
              </Link>
            </div>
          </div>

          <div className="reveal flex flex-col rounded-jlg border-2 border-jeon-ink bg-jeon-surface p-7 shadow-brutal" style={{ transitionDelay: "0.08s" }}>
            <p className="font-display text-xl font-bold text-jeon-ink">{t("aiSection.askTitle")}</p>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-jeon-muted">{t("aiSection.askDesc")}</p>
            <div className="mt-5 flex items-center justify-between">
              <span className="rounded-full border-2 border-jeon-ink px-3 py-1 text-[11px] font-bold text-jeon-ink">{t("aiSection.freeBadge")}</span>
              <Link href="/register" className="cursor-pointer font-display text-sm font-bold text-jeon-ink underline underline-offset-4 hover:text-jeon-purple">
                {t("aiSection.askCta")} →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
