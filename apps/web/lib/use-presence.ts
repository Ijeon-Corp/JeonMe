"use client";

import { useEffect, useState } from "react";

// usePresence -- animasi buka/tutup utk overlay (bottom sheet, modal,
// lightbox). Permintaan langsung pengguna, 25 September 2026: "untuk blok
// blok yang akan memunculkan pop up ... berikan animasi saat terbuka dan
// tertutup" + bottom nav mobile (sheet "Buat").
//
// Masalah yang diselesaikan: pola lama `{open && <Overlay/>}` membongkar
// elemen SEKETIKA saat ditutup, jadi animasi tutup mustahil. Hook ini
// memisahkan dua hal:
// - `mounted` -- elemen masih ada di DOM (tetap true selama animasi tutup)
// - `visible` -- kelas "terbuka" aktif. Dinyalakan SATU frame setelah
//   mount (double rAF) supaya transisi CSS dari keadaan awal benar-benar
//   berjalan, dan dimatikan duluan saat menutup; `mounted` baru jadi false
//   setelah `duration` ms.
// Pemakaian: render `{mounted && ...}` dan pasang kelas bergantung
// `visible` (lihat overlayClass/sheetPanelClass di bawah). Reduced motion
// sudah dinetralkan global di globals.css (durasi transisi 0.01ms), jadi
// tidak ada penanganan khusus di sini.
//
// Tidak ada setState sinkron di badan efek (aturan
// react-hooks/set-state-in-effect): perubahan `open` ditangani lewat pola
// "adjust state during render", efek hanya menjadwalkan rAF/timeout.
export function usePresence(open: boolean, duration = 220) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
    else setVisible(false);
  }

  useEffect(() => {
    if (open) {
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    if (!mounted) return;
    const timer = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(timer);
  }, [open, mounted, duration]);

  return { mounted, visible };
}

// Kelas bersama supaya semua overlay terasa satu keluarga gerak:
// latar memudar, panel naik dari bawah di ponsel (bottom sheet) dan
// membesar halus di layar lebar (dialog tengah).
export function overlayClass(visible: boolean): string {
  return `transition-opacity duration-200 ease-out ${visible ? "opacity-100" : "opacity-0"}`;
}

export function sheetPanelClass(visible: boolean): string {
  return `transition-[transform,opacity] duration-200 ease-out will-change-transform ${
    visible ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-8 opacity-0 sm:translate-y-2 sm:scale-95"
  }`;
}

export function zoomPanelClass(visible: boolean): string {
  return `transition-[transform,opacity] duration-200 ease-out will-change-transform ${visible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`;
}
