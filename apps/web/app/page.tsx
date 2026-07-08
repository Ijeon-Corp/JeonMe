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
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";

export default function HomePage() {
  return (
    <>
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
