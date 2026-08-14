"use client";

import { useState } from "react";
import { faqs } from "@/lib/faq-data";

export default function FAQ() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-primary-subtle/40 py-20 md:py-28" aria-label="FAQ">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mb-12 text-center">
          <span className="mb-4 inline-block rounded-full border border-primary/15 bg-white px-3 py-1.5 text-xs font-semibold text-primary">
            FAQ
          </span>
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
              <div
                key={item.q}
                className={`reveal accordion-item overflow-hidden rounded-2xl border border-border bg-white shadow-sm ${isActive ? "active" : ""}`}
              >
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
            );
          })}
        </div>
      </div>
    </section>
  );
}
