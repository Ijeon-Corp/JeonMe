"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { PageTheme } from "@/lib/page-themes";
import type { FaqItem } from "@/components/FaqBlock";
import TrackedLink from "@/components/TrackedLink";
import PageFooterLinks from "@/components/PageFooterLinks";
import ShareButton from "@/components/ShareButton";
import { IconChevronRight } from "@/components/icons";
import { SITE_URL } from "@/lib/site";
import { Watermark, buildUtmHref, renderVideoBackground } from "@/components/PagePreview";
import type { PagePreviewData } from "@/components/PagePreview";

// LandingPagePreviewInternal -- diekstrak dari PagePreview.tsx (audit
// performa 15 September 2026, susulan langsung dari pemecahan
// BuilderPagePreview): LandingPagePreview (pageType "landing") saling
// EKSKLUSIF dengan BuilderPagePreview/ProdukPagePreview/layout bio klasik
// (satu halaman selalu PERSIS satu tipe), tapi dulu ikut terkirim ke
// SETIAP pengunjung halaman publik apa pun. Dipindah ke file sendiri
// supaya next/dynamic bisa memecahnya jadi chunk terpisah yang HANYA
// diunduh kalau halamannya benar-benar pageType "landing" (TANPA
// ssr:false -- halaman landing sungguhan tetap wajib di-SSR demi SEO/
// initial paint, alasan sama persis dgn blok "langka" & BuilderPagePreview).
//
// Isi file ini PEMINDAHAN MURNI dari PagePreview.tsx -- LandingPagePreview
// TIDAK punya helper eksklusif (dispatcher blok-nya sendiri, inline di
// bawah, tidak dipakai renderer lain mana pun). Helper yang dibagi dengan
// renderer lain (Watermark/buildUtmHref/renderVideoBackground) tetap
// tinggal di PagePreview.tsx & di-import dari sana.

// Blok konten "langka" -- SALINAN pola next/dynamic yang sama persis dari
// PagePreview.tsx (lihat catatan lengkap di sana), diulang di sini supaya
// file ini tetap independen -- next/dynamic beroperasi di level MODUL,
// jadi tiap tipe blok tetap satu chunk fisik yang sama, dibagi (bukan
// digandakan) oleh bundler apa pun yang mengimpornya.
const ContactFormBlock = dynamic(() => import("@/components/ContactFormBlock"));
const FaqBlock = dynamic(() => import("@/components/FaqBlock"));
const MapsEmbedBlock = dynamic(() => import("@/components/MapsEmbedBlock"));
const VideoEmbedBlock = dynamic(() => import("@/components/VideoEmbedBlock"));

