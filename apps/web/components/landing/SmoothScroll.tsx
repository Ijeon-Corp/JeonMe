"use client";

import { useEffect } from "react";
import Lenis from "lenis";

// SmoothScroll -- permintaan langsung pengguna, 31 Agustus 2026: "coba
// pakai lenis scroll supaya smooth". Dipasang HANYA di halaman marketing
// (homepage//features//pricing) -- BUKAN dashboard (spec redesign §17:
// dashboard tidak memakai animasi scroll dekoratif; Lenis juga bisa
// mengganggu drag-reorder & scroller internal editor).
//
// prefers-reduced-motion: Lenis TIDAK diaktifkan sama sekali (bukan cuma
// diperlambat) -- aturan spec §17 "hormati prefers-reduced-motion".
// anchorLinks: klik anchor (#features dst) ikut discroll halus oleh
// Lenis lewat handler bawaannya (anchors: true).
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ autoRaf: true, anchors: true });
    return () => lenis.destroy();
  }, []);

  return null;
}
