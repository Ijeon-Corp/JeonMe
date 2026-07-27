"use client";

import Link from "next/link";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import { IconChevronRight } from "@/components/icons";
import { DashboardProduct, LinkItem, MyPage } from "@/lib/api-client";

// DesignPageShell -- permintaan langsung pengguna: setiap menu di halaman
// Desain sekarang halaman tersendiri (bukan accordion) -- komponen ini
// dipakai bersama oleh index + 4 sub-halaman (theme/header/tombol/font)
// supaya grid dua-kolom (konten + pratinjau langsung), tautan "Kembali",
// dan judul halaman tidak perlu ditulis ulang di 5 tempat. mx-auto max-w-6xl
// SENGAJA ditambahkan di sini (sebelumnya TIDAK ada -- permintaan langsung
// pengguna: halaman Desain/Tautan/Produk terlihat "belum rata tengah" di
// layar lebar karena grid 2 kolomnya cuma nempel kiri tanpa batas lebar).
//
// contentMaxWidth default DIKOSONGKAN (dulu "max-w-2xl") -- bug dilaporkan
// pengguna (27 Juli 2026, menyertai tangkapan layar Linktree asli): kolom
// konten seharusnya mengisi PENUH ruang kosong di antara sisi kiri & panel
// pratinjau (cuma dibatasi wajar oleh mx-auto max-w-6xl di pembungkus luar),
// bukan dibatasi lagi jadi sempit di dalam kolom 1fr yang sudah fleksibel --
// itu yang membuat ada jarak kosong mubazir sebelum panel pratinjau di layar
// lebar, sama sekali bukan tampilan "ruang tengah lebih luas" seperti contoh
// Linktree asli yang dibagikan.
export default function DesignPageShell({
  page,
  links,
  products,
  backHref,
  title,
  description,
  contentMaxWidth = "",
  children,
}: {
  page: MyPage;
  links: LinkItem[];
  products: DashboardProduct[];
  backHref?: string;
  title: string;
  description?: string;
  contentMaxWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div className={contentMaxWidth}>
        {backHref && (
          <Link href={backHref} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-primary">
            <IconChevronRight className="h-4 w-4 rotate-180" />
            Kembali ke Desain
          </Link>
        )}
        <h1 className="font-heading text-2xl font-bold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        {children}
      </div>
      <LivePreviewPanel page={page} links={links} products={products} />
    </div>
  );
}
