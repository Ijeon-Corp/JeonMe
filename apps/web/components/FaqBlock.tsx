"use client";

import { useState } from "react";
import { IconChevronRight } from "@/components/icons";

export interface FaqItem {
  question: string;
  answer: string;
}

// No.77 (Sprint 9): blok FAQ/accordion -- satu pertanyaan terbuka
// sekaligus, klik lagi untuk menutup.
export default function FaqBlock({
  title,
  items,
  cardClassName,
  titleClassName,
  itemTitleClassName,
  itemBodyClassName,
}: {
  title: string;
  items: FaqItem[];
  cardClassName: string;
  titleClassName: string;
  itemTitleClassName: string;
  itemBodyClassName: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className={cardClassName}>
      {title && <p className={`mb-2 truncate text-sm font-semibold ${titleClassName}`}>{title}</p>}
      <div className="flex flex-col divide-y divide-current/10">
        {items.map((item, i) => (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className={`flex w-full items-center justify-between gap-2 py-2 text-left text-xs font-semibold ${itemTitleClassName}`}
            >
              <span className="truncate">{item.question}</span>
              <IconChevronRight
                className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${openIndex === i ? "rotate-90" : ""}`}
              />
            </button>
            {openIndex === i && <p className={`pb-2 text-xs ${itemBodyClassName}`}>{item.answer}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
