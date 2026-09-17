"use client";

import { useState } from "react";
import { PageTheme } from "@/lib/page-themes";
import PageFooterLinks from "@/components/PageFooterLinks";
import ShareButton from "@/components/ShareButton";
import { PageStickerData } from "@/lib/api-client";
import { SITE_URL } from "@/lib/site";
import {
  CatalogTakeoverView,
  PageSwitcher,
  StickerOverlay,
  Watermark,
  renderBioHeader,
  renderLinkOrBlock,
  renderVideoBackground,
} from "@/components/PagePreview";
import type { PagePreviewData, PagePreviewLink } from "@/components/PagePreview";

// ProdukPagePreviewInternal -- diekstrak dari PagePreview.tsx (audit
// performa 15 September 2026, susulan langsung dari pemecahan
// BuilderPagePreview/LandingPagePreview): ProdukPagePreview (pageType
// "produk", Halaman Toko) saling EKSKLUSIF dengan BuilderPagePreview/
// LandingPagePreview/layout bio klasik (satu halaman selalu PERSIS satu
// tipe), tapi dulu ikut terkirim ke SETIAP pengunjung halaman publik apa
// pun. Dipindah ke file sendiri supaya next/dynamic bisa memecahnya jadi
// chunk terpisah yang HANYA diunduh kalau halamannya benar-benar pageType
// "produk" (TANPA ssr:false -- Toko sungguhan tetap wajib di-SSR demi
// SEO/initial paint, alasan sama persis dgn blok "langka" & renderer
// page-type lain).
//
// Isi file ini PEMINDAHAN MURNI dari PagePreview.tsx -- ProdukPagePreview
// TIDAK punya helper eksklusif (state `catalogView` lokal ke komponen ini
// sendiri, sama pola dgn layout bio klasik di PagePreview.tsx). Helper
// yang dibagi dengan renderer lain (CatalogTakeoverView/PageSwitcher/
// StickerOverlay/Watermark/renderBioHeader/renderLinkOrBlock/
// renderVideoBackground) tetap tinggal di PagePreview.tsx & di-import
// dari sana.

