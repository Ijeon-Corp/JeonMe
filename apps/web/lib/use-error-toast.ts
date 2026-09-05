"use client";

import { useEffect, useRef } from "react";

// useErrorToast -- permintaan langsung pengguna, 5 September 2026: "buat
// semua pesan error itu toast di tengah jangan tampil di atas karna tidak
// terlihat". SEBELUMNYA ~44 halaman menampilkan error API sbg <p> inline di
// posisi TETAP dekat atas halaman (mis. "Tautan ini terindikasi judi
// online..." di dashboard/links/page.tsx) -- kalau pengguna sudah scroll ke
// bawah (form tambah-tautan/tambah-blok bisa ratusan baris JSX di bawah
// error <p> itu), pesan itu ter-render DI LUAR viewport dan tidak pernah
// terlihat sama sekali -- tidak ada scrollIntoView apa pun yang
// membawanya ke pandangan (dikonfirmasi lewat pencarian, nol hasil).
//
// SweetAlert2 SUDAH jadi dependency (lib/confirm.ts, dipakai utk dialog
// konfirmasi) -- dipakai ulang di sini lewat mode toast, position:"center"
// supaya SELALU muncul di tengah viewport TERLEPAS dari posisi scroll,
// bukan menciptakan mekanisme baru. import("sweetalert2") DINAMIS, alasan
// sama persis seperti confirm.ts (hindari ~50-80KB ikut ter-bundle di
// initial load halaman yang belum tentu pernah menampilkan error).
//
// Dipasang di halaman yang sudah punya state `error` (string | null) --
// begitu terisi, otomatis muncul sbg toast. Render inline lama (`{error &&
// <p>...}`) dihapus di tiap halaman yang memasang hook ini -- hook ini
// GANTI cara menampilkan, bukan tambahan di samping yang lama (kalau
// dibiarkan dobel, tetap ada sesuatu yang nongol di atas seperti keluhan
// awal). lastShown mencegah toast dobel kalau `error` di-set ulang ke
// STRING YANG SAMA (re-render tanpa perubahan pesan sungguhan).
export function useErrorToast(message: string | null | undefined) {
  const lastShown = useRef<string | null>(null);

  useEffect(() => {
    if (!message) {
      lastShown.current = null;
      return;
    }
    if (message === lastShown.current) return;
    lastShown.current = message;

    let cancelled = false;
    import("sweetalert2").then(({ default: Swal }) => {
      if (cancelled) return;
      Swal.fire({
        toast: true,
        position: "center",
        icon: "error",
        title: message,
        showConfirmButton: false,
        timer: 4000,
        timerProgressBar: true,
        buttonsStyling: false,
        // backdrop:false -- ditemukan pengguna 5 September 2026 (bar hitam
        // besar di belakang toast): globals.css punya aturan
        // `.swal2-backdrop-show { background: ... !important }` yang
        // ditulis utk dialog konfirmasi (confirmDelete/confirmAction di
        // lib/confirm.ts, MEMANG butuh backdrop gelap). !important itu
        // mengalahkan aturan bawaan SweetAlert2 sendiri yang seharusnya
        // membuat backdrop toast transparan (toast:true harusnya tidak
        // pernah menggelapkan halaman). backdrop:false eksplisit di sini
        // mencegah kelas swal2-backdrop-show itu terpasang sama sekali,
        // jadi aturan !important di globals.css tidak pernah kena.
        backdrop: false,
        customClass: { popup: "rounded-2xl" },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [message]);
}
