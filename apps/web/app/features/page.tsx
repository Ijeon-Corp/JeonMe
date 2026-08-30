import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Features from "@/components/landing/Features";
import ProductShowcase from "@/components/landing/ProductShowcase";
import Monetization from "@/components/landing/Monetization";
import Analytics from "@/components/landing/Analytics";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";
import FeaturesPageHero from "./FeaturesPageHero";

// Perbaikan SEO (temuan audit, 15 Agustus 2026): sebelumnya /features
// 404 walau ditautkan dari nav -- fitur cuma section anchor (#features)
// dalam satu halaman /, tidak pernah dapat URL & meta description
// sendiri yang bisa diindeks/dibagikan langsung. Halaman ini menyusun
// ulang section fitur yang SUDAH ADA (Features/ProductShowcase/
// Monetization/Analytics -- konten yang sama dipakai juga di homepage,
// bukan duplikat ditulis ulang) jadi satu halaman berdiri sendiri.
export const metadata: Metadata = {
  title: "Fitur Jeon.id",
  description:
    "Tautan tanpa batas, tema yang bisa disesuaikan penuh, dashboard analitik, jual produk digital, booking konsultasi, kumpulkan email, dan generator kode QR, semua di satu halaman bio.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <>
      <ScrollReveal />
      <Navbar />
      <main>
        <FeaturesPageHero />
        <Features showHeading={false} />
        <ProductShowcase />
        <Monetization />
        <Analytics />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
