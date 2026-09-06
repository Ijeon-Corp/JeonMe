// Page metadata registry (JEONID-DASHBOARD-REDESIGN-SPEC.md §6.6, Phase 1).
// SATU sumber kebenaran untuk: judul topbar, breadcrumb, active navigation,
// command palette, dan label page-view analytics. Menggantikan (bertahap)
// currentPageLabel + EXTRA_PAGE_LABELS di app/dashboard/layout.tsx -- layout
// lama TETAP jalan sampai shell Phase 2; registry ini mulai dipakai komponen
// baru lebih dulu.
//
// titleKey/parentKey = key dictionary i18n (bukan teks) supaya judul ikut
// locale. domain dipakai topbar kontekstual (§6.5: pil publish & chip URL
// publik hanya tampil di domain "page").
export type DashboardDomain =
  | "home"
  | "page"
  | "sales"
  | "marketing"
  | "analytics"
  | "finance"
  | "integration"
  | "team"
  | "settings";

export type DashboardPageMeta = {
  match: string | RegExp;
  titleKey: string;
  parentKey?: string;
  descriptionKey?: string;
  domain: DashboardDomain;
};

// Urutan PENTING: entri lebih spesifik di atas; pencarian first-match.
// Route = kenyataan existing (DASHBOARD-CURRENT-STATE.md §7); label target
// spec §5.2 dipetakan lewat dictionary, route TIDAK berubah.
export const DASHBOARD_PAGE_REGISTRY: DashboardPageMeta[] = [
  // Halaman Saya (domain "page" -- topbar kontekstual publish/URL)
  { match: "/dashboard/links", titleKey: "dashboard.nav.linkBlock", parentKey: "dashboard.nav.myPageGroup", domain: "page" },
  { match: /^\/dashboard\/design(\/|$)/, titleKey: "dashboard.nav.design", parentKey: "dashboard.nav.myPageGroup", domain: "page" },
  { match: "/dashboard/settings/seo", titleKey: "dashboard.nav.seoSharing", parentKey: "dashboard.nav.myPageGroup", domain: "page" },
  { match: "/dashboard/quick-setup", titleKey: "dashboard.nav.quickSetup", parentKey: "dashboard.nav.myPageGroup", domain: "page" },
  { match: "/dashboard/import", titleKey: "dashboard.nav.import", parentKey: "dashboard.nav.myPageGroup", domain: "page" },

  // Jualan (spec §5: "Produk & Penjualan" -> "Jualan")
  { match: "/dashboard/products", titleKey: "dashboard.nav.sales", domain: "sales" },
  { match: "/dashboard/courses", titleKey: "dashboard.extraPages.courses", parentKey: "dashboard.nav.sales", domain: "sales" },
  { match: "/dashboard/events", titleKey: "dashboard.extraPages.events", parentKey: "dashboard.nav.sales", domain: "sales" },
  { match: "/dashboard/donation", titleKey: "dashboard.extraPages.donation", parentKey: "dashboard.nav.sales", domain: "sales" },
  { match: "/dashboard/monetisasi", titleKey: "dashboard.nav.productsMonetization", parentKey: "dashboard.nav.sales", domain: "sales" },

  // Marketing (spec §5: voucher/bundel/affiliate/loyalty/social-proof pindah konseptual)
  { match: "/dashboard/audience", titleKey: "dashboard.nav.marketingAudience", parentKey: "dashboard.nav.marketing", domain: "marketing" },
  { match: "/dashboard/business-card", titleKey: "dashboard.nav.contactCard", parentKey: "dashboard.nav.marketing", domain: "marketing" },
  { match: "/dashboard/social-proof", titleKey: "dashboard.nav.socialProof", parentKey: "dashboard.nav.marketing", domain: "marketing" },
  { match: "/dashboard/vouchers", titleKey: "dashboard.extraPages.vouchers", parentKey: "dashboard.nav.marketing", domain: "marketing" },
  { match: "/dashboard/bundles", titleKey: "dashboard.extraPages.bundles", parentKey: "dashboard.nav.marketing", domain: "marketing" },
  { match: "/dashboard/affiliates", titleKey: "dashboard.extraPages.affiliates", parentKey: "dashboard.nav.marketing", domain: "marketing" },
  { match: "/dashboard/brand", titleKey: "dashboard.extraPages.brand", parentKey: "dashboard.nav.marketing", domain: "marketing" },

  // Analitik
  { match: "/dashboard/statistik", titleKey: "dashboard.nav.analytics", domain: "analytics" },

  // Keuangan
  { match: "/dashboard/balance", titleKey: "dashboard.nav.balance", parentKey: "dashboard.nav.finance", domain: "finance" },
  { match: "/dashboard/settings/payment", titleKey: "dashboard.nav.bankAccounts", parentKey: "dashboard.nav.finance", domain: "finance" },
  { match: "/dashboard/kyc", titleKey: "dashboard.extraPages.kycVerification", parentKey: "dashboard.nav.finance", domain: "finance" },

  // Integrasi
  { match: "/dashboard/analytics", titleKey: "dashboard.nav.analyticsPixels", parentKey: "dashboard.nav.integrations", domain: "integration" },
  { match: "/dashboard/social-connect", titleKey: "dashboard.nav.socialConnect", parentKey: "dashboard.nav.integrations", domain: "integration" },

  // Tim
  { match: "/dashboard/team", titleKey: "dashboard.nav.membersRoles", parentKey: "dashboard.nav.team", domain: "team" },

  // Pengaturan (sub-halaman lebih spesifik SEBELUM hub)
  { match: "/dashboard/settings/profile", titleKey: "dashboard.extraPages.profileAccount", parentKey: "dashboard.nav.settings", domain: "settings" },
  { match: "/dashboard/settings/security", titleKey: "dashboard.extraPages.security", parentKey: "dashboard.nav.settings", domain: "settings" },
  { match: "/dashboard/settings/subscription", titleKey: "dashboard.extraPages.subscription", parentKey: "dashboard.nav.settings", domain: "settings" },
  { match: "/dashboard/settings/danger-zone", titleKey: "dashboard.extraPages.dangerZone", parentKey: "dashboard.nav.settings", domain: "settings" },
  { match: "/dashboard/settings", titleKey: "dashboard.nav.settings", domain: "settings" },

  // Lain-lain
  { match: "/dashboard/tutorial", titleKey: "dashboard.extraPages.tutorial", domain: "home" },
  { match: "/dashboard/help", titleKey: "dashboard.extraPages.help", domain: "home" },
  { match: "/dashboard", titleKey: "dashboard.nav.overview", domain: "home" },
];

export function getDashboardPageMeta(pathname: string): DashboardPageMeta | undefined {
  return DASHBOARD_PAGE_REGISTRY.find((m) =>
    typeof m.match === "string" ? m.match === pathname : m.match.test(pathname)
  );
}
