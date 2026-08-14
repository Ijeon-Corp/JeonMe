import type { MetadataRoute } from "next";

// Perbaikan SEO (temuan audit, 15 Agustus 2026): sebelumnya tidak ada
// sitemap.xml sama sekali. Cakupan halaman marketing/statis (/, /pricing,
// /features, /login, /register) yang berlaku sama di seluruh deployment
// -- SENGAJA TIDAK menyertakan halaman kreator dinamis (jeonme.com/
// {username}) yang jumlahnya bisa ribuan & sebagian bertanda noindex
// per-halaman (lihat pages.noindex, page.go) -- itu butuh endpoint publik
// baru utk daftar username yang layak diindeks + kemungkinan
// generateSitemaps() utk multi-file kalau jumlahnya besar, cakupan
// terpisah dari perbaikan ini.
const SITE_URL = "https://jeonme.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/features`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
