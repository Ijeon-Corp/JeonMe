// structured-data.ts -- perbaikan SEO (temuan audit, 15 Agustus 2026):
// helper builder schema.org, dipakai lewat components/JsonLd.tsx. Cuma
// Organization + FAQPage sesuai rekomendasi audit -- data FAQ diimpor
// dari components/landing/FAQ.tsx (satu sumber kebenaran, lihat
// komentar di sana), TIDAK disalin ulang di sini.
import type { FaqItem } from "@/lib/faq-data";
import { SITE_URL } from "@/lib/site";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Jeon.id",
    url: SITE_URL,
    logo: `${SITE_URL}/logo-baru.png`,
    description: "Platform link-in-bio dan monetisasi produk digital untuk kreator Indonesia.",
  };
}

export function faqPageSchema(faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}
