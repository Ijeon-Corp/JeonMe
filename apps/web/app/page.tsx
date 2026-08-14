import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import TrustedBy from "@/components/landing/TrustedBy";
import Features from "@/components/landing/Features";
import ProductShowcase from "@/components/landing/ProductShowcase";
import Monetization from "@/components/landing/Monetization";
import Templates from "@/components/landing/Templates";
import Analytics from "@/components/landing/Analytics";
import Testimonials from "@/components/landing/Testimonials";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import { faqs } from "@/lib/faq-data";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";
import JsonLd from "@/components/JsonLd";
import { faqPageSchema, organizationSchema } from "@/lib/structured-data";

// Perbaikan SEO (temuan audit, 15 Agustus 2026): schema.org Organization
// + FAQPage -- sebelumnya tidak ada structured data sama sekali.
//
// revalidate = 300 -- homepage merender section <Pricing /> yang
// memanggil getPlans() (lihat catatan lengkap soal ISOLASI BUILD-TIME di
// app/pricing/page.tsx: image apps/web dibangun tanpa apps/api reachable
// sama sekali). Homepage TIDAK dijadikan force-dynamic penuh seperti
// /pricing (mayoritas section lain di sini benar-benar statis, sayang
// kalau ikut re-render tiap request) -- ISR 5 menit cukup memastikan
// angka harga di sini terkoreksi cepat setelah deploy tanpa mengorbankan
// caching utk seluruh halaman.
export const revalidate = 300;

export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationSchema()} />
      <JsonLd data={faqPageSchema(faqs)} />
      <ScrollReveal />
      <Navbar />
      <main>
        <Hero />
        <TrustedBy />
        <Features />
        <ProductShowcase />
        <Monetization />
        <Templates />
        <Analytics />
        <Testimonials />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
