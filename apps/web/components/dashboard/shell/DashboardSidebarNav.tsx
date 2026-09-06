"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/locale-context";
import {
  IconBell,
  IconBook,
  IconBriefcase,
  IconBox,
  IconCalendar,
  IconChart,
  IconChevronRight,
  IconExternal,
  IconGift,
  IconGlobe,
  IconGrid,
  IconHeart,
  IconInbox,
  IconLink,
  IconMail,
  IconPaintbrush,
  IconPhone,
  IconPlayCircle,
  IconSearch,
  IconSettings,
  IconShield,
  IconShoppingBag,
  IconSparkle,
  IconStar,
  IconTag,
  IconUpload,
  IconUsers,
  IconWallet,
} from "@/components/icons";

// Sidebar navigasi v2 -- IA target JEONID-DASHBOARD-REDESIGN-SPEC.md §5/§6.4
// (Phase 2 Shell). Perubahan dari v1: "Produk & Penjualan" -> "Jualan" dengan
// leaf Ringkasan/Produk/Pesanan (adapter ?tab= di /products), grup baru
// "Marketing" (Audiens/Broadcast/Voucher/Bundel/Affiliate/Loyalitas/Social
// Proof), Quick Setup & Import di bawah sublabel "Tools", TANPA badge
// "Segera" permanen (§5.1 -- roadmap jadi contextual card, bukan disabled
// leaf), satu accordion terbuka pada satu waktu (§6.4), upgrade card +
// Bantuan di bawah. SEMUA route existing dipertahankan (§5.2); Kartu Kontak
// tetap punya entry point (aturan §0.4: fitur tak boleh hilang karena tak
// ada di mockup).
//
// Leaf ber-query (Ringkasan/Produk/Pesanan, Audiens/Broadcast) butuh
// useSearchParams untuk state aktif -- dibungkus Suspense (aturan Next:
// lihat node_modules/next/dist/docs use-search-params); fallback merender
// nav yang sama tanpa disambiguasi query (aman hydration).
type IconComponent = (p: { className?: string }) => React.ReactElement;

type NavLeafV2 = {
  href: string;
  label: string;
  icon: IconComponent;
  // Query yang harus cocok supaya leaf ini aktif (mis. {tab:"items"}).
  // Leaf tanpa query aktif berdasarkan pathname (+ prefix opsional).
  query?: Record<string, string>;
  matchPrefix?: boolean;
};

export type NavEntryV2 =
  | ({ kind: "link" } & NavLeafV2)
  | { kind: "group"; label: string; icon: IconComponent; landing: string; items: (NavLeafV2 | { kind: "sublabel"; label: string })[] }
  | { kind: "divider" };

