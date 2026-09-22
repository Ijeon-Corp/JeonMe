"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { DashboardProduct, LinkItem, MyPage, PageStickerData } from "@/lib/api-client";
import { IconExternal } from "@/components/icons";
import { toPreviewData } from "@/lib/page-preview-data";
import { SITE_URL } from "@/lib/site";

// PagePreview.tsx adalah salah satu modul terberat di dashboard (3000+ baris,
// ~20 komponen blok publik diimpor statis di dalamnya) -- panel ini dipakai
// oleh KETIGA halaman "Halaman Saya" (Tautan/Produk/Desain), jadi
// men-dynamic-import di sini langsung mengecilkan bundle awal ketiganya
// sekaligus. Diduga berkontribusi ke race hidrasi <Link> vs klik pengguna
// yang bikin sidebar kadang terlihat "refresh" (dilaporkan pengguna 27-30
// Agustus 2026) -- lihat catatan senada di dashboard/links/page.tsx &
// dashboard/products/page.tsx. toPreviewData TETAP diimpor sinkron dari
// lib/page-preview-data.ts (fungsi murni, terpisah dari PagePreview.tsx)
// karena dipakai langsung di render, bukan cuma sebagai komponen lazy.
const PagePreview = dynamic(() => import("@/components/PagePreview"));

// Kolom pratinjau langsung yang dipakai bersama oleh ketiga halaman di bawah
// "Halaman Saya" (Tautan/Produk/Desain) -- sebelumnya blok ini terduplikasi
// persis sama di masing-masing halaman.
//
// pageType/pageSlug/openUrl -- Modul Halaman Toko (7 Agustus 2026): opsional,
// dipakai ProdukPageEditor supaya panel yang SAMA bisa merender pratinjau
// halaman TAMBAHAN (page_type="produk"), bukan cuma halaman utama. Kosong
// berarti perilaku lama (halaman utama, jeon.id/{username}) TIDAK berubah
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
  highlightLinkId,
  onSelectLink,
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
  // highlightLinkId -- permintaan langsung pengguna, 19 September 2026:
  // saat blok ini sedang dibuka di editor konten (Simple Mode), sorot blok
  // yang sama di pratinjau supaya jelas blok mana yang sedang diedit --
  // lihat catatan lengkap di PagePreviewData.highlightLinkId.
  highlightLinkId?: string;
  // onSelectLink -- permintaan langsung pengguna, 22 September 2026 ("kenapa
  // saat saya klik salah satu blok di pratinjau tidak ada highlight"): arah
  // SEBALIKNYA dari highlightLinkId -- klik LANGSUNG di blok pratinjau ini
  // membuka blok yang sama di editor kiri (Simple Mode), yang otomatis
  // menyalakan highlightLinkId di atas juga. Opsional & TIDAK dipakai
  // pemanggil lain (dashboard/products, dashboard/design) -- pratinjau
  // mereka tetap murni tampilan (tanpa efek klik apa pun), sama seperti
  // sebelum field ini ada. Lihat catatan lengkap di
  // PagePreviewData.onSelectLink & applyPreviewHighlight.
  onSelectLink?: (id: string) => void;
}) {
  // scrollBoxRef + efek di bawah -- permintaan langsung pengguna, 22
  // September 2026 ("ketika lagi buka detail blok itu ada highlight di
  // bagian pratinjau nya seperti di builder"): sorotan ring sudah ada sejak
  // 19 September, tapi kotak pratinjau (tinggi tetap 580px, overflow-y-auto)
  // TIDAK PERNAH ikut menggulir -- blok yang dibuka di bawah lipatan
  // (scrollTop tetap 0) sorotannya tak terlihat sama sekali, sementara
  // blok yang terlihat justru semuanya diredupkan. Builder sudah punya
  // perilaku ini (BuilderCanvas.tsx, scrollIntoView pada selectedNodeId).
  // SENGAJA menggulir kotak ini SAJA lewat scrollTo -- BUKAN
  // scrollIntoView -- karena scrollIntoView ikut menggulir halaman
  // dashboard ke kotak pratinjau, mengeluarkan pengguna dari form yang
  // sedang ia isi (di layar sempit pratinjau berada DI BAWAH editor).
  // Koordinat dihitung dari getBoundingClientRect kedua elemen (bukan
  // offsetTop) supaya benar walau isi kotak di-`zoom` (lihat bawah).
  // Diulang beberapa frame karena PagePreview di-lazy-load: pembungkus
  // bersorotnya baru ada begitu chunk-nya selesai dimuat.
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlightLinkId) return;
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      const box = scrollBoxRef.current;
      const el = box?.querySelector<HTMLElement>("[data-preview-highlight]");
      if (!box || !el) {
        if (++tries < 30) frame = requestAnimationFrame(attempt);
        return;
      }
      const boxRect = box.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const margin = 16;
      if (elRect.top >= boxRect.top + margin && elRect.bottom <= boxRect.bottom - margin) return;
      const top = box.scrollTop + (elRect.top - boxRect.top) - (boxRect.height - elRect.height) / 2;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      box.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
    };
    frame = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(frame);
  }, [highlightLinkId]);

  return (
    // min-w-0 (bug overflow horizontal, 18 Agustus 2026): panel ini SELALU
    // diletakkan sebagai kolom kedua grid "[1fr_360px]" di ketiga halaman
    // pemakainya (Link Bio, Toko, Desain) -- grid item defaultnya
    // min-width:auto (pola berulang di repo ini, lihat CLAUDE.md), menolak
    // menyusut di bawah lebar intrinsik kontennya. Kotak mockup di dalam
    // sini pakai trik CSS `zoom:0.72` (bukan transform:scale) supaya
    // PagePreview versi PENUH (max-w-md=448px) terlihat kecil -- tapi
    // perhitungan lebar intrinsik grid item BISA memakai lebar SEBELUM
    // zoom diterapkan, jauh melebihi track 360px, memaksa seluruh kolom
    // (dan halaman) melebar ke kanan. min-w-0 memaksa item ini benar-benar
    // menyusut ke lebar track yang dialokasikan, membiarkan overflow-y-auto/
    // overflow-x internal kotak mockup yang menangani sisanya.
    <div className="mt-8 min-w-0 lg:sticky lg:top-6 lg:mt-0">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-app-muted">Pratinjau Langsung</p>
        {page && (
          <a
            href={openUrl ?? `${SITE_URL}/${page.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-jeon-purple hover:underline"
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
        <div ref={scrollBoxRef} className="mx-auto h-[580px] w-full max-w-[280px] overflow-y-auto rounded-jmd border-2 border-jeon-ink shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                highlightLinkId,
                onSelectLink,
              }}
              editableStickers={editableStickers}
              onStickersChange={onStickersChange}
            />
          </div>
        </div>
      )}
      <p className="mt-3 text-center text-[11px] text-app-muted">
        Menampilkan tautan &amp; produk yang aktif, persis seperti yang dilihat pengunjung.
      </p>
    </div>
  );
}
