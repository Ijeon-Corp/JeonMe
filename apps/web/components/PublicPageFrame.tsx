import type { ReactNode } from "react";
import { CustomThemeConfig, getPageTheme } from "@/lib/page-themes";

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
// Latar netral (bg-neutral-200) DIGANTI jadi tema halaman itu sendiri yang
// diblur ala kaca -- permintaan langsung pengguna, 13 Agustus 2026: "saya
// mau buat di belakang bingkai/frame itu buat background nya sama seperti
// tema yang dipakai tetapi dibuat blurred glass". theme/customTheme jadi
// prop WAJIB (bukan opsional) supaya tidak ada pemanggil baru yang lupa
// mengisinya dan diam-diam jatuh balik ke netral. Lapisan blur dipisah dari
// kartu bingkai (bukan backdrop-blur di kartu itu sendiri) karena
// backdrop-filter butuh sesuatu YANG SUDAH DIRENDER di baliknya untuk
// diblur -- di sini justru sumbernya (theme.page) sengaja diblur DULU lewat
// filter:blur pada elemen terpisah, baru kartu solid diletakkan di atasnya,
// supaya isi kartu sendiri tetap tajam/terbaca.
//
// Dipakai SATU tempat di sini (bukan ditaruh langsung di dalam
// PagePreview.tsx) supaya TIDAK ikut membungkus pemakaian PagePreview
// lain yang sudah py sendiri pembungkusnya sendiri (mockup kartu galeri
// Quick Setup yang di-zoom+crop, panel Pratinjau Langsung dashboard yang
// sudah dalam kotak 280px) -- cuma dipasang di rute halaman publik
// sungguhan (app/[username], app/p/[slug]).
export default function PublicPageFrame({
  theme,
  customTheme,
  children,
}: {
  theme: string;
  customTheme?: CustomThemeConfig;
  children: ReactNode;
}) {
  const pageTheme = getPageTheme(theme, customTheme);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-neutral-200 sm:flex sm:items-center sm:justify-center sm:px-6 sm:py-10">
      {/* Sumber blur -- diskalakan lebih besar dari viewport supaya tepi
          hasil blur tidak pernah kelihatan pas di pinggir layar. hidden di
          bawah `sm` karena bingkai penuh layar di situ, latar ini tidak
          pernah terlihat sama sekali (buang render blur berat percuma di
          mobile, mayoritas pengunjung sungguhan). */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -inset-16 hidden scale-110 blur-3xl sm:block ${pageTheme.page}`}
        style={pageTheme.pageStyle}
      />
      {/* Tint kaca -- SENGAJA tipis (bukan 30-40% seperti percobaan awal,
          itu mencuci warna tema jadi abu-abu pucat terutama utk tema
          wallpaper foto) supaya identitas warna tema aslinya tetap
          kelihatan, cuma dilembutkan sedikit ala kaca buram. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden bg-white/10 sm:block" />

      <div className="relative mx-auto w-full max-w-[440px] overflow-hidden sm:rounded-[2.25rem] sm:border sm:border-white/40 sm:shadow-2xl">
        {children}
      </div>
    </div>
  );
}