export function buildNavItemsV2(t: (key: string) => string): NavEntryV2[] {
  return [
    { kind: "link", href: "/dashboard", label: t("dashboard.nav.overview"), icon: IconChart },
    {
      kind: "group",
      label: t("dashboard.nav.myPageGroup"),
      icon: IconGrid,
      landing: "/dashboard/links",
      items: [
        { href: "/dashboard/links", label: t("dashboard.nav.tabContent"), icon: IconLink },
        { href: "/dashboard/design", label: t("dashboard.nav.design"), icon: IconPaintbrush, matchPrefix: true },
        { href: "/dashboard/settings/seo", label: t("dashboard.nav.seoSharing"), icon: IconSearch },
        { kind: "sublabel", label: t("dashboard.nav.toolsLabel") },
        { href: "/dashboard/quick-setup", label: t("dashboard.nav.quickSetup"), icon: IconSparkle },
        { href: "/dashboard/import", label: t("dashboard.nav.import"), icon: IconUpload },
      ],
    },
    {
      kind: "group",
      label: t("dashboard.nav.sales"),
      icon: IconShoppingBag,
      landing: "/dashboard/products?tab=overview",
      items: [
        { href: "/dashboard/products?tab=overview", label: t("dashboard.nav.salesOverview"), icon: IconChart, query: { tab: "overview" } },
        { href: "/dashboard/products?tab=items", label: t("dashboard.nav.salesProducts"), icon: IconBox, query: { tab: "items" } },
        { href: "/dashboard/products?tab=transactions", label: t("dashboard.nav.salesOrders"), icon: IconInbox, query: { tab: "transactions" } },
        { href: "/dashboard/courses", label: t("dashboard.extraPages.courses"), icon: IconBook },
        { href: "/dashboard/events", label: t("dashboard.extraPages.events"), icon: IconCalendar },
        { href: "/dashboard/donation", label: t("dashboard.extraPages.donation"), icon: IconHeart },
      ],
    },
    {
      kind: "group",
      label: t("dashboard.nav.marketing"),
      icon: IconStar,
      landing: "/dashboard/audience?view=contacts",
      items: [
        { href: "/dashboard/audience?view=contacts", label: t("dashboard.nav.marketingAudience"), icon: IconInbox, query: { view: "contacts" } },
        { href: "/dashboard/audience?view=broadcast", label: t("dashboard.nav.marketingBroadcast"), icon: IconMail, query: { view: "broadcast" } },
        { href: "/dashboard/business-card", label: t("dashboard.nav.contactCard"), icon: IconPhone },
        { href: "/dashboard/vouchers", label: t("dashboard.extraPages.vouchers"), icon: IconTag },
        { href: "/dashboard/bundles", label: t("dashboard.extraPages.bundles"), icon: IconGift },
        { href: "/dashboard/affiliates", label: t("dashboard.extraPages.affiliates"), icon: IconUsers },
        { href: "/dashboard/brand", label: t("dashboard.extraPages.brand"), icon: IconBriefcase },
        { href: "/dashboard/social-proof", label: t("dashboard.nav.socialProof"), icon: IconBell },
      ],
    },
    { kind: "link", href: "/dashboard/statistik", label: t("dashboard.nav.analytics"), icon: IconChart },
    {
      kind: "group",
      label: t("dashboard.nav.finance"),
      icon: IconWallet,
      landing: "/dashboard/balance",
      items: [
        { href: "/dashboard/balance", label: t("dashboard.nav.balance"), icon: IconWallet },
        { href: "/dashboard/settings/payment", label: t("dashboard.nav.bankAccounts"), icon: IconWallet },
        { href: "/dashboard/kyc", label: t("dashboard.extraPages.kycVerification"), icon: IconShield },
      ],
    },
    { kind: "divider" },
    {
      kind: "group",
      label: t("dashboard.nav.integrations"),
      icon: IconGlobe,
      landing: "/dashboard/analytics",
      items: [
        { href: "/dashboard/analytics", label: t("dashboard.nav.analyticsPixels"), icon: IconChart },
        { href: "/dashboard/social-connect", label: t("dashboard.nav.socialConnect"), icon: IconExternal },
      ],
    },
    { kind: "link", href: "/dashboard/team", label: t("dashboard.nav.team"), icon: IconUsers },
    { kind: "link", href: "/dashboard/settings", label: t("dashboard.nav.settings"), icon: IconSettings },
  ];
}

function leafActive(leaf: NavLeafV2, pathname: string, search: URLSearchParams | null): boolean {
  const basePath = leaf.href.split("?")[0];
  const pathMatch = leaf.matchPrefix ? pathname.startsWith(basePath) : pathname === basePath;
  if (!pathMatch) return false;
  if (!leaf.query) return true;
  // Tanpa info query (fallback Suspense): jangan klaim aktif -- grup tetap
  // menyala lewat pathMatch di groupHasActive.
  if (!search) return false;
  // Default query saat param absen (deep-link lama tanpa query tetap
  // menyalakan leaf default): /products -> tab=overview, /audience ->
  // view=contacts.
  const DEFAULTS: Record<string, string> = { tab: "overview", view: "contacts" };
  return Object.entries(leaf.query).every(([k, v]) => (search.get(k) ?? DEFAULTS[k] ?? "") === v);
}

