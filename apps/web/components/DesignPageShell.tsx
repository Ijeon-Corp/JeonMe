"use client";

import Link from "next/link";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import { IconChevronRight } from "@/components/icons";
import { DashboardProduct, LinkItem, MyPage } from "@/lib/api-client";

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
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
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
