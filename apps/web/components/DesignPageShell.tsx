"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import { IconChevronRight } from "@/components/icons";
import { DashboardProduct, LinkItem, MyPage, PageStickerData } from "@/lib/api-client";
import { useLocale } from "@/lib/locale-context";
import { dashRedesignEnabled } from "@/lib/dashboard-flags";

// Tab kategori Desain (JEONID-DASHBOARD-REDESIGN-SPEC.md §11.1, Phase 4):
// pindah antar kategori (Tema/Header/Tombol/Font/Stiker) SATU klik dari
// sub-halaman mana pun, tanpa balik ke landing dulu (audit §2.2 "memaksa
// user membuka lima sub-route untuk perubahan kecil"). Route subpage tetap
// berfungsi & tab aktif mengikuti URL (aturan §11.1). Label reuse key
// judul masing-masing halaman.
const DESIGN_CATEGORY_TABS = [
  { href: "/dashboard/design/theme", titleKey: "dashboard.pages.designTheme.title" },
  { href: "/dashboard/design/header", titleKey: "dashboard.pages.designHeader.title" },
  { href: "/dashboard/design/tombol", titleKey: "dashboard.pages.designTombol.title" },
  { href: "/dashboard/design/font", titleKey: "dashboard.pages.designFont.title" },
  { href: "/dashboard/design/sticker", titleKey: "dashboard.pages.designSticker.title" },
];

// DesignPageShell -- permintaan langsung pengguna: setiap menu di halaman
// Desain sekarang halaman tersendiri (bukan accordion) -- komponen ini
// dipakai bersama oleh index + 4 sub-halaman (theme/header/tombol/font)
// supaya grid dua-kolom (konten + pratinjau langsung), tautan "Kembali",
// dan judul halaman tidak perlu ditulis ulang di 5 tempat.
//
// contentMaxWidth default DIKOSONGKAN (dulu "max-w-2xl") -- bug dilaporkan
// pengguna: kolom konten seharusnya mengisi PENUH ruang kosong di antara
// sisi kiri & panel pratinjau, bukan dibatasi lagi jadi sempit di dalam
// kolom 1fr yang sudah fleksibel.
//
// "mx-auto max-w-6xl" yang tadinya membungkus grid ini SUDAH DIHAPUS lagi
// (sempat ditambahkan sebentar untuk perbaikan "belum rata tengah", lalu
// pengguna mengklarifikasi lebih lanjut dengan tangkapan layar Linktree
// asli: "buat seluruh bagian pratinjau ke pojok kanan posisi nya" -- Pada
// Linktree asli, panel pratinjau menempel PERSIS di tepi kanan jendela
// browser, bukan cuma di tepi kanan sebuah kotak 1152px yang masih
// dikelilingi jarak kosong simetris kiri-kanan di layar lebar. Grid ini
// sekarang mengisi PENUH lebar <main className="flex-1"> di dashboard/
// layout.tsx (satu-satunya batas lebar yang tersisa), sehingga kolom
// pratinjau (lebar tetap 360px) otomatis mendarat persis di pojok kanan
// jendela, sesuai contoh yang dibagikan pengguna.
export default function DesignPageShell({
  page,
  links,
  products,
  backHref,
  title,
  description,
  contentMaxWidth = "",
  children,
  editableStickers,
  onStickersChange,
}: {
  page: MyPage;
  links: LinkItem[];
  products: DashboardProduct[];
  backHref?: string;
  title: string;
  description?: string;
  contentMaxWidth?: string;
  children: React.ReactNode;
  // editableStickers/onStickersChange -- permintaan langsung pengguna:
  // dipakai KHUSUS oleh /dashboard/design/sticker supaya stiker bisa
  // diseret/diubah ukuran LANGSUNG di panel pratinjau kanan (lihat
  // catatan panjang di PagePreview.tsx).
  editableStickers?: boolean;
  onStickersChange?: (stickers: PageStickerData[]) => void;
}) {
  const { t } = useLocale();
  const pathname = usePathname();
  const designTabsV2 = dashRedesignEnabled("page_builder") && Boolean(backHref);
  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div className={contentMaxWidth}>
        {backHref && (
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-1 rounded-full border-2 border-[#111111] bg-jeon-lavender px-3 py-1.5 text-xs font-bold text-[#111111] transition-transform hover:-translate-x-0.5"
          >
            <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
            {t("dashboard.components.designPageShell.backToDesign")}
          </Link>
        )}
        {designTabsV2 && (
          <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-app-border pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {DESIGN_CATEGORY_TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex-shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition-colors ${
                    active ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"
                  }`}
                >
                  {t(tab.titleKey)}
                  {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-jeon-purple" aria-hidden="true" />}
                </Link>
              );
            })}
          </div>
        )}
        <h1 className="font-display text-2xl font-bold text-app-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-app-muted">{description}</p>}
        {children}
      </div>
      <LivePreviewPanel
        page={page}
        links={links}
        products={products}
        editableStickers={editableStickers}
        onStickersChange={onStickersChange}
      />
    </div>
  );
}
