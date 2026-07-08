import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
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
    <html lang="id" className={`${body.variable} ${heading.variable} scroll-smooth`}>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
