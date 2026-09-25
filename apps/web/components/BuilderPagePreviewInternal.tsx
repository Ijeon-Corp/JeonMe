"use client";

import Image from "next/image";

// BuilderPagePreviewInternal -- diekstrak dari PagePreview.tsx (audit
// performa 15 September 2026, lanjutan dari pemecahan 13 tipe blok "langka"
// lewat next/dynamic di sana): PagePreview.tsx punya TIGA renderer
// PAGE-TYPE yang saling EKSKLUSIF saat runtime (satu halaman selalu PERSIS
// satu tipe) -- LandingPagePreview (pageType "landing"), BuilderPagePreview
// (builderMode "builder") & ProdukPagePreview (pageType "produk") -- tapi
// ketiganya dulu ikut terkirim ke SETIAP pengunjung halaman publik apa pun,
// rute trafik TERTINGGI di seluruh sistem. BuilderPagePreview dipindah ke
// file sendiri supaya next/dynamic bisa memecahnya jadi chunk terpisah yang
// HANYA diunduh kalau halamannya benar-benar builderMode "builder" (TANPA
// ssr:false -- halaman builder sungguhan tetap harus di-SSR demi SEO/initial
// paint, alasan sama persis dgn blok "langka" di PagePreview.tsx).
//
// Isi file ini adalah PEMINDAHAN MURNI (byte-for-byte) dari PagePreview.tsx
// -- BuilderPagePreview beserta 5 helper EKSKLUSIFnya (BuilderRenderNode,
// normalizeEmbeddedBuilderNode, BUILDER_NODE_BLOCK_TYPES,
// builderSelectionRing, renderBuilderNode; tidak ada satu pun yang dipanggil
// dari bagian lain PagePreview.tsx, lihat catatan "TERPISAH SENGAJA dari
// renderLinkOrBlock" di renderBuilderNode). Helper yang TETAP dibagi dengan
// renderer lain (renderLinkOrBlock/CatalogTakeoverView/renderBioHeader/dst)
// tetap tinggal di PagePreview.tsx & di-import dari sana.

import { useState } from "react";
import dynamic from "next/dynamic";
import { sanitizeRichTextHtml } from "@/lib/sanitize-rich-text";
import { PageTheme } from "@/lib/page-themes";
import ProdukCategoryFilter from "@/components/ProdukCategoryFilter";
import type { FaqItem } from "@/components/FaqBlock";
import type { ListBlockItem } from "@/components/ListBlock";
import BuyProductButton from "@/components/BuyProductButton";
import TrackedLink from "@/components/TrackedLink";
import PageFooterLinks from "@/components/PageFooterLinks";
import ShareButton from "@/components/ShareButton";
import { PageStickerData, trackEvent, trackEventBySlug } from "@/lib/api-client";
import { IconCalendar, IconChevronRight, IconHeart, IconMail } from "@/components/icons";
import { SITE_URL } from "@/lib/site";
import {
  CatalogTakeoverView,
  PRODUK_LAYOUT_RENDERERS,
  PageSwitcher,
  StickerOverlay,
  Watermark,
  buildUtmHref,
  renderBioHeader,
  renderCountdownAction,
  renderLinkOrBlock,
  renderSingleProductCard,
  renderVideoBackground,
} from "@/components/PagePreview";
import type { PagePreviewData, PagePreviewLink, PagePreviewProduct } from "@/components/PagePreview";
import { normalizeGalleryDisplay } from "@/lib/gallery-display";

// Blok konten "langka" -- SALINAN pola next/dynamic yang sama persis dari
// PagePreview.tsx (lihat catatan lengkapnya di sana): tiap tipe blok tetap
// jadi chunk-nya sendiri, cuma diambil browser kalau blockType-nya benar-
// benar cocok. Dideklarasikan ulang di sini (bukan di-import dari
// PagePreview.tsx) supaya file ini berdiri sendiri -- modul tujuannya SAMA,
// jadi bundler tetap memakai satu chunk yang sama untuk masing-masing.
const AudioPlayerBlock = dynamic(() => import("@/components/AudioPlayerBlock"));
const ContactFormBlock = dynamic(() => import("@/components/ContactFormBlock"));
const CountdownBlock = dynamic(() => import("@/components/CountdownBlock"));
const EmbedBlock = dynamic(() => import("@/components/EmbedBlock"));
const FaqBlock = dynamic(() => import("@/components/FaqBlock"));
const FileDownloadBlock = dynamic(() => import("@/components/FileDownloadBlock"));
const GalleryBlock = dynamic(() => import("@/components/GalleryBlock"));
const ImageSliderBlock = dynamic(() => import("@/components/ImageSliderBlock"));
const LeadCaptureForm = dynamic(() => import("@/components/LeadCaptureForm"));
const ListBlock = dynamic(() => import("@/components/ListBlock"));
const MapsEmbedBlock = dynamic(() => import("@/components/MapsEmbedBlock"));
const SocialProofToast = dynamic(() => import("@/components/SocialProofToast"));
const VideoEmbedBlock = dynamic(() => import("@/components/VideoEmbedBlock"));

// BuilderRenderNode -- bentuk seragam yang dipakai renderBuilderNode,
// dinormalisasi dari DUA sumber berbeda: blok ROOT (PagePreviewLink,
// camelCase blockType/blockData, dari data.links) & blok TERTANAM di
// dalam block_data Section/Column (raw JSON snake_case block_type/
// block_data, bentuk EmbeddedBuilderBlock -- lihat api-client.ts &
// builder-blocks.ts). normalizeEmbeddedBuilderNode menjembatani yang
// kedua supaya renderBuilderNode cukup satu implementasi rekursif,
// tidak perlu tahu bedanya root vs tertanam.
type BuilderRenderNode = {
  id: string;
  title: string;
  url?: string;
  // description -- Fase 2 (permintaan langsung pengguna 8 September 2026):
  // dibutuhkan "embed_link" (subjudul kartu), field ini SUDAH ada di
  // bentuk EmbeddedBuilderBlock (api-client.ts) sejak awal, cuma belum
  // pernah dipakai node manapun sampai sekarang.
  description?: string;
  blockType: string;
  blockData: Record<string, unknown>;
};

function normalizeEmbeddedBuilderNode(raw: unknown): BuilderRenderNode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  const blockType = typeof r.block_type === "string" ? r.block_type : "";
  if (!id || !blockType) return null;
  return {
    id,
    title: typeof r.title === "string" ? r.title : "",
    url: typeof r.url === "string" ? r.url : undefined,
    description: typeof r.description === "string" ? r.description : undefined,
    blockType,
    blockData: (r.block_data && typeof r.block_data === "object" ? (r.block_data as Record<string, unknown>) : {}),
  };
}

