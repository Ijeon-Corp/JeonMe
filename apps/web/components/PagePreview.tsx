"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { sanitizeRichTextHtml } from "@/lib/sanitize-rich-text";
import { useLocale } from "@/lib/locale-context";
import { CustomThemeConfig, PageTheme, getPageTheme } from "@/lib/page-themes";
import type { FaqItem } from "@/components/FaqBlock";
import type { ListBlockItem } from "@/components/ListBlock";
import BuyProductButton from "@/components/BuyProductButton";
import LockedLinkButton from "@/components/LockedLinkButton";
import ProdukCategoryFilter from "@/components/ProdukCategoryFilter";
import TrackedLink from "@/components/TrackedLink";
import PageFooterLinks from "@/components/PageFooterLinks";
import ShareButton from "@/components/ShareButton";
import StickerIcon from "@/components/StickerIcon";
import { CatalogItem, EmbeddedCatalogBlock, PageStickerData, RecentPurchase, trackEvent, trackEventBySlug } from "@/lib/api-client";
import {
  IconBadgeCheck,
  IconBox,
  IconCalendar,
  IconChevronRight,
  IconHeart,
  IconInstagram,
  IconLink,
  IconMail,
  IconMapPin,
  IconMenu,
  IconTiktok,
  IconTrash,
} from "@/components/icons";
import { detectLinkIcon } from "@/lib/link-icons";
import { getLibraryIcon } from "@/lib/icon-library";
import { SocialPlatformKey, buildFilledSocialLinks } from "@/lib/social-links";
import { ChevronLeft, HelpCircle, Images as GalleryIcon, LayoutGrid, Video as VideoIcon } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import { normalizeGalleryDisplay } from "@/lib/gallery-display";

// Blok konten "langka" -- audit performa 4 September 2026 (laporan
// pengguna: "audit semua kode dari security performance ui ux dll"):
// PagePreview merender halaman publik SUNGGUHAN (bukan cuma pratinjau
// dashboard -- lihat pemanggil di app/[username]/page.tsx), rute trafik
// TERTINGGI di seluruh sistem (lihat komentar di page.go). Sebelumnya
// SEMUA 10 tipe blok ini di-import statis di atas walau kebanyakan halaman
// kreator TIDAK memakai sebagian besar tipe blok ini sama sekali (mis.
// halaman bio 5-tautan polos tanpa galeri/audio/maps/FAQ/loyalitas) --
// setiap pengunjung tetap mengunduh JS untuk SEMUANYA. next/dynamic (TANPA
// ssr:false -- blok yang benar-benar dipakai kreator tetap harus di-SSR
// demi SEO/initial paint) memecah tiap tipe jadi chunk terpisah yang cuma
// diambil browser kalau link.blockType-nya benar-benar cocok.
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

// BuilderPagePreview -- audit performa 15 September 2026 (lanjutan langsung
// dari pemecahan 13 tipe blok "langka" di atas): renderer ini HANYA dipakai
// kalau data.builderMode === "builder" (lihat dispatcher di komponen
// PagePreview di bawah) -- saling EKSKLUSIF dengan LandingPagePreview/
// ProdukPagePreview/layout bio klasik, satu halaman selalu PERSIS satu
// jenis. Sebelumnya badannya (~1000 baris, termasuk dispatcher rekursif
// renderBuilderNode) ikut statis di file ini, jadi SETIAP pengunjung
// halaman publik apa pun tetap mengunduh JS-nya walau halamannya bukan mode
// builder. Dipindah utuh ke @/components/BuilderPagePreviewInternal (lihat
// catatan di sana) & di-load lewat next/dynamic -- TANPA ssr:false, alasan
// sama persis dengan blok "langka" di atas (halaman builder sungguhan tetap
// wajib di-SSR demi SEO/initial paint).
const BuilderPagePreview = dynamic(() => import("@/components/BuilderPagePreviewInternal"));

// LandingPagePreview/ProdukPagePreview -- susulan langsung dari pemecahan
// BuilderPagePreview di atas: dua renderer page-type lain yang SAMA-SAMA
// saling eksklusif (pageType "landing"/"produk"), dipindah utuh ke file
// masing-masing (@/components/LandingPagePreviewInternal,
// @/components/ProdukPagePreviewInternal) dengan alasan & pola next/dynamic
// yang identik.
const LandingPagePreview = dynamic(() => import("@/components/LandingPagePreviewInternal"));
const ProdukPagePreview = dynamic(() => import("@/components/ProdukPagePreviewInternal"));

export interface PagePreviewLink {
  id: string;
  title: string;
  url: string;
  // "sensitive" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
  // juga sensitive content supaya nanti tampil ke user ketika mau akses".
  lockType?: "age" | "code" | "subscribe" | "sensitive";
  lockMinAge?: number | null;
  // No.77 (Sprint 9): blok konten baru -- 'link' (default) tetap tautan
  // biasa, tipe lain punya rendering & interaksi sendiri sepenuhnya.
  // No.99 (Sprint 14): heading/text/image/button -- blok builder landing page.
  // section/column/divider -- Canvas Page Builder (migrasi 000096), lihat
  // BuilderPagePreview.tsx.
  blockType?: "link" | "video" | "contact_form" | "faq" | "heading" | "text" | "image" | "button" | "maps" | "accordion" | "gallery" | "audio" | "file" | "project_showcase" | "catalog" | "section" | "column" | "divider" | "video_image" | "embed_link" | "countdown" | "list" | "image_slider" | "embed" | "produk";
  blockData?: Record<string, unknown>;
  // customIconUrl -- permintaan langsung pengguna: gambar kustom per
  // tautan, MENGGANTIKAN ikon platform yang terdeteksi otomatis dari URL
  // (lihat lib/link-icons.ts). Kosong berarti tetap pakai deteksi otomatis.
  customIconUrl?: string;
  // iconKey -- permintaan langsung pengguna, 13 Agustus 2026: ikon dipilih
  // dari galeri siap-pakai (lib/icon-library.ts). Prioritas render:
  // customIconUrl > iconKey > deteksi otomatis dari URL > ikon generik.
  iconKey?: string;
  // iconColor -- permintaan langsung pengguna, 22 Agustus 2026: warna
  // kustom ikon (hex), lihat catatan lengkap di resolveBlockIcon di bawah.
  iconColor?: string;
  // isFeatured/thumbnailUrl -- Modul "Featured Link" (permintaan langsung
  // pengguna, referensi "Featured Layout" Linktree sungguhan): kalau
  // isFeatured true DAN thumbnailUrl terisi, tautan dirender sebagai kartu
  // thumbnail 16:9 (lihat renderLinkOrBlock di bawah) -- kalau salah satu
  // kosong, jatuh balik diam-diam ke baris klasik biasa (TIDAK pernah
  // kartu kosong/rusak).
  isFeatured?: boolean;
  thumbnailUrl?: string;
  // description -- permintaan langsung pengguna, 24 Agustus 2026: subjudul
  // opsional di bawah judul (kartu ikon+judul+deskripsi+panah, contoh
  // template "Dimas Dev"). Kosong = tetap baris judul tunggal seperti
  // sebelumnya. Dipakai ulang blockType "project_showcase" sebagai
  // paragraf deskripsi -- lihat renderLinkOrBlock di bawah.
  description?: string;
}

export interface PagePreviewProduct {
  id: string;
  name: string;
  price_idr: number;
  cover_image_url?: string;
  effectivePriceIdr?: number;
  isFlashSaleActive?: boolean;
  pwywEnabled?: boolean;
  pwywMinPriceIdr?: number;
  isBundle?: boolean;
  bundleOriginalPriceIdr?: number;
  // No.91 (Sprint 11): kursus tampil di grid Produk yang sama, cukup
  // ditandai jumlah bab-nya.
  isCourse?: boolean;
  chapterCount?: number;
  // isExternalLink/externalUrl -- Modul Toko (migrasi 000068, permintaan
  // langsung pengguna: "produk bisa untuk affiliate juga ke shopee dll") --
  // lihat catatan lengkap di BuyProductButton.tsx.
  isExternalLink?: boolean;
  externalUrl?: string;
  // category -- permintaan langsung pengguna, 17 Agustus 2026: "saya mau
  // bisa buat katalog produk di halaman tokonya" -- dipakai kreator utk
  // mengelompokkan produk di dashboard, murni label manajemen internal
  // (bukan lagi dipakai tab/filter otomatis di halaman publik sejak grid
  // produk otomatis dihapus total, 15 September 2026 -- lihat catatan di
  // ProdukPagePreview/BuilderPagePreview).
  category?: string;
  // soldCount -- Advance Option "Show Unit Sold" (permintaan langsung
  // pengguna, 5 September 2026). undefined/null berarti toggle-nya mati,
  // BUKAN "belum pernah terjual" -- jangan render badge sama sekali.
  soldCount?: number | null;
}

// PagePreviewSocialFeed -- Modul Koneksi Sosial (migrasi 000069). item.url
// membuka postingan/video ASLI di platform asalnya (tab baru) -- widget
// ini murni etalase, bukan pemutar/viewer tertanam.
export interface PagePreviewSocialFeedItem {
  id: string;
  thumbnailUrl: string;
  url: string;
  caption: string;
}

export interface PagePreviewSocialFeed {
  platform: "instagram" | "tiktok";
  username: string;
  items: PagePreviewSocialFeedItem[];
}

export interface PagePreviewWishlistItem {
  id: string;
  name: string;
  priceIdr: number;
  link: string;
  raisedIdr: number;
}

export interface PagePreviewDonation {
  productId: string;
  title: string;
  minAmountIdr: number;
  // Gap #4 benchmark kompetitif (9 Agustus 2026, ala goal/wishlist Saweria/
  // Trakteer) -- goalAmountIdr 0/undefined berarti tidak ada target.
  goalTitle?: string;
  goalAmountIdr?: number;
  goalRaisedIdr?: number;
  wishlist?: PagePreviewWishlistItem[];
}

// No.90 (Sprint 11): blok event.
export interface PagePreviewEvent {
  productId: string;
  name: string;
  description: string;
  effectivePriceIdr: number;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string;
  isOnline: boolean;
  spotsLeft: number | null;
}

export interface PagePreviewLeadCapture {
  title: string;
  collectEmail: boolean;
  collectWhatsapp: boolean;
  collectTelegram: boolean;
  magnetTitle: string;
  hasVoucher: boolean;
}

export interface PagePreviewSocialProof {
  displaySeconds: number;
  intervalSeconds: number;
  recent: RecentPurchase[];
}

// PagePreviewSitePage -- lihat catatan lengkap di PagePreviewData.sitePages.
export interface PagePreviewSitePage {
  name: string;
  slug: string;
  pageType: "bio" | "landing" | "produk";
  isPrimary: boolean;
}

export interface PagePreviewData {
  id?: string;
  username: string;
  // displayName -- permintaan langsung pengguna: nama tampilan bebas (mis.
  // "PIKO"), terpisah dari username. Kosong berarti kreator belum pernah
  // mengisi -- heading jatuh balik ke username TANPA "@" (lihat render di
  // bawah), bukan dipaksa isi.
  displayName?: string;
  // No.98 (Sprint 14): diisi kalau ini halaman bio TAMBAHAN (bukan halaman
  // utama) -- membuat tracking klik/kunjungan lewat slug, bukan username
  // (lihat catatan di PageAnalytics/TrackedLink/LockedLinkButton).
  pageSlug?: string;
  // pageType -- No.99 (Sprint 14): "landing" merender blok penuh-lebar
  // (heading/text/image/button/dst) TANPA avatar/produk/monetisasi, beda
  // dari layout bio biasa. Modul Halaman Produk: "produk" merender showcase
  // katalog Toko saja (avatar/nama/bio + grid produk), TANPA
  // tautan/donasi/lead-capture/event/loyalty. Default "bio" kalau
  // tidak diisi.
  pageType?: "bio" | "landing" | "produk";
  // builderMode -- Canvas Page Builder (migrasi 000096, permintaan langsung
  // pengguna 7 September 2026, dua screenshot Lynk.id): "builder" merender
  // lewat BuilderPagePreview (kanvas Section/Column freeform) alih-alih
  // dispatcher pageType di bawah -- dicek PALING AWAL di dispatcher utama,
  // SEBELUM pageType, karena berlaku lintas pageType (bio MAUPUN landing).
  // undefined/"simple" (bawaan) = perilaku lama sepenuhnya tidak berubah.
  builderMode?: "simple" | "builder";
  bio: string;
  avatarUrl: string;
  theme: string;
  // No.88 (Sprint 10): badge terverifikasi -- dihitung backend dari email
  // terverifikasi + profil lengkap + minimal 1 transaksi sukses.
  isVerified?: boolean;
  // isPremium -- Modul Langganan Premium: kreator Premium tidak menampilkan
  // watermark "Buat halaman gratis di Jeonme" di bawah halaman publiknya.
  isPremium?: boolean;
  // hideWatermark -- Modul Langganan Premium (permintaan langsung pengguna,
  // 8 Agustus 2026): toggle yang bisa diatur SENDIRI oleh kreator Premium
  // untuk sembunyikan watermark. Watermark tampil kalau BUKAN Premium ATAU
  // togglenya mati -- lihat kondisi render pil watermark di bawah.
  hideWatermark?: boolean;
  links: PagePreviewLink[];
  products: PagePreviewProduct[];
  events?: PagePreviewEvent[];
  // No.94 (Sprint 13): cuma penanda ada/tidaknya program poin -- saldo
  // poin pengunjung dicek terpisah lewat LoyaltyPointsWidget (butuh email).
  loyaltyActive?: boolean;
  donation?: PagePreviewDonation;
  leadCapture?: PagePreviewLeadCapture;
  socialProof?: PagePreviewSocialProof;
  // No.72: kode ?ref= dari URL halaman publik -- diteruskan ke tombol Beli
  // tiap produk supaya checkout bisa mengaitkan order ke afiliator.
  referralCode?: string;
  // No.80 (Sprint 9): hanya dipakai kalau theme === "custom".
  customTheme?: CustomThemeConfig;
  // Modul Toko (Fase E5): true kalau kreator menjeda tokonya dari tab Shop
  // Settings -- tombol beli disembunyikan & pesannya ditampilkan sebagai
  // banner. Backend TETAP menolak checkout walau field ini dilewati/diubah
  // di klien (lihat checkout.go Create).
  shopPaused?: boolean;
  shopPausedMessage?: string;
  // showProfileHeader -- permintaan langsung pengguna, 28 Agustus 2026:
  // "biasanya page baru untuk landing page biasanya bisa juga tidak
  // menampilkan foto profile nama dsb gitu". false menyembunyikan
  // renderBioHeader di layout bio biasa (BUKAN produk/landing -- landing
  // SUDAH SELALU tanpa header lewat LandingPagePreview terpisah, lihat
  // catatan di sana). undefined dibaca setara true (dashboard mini-preview
  // tidak selalu mengisi field ini, lihat toPreviewData).
  showProfileHeader?: boolean;
  // sitePages -- permintaan langsung pengguna, 28 Agustus 2026: "aktifkan
  // menu hamburger jika ada page lebih dari satu". Menggantikan
  // shopPublished (SEBELUMNYA: binary Bio<->Toko saja) -- daftar SEMUA
  // halaman TERBIT milik akun, dipakai PageSwitcher di bawah. undefined/
  // array 0-1 item berarti hamburger tidak dirender sama sekali (tidak ada
  // halaman lain untuk dipindah).
  sitePages?: PagePreviewSitePage[];
  // stickers -- Modul Desain: stiker dekoratif INTERAKTIF (posisi & ukuran
  // sendiri per stiker, diatur lewat StickerCanvasEditor di dashboard).
  // Array kosong/undefined = tidak ada.
  stickers?: PageStickerData[];
  // social -- permintaan langsung pengguna, 11 Agustus 2026: baris ikon
  // kontak sosial di bawah bio. Key kosong/tidak ada = platform itu belum
  // diisi, ikonnya tidak dirender (lihat buildFilledSocialLinks).
  social?: Partial<Record<SocialPlatformKey, string>>;
  // instagramFeed/tiktokFeed -- Modul Koneksi Sosial (migrasi 000069,
  // permintaan langsung pengguna, 17 Agustus 2026: "saya mau jeonme ini
  // bisa connect ke akun kita contoh nya instagram tiktok"). undefined
  // kalau kreator belum connect platform itu -- lihat renderSocialFeed di
  // bawah. Cuma dirender di layout bio biasa (BUKAN Toko/ProdukPagePreview
  // -- ini fitur profil, bukan katalog produk, konsisten dengan cakupan
  // ProdukPagePreview yang sengaja "TANPA tautan/donasi/dst").
  instagramFeed?: PagePreviewSocialFeed;
  tiktokFeed?: PagePreviewSocialFeed;
  // layoutVariant -- permintaan langsung pengguna, 11 Agustus 2026
  // (susulan Quick Setup, "layouting nya juga berbeda"), "card" & "spotlight"
  // ditambah 12 Agustus 2026 (susulan lagi, "tambahkan jenis model layout
  // selain 2 yang sudah ada"): "centered" (bawaan, undefined jatuh balik ke
  // ini), "banner" (avatar+nama+bio rata kiri sebaris ala kartu profil
  // bisnis), "card" (identitas dibungkus kartu bertema, avatar menonjol di
  // tepi atas), "spotlight" (avatar besar, nama dalam badge bulat, ikon
  // sosial lebih menonjol). Cuma berlaku di layout bio biasa & Toko
  // (ProdukPagePreview) -- lihat renderBioHeader di bawah.
  //
  // Revisi 20 Agustus 2026 (permintaan langsung pengguna): "saya mau
  // tambahkan jadi total 15 layout yang berbeda ambil referensi dari web
  // serupa dan buat unik dan sesuai dengan kategorinya" -- 7 varian baru
  // ditambah ("split"/"ticket"/"headline"/"ribbon"/"duo"/"masthead"/
  // "portrait"), lihat catatan lengkap tiap varian di renderBioHeader.
  layoutVariant?:
    | "centered"
    | "banner"
    | "card"
    | "spotlight"
    | "cover"
    | "minimal"
    | "hero"
    | "polaroid"
    | "split"
    | "ticket"
    | "headline"
    | "ribbon"
    | "duo"
    | "masthead"
    | "portrait";
  // utmEnabled -- Modul Analitik Pihak Ketiga (permintaan langsung
  // pengguna, 12 Agustus 2026): kalau true, SETIAP tautan keluar
  // (TrackedLink) ditandai utm_source=jeonme&utm_medium=social&
  // utm_campaign=<judul tautan> sebelum dibuka pengunjung -- lihat
  // buildUtmHref. Cuma dikirim backend kalau kreator Premium (gerbang di
  // publicAnalytics, page.go) -- undefined/false di sini berarti "tidak
  // menandai apa pun", TIDAK ADA bedanya secara perilaku.
  utmEnabled?: boolean;
}

// buildUtmHref -- permintaan langsung pengguna: "Parameter kampanye
// diatur otomatis dari judul tiap tautan" (referensi Linktree). Dilewati
// diam-diam (kembalikan url apa adanya) untuk URL yang bukan http/https
// (mailto:, tel:, javascript:, dst) ATAU yang gagal di-parse -- UTM cuma
// masuk akal untuk kunjungan halaman web sungguhan.
export function buildUtmHref(url: string, title: string, utmEnabled: boolean | undefined): string {
  if (!utmEnabled) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
    parsed.searchParams.set("utm_source", "jeonme");
    parsed.searchParams.set("utm_medium", "social");
    parsed.searchParams.set("utm_campaign", title);
    return parsed.toString();
  } catch {
    return url;
  }
}

