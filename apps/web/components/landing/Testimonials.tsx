"use client";

import { useRef } from "react";
import Carousel, { CarouselArrows, type CarouselHandle } from "./Carousel";

const testimonials = [
  {
    quote: "Jeonme benar-benar menggantikan tiga tools berbeda yang selama ini aku pakai bergantian. Penjualan ebook-ku naik dua kali lipat di bulan pertama.",
    name: "Maya Putri",
    role: "Kreator Digital",
    initials: "MP",
    gradient: "linear-gradient(135deg,#1B4D3E,#1F7A6C)",
  },
  {
    quote: "Fitur booking-nya saja sudah balik modal berkali-kali lipat. Klien bisa langsung booking konsultasi dari bio link-ku.",
    name: "Rendra Hadi",
    role: "Business Coach",
    initials: "RH",
    gradient: "linear-gradient(135deg,#1F7A6C,#1B4D3E)",
  },
  {
    quote: "Pindah dari kompetitor dan nggak nyesel sama sekali. Analitiknya benar-benar kasih tahu langkah selanjutnya, bukan cuma angka doang.",
    name: "Sinta Nuraini",
    role: "Kreator Kelas",
    initials: "SN",
    gradient: "linear-gradient(135deg,#C9A24B,#1F7A6C)",
  },
  {
    quote: "Setup domain custom dan hapus branding cuma butuh beberapa menit. Akhirnya terasa seperti platform milikku sendiri, bukan sekadar template.",
    name: "Farah Wijaya",
    role: "Desainer Freelance",
    initials: "FW",
    gradient: "linear-gradient(135deg,#1B4D3E,#C9A24B)",
  },
];

export default function Testimonials() {
  const carouselRef = useRef<CarouselHandle>(null);

  return (
    <section id="testimonials" className="relative overflow-hidden bg-primary-subtle/40 py-20 md:py-28" aria-label="Testimoni">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <span className="mb-4 inline-block rounded-full border border-primary/15 bg-white px-3 py-1.5 text-xs font-semibold text-primary">
              Testimoni
            </span>
            <h2 className="font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Disukai Kreator
              <br />
              <span className="text-gradient">di Seluruh Indonesia</span>
            </h2>
          </div>
          <CarouselArrows carouselRef={carouselRef} />
        </div>

        <Carousel ref={carouselRef}>
          {testimonials.map((t) => (
            <div key={t.name} className="w-80 flex-shrink-0 scroll-snap-item rounded-2xl border border-border bg-white p-6 shadow-card">
              <div className="mb-4 flex items-center gap-0.5 text-accent" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <p className="mb-5 text-sm leading-relaxed text-ink">&quot;{t.quote}&quot;</p>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: t.gradient }}
                >
                  {t.initials}
                </div>
                <div>
                  <p className="font-heading text-sm font-bold text-ink">{t.name}</p>
                  <p className="text-xs text-muted">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
