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
          publik apa adanya. Scrollbar internal disembunyikan (scroll tetap
          berfungsi lewat mouse wheel/sentuh, cuma indikatornya yang
          dihilangkan) -- tinggi PASTI (bukan max-height) supaya "min-h-full"
          di PagePreview tetap valid sebagai dasar persentase.
          Tinggi menyesuaikan layout (permintaan susulan): di layar besar
          (lg:sticky) memanjang mengikuti sisa tinggi viewport (calc(100vh -
          ...), dikurangi offset top-6 + label "Pratinjau Langsung" di atas +
          keterangan di bawah) alih-alih angka tetap kecil -- di mobile
          (bukan sticky, ikut alur halaman) tetap angka tetap supaya tidak
          membuat satu blok setinggi layar penuh di tengah alur. */}
      {page && (
        <div className="mx-auto h-[500px] w-full max-w-[280px] overflow-y-auto rounded-2xl border border-border shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:h-[calc(100vh-10rem)]">
          {/* Permintaan susulan: font pratinjau masih terasa besar --
              PagePreview dipakai BERSAMA halaman publik asli, jadi ukuran
              teksnya sendiri (Tailwind class di PagePreview.tsx) TIDAK boleh
              diubah dari sini (itu akan ikut mengecilkan halaman publik
              sungguhan). Solusinya "zoom" CSS di pembungkus ini -- membuat
              PagePreview merender seolah tersedia lebar lebih besar (persis
              proporsi halaman publik asli), lalu seluruh hasilnya (teks,
              ikon, jarak) mengecil bersamaan secara proporsional saat
              ditampilkan. `zoom` (beda dari `transform: scale`) tetap
              berpartisipasi dalam tata letak normal -- scrollHeight kotak
              ini otomatis mengikuti ukuran yang sudah mengecil, tidak perlu
              hitung tinggi manual. */}
          <div className="h-full [zoom:0.72]">
            <PagePreview
              interactive={false}
              rootClassName="min-h-full"
              data={toPreviewData({ ...page, is_verified: page.verification.is_verified }, links, products)}
            />
          </div>
        </div>
      )}
      <p className="mt-3 text-center text-[11px] text-muted">
        Menampilkan tautan &amp; produk yang aktif, persis seperti yang dilihat pengunjung.
      </p>
    </div>
  );
}
