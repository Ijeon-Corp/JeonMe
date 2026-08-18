import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Perbaikan SEO (temuan audit, 15 Agustus 2026): melengkapi sitemap.ts di
// atas -- rute privat/aplikasi (dashboard, admin, auth callback, API
// proxy, halaman checkout per-transaksi) tidak punya nilai buat hasil
// pencarian & sebagian memuat data pribadi, jadi dikecualikan dari
// crawling. TIDAK menambahkan aturan khusus AI-training (mis. blokir
// GPTBot) -- itu keputusan kebijakan/bisnis di luar cakupan perbaikan
// teknis ini, biarkan default (diizinkan) sampai ada keputusan eksplisit.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/admin/", "/auth/", "/api/", "/checkout/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