// ProdukPagePreview -- Modul Halaman Produk: kreator gratis dapat 1 halaman
// tipe ini, Premium sampai 5 (pool TERPISAH dari bio/landing, lihat
// freeProdukPageLimit/premiumProdukPageLimit di page.go). Showcase katalog
// Toko yang SAMA dengan halaman utama (produk per-akun, bukan per-halaman --
// lihat catatan lingkup di CreatePage), header avatar+nama+bio + (Modul
// Halaman Toko, 7 Agustus 2026) blok/tautan sendiri (link/video/faq/
// contact_form/maps/text -- lihat renderLinkOrBlock) TETAP TANPA donasi/
// lead-capture/event/loyalty, yang account-wide (satu per akun,
// bukan per-halaman) jadi tidak bisa diduplikasi per halaman tambahan.
export default function ProdukPagePreview({
  data,
  rootClassName,
  theme,
  canBuy,
  interactive,
  editableStickers,
  onStickersChange,
  hideFooterChrome = false,
}: {
  data: PagePreviewData;
  rootClassName: string;
  theme: PageTheme;
  canBuy: boolean;
  interactive: boolean;
  editableStickers?: boolean;
  onStickersChange?: (stickers: PageStickerData[]) => void;
  hideFooterChrome?: boolean;
}) {
  // catalogView -- bug dilaporkan langsung pengguna, 14 September 2026
  // (screenshot Halaman Toko publik: "kenapa blok katalog nya tidak bisa
  // di klik dan menampilkan isinya"). SEBELUMNYA renderLinkOrBlock di sini
  // dipanggil TANPA onOpenCatalog SAMA SEKALI (lihat catatan lama di
  // CatalogTakeoverView: "cakupan awal... kreator pasti memakainya di
  // halaman Bio utama, bukan Toko/Landing" -- asumsi itu SEKARANG terbukti
  // salah lewat laporan nyata ini) -- blok Katalog tetap tampil sbg baris
  // tapi klik tidak melakukan apa pun, TIDAK ada state `catalogView` sama
  // sekali di komponen ini. State + takeover di bawah SAMA PERSIS pola yang
  // sudah dipakai versi Bio (PagePreview default, PagePreview.tsx).
  const [catalogView, setCatalogView] = useState<PagePreviewLink | null>(null);
  if (catalogView) {
    return (
      <CatalogTakeoverView
        link={catalogView}
        theme={theme}
        data={data}
        interactive={interactive}
        canBuy={canBuy}
        rootClassName={rootClassName}
        onExit={() => setCatalogView(null)}
      />
    );
  }
  return (
    <main className={`relative ${rootClassName} ${theme.page}`} style={theme.pageStyle}>
      {renderVideoBackground(theme)}
      {/* z-20 (bug dilaporkan pengguna, 18 Agustus 2026: "tombol share
          ketutup foto profile"): avatar varian "card"/"cover" (lihat
          renderBioHeader) juga pakai z-10 di wrapper-nya sendiri -- semua
          div pembungkus di antara sini & sana cuma position:relative TANPA
          z-index eksplisit, jadi TIDAK membuat stacking context baru, dan
          z-10 avatar berakhir dibandingkan LANGSUNG dengan z-10 tombol ini
          dalam satu context yang sama. Nilai SAMA -> penentu jadi urutan
          DOM, avatar (lebih belakangan di JSX) menang & menutupi tombol.
          z-20 di sini memastikan tombol share SELALU di atas, apa pun
          varian avatar/tema yang dipakai. */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center p-4">
        <PageSwitcher username={data.username} pages={data.sitePages} currentSlug={data.pageSlug ?? null} theme={theme} />
        <div className="ml-auto">
          <ShareButton title={`@${data.username} — Jeon.id`} url={data.pageSlug ? `${SITE_URL}/${data.username}/${data.pageSlug}` : `${SITE_URL}/${data.username}`} />
        </div>
      </div>
      {/* StickerOverlay dipindah jadi anak kolom max-w-md (bukan lagi anak
          langsung <main>) -- lihat catatan panjang di preview bio default
          soal bug "posisi stiker beda antara pratinjau & halaman publik". */}
      <div className="relative mx-auto flex min-h-full max-w-md flex-col items-center px-6 py-14">
        <StickerOverlay stickers={data.stickers} editable={editableStickers} onChange={onStickersChange} />
        <div className="relative w-full">
          {theme.glow !== "hidden" && (
            <div
              aria-hidden
              className={`absolute -top-10 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full blur-3xl ${theme.glow}`}
            />
          )}
          <div className={`relative ${data.layoutVariant === "banner" || data.layoutVariant === "minimal" ? "" : "flex flex-col items-center"}`}>
            {renderBioHeader(data, theme)}
          </div>
        </div>

        {data.shopPaused && (
          <div className={`mt-6 w-full rounded-xl p-2.5 text-center text-xs font-semibold ${theme.productCard} ${theme.bio}`}>
            {data.shopPausedMessage || "Toko sedang dijeda sementara oleh pemiliknya."}
          </div>
        )}

        {data.links.length > 0 && (
          <div className="mt-8 flex w-full flex-col gap-2.5">
            {data.links.map((link) => renderLinkOrBlock(link, theme, data, interactive, canBuy, setCatalogView))}
          </div>
        )}

        {/* Grid produk otomatis DIHAPUS -- permintaan langsung pengguna, 15
            September 2026: "saya mau semua product yang sudah ditambahkan
            di menu product itu jangan langsung ditampilkan tapi itu data
            product yang bisa kita tampilkan ketika menambahkan blok
            produk." Sebelum ini grid otomatis (renderProductGrid, di bawah
            data.products.length > 0 ? ... : "Belum ada produk untuk
            ditampilkan") sudah jadi FALLBACK sejak 13 September 2026 --
            sekarang fallback itu sendiri dihapus: produk TIDAK PERNAH
            tampil otomatis lagi, satu-satunya cara menampilkan produk di
            Toko adalah menambahkan blok "produk" secara eksplisit (sudah
            dirender lewat renderLinkOrBlock di atas). */}

        {!hideFooterChrome && (
          <div className="mt-auto flex flex-col items-center gap-3 pt-10">
            <Watermark isPremium={data.isPremium} hideWatermark={data.hideWatermark} />
            <PageFooterLinks
              pageId={data.id}
              username={data.username}
              displayName={data.displayName}
              bio={data.bio}
              isVerified={data.isVerified}
              footerClassName={theme.footer}
            />
          </div>
        )}
      </div>
    </main>
  );
}
