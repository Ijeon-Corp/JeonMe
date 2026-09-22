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

// creatorProfileSchema -- susulan 22 September 2026 (benchmark kompetitor:
// Linktree menyertakan structured data di tiap halaman kreator, jeon.id
// belum -- lihat catatan lengkap di app/[username]/page.tsx). Bentuk
// "ProfilePage" berisi Person adalah pola resmi Google untuk halaman
// profil publik (developers.google.com/search/docs/appearance/
// structured-data/profile-page) -- BUKAN Organization (itu utk brand
// jeon.id sendiri di homepage, sudah ada di organizationSchema di atas).
// `sameAs` -- daftar URL profil sosial kreator, dipakai Google utk
// menghubungkan entitas "orang" yang sama lintas platform (mis. dedup
// hasil pencarian) -- SENGAJA dibangun ulang dari `buildFilledSocialLinks`
// yang SUDAH ada (lib/social-links.ts, satu-satunya sumber kebenaran
// normalisasi handle->URL, dipakai render publik & editor dashboard),
// bukan menduplikasi logikanya di sini.
export function creatorProfileSchema(page: {
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  sameAs: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: page.displayName,
      alternateName: `@${page.username}`,
      description: page.bio || undefined,
      image: page.avatarUrl || undefined,
      url: `${SITE_URL}/${page.username}`,
      sameAs: page.sameAs.length > 0 ? page.sameAs : undefined,
    },
  };
}
