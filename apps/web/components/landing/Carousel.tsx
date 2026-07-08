"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

export type CarouselHandle = { scroll: (dir: 1 | -1) => void };

const Carousel = forwardRef<CarouselHandle, { children: React.ReactNode }>(function Carousel(
  { children },
  ref
) {
  const rowRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scroll: (dir: 1 | -1) => {
      const row = rowRef.current;
      if (!row) return;
      const amount = row.firstElementChild
        ? row.firstElementChild.getBoundingClientRect().width + 20
        : 280;
      row.scrollBy({ left: dir * amount, behavior: "smooth" });
    },
  }));

  return (
    <div ref={rowRef} className="reveal scroll-row flex gap-5 overflow-x-auto pb-4">
      {children}
    </div>
  );
});

export default Carousel;

export function CarouselArrows({ carouselRef }: { carouselRef: React.RefObject<CarouselHandle | null> }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => carouselRef.current?.scroll(-1)}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-white transition-colors hover:border-primary hover:text-primary"
        aria-label="Sebelumnya"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        onClick={() => carouselRef.current?.scroll(1)}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-white transition-colors hover:border-primary hover:text-primary"
        aria-label="Berikutnya"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
