"use client";

import { DashboardProduct, LinkItem, MyPage, PageStickerData } from "@/lib/api-client";
import { IconExternal } from "@/components/icons";
import PagePreview, { toPreviewData } from "@/components/PagePreview";

// Kolom pratinjau langsung yang dipakai bersama oleh ketiga halaman di bawah
// "Halaman Saya" (Tautan/Produk/Desain) -- sebelumnya blok ini terduplikasi
// persis sama di masing-masing halaman.
//
// pageType/pageSlug/openUrl -- Modul Halaman Toko (7 Agustus 2026): opsional,
// dipakai ProdukPageEditor supaya panel yang SAMA bisa merender pratinjau
// halaman TAMBAHAN (page_type="produk"), bukan cuma halaman utama. Kosong
// berarti perilaku lama (halaman utama, jeonme.com/{username}) TIDAK berubah
// sama sekali untuk 3 pemakai yang sudah ada.
export default function LivePreviewPanel({
  page,
  links,
  products,
  pageType,
  pageSlug,
  openUrl,
  editableStickers,
  onStickersChange,
}: {
  page: MyPage | null;
  links: LinkItem[];
  products: DashboardProduct[];
  pageType?: "bio" | "landing" | "produk";
  pageSlug?: string;
  openUrl?: string;
  // editableStickers/onStickersChange -- permintaan langsung pengguna:
  // stiker diedit LANGSUNG di pratinjau ini (drag/resize), bukan lagi di
  // kanvas mockup terpisah -- lihat catatan panjang di PagePreview.tsx.
  editableStickers?: boolean;
  onStickersChange?: (stickers: PageStickerData[]) => void;
}) {
  return (
    <div className="mt-8 lg:sticky lg:top-6 lg:mt-0">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Pratinjau Langsung</p>
        {page && (
          <a
            href={openUrl ?? `https://jeonme.com/${page.username}`}
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

          Permintaan susulan (5 Agustus 2026): ukuran kotak pratinjau dibuat
          TETAP (280x580, sama persis di mobile MAUPUN desktop) -- sebelumnya
          tinggi desktop memakai calc(100vh-10rem) yang berubah-ubah
          mengikuti tinggi jendela browser (mockup jadi tidak proporsional/
          konsisten dari satu pengguna ke pengguna lain). "Responsif" di sini
          artinya TATA LETAK-nya (menempel/statis, lebar kolom) yang
          menyesuaikan breakpoint, BUKAN dimensi kotaknya sendiri -- kotak
          selalu mempertahankan rasio ala ponsel yang sama. max-w-full+w-full
          tetap dipertahankan supaya di layar SANGAT sempit (<280px, mis.
          landscape ponsel kecil) kotak ikut menyusut, bukan meluber. */}
      {page && (
        <div className="mx-auto h-[580px] w-full max-w-[280px] overflow-y-auto rounded-2xl border border-border shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              data={{
                ...toPreviewData({ ...page, is_verified: page.verification.is_verified }, links, products),
                pageType,
                pageSlug,
              }}
              editableStickers={editableStickers}
              onStickersChange={onStickersChange}
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
