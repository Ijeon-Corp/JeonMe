"use client";

import { useRef } from "react";
import Carousel, { CarouselArrows, type CarouselHandle } from "./Carousel";
import { useLocale } from "@/lib/locale-context";

const testimonials = [
  { key: "maya" as const, name: "Maya Putri", initials: "MP", gradient: "linear-gradient(135deg,#1B4D3E,#1F7A6C)" },
  { key: "rendra" as const, name: "Rendra Hadi", initials: "RH", gradient: "linear-gradient(135deg,#1F7A6C,#1B4D3E)" },
  { key: "sinta" as const, name: "Sinta Nuraini", initials: "SN", gradient: "linear-gradient(135deg,#C9A24B,#1F7A6C)" },
  { key: "farah" as const, name: "Farah Wijaya", initials: "FW", gradient: "linear-gradient(135deg,#1B4D3E,#C9A24B)" },
];

export default function Testimonials() {
  const carouselRef = useRef<CarouselHandle>(null);
  const { t } = useLocale();

  return (
    <section id="testimonials" className="relative overflow-hidden bg-app-surface-2 py-20 md:py-28" aria-label="Testimoni">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <h2 className="font-heading text-3xl font-bold leading-tight text-app-ink sm:text-4xl">
              {t("testimonials.heading1")}
              <br />
              <span className="text-gradient">{t("testimonials.headingGradient")}</span>
            </h2>
          </div>
          <CarouselArrows carouselRef={carouselRef} />
        </div>

        <Carousel ref={carouselRef}>
          {testimonials.map((item) => (
            <div key={item.key} className="w-80 flex-shrink-0 scroll-snap-item rounded-2xl border border-app-border bg-app-surface p-6 shadow-card">
              <div className="mb-4 flex items-center gap-0.5 text-accent" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <p className="mb-5 text-sm leading-relaxed text-app-ink">&quot;{t(`testimonials.items.${item.key}.quote`)}&quot;</p>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: item.gradient }}
                >
                  {item.initials}
                </div>
                <div>
                  <p className="font-heading text-sm font-bold text-app-ink">{item.name}</p>
                  <p className="text-xs text-app-muted">{t(`testimonials.items.${item.key}.role`)}</p>
                </div>
              </div>
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
