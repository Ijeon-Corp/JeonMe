"use client";

import Link from "next/link";

// DesignCategoryTabs (JEONID-DASHBOARD-REDESIGN-SPEC.md §13.7, permintaan
// langsung pengguna 8 September 2026): diekstrak dari markup tab kategori
// Desain yang sebelumnya HARDCODE di DesignPageShell.tsx (dipakai Bio,
// §11.1 Phase 4) supaya bisa dipakai ULANG oleh ProdukPageEditor.tsx
// (Halaman Toko, §13.7) -- SATU sumber kebenaran gaya tab (underline +
// warna aktif jeon-purple), bukan disalin ulang jadi dua markup yang bisa
// diam-diam berbeda seiring waktu. Ini "adapter UI seragam" yang diminta
// spec §13.7 secara harfiah.
//
// Dua mode tab disatukan lewat satu tipe -- Bio pakai `href` (setiap
// kategori route Next.js terpisah, `/dashboard/design/*`), Toko pakai
// `onClick` (satu komponen, kategori = state lokal `section`, TIDAK ada
// route terpisah per kategori). `activeKey` dihitung PEMANGGIL (Bio:
// `pathname`, Toko: `section` yang sedang aktif) -- komponen ini murni
// presentasional, sengaja TIDAK memanggil usePathname() sendiri supaya
// tetap generik utk kedua mode.
export interface DesignCategoryTab {
  key: string;
  label: string;
  href?: string;
  onClick?: () => void;
}

export default function DesignCategoryTabs({ tabs, activeKey }: { tabs: DesignCategoryTab[]; activeKey: string }) {
  return (
    <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-app-border pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        const className = `relative flex-shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition-colors ${
          active ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"
        }`;
        const underline = active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-jeon-purple" aria-hidden="true" />;
        if (tab.href) {
          return (
            <Link key={tab.key} href={tab.href} aria-current={active ? "page" : undefined} className={className}>
              {tab.label}
              {underline}
            </Link>
          );
        }
        return (
          <button key={tab.key} type="button" onClick={tab.onClick} aria-current={active ? "page" : undefined} className={className}>
            {tab.label}
            {underline}
          </button>
        );
      })}
    </div>
  );
}
