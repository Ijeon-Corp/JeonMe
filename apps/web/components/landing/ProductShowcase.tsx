"use client";

import { useRef } from "react";
import Carousel, { CarouselArrows, type CarouselHandle } from "./Carousel";

const items = [
  { initials: "RS", name: "Rian Saputra", title: "Profil Kreator", desc: "Tautan sosial + hub konten", bg: "from-emerald-100 to-teal-100", dark: false },
  { initials: "DV", name: "Dimas Dev", title: "Portofolio Developer", desc: "Proyek + GitHub + CV", bg: "from-slate-800 to-slate-900", dark: true },
  { initials: "SN", name: "Sinta Nuraini", title: "Kreator Kelas", desc: "Modul + pendaftaran + review", bg: "from-amber-50 to-orange-100", dark: false },
  { initials: "FW", name: "Farah W.", title: "Profil Freelancer", desc: "Layanan + portofolio + booking", bg: "from-teal-50 to-emerald-100", dark: false },
  { initials: "TS", name: "Toko Senja", title: "Toko Digital", desc: "Produk + checkout + review", bg: "from-amber-100 to-yellow-100", dark: false },
  { initials: "CB", name: "Coach Budi", title: "Halaman Coach", desc: "Sesi + kalender + pembayaran", bg: "from-emerald-50 to-teal-100", dark: false },
];

export default function ProductShowcase() {
  const carouselRef = useRef<CarouselHandle>(null);

  return (
    <section className="dot-grid relative overflow-hidden bg-primary-subtle/40 py-20 md:py-28" aria-label="Contoh halaman">
      <div
        className="absolute inset-0 opacity-[0.5]"
        aria-hidden="true"
        style={{ maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent)" }}
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <h2 className="font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Satu Halaman untuk Setiap
              <br />
              <span className="text-gradient">Jenis Kreator</span>
            </h2>
          </div>
          <CarouselArrows carouselRef={carouselRef} />
        </div>

        <Carousel ref={carouselRef}>
          {items.map((item) => (
            <div
              key={item.name}
              className="tilt-card w-64 flex-shrink-0 scroll-snap-item rounded-3xl border border-border bg-white p-5 shadow-card"
            >
              <div className={`mb-4 rounded-2xl bg-gradient-to-br ${item.bg} p-4`} style={{ aspectRatio: "9/13" }}>
                <div
                  className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white`}
                  style={{ background: "linear-gradient(135deg,#1B4D3E,#1F7A6C)" }}
                >
                  {item.initials}
                </div>
                <p className={`mb-3 text-center font-heading text-xs font-bold ${item.dark ? "text-white" : "text-ink"}`}>
                  {item.name}
                </p>
                <div className="space-y-1.5">
                  <div className={`h-6 rounded-lg ${item.dark ? "bg-white/10" : "bg-white shadow-sm"}`} />
                  <div className={`h-6 rounded-lg ${item.dark ? "bg-white/10" : "bg-white shadow-sm"}`} />
                  <div className={`h-6 rounded-lg ${item.dark ? "bg-white/10" : "bg-white shadow-sm"}`} />
                </div>
              </div>
              <h3 className="font-heading text-sm font-bold text-ink">{item.title}</h3>
              <p className="mt-1 text-xs text-muted">{item.desc}</p>
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
