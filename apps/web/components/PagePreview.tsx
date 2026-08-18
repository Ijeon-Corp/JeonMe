"use client";

import { useEffect, useRef, useState } from "react";
import { CustomThemeConfig, PageTheme, getPageTheme } from "@/lib/page-themes";
import AudioPlayerBlock from "@/components/AudioPlayerBlock";
import BookSlotButton from "@/components/BookSlotButton";
import BuyProductButton from "@/components/BuyProductButton";
import ContactFormBlock from "@/components/ContactFormBlock";
import FaqBlock, { FaqItem } from "@/components/FaqBlock";
import GalleryBlock from "@/components/GalleryBlock";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import LoyaltyPointsWidget from "@/components/LoyaltyPointsWidget";
import LockedLinkButton from "@/components/LockedLinkButton";
import MapsEmbedBlock from "@/components/MapsEmbedBlock";
import SocialProofToast from "@/components/SocialProofToast";
import TrackedLink from "@/components/TrackedLink";
import VideoEmbedBlock from "@/components/VideoEmbedBlock";
import PageFooterLinks from "@/components/PageFooterLinks";
import ShareButton from "@/components/ShareButton";
import StickerIcon from "@/components/StickerIcon";
import { PageStickerData, RecentPurchase, trackEvent, trackEventBySlug } from "@/lib/api-client";
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
import { HelpCircle, Images as GalleryIcon, Video as VideoIcon } from "lucide-react";
import { SITE_URL } from "@/lib/site";

