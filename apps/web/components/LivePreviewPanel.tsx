"use client";

import { DashboardProduct, LinkItem, MyPage } from "@/lib/api-client";
import { IconExternal } from "@/components/icons";
import PagePreview, { toPreviewData } from "@/components/PagePreview";

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
      {/* Permintaan langsung pengguna: kecilkan ukuran pratinjau, hilangkan
          bingkai ala HP (notch/bezel) -- cukup tampilan langsung halaman
          publik apa adanya. Tetap dibatasi tinggi (h-[480px], turun dari
          640px) + scroll internal untuk halaman panjang, tapi scrollbar-nya
          disembunyikan (scroll tetap berfungsi lewat mouse wheel/sentuh,
          cuma indikatornya yang dihilangkan) -- tinggi PASTI (bukan
          max-height) supaya "min-h-full" di PagePreview tetap valid sebagai
          dasar persentase, sama seperti alasan PhoneFrame sebelumnya. */}
      {page && (
        <div className="mx-auto h-[480px] w-full max-w-[280px] overflow-y-auto rounded-2xl border border-border shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <PagePreview
            interactive={false}
            rootClassName="min-h-full"
            data={toPreviewData({ ...page, is_verified: page.verification.is_verified }, links, products)}
          />
        </div>
      )}
      <p className="mt-3 text-center text-[11px] text-muted">
        Menampilkan tautan &amp; produk yang aktif, persis seperti yang dilihat pengunjung.
      </p>
    </div>
  );
}