export interface PreviewSourcePage {
  username: string;
  display_name?: string;
  bio: string;
  avatar_url: string;
  theme: string;
  stickers?: PageStickerData[];
  custom_background_type?: CustomThemeConfig["backgroundType"];
  custom_background_value?: string;
  custom_font?: CustomThemeConfig["font"];
  custom_button_color?: string;
  custom_button_style?: CustomThemeConfig["buttonStyle"];
  custom_button_rounded?: CustomThemeConfig["buttonRounded"];
  custom_button_shadow?: CustomThemeConfig["buttonShadow"];
  custom_button_text_color?: string;
  custom_page_text_color?: string;
  custom_title_font?: CustomThemeConfig["titleFont"];
  custom_title_color?: string;
  custom_style_override?: boolean;
  is_verified?: boolean;
  is_premium?: boolean;
  hide_watermark?: boolean;
  show_profile_header?: boolean;
  // social_instagram..social_email -- permintaan langsung pengguna, 11
  // Agustus 2026: sumber untuk field `social` PagePreviewData, supaya
  // Pratinjau Langsung di dashboard (dibangun lewat toPreviewData ini, BEDA
  // dari mapping halaman publik sungguhan di app/[username]/page.tsx &
  // app/p/[slug]/page.tsx) ikut menampilkan ikon kontak sosial, bukan cuma
  // halaman publik setelah diterbitkan.
  social_instagram?: string;
  social_tiktok?: string;
  social_facebook?: string;
  social_whatsapp?: string;
  social_youtube?: string;
  social_x?: string;
  social_linkedin?: string;
  social_telegram?: string;
  social_email?: string;
  social_github?: string;
  social_website?: string;
  layout_variant?:
    | "centered"
    | "banner"
    | "card"
    | "spotlight"
    | "cover"
    | "minimal"
    | "hero"
    | "polaroid"
    | "split"
    | "ticket"
    | "headline"
    | "ribbon"
    | "duo"
    | "masthead"
    | "portrait";
  // builder_mode -- lihat catatan lengkap di PagePreviewData.builderMode.
  builder_mode?: "simple" | "builder";
}

export interface PreviewSourceLink {
  id: string;
  title: string;
  url: string;
  is_active: boolean;
  lock_type?: "" | "age" | "code" | "subscribe" | "sensitive";
  lock_min_age?: number | null;
  block_type?: "link" | "video" | "contact_form" | "faq" | "heading" | "text" | "image" | "button" | "maps" | "accordion" | "gallery" | "audio" | "file" | "project_showcase" | "catalog" | "section" | "column" | "divider" | "video_image" | "embed_link" | "countdown" | "list" | "image_slider" | "embed" | "produk";
  block_data?: Record<string, unknown>;
  custom_icon_url?: string;
  icon_key?: string;
  icon_color?: string;
  is_featured?: boolean;
  thumbnail_url?: string;
  description?: string;
}

export interface PreviewSourceProduct {
  id: string;
  name: string;
  price_idr: number;
  cover_image_url: string;
  is_active: boolean;
  effective_price_idr?: number;
  is_flash_sale_active?: boolean;
  pwyw_enabled?: boolean;
  pwyw_min_price_idr?: number | null;
  is_bundle?: boolean;
  bundle_original_price_idr?: number | null;
  product_kind?: string;
  external_url?: string;
  category?: string;
  show_sold_count?: boolean;
  sold_count?: number;
}

// PageSwitcher -- hamburger kiri-atas untuk berpindah antar halaman
// (permintaan langsung pengguna, 19 Agustus 2026: "karna 1 akun punya dua
// halaman yaitu link bio dan toko tambahkan hamburger button di kiri atas
// menampilkan page toko atau bio"). Perlu jadi KOMPONEN sungguhan (bukan
// sekadar fungsi render biasa) karena butuh state buka/tutup sendiri.
//
// Revisi 28 Agustus 2026 (permintaan langsung pengguna: "aktifkan menu
// hamburger jika ada page lebih dari satu"): SEBELUMNYA binary Bio<->Toko
// saja (2 baris hardcode, showToko/current: "bio"|"produk") -- sekarang
// generik untuk SEMUA halaman TERBIT milik akun (bio/landing/produk
// sekaligus, `pages` dari publicPageResponse.SitePages via
// PagePreviewData.sitePages), tampil/sembunyi murni dari JUMLAHNYA (>=2)
// bukan lagi field boolean terpisah -- kalau cuma ada 1 halaman (dirinya
// sendiri), tidak ada tempat lain untuk pindah, hamburger tidak berguna.
//
// currentSlug null berarti halaman utama yang sedang aktif (pageSlug
// kosong di PagePreviewData) -- entri is_primary di `pages` dicocokkan ke
// itu, entri lain dicocokkan by slug (unik PER-USER sejak migrasi 000079,
// jadi aman dibandingkan langsung tanpa perlu id).
export function PageSwitcher({
  username,
  pages,
  currentSlug,
  theme,
}: {
  username: string;
  pages?: PagePreviewSitePage[];
  currentSlug: string | null;
  theme: PageTheme;
}) {
  const [open, setOpen] = useState(false);
  if (!pages || pages.length < 2) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ganti halaman"
        className={`flex h-8 w-8 items-center justify-center rounded-full ${theme.card}`}
      >
        <IconMenu className={`h-4 w-4 ${theme.chevron}`} />
      </button>
      {open && (
        <>
          <div aria-hidden className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-xl shadow-card ${theme.card}`}>
            {pages.map((p) => {
              const isCurrent = p.isPrimary ? currentSlug === null : currentSlug === p.slug;
              const href = p.isPrimary ? `${SITE_URL}/${username}` : `${SITE_URL}/${username}/${p.slug}`;
              const Icon = p.pageType === "produk" ? IconBox : IconLink;
              return (
                <a
                  key={p.isPrimary ? "primary" : p.slug}
                  href={href}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold ${theme.productTitle} ${
                    isCurrent ? "opacity-100" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{p.isPrimary ? "Link Bio" : p.name}</span>
                </a>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// renderSingleProductCard -- kartu SATU produk (isExternalLink dapat
// perlakuan khusus: seluruh kartu jadi <a> menuju tautan afiliasi, tombol
// "Lihat Produk ↗" bukan "Beli" karena tidak pernah ada transaksi lewat
// Jeon.id untuk produk jenis ini). Dipakai ULANG oleh blok "produk"
// (renderBuilderNode/renderLinkOrBlock di bawah, lewat PRODUK_LAYOUT_
// RENDERERS) -- satu-satunya jalan produk tampil di halaman publik sejak
// grid produk OTOMATIS dihapus total (permintaan langsung pengguna, 15
// September 2026: "saya mau semua product yang sudah ditambahkan di menu
// product itu jangan langsung ditampilkan tapi itu data product yang bisa
// kita tampilkan ketika menambahkan blok produk" -- lihat catatan lengkap
// di ProdukPagePreview/BuilderPagePreview).
// renderProductPriceBlock -- diekstrak dari renderSingleProductCard (blok
// "produk"/harga PWYW/flash-sale/bundle, APA ADANYA) supaya bisa dipakai
// ULANG oleh renderProductListRow (layout "list", permintaan langsung
// pengguna 11 September 2026) tanpa duplikasi ternary yang sama.
function renderProductPriceBlock(product: PagePreviewProduct, theme: PageTheme): React.ReactNode {
  if (product.pwywEnabled) {
    return (
      <p className={`text-xs font-bold ${theme.productPrice}`}>
        Mulai dari Rp {(product.pwywMinPriceIdr ?? 0).toLocaleString("id-ID")}
      </p>
    );
  }
  if (product.isBundle && product.bundleOriginalPriceIdr !== undefined) {
    return (
      <div className="flex items-center gap-1.5">
        <p className={`text-[10px] line-through opacity-60 ${theme.productPrice}`}>
          Rp {product.bundleOriginalPriceIdr.toLocaleString("id-ID")}
        </p>
        <p className={`text-xs font-bold ${theme.productPrice}`}>Rp {product.price_idr.toLocaleString("id-ID")}</p>
      </div>
    );
  }
  if (product.isFlashSaleActive && product.effectivePriceIdr !== undefined) {
    return (
      <div className="flex items-center gap-1.5">
        <p className={`text-[10px] line-through opacity-60 ${theme.productPrice}`}>Rp {product.price_idr.toLocaleString("id-ID")}</p>
        <p className={`text-xs font-bold ${theme.productPrice}`}>Rp {product.effectivePriceIdr.toLocaleString("id-ID")}</p>
      </div>
    );
  }
  if (product.isExternalLink && product.price_idr === 0) {
    // Harga opsional khusus Link Eksternal (permintaan langsung pengguna,
    // 20 Agustus 2026: "untuk produk affiliate harga jadikan optional") --
    // 0 berarti sengaja tidak diisi (jenis produk lain harga tetap wajib
    // >= Rp1.000, jadi 0 TIDAK PERNAH berarti "gratis" untuk mereka),
    // jangan tampilkan baris harga sama sekali daripada "Rp 0".
    return null;
  }
  return <p className={`text-xs font-bold ${theme.productPrice}`}>Rp {product.price_idr.toLocaleString("id-ID")}</p>;
}

export function renderSingleProductCard(
  product: PagePreviewProduct,
  theme: PageTheme,
  canBuy: boolean,
  ctx: { referralCode?: string; username: string; pageSlug?: string; shopPaused?: boolean },
  onTrackClick: (productId: string) => void
): React.ReactNode {
  const cover = (
    // `relative` DITAMBAHKAN ke pembungkus (audit performa 15 September 2026):
    // <Image fill> mensyaratkan ancestor ber-position selain static. Murni
    // penambahan positioning context, tidak mengubah tata letak apa pun --
    // pembungkus ini tidak punya anak ber-posisi absolut lain.
    <div className={`relative mb-2 flex aspect-square items-center justify-center rounded-xl ${theme.card}`}>
      {product.cover_image_url ? (
        // `fill` karena lebar kartu ikut kolom (kartu ini dipakai penuh-kolom
        // MAUPUN di dalam grid-cols-2, lihat pemanggil) -- tidak ada satu angka
        // lebar yang benar untuk keduanya. `sizes` sengaja dipatok selebar
        // kolom penuh (max-w-md = 448px), bukan setengahnya: di layar retina
        // (DPR 2) kartu setengah-kolom ~194px pun tetap butuh ~388px piksel
        // fisik, jadi 448px justru angka yang pas untuk KEDUA kasus sekaligus
        // -- dan tetap jauh lebih kecil dari unggahan asli yang bisa 1600px.
        <Image src={product.cover_image_url} alt={product.name} fill sizes="(max-width: 448px) 100vw, 448px" className="rounded-xl object-cover" />
      ) : (
        <IconBox className={`h-6 w-6 ${theme.chevron}`} />
      )}
    </div>
  );
  const priceBlock = renderProductPriceBlock(product, theme);

  if (product.isExternalLink && product.externalUrl) {
    return (
      <a
        key={product.id}
        href={product.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onTrackClick(product.id)}
        className={`flex flex-col rounded-xl p-2.5 ${theme.productCard}`}
      >
        {cover}
        <p className={`truncate text-xs font-semibold ${theme.productTitle}`}>{product.name}</p>
        {priceBlock}
        <span className={`mt-2.5 block w-full rounded-lg py-1.5 text-center text-xs transition-all duration-200 ${theme.buyButton}`}>
          Lihat Produk ↗
        </span>
      </a>
    );
  }

  return (
    <div key={product.id} className={`flex flex-col rounded-xl p-2.5 ${theme.productCard}`}>
      {cover}
      <p className={`truncate text-xs font-semibold ${theme.productTitle}`}>{product.name}</p>
      {product.isCourse && <p className={`text-[10px] opacity-70 ${theme.productPrice}`}>{product.chapterCount ?? 0} Bab</p>}
      {typeof product.soldCount === "number" && (
        <p className={`text-[10px] opacity-70 ${theme.productPrice}`}>{product.soldCount} terjual</p>
      )}
      {priceBlock}
      {canBuy ? (
        <BuyProductButton
          productId={product.id}
          buttonClassName={theme.buyButton}
          pwywMinPriceIdr={product.pwywEnabled ? product.pwywMinPriceIdr : undefined}
          referralCode={ctx.referralCode}
          username={ctx.username}
          pageSlug={ctx.pageSlug}
          productName={product.name}
          basePriceIdr={product.effectivePriceIdr ?? product.price_idr}
          category={product.category}
        />
      ) : (
        <button
          type="button"
          disabled
          title={ctx.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
          className={`mt-2.5 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
        >
          Beli
        </button>
      )}
    </div>
  );
}

