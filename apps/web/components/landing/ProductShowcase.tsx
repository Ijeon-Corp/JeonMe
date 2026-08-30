"use client";

import { useRef } from "react";
import Carousel, { CarouselArrows, type CarouselHandle } from "./Carousel";
import { QUICK_SETUP_TEMPLATES } from "@/lib/quick-setup-templates";
import { useLocale } from "@/lib/locale-context";

// ProductShowcase -- rework konten Fase 2 lanjutan (permintaan langsung
// pengguna, 31 Agustus 2026: "isinya di sesuaikan dengan tema dulu saja
// tidak usah pakai image dan icon yang sudah ada dari lama"): carousel
// mockup <PagePreview> sungguhan DIGANTI kartu mini-bio bergaya token
// redesign (pola visual sama seperti flip card Hero.tsx) -- nama & jenis
// template tetap DIAMBIL dari QUICK_SETUP_TEMPLATES asli (konten jujur,
// template ini benar-benar ada di Quick Setup), hanya visualnya yang
// jadi mockup stilistik. Bonus nyata: PagePreview (3000+ baris) tidak
// lagi terbundel di halaman marketing sama sekali (target performa spec
// §21). Section tint lavender KONSTAN -- teks/outline ink konstan #111.
const CURATED: { key: string; initial: string; accent: string; pills: string[] }[] = [
  { key: "fullstack-developer", initial: "D", accent: "bg-jeon-purple", pills: ["bg-jeon-lime", "bg-white", "bg-jeon-blue"] },
  { key: "book-author", initial: "R", accent: "bg-jeon-coral", pills: ["bg-white", "bg-jeon-pink", "bg-white"] },
  { key: "teacher", initial: "S", accent: "bg-jeon-blue", pills: ["bg-jeon-lavender", "bg-white", "bg-jeon-lime"] },
  { key: "freelancer", initial: "F", accent: "bg-jeon-lime", pills: ["bg-white", "bg-jeon-lavender", "bg-white"] },
  { key: "online-store", initial: "T", accent: "bg-jeon-pink", pills: ["bg-jeon-blue", "bg-white", "bg-jeon-lavender"] },
  { key: "fitness-coach", initial: "B", accent: "bg-jeon-purple", pills: ["bg-white", "bg-jeon-lime", "bg-white"] },
  { key: "wedding-organizer", initial: "A", accent: "bg-jeon-coral", pills: ["bg-jeon-pink", "bg-white", "bg-jeon-blue"] },
  { key: "culinary-tour", initial: "J", accent: "bg-jeon-blue", pills: ["bg-white", "bg-jeon-lavender", "bg-jeon-lime"] },
];

const items = CURATED.map((c) => {
  const tmpl = QUICK_SETUP_TEMPLATES.find((x) => x.key === c.key)!;
  return { ...c, label: tmpl.label, description: tmpl.description };
});

export default function ProductShowcase() {
  const carouselRef = useRef<CarouselHandle>(null);
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden rounded-t-jsection border-t-2 border-[#111111] bg-jeon-lavender py-20 md:py-28" aria-label="Contoh halaman">
      <div className="relative mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="reveal mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <h2 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-[#111111] sm:text-5xl md:text-6xl">
              {t("productShowcase.heading1")}
              <br />
              <span className="text-jeon-purple-dark">{t("productShowcase.headingGradient")}</span>
            </h2>
          </div>
          <CarouselArrows carouselRef={carouselRef} />
        </div>

        <Carousel ref={carouselRef}>
          {items.map((item) => (
            <div key={item.key} className="w-56 flex-shrink-0 scroll-snap-item overflow-hidden rounded-jlg border-2 border-[#111111] bg-white shadow-[10px_12px_0_rgba(17,17,17,0.92)]">
              {/* Mockup mini-bio stilistik (murni dekoratif). */}
              <div className="flex flex-col items-center px-5 pb-4 pt-6" aria-hidden="true">
                <span className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#111111] ${item.accent} font-display text-lg font-extrabold text-white`}>
                  {item.initial}
                </span>
                <span className="mt-2 h-2 w-20 rounded-full bg-[#111111]/80" />
                <span className="mt-1.5 h-1.5 w-28 rounded-full bg-[#111111]/25" />
                <div className="mt-4 flex w-full flex-col gap-2">
                  {item.pills.map((pill, i) => (
                    <span key={i} className={`h-8 w-full rounded-jsm border-2 border-[#111111] ${pill}`} />
                  ))}
                </div>
              </div>
              <div className="border-t-2 border-[#111111] p-4 pt-3">
                <h3 className="font-display text-sm font-bold text-[#111111]">{item.label}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-[#111111]/60">{item.description}</p>
              </div>
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