export interface PagePreviewLink {
  id: string;
  title: string;
  url: string;
  lockType?: "age" | "code" | "subscribe";
  lockMinAge?: number | null;
  // No.77 (Sprint 9): blok konten baru -- 'link' (default) tetap tautan
  // biasa, tipe lain punya rendering & interaksi sendiri sepenuhnya.
  // No.99 (Sprint 14): heading/text/image/button -- blok builder landing page.
  blockType?: "link" | "video" | "contact_form" | "faq" | "heading" | "text" | "image" | "button" | "maps" | "accordion" | "gallery" | "audio";
  blockData?: Record<string, unknown>;
  // customIconUrl -- permintaan langsung pengguna: gambar kustom per
  // tautan, MENGGANTIKAN ikon platform yang terdeteksi otomatis dari URL
  // (lihat lib/link-icons.ts). Kosong berarti tetap pakai deteksi otomatis.
  customIconUrl?: string;
  // iconKey -- permintaan langsung pengguna, 13 Agustus 2026: ikon dipilih
  // dari galeri siap-pakai (lib/icon-library.ts). Prioritas render:
  // customIconUrl > iconKey > deteksi otomatis dari URL > ikon generik.
  iconKey?: string;
  // isFeatured/thumbnailUrl -- Modul "Featured Link" (permintaan langsung
  // pengguna, referensi "Featured Layout" Linktree sungguhan): kalau
  // isFeatured true DAN thumbnailUrl terisi, tautan dirender sebagai kartu
  // thumbnail 16:9 (lihat renderLinkOrBlock di bawah) -- kalau salah satu
  // kosong, jatuh balik diam-diam ke baris klasik biasa (TIDAK pernah
  // kartu kosong/rusak).
  isFeatured?: boolean;
  thumbnailUrl?: string;
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
  // bisa buat katalog produk di halaman tokonya" -- dipakai tab/filter
  // kategori di grid Produk, lihat renderCategoryTabs di bawah.
  category?: string;
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

// No.92 (Sprint 11): blok booking konsultasi.
export interface PagePreviewBooking {
  productId: string;
  name: string;
  description: string;
  priceIdr: number;
  durationMinutes: number;
  availableSlotCount: number;
}

export interface PagePreviewLeadCapture {
  title: string;
  collectEmail: boolean;
  collectWhatsapp: boolean;
}

export interface PagePreviewSocialProof {
  displaySeconds: number;
  intervalSeconds: number;
  recent: RecentPurchase[];
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
  // tautan/donasi/lead-capture/event/booking/loyalty. Default "bio" kalau
  // tidak diisi.
  pageType?: "bio" | "landing" | "produk";
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
  // productLayout -- permintaan langsung pengguna, 19 Agustus 2026: "buat
  // pilihan dua tipe layout product" -- 'grid' (2 kolom, bawaan) atau
  // 'stacked' (1 kolom penuh lebar). Cuma dipakai renderProductGrid
  // (khusus ProdukPagePreview/Halaman Toko sejak grid Produk dihapus dari
  // Bio) -- undefined/nilai lain jatuh balik ke 'grid'. 'category' --
  // susulan 20 Agustus 2026: "bagian produk bisa ga dibuat layout baru di
  // kelompokan seperti ini" -- blok kategori, klik untuk drill-down.
  productLayout?: "grid" | "stacked" | "category";
  events?: PagePreviewEvent[];
  bookings?: PagePreviewBooking[];
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
  layoutVariant?: "centered" | "banner" | "card" | "spotlight" | "cover" | "minimal" | "hero" | "polaroid";
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
function buildUtmHref(url: string, title: string, utmEnabled: boolean | undefined): string {
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

interface PreviewSourcePage {
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
  layout_variant?: "centered" | "banner" | "card" | "spotlight" | "cover" | "minimal" | "hero" | "polaroid";
  product_layout?: "grid" | "stacked" | "category";
}

interface PreviewSourceLink {
  id: string;
  title: string;
  url: string;
  is_active: boolean;
  lock_type?: "" | "age" | "code" | "subscribe";
  lock_min_age?: number | null;
  block_type?: "link" | "video" | "contact_form" | "faq" | "heading" | "text" | "image" | "button" | "maps" | "accordion" | "gallery" | "audio";
  block_data?: Record<string, unknown>;
  custom_icon_url?: string;
  icon_key?: string;
  is_featured?: boolean;
  thumbnail_url?: string;
}

interface PreviewSourceProduct {
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
}

// Dipakai bersama oleh semua halaman dashboard "Halaman Saya" (Tautan/Produk/Desain)
// supaya cara membangun data pratinjau dari state mentah tidak terduplikasi.
export function toPreviewData(
  page: PreviewSourcePage,
  links: PreviewSourceLink[],
  products: PreviewSourceProduct[]
): PagePreviewData {
  return {
    username: page.username,
    displayName: page.display_name,
    bio: page.bio,
    avatarUrl: page.avatar_url,
    theme: page.theme,
    isVerified: page.is_verified ?? false,
    isPremium: page.is_premium ?? false,
    hideWatermark: page.hide_watermark ?? true,
    stickers: page.stickers,
    social: {
      instagram: page.social_instagram,
      tiktok: page.social_tiktok,
      facebook: page.social_facebook,
      whatsapp: page.social_whatsapp,
      youtube: page.social_youtube,
      x: page.social_x,
      linkedin: page.social_linkedin,
      telegram: page.social_telegram,
      email: page.social_email,
    },
    layoutVariant: page.layout_variant,
    productLayout: page.product_layout,
    customTheme:
      page.custom_background_type && page.custom_background_value && page.custom_font && page.custom_button_color
        ? {
            backgroundType: page.custom_background_type,
            backgroundValue: page.custom_background_value,
            font: page.custom_font,
            buttonColor: page.custom_button_color,
            buttonStyle: page.custom_button_style ?? "fill",
            buttonRounded: page.custom_button_rounded ?? "full",
            buttonShadow: page.custom_button_shadow ?? "soft",
            buttonTextColor: page.custom_button_text_color ?? "",
            pageTextColor: page.custom_page_text_color ?? "",
            titleFont: page.custom_title_font ?? "",
            titleColor: page.custom_title_color ?? "",
            styleOverride: page.custom_style_override ?? false,
          }
        : undefined,
    links: links
      .filter((l) => l.is_active)
      .map((l) => ({
        id: l.id,
        title: l.title,
        url: l.url,
        lockType: l.lock_type || undefined,
        lockMinAge: l.lock_min_age,
        blockType: l.block_type,
        blockData: l.block_data,
        customIconUrl: l.custom_icon_url || undefined,
        iconKey: l.icon_key || undefined,
        isFeatured: l.is_featured,
        thumbnailUrl: l.thumbnail_url || undefined,
      })),
    products: products
      .filter((p) => p.is_active)
      .map((p) => ({
        id: p.id,
        name: p.name,
        price_idr: p.price_idr,
        cover_image_url: p.cover_image_url,
        effectivePriceIdr: p.effective_price_idr,
        isFlashSaleActive: p.is_flash_sale_active,
        pwywEnabled: p.pwyw_enabled,
        pwywMinPriceIdr: p.pwyw_min_price_idr ?? undefined,
        isBundle: p.is_bundle,
        bundleOriginalPriceIdr: p.bundle_original_price_idr ?? undefined,
        isExternalLink: p.product_kind === "external_link",
        externalUrl: p.external_url,
        category: p.category,
      })),
  };
}

// getProductCategories/renderCategoryTabs -- permintaan langsung pengguna,
// 17 Agustus 2026: "saya mau bisa buat katalog produk di halaman tokonya".
// `category` sudah lama bisa diisi kreator dari dashboard (migrasi 000046)
// tapi TIDAK PERNAH tampil ke pengunjung publik -- murni label manajemen
// internal. Dipakai ULANG oleh render grid Produk bio biasa MAUPUN
// ProdukPagePreview (Toko) di bawah, supaya kedua jalur kode konsisten
// (pola sama seperti renderLinkOrBlock/renderBioHeader lainnya di file
// ini). Tab "Semua" SENGAJA selalu ada di depan, cuma tampil sama sekali
// kalau minimal satu produk sungguhan sudah diberi kategori -- kreator
// yang belum pernah mengisi kategori tidak akan melihat baris tab kosong.
function getProductCategories(products: PagePreviewProduct[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    if (p.category && p.category.trim()) set.add(p.category.trim());
  }
  return Array.from(set);
}

function renderCategoryTabs(categories: string[], selected: string, onSelect: (category: string) => void, theme: PageTheme) {
  if (categories.length === 0) return null;
  return (
    <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
      {["Semua", ...categories].map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onSelect(c)}
          className={`flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
            selected === c ? theme.buyButton : `${theme.card} ${theme.chevron}`
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

// PageSwitcher -- hamburger kiri-atas untuk berpindah antara Link Bio &
// Toko (permintaan langsung pengguna, 19 Agustus 2026: "karna 1 akun
// punya dua halaman yaitu link bio dan toko tambahkan hamburger button
// di kiri atas menampilkan page toko atau bio"). Perlu jadi KOMPONEN
// sungguhan (bukan fungsi render biasa seperti renderCategoryTabs) karena
// butuh state buka/tutup sendiri.
//
// Slug Toko SENGAJA dibangun langsung dari username (${SITE_URL}/p/
// ${username}), BUKAN dari field pageSlug yang sudah ada di
// PagePreviewData -- Toko PERTAMA/otomatis tiap akun SELALU memakai
// slug = username (bukan slug bebas, lihat ensureProdukPage & catatan
// arsitektur di CLAUDE.md), jadi tidak perlu endpoint tambahan hanya
// untuk menemukan alamat Toko dari halaman Bio. Kreator Premium dengan
// beberapa Toko (slug bebas) tetap diarahkan ke Toko PERTAMA ini --
// cukup untuk kasus yang digambarkan pengguna ("1 akun 2 halaman").
//
// showToko dikontrol dari products.length > 0 di pemanggil (bukan
// query terpisah) -- Toko otomatis TIDAK PERNAH ada sebelum produk
// pertama dibuat (ensureProdukPage), jadi ini sinyal yang sudah tersedia
// tanpa butuh data baru.
function PageSwitcher({ username, showToko, current, theme }: { username: string; showToko: boolean; current: "bio" | "produk"; theme: PageTheme }) {
  const [open, setOpen] = useState(false);
  if (!showToko) return null;

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
          <div className={`absolute left-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-xl shadow-card ${theme.card}`}>
            <a
              href={`${SITE_URL}/${username}`}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold ${theme.productTitle} ${
                current === "bio" ? "opacity-100" : "opacity-70 hover:opacity-100"
              }`}
            >
              <IconLink className="h-3.5 w-3.5" /> Link Bio
            </a>
            <a
              href={`${SITE_URL}/p/${username}`}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold ${theme.productTitle} ${
                current === "produk" ? "opacity-100" : "opacity-70 hover:opacity-100"
              }`}
            >
              <IconBox className="h-3.5 w-3.5" /> Toko
            </a>
          </div>
        </>
      )}
    </div>
  );
}

// renderProductGrid -- grid Produk Halaman Toko. Diangkat jadi satu fungsi
// bersama (permintaan langsung pengguna, 19 Agustus 2026) sejak grid Produk
// DIHAPUS dari halaman Bio (lihat catatan di render utama PagePreview) --
// sekarang cuma satu pemanggil (ProdukPagePreview), jadi tidak lagi
// terduplikasi dua tempat seperti sebelumnya.
//
// Dua perbaikan sekaligus untuk produk isExternalLink (permintaan langsung
// pengguna yang sama): (1) SELURUH kartu bisa diklik menuju tautan afiliasi
// (bukan cuma tombol kecil di bawah) -- gambar/nama/harga dibungkus <a>
// tersendiri, tracking product_click tetap terkirim persis seperti
// BuyProductButton.handleOpen. (2) Label tombolnya BUKAN "Beli" lagi (tidak
// pernah ada transaksi lewat Jeon.id untuk produk jenis ini) -- jadi
// "Lihat Produk ↗", dan dirender sebagai <span> visual di dalam <a> yang
// sama (BUKAN <button> bersarang di dalam <a>, itu HTML tidak valid).
function renderProductGrid(
  data: Pick<PagePreviewData, "products" | "productLayout" | "referralCode" | "username" | "pageSlug" | "shopPaused">,
  theme: PageTheme,
  canBuy: boolean,
  selectedCategory: string,
  onSelectCategory: (c: string) => void
) {
  const gridColsClass = data.productLayout === "stacked" ? "grid-cols-1" : "grid-cols-2";
  // categoryLayout -- permintaan langsung pengguna, 20 Agustus 2026: "bagian
  // produk bisa ga dibuat layout baru di kelompokan seperti ini, misal ada
  // blok sepatu, baju, celana ketika di klik blok sepatu maka akan muncul
  // semua product sepatu nya" -- opsi layout KETIGA (di samping grid/stacked
  // yang sudah ada, lihat migrasi 000072/000073). Sengaja REUSE state
  // selectedCategory/onSelectCategory yang SUDAH ADA (dipakai renderCategoryTabs
  // untuk grid/stacked) alih-alih state baru: "Semua" = tampilkan blok
  // kategori (bukan tab+grid biasa), pilih kategori = drill-down ke grid
  // produk kategori itu (kode grid di bawah TIDAK berubah sama sekali),
  // klik tab "Semua" di situ otomatis jadi tombol "kembali" ke blok --
  // gratis dari renderCategoryTabs yang sudah ada, tanpa tombol back terpisah.
  const categoryLayout = data.productLayout === "category";
  const categories = getProductCategories(data.products);
  const uncategorized = data.products.filter((p) => !p.category || !p.category.trim());

  function trackProductClick(productId: string) {
    if (data.pageSlug) {
      trackEventBySlug(data.pageSlug, { event_type: "product_click", product_id: productId });
    } else {
      trackEvent(data.username, { event_type: "product_click", product_id: productId });
    }
  }

  if (categoryLayout && selectedCategory === "Semua") {
    // "Lainnya" -- bucket produk TANPA kategori diisi, supaya tidak
    // menghilang begitu saja di layout ini (beda dari tab grid/stacked biasa
    // yang tetap menampilkannya di tab "Semua" -- di sini "Semua" JADI
    // tampilan blok, jadi produk tanpa kategori butuh blok sendiri).
    const blocks = [
      ...categories.map((c) => ({ name: c, items: data.products.filter((p) => p.category?.trim() === c) })),
      ...(uncategorized.length > 0 ? [{ name: "Lainnya", items: uncategorized }] : []),
    ];
    if (blocks.length > 0) {
      return (
        <div className={`grid w-full ${gridColsClass} gap-3`}>
          {blocks.map((b) => {
            const cover = b.items.find((p) => p.cover_image_url)?.cover_image_url;
            return (
              <button
                key={b.name}
                type="button"
                onClick={() => onSelectCategory(b.name)}
                className={`flex flex-col rounded-xl p-2.5 text-left ${theme.productCard}`}
              >
                <div className={`relative mb-2 flex aspect-square items-center justify-center rounded-xl ${theme.card}`}>
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt={b.name} loading="lazy" className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    <IconBox className={`h-6 w-6 ${theme.chevron}`} />
                  )}
                  <span className={`absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full ${theme.card}`}>
                    <IconChevronRight className={`h-3 w-3 ${theme.chevron}`} />
                  </span>
                </div>
                <p className={`truncate text-xs font-semibold ${theme.productTitle}`}>{b.name}</p>
                <p className={`text-[10px] opacity-70 ${theme.productPrice}`}>{b.items.length} produk</p>
              </button>
            );
          })}
        </div>
      );
    }
  }

  const tabCategories = categoryLayout && uncategorized.length > 0 ? [...categories, "Lainnya"] : categories;

  return (
    <>
      {renderCategoryTabs(tabCategories, selectedCategory, onSelectCategory, theme)}
      <div className={`grid w-full ${gridColsClass} gap-3`}>
        {data.products
          .filter((p) =>
            selectedCategory === "Semua"
              ? true
              : // "Lainnya" cuma jadi bucket sentinel produk tanpa kategori
                // KHUSUS layout "category" (lihat blocks di atas) -- di
                // grid/stacked, "Lainnya" tetap dibandingkan sebagai nama
                // kategori LITERAL seperti biasa (kreator mungkin saja
                // benar-benar menamai kategorinya sendiri "Lainnya").
                categoryLayout && selectedCategory === "Lainnya"
              ? !p.category || !p.category.trim()
              : p.category === selectedCategory
          )
          .map((product) => {
            const cover = (
              <div className={`mb-2 flex aspect-square items-center justify-center rounded-xl ${theme.card}`}>
                {product.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.cover_image_url}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  <IconBox className={`h-6 w-6 ${theme.chevron}`} />
                )}
              </div>
            );
            const priceBlock = product.pwywEnabled ? (
              <p className={`text-xs font-bold ${theme.productPrice}`}>
                Mulai dari Rp {(product.pwywMinPriceIdr ?? 0).toLocaleString("id-ID")}
              </p>
            ) : product.isBundle && product.bundleOriginalPriceIdr !== undefined ? (
              <div className="flex items-center gap-1.5">
                <p className={`text-[10px] line-through opacity-60 ${theme.productPrice}`}>
                  Rp {product.bundleOriginalPriceIdr.toLocaleString("id-ID")}
                </p>
                <p className={`text-xs font-bold ${theme.productPrice}`}>Rp {product.price_idr.toLocaleString("id-ID")}</p>
              </div>
            ) : product.isFlashSaleActive && product.effectivePriceIdr !== undefined ? (
              <div className="flex items-center gap-1.5">
                <p className={`text-[10px] line-through opacity-60 ${theme.productPrice}`}>
                  Rp {product.price_idr.toLocaleString("id-ID")}
                </p>
                <p className={`text-xs font-bold ${theme.productPrice}`}>
                  Rp {product.effectivePriceIdr.toLocaleString("id-ID")}
                </p>
              </div>
            ) : product.isExternalLink && product.price_idr === 0 ? (
              // Harga opsional khusus Link Eksternal (permintaan langsung
              // pengguna, 20 Agustus 2026: "untuk produk affiliate harga
              // jadikan optional") -- 0 berarti sengaja tidak diisi
              // (jenis produk lain harga tetap wajib >= Rp1.000, jadi 0
              // TIDAK PERNAH berarti "gratis" untuk mereka), jangan
              // tampilkan baris harga sama sekali daripada "Rp 0".
              null
            ) : (
              <p className={`text-xs font-bold ${theme.productPrice}`}>Rp {product.price_idr.toLocaleString("id-ID")}</p>
            );

            if (product.isExternalLink && product.externalUrl) {
              return (
                <a
                  key={product.id}
                  href={product.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackProductClick(product.id)}
                  className={`flex flex-col rounded-xl p-2.5 ${theme.productCard}`}
                >
                  {cover}
                  <p className={`truncate text-xs font-semibold ${theme.productTitle}`}>{product.name}</p>
                  {priceBlock}
                  <span
                    className={`mt-2.5 block w-full rounded-lg py-1.5 text-center text-xs transition-all duration-200 ${theme.buyButton}`}
                  >
                    Lihat Produk ↗
                  </span>
                </a>
              );
            }

            return (
              <div key={product.id} className={`flex flex-col rounded-xl p-2.5 ${theme.productCard}`}>
                {cover}
                <p className={`truncate text-xs font-semibold ${theme.productTitle}`}>{product.name}</p>
                {product.isCourse && (
                  <p className={`text-[10px] opacity-70 ${theme.productPrice}`}>{product.chapterCount ?? 0} Bab</p>
                )}
                {priceBlock}
                {canBuy ? (
                  <BuyProductButton
                    productId={product.id}
                    buttonClassName={theme.buyButton}
                    pwywMinPriceIdr={product.pwywEnabled ? product.pwywMinPriceIdr : undefined}
                    referralCode={data.referralCode}
                    username={data.username}
                    pageSlug={data.pageSlug}
                  />
                ) : (
                  <button
                    type="button"
                    disabled
                    title={data.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
                    className={`mt-2.5 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
                  >
                    Beli
                  </button>
                )}
              </div>
            );
          })}
      </div>
    </>
  );
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
function StickerOverlay({
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
function renderVideoBackground(theme: PageTheme) {
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
function renderBioHeader(
  data: Pick<PagePreviewData, "avatarUrl" | "username" | "displayName" | "isVerified" | "bio" | "social" | "layoutVariant">,
  theme: PageTheme
) {
  // Delapan varian (permintaan langsung pengguna, 12 Agustus 2026, susulan
  // "layouting nya juga berbeda" lalu "tambahkan lagi 2 bentuk layout
  // lain nya", "hero" ditambah 13 Agustus 2026 hasil analisa benchmark
  // Linktree/Lynk.id, "polaroid" ditambah hari yang sama lagi supaya
  // KEDELAPAN kategori Quick Setup punya struktur unik masing-masing --
  // lihat catatan lengkap & pemetaan kategori->varian di
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
  // di percabangan masing-masing di bawah). Dipetakan ke kategori Quick
  // Setup yang cocok di quick-setup-templates.ts, TAPI bisa dipakai
  // manual di halaman mana pun -- field DB cuma VARCHAR(20) polos, tidak
  // dibatasi cuma dari Quick Setup.
  const variant = data.layoutVariant ?? "centered";
  const isBanner = variant === "banner";
  const isMinimal = variant === "minimal";
  const avatarSize = isMinimal
    ? "h-10 w-10"
    : isBanner
    ? "h-16 w-16"
    : variant === "cover"
    ? "h-20 w-20"
    : variant === "spotlight"
    ? "h-28 w-28"
    : "h-24 w-24";

  const avatar = data.avatarUrl ? (
    // fetchPriority="high" (optimasi performa, analisa & benchmark
    // kompetitif 18 Agustus 2026): avatar HAMPIR SELALU elemen LCP (Largest
    // Contentful Paint) di halaman publik -- gambar tunggal terbesar yang
    // langsung terlihat tanpa scroll di semua 8 layout. Tanpa hint ini,
    // browser memberi prioritas fetch yang SAMA seperti gambar lain yang
    // baru muncul setelah scroll, padahal justru avatar ini yang paling
    // menentukan skor LCP (metrik Core Web Vitals paling relevan buat
    // "halaman publik yang terasa cepat" dibanding kompetitor).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={data.avatarUrl}
      alt={data.username}
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
      className={`flex items-center gap-1.5 font-heading text-base font-bold ${isBanner || isMinimal ? "" : "justify-center"} ${theme.name}`}
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
              catatan panjang di avatar layout default di atas. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.avatarUrl} alt={data.username} fetchPriority="high" className="h-full w-full object-cover" />
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
      // catatan panjang di avatar layout default di atas.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={data.avatarUrl} alt={data.username} fetchPriority="high" className="h-28 w-28 object-cover" />
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
function resolveBlockIcon(link: PagePreviewLink, DefaultIcon: React.ComponentType<{ className?: string }>, sizeClass: string) {
  if (link.customIconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={link.customIconUrl} alt="" loading="lazy" className={`${sizeClass} flex-shrink-0 rounded-full object-cover`} />
    );
  }
  const libraryIcon = getLibraryIcon(link.iconKey);
  if (libraryIcon) {
    return <libraryIcon.Icon className={`${sizeClass} flex-shrink-0`} />;
  }
  return <DefaultIcon className={`${sizeClass} flex-shrink-0`} />;
}

function renderLinkOrBlock(
  link: PagePreviewLink,
  theme: PageTheme,
  data: Pick<PagePreviewData, "username" | "pageSlug" | "utmEnabled">,
  interactive: boolean
) {
  // No.77: blok konten baru dirender sepenuhnya terpisah dari tautan
  // biasa -- tidak ada gerbang kunci/tracking klik untuk tipe ini (di
  // luar cakupan yang diminta).
  //
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
  // booking/donasi/lead-capture, widget terpisah yang memang sengaja
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
    // klik apa pun.
    return (
      <div key={link.id} className={`w-full rounded-xl p-3 text-center ${theme.card}`}>
        <p className={`whitespace-pre-wrap text-xs leading-relaxed ${theme.bio}`}>
          {(link.blockData?.text as string) ?? ""}
        </p>
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={link.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            {link.customIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.customIconUrl} alt="" loading="lazy" className="h-full w-full rounded-full object-cover" />
            ) : libraryIcon ? (
              <libraryIcon.Icon className="h-3.5 w-3.5 text-white" />
            ) : (
              <LinkPlatformIcon className={`h-3.5 w-3.5 ${iconColorClass}`} />
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
      return (
        <TrackedLink
          key={link.id}
          username={data.username}
          pageSlug={data.pageSlug}
          linkId={link.id}
          href={buildUtmHref(link.url, link.title, data.utmEnabled)}
          className={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
        >
          <span className="absolute left-2 top-1/2 flex h-9 w-9 flex-shrink-0 -translate-y-1/2 items-center justify-center">
            {link.customIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.customIconUrl} alt="" loading="lazy" className="h-full w-full rounded-full object-cover" />
            ) : libraryIcon ? (
              <libraryIcon.Icon className="h-6 w-6" />
            ) : (
              <LinkPlatformIcon className={`h-7 w-7 ${iconColorClass}`} />
            )}
          </span>
          <span className="w-full break-words px-8 text-center">{link.title}</span>
        </TrackedLink>
      );
    })()
  ) : (
    (() => {
      const { Icon: LinkPlatformIcon, iconColorClass } = detectLinkIcon(link.url);
      const libraryIcon = getLibraryIcon(link.iconKey);
      return (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
        >
          <span className="absolute left-2 top-1/2 flex h-9 w-9 flex-shrink-0 -translate-y-1/2 items-center justify-center">
            {link.customIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.customIconUrl} alt="" loading="lazy" className="h-full w-full rounded-full object-cover" />
            ) : libraryIcon ? (
              <libraryIcon.Icon className="h-6 w-6" />
            ) : (
              <LinkPlatformIcon className={`h-7 w-7 ${iconColorClass}`} />
            )}
          </span>
          <span className="w-full break-words px-8 text-center">{link.title}</span>
        </a>
      );
    })()
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
}) {
  const theme = getPageTheme(data.theme, data.customTheme);
  // Modul Toko (Fase E5): toko dijeda -- semua tombol beli/daftar/booking
  // dinonaktifkan di frontend juga (bukan cuma backend), supaya pengunjung
  // tidak membuka form checkout yang pasti ditolak.
  const canBuy = interactive && !data.shopPaused;
  // Gap #4 benchmark kompetitif (9 Agustus 2026): item wishlist yang
  // dipilih pendukung untuk "diwujudkan" -- undefined berarti donasi umum.
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | undefined>(undefined);

  // No.99 (Sprint 14): halaman landing dirender TERPISAH -- blok penuh-lebar
  // saja (heading/text/image/button/dst), TANPA avatar/bio-header/produk/
  // monetisasi, beda dari layout bio biasa di bawah. Landing TIDAK punya
  // stiker sama sekali (lihat catatan StickerOverlay), jadi tidak perlu
  // menerima editableStickers/onStickersChange.
  if (data.pageType === "landing") {
    // Landing page (No.99) tidak punya produk/monetisasi sama sekali --
    // shop_paused tidak relevan di sini, tetap pakai `interactive` biasa.
    return <LandingPagePreview data={data} interactive={interactive} rootClassName={rootClassName} theme={theme} />;
  }

  // Modul Halaman Produk: showcase katalog Toko saja -- TANPA
  // tautan/donasi/lead-capture/event/booking/loyalty, beda dari layout bio
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
        <PageSwitcher username={data.username} showToko={data.products.length > 0} current="bio" theme={theme} />
        {/* ml-auto (bukan justify-between di kontainer) -- PageSwitcher
            return null kalau showToko false, dan justify-between dengan
            SATU anak nyata akan mendorongnya ke KIRI (bukan tetap di
            kanan) begitu anak pertama tidak ikut dihitung sama sekali.
            ml-auto SELALU mendorong tombol ini ke kanan terlepas dari
            PageSwitcher merender apa pun. */}
        <div className="ml-auto">
          <ShareButton title={`@${data.username} — Jeon.id`} url={data.pageSlug ? `${SITE_URL}/p/${data.pageSlug}` : `${SITE_URL}/${data.username}`} />
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
            {renderBioHeader(data, theme)}
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
            {data.links.map((link) => renderLinkOrBlock(link, theme, data, interactive))}
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

        {data.loyaltyActive && interactive && (
          <div className={`mt-8 w-full rounded-xl p-3 text-left ${theme.productCard}`}>
            <LoyaltyPointsWidget
              username={data.username}
              cardClassName=""
              titleClassName={theme.productTitle}
              buttonClassName={theme.buyButton}
            />
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

        {data.bookings && data.bookings.length > 0 && (
          <div className="mt-8 w-full">
            <p className={`mb-3 text-xs font-bold uppercase tracking-wider ${theme.bio}`}>Booking Konsultasi</p>
            <div className="flex w-full flex-col gap-3">
              {data.bookings.map((booking) => (
                <div key={booking.productId} className={`flex flex-col gap-1.5 rounded-xl p-2.5 ${theme.productCard}`}>
                  <div className="flex items-center gap-2">
                    <IconCalendar className={`h-3.5 w-3.5 flex-shrink-0 ${theme.chevron}`} />
                    <p className={`text-xs font-semibold ${theme.productTitle}`}>{booking.name}</p>
                  </div>
                  <p className={`text-[11px] ${theme.bio}`}>
                    {booking.durationMinutes} menit &middot; {booking.availableSlotCount} slot tersedia
                  </p>
                  {booking.description && <p className={`text-[11px] ${theme.bio}`}>{booking.description}</p>}
                  <p className={`text-xs font-bold ${theme.productTitle}`}>
                    Rp {booking.priceIdr.toLocaleString("id-ID")}
                  </p>
                  {canBuy ? (
                    <BookSlotButton productId={booking.productId} buttonClassName={theme.buyButton} />
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={data.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
                      className={`w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
                    >
                      Pilih Jadwal
                    </button>
                  )}
                </div>
              ))}
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
            dibagi lintas akun seperti biasa (lihat catatan CLAUDE.md),
            cuma render-nya sekarang KHUSUS ProdukPagePreview (Halaman
            Toko) -- lihat renderProductGrid di bawah. Pengunjung diarahkan
            ke Toko lewat hamburger nav top-left (lihat renderPageSwitcher)
            begitu akun ini punya produk. */}

        <div className="mt-10 flex flex-col items-center gap-3">
          {/* Modul Langganan Premium (permintaan langsung pengguna, 8
              Agustus 2026): kreator gratis SELALU tampil watermark ini,
              apa pun nilai hideWatermark -- kreator Premium bisa
              menyembunyikannya sendiri lewat toggle di Desain/Halaman Toko
              (lihat isPremiumUser backend & PagePreviewData.hideWatermark). */}
          {(!data.isPremium || !data.hideWatermark) && (
            <a
              href={`${SITE_URL}/register`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-ink shadow-card transition-transform hover:scale-105"
            >
              Buat halaman gratis di Jeon.id
            </a>
          )}
          {/* Footer SELALU tampil, termasuk di pratinjau dashboard
              (interactive=false) -- permintaan langsung pengguna: "tampilkan
              seluruh footer privacy dll", sebelumnya sengaja disembunyikan
              di pratinjau. Item "Laporkan" sudah aman tanpa pageId (fallback
              pesan "tidak tersedia", lihat PageFooterLinks). */}
          <PageFooterLinks
            pageId={data.id}
            username={data.username}
            bio={data.bio}
            isVerified={data.isVerified}
            footerClassName={theme.footer}
          />
        </div>
      </div>
    </main>
  );
}

// LandingPagePreview -- No.99 (Sprint 14): halaman landing, penuh-lebar,
// blok saja (heading/text/image/button + video/faq/contact_form yang sudah
// ada dari No.77). TIDAK ada avatar/bio-header/produk/monetisasi -- landing
// page difokuskan buat satu tujuan/kampanye tertentu, bukan mini-toko.
// TANPA "Create with AI" (keputusan eksplisit pengguna): semua blok dibuat
// manual lewat dashboard, bukan digenerate model bahasa.
function LandingPagePreview({
  data,
  interactive,
  rootClassName,
  theme,
}: {
  data: PagePreviewData;
  interactive: boolean;
  rootClassName: string;
  theme: PageTheme;
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
        <ShareButton title={`@${data.username} — Jeon.id`} url={data.pageSlug ? `${SITE_URL}/p/${data.pageSlug}` : `${SITE_URL}/${data.username}`} />
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
            case "image":
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={block.id}
                  src={(block.blockData?.image_url as string) ?? ""}
                  alt={(block.blockData?.caption as string) || block.title}
                  loading="lazy"
                  className="w-full rounded-xl object-cover"
                />
              );
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={block.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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

        <div className="mt-6 flex flex-col items-center gap-3">
          {(!data.isPremium || !data.hideWatermark) && (
            <a
              href={`${SITE_URL}/register`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-ink shadow-card transition-transform hover:scale-105"
            >
              Buat halaman gratis di Jeon.id
            </a>
          )}
          {/* Footer SELALU tampil, termasuk di pratinjau dashboard
              (interactive=false) -- permintaan langsung pengguna: "tampilkan
              seluruh footer privacy dll", sebelumnya sengaja disembunyikan
              di pratinjau. Item "Laporkan" sudah aman tanpa pageId (fallback
              pesan "tidak tersedia", lihat PageFooterLinks). */}
          <PageFooterLinks
            pageId={data.id}
            username={data.username}
            bio={data.bio}
            isVerified={data.isVerified}
            footerClassName={theme.footer}
          />
        </div>
      </div>
    </main>
  );
}

// ProdukPagePreview -- Modul Halaman Produk: kreator gratis dapat 1 halaman
// tipe ini, Premium sampai 5 (pool TERPISAH dari bio/landing, lihat
// freeProdukPageLimit/premiumProdukPageLimit di page.go). Showcase katalog
// Toko yang SAMA dengan halaman utama (produk per-akun, bukan per-halaman --
// lihat catatan lingkup di CreatePage), header avatar+nama+bio + (Modul
// Halaman Toko, 7 Agustus 2026) blok/tautan sendiri (link/video/faq/
// contact_form/maps/text -- lihat renderLinkOrBlock) TETAP TANPA donasi/
// lead-capture/event/booking/loyalty, yang account-wide (satu per akun,
// bukan per-halaman) jadi tidak bisa diduplikasi per halaman tambahan.
function ProdukPagePreview({
  data,
  rootClassName,
  theme,
  canBuy,
  interactive,
  editableStickers,
  onStickersChange,
}: {
  data: PagePreviewData;
  rootClassName: string;
  theme: PageTheme;
  canBuy: boolean;
  interactive: boolean;
  editableStickers?: boolean;
  onStickersChange?: (stickers: PageStickerData[]) => void;
}) {
  // selectedProductCategory -- lihat catatan lengkap di getProductCategories/
  // renderCategoryTabs (dekat toPreviewData, atas file ini).
  const [selectedProductCategory, setSelectedProductCategory] = useState("Semua");
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
        {/* showToko selalu true di sini -- ProdukPagePreview MEMANG
            merender Halaman Toko, jadi keberadaannya sudah terbukti
            dengan sendirinya (beda dari sisi Bio yang perlu cek
            products.length dulu). */}
        <PageSwitcher username={data.username} showToko current="produk" theme={theme} />
        <div className="ml-auto">
          <ShareButton title={`@${data.username} — Jeon.id`} url={data.pageSlug ? `${SITE_URL}/p/${data.pageSlug}` : `${SITE_URL}/${data.username}`} />
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
            {data.links.map((link) => renderLinkOrBlock(link, theme, data, interactive))}
          </div>
        )}

        {data.products.length > 0 ? (
          <div className="mt-8 w-full">
            {renderProductGrid(data, theme, canBuy, selectedProductCategory, setSelectedProductCategory)}
          </div>
        ) : (
          <p className={`mt-8 text-center text-xs ${theme.bio}`}>Belum ada produk untuk ditampilkan.</p>
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          {(!data.isPremium || !data.hideWatermark) && (
            <a
              href={`${SITE_URL}/register`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-ink shadow-card transition-transform hover:scale-105"
            >
              Buat halaman gratis di Jeon.id
            </a>
          )}
          <PageFooterLinks
            pageId={data.id}
            username={data.username}
            bio={data.bio}
            isVerified={data.isVerified}
            footerClassName={theme.footer}
          />
        </div>
      </div>
    </main>
  );
}
