"use client";

import { useEffect, useRef } from "react";

// useModalA11y -- perilaku keyboard standar untuk overlay/modal, dibuat 24
// September 2026 dari temuan audit aksesibilitas.
//
// Temuannya, diukur langsung di browser: modal KYC dan Live Chat di panel
// admin sama sekali tidak memindahkan fokus saat dibuka (document
// .activeElement tetap tombol pemicu DI BELAKANG overlay), Escape tidak
// menutup, klik backdrop tidak menutup, dan setelah 8x Tab fokus sudah
// keluar dari modal ke elemen yang tertutup scrim gelap. Satu-satunya jalan
// keluar adalah mengklik tombol "Tutup" dengan mouse. Untuk modal KYC yang
// memampang foto KTP, foto selfie, dan alamat rumah, staf yang refleks
// menekan Escape akan meninggalkan PII terpampang di layar tanpa sadar.
//
// Pola yang benar sebenarnya SUDAH ada di repo ini (GlobalSearch,
// FeedbackSheet) tapi tidak pernah diangkat jadi milik bersama, jadi setiap
// modal baru mengulang dari nol -- dan mayoritas tidak mengulangnya sama
// sekali. Hook ini yang jadi milik bersama itu.
//
// Yang ditangani:
//  1. Escape menutup (listener di document, jadi bekerja di mana pun fokus
//     berada -- bukan cuma saat fokus di dalam satu input tertentu).
//  2. Fokus masuk ke modal saat dibuka: ke elemen yang ditandai
//     initialFocusRef kalau ada, kalau tidak ke elemen fokusabel pertama.
//  3. Fokus KEMBALI ke pemicu saat modal ditutup -- tanpa ini pengguna
//     keyboard terlempar ke awal halaman setiap kali menutup modal.
//  4. Focus trap: Tab dari elemen terakhir melompat ke pertama, Shift+Tab
//     dari pertama melompat ke terakhir, jadi fokus tidak pernah bocor ke
//     konten di balik scrim.
//
// SENGAJA tidak menangani klik backdrop -- itu markup per-modal (sebagian
// sudah punya, sebagian tidak) dan bukan soal keyboard.
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useModalA11y(
  open: boolean,
  onClose: () => void,
  options?: { initialFocusRef?: React.RefObject<HTMLElement | null> }
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Pemicu disimpan saat modal DIBUKA, bukan saat ditutup -- saat ditutup,
  // fokus sudah berpindah ke dalam modal yang sedang dilepas dari DOM.
  const triggerRef = useRef<HTMLElement | null>(null);
  // onClose disimpan di ref supaya efek di bawah tidak perlu memasang ulang
  // listener setiap render hanya karena pemanggil mengoper arrow function
  // baru (pola paling umum di repo ini: onClose={() => setOpen(false)}).
  // Diperbarui lewat efek, BUKAN langsung di badan render -- aturan
  // react-hooks/refs (React 19) melarang menulis ref.current saat render.
  // Efek tanpa dependency array jalan setelah SETIAP render, jadi ref ini
  // selalu memegang onClose terbaru sebelum pengguna sempat menekan tombol
  // apa pun (event keyboard baru bisa terjadi setelah commit).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement as HTMLElement | null;

    // Fokus awal ditunda satu tick: saat efek ini jalan, anak-anak modal
    // memang sudah ter-mount, tapi modal yang dirender lewat portal atau
    // yang masih menunggu animasi bisa belum terpasang di layout.
    const focusTimer = setTimeout(() => {
      const target =
        options?.initialFocusRef?.current ??
        containerRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        containerRef.current;
      target?.focus();
    }, 0);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !containerRef.current) return;

      const focusables = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // Fokus yang entah bagaimana sudah di luar modal (mis. dipindah kode
      // lain) ditarik kembali ke dalam, bukan dibiarkan berkeliaran.
      if (active && !containerRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      // Kembalikan fokus ke pemicu HANYA kalau elemennya masih ada di DOM;
      // modal yang menutup dirinya karena navigasi/penghapusan baris bisa
      // membuat pemicunya ikut hilang.
      const trigger = triggerRef.current;
      if (trigger && document.contains(trigger)) trigger.focus();
    };
    // options.initialFocusRef sengaja TIDAK jadi dependency: isinya ref yang
    // identitasnya stabil, dan memasukkannya membuat efek ini pasang-lepas
    // listener tiap render kalau pemanggil membuat objek options inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return containerRef;
}
