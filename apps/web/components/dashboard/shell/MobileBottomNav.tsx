"use client";

import Link from "next/link";
import { IconChart, IconGrid, IconLink, IconShoppingBag, IconWallet } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

// MobileBottomNav -- bottom navigation dashboard di layar < md. Permintaan
// langsung pengguna, 25 September 2026: "buatkan bottom menu untuk mobile
// yang berisi menu menu penting yang akan paling sering digunakan", lalu
// dipertegas "maksudnya bottom navigation bukan bottom menu" -- jadi
// SEMUA slot adalah tujuan langsung (satu ketukan = pindah halaman), tanpa
// tombol yang membuka menu/panel.
//
// SEBELUMNYA slot kelima "Menu" membuka drawer yang SAMA dgn tombol ☰ di
// header mobile (dobel). Diganti "Saldo" -- tempat kreator mengecek
// pendapatan & menarik dana, yang sebelumnya cuma terjangkau lewat drawer.
// Menu lengkap tetap lewat ☰ di header.
type NavItem = { key: string; href: string; icon: typeof IconChart; match: (p: string) => boolean };

const NAV: NavItem[] = [
  { key: "bottomHome", href: "/dashboard", icon: IconGrid, match: (p) => p === "/dashboard" },
  {
    key: "bottomPage",
    href: "/dashboard/links",
    icon: IconLink,
    match: (p) => p === "/dashboard/links" || p.startsWith("/dashboard/design") || p === "/dashboard/settings/seo",
  },
  {
    key: "bottomSales",
    href: "/dashboard/products",
    icon: IconShoppingBag,
    match: (p) => ["/dashboard/products", "/dashboard/courses", "/dashboard/events", "/dashboard/donation"].some((b) => p === b || p.startsWith(`${b}/`)),
  },
  {
    key: "bottomBalance",
    href: "/dashboard/balance",
    icon: IconWallet,
    match: (p) => p === "/dashboard/balance" || p === "/dashboard/settings/payment",
  },
  { key: "bottomAnalytics", href: "/dashboard/statistik", icon: IconChart, match: (p) => p === "/dashboard/statistik" },
];

export default function MobileBottomNav({ pathname }: { pathname: string }) {
  const { t } = useLocale();
  return (
    <nav
      aria-label={t("dashboard.nav.overview")}
      className="nav-glass fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-app-border pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = item.match(pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-semibold transition-colors ${
              active ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"
            }`}
          >
            {/* Indikator aktif berupa pil di belakang ikon (bukan cuma warna
                teks) -- lebih mudah dikenali sekilas di layar kecil. */}
            <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 ${active ? "bg-jeon-lavender/70" : ""}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span>{t(`dashboard.nav.${item.key}`)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
