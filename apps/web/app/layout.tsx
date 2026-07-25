import type { Metadata } from "next";
import {
  Inter,
  Lora,
  Merriweather,
  Montserrat,
  Playfair_Display,
  Poppins,
  Quicksand,
  Roboto_Mono,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const heading = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-heading",
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
const customPlayfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-custom-playfair" });
const customLora = Lora({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-custom-lora" });
const customMontserrat = Montserrat({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-custom-montserrat" });
const customRobotoMono = Roboto_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-custom-roboto-mono" });
const customPoppins = Poppins({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-custom-poppins" });
const customQuicksand = Quicksand({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-custom-quicksand" });
const customMerriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-custom-merriweather" });
const customSpaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-custom-space-grotesk" });

export const metadata: Metadata = {
  title: "Jeonme — Satu Link, Peluang Tanpa Batas",
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
      className={`${body.variable} ${heading.variable} ${customPlayfair.variable} ${customLora.variable} ${customMontserrat.variable} ${customRobotoMono.variable} ${customPoppins.variable} ${customQuicksand.variable} ${customMerriweather.variable} ${customSpaceGrotesk.variable} scroll-smooth`}
    >
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
