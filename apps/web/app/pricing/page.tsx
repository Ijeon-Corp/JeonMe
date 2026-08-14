import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import { faqs } from "@/lib/faq-data";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";
import JsonLd from "@/components/JsonLd";
import { faqPageSchema } from "@/lib/structured-data";

// Perbaikan SEO (temuan audit, 15 Agustus 2026): sebelumnya /pricing 404
// walau ditautkan dari nav -- harga cuma section anchor (#pricing) dalam
// satu halaman /, tidak pernah dapat URL & meta description sendiri.
// Dipakai ulang komponen Pricing yang SAMA dengan homepage (sekarang
// sudah memakai harga ASLI dari getPlans(), lihat komentar di
// components/landing/Pricing.tsx) supaya tidak ada dua sumber angka
// yang bisa berbeda.
export const metadata: Metadata = {
  title: "Harga — Jeonme",
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
      <Navbar />
      <main>
        <section className="relative overflow-hidden bg-white pb-4 pt-36 md:pt-44">
          <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <span className="mb-4 inline-block rounded-full border border-primary/15 bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
              Harga
            </span>
            <h1 className="mb-4 font-heading text-4xl font-bold leading-tight text-ink sm:text-5xl">
              Harga Sederhana untuk
              <br />
              <span className="text-gradient">Setiap Tahap Pertumbuhan</span>
            </h1>
            <p className="mx-auto max-w-xl text-lg leading-relaxed text-muted">
              Mulai gratis. Upgrade ke Premium saat kamu siap memonetisasi lebih besar — tanpa biaya tersembunyi.
            </p>
          </div>
        </section>
        <Pricing showHeading={false} />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
