"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/locale-context";
import { dashRedesignEnabled } from "@/lib/dashboard-flags";

// Route group (monetisasi) -- permintaan langsung pengguna, 10 Agustus
// 2026: "semua yang ada di produk dan monetisasi itu dibuat jadi tab saja
// bukan menumpuk". SEBELUMNYA /dashboard/monetisasi adalah hub (search +
// 8 kartu) yang masing-masing LINK KELUAR ke halaman penuh terpisah --
// pola beda dari Toko (/dashboard/products) yang sudah pakai tab internal
// (Overview/Manage Items/dst). Nama folder route group diapit tanda kurung
// SENGAJA -- konvensi Next.js App Router supaya folder ini TIDAK ikut jadi
// bagian URL: 8 halaman fitur + hub tetap persis di /dashboard/vouchers,
// /dashboard/donation, dst (bookmark, tautan EXTRA_PAGE_LABELS di
// dashboard/layout.tsx, dan seluruh E2E yang goto() langsung ke URL itu
// TIDAK ada yang berubah) -- yang berubah CUMA sekarang berbagi satu
// bilah tab di atas, jadi pindah antar-tipe monetisasi instan (navigasi
// client-side Next.js, bukan reload penuh), bukan menumpuk halaman
// terpisah. Konten tiap halaman (page.tsx di dalam masing-masing folder)
// TIDAK disentuh sama sekali -- murni pembungkus navigasi.
function buildTabs(t: (key: string) => string) {
  return [
    { href: "/dashboard/monetisasi", label: t("dashboard.pages.monetisasiLayout.tabs.overview") },
    { href: "/dashboard/vouchers", label: t("dashboard.pages.monetisasiLayout.tabs.vouchers") },
    { href: "/dashboard/bundles", label: t("dashboard.pages.monetisasiLayout.tabs.bundles") },
    { href: "/dashboard/donation", label: t("dashboard.pages.monetisasiLayout.tabs.donation") },
    { href: "/dashboard/affiliates", label: t("dashboard.pages.monetisasiLayout.tabs.affiliates") },
    { href: "/dashboard/brand", label: t("dashboard.pages.monetisasiLayout.tabs.brand") },
    { href: "/dashboard/loyalty", label: t("dashboard.pages.monetisasiLayout.tabs.loyalty") },
    { href: "/dashboard/events", label: t("dashboard.pages.monetisasiLayout.tabs.events") },
    { href: "/dashboard/courses", label: t("dashboard.pages.monetisasiLayout.tabs.courses") },
    { href: "/dashboard/bookings", label: t("dashboard.pages.monetisasiLayout.tabs.bookings") },
  ];
}

// REVISI 3 September 2026 (permintaan pengguna: "banyak sekali tab yang
// tidak berkaitan, lalu saat klik tab tiba-tiba pindah page yang jauh"):
// bilah tab di atas dibuat SEBELUM IA v2 memecah halaman-halaman ini ke
// grup sidebar Jualan (Kursus/Booking/Event/Dukungan) dan Marketing
// (Voucher/Bundel/Afiliasi/Brand/Loyalitas). Setelah IA v2 keduanya hidup
// bersamaan dan saling bertentangan: breadcrumb bilang "Marketing /
// Afiliasi" tapi bilah tab menawarkan Event/Kursus/Booking -- sekali klik
// halaman berganti DAN grup sidebar ikut melompat. Di mode v2 bilah tab
// tidak dirender: sidebar jadi satu-satunya navigasi antar-halaman, tiap
// halaman punya PageHeader-nya sendiri, dan tab di dalam halaman hanya
// untuk tampilan yang memang satu halaman (?view=/state), bukan pindah
// halaman. Bilah tab dipertahankan hanya untuk IA lama (flag "marketing"
// dimatikan), karena di sana sidebar belum punya grup-grup itu.
export default function MonetisasiLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const TABS = buildTabs(t);
  const marketingV2 = dashRedesignEnabled("marketing");

  if (marketingV2) {
    return <div className="mx-auto max-w-3xl">{children}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* .scroll-row -- kelas yang SUDAH ada (globals.css) untuk baris
          bisa-scroll-horizontal dengan scrollbar disembunyikan, dipakai
          di tempat lain (mis. Pratinjau Langsung) -- dipakai ulang di
          sini supaya 8 tab tidak pecah/terpotong di layar sempit,
          cukup geser, tanpa perlu menu "lainnya" terpisah. */}
      <div className="scroll-row -mx-1 flex gap-1 overflow-x-auto px-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-shrink-0 whitespace-nowrap border-b-[3px] px-3 py-2.5 text-sm font-semibold transition-colors ${
                active ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
