"use client";

import { useEffect } from "react";

// Mengaktifkan animasi fade-up saat elemen ber-class "reveal" masuk viewport.
// Satu observer global (bukan per-komponen) supaya ringan untuk halaman panjang.
//
// Perbaikan bug (dilaporkan pengguna, 31 Agustus 2026: "ada beberapa section
// yang masih bug ketika scroll kebawah tidak ke load"): versi lama menjalankan
// querySelectorAll(".reveal") SEKALI saat mount -- elemen .reveal yang baru
// muncul SETELAH momen itu (komponen client yang hidrasinya belakangan, atau
// kartu baru hasil klik filter Templates yang me-render node DOM baru) tidak
// pernah diobservasi, jadi selamanya tertahan di opacity:0 (kelas .visible
// tidak pernah ditambahkan). Sekarang MutationObserver memantau penambahan
// node di body dan mendaftarkan elemen .reveal baru ke IntersectionObserver
// yang sama -- observer.observe() pada target yang sudah terdaftar adalah
// no-op sesuai spec, jadi aman dipanggil berulang tanpa deduplikasi manual.
export default function ScrollReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    const observeAll = () => {
      document.querySelectorAll(".reveal:not(.visible)").forEach((el) => io.observe(el));
    };
    observeAll();

    const mo = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.addedNodes.length > 0)) observeAll();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