// renderBuilderNode -- Canvas Page Builder (migrasi 000096, permintaan
// langsung pengguna 7 September 2026, dua screenshot Lynk.id): dispatcher
// rekursif blok Section/Column, TERPISAH SENGAJA dari renderLinkOrBlock
// (bio/produk) & switch inline LandingPagePreview di atas -- keduanya
// SUDAH divergen satu sama lain, menambah cabang lagi ke salah satunya
// cuma menambah duplikasi konflik. Cakupan Fase 1 (7 September 2026):
// leaf "text"/"button"/"divider" + kontainer "section"/"column" (5 tipe
// kategori GENERAL). Fase 2/3 (8 September) menambah tipe MEDIA/
// INFORMATION/CONVERSION/OTHERS, Fase 4 (13 September) menambah sisa
// tipe klasik lama (heading/accordion/audio/file/project_showcase) --
// SEMUANYA sudah rampung, lihat BUILDER_NODE_BLOCK_TYPES di bawah utk
// daftar LENGKAP yang benar-benar ditangani saat ini.
// BUILDER_NODE_BLOCK_TYPES -- daftar PERSIS case yang ditangani switch
// renderBuilderNode di bawah. Dipakai BuilderPagePreview untuk memutuskan
// blok akar mana yang dirender lewat jalur builder vs jalur klasik
// (renderLinkOrBlock) -- lihat catatan bug 9 September 2026 di sana. Kalau
// menambah case baru di switch, WAJIB tambahkan ke sini juga; kalau tidak,
// tipe baru itu akan jatuh ke renderLinkOrBlock (yang tidak mengenalnya).
const BUILDER_NODE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "divider",
  "text",
  "button",
  "section",
  "column",
  "video",
  "faq",
  "gallery",
  "image",
  "video_image",
  "embed_link",
  "maps",
  "image_slider",
  "countdown",
  "list",
  "embed",
  "produk",
  // Fase 4 (13 September 2026): 5 tipe klasik lama, boleh root MAUPUN
  // bersarang (lihat allowedBuilderEmbeddedBlockTypes, links.go).
  // "catalog" SENGAJA TIDAK di sini (root-only) -- baris ROOT tipe itu
  // tetap jatuh ke renderLinkOrBlock yang SUDAH bekerja penuh (drill-down
  // katalog), menulis ulang logic itu di renderBuilderNode cuma menambah
  // duplikasi tanpa manfaat karena tidak pernah muncul bersarang.
  // "contact_form" JUGA SENGAJA TIDAK di sini walau sejak Builder
  // improvements 18 September 2026 sudah boleh BERSARANG (ada case-nya di
  // renderBuilderNode, dipakai anak Section/Column): baris ROOT-nya tetap
  // lewat renderLinkOrBlock supaya ikon kustom (resolveBlockIcon) & gerbang
  // konten sensitif yang cuma ada di PagePreviewLink tetap berfungsi --
  // BuilderRenderNode lossy soal field root-only itu (lihat catatan Fase 4
  // di renderBuilderNode). Anak tertanam tidak pernah lewat set ini (masuk
  // switch langsung dari kontainernya), jadi tidak butuh entry.
  "heading",
  "accordion",
  "audio",
  "file",
  "project_showcase",
]);

// builderSelectionRing -- lihat catatan lengkap Bagian 1c di plan (9
// September 2026, "klik blok di kanvas juga"): satu potongan class Tailwind
// dipusatkan di sini, dipakai tiap elemen berdata data-builder-node-id di
// bawah supaya blok yang sedang dipilih di BuilderLeftPanel bisa terlihat
// jelas langsung di kanvas. Cuma ring, TANPA rounded eksplisit -- tiap
// elemen di bawah sudah pakai rounded-xl/theme.cardRounded sendiri.
function builderSelectionRing(id: string, selectedNodeId: string | undefined): string {
  return id === selectedNodeId ? " ring-2 ring-jeon-purple ring-offset-2" : "";
}

