"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/locale-context";

// HalamanSayaTabs -- editor "Halaman Saya" bertab (DASHBOARD-DESIGN-JEONID.md
// §9.1: tabs Konten/Desain/Pengaturan). Secondary-navigation (§5.3
// progressive disclosure) yang MENYATUKAN tiga rute yang membentuk halaman
// publik kreator (Konten=/links, Desain=/design, SEO & Sharing=/settings/seo)
// jadi satu alur bertab -- kreator bisa berpindah antar-area tanpa balik ke
// sidebar, TANPA menggabung file editor 3000+ baris (nol risiko regresi,
// tiap rute tetap komponennya sendiri). Dirender di atas konten ketiga
// halaman itu. Aktif = cocok/awalan path (mis. /design/theme tetap
// menyalakan tab "Desain").
const TABS = [
  { href: "/dashboard/links", key: "tabContent", match: (p: string) => p === "/dashboard/links" },
  { href: "/dashboard/design", key: "design", match: (p: string) => p.startsWith("/dashboard/design") },
  { href: "/dashboard/settings/seo", key: "seoSharing", match: (p: string) => p === "/dashboard/settings/seo" },
] as const;

export default function HalamanSayaTabs() {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <div className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-app-border pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex-shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition-colors ${
              active ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"
            }`}
          >
            {t(`dashboard.nav.${tab.key}`)}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-jeon-purple" aria-hidden="true" />}
          </Link>
        );
      })}
    </div>
  );
}
