"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/locale-context";
import { dashRedesignEnabled } from "@/lib/dashboard-flags";

// Segment layout /dashboard/settings/* -- subnav kiri Pengaturan
// (JEONID-DASHBOARD-REDESIGN-SPEC.md §20.1, Phase 7, flag "settings").
// Satu file, NOL edit per-halaman: subpage settings otomatis dapat rail
// navigasi kiri di desktop (lg+; di bawahnya subnav jadi baris pill
// horizontal scroll). DIKECUALIKAN: hub /settings (punya grid kartunya
// sendiri) dan /settings/seo (milik domain Halaman Saya -- pakai
// HalamanSayaTabs, bukan subnav Pengaturan; tetap terdaftar di subnav
// sebagai tautan keluar sesuai §20.1). KYC & Rekening juga terjangkau dari
// grup Keuangan sidebar; subnav ini melengkapi, bukan menggantikan.
function buildSettingsNav(t: (key: string) => string) {
  return [
    { href: "/dashboard/settings/profile", label: t("dashboard.extraPages.profileAccount") },
    { href: "/dashboard/settings/security", label: t("dashboard.extraPages.security") },
    { href: "/dashboard/settings/subscription", label: t("dashboard.extraPages.subscription") },
    { href: "/dashboard/settings/payment", label: t("dashboard.nav.bankAccounts") },
    { href: "/dashboard/settings/seo", label: t("dashboard.nav.seoSharing") },
    { href: "/dashboard/settings/danger-zone", label: t("dashboard.extraPages.dangerZone"), danger: true },
  ];
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const settingsV2 = dashRedesignEnabled("settings");

  // Hub & SEO dirender apa adanya (lihat catatan di atas).
  if (!settingsV2 || pathname === "/dashboard/settings" || pathname === "/dashboard/settings/seo") {
    return <>{children}</>;
  }

  const items = buildSettingsNav(t);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 lg:flex-row lg:items-start">
      <nav
        aria-label={t("dashboard.nav.settings")}
        className="flex gap-1 overflow-x-auto lg:w-44 lg:flex-shrink-0 lg:flex-col lg:gap-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "bg-jeon-purple/10 text-jeon-purple"
                  : item.danger
                    ? "text-red-600 hover:bg-red-50"
                    : "text-app-muted hover:bg-app-surface-2 hover:text-app-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
