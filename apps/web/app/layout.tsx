import type { Metadata } from "next";
import { Inter, Lora, Montserrat, Playfair_Display, Poppins, Roboto_Mono } from "next/font/google";
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

// No.80 (Sprint 9): pilihan font kustom untuk halaman publik kreator, di
// luar font aplikasi (Inter/Poppins) di atas -- daftar disederhanakan dari
// "16 pilihan font" versi Lynk.id (temuan riset) jadi 5 pilihan yang cukup
// beda karakter (serif elegan, sans modern, monospace) supaya tetap
// bermakna tanpa membengkakkan ukuran font yang di-preload.
const customPlayfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-custom-playfair" });
const customLora = Lora({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-custom-lora" });
const customMontserrat = Montserrat({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-custom-montserrat" });
const customRobotoMono = Roboto_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-custom-roboto-mono" });

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
      className={`${body.variable} ${heading.variable} ${customPlayfair.variable} ${customLora.variable} ${customMontserrat.variable} ${customRobotoMono.variable} scroll-smooth`}
    >
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
