import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Features from "@/components/landing/Features";
import ProductShowcase from "@/components/landing/ProductShowcase";
import Monetization from "@/components/landing/Monetization";
import Analytics from "@/components/landing/Analytics";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";

// Perbaikan SEO (temuan audit, 15 Agustus 2026): sebelumnya /features
// 404 walau ditautkan dari nav -- fitur cuma section anchor (#features)
// dalam satu halaman /, tidak pernah dapat URL & meta description
// sendiri yang bisa diindeks/dibagikan langsung. Halaman ini menyusun
// ulang section fitur yang SUDAH ADA (Features/ProductShowcase/
// Monetization/Analytics -- konten yang sama dipakai juga di homepage,
// bukan duplikat ditulis ulang) jadi satu halaman berdiri sendiri.
export const metadata: Metadata = {
  title: "Fitur — Jeonme",
  description:
    "Tautan tanpa batas, tema yang bisa disesuaikan penuh, dashboard analitik, jual produk digital, booking konsultasi, kumpulkan email, domain kustom, dan generator kode QR — semua di satu halaman bio.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <>
      <ScrollReveal />
      <Navbar />
      <main>
        <section className="relative overflow-hidden bg-white pb-4 pt-36 md:pt-44">
          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <span className="mb-4 inline-block rounded-full border border-primary/15 bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
              Fitur
            </span>
            <h1 className="mb-4 font-heading text-4xl font-bold leading-tight text-ink sm:text-5xl">
              Semua yang Dibutuhkan Kreator,
              <br />
              <span className="text-gradient">Ada di Satu Halaman</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted">
              Dari manajemen tautan hingga monetisasi penuh — Jeonme memberimu toolkit lengkap untuk bertumbuh,
              tanpa perlu menyambungkan banyak tools terpisah.
            </p>
          </div>
        </section>
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
