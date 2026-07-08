"use client";

import { useEffect } from "react";

// Mengaktifkan animasi fade-up saat elemen ber-class "reveal" masuk viewport.
// Satu observer global (bukan per-komponen) supaya ringan untuk halaman panjang.
export default function ScrollReveal() {
  useEffect(() => {
    const reveals = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