function renderBuilderNode(
  node: BuilderRenderNode,
  theme: PageTheme,
  data: PagePreviewData,
  interactive: boolean,
  canBuy: boolean,
  selectedNodeId?: string,
  // rootLinkId -- Builder improvements 18 September 2026: id baris `links`
  // ROOT yang memuat node ini, diturunkan lewat rekursi Section/Column
  // (undefined = node ini SENDIRI root). Dibutuhkan blok "contact_form"
  // tertanam: submit-nya harus membawa id root supaya backend
  // (SubmitContactForm + root_link_id) bisa menemukan id blok tertanam di
  // dalam block_data root itu -- id anak Section/Column bukan baris `links`.
  rootLinkId?: string
): React.ReactNode {
  // data-builder-node-id/data-builder-block-type -- selector STABIL dipakai
  // BuilderCanvas.tsx (highlight blok terpilih) & e2e/builder-mode.spec.ts
  // (assert isi Section/Column tertanam tampil benar di halaman publik).
  const ring = builderSelectionRing(node.id, selectedNodeId);
  // Root id utk anak-anak node ini: kalau node ini sendiri root (rootLinkId
  // belum ada), id-nya sendirilah root bagi semua keturunannya.
  const childRootLinkId = rootLinkId ?? node.id;
  switch (node.blockType) {
    case "divider":
      // Target klik diperlebar (py-2.5 di kanvas KREATOR SAJA, `!interactive`)
      // -- bug ditemukan lewat audit (13 September 2026): garis 1px nyaris
      // mustahil diklik tepat (target seukuran 1px), praktis cuma bisa
      // dipilih lewat tree kiri. `interactive=true` (halaman publik
      // sungguhan) TETAP garis polos apa adanya -- renderBuilderNode ini
      // dipakai BERSAMA utk kanvas builder & halaman publik sungguhan,
      // padding tambahan TIDAK BOLEH bocor jadi spasi ekstra yang terlihat
      // pengunjung asli.
      return interactive ? (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-block-type="divider"
          role="separator"
          aria-hidden
          className={`h-px w-full opacity-20 bg-current ${theme.bio}${ring}`}
        />
      ) : (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="divider" className={`flex w-full items-center py-2.5${ring}`}>
          <div role="separator" aria-hidden className={`h-px w-full opacity-20 bg-current ${theme.bio}`} />
        </div>
      );
    case "text":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-block-type="text"
          // whitespace-pre-line -- kompatibilitas mundur: blok "text" yang
          // dibuat SEBELUM redesain rich-text ini (10 September 2026)
          // menyimpan plain string dgn newline literal "\n" (dulu textarea
          // polos), BUKAN tag <p>/<br> -- tanpa ini, newline lama akan
          // kolaps jadi satu baris begitu dirender lewat dangerouslySetInnerHTML
          // (beda dari <textarea>/<p> lama yang otomatis menghormati "\n"
          // via CSS ini). Konten BARU dari RichTextEditor (TipTap) sudah
          // pakai elemen blok <p> sungguhan, tidak terpengaruh sama sekali.
          className={`jeon-rich-text-content w-full whitespace-pre-line text-center text-xs leading-relaxed ${theme.bio}${ring}`}
          dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml((node.blockData.text as string) ?? "") }}
        />
      );
    case "button":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="button" className={`w-full${ring}`}>
          {interactive ? (
            <TrackedLink
              username={data.username}
              pageSlug={data.pageSlug}
              linkId={node.id}
              href={buildUtmHref(node.url ?? "", node.title, data.utmEnabled)}
              className={`flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-2.5 text-center text-xs font-bold transition-all duration-300 ${theme.buyButton}`}
            >
              {node.title}
            </TrackedLink>
          ) : (
            // div, BUKAN <button disabled> -- bug ditemukan lewat verifikasi
            // live 9 September 2026 (fitur klik-blok-di-kanvas): browser
            // TIDAK PERNAH mendispatch/mem-bubble-kan mouse event dari form
            // control ber-atribut `disabled`, jadi delegasi klik BuilderCanvas.
            // tsx (`closest("[data-builder-node-id]")` di wrapper `div` luar)
            // tidak pernah menyala saat pengunjung klik tombol ini -- SATU-
            // SATUNYA blok yang tidak bisa diklik-pilih di kanvas (blok lain
            // pakai `div`/`a`, bukan `<button disabled>`, jadi aman). `role`+
            // `aria-disabled` menjaga semantik aksesibilitas yang sama tanpa
            // memakai atribut `disabled` yang menekan event.
            <div
              role="button"
              aria-disabled="true"
              title="Pratinjau -- tombol ini tidak aktif"
              className={`w-full cursor-not-allowed ${theme.cardRounded ?? "rounded-xl"} px-4 py-2.5 text-center text-xs font-bold opacity-80 ${theme.buyButton}`}
            >
              {node.title}
            </div>
          )}
        </div>
      );
    case "section": {
      const children = ((node.blockData.children as unknown[] | undefined) ?? [])
        .map(normalizeEmbeddedBuilderNode)
        .filter((c): c is BuilderRenderNode => c !== null);
      return (
        <section
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-block-type="section"
          className={`flex w-full flex-col items-center gap-4 rounded-xl${ring}`}
        >
          {children.map((child) => renderBuilderNode(child, theme, data, interactive, canBuy, selectedNodeId, childRootLinkId))}
        </section>
      );
    }
    case "column": {
      const columns = (node.blockData.columns as { widthPercent?: number; children?: unknown[] }[] | undefined) ?? [];
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="column" className={`flex w-full flex-col gap-4 rounded-xl sm:flex-row${ring}`}>
          {columns.map((col, i) => {
            const children = (col.children ?? []).map(normalizeEmbeddedBuilderNode).filter((c): c is BuilderRenderNode => c !== null);
            return (
              <div
                key={i}
                data-builder-column-index={i}
                className="flex min-w-0 flex-1 flex-col items-center gap-4"
                style={col.widthPercent ? { flexBasis: `${col.widthPercent}%` } : undefined}
              >
                {children.map((child) => renderBuilderNode(child, theme, data, interactive, canBuy, selectedNodeId, childRootLinkId))}
              </div>
            );
          })}
        </div>
      );
    }
    // Fase 2 (permintaan langsung pengguna 8 September 2026): 6 tipe
    // MEDIA/INFORMATION/OTHERS baru, SEMUA reuse komponen presentasional
    // yang sudah ada (VideoEmbedBlock/FaqBlock/GalleryBlock, dipakai ulang
    // APA ADANYA dari renderLinkOrBlock -- className theme SAMA PERSIS
    // supaya blok terlihat identik dipakai lewat editor daftar sederhana
    // ATAU kanvas builder).
    case "video":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="video" className={`w-full rounded-xl${ring}`}>
          <VideoEmbedBlock
            title={node.title}
            videoUrl={(node.blockData.video_url as string) ?? ""}
            cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
            titleClassName={theme.cardTitle}
            autoplay={node.blockData.autoplay !== false}
          />
        </div>
      );
    case "faq":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="faq" className={`w-full rounded-xl${ring}`}>
          <FaqBlock
            title={node.title}
            items={(node.blockData.items as FaqItem[]) ?? []}
            cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
            titleClassName={theme.cardTitle}
            itemTitleClassName={theme.cardTitle}
            itemBodyClassName={theme.bio}
          />
        </div>
      );
    case "gallery":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="gallery" className={`w-full rounded-xl${ring}`}>
          <GalleryBlock
            title={node.title}
            images={(node.blockData.images as string[]) ?? []}
            display={normalizeGalleryDisplay(node.blockData.display)}
            captions={(node.blockData.captions as Record<string, { title?: string; description?: string }> | undefined) ?? {}}
            nestedImages={(node.blockData.nestedImages as Record<string, string[]> | undefined) ?? {}}
            cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
            titleClassName={theme.cardTitle}
          />
        </div>
      );
    case "image": {
      const imageUrl = node.blockData.image_url as string | undefined;
      if (!imageUrl) {
        return (
          <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="image" className={`flex w-full items-center justify-center rounded-xl p-8 text-xs ${theme.card} ${theme.bio}${ring}`}>
            {node.title || "Foto"}
          </div>
        );
      }
      // link tujuan + caption -- lihat catatan lengkap di renderLinkOrBlock
      // (kasus "image" mode Simple), dipakai bersama supaya blok yang
      // dibuat lewat Canvas Builder tampil identik di halaman publik.
      const img = (
        // `aspect-auto h-auto` WAJIB (audit performa 15 September 2026, migrasi
        // next/image): blok "gambar" menampilkan foto kreator pada RASIO
        // ASLINYA. Begitu <Image> memasang atribut width/height, UA memberi
        // elemen `aspect-ratio: width/height` -- rasio TEBAKAN kita -- sehingga
        // foto potret/panorama jadi terpotong salah. `aspect-auto`
        // mengembalikan rasio ke foto aslinya, `h-auto` membiarkan tinggi
        // dihitung dari rasio itu. 576x576 murni petunjuk srcset (lebar kolom
        // kanvas Builder max-w-xl), BUKAN rasio. Paritas dengan kasus yang SAMA
        // di PagePreview.tsx.
        <Image src={imageUrl} alt={node.title || ""} width={576} height={576} className="aspect-auto h-auto w-full rounded-xl object-cover" />
      );
      const caption = node.title && <p className={`mt-1.5 truncate text-xs font-semibold ${theme.cardTitle}`}>{node.title}</p>;
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="image" className={`w-full${ring}`}>
          {node.url && interactive ? (
            <TrackedLink username={data.username} pageSlug={data.pageSlug} linkId={node.id} href={buildUtmHref(node.url, node.title, data.utmEnabled)} className="block">
              {img}
            </TrackedLink>
          ) : (
            // Non-interactive (kanvas Builder, editing) -- SENGAJA bukan
            // `<a>` walau `node.url` terisi, pola sama persis case "button"
            // di atas: klik di kanvas harus MEMILIH blok (delegasi
            // BuilderCanvas.tsx), bukan navigasi ke url tujuan.
            img
          )}
          {caption}
        </div>
      );
    }
    case "video_image": {
      const videoUrl = (node.blockData.video_url as string) ?? "";
      const imageUrl = (node.blockData.image_url as string) ?? "";
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="video_image" className={`flex w-full flex-col gap-2 rounded-xl${ring}`}>
          {videoUrl && (
            <VideoEmbedBlock title={node.title} videoUrl={videoUrl} cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`} titleClassName={theme.cardTitle} autoplay={node.blockData.autoplay !== false} />
          )}
          {imageUrl && (
            // Rasio ASLI foto -- lihat catatan `aspect-auto h-auto` di blok
            // "image" di atas.
            <Image src={imageUrl} alt={node.title || ""} width={576} height={576} className="aspect-auto h-auto w-full rounded-xl object-cover" />
          )}
          {!videoUrl && !imageUrl && (
            <div className={`flex w-full items-center justify-center rounded-xl p-8 text-xs ${theme.card} ${theme.bio}`}>{node.title || "Video + Foto"}</div>
          )}
        </div>
      );
    }
    case "embed_link": {
      // "embed_link" -- kartu link MANUAL (judul/deskripsi/URL dari kolom
      // links yang sudah ada, PERSIS pola project_showcase, TANPA fetch
      // metadata server sama sekali), thumbnail dari block_data.image_url.
      const imageUrl = (node.blockData.image_url as string) ?? "";
      const cardClassName = `flex w-full flex-col gap-2 overflow-hidden rounded-xl p-2.5 ${theme.card}`;
      const inner = (
        <>
          {imageUrl && (
            // `h-auto` menemani `aspect-video`: atribut width/height dari
            // <Image> memberi aspect-ratio bawaan UA yang mengalahkan
            // `aspect-video` selama tinggi bukan `auto`.
            <Image src={imageUrl} alt="" width={576} height={324} className="-m-2.5 mb-0 aspect-video h-auto w-[calc(100%+20px)] object-cover" />
          )}
          <p className={`text-xs font-semibold ${theme.cardTitle}`}>{node.title}</p>
          {node.description && (
            // whitespace-pre-line -- kompatibilitas mundur: deskripsi Embed
            // Link yang dibuat SEBELUM diperluas jadi rich text (12
            // September 2026, "tiap blok yang ada teks nya buat semua jadi
            // rich teks") menyimpan plain string dgn newline literal, TANPA
            // tag <p>/<br> -- lihat catatan lengkap yang sama di blok "text".
            <p
              className={`jeon-rich-text-content whitespace-pre-line text-[11px] ${theme.bio}`}
              dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(node.description) }}
            />
          )}
        </>
      );
      if (!node.url) {
        return (
          <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="embed_link" className={`${cardClassName}${ring}`}>
            {inner}
          </div>
        );
      }
      return interactive ? (
        // ring di sini (BUKAN di <span> "contents" di bawah, yang tidak
        // punya box model sendiri jadi ring tidak akan pernah terlihat) --
        // TrackedLink itulah kartu yang benar-benar tampak.
        <TrackedLink
          key={node.id}
          username={data.username}
          pageSlug={data.pageSlug}
          linkId={node.id}
          href={buildUtmHref(node.url, node.title, data.utmEnabled)}
          className={`${cardClassName}${ring}`}
        >
          <span data-builder-node-id={node.id} data-builder-block-type="embed_link" className="contents">
            {inner}
          </span>
        </TrackedLink>
      ) : (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="embed_link" className={`${cardClassName} opacity-80${ring}`}>
          {inner}
        </div>
      );
    }
    // Fase 3 (permintaan langsung pengguna 8 September 2026): 4 tipe baru
    // + promosi "maps" (block_type lama; dulu ROOT-ONLY, sejak Builder
    // improvements 18 September 2026 boleh bersarang juga -- koordinat
    // embed_lat/embed_lng anak tertanam kini diresolusi backend persis
    // seperti root, lihat resolveNestedMapsEmbedCoords di links.go; case
    // ini SUDAH generik root/tertanam sejak awal, tidak perlu diubah).
    case "maps":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="maps" className={`w-full rounded-xl${ring}`}>
          <MapsEmbedBlock
            title={node.title}
            url={node.url ?? ""}
            embed={Boolean(node.blockData.embed)}
            embedLat={node.blockData.embed_lat as number | undefined}
            embedLng={node.blockData.embed_lng as number | undefined}
            linkClassName={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
          />
        </div>
      );
    case "image_slider":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="image_slider" className={`w-full rounded-xl${ring}`}>
          <ImageSliderBlock
            title={node.title}
            images={(node.blockData.images as string[]) ?? []}
            cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
            titleClassName={theme.cardTitle}
          />
        </div>
      );
    case "countdown":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="countdown" className={`w-full rounded-xl${ring}`}>
          <CountdownBlock
            title={node.title}
            targetAt={node.blockData.target_at as string | undefined}
            cardClassName={`w-full rounded-xl p-2.5 ${theme.card} ${theme.cardTitle}`}
            titleClassName={theme.cardTitle}
            expiredLabel="Sudah berakhir"
            unitLabels={{ days: "Hari", hours: "Jam", minutes: "Menit", seconds: "Detik" }}
            actionSlot={renderCountdownAction(node.blockData, data, theme, canBuy)}
          />
        </div>
      );
    case "list":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="list" className={`w-full rounded-xl${ring}`}>
          <ListBlock
            title={node.title}
            style={(node.blockData.style as "list" | "card" | "testimony" | undefined) ?? "list"}
            items={(node.blockData.items as ListBlockItem[]) ?? []}
            cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
            titleClassName={theme.cardTitle}
            itemTitleClassName={theme.cardTitle}
            itemBodyClassName={theme.bio}
          />
        </div>
      );
    case "embed":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="embed" className={`w-full rounded-xl${ring}`}>
          <EmbedBlock
            title={node.title}
            embedUrl={(node.blockData.embed_url as string) ?? ""}
            cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
            titleClassName={theme.cardTitle}
          />
        </div>
      );
    case "produk": {
      // "produk" -- permintaan langsung pengguna 10 September 2026:
      // tampilkan SATU (atau lebih, lihat catatan product_ids di bawah)
      // produk kreator di lokasi bebas dalam layout (beda dari grid
      // produk otomatis Halaman Toko). Reuse renderSingleProductCard APA
      // ADANYA (perilaku tombol Beli/harga/dst IDENTIK dengan kartu di
      // grid) -- fallback redup non-interaktif kalau tidak ada produk
      // valid, konsisten dengan pola blok "image"/"video_image" di atas
      // (placeholder alih-alih merender apa pun kalau isinya kosong).
      //
      // product_ids -- permintaan langsung pengguna, 12 September 2026
      // ("bisa di atur per blok misal berisi 2 produk"): blok ini SEKARANG
      // bisa menampung BANYAK produk sekaligus -- fallback baca
      // `product_id` tunggal (field lama) kalau `product_ids` tidak ada,
      // kompatibilitas mundur blok yang sudah ada di staging sebelum
      // perubahan ini (frontend TIDAK PERNAH menulis field tunggal lagi).
      const rawProductIds = node.blockData.product_ids as string[] | undefined;
      const productIds = Array.isArray(rawProductIds)
        ? rawProductIds
        : node.blockData.product_id
          ? [node.blockData.product_id as string]
          : [];
      const selectedProducts = productIds
        .map((id) => data.products.find((p) => p.id === id))
        .filter((p): p is PagePreviewProduct => !!p);
      // layout -- permintaan langsung pengguna, 11 September 2026 ("juga
      // tambahkan pilihan layout product nya", lalu "harusnya ada 4
      // pilihan layout" dikonfirmasi via AskUserQuestion: "2 variasi Kartu
      // + 2 variasi Baris") -- "row_no_image" reuse renderProductListRow
      // APA ADANYA. Bawaan "card_large" (undefined jatuh ke sini juga,
      // termasuk blok lama yang masih pakai nilai "card" sebelum opsi ini
      // diperluas jadi 4) tetap renderSingleProductCard, TIDAK ada
      // perubahan perilaku untuk blok yang sudah ada. SATU pilihan
      // "layout" berlaku untuk SEMUA produk di blok ini (bukan per-produk).
      // PRODUK_LAYOUT_RENDERERS -- dihoist ke module scope (lihat definisi
      // di atas, dekat renderProductRowWithImage) supaya dipakai bersama
      // renderLinkOrBlock (mode Simple) juga, bukan disalin dua kali.
      const renderProduct = PRODUK_LAYOUT_RENDERERS[node.blockData.layout as string] ?? renderSingleProductCard;
      const trackProduct = (productClickId: string) =>
        data.pageSlug
          ? trackEventBySlug(data.username, data.pageSlug, { event_type: "product_click", product_id: productClickId })
          : trackEvent(data.username, { event_type: "product_click", product_id: productClickId });
      const ctx = { referralCode: data.referralCode, username: data.username, pageSlug: data.pageSlug, shopPaused: data.shopPaused };
      // Bug ditemukan lewat laporan langsung pengguna, 12 September 2026
      // ("harusnya semua lebar blok itu disamakan dengan yang lain"):
      // wrapper ini SEBELUMNYA dibatasi `max-w-xs`, jadi lebih sempit dari
      // SEMUA blok lain (text/button/image/dst, semuanya cuma `w-full`
      // tanpa batas lebar) -- tidak ada alasan blok ini dikecualikan,
      // dihapus supaya konsisten dengan blok lain apa pun tata letaknya.
      //
      // Grid 2 kolom -- HANYA aktif begitu blok ini berisi 2+ produk
      // (dikonfirmasi via AskUserQuestion: jumlah kolom TETAP 2, tidak
      // perlu pengaturan terpisah). PERSIS 1 produk tetap wrapper tunggal
      // lebar penuh SEPERTI SEBELUMNYA, TIDAK berubah sama sekali -- blok
      // lama (1 produk) visual IDENTIK dgn sebelum perubahan ini.
      // useGrid dari JUMLAH TERPILIH (bukan hasil filter chip) -- lihat
      // catatan yang sama di renderLinkOrBlock, PagePreview.tsx.
      const useGrid = selectedProducts.length > 1;
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="produk" className={`w-full rounded-xl${ring}`}>
          {selectedProducts.length === 0 ? (
            <div className={`flex w-full items-center justify-center rounded-xl p-8 text-xs ${theme.card} ${theme.bio}`}>
              {node.title || "Produk"}
            </div>
          ) : (
            <ProdukCategoryFilter products={selectedProducts} enabled={node.blockData.show_category_filter === true} theme={theme}>
              {(visible) =>
                useGrid ? (
                  <div className="grid w-full grid-cols-2 gap-3">
                    {visible.map((product) => renderProduct(product, theme, canBuy, ctx, trackProduct))}
                  </div>
                ) : (
                  renderProduct(visible[0], theme, canBuy, ctx, trackProduct)
                )
              }
            </ProdukCategoryFilter>
          )}
        </div>
      );
    }
    // Fase 4 (13 September 2026, "kenapa banyak blok blok yang hilang"): 5
    // tipe klasik lama (heading/accordion/audio/file/project_showcase)
    // ditambahkan ke Builder -- pola SAMA PERSIS renderLinkOrBlock (dipakai
    // ulang komponen presentasi yang sama, VideoEmbedBlock/FaqBlock/dst
    // di atas), TAPI BuilderRenderNode TIDAK punya beberapa field root-only
    // (customIconUrl/iconKey/dst -- lihat normalizeEmbeddedBuilderNode) jadi
    // cover art audio & ikon file TIDAK tersedia utk instance blok ini
    // (baik root maupun bersarang) -- trade-off yang disengaja, bukan bug:
    // kreator yang butuh cover/ikon kustom tetap bisa pakai blok ini lewat
    // Mode Simple (dashboard/links/page.tsx) yang masih mendukungnya penuh.
    case "heading":
      return (
        <h1
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-block-type="heading"
          className={`jeon-rich-text-content w-full text-center font-heading text-xl font-bold ${theme.name}${ring}`}
          dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml((node.blockData.text as string) ?? "") }}
        />
      );
    case "accordion":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="accordion" className={`w-full rounded-xl${ring}`}>
          <FaqBlock
            title=""
            items={[{ question: node.title, answer: (node.blockData.text as string) ?? "" }]}
            cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
            titleClassName={theme.cardTitle}
            itemTitleClassName={theme.cardTitle}
            itemBodyClassName={theme.bio}
          />
        </div>
      );
    case "audio":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="audio" className={`w-full rounded-xl${ring}`}>
          <AudioPlayerBlock
            title={node.title}
            audioUrl={(node.blockData.audio_url as string) ?? ""}
            cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
            titleClassName={theme.cardTitle}
          />
        </div>
      );
    case "file":
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="file" className={`w-full rounded-xl${ring}`}>
          <FileDownloadBlock
            title={node.title}
            fileUrl={(node.blockData.file_url as string) ?? ""}
            fileName={node.blockData.file_name as string | undefined}
            fileSizeBytes={node.blockData.file_size_bytes as number | undefined}
            cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
            titleClassName={theme.cardTitle}
          />
        </div>
      );
    case "contact_form":
      // "contact_form" TERTANAM -- Builder improvements 18 September 2026
      // (dulu root-only, lihat allowedBuilderEmbeddedBlockTypes links.go).
      // Cermin PERSIS cabang contact_form di renderLinkOrBlock (PagePreview.
      // tsx): interaktif = ContactFormBlock sungguhan, pratinjau/kanvas =
      // kartu judul + tombol mati. Bedanya cuma `rootLinkId` (id root
      // pemuat, diturunkan lewat rekursi) supaya submit dari blok tertanam
      // sampai ke backend, & tanpa ikon kustom (field root-only, trade-off
      // yang sama dgn blok Fase 4 di bawah). Baris ROOT tipe ini TIDAK lewat
      // sini (lihat catatan BUILDER_NODE_BLOCK_TYPES), jadi rootLinkId di
      // sini praktis selalu terisi -- fallback ke node.id sendiri cuma
      // jaga-jaga (backend mengabaikan root_link_id kalau id-nya root asli).
      return (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="contact_form" className={`w-full rounded-xl${ring}`}>
          {interactive ? (
            <ContactFormBlock
              linkId={node.id}
              rootLinkId={rootLinkId ?? node.id}
              title={node.title}
              cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
              titleClassName={theme.cardTitle}
              inputClassName="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              buttonClassName={theme.buyButton}
            />
          ) : (
            <div className={`w-full rounded-xl p-2.5 text-center ${theme.card}`}>
              {node.title && <p className={`text-xs font-semibold ${theme.cardTitle}`}>{node.title}</p>}
              {/* div ber-role button, BUKAN <button disabled> -- alasan sama
                  persis blok "button" di atas (form control disabled tidak
                  mem-bubble-kan klik, blok jadi tidak bisa dipilih di kanvas). */}
              <div
                role="button"
                aria-disabled="true"
                title="Pratinjau -- tombol ini tidak aktif"
                className={`mt-2 w-full cursor-not-allowed rounded-lg py-1.5 text-xs ${theme.buyButton}`}
              >
                Kirim Pesan
              </div>
            </div>
          )}
        </div>
      );
    case "project_showcase": {
      // Pola SAMA PERSIS "embed_link" di atas (kartu klik penuh, gambar+
      // judul+deskripsi rich-text), tambahan badge_text di atas gambar &
      // cta_text (bawaan "Lihat detail") di bawah -- lihat renderLinkOrBlock
      // utk versi root LinkItem-nya (behaviornya disamakan persis).
      const badgeText = (node.blockData.badge_text as string) ?? "";
      const imageUrl = (node.blockData.image_url as string) ?? "";
      const ctaText = (node.blockData.cta_text as string) || "Lihat detail";
      const cardClassName = `flex w-full flex-col ${theme.cardRounded ?? "rounded-2xl"} p-4 text-left transition-all duration-300 ${theme.card}`;
      const inner = (
        <>
          {badgeText && (
            <span className={`mb-3 inline-block w-fit rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${theme.buyButton}`}>
              {badgeText}
            </span>
          )}
          {imageUrl && (
            // `h-auto` menemani `aspect-video`, alasan sama seperti blok
            // embed_link di atas.
            <Image src={imageUrl} alt="" width={576} height={324} className="mb-3 aspect-video h-auto w-full rounded-lg object-cover" />
          )}
          <p className={`text-sm font-bold ${theme.cardTitle}`}>{node.title}</p>
          {node.description && (
            <p
              className={`jeon-rich-text-content mt-1 whitespace-pre-line text-xs leading-relaxed opacity-75 ${theme.cardTitle}`}
              dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(node.description) }}
            />
          )}
          {/* Paritas PagePreview (audit kontras 25 September 2026): teks
              CTA warna judul, cuma panahnya yg warna chevron. */}
          <span className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${theme.cardTitle}`}>
            {ctaText} <IconChevronRight className={`h-3.5 w-3.5 ${theme.chevron}`} />
          </span>
        </>
      );
      if (!node.url) {
        return (
          <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="project_showcase" className={`${cardClassName}${ring}`}>
            {inner}
          </div>
        );
      }
      return interactive ? (
        <TrackedLink
          key={node.id}
          username={data.username}
          pageSlug={data.pageSlug}
          linkId={node.id}
          href={buildUtmHref(node.url, node.title, data.utmEnabled)}
          className={`${cardClassName}${ring}`}
        >
          <span data-builder-node-id={node.id} data-builder-block-type="project_showcase" className="contents">
            {inner}
          </span>
        </TrackedLink>
      ) : (
        <div key={node.id} data-builder-node-id={node.id} data-builder-block-type="project_showcase" className={`${cardClassName} opacity-80${ring}`}>
          {inner}
        </div>
      );
    }
    default:
      return null;
  }
}