function NavList({
  pathname,
  search,
  expandedGroups,
  onToggleGroup,
  onNavigate,
}: {
  pathname: string;
  search: URLSearchParams | null;
  expandedGroups: Set<string>;
  onToggleGroup: (label: string) => void;
  onNavigate: () => void;
}) {
  const { t } = useLocale();
  const items = buildNavItemsV2(t);
  return (
    <nav className="mt-6 flex flex-col gap-0.5 text-xs">
      {items.map((item, idx) => {
        if (item.kind === "divider") {
          return <div key={`div-${idx}`} className="my-2.5 h-px bg-white/10" aria-hidden="true" />;
        }
        if (item.kind === "link") {
          const active = leafActive(item, pathname, search);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 font-semibold transition-all ${
                active
                  ? "border-brand-500 bg-brand-500/25 text-white"
                  : "border-transparent text-white/55 hover:bg-white/5 hover:text-white/85"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        }

        const groupHasActive = item.items.some((sub) => {
          if ("kind" in sub) return false;
          const base = sub.href.split("?")[0];
          return sub.matchPrefix ? pathname.startsWith(base) : pathname === base;
        });
        const expanded = expandedGroups.has(item.label);
        const GroupIcon = item.icon;
        return (
          <div key={item.label}>
            <button
              type="button"
              onClick={() => onToggleGroup(item.label)}
              aria-expanded={expanded}
              className={`flex w-full items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left font-semibold transition-all ${
                groupHasActive
                  ? "border-transparent bg-brand-lavender/15 text-white"
                  : "border-transparent text-white/60 hover:bg-white/5 hover:text-white/90"
              }`}
            >
              <GroupIcon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              <IconChevronRight
                className={`h-3.5 w-3.5 flex-shrink-0 text-white/40 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            </button>
            {expanded && (
              <div className="mb-1 ml-3.5 mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-2">
                {item.items.map((sub) => {
                  if ("kind" in sub) {
                    return (
                      <p key={sub.label} className="px-3 pb-0.5 pt-2 text-[9px] font-extrabold uppercase tracking-widest text-white/50">
                        {sub.label}
                      </p>
                    );
                  }
                  const active = leafActive(sub, pathname, search);
                  const Icon = sub.icon;
                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-1.5 font-semibold transition-all ${
                        active
                          ? "border-brand-500 bg-brand-500/25 text-white"
                          : "border-transparent text-white/50 hover:bg-white/5 hover:text-white/85"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function NavListWithQuery(props: Omit<Parameters<typeof NavList>[0], "search">) {
  const search = useSearchParams();
  return <NavList {...props} search={search} />;
}

export default function DashboardSidebarNav(props: {
  pathname: string;
  expandedGroups: Set<string>;
  onToggleGroup: (label: string) => void;
  onNavigate: () => void;
}) {
  return (
    <Suspense fallback={<NavList {...props} search={null} />}>
      <NavListWithQuery {...props} />
    </Suspense>
  );
}

// Kartu upgrade + Bantuan (spec §6.4 #13-14) -- di bawah nav, hanya
// non-Premium yang melihat kartu upgrade. Benefit dijelaskan (aturan §8.10:
// "selalu jelaskan benefit, bukan hanya Premium").
export function SidebarFooterV2({ isPremium, onNavigate }: { isPremium: boolean; onNavigate: () => void }) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-2">
      {!isPremium && (
        <Link
          href="/dashboard/settings/subscription"
          onClick={onNavigate}
          className="block rounded-2xl bg-dash-sidebar-surface p-3.5 transition-colors hover:bg-white/10"
        >
          <p className="flex items-center gap-1.5 text-xs font-bold text-white">
            <IconSparkle className="h-3.5 w-3.5 text-brand-lime" />
            {t("dashboard.nav.upgradeTitle")}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/55">{t("dashboard.nav.upgradeDesc")}</p>
          <p className="mt-2 text-[11px] font-bold text-brand-lavender">{t("dashboard.nav.upgradeCta")} →</p>
        </Link>
      )}
      <Link
        href="/dashboard/help"
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-white/55 hover:bg-white/5 hover:text-white/85"
      >
        <IconPlayCircle className="h-4 w-4 flex-shrink-0" />
        {t("dashboard.nav.help")}
      </Link>
    </div>
  );
}

// Rail ikon v2 (tablet 768-1279, §6.2): group -> landing default domain.
export function buildRailItemsV2(t: (key: string) => string): { href: string; label: string; icon: IconComponent; matchPrefixes: string[] }[] {
  return [
    { href: "/dashboard", label: t("dashboard.nav.overview"), icon: IconChart, matchPrefixes: ["/dashboard"] },
    { href: "/dashboard/links", label: t("dashboard.nav.myPageGroup"), icon: IconGrid, matchPrefixes: ["/dashboard/links", "/dashboard/design", "/dashboard/settings/seo", "/dashboard/quick-setup", "/dashboard/import"] },
    { href: "/dashboard/products?tab=overview", label: t("dashboard.nav.sales"), icon: IconShoppingBag, matchPrefixes: ["/dashboard/products", "/dashboard/courses", "/dashboard/events", "/dashboard/donation"] },
    { href: "/dashboard/audience?view=contacts", label: t("dashboard.nav.marketing"), icon: IconStar, matchPrefixes: ["/dashboard/audience", "/dashboard/business-card", "/dashboard/vouchers", "/dashboard/bundles", "/dashboard/affiliates", "/dashboard/social-proof"] },
    { href: "/dashboard/statistik", label: t("dashboard.nav.analytics"), icon: IconChart, matchPrefixes: ["/dashboard/statistik"] },
    { href: "/dashboard/balance", label: t("dashboard.nav.finance"), icon: IconWallet, matchPrefixes: ["/dashboard/balance", "/dashboard/settings/payment", "/dashboard/kyc"] },
    { href: "/dashboard/analytics", label: t("dashboard.nav.integrations"), icon: IconGlobe, matchPrefixes: ["/dashboard/analytics", "/dashboard/social-connect"] },
    { href: "/dashboard/team", label: t("dashboard.nav.team"), icon: IconUsers, matchPrefixes: ["/dashboard/team"] },
    { href: "/dashboard/settings", label: t("dashboard.nav.settings"), icon: IconSettings, matchPrefixes: ["/dashboard/settings"] },
  ];
}