// LandingPagePreview -- No.99 (Sprint 14): halaman landing, penuh-lebar,
// blok saja (heading/text/image/button + video/faq/contact_form yang sudah
// ada dari No.77). TIDAK ada avatar/bio-header/produk/monetisasi -- landing
// page difokuskan buat satu tujuan/kampanye tertentu, bukan mini-toko.
// TANPA "Create with AI" (keputusan eksplisit pengguna): semua blok dibuat
// manual lewat dashboard, bukan digenerate model bahasa.
export default function LandingPagePreview({
  data,
  interactive,
  rootClassName,
  theme,
  hideFooterChrome = false,
}: {
  data: PagePreviewData;
  interactive: boolean;
  rootClassName: string;
  theme: PageTheme;
  hideFooterChrome?: boolean;
}) {
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
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-end p-4">
        <ShareButton title={`@${data.username} — Jeon.id`} url={data.pageSlug ? `${SITE_URL}/${data.username}/${data.pageSlug}` : `${SITE_URL}/${data.username}`} />
      </div>
      <div className="mx-auto flex min-h-full max-w-xl flex-col items-center gap-5 px-6 py-14">
        {data.links.map((block) => {
          switch (block.blockType) {
            case "heading":
              return (
                <h1 key={block.id} className={`text-center font-heading text-xl font-bold ${theme.name}`}>
                  {(block.blockData?.text as string) ?? ""}
                </h1>
              );
            case "text":
              return (
                <p key={block.id} className={`max-w-lg text-center text-xs leading-relaxed ${theme.bio}`}>
                  {(block.blockData?.text as string) ?? ""}
                </p>
              );
            case "image": {
              // Penjaga src KOSONG (audit performa 15 September 2026, migrasi
              // next/image): blok gambar yang BARU ditambahkan di Builder belum
              // punya block_data.image_url sampai kreator benar-benar mengunggah
              // foto. <img src=""> dulu tidak apa-apa (cuma tidak tampil), TAPI
              // <Image src=""> MELEMPAR error ("requires src to be provided") --
              // di dev itu merusak seluruh render halaman. Jadi kasus kosong
              // dikembalikan lebih awal, bukan diteruskan ke <Image>.
              const canvasImageUrl = (block.blockData?.image_url as string) ?? "";
              if (!canvasImageUrl) return null;
              return (
                // Rasio ASLI foto -- `aspect-auto h-auto`, lihat catatan
                // panjang di blok "gambar" (renderLinkOrBlock, PagePreview.tsx).
                <Image
                  key={block.id}
                  src={canvasImageUrl}
                  alt={(block.blockData?.caption as string) || block.title}
                  width={576}
                  height={576}
                  className="aspect-auto h-auto w-full rounded-xl object-cover"
                />
              );
            }
            case "button":
              return interactive ? (
                <TrackedLink
                  key={block.id}
                  username={data.username}
                  pageSlug={data.pageSlug}
                  linkId={block.id}
                  href={buildUtmHref(block.url, block.title, data.utmEnabled)}
                  className={`flex w-full max-w-sm items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-2.5 text-center text-xs font-bold transition-all duration-300 ${theme.buyButton}`}
                >
                  {block.title}
                </TrackedLink>
              ) : (
                <button
                  key={block.id}
                  type="button"
                  disabled
                  title="Pratinjau -- tombol ini tidak aktif"
                  className={`w-full max-w-sm cursor-not-allowed ${theme.cardRounded ?? "rounded-xl"} px-4 py-2.5 text-center text-xs font-bold opacity-80 ${theme.buyButton}`}
                >
                  {block.title}
                </button>
              );
            case "video":
              return (
                <VideoEmbedBlock
                  key={block.id}
                  title={block.title}
                  videoUrl={(block.blockData?.video_url as string) ?? ""}
                  cardClassName={`w-full rounded-xl p-2.5 ${theme.productCard}`}
                  titleClassName={theme.productTitle}
                />
              );
            case "faq":
              return (
                <FaqBlock
                  key={block.id}
                  title={block.title}
                  items={(block.blockData?.items as FaqItem[]) ?? []}
                  cardClassName={`w-full rounded-xl p-2.5 ${theme.productCard}`}
                  titleClassName={theme.productTitle}
                  itemTitleClassName={theme.cardTitle}
                  itemBodyClassName={theme.bio}
                />
              );
            case "accordion":
              // Sama seperti renderLinkOrBlock (layout bio biasa) -- lihat
              // catatan lengkap di sana.
              return (
                <FaqBlock
                  key={block.id}
                  title=""
                  items={[{ question: block.title, answer: (block.blockData?.text as string) ?? "" }]}
                  cardClassName={`w-full rounded-xl p-2.5 ${theme.productCard}`}
                  titleClassName={theme.productTitle}
                  itemTitleClassName={theme.cardTitle}
                  itemBodyClassName={theme.bio}
                />
              );
            case "maps":
              return (
                <MapsEmbedBlock
                  key={block.id}
                  title={block.title}
                  url={block.url}
                  embed={Boolean(block.blockData?.embed)}
                  embedLat={block.blockData?.embed_lat as number | undefined}
                  embedLng={block.blockData?.embed_lng as number | undefined}
                  linkClassName={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
                />
              );
            case "contact_form":
              return interactive ? (
                <ContactFormBlock
                  key={block.id}
                  linkId={block.id}
                  title={block.title}
                  cardClassName={`w-full rounded-xl p-2.5 ${theme.productCard}`}
                  titleClassName={theme.productTitle}
                  inputClassName="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                  buttonClassName={theme.buyButton}
                />
              ) : (
                <div key={block.id} className={`w-full rounded-xl p-2.5 text-center ${theme.productCard}`}>
                  <p className={`text-xs font-semibold ${theme.productTitle}`}>{block.title}</p>
                </div>
              );
            default: {
              // Featured Link paritas dengan layout bio biasa -- lihat
              // catatan lengkap di renderLinkOrBlock.
              if (block.isFeatured && block.thumbnailUrl) {
                const featClassName = `group block w-full overflow-hidden ${theme.cardRounded ?? "rounded-xl"} ${theme.card} transition-all duration-300`;
                const featInner = (
                  <>
                    <div className="relative aspect-video w-full overflow-hidden">
                      {/* `fill` -- pembungkus sudah `relative` + aspect-video.
                          Kolom Builder lebih lebar dari halaman bio biasa
                          (max-w-xl = 576px), makanya `sizes` di sini 576px,
                          bukan 448px seperti paritasnya di renderLinkOrBlock. */}
                      <Image
                        src={block.thumbnailUrl}
                        alt=""
                        fill
                        sizes="(max-width: 576px) 100vw, 576px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <p className={`truncate px-3 py-2.5 text-left text-[11px] font-semibold ${theme.cardTitle}`}>{block.title}</p>
                  </>
                );
                return interactive ? (
                  <TrackedLink
                    key={block.id}
                    username={data.username}
                    pageSlug={data.pageSlug}
                    linkId={block.id}
                    href={buildUtmHref(block.url, block.title, data.utmEnabled)}
                    className={featClassName}
                  >
                    {featInner}
                  </TrackedLink>
                ) : (
                  <a key={block.id} href={block.url} target="_blank" rel="noopener noreferrer" className={featClassName}>
                    {featInner}
                  </a>
                );
              }
              return interactive ? (
                <TrackedLink
                  key={block.id}
                  username={data.username}
                  pageSlug={data.pageSlug}
                  linkId={block.id}
                  href={buildUtmHref(block.url, block.title, data.utmEnabled)}
                  className={`flex w-full items-center justify-between gap-3 ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
                >
                  <span className="truncate">{block.title}</span>
                  <IconChevronRight className={`h-4 w-4 flex-shrink-0 ${theme.chevron}`} />
                </TrackedLink>
              ) : (
                <div
                  key={block.id}
                  className={`flex w-full items-center justify-between gap-3 ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold opacity-80 ${theme.card} ${theme.cardTitle}`}
                >
                  <span className="truncate">{block.title}</span>
                </div>
              );
            }
          }
        })}

        {!hideFooterChrome && (
          <div className="mt-auto flex flex-col items-center gap-3 pt-6">
            <Watermark isPremium={data.isPremium} hideWatermark={data.hideWatermark} />
            {/* Footer SELALU tampil, termasuk di pratinjau dashboard
                (interactive=false) -- permintaan langsung pengguna: "tampilkan
                seluruh footer privacy dll", sebelumnya sengaja disembunyikan
                di pratinjau. Item "Laporkan" sudah aman tanpa pageId (fallback
                pesan "tidak tersedia", lihat PageFooterLinks). hideFooterChrome
                di atas adalah pengecualian TERPISAH & sengaja, lihat catatan
                lengkap di prop-nya (PagePreview). */}
            <PageFooterLinks
              pageId={data.id}
              username={data.username}
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
