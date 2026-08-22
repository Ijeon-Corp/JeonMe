"use client";

import { useState } from "react";
import { faqs } from "@/lib/faq-data";

export default function FAQ() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-primary-subtle/40 py-20 md:py-28" aria-label="FAQ">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mb-12 text-center">
          <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
            Pertanyaan yang Sering
            <br />
            <span className="text-gradient">Ditanyakan</span>
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((item, i) => {
            const isActive = active === i;
            return (
              // Dua div bersarang SENGAJA -- bug ditemukan lewat verifikasi
              // langsung (23 Agustus 2026, "perbaiki bagian faq ketika klik
              // malah menghilang"): SEBELUMNYA className "reveal" (dipakai
              // ScrollReveal.tsx, classList.add("visible") imperatif via
              // IntersectionObserver, di luar sepengetahuan React) berada di
              // div YANG SAMA dengan "accordion-item ${isActive ? ... }".
              // Begitu diklik, isActive berubah -> string className div itu
              // berubah -> React menulis ulang elemen.className penuh ->
              // "visible" yang ditambahkan classList.add ikut TERHAPUS
              // (bukan cuma diganti) karena React tidak pernah tahu class
              // itu ada. Efeknya animasi .reveal (opacity:0, translateY)
              // langsung berlaku lagi ke item yang diklik -- item itu
              // "menghilang" alih-alih jawabannya yang mengembang. Perbaikan:
              // "reveal" ditaruh di wrapper LUAR yang className-nya statis
              // (tidak pernah bergantung pada isActive, jadi React tidak
              // pernah menulis ulang elemen itu setelah mount) -- toggle
              // accordion dipindah ke div DALAM yang terpisah.
              <div key={item.q} className="reveal overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                <div className={`accordion-item ${isActive ? "active" : ""}`}>
                  <button
                    onClick={() => setActive(isActive ? null : i)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left"
                  >
                    <span className="font-heading text-base font-bold text-ink">{item.q}</span>
                    <span className="accordion-icon flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary-subtle">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B4D3E" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </span>
                  </button>
                  <div className="accordion-content px-5">
                    <p className="pb-5 text-sm leading-relaxed text-muted">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
