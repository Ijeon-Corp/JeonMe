import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jeonme — Satu link untuk semua yang kamu tawarkan",
  description: "Platform link-in-bio dan monetisasi produk digital untuk kreator Indonesia.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
