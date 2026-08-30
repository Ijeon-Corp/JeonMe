"use client";

import { useRef } from "react";
import Carousel, { CarouselArrows, type CarouselHandle } from "./Carousel";
import { useLocale } from "@/lib/locale-context";

// Avatar gradien diperbarui ke palet redesign (ungu/coral/lime/blue) --
// nama & kutipan tetap FIKTIF placeholder seperti sebelumnya (aturan spec
// §11.7: testimonial nyata butuh izin; placeholder diberi data fiktif).
const testimonials = [
  { key: "maya" as const, name: "Maya Putri", initials: "MP", gradient: "linear-gradient(135deg,#7657ff,#5636e8)" },
  { key: "rendra" as const, name: "Rendra Hadi", initials: "RH", gradient: "linear-gradient(135deg,#ff6448,#d93d36)" },
  { key: "sinta" as const, name: "Sinta Nuraini", initials: "SN", gradient: "linear-gradient(135deg,#168153,#d7ff60)" },
  { key: "farah" as const, name: "Farah Wijaya", initials: "FW", gradient: "linear-gradient(135deg,#7657ff,#ffafd0)" },
];

export default function Testimonials() {
  const carouselRef = useRef<CarouselHandle>(null);
  const { t } = useLocale();

  return (
    <section id="testimonials" className="relative overflow-hidden bg-jeon-paper py-20 md:py-28" aria-label="Testimoni">
      <div className="relative mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="reveal mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <h2 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-jeon-ink sm:text-5xl md:text-6xl">
              {t("testimonials.heading1")}
              <br />
              <span className="text-jeon-purple">{t("testimonials.headingGradient")}</span>
            </h2>
          </div>
          <CarouselArrows carouselRef={carouselRef} />
        </div>

        <Carousel ref={carouselRef}>
          {testimonials.map((item) => (
            <div key={item.key} className="w-80 flex-shrink-0 scroll-snap-item rounded-jlg border-2 border-jeon-ink bg-jeon-surface p-6 shadow-brutal">
              <p className="mb-1 select-none font-editorial text-5xl leading-none text-jeon-purple" aria-hidden="true">
                &ldquo;
              </p>
              <p className="mb-5 font-editorial text-base leading-relaxed text-jeon-ink">{t(`testimonials.items.${item.key}.quote`)}</p>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-jeon-ink text-xs font-bold text-white"
                  style={{ background: item.gradient }}
                >
                  {item.initials}
                </div>
                <div>
                  <p className="font-display text-sm font-bold text-jeon-ink">{item.name}</p>
                  <p className="text-xs text-jeon-muted">{t(`testimonials.items.${item.key}.role`)}</p>
                </div>
              </div>
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
