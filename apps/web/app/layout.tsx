import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "sweetalert2/dist/sweetalert2.min.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme-context";
import { LocaleProvider } from "@/lib/locale-context";

// SEMUA font di file ini di-self-host (next/font/local), TIDAK ADA lagi yang
// pakai next/font/google. Akar masalah: Quicksand lalu Space Grotesk
// (masing-masing diperbaiki terpisah sebelumnya) sama-sama gagal build --
// metadata font yang dibundel next/font/google di Next.js 16.3.0 menunjuk
// ke URL fonts.gstatic.com yang sudah dihapus di sisi Google (rotate hash
// saat font di-update di sana), next build/Docker CI butuh fetch jaringan
// ke URL basi itu tepat waktu build lalu gagal keras begitu 404. Karena
// pola yang SAMA sudah kejadian 2x di font BERBEDA tanpa peringatan
// (baru ketahuan saat build produksi gagal), 7 font custom lain diamankan
// SEKALIGUS di sini alih-alih menunggu satu per satu gagal lagi di masa
// depan. Semua file .woff2 diunduh manual dari fonts.gstatic.com (URL
// terkini, dicek lewat curl ke fonts.googleapis.com/css2) ke app/fonts/.
const body = localFont({
  src: [
    { path: "./fonts/inter-latin.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-body",
});

const heading = localFont({
  src: [
    { path: "./fonts/poppins-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/poppins-800.woff2", weight: "800", style: "normal" },
    { path: "./fonts/poppins-900.woff2", weight: "900", style: "normal" },
  ],
  display: "swap",
  variable: "--font-heading",
});

// display -- Redesign "Modern Playful Creator Platform"
// (DESIGN-JEONID-REDESIGN.md §7): Inter Tight utk heading display besar
// marketing & dashboard baru. Variable font (satu file woff2 mencakup
// weight 600-800), diunduh manual dari fonts.gstatic.com (subset latin)
// mengikuti aturan self-host di komentar atas file ini -- BUKAN
// next/font/google. Poppins (`heading` di atas) TETAP ada selama migrasi
// bertahap; halaman yang belum diredesign masih memakainya.
const displayFont = localFont({
  src: [{ path: "./fonts/inter-tight-latin.woff2", weight: "600 800", style: "normal" }],
  display: "swap",
  variable: "--font-display",
});

// No.80 (Sprint 9) + "Desain 2.0": pilihan font kustom untuk halaman publik
// kreator, di luar font aplikasi (Inter/Poppins) di atas -- daftar awalnya
// disederhanakan dari "16 pilihan font" versi Lynk.id (temuan riset) jadi 5
// pilihan, sekarang diperluas jadi 9 (tambah Poppins/Quicksand/Merriweather/
// Space Grotesk) supaya lebih variatif tanpa kembali ke seluruh 16 pilihan.
// Poppins dideklarasikan ULANG di sini (instance terpisah dari `heading` di
// atas, variable CSS beda) supaya font kustom halaman kreator TIDAK terikat
// ke font UI aplikasi Jeonme sendiri -- keduanya kebetulan sama font, tapi
// harus bisa berubah independen.
const customPlayfair = localFont({
  src: [{ path: "./fonts/playfair-latin.woff2", weight: "500 700", style: "normal" }],
  display: "swap",
  variable: "--font-custom-playfair",
});
const customLora = localFont({
  src: [{ path: "./fonts/lora-latin.woff2", weight: "400 600", style: "normal" }],
  display: "swap",
  variable: "--font-custom-lora",
});
const customMontserrat = localFont({
  src: [{ path: "./fonts/montserrat-latin.woff2", weight: "400 700", style: "normal" }],
  display: "swap",
  variable: "--font-custom-montserrat",
});
const customRobotoMono = localFont({
  src: [{ path: "./fonts/roboto-mono-latin.woff2", weight: "400 500", style: "normal" }],
  display: "swap",
  variable: "--font-custom-roboto-mono",
});
const customPoppins = localFont({
  src: [
    { path: "./fonts/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-custom-poppins",
});
const customQuicksand = localFont({
  src: [
    { path: "./fonts/quicksand-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/quicksand-latin.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-custom-quicksand",
});
const customMerriweather = localFont({
  src: [{ path: "./fonts/merriweather-latin.woff2", weight: "400 700", style: "normal" }],
  display: "swap",
  variable: "--font-custom-merriweather",
});
const customSpaceGrotesk = localFont({
  src: [
    { path: "./fonts/space-grotesk-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk-latin.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-custom-space-grotesk",
});

export const metadata: Metadata = {
  title: "Jeon.id — Satu Link, Peluang Tanpa Batas",
  description: "Platform link-in-bio dan monetisasi produk digital untuk kreator Indonesia.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${body.variable} ${heading.variable} ${displayFont.variable} ${customPlayfair.variable} ${customLora.variable} ${customMontserrat.variable} ${customRobotoMono.variable} ${customPoppins.variable} ${customQuicksand.variable} ${customMerriweather.variable} ${customSpaceGrotesk.variable} scroll-smooth`}
      suppressHydrationWarning
    >
      {/* THEME_INIT_SCRIPT -- pola standar "no-flash dark mode": jalan
          SEBELUM <body> dirender, membaca preferensi tersimpan & men-set
          atribut data-theme di <html> sebelum cat pertama browser -- lihat
          catatan lengkap di lib/theme-context.tsx. suppressHydrationWarning
          di <html> WAJIB ada berdampingan dengan skrip ini -- tanpanya
          React mencatat peringatan hydration mismatch tiap kali skrip ini
          menambah atribut data-theme sebelum React sempat merender.
          Bug ditemukan 13 September 2026 (investigasi laporan "dashboard
          2x refresh"): <script> di sini SEBELUMNYA anak LANGSUNG <html>,
          BUKAN di dalam <head> -- HTML tidak mengizinkan itu ("In HTML,
          <script> cannot be a child of <html>", error nyata di konsol
          browser tiap load), jadi parser HTML browser diam-diam
          memindahkan elemen ini ke <head> sendiri saat mem-parsing. Hasil
          parse browser jadi BEDA dari yang React kira dirender -- mismatch
          struktural tepat di root, yang membuat React kadang membuang &
          me-render ulang SELURUH pohon dari awal saat hydration (bukan
          cuma elemen ini), melipatgandakan semua efek fetch data dashboard
          di baliknya. Pola resmi Next.js 16 (node_modules/next/dist/docs/
          01-app/02-guides/preventing-flash-before-hydration.md, bagian
          "Themes") membungkus skrip ini dalam <head> eksplisit -- diikuti
          persis di sini. */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-app-bg font-body text-app-ink antialiased">
        <ThemeProvider>
          <LocaleProvider>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
