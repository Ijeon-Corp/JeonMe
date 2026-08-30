import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import { faqs } from "@/lib/faq-data";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";
import SmoothScroll from "@/components/landing/SmoothScroll";
import JsonLd from "@/components/JsonLd";
import { faqPageSchema } from "@/lib/structured-data";
import PricingPageHero from "./PricingPageHero";

// Perbaikan SEO (temuan audit, 15 Agustus 2026): sebelumnya /pricing 404
// walau ditautkan dari nav -- harga cuma section anchor (#pricing) dalam
// satu halaman /, tidak pernah dapat URL & meta description sendiri.
// Dipakai ulang komponen Pricing yang SAMA dengan homepage (sekarang
// sudah memakai harga ASLI dari getPlans(), lihat komentar di
// components/landing/Pricing.tsx) supaya tidak ada dua sumber angka
// yang bisa berbeda.
export const metadata: Metadata = {
  title: "Harga Jeon.id",
  description:
    "Mulai gratis dengan tautan tanpa batas dan 1 Halaman Toko. Upgrade ke Premium untuk hapus watermark, latar belakang kustom, dan sampai 5 Halaman Toko.",
  alternates: { canonical: "/pricing" },
};

// dynamic = "force-dynamic" -- WAJIB, bukan opsional: image apps/web
// dibangun TERPISAH dari apps/api (docker-compose.yml, tiap service
// `build: context: .` sendiri-sendiri) -- kontainer api TIDAK reachable
// sama sekali selama `next build` berjalan. Kalau halaman ini dibiarkan
// statis (default), getPlans() di dalam Pricing.tsx akan GAGAL diam-diam
// setiap build (ditangkap .catch(() => null)), dan HTML statis yang
// dihasilkan akan mem-bakukan angka fallback SELAMANYA sampai ISR
// kebetulan re-render -- untuk halaman HARGA, ini risiko bisnis nyata
// (menampilkan angka salah), bukan cuma soal performa. force-dynamic
// membuat getPlans() dipanggil ulang di RUNTIME tiap request, saat
// kontainer api sudah pasti hidup lewat jaringan Docker Compose.
export const dynamic = "force-dynamic";

export default function PricingPage() {
  return (
    <>
      <JsonLd data={faqPageSchema(faqs)} />
      <ScrollReveal />
      <SmoothScroll />
      <Navbar />
      <main>
        <PricingPageHero />
        <Pricing showHeading={false} />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