// BuilderPagePreview -- lihat catatan lengkap di renderBuilderNode.
// builderMode berlaku LINTAS pageType (bio MAUPUN landing, dikonfirmasi
// via AskUserQuestion), makanya header bio (renderBioHeader) dirender
// KONDISIONAL di sini berdasar pageType, BUKAN dua komponen terpisah
// seperti ProdukPagePreview vs LandingPagePreview. Chrome luar (video
// background/tombol share/watermark/footer) SAMA PERSIS LandingPagePreview.
export default function BuilderPagePreview({
  data,
  interactive,
  rootClassName,
  theme,
  canBuy,
  hideFooterChrome = false,
  editableStickers = false,
  onStickersChange,
  selectedNodeId,
  isBuilderCanvas = false,
}: {
  data: PagePreviewData;
  interactive: boolean;
  rootClassName: string;
  theme: PageTheme;
  canBuy: boolean;
  hideFooterChrome?: boolean;
  editableStickers?: boolean;
  onStickersChange?: (stickers: PageStickerData[]) => void;
  selectedNodeId?: string;
  // isBuilderCanvas -- lihat catatan lengkap di prop yang sama pada
  // PagePreview (komponen atas). Cuma dipakai di sini utk gerbang
  // onOpenCatalog -- HANYA BuilderCanvas.tsx yang perlu klik baris blok
  // berarti "pilih node", bukan "buka katalog".
  isBuilderCanvas?: boolean;
}) {
  // isBio/isProduk -- pageType "landing" (No.99) SENGAJA "TANPA avatar/
  // produk/monetisasi" (lihat catatan lengkap di PagePreviewData.pageType).
  // pageType "produk" (Toko) diaktifkan di sini 9 September 2026
  // (permintaan langsung pengguna: "buat store page bisa mode builder
  // juga") -- SEBELUM ini `isBio` (dulu cuma `!== "landing"`) juga
  // bernilai true utk produk, membuat leadCapture/events/donation/
  // socialProof (fitur account-wide yang TIDAK PERNAH dirender
  // ProdukPagePreview) ikut tampil keliru begitu Toko dipindah ke mode
  // builder. `isBio` sekarang KETAT (bio sungguhan saja, meniru gerbang
  // yang sama persis di ProdukPagePreview yang TIDAK memanggil fitur-fitur
  // itu sama sekali) -- header avatar/nama/bio & banner shopPaused (dua-
  // duanya ADA di Toko juga) dipisah ke `showHeaderChrome`.
  const isBio = data.pageType === "bio" || data.pageType === undefined;
  const showHeaderChrome = data.pageType !== "landing";
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | undefined>(undefined);
  // catalogView -- bug dilaporkan langsung pengguna, 14 September 2026
  // (screenshot halaman publik: "kenapa blok katalog nya tidak bisa di
  // klik dan menampilkan isinya"). Blok "catalog" akar SENGAJA tidak
  // ditangani sendiri oleh renderBuilderNode (lihat catatan
  // BUILDER_NODE_BLOCK_TYPES di atas: "baris ROOT tipe itu tetap jatuh ke
  // renderLinkOrBlock yang SUDAH bekerja penuh termasuk... drill-down
  // katalog") -- TAPI klaim komentar lama itu SALAH: pemanggilan
  // renderLinkOrBlock di bawah tidak pernah dioper argumen ke-6
  // (onOpenCatalog) sama sekali, DAN komponen ini juga tidak pernah punya
  // state `catalogView`-nya sendiri (beda dari layout Bio klasik & dari
  // ProdukPagePreview yang sudah diperbaiki hari ini juga) -- jadi blok
  // Katalog akar di HALAMAN MODE BUILDER MANA PUN (bio/Toko/landing) tetap
  // tampil sbg baris tapi klik tidak melakukan apa pun sama sekali. State +
  // takeover di bawah SAMA PERSIS pola yang sudah dipakai layout Bio klasik.
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
      {isBio && interactive && data.socialProof && (
        <SocialProofToast
          recent={data.socialProof.recent}
          displaySeconds={data.socialProof.displaySeconds}
          intervalSeconds={data.socialProof.intervalSeconds}
        />
      )}
      {/* PageSwitcher (hamburger ganti halaman) -- bug dilaporkan pengguna 9
          September 2026 ("sudah aktifkan store page tapi kenapa menu
          hamburger nya tidak muncul"): akun pelapor is_published Toko-nya
          SUDAH benar & site_pages sudah berisi >=2 halaman (dikonfirmasi
          lewat GET /api/v1/pages/<username> langsung ke staging) -- akar
          masalah SEBENARNYA adalah BuilderPagePreview (builder_mode=
          "builder", akun pelapor persis dalam kondisi ini) SATU-SATUNYA
          varian preview yang TIDAK PERNAH merender <PageSwitcher> sama
          sekali, beda dari layout bio biasa (baris ~2441) & ProdukPagePreview
          (baris ~3640) yang keduanya sudah benar. Ditambal di sini,
          menyamakan struktur topbar (PageSwitcher + ShareButton via
          ml-auto) dengan kedua varian lain itu persis. */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center p-4">
        <PageSwitcher username={data.username} pages={data.sitePages} currentSlug={data.pageSlug ?? null} theme={theme} />
        <div className="ml-auto">
          <ShareButton title={`@${data.username} | Jeon.id`} url={data.pageSlug ? `${SITE_URL}/${data.username}/${data.pageSlug}` : `${SITE_URL}/${data.username}`} />
        </div>
      </div>
      <div className="relative mx-auto flex min-h-full max-w-xl flex-col items-center gap-5 px-6 py-14">
        {/* StickerOverlay -- pola SAMA PERSIS layout bio biasa di atas (lihat
            catatan lengkap di sana): anak kolom konten max-w-xl ini, BUKAN
            anak <main>, supaya basis persentase posisi x/y selalu sama
            dengan lebar kolom yang terlihat. Sebelum permintaan "design
            langsung di builder" (9 September 2026) BuilderPagePreview tidak
            pernah menerima editableStickers/onStickersChange sama sekali. */}
        <StickerOverlay stickers={data.stickers} editable={editableStickers} onChange={onStickersChange} />
        {showHeaderChrome && data.showProfileHeader !== false && (
          <div className="relative w-full">
            {theme.glow !== "hidden" && (
              <div aria-hidden className={`absolute -top-10 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full blur-3xl ${theme.glow}`} />
            )}
            <div className="relative flex flex-col items-center">{renderBioHeader(data, theme)}</div>
          </div>
        )}

        {showHeaderChrome && data.shopPaused && (
          <div className={`w-full rounded-xl p-2.5 text-center text-xs font-semibold ${theme.productCard} ${theme.bio}`}>
            {data.shopPausedMessage || "Toko sedang dijeda sementara oleh pemiliknya."}
          </div>
        )}

        {data.links.map((link) => {
          // Bug dilaporkan pengguna 9 September 2026 (akun Premium, halaman
          // utama builder_mode="builder", lalu menerapkan template Quick
          // Setup): tautan biasa/Formulir Kontak/Project Unggulan "hilang"
          // dari pratinjau & halaman publik, cuma Teks/FAQ yang tampil.
          // Akar masalah: renderBuilderNode HANYA tahu tipe blok era
          // Canvas Builder dan jatuh ke `default: return null` untuk tipe
          // klasik (link/contact_form/project_showcase/accordion/audio/file/
          // catalog/heading) -- padahal catatan BuilderPagePreview sendiri
          // bilang builderMode "HANYA mengganti cara blok Tautan dirender",
          // bukan menghapusnya. Tipe klasik di level akar dialihkan ke
          // renderLinkOrBlock dengan objek PagePreviewLink ASLI (bukan
          // BuilderRenderNode yang lossy: iconKey/customIconUrl/lockType/
          // thumbnailUrl ikut terbawa), persis seperti mode "simple".
          const blockType = link.blockType ?? "link";
          // Blok root nonaktif (18 September 2026, menu ⋮ > Nonaktifkan):
          // di kanvas Builder tetap dirender REDUP + label supaya kreator
          // tahu blok itu masih ada & bisa diaktifkan lagi -- sebelumnya
          // lenyap total dari kanvas (cuma menyisakan ring seleksi tipis).
          // Hanya mungkin true di kanvas (includeInactiveLinks), pratinjau
          // lain tidak pernah menerima blok nonaktif.
          const inactive = isBuilderCanvas && link.isActive === false;
          const inactiveWrap = (el: React.ReactNode) =>
            inactive ? (
              <div key={`inactive-${link.id}`} className="relative opacity-40">
                {el}
                <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-[#111111] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Nonaktif
                </span>
              </div>
            ) : (
              el
            );
          if (!BUILDER_NODE_BLOCK_TYPES.has(blockType)) {
            // data-builder-node-id di sini (BUKAN di dalam renderLinkOrBlock
            // sendiri, yang dibagi dengan mode "simple" & tidak tahu apa-apa
            // soal builder) -- permintaan langsung pengguna 9 September
            // 2026 "klik blok di kanvas juga": tanpa ini blok tipe klasik
            // tidak bisa diklik-pilih di kanvas sama sekali, cuma lewat tree
            // kiri.
            return inactiveWrap(
              <div
                key={link.id}
                data-builder-node-id={link.id}
                data-builder-block-type={blockType}
                className={`w-full rounded-xl${builderSelectionRing(link.id, selectedNodeId)}`}
              >
                {/* onOpenCatalog ditahan HANYA saat ini benar-benar kanvas
                    Canvas Builder sungguhan (isBuilderCanvas=true DARI
                    BuilderCanvas.tsx) -- di sana klik pada node ini dipakai
                    utk MEMILIH blok (delegasi closest
                    "[data-builder-node-id]"), BUKAN membuka takeover
                    katalog penuh layar, yang akan mengganti SELURUH kanvas
                    edit dgn CatalogTakeoverView dan mematahkan alur edit.
                    Bug ditemukan 15 September 2026 ("kenapa pratinjau tidak
                    bisa klik katalog"): versi lama menahan ini di SEMUA
                    interactive=false, termasuk LivePreviewPanel/homepage
                    template gallery yang BUKAN kanvas edit sama sekali --
                    membuka katalog di situ TIDAK PUNYA efek samping
                    sungguhan apa pun (murni state lokal, beda dari navigasi
                    TrackedLink/submit form di renderBuilderNode/
                    renderLinkOrBlock yang MEMANG harus tetap ditahan di
                    pratinjau mana pun -- lihat catatan lengkap di prop
                    isBuilderCanvas, PagePreview). */}
                {renderLinkOrBlock(link, theme, data, interactive, canBuy, interactive || !isBuilderCanvas ? setCatalogView : undefined)}
              </div>
            );
          }
          const node: BuilderRenderNode = {
            id: link.id,
            title: link.title,
            url: link.url,
            description: link.description,
            blockType,
            blockData: link.blockData ?? {},
          };
          return inactiveWrap(renderBuilderNode(node, theme, data, interactive, canBuy, selectedNodeId));
        })}

        {/* Grid produk otomatis DIHAPUS -- permintaan langsung pengguna, 15
            September 2026: "saya mau semua product yang sudah ditambahkan
            di menu product itu jangan langsung ditampilkan tapi itu data
            product yang bisa kita tampilkan ketika menambahkan blok
            produk." Lihat catatan lengkap di ProdukPagePreview (pola
            identik) -- produk TIDAK PERNAH tampil otomatis lagi di Toko
            mode builder juga, cuma lewat blok "produk" eksplisit (sudah
            dirender di .map() di atas, lewat renderBuilderNode). */}

        {isBio && data.leadCapture && (
          <div className={`flex w-full flex-col items-center gap-2 rounded-xl p-2.5 text-center ${theme.productCard}`}>
            <IconMail className={`h-5 w-5 ${theme.chevron}`} />
            <p className={`text-xs font-semibold ${theme.productTitle}`}>{data.leadCapture.title}</p>
            {interactive ? (
              <LeadCaptureForm
                username={data.username}
                collectEmail={data.leadCapture.collectEmail}
                collectWhatsapp={data.leadCapture.collectWhatsapp}
                collectTelegram={data.leadCapture.collectTelegram}
                magnetTitle={data.leadCapture.magnetTitle}
                hasVoucher={data.leadCapture.hasVoucher}
                inputClassName="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                buttonClassName={theme.buyButton}
              />
            ) : (
              <button
                type="button"
                disabled
                title="Pratinjau -- tombol ini tidak aktif"
                className={`mt-1 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
              >
                Daftar
              </button>
            )}
          </div>
        )}

        {isBio && data.events && data.events.length > 0 && (
          <div className="w-full">
            <p className={`mb-3 text-xs font-bold uppercase tracking-wider ${theme.bio}`}>Event</p>
            <div className="flex w-full flex-col gap-3">
              {data.events.map((event) => {
                const startsLabel = new Intl.DateTimeFormat("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: event.timezone,
                }).format(new Date(event.startsAt));
                const soldOut = event.spotsLeft !== null && event.spotsLeft <= 0;
                return (
                  <div key={event.productId} className={`flex flex-col gap-1.5 rounded-xl p-2.5 ${theme.productCard}`}>
                    <div className="flex items-center gap-2">
                      <IconCalendar className={`h-3.5 w-3.5 flex-shrink-0 ${theme.chevron}`} />
                      <p className={`text-xs font-semibold ${theme.productTitle}`}>{event.name}</p>
                    </div>
                    <p className={`text-[11px] ${theme.bio}`}>
                      {startsLabel} ({event.timezone}) &middot; {event.isOnline ? "Online" : event.location || "Offline"}
                    </p>
                    {event.description && <p className={`text-[11px] ${theme.bio}`}>{event.description}</p>}
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-bold ${theme.productTitle}`}>
                        Rp {event.effectivePriceIdr.toLocaleString("id-ID")}
                      </p>
                      {event.spotsLeft !== null && (
                        <p className={`text-[11px] ${theme.bio}`}>{soldOut ? "Kuota penuh" : `${event.spotsLeft} slot tersisa`}</p>
                      )}
                    </div>
                    {canBuy ? (
                      <BuyProductButton
                        productId={event.productId}
                        buttonClassName={theme.buyButton}
                        openLabel={soldOut ? "Kuota Penuh" : "Daftar"}
                        submitLabel="Bayar & Daftar"
                        referralCode={data.referralCode}
                        username={data.username}
                        pageSlug={data.pageSlug}
                        productName={event.name}
                        basePriceIdr={event.effectivePriceIdr}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled
                        title={data.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
                        className={`w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
                      >
                        Daftar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isBio && data.donation && (
          <div className={`flex w-full flex-col items-center gap-2 rounded-xl p-2.5 text-center ${theme.productCard}`}>
            <IconHeart className={`h-5 w-5 ${theme.chevron}`} />
            <p className={`text-xs font-semibold ${theme.productTitle}`}>{data.donation.title}</p>
            <p className={`text-xs ${theme.bio}`}>Mulai dari Rp {data.donation.minAmountIdr.toLocaleString("id-ID")}</p>

            {!!data.donation.goalAmountIdr && (
              <div className="w-full text-left">
                <p className={`text-[11px] font-semibold ${theme.productTitle}`}>{data.donation.goalTitle}</p>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/10">
                  <div
                    className={`h-full rounded-full bg-current opacity-80 ${theme.productTitle}`}
                    style={{ width: `${Math.min(100, ((data.donation.goalRaisedIdr ?? 0) / data.donation.goalAmountIdr) * 100)}%` }}
                  />
                </div>
                <p className={`mt-1 text-[10px] ${theme.bio}`}>
                  Rp {(data.donation.goalRaisedIdr ?? 0).toLocaleString("id-ID")} / Rp {data.donation.goalAmountIdr.toLocaleString("id-ID")}
                </p>
              </div>
            )}

            {!!data.donation.wishlist?.length && (
              <div className="flex w-full flex-col gap-1 text-left">
                <label htmlFor="donation-wishlist-select" className={`text-[10px] font-semibold ${theme.productTitle}`}>
                  Wujudkan wishlist (opsional)
                </label>
                <select
                  id="donation-wishlist-select"
                  value={selectedWishlistId ?? ""}
                  onChange={(e) => setSelectedWishlistId(e.target.value || undefined)}
                  className="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  <option value="">Dukungan umum</option>
                  {data.donation.wishlist.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} (Rp{w.raisedIdr.toLocaleString("id-ID")}/Rp{w.priceIdr.toLocaleString("id-ID")})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {canBuy ? (
              <div className="w-full">
                <BuyProductButton
                  productId={data.donation.productId}
                  buttonClassName={theme.buyButton}
                  pwywMinPriceIdr={data.donation.minAmountIdr}
                  hideVoucher
                  openLabel="Dukung"
                  submitLabel="Kirim Dukungan"
                  username={data.username}
                  pageSlug={data.pageSlug}
                  productName={data.donation.title}
                  wishlistItemId={selectedWishlistId}
                />
              </div>
            ) : (
              <button
                type="button"
                disabled
                title={data.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
                className={`mt-1 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
              >
                Dukung
              </button>
            )}
          </div>
        )}

        {!hideFooterChrome && (
          <div className="mt-auto flex flex-col items-center gap-3 pt-6">
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