// renderProductListRow -- layout "list" (permintaan langsung pengguna 11
// September 2026: "tambahkan tipe layout 1 lagi yaitu 1 baris blok penuh
// tanpa gambar"): SATU blok penuh lebar per produk, SAMA PERSIS
// renderSingleProductCard TAPI TANPA `cover` sama sekali (bukan cover
// kosong/placeholder ikon -- dihilangkan total) -- cocok untuk daftar
// padat banyak item. Vertikal (nama -> harga -> tombol Beli), BUKAN
// horizontal -- BuyProductButton SELALU `w-full` (lihat komponennya
// sendiri), memaksanya ke kolom sempit sebelah kartu akan bikin lebar
// tombol ambigu/tidak terduga, jadi tata letak di sini SENGAJA tetap
// menumpuk vertikal seperti kartu biasa, cuma minus gambarnya.
function renderProductListRow(
  product: PagePreviewProduct,
  theme: PageTheme,
  canBuy: boolean,
  ctx: { referralCode?: string; username: string; pageSlug?: string; shopPaused?: boolean },
  onTrackClick: (productId: string) => void
): React.ReactNode {
  const priceBlock = renderProductPriceBlock(product, theme);

  if (product.isExternalLink && product.externalUrl) {
    return (
      <a
        key={product.id}
        href={product.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onTrackClick(product.id)}
        className={`flex w-full flex-col rounded-xl p-3 ${theme.productCard}`}
      >
        <p className={`truncate text-sm font-semibold ${theme.productTitle}`}>{product.name}</p>
        {priceBlock}
        <span className={`mt-2.5 block w-full rounded-lg py-1.5 text-center text-xs transition-all duration-200 ${theme.buyButton}`}>
          Lihat Produk ↗
        </span>
      </a>
    );
  }

  return (
    <div key={product.id} className={`flex w-full flex-col rounded-xl p-3 ${theme.productCard}`}>
      <p className={`truncate text-sm font-semibold ${theme.productTitle}`}>{product.name}</p>
      {product.isCourse && <p className={`text-[10px] opacity-70 ${theme.productPrice}`}>{product.chapterCount ?? 0} Bab</p>}
      {typeof product.soldCount === "number" && (
        <p className={`text-[10px] opacity-70 ${theme.productPrice}`}>{product.soldCount} terjual</p>
      )}
      {priceBlock}
      {canBuy ? (
        <BuyProductButton
          productId={product.id}
          buttonClassName={theme.buyButton}
          pwywMinPriceIdr={product.pwywEnabled ? product.pwywMinPriceIdr : undefined}
          referralCode={ctx.referralCode}
          username={ctx.username}
          pageSlug={ctx.pageSlug}
          productName={product.name}
          basePriceIdr={product.effectivePriceIdr ?? product.price_idr}
          category={product.category}
        />
      ) : (
        <button
          type="button"
          disabled
          title={ctx.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
          className={`mt-2.5 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
        >
          Beli
        </button>
      )}
    </div>
  );
}

// renderProductCardSmall -- opsi ke-2 dari 4 tata letak blok "produk"
// (permintaan langsung pengguna 11 September 2026, dikonfirmasi via
// AskUserQuestion: "2 variasi Kartu + 2 variasi Baris"): versi lebih
// PADAT dari renderSingleProductCard -- gambar pita pendek (BUKAN
// aspect-square penuh) + padding/ukuran font lebih kecil, cocok kalau
// blok ini diletakkan di antara konten lain yang tidak butuh kartu besar.
function renderProductCardSmall(
  product: PagePreviewProduct,
  theme: PageTheme,
  canBuy: boolean,
  ctx: { referralCode?: string; username: string; pageSlug?: string; shopPaused?: boolean },
  onTrackClick: (productId: string) => void
): React.ReactNode {
  const cover = (
    // `relative` ditambahkan untuk <Image fill>, alasan sama seperti
    // renderSingleProductCard di atas.
    <div className={`relative mb-1.5 flex h-20 items-center justify-center rounded-lg ${theme.card}`}>
      {product.cover_image_url ? (
        // `fill` -- tingginya TETAP (h-20) tapi lebarnya ikut kolom/grid, jadi
        // pasangan width/height literal tidak bisa dipakai.
        <Image src={product.cover_image_url} alt={product.name} fill sizes="(max-width: 448px) 100vw, 448px" className="rounded-lg object-cover" />
      ) : (
        <IconBox className={`h-5 w-5 ${theme.chevron}`} />
      )}
    </div>
  );
  const priceBlock = renderProductPriceBlock(product, theme);

  if (product.isExternalLink && product.externalUrl) {
    return (
      <a
        key={product.id}
        href={product.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onTrackClick(product.id)}
        className={`flex flex-col rounded-lg p-2 ${theme.productCard}`}
      >
        {cover}
        <p className={`truncate text-[11px] font-semibold ${theme.productTitle}`}>{product.name}</p>
        {priceBlock}
        <span className={`mt-1.5 block w-full rounded-md py-1 text-center text-[11px] transition-all duration-200 ${theme.buyButton}`}>
          Lihat Produk ↗
        </span>
      </a>
    );
  }

  return (
    <div key={product.id} className={`flex flex-col rounded-lg p-2 ${theme.productCard}`}>
      {cover}
      <p className={`truncate text-[11px] font-semibold ${theme.productTitle}`}>{product.name}</p>
      {priceBlock}
      {canBuy ? (
        <BuyProductButton
          productId={product.id}
          buttonClassName={theme.buyButton}
          pwywMinPriceIdr={product.pwywEnabled ? product.pwywMinPriceIdr : undefined}
          referralCode={ctx.referralCode}
          username={ctx.username}
          pageSlug={ctx.pageSlug}
          productName={product.name}
          basePriceIdr={product.effectivePriceIdr ?? product.price_idr}
          category={product.category}
        />
      ) : (
        <button
          type="button"
          disabled
          title={ctx.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
          className={`mt-1.5 w-full cursor-not-allowed rounded-md py-1 text-[11px] opacity-80 ${theme.buyButton}`}
        >
          Beli
        </button>
      )}
    </div>
  );
}

// renderProductRowWithImage -- opsi ke-3 dari 4 tata letak blok "produk"
// (permintaan sama, 11 September 2026): baris horizontal (thumbnail
// kecil + nama/harga sejajar), tombol Beli TETAP baris PENUH sendiri di
// bawahnya -- BUKAN disejajarkan horizontal dgn thumbnail, karena
// BuyProductButton SELALU `w-full` (lihat komponennya sendiri), memaksanya
// ke kolom sempit di sebelah thumbnail akan bikin lebar tombol ambigu.
function renderProductRowWithImage(
  product: PagePreviewProduct,
  theme: PageTheme,
  canBuy: boolean,
  ctx: { referralCode?: string; username: string; pageSlug?: string; shopPaused?: boolean },
  onTrackClick: (productId: string) => void
): React.ReactNode {
  const priceBlock = renderProductPriceBlock(product, theme);
  const thumb = (
    <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg ${theme.card}`}>
      {product.cover_image_url ? (
        // Ukuran TETAP 48x48 (h-12 w-12 flex-shrink-0) -- di sini `fill` tidak
        // perlu sama sekali karena kotaknya memang pasti, jadi width/height
        // literal lebih sederhana DAN memberi Next.js srcset 1x/2x yang tepat.
        <Image src={product.cover_image_url} alt={product.name} width={48} height={48} className="h-full w-full rounded-lg object-cover" />
      ) : (
        <IconBox className={`h-4 w-4 ${theme.chevron}`} />
      )}
    </div>
  );
  const info = (
    <div className="min-w-0 flex-1">
      <p className={`truncate text-sm font-semibold ${theme.productTitle}`}>{product.name}</p>
      {product.isCourse && <p className={`text-[10px] opacity-70 ${theme.productPrice}`}>{product.chapterCount ?? 0} Bab</p>}
      {typeof product.soldCount === "number" && (
        <p className={`text-[10px] opacity-70 ${theme.productPrice}`}>{product.soldCount} terjual</p>
      )}
      {priceBlock}
    </div>
  );

  if (product.isExternalLink && product.externalUrl) {
    return (
      <a
        key={product.id}
        href={product.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onTrackClick(product.id)}
        className={`flex w-full flex-col rounded-xl p-3 ${theme.productCard}`}
      >
        <div className="flex items-center gap-3">
          {thumb}
          {info}
        </div>
        <span className={`mt-2.5 block w-full rounded-lg py-1.5 text-center text-xs transition-all duration-200 ${theme.buyButton}`}>
          Lihat Produk ↗
        </span>
      </a>
    );
  }

  return (
    <div key={product.id} className={`flex w-full flex-col rounded-xl p-3 ${theme.productCard}`}>
      <div className="flex items-center gap-3">
        {thumb}
        {info}
      </div>
      {canBuy ? (
        <BuyProductButton
          productId={product.id}
          buttonClassName={theme.buyButton}
          pwywMinPriceIdr={product.pwywEnabled ? product.pwywMinPriceIdr : undefined}
          referralCode={ctx.referralCode}
          username={ctx.username}
          pageSlug={ctx.pageSlug}
          productName={product.name}
          basePriceIdr={product.effectivePriceIdr ?? product.price_idr}
          category={product.category}
        />
      ) : (
        <button
          type="button"
          disabled
          title={ctx.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
          className={`mt-2.5 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
        >
          Beli
        </button>
      )}
    </div>
  );
}

// PRODUK_LAYOUT_RENDERERS -- 4 opsi tata letak blok "produk" tunggal
// (dikonfirmasi via AskUserQuestion: "2 variasi Kartu + 2 variasi Baris"),
// dipakai KEDUA renderer (renderBuilderNode DAN renderLinkOrBlock, "full
// parity" mode Simple 12 September 2026) -- dihoist ke module scope
// (SEBELUMNYA didefinisikan lokal di dalam renderBuilderNode) supaya
// keduanya benar-benar berbagi SATU sumber kebenaran pemetaan layout,
// bukan disalin dua kali. "list" -- kompatibilitas mundur (nilai lama
// sebelum diperluas jadi 4 opsi).
export const PRODUK_LAYOUT_RENDERERS: Record<string, typeof renderSingleProductCard> = {
  card_small: renderProductCardSmall,
  row_with_image: renderProductRowWithImage,
  row_no_image: renderProductListRow,
  list: renderProductListRow,
};

// renderCountdownAction -- susulan 14 September 2026 (permintaan langsung
// pengguna: "Countdown yang bisa nge-trigger tombol Beli langsung itu
// levernya besar untuk flash sale"). Dipakai bersama oleh renderLinkOrBlock
// (mode Simple) DAN renderBuilderNode (Canvas Builder) -- satu sumber
// kebenaran, bukan disalin dua kali (pola sama seperti PRODUK_LAYOUT_
// RENDERERS di atas). Prioritas: product_id terisi & produknya ketemu ->
// render KARTU PRODUK PENUH (bukan cuma tombol Beli polos -- reuse
// renderSingleProductCard apa adanya supaya nama/harga/gambar produk ikut
// tampil, konsisten dgn blok "produk" biasa) DI BAWAH hitung mundur;
// kalau tidak, fallback ke CTA generik (cta_label/cta_url, sama pola
// dengan blok "text"/"list") kalau url-nya terisi; kalau keduanya kosong,
// undefined (CountdownBlock tidak merender apa pun tambahan, perilaku lama
// utuh). Kepemilikan product_id SUDAH diverifikasi backend lewat
// checkBuilderProductOwnership (collectBuilderProductIDs disusuri utk
// blockType "countdown" juga) -- di sini murni tampilan.
export function renderCountdownAction(
  blockData: Record<string, unknown> | undefined,
  data: Pick<PagePreviewData, "username" | "pageSlug" | "utmEnabled" | "products" | "referralCode" | "shopPaused">,
  theme: PageTheme,
  canBuy: boolean
): React.ReactNode | undefined {
  const productId = blockData?.product_id as string | undefined;
  if (productId) {
    const product = data.products.find((p) => p.id === productId);
    if (product) {
      const trackProduct = (productClickId: string) =>
        data.pageSlug
          ? trackEventBySlug(data.username, data.pageSlug, { event_type: "product_click", product_id: productClickId })
          : trackEvent(data.username, { event_type: "product_click", product_id: productClickId });
      const ctx = { referralCode: data.referralCode, username: data.username, pageSlug: data.pageSlug, shopPaused: data.shopPaused };
      return renderSingleProductCard(product, theme, canBuy, ctx, trackProduct);
    }
  }
  const ctaUrl = (blockData?.cta_url as string | undefined)?.trim();
  if (ctaUrl) {
    const ctaLabel = (blockData?.cta_label as string | undefined)?.trim();
    return (
      <a
        href={ctaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`block w-full rounded-lg py-2 text-center text-xs font-bold transition-all duration-200 ${theme.buyButton}`}
      >
        {ctaLabel || "Lihat"}
      </a>
    );
  }
  return undefined;
}

// renderSocialFeed -- Modul Koneksi Sosial (migrasi 000069, permintaan
// langsung pengguna: "saya mau jeonme ini bisa connect ke akun kita contoh
// nya instagram tiktok", diriset dulu vs Linktree: profil + s/d 6
// postingan/video TERBARU dalam grid 3 kolom, tiap kartu membuka
// postingan/video ASLI di tab baru -- pola sama seperti Products/Events
// yang sudah ada). undefined/items kosong -> tidak dirender sama sekali
// (bukan kartu kosong).
function renderSocialFeed(feed: PagePreviewSocialFeed | undefined, theme: PageTheme) {
  if (!feed || feed.items.length === 0) return null;
  const Icon = feed.platform === "instagram" ? IconInstagram : IconTiktok;
  return (
    <div className="mt-8 w-full">
      <p className={`mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${theme.bio}`}>
        <Icon className="h-3.5 w-3.5" />
        {feed.platform === "instagram" ? "Instagram" : "TikTok"} &middot; @{feed.username}
      </p>
      <div className="grid w-full grid-cols-3 gap-1.5">
        {feed.items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            title={item.caption}
            className={`aspect-square overflow-hidden rounded-lg ${theme.card}`}
          >
            {item.thumbnailUrl ? (
              // SENGAJA TETAP <img> mentah (audit performa 15 September 2026,
              // migrasi next/image): thumbnail feed ini URL CDN Instagram/TikTok
              // MENTAH (social_connect.go menyimpan m.ThumbnailURL/
              // v.CoverImageURL apa adanya, tanpa di-rehost ke storage sendiri).
              // Host-nya berrotasi & bertanda tangan + berumur pendek
              // (scontent-*.cdninstagram.com, *.fbcdn.net, p16-sign-*.
              // tiktokcdn.com, ...) -- mustahil dienumerasi jujur di
              // images.remotePatterns, dan kalaupun dipaksa, URL yang berubah
              // tiap fetch membuat cache image optimizer tidak pernah kena.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.thumbnailUrl} alt={item.caption} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className={`flex h-full w-full items-center justify-center ${theme.chevron}`}>
                <Icon className="h-5 w-5" />
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

// renderLinkOrBlock -- dipulas jadi fungsi berdiri sendiri (Modul Halaman
// Toko, 7 Agustus 2026) supaya bisa dipakai ulang oleh ProdukPagePreview di
// bawah, bukan cuma layout bio biasa -- sebelumnya JSX ini inline di dalam
// satu `.map()` di komponen default, sekarang jadi satu sumber kebenaran
// untuk cara SEMUA tipe halaman merender tautan/blok konten (link/video/
// faq/contact_form/maps/text -- persis tipe yang bisa ditambahkan lewat
// dashboard/links).
// StickerOverlay -- Modul Desain (koreksi langsung pengguna, 8 Agustus
// 2026, disempurnakan lagi hari yang sama: "harusnya bagian stiker itu
// langsung edit di bagian pratinjau nya" -- SEBELUMNYA drag/resize cuma
// tersedia di kanvas mockup terpisah (StickerCanvasEditor), tidak
// merefleksikan tema/tata letak halaman SUNGGUHAN. Overlay ini SEKARANG
// bisa jadi dua mode:
// - editable=false (default, dipakai halaman publik SUNGGUHAN &
//   pratinjau read-only): murni visual, pointer-events-none, TIDAK
//   diklik.
// - editable=true (dipakai LivePreviewPanel saat tab "Stiker" aktif di
//   dashboard): setiap stiker bisa diseret (posisi) & gagang pojoknya
//   ditarik (ukuran) LANGSUNG di atas pratinjau asli -- avatar/tema/blok
//   sungguhan, bukan kanvas kosong terpisah. State lokal disinkronkan
//   dari prop `stickers` lewat pola "adjust state during render" (BUKAN
//   useEffect+setState, lihat catatan sama di StickerCanvasEditor
//   soal react-hooks/set-state-in-effect) supaya tetap responsif saat
//   drag aktif tapi tetap ikut update kalau data dimuat ulang dari luar.
// x/y persen relatif terhadap elemen pembungkus (harus `relative`) --
// rumus posisi SAMA seperti StickerCanvasEditor. Dipakai bersama oleh
// layout bio biasa & ProdukPagePreview -- Landing (No.99, tanpa
// avatar/header sama sekali) SENGAJA tidak memakainya.
export function StickerOverlay({
  stickers,
  editable,
  onChange,
}: {
  stickers?: PageStickerData[];
  editable?: boolean;
  onChange?: (stickers: PageStickerData[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [local, setLocal] = useState<PageStickerData[]>(stickers ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragState = useRef<{ id: string; mode: "move" | "resize" } | null>(null);

  const [prevStickersProp, setPrevStickersProp] = useState(stickers);
  if (stickers !== prevStickersProp) {
    setPrevStickersProp(stickers);
    setLocal(stickers ?? []);
  }

  useEffect(() => {
    if (!editable) return;
    function handlePointerMove(e: PointerEvent) {
      const drag = dragState.current;
      const container = containerRef.current;
      if (!drag || !container) return;
      const rect = container.getBoundingClientRect();
      setLocal((prev) =>
        prev.map((s) => {
          if (s.id !== drag.id) return s;
          if (drag.mode === "move") {
            const x = clampPercent(((e.clientX - rect.left) / rect.width) * 100);
            const y = clampPercent(((e.clientY - rect.top) / rect.height) * 100);
            return { ...s, x, y };
          }
          const centerX = rect.left + (s.x / 100) * rect.width;
          const centerY = rect.top + (s.y / 100) * rect.height;
          const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
          const scale = clampScale(dist / (rect.width / 6));
          return { ...s, scale };
        })
      );
    }
    function handlePointerUp() {
      if (dragState.current) {
        dragState.current = null;
        setLocal((current) => {
          onChange?.(current);
          return current;
        });
      }
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [editable, onChange]);

  if (local.length === 0) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden={!editable}
      onPointerDown={editable ? () => setSelectedId(null) : undefined}
      className={`absolute inset-0 z-10 overflow-hidden ${editable ? "touch-none" : "pointer-events-none"}`}
    >
      {local.map((s) => (
        <div
          key={s.id}
          onPointerDown={
            editable
              ? (e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture(e.pointerId);
                  dragState.current = { id: s.id, mode: "move" };
                  setSelectedId(s.id);
                }
              : undefined
          }
          style={{ left: `${s.x}%`, top: `${s.y}%`, transform: `translate(-50%, -50%) scale(${s.scale})` }}
          className={`absolute h-14 w-14 text-ink drop-shadow ${
            editable ? "cursor-grab touch-none active:cursor-grabbing" : ""
          } ${editable && selectedId === s.id ? "z-10" : ""}`}
        >
          <StickerIcon type={s.type} className="h-full w-full" />
          {editable && selectedId === s.id && (
            <>
              <span className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-primary ring-offset-2" />
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = local.filter((it) => it.id !== s.id);
                  setLocal(next);
                  onChange?.(next);
                  setSelectedId(null);
                }}
                className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white text-red-600 shadow-card"
              >
                <IconTrash className="h-3 w-3" />
              </button>
              <span
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture(e.pointerId);
                  dragState.current = { id: s.id, mode: "resize" };
                }}
                className="absolute -bottom-2 -right-2 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-full border-2 border-white bg-primary shadow-card"
              />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function clampScale(value: number) {
  return Math.min(2.5, Math.max(0.4, value));
}

// renderVideoBackground -- permintaan langsung pengguna, 13 Agustus 2026:
// "background yang bergerak seperti menggunakan mov atau gif" -- preset
// "Video" (lihat VIDEO_THEME_NAMES, page-themes.ts) TIDAK bisa dijadikan
// className CSS biasa seperti wallpaper foto/gradien lain (<video> bukan
// background-image), jadi dirender sebagai elemen SUNGGUHAN di sini,
// dipanggil sebagai ANAK PERTAMA di ketiga <main> (bio biasa, landing,
// Toko) supaya videonya mengisi seluruh latar sebelum konten lain di atas.
// Scrim gelap seragam (bukan overlay dibakar ke file seperti wallpaper
// foto) -- menjamin teks putih tetap kontras apa pun kecerahan klip
// videonya (mis. "Atmos"/awan aslinya terang). autoPlay+muted+playsInline
// WAJIB bertiga supaya browser mobile mengizinkan autoplay tanpa interaksi
// pengguna; loop membuat klip pendek (~8 detik) terasa berkelanjutan.
export function renderVideoBackground(theme: PageTheme) {
  if (!theme.videoSrc) return null;
  return (
    <>
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={theme.videoSrc}
        poster={theme.posterSrc}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden
      />
      <div aria-hidden className="absolute inset-0 bg-black/35" />
    </>
  );
}

// renderSocialRow -- permintaan langsung pengguna, 11 Agustus 2026: baris
// ikon kontak sosial (Instagram/TikTok/Facebook/WhatsApp/dll) di bawah bio,
// TERPISAH dari daftar Tautan biasa. Dipakai di layout bio biasa & Toko
// (ProdukPagePreview) -- TIDAK di LandingPagePreview (tidak punya
// avatar/bio-header sama sekali, lihat catatan pageType di atas).
function renderSocialRow(social: PagePreviewData["social"], align: "center" | "left" = "center") {
  const items = buildFilledSocialLinks(social ?? {});
  if (items.length === 0) return null;
  return (
    <div className={`relative mt-3 flex flex-wrap items-center gap-2 ${align === "center" ? "justify-center" : "justify-start"}`}>
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          title={item.label}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:-translate-y-0.5 ${item.badgeClass}`}
        >
          <item.Icon className="h-3.5 w-3.5" />
        </a>
      ))}
    </div>
  );
}

// renderBioHeader -- permintaan langsung pengguna, 11 Agustus 2026
// (susulan Quick Setup, "layouting nya juga berbeda"): dua susunan
// avatar+nama+bio -- "centered" (bawaan, TIDAK BERUBAH dari sebelumnya,
// avatar besar di tengah) atau "banner" (avatar lebih kecil rata kiri
// sebaris dengan nama+bio, ala kartu profil bisnis). Diekstrak jadi SATU
// fungsi (sebelumnya JSX identik terduplikasi persis di layout bio biasa
// & ProdukPagePreview) supaya kedua tempat itu otomatis dapat varian
// banner tanpa implementasi ganda -- konsisten dengan prinsip paritas
// halaman utama/Toko di proyek ini.
export function renderBioHeader(
  data: Pick<PagePreviewData, "avatarUrl" | "username" | "displayName" | "isVerified" | "bio" | "social" | "layoutVariant">,
  theme: PageTheme
) {
  // Lima belas varian (permintaan langsung pengguna, 12 Agustus 2026,
  // susulan "layouting nya juga berbeda" lalu "tambahkan lagi 2 bentuk
  // layout lain nya", "hero" ditambah 13 Agustus 2026 hasil analisa
  // benchmark Linktree/Lynk.id, "polaroid" ditambah hari yang sama lagi
  // supaya KEDELAPAN kategori Quick Setup (saat itu) punya struktur unik
  // masing-masing -- lihat catatan lengkap & pemetaan kategori->varian di
  // QuickSetupTemplate.layoutVariant, quick-setup-templates.ts):
  // "centered" & "banner" (bawaan, TIDAK BERUBAH), "card" (identitas
  // dibungkus kartu bertema, avatar menonjol di tepi atas -- kesan "kartu
  // profil resmi"), "spotlight" (avatar lebih besar, nama dalam badge
  // bulat -- kesan "panggung/showcase"), "cover" (pita warna di atas ala
  // foto sampul, avatar menindih tepi BAWAHnya -- kesan "official page"),
  // "minimal" (avatar kecil sebaris dengan nama ala header aplikasi/
  // dokumen, konten jadi pusat perhatian bukan fotonya), "hero" (avatarUrl
  // yang sama ditampilkan besar edge-to-edge sebagai latar, nama/bio
  // ditumpuk di atasnya), "polaroid" (avatar KOTAK dibingkai putih &
  // dimiringkan ala foto polaroid/board Pinterest -- lihat catatan lengkap
  // di percabangan masing-masing di bawah).
  //
  // Revisi 20 Agustus 2026 (permintaan langsung pengguna): "saya mau
  // tambahkan jadi total 15 layout yang berbeda ambil referensi dari web
  // serupa dan buat unik dan sesuai dengan kategorinya" -- 7 varian baru:
  // "split" (2 kolom, foto persegi kiri + identitas kanan, ref: about-page
  // Carrd/Notion), "ticket" (dua "stub" dipisah garis putus-putus ala
  // boarding pass/tiket acara), "headline" (teks dulu baru foto kecil di
  // bawahnya, kebalikan "centered", ref: header profil Substack/Medium),
  // "ribbon" (badge aksen di sudut avatar + nama dalam pita selebar penuh,
  // ref: badge produk marketplace), "duo" (avatar+nama jadi satu chip pil
  // ringkas, ref: kartu profil Discord/WhatsApp Business), "masthead"
  // (pita warna selebar penuh ala "cover" TAPI identitas ada LANGSUNG DI
  // DALAM pitanya, ref: cover photo Facebook Page), "portrait" (foto TEGAK
  // dibingkai & berbayang, TERKUNGKUNG dalam kolom -- beda dari "hero"
  // yang bleed penuh -- ref: poster film/cover album). Lihat catatan
  // lengkap tiap varian di percabangannya masing-masing di bawah, & lihat
  // pemetaan kategori->varian terbaru di quick-setup-templates.ts.
  // Dipetakan ke kategori Quick Setup yang cocok, TAPI bisa dipakai manual
  // di halaman mana pun -- field DB cuma VARCHAR(20) polos, tidak dibatasi
  // cuma dari Quick Setup.
  const variant = data.layoutVariant ?? "centered";
  const isBanner = variant === "banner";
  const isMinimal = variant === "minimal";
  // avatarSize (class Tailwind) & avatarPx (angka piksel) SENGAJA dipasangkan
  // dalam SATU ekspresi (audit performa 15 September 2026, migrasi ke
  // next/image): <Image> butuh width/height NUMERIK, sementara ukuran tampil di
  // sini tetap ditentukan class Tailwind seperti sebelumnya. Kalau keduanya
  // ditulis di dua tempat terpisah, keduanya PASTI akan lepas sinkron saat
  // varian layout baru ditambahkan -- dipasangkan begini supaya tidak bisa
  // diubah sebelah saja. Angkanya = nilai h-*/w-* Tailwind dalam px
  // (h-10 = 2.5rem = 40px, dst).
  const [avatarSize, avatarPx] = isMinimal
    ? (["h-10 w-10", 40] as const)
    : isBanner || variant === "masthead"
    ? (["h-16 w-16", 64] as const)
    : variant === "cover"
    ? (["h-20 w-20", 80] as const)
    : variant === "spotlight"
    ? (["h-28 w-28", 112] as const)
    : variant === "duo"
    ? (["h-12 w-12", 48] as const)
    : variant === "headline"
    ? (["h-16 w-16", 64] as const)
    : (["h-24 w-24", 96] as const);

  const avatar = data.avatarUrl ? (
    // fetchPriority="high" (optimasi performa, analisa & benchmark
    // kompetitif 18 Agustus 2026): avatar HAMPIR SELALU elemen LCP (Largest
    // Contentful Paint) di halaman publik -- gambar tunggal terbesar yang
    // langsung terlihat tanpa scroll di semua 8 layout. Tanpa hint ini,
    // browser memberi prioritas fetch yang SAMA seperti gambar lain yang
    // baru muncul setelah scroll, padahal justru avatar ini yang paling
    // menentukan skor LCP (metrik Core Web Vitals paling relevan buat
    // "halaman publik yang terasa cepat" dibanding kompetitor).
    // fetchPriority="high" DIPERTAHANKAN apa adanya setelah migrasi ke
    // next/image (audit performa 15 September 2026) -- dokumen Next.js 16
    // sendiri menganjurkan fetchPriority/loading="eager" ketimbang prop
    // `preload` untuk kasus LCP biasa seperti ini (`priority` sudah deprecated
    // di v16). Ukuran TETAP (bukan `fill`) supaya tidak perlu menyisipkan
    // pembungkus position:relative baru ke 8 layout tema sekaligus.
    <Image
      src={data.avatarUrl}
      alt={data.username}
      width={avatarPx}
      height={avatarPx}
      fetchPriority="high"
      className={`relative ${avatarSize} flex-shrink-0 rounded-full object-cover ${theme.avatarRing}`}
    />
  ) : (
    <div
      className={`relative flex ${avatarSize} flex-shrink-0 items-center justify-center rounded-full bg-white/20 font-heading text-2xl font-bold ${theme.name} ${theme.avatarRing}`}
    >
      {data.username.slice(0, 1).toUpperCase()}
    </div>
  );

  const nameHeading = (
    <h1
      className={`flex items-center gap-1.5 font-heading text-base font-bold ${
        isBanner || isMinimal || variant === "split" || variant === "masthead" ? "" : "justify-center"
      } ${theme.name}`}
      style={theme.nameStyle}
    >
      {data.displayName || data.username}
      {data.isVerified && (
        <span title="Kreator terverifikasi">
          <IconBadgeCheck className="h-4 w-4 flex-shrink-0 text-primary" />
        </span>
      )}
    </h1>
  );

  if (isBanner) {
    return (
      <div className="relative flex w-full items-center gap-4 text-left">
        {avatar}
        <div className="relative min-w-0 flex-1">
          {nameHeading}
          {data.bio && <p className={`mt-1 text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          {renderSocialRow(data.social, "left")}
        </div>
      </div>
    );
  }

  // "minimal" -- avatar KECIL (h-10, lihat avatarSize) sebaris dengan
  // nama, ala header aplikasi/dokumen -- bio & ikon sosial di BAWAH,
  // rata kiri, lebar penuh (bukan di dalam kolom sempit di samping
  // avatar seperti "banner"). Fotonya sengaja tidak jadi pusat
  // perhatian -- konten/tautan di bawahnya yang lebih menonjol, cocok
  // untuk halaman yang sifatnya institusional/informasional.
  if (isMinimal) {
    return (
      <div className="relative flex w-full flex-col items-start gap-3 text-left">
        <div className="relative flex w-full items-center gap-3">
          {avatar}
          {nameHeading}
        </div>
        {data.bio && <p className={`text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
        {renderSocialRow(data.social, "left")}
      </div>
    );
  }

  // "card" -- avatar menonjol setengah di atas kartu bertema (theme.
  // productCard, dipakai bersama box produk di tempat lain supaya gaya
  // konsisten per-tema), nama/bio/sosial di DALAM kartu. -mt-12 (setengah
  // tinggi avatar h-24=96px) menarik kartu naik supaya avatar pas
  // menindih tepi atasnya; pt-14 menyisakan jarak 8px di bawah avatar
  // supaya teks tidak menempel.
  if (variant === "card") {
    return (
      <div className="relative flex w-full flex-col items-center">
        <div className="relative z-10">{avatar}</div>
        <div className={`relative -mt-12 w-full rounded-2xl px-5 pb-5 pt-14 text-center ${theme.productCard}`}>
          {nameHeading}
          {data.bio && <p className={`mt-2 text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          {renderSocialRow(data.social)}
        </div>
      </div>
    );
  }

  // "spotlight" -- avatar lebih besar (h-28, lihat avatarSize), nama
  // dibungkus badge bulat (bukan teks polos) supaya terasa seperti
  // "nameplate" panggung, ikon sosial ditaruh SEBELUM bio (bio jadi
  // keterangan penutup yang lebih kalem) -- beda urutan dari "centered"
  // (bio dulu baru ikon sosial) supaya sosok/identitas lebih menonjol
  // daripada deskripsi teks.
  if (variant === "spotlight") {
    return (
      <div className="relative flex w-full flex-col items-center">
        {avatar}
        <div className={`relative mt-4 inline-flex max-w-full items-center rounded-full px-4 py-1.5 ${theme.productCard}`}>
          {nameHeading}
        </div>
        {renderSocialRow(data.social)}
        {data.bio && <p className={`mt-3 max-w-xs text-center text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
      </div>
    );
  }

  // "cover" -- pita gelap tipis (vignette hitam->transparan, netral supaya
  // aman di tema apa pun, tidak butuh warna khusus per-tema) melebar penuh
  // ala foto sampul, avatar menindih tepi BAWAHnya (-mt-10, setengah dari
  // h-20=80px). -mx-6 -mt-14 + w-[calc(100%+3rem)] MEMBATALKAN padding
  // px-6 py-14 milik kolom konten (bukan cuma nilai sembarang) supaya
  // pita ini benar-benar mentok ke tepi kartu/bingkai halaman, bukan
  // berhenti di batas kolom max-w-md.
  if (variant === "cover") {
    return (
      <div className="relative -mx-6 -mt-14 flex w-[calc(100%+3rem)] flex-col items-center">
        <div className="h-24 w-full bg-gradient-to-b from-black/25 via-black/5 to-transparent" />
        <div className="relative -mt-10 z-10">{avatar}</div>
        <div className="relative mt-3 w-full px-6 text-center">
          {nameHeading}
          {data.bio && <p className={`mt-2 text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          {renderSocialRow(data.social)}
        </div>
      </div>
    );
  }

  // "hero" -- hasil analisa benchmark Linktree/Lynk.id (13 Agustus 2026):
  // "Hero" Linktree BUKAN foto sampul terpisah, melainkan avatarUrl YANG
  // SAMA ditampilkan besar edge-to-edge (bukan avatar bulat kecil) --
  // makanya TIDAK ada field/kolom/upload baru untuk varian ini, murni
  // gaya render ulang dari data yang sudah ada (konsisten dengan 6
  // varian lain, semua hanya menyusun ulang avatarUrl/displayName/bio
  // yang sama). Fallback ke "centered" (jatuh lewat ke return di bawah)
  // KALAU avatarUrl masih kosong -- tidak ada apa pun untuk ditampilkan
  // besar, daripada kotak kosong/rusak. Nama/bio SENGAJA tidak pakai
  // nameHeading/theme.bio yang sudah dibangun di atas (warnanya
  // disetel untuk latar halaman biasa) -- teks di sini SELALU putih,
  // overlay ada di atas FOTO gelap (scrim), bukan latar tema.
  if (variant === "hero" && data.avatarUrl) {
    return (
      <div className="relative -mx-6 -mt-14 flex w-[calc(100%+3rem)] flex-col items-center">
        <div className="relative h-64 w-full">
          {/* fetchPriority="high" -- elemen LCP di layout "hero", lihat
              catatan panjang di avatar layout default di atas.
              `fill` (BUKAN width/height tetap) dipakai di sini karena
              pembungkusnya SUDAH `relative h-64 w-full` -- tingginya tetap tapi
              lebarnya mengikuti kolom, jadi tidak ada satu angka lebar yang
              benar. `sizes` = lebar kolom halaman publik (max-w-md = 448px),
              di bawah itu mengikuti lebar viewport. */}
          <Image src={data.avatarUrl} alt={data.username} fill sizes="(max-width: 448px) 100vw, 448px" fetchPriority="high" className="object-cover" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-6 pb-4 text-center">
            <h1 className="flex items-center justify-center gap-1.5 font-heading text-xl font-bold text-white" style={theme.nameStyle}>
              {data.displayName || data.username}
              {data.isVerified && (
                <span title="Kreator terverifikasi">
                  <IconBadgeCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                </span>
              )}
            </h1>
            {data.bio && <p className="mt-1 text-xs leading-relaxed text-white/85">{data.bio}</p>}
          </div>
        </div>
        <div className="relative mt-3 w-full px-6">{renderSocialRow(data.social)}</div>
      </div>
    );
  }

  // "polaroid" -- ditambah 13 Agustus 2026 (permintaan langsung pengguna:
  // "layout template mockup di tiap kategori itu dibedakan jangan ada
  // yang sama... bukan hanya mengubah tema... tapi juga struktur
  // layoutnya, ambil referensi dari web lain nya"): avatar KOTAK (bukan
  // lingkaran seperti 7 varian lain) dibingkai putih tebal di sisi bawah
  // (p-2 pb-6, bukan padding seragam) ala cetakan foto polaroid fisik,
  // dimiringkan sedikit (-rotate-3) supaya terasa "ditempel di papan"
  // -- referensi estetika cover board Pinterest / feed VSCO, dipetakan
  // ke kategori Lifestyle (travel/fashion/beauty) di quick-setup-
  // templates.ts karena kontennya secara alami visual/aesthetic-driven.
  // Bingkainya SELALU putih solid (bukan ikut theme.card) -- itu justru
  // ciri khas polaroid asli, harus tetap putih di tema apa pun (gelap
  // maupun terang) supaya fotonya tetap "menonjol" dari latar.
  if (variant === "polaroid") {
    const polaroidPhoto = data.avatarUrl ? (
      // fetchPriority="high" -- elemen LCP di layout "polaroid", lihat
      // catatan panjang di avatar layout default di atas. Ukuran TETAP 112px
      // (h-28/w-28) -- bingkai polaroid memang berukuran pasti, bukan responsif.
      <Image src={data.avatarUrl} alt={data.username} width={112} height={112} fetchPriority="high" className="h-28 w-28 object-cover" />
    ) : (
      <div className="flex h-28 w-28 items-center justify-center bg-primary-subtle font-heading text-2xl font-bold text-primary">
        {data.username.slice(0, 1).toUpperCase()}
      </div>
    );
    return (
      <div className="relative flex w-full flex-col items-center">
        <div className="relative -rotate-3 rounded-sm bg-white p-2 pb-6 shadow-xl">{polaroidPhoto}</div>
        <div className="relative mt-5 text-center">
          {nameHeading}
          {data.bio && <p className={`mt-2 max-w-xs text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          {renderSocialRow(data.social)}
        </div>
      </div>
    );
  }

  // "split" -- ref: hero "About" page personal-website ala Carrd/Notion --
  // dua kolom, foto PERSEGI (rounded-2xl, bukan lingkaran seperti varian
  // lain kecuali polaroid, TAPI tidak dimiringkan/dibingkai putih seperti
  // polaroid) FIXED di kiri, identitas mengalir di kanan, rata ATAS
  // (items-start, bukan items-center) ala tata letak CV/kartu profesional
  // -- dipetakan ke sub-kategori Business yang butuh kesan lebih formal
  // (Consultant/Agency/Professional CV) daripada avatar bulat generik.
  // Avatar KOTAK di sini custom (bukan const `avatar` di atas yang selalu
  // bulat) -- pola sama seperti hero/polaroid yang juga membangun elemen
  // avatar sendiri saat butuh bentuk beda dari bulat standar.
  if (variant === "split") {
    const splitAvatar = data.avatarUrl ? (
      // Ukuran TETAP 80px (h-20/w-20) -- kolom foto di layout "split" memang
      // FIXED (lihat catatan varian di atas), bukan ikut melebar.
      <Image
        src={data.avatarUrl}
        alt={data.username}
        width={80}
        height={80}
        fetchPriority="high"
        className={`h-20 w-20 flex-shrink-0 rounded-2xl object-cover ${theme.avatarRing}`}
      />
    ) : (
      <div
        className={`flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20 font-heading text-2xl font-bold ${theme.name} ${theme.avatarRing}`}
      >
        {data.username.slice(0, 1).toUpperCase()}
      </div>
    );
    return (
      <div className="relative flex w-full items-start gap-4 text-left">
        {splitAvatar}
        <div className="relative min-w-0 flex-1 pt-1">
          {nameHeading}
          {data.bio && <p className={`mt-1.5 text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          {renderSocialRow(data.social, "left")}
        </div>
      </div>
    );
  }

  // "ticket" -- ref: boarding pass/tiket acara fisik (Eventbrite dkk) --
  // dua "stub" ditumpuk dalam satu kartu bertema, dipisah garis putus-
  // putus dengan dua lingkaran kecil ala lubang sobekan tiket di kedua
  // ujungnya. Warna divider & lingkaran SENGAJA netral (black/opacity,
  // pola sama seperti vignette "cover" di atas) supaya aman dilihat di
  // tema apa pun tanpa butuh warna khusus per-tema. Dipetakan ke template
  // yang MEMANG soal tiket/reservasi (Event di kategori Special, Sports
  // Facility di Local) -- struktur selaras isi, bukan cuma dekorasi.
  if (variant === "ticket") {
    return (
      <div className={`relative w-full rounded-2xl ${theme.productCard}`}>
        <div className="relative flex flex-col items-center px-5 pb-4 pt-5">
          {avatar}
          <div className="relative mt-3">{nameHeading}</div>
        </div>
        <div className="relative mx-5 border-t-2 border-dashed border-black/10" aria-hidden>
          <span className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/10" />
          <span className="absolute right-0 top-0 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full bg-black/10" />
        </div>
        <div className="relative px-5 pb-5 pt-4 text-center">
          {data.bio && <p className={`text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          {renderSocialRow(data.social)}
        </div>
      </div>
    );
  }

  // "headline" -- kebalikan komposisi "centered": teks (nama+bio) di ATAS,
  // foto KECIL menyusul di BAWAHnya, ala header profil Substack/Medium
  // yang mengedepankan pernyataan/tulisan dulu baru foto penulis -- cocok
  // untuk sub-kategori Education yang isinya lebih ke konten/pesan
  // (silabus, testimoni, komunitas) daripada wajah pengajarnya.
  if (variant === "headline") {
    return (
      <div className="relative flex w-full flex-col items-center text-center">
        {nameHeading}
        {data.bio && <p className={`mt-2 max-w-xs text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
        <div className="relative mt-4">{avatar}</div>
        {renderSocialRow(data.social)}
      </div>
    );
  }

  // "ribbon" -- avatar dengan aksen bulat kecil menempel di sudut kanan-
  // bawah (ala badge "produk unggulan" di kartu e-commerce, warna dari
  // theme.buyButton -- tombol aksi tema yang sama dipakai supaya aksennya
  // konsisten dengan warna CTA halaman) + nama dibungkus pita selebar
  // penuh (beda dari "spotlight" yang badge bulat) -- ref: kartu produk
  // marketplace (Shopee/Tokopedia) yang selalu menonjolkan badge kecil di
  // foto produknya. Dipetakan ke sub-kategori Toko yang produknya lebih
  // visual/retail (Fashion/Beauty Store).
  if (variant === "ribbon") {
    return (
      <div className="relative flex w-full flex-col items-center">
        <div className="relative">
          {avatar}
          <span
            aria-hidden
            className={`absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full text-sm shadow ${theme.buyButton}`}
          >
            ✦
          </span>
        </div>
        <div className={`relative mt-4 w-full rounded-full px-4 py-2 text-center ${theme.productCard}`}>{nameHeading}</div>
        {data.bio && <p className={`mt-3 max-w-xs text-center text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
        {renderSocialRow(data.social)}
      </div>
    );
  }

  // "duo" -- avatar & nama digabung jadi SATU chip pil horizontal (ala
  // kartu profil ringkas Discord/WhatsApp Business, foto & nama sejajar
  // sama-sama jadi identitas utama), bio & sosial terpisah di LUAR chip,
  // di bawahnya. Beda dari "banner" (rata KIRI, lebar penuh, bio menyatu
  // di kolom yang sama) -- di sini semuanya rata TENGAH & ringkas, cocok
  // untuk sub-kategori Lifestyle yang personanya lebih "personal trainer/
  // consultant" (Fitness Coach/Beauty Creator) ketimbang editorial visual.
  if (variant === "duo") {
    return (
      <div className="relative flex w-full flex-col items-center">
        <div className={`relative inline-flex max-w-full items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 ${theme.productCard}`}>
          {avatar}
          {nameHeading}
        </div>
        {data.bio && <p className={`mt-3 max-w-xs text-center text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
        {renderSocialRow(data.social)}
      </div>
    );
  }

  // "masthead" -- pita warna selebar penuh (-mx-6, sama seperti "cover")
  // TAPI avatar+nama+bio ada LANGSUNG DI DALAM pitanya (bukan menyusul di
  // bawah seperti "cover") -- ala papan nama toko/signage bisnis lokal,
  // ref: cover photo Facebook Page yang teksnya ditumpuk LANGSUNG di atas
  // foto sampul, bukan di bawahnya. Dipetakan ke template retail/toko
  // fisik (Food & Beverage/Affiliate Store, Barbershop/Salon/Photographer)
  // yang punya kesan "papan nama" kuat.
  if (variant === "masthead") {
    return (
      <div className="relative -mx-6 -mt-14 flex w-[calc(100%+3rem)] flex-col items-center">
        <div className={`relative flex w-full items-center gap-3 px-6 py-5 ${theme.productCard}`}>
          {avatar}
          <div className="relative min-w-0 flex-1 text-left">
            {nameHeading}
            {data.bio && <p className={`mt-1 text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          </div>
        </div>
        <div className="relative mt-3 w-full px-6">{renderSocialRow(data.social, "left")}</div>
      </div>
    );
  }

  // "portrait" -- foto TEGAK (aspect-[3/4]) dibingkai rounded-2xl &
  // berbayang, TERKUNGKUNG di dalam kolom (beda dari "hero" yang bleed
  // penuh -mx-6 ke tepi bingkai) -- ref: poster film/gig konser & cover
  // album, cocok untuk sub-kategori yang personanya "tampil di atas
  // panggung" (Musisi/DJ) atau "karakter" (Gamer/Streamer). Nama & bio di
  // BAWAH foto (bukan ditumpuk di atasnya seperti "hero") -- menghindari
  // masalah kontras teks putih di atas foto sembarang warna, sekaligus
  // membedakan strukturnya dari hero. Fallback ke "centered" (jatuh lewat
  // ke return di bawah) KALAU avatarUrl masih kosong, pola sama seperti
  // "hero".
  if (variant === "portrait" && data.avatarUrl) {
    return (
      <div className="relative flex w-full flex-col items-center">
        <div className="relative aspect-[3/4] w-40 overflow-hidden rounded-2xl shadow-xl">
          {/* `fill` -- pembungkusnya SUDAH `relative` + aspect-[3/4], jadi
              tinggi foto diturunkan dari rasio, tidak ada angka tinggi literal
              yang bisa ditulis. Lebar bingkainya sendiri TETAP (w-40 = 160px),
              makanya `sizes` cukup satu angka. */}
          <Image src={data.avatarUrl} alt={data.username} fill sizes="160px" fetchPriority="high" className="object-cover" />
        </div>
        <div className="relative mt-4 text-center">
          {nameHeading}
          {data.bio && <p className={`mt-2 max-w-xs text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          {renderSocialRow(data.social)}
        </div>
      </div>
    );
  }

  return (
    // flex flex-col items-center di SINI (bukan cuma dipercaya ke pembungkus
    // grandparent) -- bug dilaporkan pengguna (12 Agustus 2026, screenshot
    // galeri Quick Setup): avatar bergeser ke kiri, tidak simetris, padahal
    // nama/bio di bawahnya terlihat center. Akar masalah: div "relative" ini
    // adalah flex item shrink-to-fit di grandparent (lebarnya ditentukan
    // anak TERLEBAR, yaitu blok nama/bio yang bisa lebih lebar dari avatar),
    // lalu avatar (anak block biasa, width:auto) otomatis melebar 100% ke
    // lebar itu dan nempel kiri karena tidak ada text-center/justify-center
    // di pembungkusnya sendiri -- beda dari blok nama/bio yang punya
    // text-center eksplisit. items-center di sini memaksa SETIAP anak
    // (avatar maupun blok nama/bio) benar-benar center secara individual,
    // bukan cuma lebar penuh lalu nempel kiri.
    <div className="relative flex flex-col items-center">
      <div className="relative">{avatar}</div>
      <div className="relative mt-5 text-center">
        {nameHeading}
        {data.bio && <p className={`mt-2 max-w-xs text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
        {renderSocialRow(data.social)}
      </div>
    </div>
  );
}

// resolveBlockIcon -- permintaan langsung pengguna, 14 Agustus 2026:
// "harusnya semua tipe ini... bisa ubah icon" -- urutan resolusi SAMA
// PERSIS dengan tautan biasa (customIconUrl > iconKey galeri > ikon default),
// dipakai utk blok video/faq/accordion/maps/contact_form yang sebelumnya
// TIDAK punya slot ikon sama sekali di halaman publik.
//
// ColoredIcon -- permintaan langsung pengguna, 22 Agustus 2026: "bisa
// mengubah warna yang kita inginkan untuk icon di blok daripada hanya
// warna hitam saja". Ikon galeri (lucide-react/Simple Icons) SEMUANYA
// pakai stroke/fill="currentColor" (mewarisi CSS `color`), TAPI
// sebelumnya tidak ada satu pun elemen pembungkus warna eksplisit di
// sini -- jadi cuma ikut warna apa pun yang kebetulan cascade dari
// elemen terdekat, kreator tidak punya kendali sama sekali.
//
// Dibungkus lewat elemen <span style={{color}}> (BUKAN meneruskan prop
// `style` langsung ke komponen ikon) -- disengaja: komponen ikon di
// components/icons.tsx (hand-drawn, ~50 fungsi) TIDAK meneruskan prop
// selain `className` ke elemen svg-nya masing-masing, jadi meneruskan
// `style` langsung akan diam-diam tidak berefek untuk sebagian ikon.
// Membungkus dengan <span> memanfaatkan currentColor yang MEMANG sudah
// dipakai semua ikon di proyek ini -- bekerja universal tanpa perlu
// menyentuh definisi setiap komponen ikon satu per satu. TIDAK
// diterapkan ke customIconUrl (gambar hasil upload, bukan SVG, tidak
// bisa "diwarnai ulang" lewat CSS color).
// Watermark -- redesain (permintaan langsung pengguna, referensi gambar
// tombol "Buat milikmu di [ikon] jeon.id"): sebelumnya teks polos "Buat
// halaman gratis di Jeon.id" tanpa logo. Dipakai identik di 3 tempat
// (PagePreview/LandingPagePreview/ProdukPagePreview) -- diekstrak ke sini
// SATU KALI daripada tiga salinan. useLocale() aman dipanggil di sini
// (LocaleProvider membungkus SELURUH app termasuk rute publik kreator di
// app/layout.tsx, bukan cuma dashboard) -- teksnya otomatis ikut preferensi
// bahasa PENGUNJUNG sendiri (localStorage jeonme-locale), default "id" kalau
// pengunjung belum pernah pilih apa pun. Ini beda dari larangan token
// app-* dark/light di file ini -- itu soal WARNA tema halaman kreator,
// bukan BAHASA elemen watermark milik platform sendiri.
export function Watermark({ isPremium, hideWatermark }: { isPremium?: boolean; hideWatermark?: boolean }) {
  const { t } = useLocale();
  if (isPremium && hideWatermark) return null;
  return (
    <a
      href={`${SITE_URL}/register`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-ink shadow-card transition-transform hover:scale-105"
    >
      {t("watermark.cta")}
      {/* src "/icon.png" SENGAJA DIPERTAHANKAN (audit performa 15 September
          2026, migrasi next/image). Sempat dikira 404 karena TIDAK ADA file
          public/icon.png -- ternyata BUKAN: yang menyajikannya adalah
          app/icon.png, file konvensi metadata App Router, dan untuk file ikon
          STATIS (bukan icon.tsx yang digenerate ImageResponse) Next.js
          memasangnya sebagai rute "/icon.png" apa adanya -- terkonfirmasi di
          daftar rute `next build` ("○ /icon.png") dan diverifikasi ulang lewat
          permintaan HTTP sungguhan. Jadi jangan "diperbaiki" jadi
          /favicon-new.png. */}
      <Image src="/icon.png" alt="" width={16} height={16} className="h-4 w-4 flex-shrink-0" />
      <span>
        jeon<span className="text-secondary-light">.id</span>
      </span>
    </a>
  );
}

function ColoredIcon({ color, children }: { color?: string; children: React.ReactNode }) {
  if (!color) return <>{children}</>;
  return (
    <span className="contents" style={{ color }}>
      {children}
    </span>
  );
}

function resolveBlockIcon(link: PagePreviewLink, DefaultIcon: React.ComponentType<{ className?: string }>, sizeClass: string) {
  if (link.customIconUrl) {
    return (
      // width/height 24 KONSTAN meski `sizeClass` bervariasi (h-4/h-6 dari
      // pemanggil): yang menentukan ukuran TAMPIL tetap class CSS itu, angka di
      // sini cuma memberi tahu Next.js rasio + batas srcset. 24 = nilai
      // TERBESAR yang dipakai pemanggil mana pun (h-6), jadi tidak akan pernah
      // kurang tajam; memakai angka lebih kecil justru berisiko buram.
      <Image src={link.customIconUrl} alt="" width={24} height={24} className={`${sizeClass} flex-shrink-0 rounded-full object-cover`} />
    );
  }
  const libraryIcon = getLibraryIcon(link.iconKey);
  if (libraryIcon) {
    return (
      <ColoredIcon color={link.iconColor}>
        <libraryIcon.Icon className={`${sizeClass} flex-shrink-0`} />
      </ColoredIcon>
    );
  }
  return (
    <ColoredIcon color={link.iconColor}>
      <DefaultIcon className={`${sizeClass} flex-shrink-0`} />
    </ColoredIcon>
  );
}

// SENSITIVE_GATEABLE_BLOCK_TYPES -- block_type yang punya render dedicated
// SENDIRI di renderLinkOrBlock (early return SEBELUM sampai ke fallback
// "tautan biasa" di ujung fungsi) -- tanpa daftar ini, lockType="sensitive"
// tidak akan pernah dicek untuk tipe-tipe tersebut sama sekali. "link" dan
// "button" SENGAJA TIDAK dimasukkan -- keduanya sudah digerbang lewat jalur
// LockedLinkButton yang sudah ada (fetch URL asli dari server SETELAH klik
// "lanjutkan", lihat AuthHandler.Unlock case "sensitive") karena url-nya
// memang disembunyikan dari payload halaman publik selama lockType terisi
// (apa pun jenisnya) -- lihat publicLink, page.go.
const SENSITIVE_GATEABLE_BLOCK_TYPES = new Set(["video", "faq", "maps", "gallery", "audio", "accordion", "text", "contact_form", "file"]);

// SensitiveContentGate -- permintaan langsung pengguna, 20 Agustus 2026:
// "tambahkan juga sensitive content supaya nanti tampil ke user ketika mau
// akses". Beda dari LockedLinkButton (age/code/subscribe, HANYA tautan
// biasa) -- blok konten (video/galeri/dll) tidak "dibuka" lewat fetch URL
// server, isinya SUDAH ada di block_data yang terkirim (lihat catatan di
// SENSITIVE_GATEABLE_BLOCK_TYPES), jadi cukup gerbang MURNI client-side:
// tampilkan peringatan dulu, baru render konten aslinya begitu diklik.
// Komponen SUNGGUHAN (bukan fungsi render biasa) karena butuh state
// `revealed` sendiri -- renderContent lazy (function, bukan children
// langsung) supaya konten aslinya TIDAK PERNAH dirender/dievaluasi sebelum
// pengunjung benar-benar klik "Lihat Konten".
//
// Judul blok SENGAJA TIDAK ditampilkan di peringatan (beda dari
// LockedLinkButton yang menampilkan `title`) -- untuk block_type "text",
// judul memang murni label internal dashboard, TIDAK PERNAH dimaksudkan
// tampil ke publik sama sekali (lihat catatan "text" di renderLinkOrBlock
// bawah). Peringatan generik berlaku aman utk SEMUA tipe di
// SENSITIVE_GATEABLE_BLOCK_TYPES tanpa terkecuali, sekaligus lebih sesuai
// pola peringatan konten sensitif platform lain (X/Twitter dkk) yang
// sengaja tidak membocorkan detail apa pun soal kontennya di baliknya.
function SensitiveContentGate({ theme, renderContent }: { theme: PageTheme; renderContent: () => React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) {
    return <>{renderContent()}</>;
  }
  return (
    <div className={`w-full rounded-xl p-4 text-center ${theme.card}`}>
      <p className={`text-xs font-semibold ${theme.cardTitle}`}>⚠️ Konten Sensitif</p>
      <p className={`mt-1 text-[11px] opacity-80 ${theme.cardTitle}`}>Konten ini mungkin berisi materi sensitif.</p>
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className={`mt-3 rounded-lg px-4 py-1.5 text-xs font-bold ${theme.buyButton}`}
      >
        Lihat Konten
      </button>
    </div>
  );
}

export function renderLinkOrBlock(
  link: PagePreviewLink,
  theme: PageTheme,
  data: Pick<PagePreviewData, "username" | "pageSlug" | "utmEnabled" | "products" | "referralCode" | "shopPaused">,
  interactive: boolean,
  // canBuy -- permintaan langsung pengguna 12 September 2026 ("full
  // parity" mode Simple vs Builder): blok "produk" BARU sekarang bisa
  // muncul di mode Simple juga (lihat cabang blockType "produk" di bawah),
  // butuh flag yang SAMA PERSIS dipakai renderBuilderNode (Modul Toko Fase
  // E5: toko dijeda -> semua tombol Beli dinonaktifkan frontend, bukan
  // cuma backend). SEMUA pemanggil lain (text/faq/video/dst, tidak ada
  // satu pun yang butuh tombol Beli) mengabaikan parameter ini sepenuhnya.
  canBuy: boolean,
  // onOpenCatalog -- permintaan langsung pengguna, 25 Agustus 2026: blok
  // "catalog" ("Jenis Rumah" -> daftar jenis -> detail per jenis) TIDAK
  // menuju URL apa pun, dia mengganti ISI HALAMAN dengan
  // CatalogTakeoverView (dikonfirmasi lewat AskUserQuestion) -- state
  // takeover-nya HARUS hidup di komponen halaman PALING ATAS (supaya bisa
  // menyembunyikan avatar/bio/tautan lain sekaligus), bukan di sini,
  // makanya cuma dioper sebagai callback. undefined = blok ini dirender
  // di tempat yang belum mendukung takeover (mis. ProdukPagePreview/Toko,
  // lihat catatan lingkup CatalogTakeoverView) -- baris tetap tampil
  // tapi TIDAK bisa diklik, alih-alih diam-diam gagal.
  onOpenCatalog?: (link: PagePreviewLink) => void
) {
  // No.77: blok konten baru dirender sepenuhnya terpisah dari tautan biasa
  // (block_type sendiri-sendiri di bawah) -- TIDAK ada gerbang kunci
  // age/code/subscribe untuk tipe-tipe ini (LockedLinkButton, di luar
  // cakupan permintaan awal). lockType="sensitive" BEDA -- lihat
  // SensitiveContentGate & SENSITIVE_GATEABLE_BLOCK_TYPES di atas, susulan
  // permintaan pengguna 20 Agustus 2026. Dicek PALING ATAS di sini (SEBELUM
  // dispatch block_type manapun) supaya berlaku ke SEMUA tipe yang relevan
  // sekaligus, bukan disisipkan satu-satu di tiap cabang di bawah --
  // renderContent memanggil ULANG renderLinkOrBlock dengan lockType
  // dikosongkan (bukan rekursi tak berujung, cabang ini otomatis dilewati
  // di panggilan kedua) supaya SELURUH dispatch block_type di bawah TETAP
  // satu sumber kebenaran, tidak perlu diduplikasi.
  if (link.lockType === "sensitive" && link.blockType && SENSITIVE_GATEABLE_BLOCK_TYPES.has(link.blockType)) {
    return (
      <SensitiveContentGate
        key={link.id}
        theme={theme}
        renderContent={() => renderLinkOrBlock({ ...link, lockType: undefined }, theme, data, interactive, canBuy, onOpenCatalog)}
      />
    );
  }

  // Permintaan langsung pengguna, 14 Agustus 2026: "saat saya ubah tombol
  // di desain kenapa ga semua blok mengikuti warna tombol yang saya set".
  // Akar masalah: video/faq/accordion/text/contact_form dulu pakai
  // theme.productCard/productTitle (surface "mood" produk, sengaja TIDAK
  // ikut custom_button_color -- lihat catatan getPageTheme di
  // page-themes.ts soal migrasi 000035) -- padahal blok-blok ini muncul di
  // DAFTAR TAUTAN YANG SAMA dengan tautan biasa & blok "maps" (yang sudah
  // benar pakai theme.card/cardTitle). Disamakan ke theme.card/cardTitle
  // supaya SEMUA item di daftar tautan konsisten ikut warna tombol -- TIDAK
  // menyentuh productCard/productTitle di tempat lain (grid produk/event/
  // donasi/lead-capture, widget terpisah yang memang sengaja
  // mengikuti mood tema, bukan bagian dari daftar tautan).
  if (link.blockType === "video") {
    return (
      <VideoEmbedBlock
        key={link.id}
        title={link.title}
        videoUrl={(link.blockData?.video_url as string) ?? ""}
        cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
        titleClassName={theme.cardTitle}
        icon={resolveBlockIcon(link, VideoIcon, "h-4 w-4")}
      />
    );
  }
  if (link.blockType === "faq") {
    return (
      <FaqBlock
        key={link.id}
        title={link.title}
        items={(link.blockData?.items as FaqItem[]) ?? []}
        cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
        titleClassName={theme.cardTitle}
        itemTitleClassName={theme.cardTitle}
        itemBodyClassName={theme.bio}
        icon={resolveBlockIcon(link, HelpCircle, "h-4 w-4")}
      />
    );
  }
  if (link.blockType === "maps") {
    return (
      <MapsEmbedBlock
        key={link.id}
        title={link.title}
        url={link.url}
        embed={Boolean(link.blockData?.embed)}
        embedLat={link.blockData?.embed_lat as number | undefined}
        embedLng={link.blockData?.embed_lng as number | undefined}
        linkClassName={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
        icon={resolveBlockIcon(link, IconMapPin, "h-6 w-6")}
      />
    );
  }
  if (link.blockType === "gallery") {
    return (
      <GalleryBlock
        key={link.id}
        title={link.title}
        images={(link.blockData?.images as string[]) ?? []}
        display={normalizeGalleryDisplay(link.blockData?.display)}
        captions={(link.blockData?.captions as Record<string, { title?: string; description?: string }> | undefined) ?? {}}
        cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
        titleClassName={theme.cardTitle}
        icon={resolveBlockIcon(link, GalleryIcon, "h-4 w-4")}
      />
    );
  }
  if (link.blockType === "audio") {
    return (
      <AudioPlayerBlock
        key={link.id}
        title={link.title}
        audioUrl={(link.blockData?.audio_url as string) ?? ""}
        coverUrl={link.customIconUrl}
        cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
        titleClassName={theme.cardTitle}
      />
    );
  }
  if (link.blockType === "file") {
    return (
      <FileDownloadBlock
        key={link.id}
        title={link.title}
        fileUrl={(link.blockData?.file_url as string) ?? ""}
        fileName={link.blockData?.file_name as string | undefined}
        fileSizeBytes={link.blockData?.file_size_bytes as number | undefined}
        iconUrl={link.customIconUrl}
        cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
        titleClassName={theme.cardTitle}
      />
    );
  }
  if (link.blockType === "accordion") {
    // "accordion" -- permintaan langsung pengguna: "blok yang bisa diklik
    // lalu keluar text, bukan hanya untuk faq saja" -- SATU item klik-untuk-
    // buka, bebas dari framing tanya-jawab (bukan daftar Q&A seperti
    // "faq"). Dipakai ulang lewat FaqBlock APA ADANYA (title="" supaya
    // heading "Pertanyaan Umum"-style tidak ikut tampil -- lihat
    // `{title && <p>...}` di FaqBlock.tsx, array 1 item) -- interaksi klik
    // + rotasi chevron + tampilan sudah persis yang dibutuhkan, tidak perlu
    // komponen baru.
    return (
      <FaqBlock
        key={link.id}
        title=""
        items={[{ question: link.title, answer: (link.blockData?.text as string) ?? "" }]}
        cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
        titleClassName={theme.cardTitle}
        itemTitleClassName={theme.cardTitle}
        itemBodyClassName={theme.bio}
      />
    );
  }
  if (link.blockType === "text") {
    // Benchmark Lynk.id: blok Teks -- paragraf polos, TANPA judul tampil
    // publik (judulnya cuma label internal dashboard) dan TANPA tautan/
    // klik apa pun. Rich text (susulan 12 September 2026, "tiap blok yang
    // ada teks nya buat semua jadi rich teks") -- dangerouslySetInnerHTML+
    // sanitizeRichTextHtml, sama seperti renderBuilderNode's case "text"
    // (wrapper kartu theme.card TETAP dipertahankan APA ADANYA -- beda
    // visual pra-existing dari Builder yang tanpa background kartu, di
    // luar cakupan perbaikan rich-text ini). whitespace-pre-line --
    // kompatibilitas mundur: blok lama (plain string ber-"\n", dari
    // SEBELUM redesain rich-text) tetap tampil baris-baru dengan benar.
    return (
      <div key={link.id} className={`w-full rounded-xl p-3 text-center ${theme.card}`}>
        <p
          className={`jeon-rich-text-content whitespace-pre-line text-xs leading-relaxed ${theme.bio}`}
          dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml((link.blockData?.text as string) ?? "") }}
        />
      </div>
    );
  }
  if (link.blockType === "contact_form") {
    return interactive ? (
      <ContactFormBlock
        key={link.id}
        linkId={link.id}
        title={link.title}
        cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
        titleClassName={theme.cardTitle}
        inputClassName="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
        buttonClassName={theme.buyButton}
        icon={resolveBlockIcon(link, IconMail, "h-4 w-4")}
      />
    ) : (
      <div key={link.id} className={`w-full rounded-xl p-2.5 text-center ${theme.card}`}>
        <p className={`text-xs font-semibold ${theme.cardTitle}`}>{link.title}</p>
        <button
          type="button"
          disabled
          title="Pratinjau -- tombol ini tidak aktif"
          className={`mt-2 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
        >
          Kirim Pesan
        </button>
      </div>
    );
  }

  if (link.blockType === "project_showcase") {
    // "project_showcase" -- permintaan langsung pengguna, 24 Agustus 2026:
    // kartu "Project Unggulan" (contoh tangkapan layar template "Dimas
    // Dev"). title (kolom yang sudah ada) = judul proyek, link.description
    // = paragraf deskripsi (dipakai ulang, lihat catatan PagePreviewLink),
    // link.url (kolom yang sudah ada) = tautan CTA, blockData.badge_text/
    // cta_text/image_url spesifik blok ini -- lihat validateBlockData
    // (links.go).
    const badgeText = (link.blockData?.badge_text as string) ?? "";
    const imageUrl = (link.blockData?.image_url as string) ?? "";
    const ctaText = (link.blockData?.cta_text as string) || "Lihat detail";
    const cardInner = (
      <>
        {badgeText && (
          <span className={`mb-3 inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${theme.buyButton}`}>
            {badgeText}
          </span>
        )}
        {imageUrl && (
          // `h-auto` WAJIB ditambahkan saat migrasi ke next/image (audit
          // performa 15 September 2026): <Image> memasang atribut width/height
          // sungguhan, dan atribut itu memberi <img> sebuah `aspect-ratio`
          // bawaan UA yang MENGALAHKAN `aspect-video` selama tingginya tidak
          // `auto`. Tanpa h-auto, kotaknya akan terkunci setinggi angka height
          // di bawah alih-alih mengikuti rasio 16:9. Angka 448x252 = lebar
          // kolom publik (max-w-md) pada rasio video, murni petunjuk srcset --
          // ukuran tampil tetap dari CSS.
          <Image src={imageUrl} alt="" width={448} height={252} className="mb-3 aspect-video h-auto w-full rounded-lg object-cover" />
        )}
        <p className={`text-sm font-bold ${theme.cardTitle}`}>{link.title}</p>
        {/* Rich text (susulan 12 September 2026) -- whitespace-pre-line
            utk kompatibilitas mundur konten lama (plain string ber-"\n"). */}
        {link.description && (
          <p
            className={`jeon-rich-text-content mt-1 whitespace-pre-line text-xs leading-relaxed opacity-75 ${theme.cardTitle}`}
            dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(link.description) }}
          />
        )}
        <span className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${theme.chevron}`}>
          {ctaText} <IconChevronRight className="h-3.5 w-3.5" />
        </span>
      </>
    );
    const cardClassName = `block w-full ${theme.cardRounded ?? "rounded-2xl"} p-4 text-left transition-all duration-300 ${theme.card}`;
    return interactive ? (
      <TrackedLink
        key={link.id}
        username={data.username}
        pageSlug={data.pageSlug}
        linkId={link.id}
        href={buildUtmHref(link.url, link.title, data.utmEnabled)}
        className={cardClassName}
      >
        {cardInner}
      </TrackedLink>
    ) : (
      <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className={cardClassName}>
        {cardInner}
      </a>
    );
  }

  if (link.blockType === "catalog") {
    // "catalog" -- permintaan langsung pengguna, 25 Agustus 2026: "blok
    // diklik -> muncul blok blok baru seperti ke page baru... misal nya
    // ada blok Jenis Rumah ketika di klik akan tampil semua blok dengan
    // isi jenis jenis rumah yang ada dan keitka di klik masing masing itu
    // bisa menampilkan gambar dan juga deskripsi dan gambar bisa
    // multiple". Baris ini CUMA trigger (ikon+judul+panah) -- isi
    // drill-down-nya dirender CatalogTakeoverView di bawah, dipicu lewat
    // onOpenCatalog (state-nya hidup di komponen halaman paling atas,
    // lihat catatan lengkap di parameter fungsi ini). disabled kalau
    // onOpenCatalog tidak dioper (lihat catatan lingkup di sana) --
    // TIDAK bisa diklik, alih-alih diam-diam tidak melakukan apa-apa.
    return (
      <button
        key={link.id}
        type="button"
        disabled={!onOpenCatalog}
        onClick={() => onOpenCatalog?.(link)}
        className={`group relative flex w-full items-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-left transition-all duration-300 ${theme.card} ${
          onOpenCatalog ? "" : "cursor-default opacity-70"
        }`}
      >
        {/* resolveBlockIcon (bukan LayoutGrid hardcode) -- laporan langsung
            pengguna, 18 September 2026: "saya mengganti icon catalog tapi
            tidak berganti" -- SEMUA tipe blok lain (video/faq/gallery/dst)
            sudah lewat resolveBlockIcon sejak 14 Agustus 2026, cuma baris
            Katalog ini yang masih mengabaikan custom_icon_url/icon_key/
            icon_color yang dipilih kreator di dashboard. */}
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center ${theme.cardTitle}`}>
          {resolveBlockIcon(link, LayoutGrid, "h-5 w-5")}
        </span>
        <span className={`min-w-0 flex-1 truncate px-2 text-[11px] font-semibold ${theme.cardTitle}`}>{link.title}</span>
        {onOpenCatalog && <IconChevronRight className={`h-4 w-4 flex-shrink-0 ${theme.chevron}`} />}
      </button>
    );
  }

  // 9 tipe blok "full parity" mode Builder (permintaan langsung pengguna
  // 12 September 2026, dikonfirmasi via AskUserQuestion: "Full parity
  // semua tipe blok") -- TERJEMAHAN LANGSUNG dari case yang sudah ada di
  // renderBuilderNode (node. -> link., node.blockData -> link.blockData),
  // MINUS atribut data-builder-node-id/data-builder-block-type & ring
  // seleksi (spesifik kanvas Builder, tidak relevan di sini). button/
  // embed_link (satu-satunya dua yang punya href) SENGAJA ikut pola
  // TrackedLink/plain-`<a>` yang SUDAH established di renderer INI (lihat
  // "link"/project_showcase di bawah) untuk mode non-interactive, BUKAN
  // pola `role="button" aria-disabled` Builder -- keduanya menghasilkan
  // tampilan PUBLIK yang identik (interactive selalu true di halaman
  // publik sungguhan), beda hanya di perilaku live-preview dashboard
  // masing-masing, yang memang sudah punya konvensi sendiri-sendiri.
  if (link.blockType === "button") {
    const className = `flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-2.5 text-center text-xs font-bold transition-all duration-300 ${theme.buyButton}`;
    return interactive ? (
      <TrackedLink key={link.id} username={data.username} pageSlug={data.pageSlug} linkId={link.id} href={buildUtmHref(link.url, link.title, data.utmEnabled)} className={className}>
        {link.title}
      </TrackedLink>
    ) : (
      <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className={className}>
        {link.title}
      </a>
    );
  }

  if (link.blockType === "image") {
    const imageUrl = link.blockData?.image_url as string | undefined;
    if (!imageUrl) {
      return (
        <div key={link.id} className={`flex w-full items-center justify-center rounded-xl p-8 text-xs ${theme.card} ${theme.bio}`}>
          {link.title || "Foto"}
        </div>
      );
    }
    // link tujuan + caption -- susulan 14 September 2026 (permintaan
    // langsung pengguna: "gambar: link opsional + judul jadi caption").
    // Sebelumnya judul cuma jadi `alt` (tidak pernah terlihat pengunjung)
    // dan foto tidak bisa diklik sama sekali -- reuse pola TrackedLink/`<a>`
    // yang SAMA PERSIS sudah dipakai project_showcase/embed_link di atas.
    const img = (
      // `aspect-auto h-auto` WAJIB di sini (audit performa 15 September 2026,
      // migrasi next/image) dan ini kasus yang BEDA dari blok ber-aspect-video
      // di atas: blok "gambar" menampilkan foto kreator apa adanya pada RASIO
      // ASLINYA (dulu <img> tanpa atribut dimensi sama sekali). Begitu <Image>
      // memasang width/height, UA memberi elemen `aspect-ratio: width/height`
      // -- rasio TEBAKAN kita, bukan rasio foto sungguhan -- sehingga foto
      // potret/panorama akan terpotong salah. `aspect-auto` mengembalikan
      // `aspect-ratio: auto` supaya rasio diambil dari foto aslinya lagi, dan
      // `h-auto` membiarkan tingginya dihitung dari rasio itu. width/height
      // 448x448 murni petunjuk srcset (lebar kolom publik), BUKAN rasio.
      <Image src={imageUrl} alt={link.title || ""} width={448} height={448} className="aspect-auto h-auto w-full rounded-xl object-cover" />
    );
    const caption = link.title && <p className={`mt-1.5 truncate text-xs font-semibold ${theme.cardTitle}`}>{link.title}</p>;
    if (!link.url) {
      return (
        <div key={link.id} className="w-full">
          {img}
          {caption}
        </div>
      );
    }
    return (
      <div key={link.id} className="w-full">
        {interactive ? (
          <TrackedLink username={data.username} pageSlug={data.pageSlug} linkId={link.id} href={buildUtmHref(link.url, link.title, data.utmEnabled)} className="block">
            {img}
          </TrackedLink>
        ) : (
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="block">
            {img}
          </a>
        )}
        {caption}
      </div>
    );
  }

  if (link.blockType === "video_image") {
    const videoUrl = (link.blockData?.video_url as string) ?? "";
    const imageUrl = (link.blockData?.image_url as string) ?? "";
    return (
      <div key={link.id} className="flex w-full flex-col gap-2 rounded-xl">
        {videoUrl && <VideoEmbedBlock title={link.title} videoUrl={videoUrl} cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`} titleClassName={theme.cardTitle} />}
        {imageUrl && (
          // Rasio ASLI foto, sama persis kasusnya dengan blok "gambar" di atas
          // -- lihat catatan panjang `aspect-auto h-auto` di sana.
          <Image src={imageUrl} alt={link.title || ""} width={448} height={448} className="aspect-auto h-auto w-full rounded-xl object-cover" />
        )}
        {!videoUrl && !imageUrl && (
          <div className={`flex w-full items-center justify-center rounded-xl p-8 text-xs ${theme.card} ${theme.bio}`}>{link.title || "Video + Foto"}</div>
        )}
      </div>
    );
  }

  if (link.blockType === "embed_link") {
    // "embed_link" -- kartu link MANUAL (judul/deskripsi/URL dari kolom
    // links yang sudah ada, PERSIS pola project_showcase, TANPA fetch
    // metadata server sama sekali), thumbnail dari block_data.image_url.
    const imageUrl = (link.blockData?.image_url as string) ?? "";
    const cardClassName = `flex w-full flex-col gap-2 overflow-hidden rounded-xl p-2.5 ${theme.card}`;
    const inner = (
      <>
        {imageUrl && (
          // `h-auto` menemani `aspect-video`, alasan sama seperti blok
          // project_showcase di atas. Lebarnya `calc(100%+20px)` (sengaja
          // meluber menutup padding kartu), jadi angka width/height di bawah
          // murni petunjuk srcset pada rasio 16:9.
          <Image src={imageUrl} alt="" width={448} height={252} className="-m-2.5 mb-0 aspect-video h-auto w-[calc(100%+20px)] object-cover" />
        )}
        <p className={`text-xs font-semibold ${theme.cardTitle}`}>{link.title}</p>
        {link.description && (
          <p
            className={`jeon-rich-text-content whitespace-pre-line text-[11px] ${theme.bio}`}
            dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(link.description) }}
          />
        )}
      </>
    );
    if (!link.url) {
      return (
        <div key={link.id} className={cardClassName}>
          {inner}
        </div>
      );
    }
    return interactive ? (
      <TrackedLink key={link.id} username={data.username} pageSlug={data.pageSlug} linkId={link.id} href={buildUtmHref(link.url, link.title, data.utmEnabled)} className={cardClassName}>
        {inner}
      </TrackedLink>
    ) : (
      <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className={`${cardClassName} opacity-80`}>
        {inner}
      </a>
    );
  }

  if (link.blockType === "image_slider") {
    return (
      <div key={link.id} className="w-full rounded-xl">
        <ImageSliderBlock title={link.title} images={(link.blockData?.images as string[]) ?? []} cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`} titleClassName={theme.cardTitle} />
      </div>
    );
  }

  if (link.blockType === "countdown") {
    return (
      <div key={link.id} className="w-full rounded-xl">
        <CountdownBlock
          title={link.title}
          targetAt={link.blockData?.target_at as string | undefined}
          cardClassName={`w-full rounded-xl p-2.5 ${theme.card} ${theme.cardTitle}`}
          titleClassName={theme.cardTitle}
          expiredLabel="Sudah berakhir"
          unitLabels={{ days: "Hari", hours: "Jam", minutes: "Menit", seconds: "Detik" }}
          actionSlot={renderCountdownAction(link.blockData, data, theme, canBuy)}
        />
      </div>
    );
  }

  if (link.blockType === "list") {
    return (
      <div key={link.id} className="w-full rounded-xl">
        <ListBlock
          title={link.title}
          style={(link.blockData?.style as "list" | "card" | "testimony" | undefined) ?? "list"}
          items={(link.blockData?.items as ListBlockItem[]) ?? []}
          cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`}
          titleClassName={theme.cardTitle}
          itemTitleClassName={theme.cardTitle}
          itemBodyClassName={theme.bio}
        />
      </div>
    );
  }

  if (link.blockType === "embed") {
    return (
      <div key={link.id} className="w-full rounded-xl">
        <EmbedBlock title={link.title} embedUrl={(link.blockData?.embed_url as string) ?? ""} cardClassName={`w-full rounded-xl p-2.5 ${theme.card}`} titleClassName={theme.cardTitle} />
      </div>
    );
  }

  if (link.blockType === "produk") {
    // "produk" -- SAMA PERSIS renderBuilderNode's case "produk" (lihat
    // catatan lengkap di sana): fallback baca product_id tunggal (field
    // lama), 4 opsi layout, grid 2 kolom begitu 2+ produk.
    const rawProductIds = link.blockData?.product_ids as string[] | undefined;
    const productIds = Array.isArray(rawProductIds) ? rawProductIds : link.blockData?.product_id ? [link.blockData.product_id as string] : [];
    const selectedProducts = productIds.map((id) => data.products.find((p) => p.id === id)).filter((p): p is PagePreviewProduct => !!p);
    const renderProduct = PRODUK_LAYOUT_RENDERERS[link.blockData?.layout as string] ?? renderSingleProductCard;
    const trackProduct = (productClickId: string) =>
      data.pageSlug
        ? trackEventBySlug(data.username, data.pageSlug, { event_type: "product_click", product_id: productClickId })
        : trackEvent(data.username, { event_type: "product_click", product_id: productClickId });
    const ctx = { referralCode: data.referralCode, username: data.username, pageSlug: data.pageSlug, shopPaused: data.shopPaused };
    // Grid vs kartu tunggal ditentukan dari JUMLAH TERPILIH (bukan hasil
    // filter chip): kalau pengunjung menyaring sampai tersisa 1 produk,
    // tata letak tetap grid supaya blok tidak melompat lebar.
    const useGrid = selectedProducts.length > 1;
    return (
      <div key={link.id} className="w-full rounded-xl">
        {selectedProducts.length === 0 ? (
          <div className={`flex w-full items-center justify-center rounded-xl p-8 text-xs ${theme.card} ${theme.bio}`}>{link.title || "Produk"}</div>
        ) : (
          <ProdukCategoryFilter products={selectedProducts} enabled={link.blockData?.show_category_filter === true} theme={theme}>
            {(visible) =>
              useGrid ? (
                <div className="grid w-full grid-cols-2 gap-3">{visible.map((product) => renderProduct(product, theme, canBuy, ctx, trackProduct))}</div>
              ) : (
                renderProduct(visible[0], theme, canBuy, ctx, trackProduct)
              )
            }
          </ProdukCategoryFilter>
        )}
      </div>
    );
  }

  // "Featured Link" (permintaan langsung pengguna, referensi "Featured
  // Layout" Linktree sungguhan, hasil analisa benchmark 13 Agustus 2026):
  // tautan tampil sebagai kartu thumbnail 16:9, bukan baris teks klasik
  // di bawah -- dipakai SELEKTIF untuk 1-2 tautan terpenting (video/
  // promo), lihat catatan lengkap di isFeatured/thumbnailUrl,
  // PagePreviewLink. SENGAJA dilewati untuk tautan terkunci (!link.lockType)
  // -- interaksi buka-kunci (LockedLinkButton) tidak dirancang untuk
  // bentuk kartu, dan URL asli tautan terkunci memang belum boleh
  // diketahui sebelum gerbang terlewati, di luar cakupan permintaan ini.
  if (!link.lockType && link.isFeatured && link.thumbnailUrl) {
    const { Icon: LinkPlatformIcon, iconColorClass } = detectLinkIcon(link.url);
    const libraryIcon = getLibraryIcon(link.iconKey);
    const cardClassName = `group block w-full overflow-hidden ${theme.cardRounded ?? "rounded-xl"} ${theme.card} transition-all duration-300`;
    const cardInner = (
      <>
        <div className="relative aspect-video w-full overflow-hidden">
          {/* `fill` -- pembungkusnya MEMANG sudah `relative` + aspect-video
              (tidak perlu menambah apa pun), lebarnya ikut kolom. Catatan:
              thumbnail ini bisa berupa URL img.youtube.com yang diturunkan
              otomatis backend untuk tautan YouTube ber-"featured" (links.go),
              bukan cuma unggahan kreator -- host itu sudah didaftarkan di
              images.remotePatterns, lihat catatannya di next.config.js. */}
          <Image
            src={link.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 448px) 100vw, 448px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
            style={link.iconColor ? { color: link.iconColor } : undefined}
          >
            {link.customIconUrl ? (
              // Ukuran TETAP 28px -- span pembungkusnya h-7 w-7.
              <Image src={link.customIconUrl} alt="" width={28} height={28} className="h-full w-full rounded-full object-cover" />
            ) : libraryIcon ? (
              <libraryIcon.Icon className="h-3.5 w-3.5" />
            ) : (
              <LinkPlatformIcon className={`h-3.5 w-3.5 ${link.iconColor ? "" : iconColorClass}`} />
            )}
          </span>
        </div>
        <p className={`truncate px-3 py-2.5 text-left text-[11px] font-semibold ${theme.cardTitle}`}>{link.title}</p>
      </>
    );
    return interactive ? (
      <TrackedLink
        key={link.id}
        username={data.username}
        pageSlug={data.pageSlug}
        linkId={link.id}
        href={buildUtmHref(link.url, link.title, data.utmEnabled)}
        className={cardClassName}
      >
        {cardInner}
      </TrackedLink>
    ) : (
      <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className={cardClassName}>
        {cardInner}
      </a>
    );
  }

  // Tautan biasa (block_type default "link") -- gaya ala Linktree: judul
  // SELALU rata tengah di dalam tombol, ikon platform (kalau ada)
  // mengambang di kiri absolut supaya tidak menggeser judul dari titik
  // tengah tombol.
  return link.lockType ? (
    interactive ? (
      <LockedLinkButton
        key={link.id}
        username={data.username}
        pageSlug={data.pageSlug}
        linkId={link.id}
        title={link.title}
        lockType={link.lockType}
        lockMinAge={link.lockMinAge ?? null}
        className={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
      />
    ) : (
      <button
        key={link.id}
        type="button"
        disabled
        title="Pratinjau -- tombol ini tidak aktif"
        className={`relative flex w-full cursor-not-allowed items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold opacity-80 ${theme.card} ${theme.cardTitle}`}
      >
        <span className="w-full break-words text-center">🔒 {link.title}</span>
      </button>
    )
  ) : interactive ? (
    (() => {
      const { Icon: LinkPlatformIcon, iconColorClass } = detectLinkIcon(link.url);
      const libraryIcon = getLibraryIcon(link.iconKey);
      const iconNode = link.customIconUrl ? (
        // Ukuran TETAP 40px = span pembungkus TERBESAR yang memakai iconNode
        // (h-10 w-10; varian lain h-9 w-9) -- ukuran tampil tetap dari
        // `h-full w-full`, angka ini cuma petunjuk srcset.
        <Image src={link.customIconUrl} alt="" width={40} height={40} className="h-full w-full rounded-full object-cover" />
      ) : libraryIcon ? (
        <libraryIcon.Icon className={link.description ? "h-5 w-5" : "h-6 w-6"} />
      ) : (
        <LinkPlatformIcon className={`${link.description ? "h-5 w-5" : "h-7 w-7"} ${link.iconColor ? "" : iconColorClass}`} />
      );
      // description -- permintaan langsung pengguna, 24 Agustus 2026 (contoh
      // template "Dimas Dev"): kalau diisi, kartu "kaya" (ikon + judul +
      // subjudul rata KIRI + panah kanan) menggantikan baris klasik rata
      // tengah -- lihat catatan lengkap di PagePreviewLink.description.
      return link.description ? (
        <TrackedLink
          key={link.id}
          username={data.username}
          pageSlug={data.pageSlug}
          linkId={link.id}
          href={buildUtmHref(link.url, link.title, data.utmEnabled)}
          className={`group flex w-full items-center gap-3 ${theme.cardRounded ?? "rounded-xl"} px-4 py-3 text-left transition-all duration-300 ${theme.card}`}
        >
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center"
            style={link.iconColor ? { color: link.iconColor } : undefined}
          >
            {iconNode}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[12px] font-semibold ${theme.cardTitle}`}>{link.title}</span>
            <span className={`block truncate text-[10.5px] opacity-70 ${theme.cardTitle}`}>{link.description}</span>
          </span>
          <IconChevronRight className={`h-4 w-4 flex-shrink-0 ${theme.chevron}`} />
        </TrackedLink>
      ) : (
        <TrackedLink
          key={link.id}
          username={data.username}
          pageSlug={data.pageSlug}
          linkId={link.id}
          href={buildUtmHref(link.url, link.title, data.utmEnabled)}
          className={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
        >
          <span
            className="absolute left-2 top-1/2 flex h-9 w-9 flex-shrink-0 -translate-y-1/2 items-center justify-center"
            style={link.iconColor ? { color: link.iconColor } : undefined}
          >
            {iconNode}
          </span>
          <span className="w-full break-words px-8 text-center">{link.title}</span>
        </TrackedLink>
      );
    })()
  ) : (
    (() => {
      const { Icon: LinkPlatformIcon, iconColorClass } = detectLinkIcon(link.url);
      const libraryIcon = getLibraryIcon(link.iconKey);
      const iconNode = link.customIconUrl ? (
        // Ukuran TETAP 40px = span pembungkus TERBESAR yang memakai iconNode
        // (h-10 w-10; varian lain h-9 w-9) -- ukuran tampil tetap dari
        // `h-full w-full`, angka ini cuma petunjuk srcset.
        <Image src={link.customIconUrl} alt="" width={40} height={40} className="h-full w-full rounded-full object-cover" />
      ) : libraryIcon ? (
        <libraryIcon.Icon className={link.description ? "h-5 w-5" : "h-6 w-6"} />
      ) : (
        <LinkPlatformIcon className={`${link.description ? "h-5 w-5" : "h-7 w-7"} ${link.iconColor ? "" : iconColorClass}`} />
      );
      return link.description ? (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`group flex w-full items-center gap-3 ${theme.cardRounded ?? "rounded-xl"} px-4 py-3 text-left transition-all duration-300 ${theme.card}`}
        >
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center"
            style={link.iconColor ? { color: link.iconColor } : undefined}
          >
            {iconNode}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[12px] font-semibold ${theme.cardTitle}`}>{link.title}</span>
            <span className={`block truncate text-[10.5px] opacity-70 ${theme.cardTitle}`}>{link.description}</span>
          </span>
          <IconChevronRight className={`h-4 w-4 flex-shrink-0 ${theme.chevron}`} />
        </a>
      ) : (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
        >
          <span
            className="absolute left-2 top-1/2 flex h-9 w-9 flex-shrink-0 -translate-y-1/2 items-center justify-center"
            style={link.iconColor ? { color: link.iconColor } : undefined}
          >
            {iconNode}
          </span>
          <span className="w-full break-words px-8 text-center">{link.title}</span>
        </a>
      );
    })()
  );
}

// CatalogFrame -- satu "layar" dalam tumpukan drill-down katalog (lihat
// catatan lengkap di CatalogTakeoverView di bawah). Sejak "flatten total"
// (15 September 2026) TIDAK ADA lagi `selectedItemId`/grid-tile -- SATU
// frame = SATU layar yang langsung menampilkan SEMUA item & SEMUA
// bloknya sekaligus, tanpa klik apa pun. Tumpukan (`stack`) tersisa
// HANYA untuk katalog BERSARANG (Premium, blok "catalog" di dalam
// sebuah item) -- itu SATU-SATUNYA alasan push/pop frame baru sekarang.
interface CatalogFrame {
  title: string;
  items: CatalogItem[];
}

// CatalogTakeoverView -- permintaan langsung pengguna, 25 Agustus 2026:
// blok "catalog" ("Jenis Rumah" -> daftar jenis -> detail per jenis,
// gambar bisa multiple). Dikonfirmasi lewat AskUserQuestion: GANTI ISI
// HALAMAN langsung (bukan overlay/modal di atasnya) -- avatar/bio/tautan
// lain disembunyikan SEMENTARA, komponen ini menggantikan tempatnya
// persis, tombol kembali di atas.
//
// Revisi 27 Agustus 2026 (permintaan langsung pengguna: "sub blok ini
// bisa lebih dari 2, 3 untuk user premium"): state 2-tingkat TETAP
// (selectedItemId tunggal) diganti TUMPUKAN `stack: CatalogFrame[]` --
// item boleh punya `blocks[]` tertanam (EmbeddedCatalogBlock, lihat
// api-client.ts), salah satunya boleh bertipe "catalog" lagi (Premium,
// lihat validateBlockDataAtDepth/checkCatalogPremiumGate di links.go),
// yang membuka FRAME BARU di atas tumpukan.
//
// Revisi 15 September 2026 (permintaan langsung pengguna, screenshot
// item "Product Shopee": "kenapa saya harus klik blok ini baru tampil
// semua blok yang saya tambahkan... harusnya kan ketika klik katalog
// langsung muncul semua blok yang sudah saya tambahkan"): grid-tile +
// klik-per-item DIHAPUS TOTAL (dikonfirmasi lewat AskUserQuestion --
// opsi yang dipilih pengguna: "semua item & semua bloknya langsung
// tampil, tanpa klik sama sekali", BUKAN opsi tengah yang masih
// menyisakan klik untuk item multi-blok). goBack() sekarang cuma 2
// kemungkinan (bukan 3): pop stack (keluar dari katalog bersarang) ->
// onExit (stack kosong, keluar dari takeover). Satu pengecualian
// disengaja: blok "catalog" BERSARANG di dalam sebuah item TETAP
// klik-untuk-buka (drill-down asli, TIDAK ikut diratakan rekursif) --
// meratakan pohon bercabang tak berbatas (maxCatalogDepth=5) ke satu
// layar bisa menghasilkan halaman sangat panjang tanpa kendali, dan pola
// "Jenis Rumah -> daftar jenis -> detail" yang jadi alasan awal fitur
// bersarang ini memang tentang penjelajahan bertingkat, bukan tampilan
// datar. Lihat segmentasi grid produk di badan fungsi ini.
//
// Sekarang dipakai DI SEMUA jalur render halaman publik (Bio klasik,
// Toko klasik/ProdukPagePreview, MAUPUN Mode Builder/BuilderPagePreview)
// -- ketiganya sekarang benar mengoper onOpenCatalog (bug jalur Toko/
// Builder ditemukan & diperbaiki 14 September 2026, lihat commit
// 0d7f14b), beda dari catatan lama di sini yang bilang "SENGAJA cuma di
// Bio" (sudah tidak akurat).
// findCatalogLinkedProduct -- item katalog "referensi hidup" ke produk
// (permintaan langsung pengguna 14 September 2026, dikonfirmasi lewat
// AskUserQuestion, ala katalog Tokopedia): begitu item punya blok "produk"
// tertanam, tampilan grid & detail HARUS mengambil nama/harga/sampul
// LANGSUNG dari data.products TERKINI, bukan title/images statis yang
// tersimpan di item itu sendiri -- supaya kalau produknya diedit lagi
// nanti, katalog ikut berubah otomatis tanpa perlu disinkronkan manual.
// Pola pembacaan product_ids/product_id SAMA PERSIS blok "produk" tingkat
// atas (lihat case "produk" di renderLinkOrBlock/renderBuilderNode).
function findCatalogLinkedProduct(blocks: EmbeddedCatalogBlock[] | undefined, products: PagePreviewProduct[]): PagePreviewProduct | undefined {
  const produkBlock = (blocks ?? []).find((b) => b.block_type === "produk");
  if (!produkBlock) return undefined;
  const rawProductIds = produkBlock.block_data?.product_ids as string[] | undefined;
  const productIds = Array.isArray(rawProductIds)
    ? rawProductIds
    : produkBlock.block_data?.product_id
      ? [produkBlock.block_data.product_id as string]
      : [];
  // Bug ditemukan lewat laporan langsung pengguna, 15 September 2026
  // (screenshot staging: "di katalog saya mengisi blok product dengan 2
  // product tapi hasil nya malah ga sesuai"): versi lama fungsi ini
  // SELALU ambil productIds[0] tanpa mengecek jumlahnya -- begitu kreator
  // memilih 2+ produk di SATU blok "produk" tertanam, produk ke-2 dst
  // diam-diam HILANG (tidak pernah dirender sama sekali), karena item ini
  // salah diklasifikasikan sbg segmen "products" (satu kartu produk
  // tunggal, lihat CatalogTakeoverView) alih-alih segmen "item" biasa yang
  // merender blok "produk"-nya APA ADANYA (yang sudah benar menangani 2+
  // produk sbg grid 2 kolom internal, lihat case blockType "produk" di
  // renderLinkOrBlock). "Referensi hidup" 1-item-1-produk cuma masuk akal
  // kalau PERSIS 1 produk terpilih -- 2+ produk berarti kreator sengaja
  // mau tampilan grid multi-produk, BUKAN referensi hidup satu produk.
  if (productIds.length !== 1) return undefined;
  return products.find((p) => p.id === productIds[0]);
}

export function CatalogTakeoverView({
  link,
  theme,
  data,
  interactive,
  canBuy,
  rootClassName,
  onExit,
}: {
  link: PagePreviewLink;
  theme: PageTheme;
  // "products" -- dipakai renderLinkOrBlock utk cabang blockType "produk"
  // (blok "produk" tertanam di dalam item katalog, susulan 14 September
  // 2026 -- SEBELUMNYA komentar di sini bilang "produk" bukan tipe
  // tertanam yang valid, sudah tidak akurat sejak allowedCatalogEmbeddedBlockTypes
  // diperluas, lihat links.go).
  data: Pick<PagePreviewData, "username" | "pageSlug" | "utmEnabled" | "products" | "referralCode" | "shopPaused">;
  interactive: boolean;
  // canBuy -- bug ditemukan lewat laporan langsung pengguna (14 September
  // 2026, screenshot editor katalog): SEBELUMNYA di-hardcode `false` di
  // pemanggilan renderLinkOrBlock utk blocks[] tertanam (komentar lama
  // "produk BUKAN tipe blok tertanam yang valid, canBuy tidak pernah
  // dipakai" -- sudah basi), membuat tombol Beli produk yang ditanam di
  // dalam item katalog SELALU tampil sbg placeholder nonaktif ("tombol
  // ini tidak aktif"), bukan tombol Beli sungguhan walau toko TIDAK
  // sedang dijeda. Sekarang diteruskan APA ADANYA dari pemanggil, pola
  // sama persis blok "produk" tingkat atas/Canvas Builder.
  canBuy: boolean;
  rootClassName: string;
  onExit: () => void;
}) {
  const rootItems = ((link.blockData?.items as CatalogItem[]) ?? []).filter((it) => it && it.id);
  const [stack, setStack] = useState<CatalogFrame[]>([{ title: link.title, items: rootItems }]);
  const frame = stack[stack.length - 1];

  function goBack() {
    if (stack.length > 1) {
      setStack((s) => s.slice(0, -1));
    } else {
      onExit();
    }
  }

  // openNestedCatalog -- dioper sebagai `onOpenCatalog` ke renderLinkOrBlock
  // saat merender blok tertanam bertipe "catalog" (lihat pemetaan
  // EmbeddedCatalogBlock -> PagePreviewLink sintetis di bawah) -- SATU-
  // SATUNYA jalur yang masih mendorong frame baru ke tumpukan sejak
  // "flatten total" (lihat catatan lengkap di atas fungsi ini).
  function openNestedCatalog(nestedLink: PagePreviewLink) {
    const nestedItems = ((nestedLink.blockData?.items as CatalogItem[]) ?? []).filter((it) => it && it.id);
    setStack((s) => [...s, { title: nestedLink.title, items: nestedItems }]);
  }

  // trackProduct/productCtx -- SAMA PERSIS pola blok "produk" tingkat atas
  // (lihat case "produk" di renderLinkOrBlock), dipakai khusus utk render
  // GRID produk gaya Tokopedia di bawah (segmen "products") -- blok
  // "produk" LAIN (bukan bagian grid ini, mis. tertanam bareng blok lain
  // dalam satu item) tetap lewat renderLinkOrBlock apa adanya, sudah
  // punya trackProduct/ctx sendiri di sana.
  const trackProduct = (productClickId: string) =>
    data.pageSlug
      ? trackEventBySlug(data.username, data.pageSlug, { event_type: "product_click", product_id: productClickId })
      : trackEvent(data.username, { event_type: "product_click", product_id: productClickId });
  const productCtx = { referralCode: data.referralCode, username: data.username, pageSlug: data.pageSlug, shopPaused: data.shopPaused };

  // segments -- "flatten total" (susulan 15 September 2026, permintaan
  // langsung pengguna dari screenshot item "Product Shopee": "kenapa saya
  // harus klik blok ini baru tampil semua blok yang saya tambahkan...
  // harusnya kan ketika klik katalog langsung muncul semua blok yang
  // sudah saya tambahkan", lalu sekalian diminta tingkatkan UI/UX-nya).
  // Dikonfirmasi lewat AskUserQuestion: SEMUA item & bloknya tampil
  // LANGSUNG di layar ini, tanpa grid-tile & tanpa klik apa pun (kecuali
  // katalog bersarang, lihat catatan di atas fungsi).
  //
  // Item yang PERSIS py 1 blok "produk" bertaut ke produk sungguhan
  // dikelompokkan jadi RUN berurutan (mempertahankan urutan asli item,
  // bukan disortir ulang) & dirender sbg GRID 2 kolom kartu produk --
  // gaya "grid Tokopedia" yang diminta (SAMA PERSIS renderSingleProductCard
  // yang dipakai blok "produk" tingkat atas dgn 2+ produk), jauh lebih
  // rapi & padat drpd satu kolom kartu berturut-turut. Layout kustom yang
  // sempat dipilih kreator di blok "produk" itu sendiri (row/list/dst)
  // SENGAJA diabaikan di sini -- grid katalog butuh SATU bentuk kartu
  // seragam di semua sel, mencampur beberapa layout akan merusak
  // kerapian grid. Item lain (judul/deskripsi/foto manual peninggalan
  // dari sebelum field itu dihapus, ATAU item dgn >1 blok tertanam)
  // dirender apa adanya sbg bagiannya sendiri, TIDAK ikut grid.
  type CatalogSegment =
    | { kind: "products"; entries: { item: CatalogItem; product: PagePreviewProduct }[] }
    | { kind: "item"; item: CatalogItem };
  const segments: CatalogSegment[] = [];
  for (const item of frame.items) {
    const blocks = item.blocks ?? [];
    const linkedProduct = blocks.length === 1 ? findCatalogLinkedProduct(blocks, data.products) : undefined;
    if (linkedProduct) {
      const last = segments[segments.length - 1];
      if (last?.kind === "products") last.entries.push({ item, product: linkedProduct });
      else segments.push({ kind: "products", entries: [{ item, product: linkedProduct }] });
    } else {
      segments.push({ kind: "item", item });
    }
  }

  return (
    <main className={`relative ${rootClassName} ${theme.page}`} style={theme.pageStyle}>
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label="Kembali"
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${theme.card}`}
          >
            <ChevronLeft className={`h-5 w-5 ${theme.cardTitle}`} />
          </button>
          <h1 className={`min-w-0 flex-1 truncate font-heading text-lg font-bold ${theme.name}`}>{frame.title}</h1>
        </div>

        <div className="flex flex-col gap-6">
          {segments.map((seg, i) =>
            seg.kind === "products" ? (
              <div key={`products-${i}`} className={seg.entries.length === 1 ? "" : "grid grid-cols-2 gap-3"}>
                {seg.entries.map(({ item, product }) => (
                  <div key={item.id}>{renderSingleProductCard(product, theme, canBuy, productCtx, trackProduct)}</div>
                ))}
              </div>
            ) : (
              <div key={seg.item.id} className="flex flex-col gap-3">
                {/* Judul/foto/deskripsi manual -- peninggalan item lama
                    (sebelum field ini dihapus dari editor, lihat commit
                    f5e3ce6) TETAP ditampilkan apa adanya di sini, TIDAK
                    dihapus datanya -- cuma UI utk MENGISI yang sudah tidak
                    ada lagi di dashboard.
                    `?? []` (bug ditemukan 15 September 2026, live preview
                    dashboard crash total "Cannot read properties of
                    undefined (reading 'length')"): tipe CatalogItem.images
                    di api-client.ts bilang WAJIB `string[]`, tapi itu janji
                    compile-time saja -- item yang dibuat lewat jalur SELAIN
                    tombol "Tambah Item" resmi (mis. panggilan API langsung)
                    bisa saja tidak menyertakan field ini sama sekali, dan
                    runtime JSON.parse tidak pernah menegakkan tipe TS. */}
                {seg.item.title && <p className={`text-sm font-bold ${theme.cardTitle}`}>{seg.item.title}</p>}
                {(seg.item.images ?? []).length > 0 && (
                  <div className="-mx-6 flex snap-x snap-mandatory gap-2 overflow-x-auto px-6 pb-1">
                    {seg.item.images.map((src, idx) => (
                      // Tinggi TETAP (h-64 = 256px), lebar ikut kolom/85% --
                      // width/height di bawah cuma petunjuk srcset pada lebar
                      // kolom publik; ukuran tampil sepenuhnya dari CSS, jadi
                      // `h-auto` TIDAK boleh ditambahkan di sini (beda dari blok
                      // ber-aspect-video: tingginya memang sengaja dipatok).
                      <Image
                        key={idx}
                        src={src}
                        alt=""
                        width={448}
                        height={256}
                        className={`h-64 w-full flex-shrink-0 snap-center rounded-2xl object-cover ${seg.item.images.length > 1 ? "w-[85%]" : ""}`}
                      />
                    ))}
                  </div>
                )}
                {seg.item.description && (
                  <p
                    className={`jeon-rich-text-content whitespace-pre-line text-sm leading-relaxed ${theme.bio}`}
                    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(seg.item.description) }}
                  />
                )}
                {/* blocks[] -- permintaan langsung pengguna: "bisa menambahkan
                    semua blok yang sudah ada di web ini di dalam katalog".
                    Tiap blok tertanam dipetakan jadi PagePreviewLink SINTETIS
                    (bukan baris `links` sungguhan -- id gabungan cuma untuk
                    React key, TIDAK pernah dipakai buat tracking/analitik
                    karena tipe v1 -- text/faq/video/maps/catalog -- semuanya
                    TIDAK memanggil TrackedLink sama sekali, dicek langsung di
                    renderLinkOrBlock sebelum pola ini dipakai) lalu dirender
                    lewat renderLinkOrBlock APA ADANYA -- satu sumber kebenaran
                    tampilan yang sama dengan blok tingkat atas, tidak perlu
                    logika render terpisah. onOpenCatalog=openNestedCatalog di
                    sini (bukan dari prop) -- blok tertanam bertipe "catalog"
                    (Premium) TETAP membuka FRAME BARU (SATU-SATUNYA
                    pengecualian dari "flatten total", lihat catatan di atas
                    fungsi ini). */}
                {(seg.item.blocks ?? []).map((b) =>
                  renderLinkOrBlock(
                    { id: `${link.id}:${b.id}`, title: b.title, url: b.url ?? "", blockType: b.block_type, blockData: b.block_data, description: b.description },
                    theme,
                    data,
                    interactive,
                    // canBuy diteruskan apa adanya (lihat catatan lengkap di
                    // props CatalogTakeoverView) -- SEBELUMNYA hardcode false,
                    // membuat blok "produk" tertanam selalu tampil tombol Beli
                    // nonaktif.
                    canBuy,
                    openNestedCatalog
                  )
                )}
              </div>
            )
          )}
          {frame.items.length === 0 && <p className={`py-8 text-center text-xs ${theme.bio}`}>Belum ada item di katalog ini.</p>}
        </div>
      </div>
    </main>
  );
}

// Tampilan halaman publik kreator -- dipakai di DUA tempat: halaman publik
// sungguhan (app/[username]/page.tsx, interactive=true, tautan bisa
// diklik & dilacak, tombol Beli memicu checkout sungguhan) dan pratinjau
// live di dashboard (interactive=false, supaya kreator yang sedang
// bereksperimen dengan tautan/produk/tema tidak sengaja memicu checkout
// sungguhan atau mengotori statistik klik miliknya sendiri).
export default function PagePreview({
  data,
  interactive = true,
  rootClassName = "min-h-screen",
  editableStickers = false,
  onStickersChange,
  hideFooterChrome = false,
  selectedNodeId,
  isBuilderCanvas = false,
}: {
  data: PagePreviewData;
  interactive?: boolean;
  rootClassName?: string;
  // editableStickers/onStickersChange -- permintaan langsung pengguna:
  // "harusnya bagian stiker itu langsung edit di bagian pratinjau nya" --
  // dipakai KHUSUS oleh LivePreviewPanel saat tab Stiker aktif di
  // dashboard, supaya drag/resize terjadi di pratinjau ASLI (tema/avatar/
  // blok sungguhan), bukan kanvas mockup terpisah. TIDAK PERNAH true di
  // halaman publik sungguhan (app/[username]/page.tsx tidak mengoper prop
  // ini sama sekali).
  editableStickers?: boolean;
  onStickersChange?: (stickers: PageStickerData[]) => void;
  // hideFooterChrome -- permintaan langsung pengguna, 23 Agustus 2026:
  // kartu galeri Template homepage (components/landing/Templates.tsx)
  // merender PagePreview SUNGGUHAN dizoom kecil, TAPI watermark "Buat
  // halaman gratis di Jeon.id" + PageFooterLinks (Preferensi Cookie/
  // Laporkan/Privasi/dst) yang SELALU tampil di pratinjau dashboard biasa
  // (lihat catatan "Footer SELALU tampil" di bawah) jadi noise visual di
  // thumbnail sekecil itu -- teks kecil tak terbaca, terkesan berantakan.
  // Default false supaya TIDAK mengubah perilaku dashboard/halaman publik
  // yang sudah ada sama sekali, HANYA true di pemanggilan homepage itu.
  hideFooterChrome?: boolean;
  // selectedNodeId -- Canvas Page Builder (permintaan langsung pengguna 9
  // September 2026, "klik blok di kanvas juga"): id blok yang sedang
  // dipilih di BuilderLeftPanel, dipakai HANYA di jalur builderMode
  // "builder" (lihat BuilderPagePreview) untuk highlight ring blok
  // terpilih langsung di kanvas -- tidak relevan sama sekali di mode lain.
  selectedNodeId?: string;
  // isBuilderCanvas -- bug ditemukan lewat laporan langsung pengguna, 15
  // September 2026 ("kenapa pratinjau tidak bisa klik katalog"): SEBELUM
  // ini, blok Katalog di halaman builderMode="builder" cuma bisa diklik
  // saat `interactive=true` (halaman publik SUNGGUHAN) -- SEMUA pratinjau
  // non-interaktif (LivePreviewPanel dashboard/links, dashboard/products,
  // dashboard/design, homepage template gallery, DAN kanvas Canvas
  // Builder sungguhan) ikut kena gerbang yang sama, walau `interactive`
  // dulunya cuma dimaksudkan mencegah SISI-EFEK SUNGGUHAN (navigasi
  // keluar/checkout/tracking klik, lihat catatan di atas fungsi ini) --
  // membuka takeover Katalog TIDAK PUNYA efek samping sungguhan apa pun
  // (murni state React lokal, tidak menavigasi kemana pun), jadi SEHARUSNYA
  // aman di pratinjau read-only mana pun. Satu-satunya alasan sah
  // menahannya adalah KHUSUS kanvas Canvas Builder sungguhan
  // (BuilderCanvas.tsx) -- di sana klik pada baris blok harus MEMILIH node
  // (delegasi closest("[data-builder-node-id]") di wrapper-nya), BUKAN
  // membuka layar penuh yang akan mengganti seluruh kanvas edit. Flag ini
  // (HANYA true dari BuilderCanvas.tsx) memisahkan kasus itu dari semua
  // pratinjau read-only lain -- lihat pemakaiannya di BuilderPagePreview.
  isBuilderCanvas?: boolean;
}) {
  const theme = getPageTheme(data.theme, data.customTheme);
  // Modul Toko (Fase E5): toko dijeda -- semua tombol beli/daftar
  // dinonaktifkan di frontend juga (bukan cuma backend), supaya pengunjung
  // tidak membuka form checkout yang pasti ditolak.
  const canBuy = interactive && !data.shopPaused;
  // Gap #4 benchmark kompetitif (9 Agustus 2026): item wishlist yang
  // dipilih pendukung untuk "diwujudkan" -- undefined berarti donasi umum.
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | undefined>(undefined);
  // catalogView -- lihat catatan lengkap di CatalogTakeoverView. Blok yang
  // sedang dibuka (null = tidak ada, halaman tampil normal) -- SENGAJA
  // hook di sini, SEBELUM cabang pageType landing/produk di bawah, TIDAK
  // di dalam blok "catalog" SENDIRI (yang cuma fungsi biasa, bukan
  // komponen) -- state penuh 1 layar hanya bisa hidup di komponen
  // halaman PALING ATAS.
  const [catalogView, setCatalogView] = useState<PagePreviewLink | null>(null);

  // Canvas Page Builder (migrasi 000096, permintaan langsung pengguna 7
  // September 2026, dua screenshot Lynk.id): builderMode DICEK PALING
  // AWAL, SEBELUM cabang pageType di bawah -- berlaku LINTAS pageType
  // (bio MAUPUN landing, dikonfirmasi via AskUserQuestion), beda dari
  // ProdukPagePreview/LandingPagePreview yang masing-masing terikat SATU
  // pageType. undefined/"simple" (bawaan) jatuh tembus ke perilaku lama
  // di bawah, sama sekali tidak berubah.
  if (data.builderMode === "builder") {
    return (
      <BuilderPagePreview
        data={data}
        interactive={interactive}
        rootClassName={rootClassName}
        theme={theme}
        canBuy={canBuy}
        hideFooterChrome={hideFooterChrome}
        editableStickers={editableStickers}
        onStickersChange={onStickersChange}
        selectedNodeId={selectedNodeId}
        isBuilderCanvas={isBuilderCanvas}
      />
    );
  }

  // No.99 (Sprint 14): halaman landing dirender TERPISAH -- blok penuh-lebar
  // saja (heading/text/image/button/dst), TANPA avatar/bio-header/produk/
  // monetisasi, beda dari layout bio biasa di bawah. Landing TIDAK punya
  // stiker sama sekali (lihat catatan StickerOverlay), jadi tidak perlu
  // menerima editableStickers/onStickersChange.
  if (data.pageType === "landing") {
    // Landing page (No.99) tidak punya produk/monetisasi sama sekali --
    // shop_paused tidak relevan di sini, tetap pakai `interactive` biasa.
    return (
      <LandingPagePreview data={data} interactive={interactive} rootClassName={rootClassName} theme={theme} hideFooterChrome={hideFooterChrome} />
    );
  }

  // Modul Halaman Produk: showcase katalog Toko saja -- TANPA
  // tautan/donasi/lead-capture/event/loyalty, beda dari layout bio
  // biasa & dari layout landing (blok manual) di atas.
  if (data.pageType === "produk") {
    return (
      <ProdukPagePreview
        data={data}
        rootClassName={rootClassName}
        theme={theme}
        canBuy={canBuy}
        interactive={interactive}
        editableStickers={editableStickers}
        onStickersChange={onStickersChange}
        hideFooterChrome={hideFooterChrome}
      />
    );
  }

  // catalogView aktif -- ganti SELURUH isi halaman (avatar/bio/tautan
  // lain TIDAK ikut dirender sama sekali selama ini) dengan
  // CatalogTakeoverView, dikonfirmasi lewat AskUserQuestion. rootClassName
  // dipertahankan supaya tinggi/scroll-nya tetap konsisten dgn halaman
  // biasa (dashboard Pratinjau Langsung vs halaman publik sungguhan).
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
      {interactive && data.socialProof && (
        <SocialProofToast
          recent={data.socialProof.recent}
          displaySeconds={data.socialProof.displaySeconds}
          intervalSeconds={data.socialProof.intervalSeconds}
        />
      )}
      {/* Topbar: cuma tombol share kanan -- logo Jeonme di pojok kiri
          DIHILANGKAN (permintaan langsung pengguna), branding Jeonme cukup
          lewat pil "Buat halaman gratis di Jeonme" di bagian bawah. */}
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
        {/* ml-auto (bukan justify-between di kontainer) -- PageSwitcher
            return null kalau pages < 2, dan justify-between dengan SATU
            anak nyata akan mendorongnya ke KIRI (bukan tetap di kanan)
            begitu anak pertama tidak ikut dihitung sama sekali. ml-auto
            SELALU mendorong tombol ini ke kanan terlepas dari PageSwitcher
            merender apa pun. */}
        <div className="ml-auto">
          <ShareButton title={`@${data.username} — Jeon.id`} url={data.pageSlug ? `${SITE_URL}/${data.username}/${data.pageSlug}` : `${SITE_URL}/${data.username}`} />
        </div>
      </div>
      {/* Bug dilaporkan pengguna (8 Agustus 2026): "hasil stiker yang dibuat
          di pratinjau posisi nya berbeda dengan ketika kita akses linknya
          langsung" -- akar masalah: StickerOverlay SEBELUMNYA anak langsung
          <main> (lebar PENUH viewport di halaman publik desktop), padahal
          kolom konten yang benar-benar terlihat (avatar/tautan/dst) dibatasi
          max-w-md & di-tengah lewat mx-auto di bawah ini. Persentase x/y
          jadi dihitung relatif ke lebar yang SALAH -- kebetulan "benar" di
          kotak pratinjau dashboard (280px, lebih sempit dari max-w-md=448px
          jadi lebar main & kolom konten kebetulan sama), tapi meleset jauh
          di halaman publik desktop yang lebar mainnya jauh lebih besar dari
          kolom kontennya. Overlay dipindah jadi ANAK kolom max-w-md ini
          (relative ditambahkan di sini) supaya basis persentase SELALU sama
          persis dengan lebar kolom konten yang terlihat, di pratinjau
          MAUPUN halaman publik sungguhan, di lebar layar berapa pun. */}
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
            {data.showProfileHeader !== false && renderBioHeader(data, theme)}
          </div>
        </div>

        {renderSocialFeed(data.instagramFeed, theme)}
        {renderSocialFeed(data.tiktokFeed, theme)}

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

        {data.leadCapture && (
          <div className={`mt-8 flex w-full flex-col items-center gap-2 rounded-xl p-2.5 text-center ${theme.productCard}`}>
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

        {data.events && data.events.length > 0 && (
          <div className="mt-8 w-full">
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
                        <p className={`text-[11px] ${theme.bio}`}>
                          {soldOut ? "Kuota penuh" : `${event.spotsLeft} slot tersisa`}
                        </p>
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

        {data.donation && (
          <div className={`mt-8 flex w-full flex-col items-center gap-2 rounded-xl p-2.5 text-center ${theme.productCard}`}>
            <IconHeart className={`h-5 w-5 ${theme.chevron}`} />
            <p className={`text-xs font-semibold ${theme.productTitle}`}>{data.donation.title}</p>
            <p className={`text-xs ${theme.bio}`}>
              Mulai dari Rp {data.donation.minAmountIdr.toLocaleString("id-ID")}
            </p>

            {/* Target Donasi -- Gap #4 benchmark kompetitif, ala goal
                Saweria/Trakteer. goalAmountIdr 0/undefined = kreator belum
                memasang target, sembunyikan seluruh blok progress. */}
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
                  Rp {(data.donation.goalRaisedIdr ?? 0).toLocaleString("id-ID")} / Rp{" "}
                  {data.donation.goalAmountIdr.toLocaleString("id-ID")}
                </p>
              </div>
            )}

            {/* Wishlist -- Gap #4 benchmark kompetitif: pilih item spesifik
                untuk "diwujudkan", atau biarkan kosong untuk donasi umum. */}
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

        {/* Grid Produk DIHAPUS dari halaman Bio -- permintaan langsung
            pengguna, 19 Agustus 2026: "jangan tampilkan product di page
            link bio itu khusus dihalaman toko saja". Katalog produk masih
            dibagi lintas akun seperti biasa (lihat catatan CLAUDE.md).
            Susulan 15 September 2026: grid produk OTOMATIS dihapus TOTAL
            juga dari Halaman Toko (ProdukPagePreview/BuilderPagePreview)
            -- satu-satunya cara produk tampil di halaman publik mana pun
            sekarang adalah blok "produk" eksplisit. Pengunjung diarahkan
            ke Toko lewat hamburger nav top-left (lihat renderPageSwitcher)
            begitu akun ini punya produk. */}

        {!hideFooterChrome && (
          // mt-auto (bukan margin tetap) -- permintaan pengguna 3 September
          // 2026, temuan audit: di halaman yang isinya sedikit/kosong, blok
          // watermark+footer ini jadi elemen paling menonjol tepat di bawah
          // nama, seolah itu "konten" halaman. Kolom induk flex-col
          // min-h-full, jadi mt-auto mendorong blok ini ke DASAR viewport
          // kalau ada ruang tersisa -- konsisten dengan bagaimana footer
          // sistem/utilitas biasa terbaca (terpisah, di bawah, bukan
          // bersaing dengan konten pribadi kreator). Di halaman yang
          // kontennya sudah memenuhi/melebihi layar, ruang sisa = 0, jadi
          // perilakunya identik dengan margin biasa seperti sebelumnya --
          // tidak ada perubahan pada halaman yang sudah padat. Pola sama di
          // dua render lain di bawah (layout Toko & varian kedua Bio).
          <div className="mt-auto flex flex-col items-center gap-3 pt-10">
            {/* Modul Langganan Premium (permintaan langsung pengguna, 8
                Agustus 2026): kreator gratis SELALU tampil watermark ini,
                apa pun nilai hideWatermark -- kreator Premium bisa
                menyembunyikannya sendiri lewat toggle di Desain/Halaman Toko
                (lihat isPremiumUser backend & PagePreviewData.hideWatermark). */}
            <Watermark isPremium={data.isPremium} hideWatermark={data.hideWatermark} />
            {/* Footer SELALU tampil, termasuk di pratinjau dashboard
                (interactive=false) -- permintaan langsung pengguna: "tampilkan
                seluruh footer privacy dll", sebelumnya sengaja disembunyikan
                di pratinjau. Item "Laporkan" sudah aman tanpa pageId (fallback
                pesan "tidak tersedia", lihat PageFooterLinks). hideFooterChrome
                di atas adalah pengecualian TERPISAH & sengaja (lihat catatan
                lengkap di prop-nya), bukan pembatalan keputusan ini. */}
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

