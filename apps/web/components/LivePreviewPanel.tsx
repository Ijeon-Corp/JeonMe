"use client";

import { DashboardProduct, LinkItem, MyPage } from "@/lib/api-client";
import { IconExternal } from "@/components/icons";
import PagePreview, { toPreviewData } from "@/components/PagePreview";
import PhoneFrame from "@/components/PhoneFrame";

// Kolom pratinjau langsung yang dipakai bersama oleh ketiga halaman di bawah
// "Halaman Saya" (Tautan/Produk/Desain) -- sebelumnya blok ini terduplikasi
// persis sama di masing-masing halaman.
export default function LivePreviewPanel({
  page,
  links,
  products,
}: {
  page: MyPage | null;
  links: LinkItem[];
  products: DashboardProduct[];
}) {
  return (
    <div className="mt-8 lg:sticky lg:top-6 lg:mt-0">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Pratinjau Langsung</p>
        {page && (
          <a
            href={`https://jeonme.com/${page.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <IconExternal className="h-3.5 w-3.5" />
            Buka
          </a>
        )}
      </div>
      {page && (
        <PhoneFrame>
          <PagePreview interactive={false} rootClassName="min-h-full" data={toPreviewData(page, links, products)} />
        </PhoneFrame>
      )}
      <p className="mt-3 text-center text-[11px] text-muted">
        Menampilkan tautan &amp; produk yang aktif, persis seperti yang dilihat pengunjung.
      </p>
    </div>
  );
}
