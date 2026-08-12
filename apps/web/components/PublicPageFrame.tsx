import type { ReactNode } from "react";

// PublicPageFrame -- permintaan langsung pengguna, 12 Agustus 2026
// (referensi tangkapan layar halaman Linktree sungguhan, dikonfirmasi
// lewat mockup dulu sebelum dikerjakan): "project ini lebih fokus ke
// mobile, gimana kalo hasil link nya dibuat ada border/batas seperti di
// gambar" -- BUKAN soal daftar tautan di dalamnya, tapi CONTAINER halaman
// itu sendiri. Sebelumnya latar tema (theme.page, PagePreview.tsx) melebar
// PENUH sampai tepi viewport di layar lebar -- sekarang di atas breakpoint
// `sm` (640px), seluruh halaman (avatar sampai footer) dibungkus satu
// kartu bersudut bulat + garis batas + bayangan yang mengambang di atas
// latar netral, ala bingkai HP. DI BAWAH `sm` (mayoritas pengunjung
// sungguhan -- proyek ini fokus mobile) TIDAK ada perubahan visual sama
// sekali -- bingkai otomatis penuh layar karena lebar viewport < lebar
// maksimal bingkai (max-w-[440px]).
//
// Dipakai SATU tempat di sini (bukan ditaruh langsung di dalam
// PagePreview.tsx) supaya TIDAK ikut membungkus pemakaian PagePreview
// lain yang sudah py sendiri pembungkusnya sendiri (mockup kartu galeri
// Quick Setup yang di-zoom+crop, panel Pratinjau Langsung dashboard yang
// sudah dalam kotak 280px) -- cuma dipasang di rute halaman publik
// sungguhan (app/[username], app/p/[slug]).
export default function PublicPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-neutral-200 sm:flex sm:items-center sm:justify-center sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-[440px] overflow-hidden sm:rounded-[2.25rem] sm:border sm:border-black/10 sm:shadow-2xl">
        {children}
      </div>
    </div>
  );
}
