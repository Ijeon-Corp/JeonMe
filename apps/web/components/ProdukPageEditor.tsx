"use client";

import Image from "next/image";

import PageSkeleton from "@/components/Skeleton";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ApiError,
  CatalogItem,
  DashboardProduct,
  ExtraPageDetail,
  LinkItem,
  PageStickerData,
  createExtraPageBlock,
  createExtraPageLink,
  deleteAudioBlock,
  deleteBuilderMediaImage,
  deleteFileBlock,
  deleteGalleryImage,
  deleteGalleryNestedImage,
  deleteLink,
  deleteLinkIcon,
  deleteLinkThumbnail,
  duplicateLink,
  listExtraPageLinks,
  reorderExtraPageLinks,
  updateExtraPage,
  updateExtraPageProfileExtras,
  updateLink,
  uploadAudioBlock,
  uploadBuilderMediaImage,
  uploadExtraPageAvatar,
  uploadExtraPageBackground,
  uploadFileBlock,
  uploadGalleryImage,
  uploadGalleryNestedImage,
  uploadLinkIcon,
  uploadLinkThumbnail,
  uploadShowcaseImage,
} from "@/lib/api-client";
import {
  IconChevronRight,
  IconDotsVertical,
  IconColumns,
  IconExternal,
  IconGripVertical,
  IconLock,
  IconPencil,
  IconPlus,
  IconSparkle,
  IconX,
} from "@/components/icons";
import { BLOCK_TILE_CLASS, blockPreviewFor, isBlockExpandable, linkHostname, maxGalleryImages, maxNestedGalleryImages, showsClickCount } from "@/lib/block-preview";
import { uploadFilesSequentially, type MultiUploadOutcome } from "@/lib/multi-upload";
import type { BlockStyle } from "@/lib/api-client";
import { normalizeGalleryDisplay } from "@/lib/gallery-display";
import GalleryDisplayPicker from "@/components/dashboard/page/GalleryDisplayPicker";
import { getLibraryIcon, libraryIconColor } from "@/lib/icon-library";
import { detectLinkIcon } from "@/lib/link-icons";
import {
  ChevronDown,
  Clapperboard,
  Code2,
  FileText as LucideFileText,
  GalleryHorizontal,
  HelpCircle,
  Image as LucideImage,
  Images as LucideImages,
  LayoutGrid,
  Link as LucideLink,
  Link2,
  List as LucideList,
  MapPin as LucideMapPin,
  MousePointerClick,
  Music as LucideMusic,
  Presentation,
  ClipboardList,
  ShoppingBag as LucideShoppingBag,
  Timer,
  TriangleAlert,
  Type as LucideType,
  Video as LucideVideo,
} from "lucide-react";
import StickerCanvasEditor from "@/components/StickerCanvasEditor";
import { ProdukBlockEditor } from "@/components/dashboard/page/ProdukBlockEditor";
import RichTextEditor from "@/components/dashboard/page/RichTextEditor";
import { ListItemsEditor, type ListEditorItem } from "@/components/dashboard/page/ListItemsEditor";
import { useContentEditBuffers } from "@/lib/use-content-edit-buffers";
import { buildWhatsappButtonUrl } from "@/lib/whatsapp-url";
import Toggle from "@/components/Toggle";
import SectionCard from "@/components/dashboard/page/SectionCard";
import DesignCategoryTabs from "@/components/dashboard/page/DesignCategoryTabs";
import BlockToolsStrip from "@/components/dashboard/page/BlockToolsStrip";
import ButtonStyleMenu from "@/components/dashboard/page/ButtonStyleMenu";
import BlockDesignMenu from "@/components/dashboard/page/BlockDesignMenu";
import FormField from "@/components/FormField";
import VideoSourceField from "@/components/dashboard/page/VideoSourceField";
import {
  DesignSectionPatch,
  FontSection,
  HeaderSection,
  TemaSection,
  TombolSection,
} from "@/components/dashboard/page/design-sections";
import type { AddCategory, ContentTile, PlatformQuickAdd } from "@/app/dashboard/links/page";
import { SITE_URL } from "@/lib/site";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";
import { confirmAction } from "@/lib/confirm";

// AddLinkModal/BlockDrilldownEditor -- susulan 15 September 2026 (permintaan
// langsung pengguna: "samakan semua blok/link beserta fungsi nya di menu
// store seperti yang ada di my page"). Sama persis pola dynamic import di
// dashboard/links/page.tsx -- keduanya cuma perlu dimuat begitu kreator
// benar-benar membuka modal "Tambah"/blok Katalog-FAQ, bukan eager di setiap
// kunjungan menu Toko.
const AddLinkModal = dynamic(() => import("@/components/AddLinkModal"));
// IconPickerModal -- galeri ikon per blok (paritas Toko <-> Links, 18
// September 2026), sama seperti dashboard/links/page.tsx: cuma dimuat
// begitu kreator benar-benar membuka galeri.
const IconPickerModal = dynamic(() => import("@/components/IconPickerModal"));
const BlockDrilldownEditor = dynamic(() => import("@/components/BlockDrilldownEditor"));

// BlockType -- diperluas dari 11 jadi 21 tipe (susulan 15 September 2026,
// paritas penuh dgn dashboard/links/page.tsx: project_showcase/catalog/
// button/image/video_image/image_slider/list/countdown/embed_link/embed
// SEBELUMNYA sama sekali tidak bisa dibuat di menu Toko -- ContentTile
// (diimpor dari page.tsx, lihat catatan di bawah) sudah mendefinisikan
// union 21 tipe yang identik, dipakai lagi di sini apa adanya.
type BlockType =
  | "link"
  | "video"
  | "faq"
  | "contact_form"
  | "maps"
  | "text"
  | "accordion"
  | "gallery"
  | "audio"
  | "file"
  | "produk"
  | "project_showcase"
  | "catalog"
  | "button"
  | "image"
  | "video_image"
  | "image_slider"
  | "list"
  | "countdown"
  | "embed_link"
  | "embed";

// getContentTiles/getBlockLabel -- FUNGSI (bukan konstanta modul lagi),
// pola sama seperti buildNavItems/buildExtraPageLabels di dashboard/
// layout.tsx (Modul Pilihan Bahasa EN/ID, 29 Agustus 2026): label lewat
// t()/dict supaya ikut berganti begitu locale berubah, dipanggil ULANG
// tiap render di dalam komponen yang memakainya.
// (getLayoutOptions -- dipakai HeaderSection -- pindah ke
// components/dashboard/page/design-sections.tsx bersama HeaderSection
// sendiri, permintaan langsung pengguna 9 September 2026 "design langsung
// di builder juga".)
//
// 10 tipe baru (susulan 15 September 2026) SENGAJA memakai namespace i18n
// `dashboard.pages.links.contentTiles.*` (BUKAN `produkPageEditor.contentTiles.*`
// yang dipakai 11 tipe lama) -- string-nya SUDAH ADA & generik (tidak
// menyebut "Toko" ataupun "Bio" sama sekali), jadi dipakai ulang APA ADANYA
// alih-alih menduplikasi ~200 entri i18n baru x 2 bahasa demi paritas yang
// sama persis akan diminta lagi kalau isinya berubah nanti.
function getContentTiles(t: (key: string) => string): ContentTile[] {
  return [
    { key: "link", label: t("dashboard.components.produkPageEditor.contentTiles.link.label"), description: t("dashboard.components.produkPageEditor.contentTiles.link.desc"), Icon: LucideLink },
    { key: "video", label: t("dashboard.components.produkPageEditor.contentTiles.video.label"), description: t("dashboard.components.produkPageEditor.contentTiles.video.desc"), Icon: LucideVideo },
    { key: "faq", label: t("dashboard.components.produkPageEditor.contentTiles.faq.label"), description: t("dashboard.components.produkPageEditor.contentTiles.faq.desc"), Icon: HelpCircle },
    // "accordion" -- permintaan langsung pengguna: "blok yang bisa diklik
    // lalu keluar text, bukan hanya untuk faq saja" -- lihat catatan lengkap
    // di dashboard/links/page.tsx (pola sama persis, dipakai ulang di sini
    // untuk paritas halaman utama/Toko).
    { key: "accordion", label: t("dashboard.components.produkPageEditor.contentTiles.accordion.label"), description: t("dashboard.components.produkPageEditor.contentTiles.accordion.desc"), Icon: ChevronDown },
    { key: "contact_form", label: t("dashboard.components.produkPageEditor.contentTiles.contactForm.label"), description: t("dashboard.components.produkPageEditor.contentTiles.contactForm.desc"), Icon: ClipboardList },
    { key: "maps", label: t("dashboard.components.produkPageEditor.contentTiles.maps.label"), description: t("dashboard.components.produkPageEditor.contentTiles.maps.desc"), Icon: LucideMapPin },
    { key: "text", label: t("dashboard.components.produkPageEditor.contentTiles.text.label"), description: t("dashboard.components.produkPageEditor.contentTiles.text.desc"), Icon: LucideType },
    // "gallery"/"audio" -- hasil analisa galeri tema kompetitor, 17 Agustus
    // 2026, lihat catatan lengkap di dashboard/links/page.tsx (pola sama
    // persis, dipakai ulang di sini untuk paritas halaman utama/Toko).
    { key: "gallery", label: t("dashboard.components.produkPageEditor.contentTiles.gallery.label"), description: t("dashboard.components.produkPageEditor.contentTiles.gallery.desc"), Icon: LucideImages },
    { key: "audio", label: t("dashboard.components.produkPageEditor.contentTiles.audio.label"), description: t("dashboard.components.produkPageEditor.contentTiles.audio.desc"), Icon: LucideMusic },
    // "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
    // file pdf download", lihat catatan lengkap di dashboard/links/page.tsx
    // (pola sama persis, dipakai ulang di sini untuk paritas halaman
    // utama/Toko).
    { key: "file", label: t("dashboard.components.produkPageEditor.contentTiles.file.label"), description: t("dashboard.components.produkPageEditor.contentTiles.file.desc"), Icon: LucideFileText },
    // "produk" -- permintaan langsung pengguna, 13 September 2026 ("jangan
    // tampil langsung di link nya, tapi data produk itu akan bisa dipilih
    // ketika menggunakan blok produk"): grid otomatis Halaman Toko (SEMUA
    // produk aktif, lihat renderProductGrid di PagePreview.tsx) sekarang
    // jadi FALLBACK -- begitu Toko punya minimal satu blok "produk" ini,
    // grid otomatis berhenti tampil & kreator kurasi sendiri produk mana
    // yang muncul, persis seperti blok "produk" di halaman Bio/Landing
    // (ProdukBlockEditor, dipakai ulang APA ADANYA di bawah).
    { key: "produk", label: t("dashboard.components.produkPageEditor.contentTiles.produk.label"), description: t("dashboard.components.produkPageEditor.contentTiles.produk.desc"), Icon: LucideShoppingBag },
    // 10 tipe baru (susulan 15 September 2026) -- lihat catatan namespace
    // i18n di atas fungsi ini.
    { key: "project_showcase", label: t("dashboard.pages.links.contentTiles.projectShowcase.label"), description: t("dashboard.pages.links.contentTiles.projectShowcase.description"), Icon: Presentation },
    { key: "catalog", label: t("dashboard.pages.links.contentTiles.catalog.label"), description: t("dashboard.pages.links.contentTiles.catalog.description"), Icon: LayoutGrid },
    { key: "button", label: t("dashboard.pages.links.contentTiles.button.label"), description: t("dashboard.pages.links.contentTiles.button.description"), Icon: MousePointerClick },
    { key: "image", label: t("dashboard.pages.links.contentTiles.image.label"), description: t("dashboard.pages.links.contentTiles.image.description"), Icon: LucideImage },
    { key: "video_image", label: t("dashboard.pages.links.contentTiles.videoImage.label"), description: t("dashboard.pages.links.contentTiles.videoImage.description"), Icon: Clapperboard },
    { key: "image_slider", label: t("dashboard.pages.links.contentTiles.imageSlider.label"), description: t("dashboard.pages.links.contentTiles.imageSlider.description"), Icon: GalleryHorizontal },
    { key: "list", label: t("dashboard.pages.links.contentTiles.list.label"), description: t("dashboard.pages.links.contentTiles.list.description"), Icon: LucideList },
    { key: "countdown", label: t("dashboard.pages.links.contentTiles.countdown.label"), description: t("dashboard.pages.links.contentTiles.countdown.description"), Icon: Timer },
    { key: "embed_link", label: t("dashboard.pages.links.contentTiles.embedLink.label"), description: t("dashboard.pages.links.contentTiles.embedLink.description"), Icon: Link2 },
    { key: "embed", label: t("dashboard.pages.links.contentTiles.embed.label"), description: t("dashboard.pages.links.contentTiles.embed.description"), Icon: Code2 },
  ];
}

function getBlockLabel(t: (key: string) => string): Record<string, string> {
  return {
    video: t("dashboard.components.produkPageEditor.contentTiles.video.label"),
    faq: t("dashboard.components.produkPageEditor.contentTiles.faq.label"),
    contact_form: t("dashboard.components.produkPageEditor.contentTiles.contactForm.label"),
    maps: t("dashboard.components.produkPageEditor.contentTiles.maps.label"),
    text: t("dashboard.components.produkPageEditor.contentTiles.text.label"),
    accordion: t("dashboard.components.produkPageEditor.contentTiles.accordion.label"),
    gallery: t("dashboard.components.produkPageEditor.contentTiles.gallery.label"),
    audio: t("dashboard.components.produkPageEditor.contentTiles.audio.label"),
    file: t("dashboard.components.produkPageEditor.contentTiles.file.label"),
    produk: t("dashboard.components.produkPageEditor.contentTiles.produk.label"),
    project_showcase: t("dashboard.pages.links.contentTiles.projectShowcase.label"),
    catalog: t("dashboard.pages.links.contentTiles.catalog.label"),
    button: t("dashboard.pages.links.contentTiles.button.label"),
    image: t("dashboard.pages.links.contentTiles.image.label"),
    video_image: t("dashboard.pages.links.contentTiles.videoImage.label"),
    image_slider: t("dashboard.pages.links.contentTiles.imageSlider.label"),
    list: t("dashboard.pages.links.contentTiles.list.label"),
    countdown: t("dashboard.pages.links.contentTiles.countdown.label"),
    embed_link: t("dashboard.pages.links.contentTiles.embedLink.label"),
    embed: t("dashboard.pages.links.contentTiles.embed.label"),
  };
}

export type DesignSection = "blok" | "tema" | "header" | "tombol" | "font" | "stiker";

// ProdukPageEditor -- Modul Halaman Toko (permintaan langsung pengguna, 7
// Agustus 2026): "semua fitur yang ada di link bio" (builder blok/tautan +
// 4 panel desain Tema/Header/Tombol/Font + Stiker) dipakai ulang di SINI
// untuk halaman Toko auto (page_type="produk", slug=username -- lihat
// ensureProdukPage di page.go), sebagai tab pertama di menu Toko
// (dashboard/products). SENGAJA hanya mengelola Toko KANONIK (slug ===
// username) -- Toko ke-2..5 (Premium, multi-brand) tetap dikelola lewat
// dashboard/pages seperti sebelumnya.
//
// Donasi/Lead Capture/Social Proof/Poin Loyalitas SENGAJA TIDAK ada di sini
// -- account-wide (satu per akun, dikelola lewat menu masing-masing),
// bukan per-halaman.
//
// KOMPONEN TERKONTROL (bug ditemukan 8 Agustus 2026, audit responsif):
// sebelumnya komponen ini mengambil data & merender LivePreviewPanel-nya
// SENDIRI di dalam grid internal -- selain bikin dobel dengan pratinjau
// Bio di tab lain (sudah diperbaiki commit sebelumnya dengan menyembunyikan
// pratinjau Bio khusus tab ini), grid `1fr` di dalamnya juga tidak diberi
// min-w-0 (akar masalah overflow yang SAMA seperti yang pernah diperbaiki
// di dashboard/layout.tsx, lihat commit 08c1b78) sehingga bisa memaksa
// seluruh halaman melebar horizontal. Diperbaiki dengan mengangkat SEMUA
// pengambilan data & pratinjau ke induk (dashboard/products/page.tsx) --
// satu pratinjau Toko yang konsisten di SEMUA tab menu Produk, komponen
// ini sekarang murni konten kolom kiri (terkontrol lewat props).
export default function ProdukPageEditor({
  loading,
  username,
  page,
  setPage,
  links,
  setLinks,
  error,
  setError,
  creating,
  onCreateNow,
  onStickersChange,
  section,
  setSection,
  products,
  onProductCreated,
  externalSelectBlockId,
  onActiveBlockChange,
}: {
  loading: boolean;
  username: string;
  page: ExtraPageDetail | null;
  setPage: (p: ExtraPageDetail) => void;
  links: LinkItem[];
  setLinks: (fn: (prev: LinkItem[]) => LinkItem[]) => void;
  error: string | null;
  setError: (msg: string | null) => void;
  creating: boolean;
  onCreateNow: () => void;
  onStickersChange: (stickers: PageStickerData[]) => void;
  // products/onProductCreated -- blok "produk" di Toko (permintaan langsung
  // pengguna, 13 September 2026), lihat catatan lengkap di BlockSection.
  products: DashboardProduct[];
  onProductCreated: (product: DashboardProduct) => void;
  // section/setSection -- diangkat ke induk (dashboard/products/page.tsx,
  // permintaan langsung pengguna: "langsung edit di bagian pratinjau nya")
  // supaya induk tahu tab Stiker sedang aktif atau tidak, untuk menyalakan
  // editableStickers di <LivePreviewPanel> miliknya sendiri -- pratinjau
  // Toko dirender di INDUK, bukan di komponen terkontrol ini.
  section: DesignSection;
  setSection: (s: DesignSection) => void;
  // externalSelectBlockId -- audit bug 22 September 2026 ("klik blok di
  // pratinjau Toko diam-diam membuka tab baru", parity dgn perbaikan
  // dashboard/links/page.tsx commit 968755f yang TIDAK PERNAH menjangkau
  // Toko): id blok yang baru saja diklik di LivePreviewPanel milik INDUK
  // (dashboard/products/page.tsx, sama seperti section/setSection di
  // atas -- pratinjau Toko dirender di induk, bukan di sini). undefined
  // (bawaan) = belum pernah ada klik pratinjau. Arah "klik pratinjau ->
  // buka editor" (INI).
  externalSelectBlockId?: string | null;
  // onActiveBlockChange -- susulan 23 September 2026, arah SEBALIKNYA
  // dari externalSelectBlockId di atas ("buka blok lewat baris kiri ->
  // sorot balik di pratinjau"). Diteruskan apa adanya ke BlockSection
  // (lihat catatan lengkap di sana) -- contentEditId/drilldownBlockId
  // TETAP state internal BlockSection (tidak diangkat penuh ke induk
  // seperti section/setSection), cukup DILAPORKAN lewat callback ini
  // setiap kali berubah.
  onActiveBlockChange?: (id: string | null) => void;
}) {
  const router = useRouter();
  const { t } = useLocale();
  useErrorToast(error);

  async function handlePatch(patch: Parameters<typeof updateExtraPage>[1]) {
    if (!page) return;
    const previous = page;
    setPage({ ...page, ...patch });
    try {
      await updateExtraPage(page.id, patch);
    } catch (err) {
      setPage(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.saveSettings"));
    }
  }

  // handleStyleOverride -- sama seperti useDesignData.ts: menyentuh panel
  // Tombol/Font TIDAK memaksa ganti `theme`, cuma menyalakan
  // custom_style_override supaya kustomisasi jadi lapisan independen di
  // atas tema apa pun (lihat catatan panjang di halaman utama).
  function handleStyleOverride(patch: Omit<Parameters<typeof updateExtraPage>[1], "theme" | "custom_style_override">) {
    return handlePatch({ ...patch, custom_style_override: true });
  }

  // handleDesignLocalChange/handleUploadAvatar/handleUploadBackground --
  // adapter Tema/Header/Tombol/Font (components/dashboard/page/design-
  // sections.tsx, diekstrak dari sini 9 September 2026, "design langsung di
  // builder juga"): komponen bersama itu generik atas DesignSectionPage
  // (BUKAN ExtraPageDetail langsung), jadi optimistic local-update di sini
  // TIDAK bisa langsung `setPage({...page, ...patch})` di dalam komponen
  // bersama (patch:Partial<DesignSectionPage> tidak dijamin lengkapi semua
  // field ExtraPageDetail secara statis) -- SATU cast di titik jembatan ini
  // aman karena `page` di sisi kanan SELALU objek ExtraPageDetail asli,
  // cuma field yang disebut di `patch` yang berubah.
  function handleDesignLocalChange(patch: DesignSectionPatch) {
    if (!page) return;
    setPage({ ...page, ...patch } as ExtraPageDetail);
  }
  async function handleUploadAvatar(file: File) {
    if (!page) throw new Error("no page");
    return uploadExtraPageAvatar(page.id, file);
  }
  async function handleUploadBackground(file: File) {
    if (!page) throw new Error("no page");
    const { custom_background_value } = await uploadExtraPageBackground(page.id, file);
    return custom_background_value;
  }

  // handleSlugChange/handleSlugBlur -- permintaan langsung pengguna 9
  // September 2026 ("kenapa url store page nya masih staging.jeon.id/
  // akbarokta/akbarokta"): Toko PERTAMA yang dibuat SEBELUM
  // autoProdukPageSlug diubah dari username jadi "produk" (page.go) masih
  // membawa slug lama SELAMANYA (perubahan itu sengaja TIDAK retroaktif,
  // supaya link yang sudah dibagikan tidak putus) -- endpoint backend
  // (updateExtraPage) SUDAH menerima field `slug` sejak lama, cuma belum
  // pernah ada UI utk menggantinya di sini. Pola onChange (optimistic
  // lokal) + onBlur (persist) SAMA PERSIS display_name/bio di
  // HeaderSection (design-sections.tsx).
  function handleSlugChange(value: string) {
    if (!page) return;
    setPage({ ...page, slug: value });
  }
  function handleSlugBlur() {
    if (!page) return;
    const next = page.slug.trim().toLowerCase();
    if (next !== page.slug) setPage({ ...page, slug: next });
    handlePatch({ slug: next });
  }

  if (loading) return <PageSkeleton />;

  if (!page) {
    return (
      <div className="glass mx-auto max-w-xl rounded-jmd p-8 text-center shadow-card">
        <IconSparkle className="mx-auto h-8 w-8 text-jeon-purple" />
        <h2 className="mt-3 font-display text-lg font-bold text-app-ink">{t("dashboard.components.produkPageEditor.notActive.title")}</h2>
        <p className="mt-2 text-sm text-app-muted">
          {t("dashboard.components.produkPageEditor.notActive.description")}{" "}
          {/* "produk" -- lihat autoProdukPageSlug (page.go): slug Toko
              pertama diubah dari username jadi konstanta tetap "produk"
              (permintaan langsung pengguna 9 September 2026, URL
              jeon.id/{username}/{username} kelihatan berulang). */}
          <span className="font-semibold text-app-ink">jeon.id/{username}/produk</span>.
        </p>
        <button
          type="button"
          onClick={onCreateNow}
          disabled={creating || !username}
          className="btn-primary mt-5 rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {creating ? t("dashboard.components.produkPageEditor.notActive.creating") : t("dashboard.components.produkPageEditor.notActive.createNow")}
        </button>
      </div>
    );
  }

  // §13.7 (JEONID-DASHBOARD-REDESIGN-SPEC.md, permintaan langsung
  // pengguna 8 September 2026): "editor template yang sama secara visual
  // dengan Halaman Saya" -- kartu pengaturan (URL/publish/watermark/mode
  // builder) dibungkus SectionCard (komponen resmi hasil Fase 1
  // Foundation, dipakai halaman Settings/Editor lain) & tab kategori
  // pakai DesignCategoryTabs (gaya SAMA PERSIS dgn 5 halaman
  // /dashboard/design/* Bio) -- HANYA wrapper visual yang diganti, isi
  // (BlockSection/TemaSection/dst di bawah) TETAP "implementation
  // existing" apa adanya sesuai teks spec, tidak di-reskin. LENGKAP &
  // stabil di production sejak v0.37.0/v0.38.0, flag "sales" dihapus dari
  // file ini 8 September 2026. Kartu ini SEMPAT di paling atas halaman --
  // dipindah ke BAWAH tab & konten blok 15 September 2026, lihat catatan
  // lengkap di titik render-nya.
  const settingsCardTitle = t("dashboard.components.produkPageEditor.pageTitle");
  const settingsCardAction = (
    <a
      href={`${SITE_URL}/${username}/${page.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs font-semibold text-jeon-purple hover:underline"
    >
      <IconExternal className="h-3.5 w-3.5" />
      jeon.id/{username}/{page.slug}
    </a>
  );
  const settingsCardBody = (
    <>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.slugLabel")}</label>
        <div className="flex min-w-0 items-center gap-0 rounded-lg border border-app-border focus-within:border-jeon-purple">
          <span className="flex-shrink-0 whitespace-nowrap py-2 pl-3 text-sm text-app-muted">jeon.id/{username}/</span>
          <input
            type="text"
            maxLength={50}
            value={page.slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            onBlur={handleSlugBlur}
            className="w-full min-w-0 rounded-r-lg py-2 pr-3 text-sm outline-none"
          />
        </div>
        <p className="mt-1 text-[11px] text-app-muted">{t("dashboard.components.produkPageEditor.slugHint")}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${page.is_published ? "bg-jeon-purple" : "bg-muted"}`} />
          <span className={`text-xs font-semibold ${page.is_published ? "text-jeon-purple" : "text-app-muted"}`}>
            {page.is_published ? t("dashboard.components.produkPageEditor.published") : t("dashboard.components.produkPageEditor.notPublished")}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Toggle
            checked={page.is_published}
            onChange={() => handlePatch({ is_published: !page.is_published })}
            label={t("dashboard.components.produkPageEditor.publishToggle")}
          />
          <span className="text-sm font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.publishToggle")}</span>
        </div>
        {/* Modul Langganan Premium (permintaan langsung pengguna, 8 Agustus
            2026): toggle watermark yang SAMA seperti halaman Bio utama
            (lihat dashboard/design/page.tsx) -- kreator gratis dikunci
            (klik mengarahkan ke halaman upgrade), Premium bebas mengatur
            sendiri. Gerbang sungguhan tetap di backend. */}
        <div className="mt-3 flex items-center gap-2">
          <Toggle
            checked={page.is_premium && page.hide_watermark}
            disabled={!page.is_premium}
            onChange={() => handlePatch({ hide_watermark: !page.hide_watermark })}
            label={t("dashboard.components.produkPageEditor.hideWatermark")}
          />
          <button
            type="button"
            onClick={() => !page.is_premium && router.push("/dashboard/settings/subscription")}
            className="flex items-center gap-1 text-sm font-semibold text-app-ink"
          >
            {t("dashboard.components.produkPageEditor.hideWatermark")}
            {!page.is_premium && <IconLock className="h-3.5 w-3.5 text-app-muted" />}
          </button>
        </div>
        {/* Canvas Page Builder utk Halaman Toko -- permintaan langsung
            pengguna 9 September 2026 ("buat store page bisa mode builder
            juga"): SEBELUMNYA SENGAJA tidak ada entry point ke sini sama
            sekali (Toko dikecualikan dari mode builder, migrasi 000096) --
            sekarang grid produk sudah ikut dirender BuilderPagePreview
            (PagePreview.tsx), jadi tautan yang SAMA PERSIS polanya dgn
            entry point Bio (dashboard/links/page.tsx) ditambahkan di sini
            juga. Route tujuan sendiri yang PATCH builder_mode='builder'
            begitu dibuka (idempoten). */}
        <Link
          href={`/builder/${page.id}`}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border-2 border-jeon-ink bg-app-surface py-2.5 text-sm font-bold text-app-ink transition-transform hover:scale-[1.01]"
        >
          <IconColumns className="h-4 w-4" />
          {t("dashboard.components.produkPageEditor.openBuilderMode")}
        </Link>
    </>
  );

  const designTabEntries: [DesignSection, string][] = [
    ["blok", t("dashboard.components.produkPageEditor.designTabs.blok")],
    ["tema", t("dashboard.components.produkPageEditor.designTabs.tema")],
    ["header", t("dashboard.components.produkPageEditor.designTabs.header")],
    ["tombol", t("dashboard.components.produkPageEditor.designTabs.tombol")],
    ["font", t("dashboard.components.produkPageEditor.designTabs.font")],
    ["stiker", t("dashboard.components.produkPageEditor.designTabs.stiker")],
  ];

  return (
    <div className="min-w-0">
      {/* Kartu pengaturan Toko (URL/publish/watermark/mode builder)
          dipindah ke BAWAH tab & konten blok -- permintaan langsung
          pengguna, 15 September 2026: "saya mau bagian ini dipindahkan
          jangan di bagian atas karna menutupi user untuk menambahkan blok
          untuk store". Kartu ini dulu SELALU di paling atas, di atas tab
          Blok/Tema/dst, jadi menutupi tombol "+ Tambah Blok/Tautan" di
          bawah layar/butuh scroll dulu tiap kali membuka tab ini. Tab +
          konten sekarang tampil duluan, kartu pengaturan jadi penutup
          halaman -- tetap ada, cuma tidak lagi menghalangi tugas paling
          sering dilakukan di menu ini (menambah blok). */}
      <div>
        <DesignCategoryTabs
          tabs={designTabEntries.map(([key, label]) => ({ key, label, onClick: () => setSection(key) }))}
          activeKey={section}
        />
      </div>

      <div className="mt-4">
        {section === "blok" && (
          <BlockSection
            pageId={page.id}
            links={links}
            setLinks={setLinks}
            setError={setError}
            products={products}
            onProductCreated={onProductCreated}
            isPremium={page.is_premium ?? false}
            externalSelectBlockId={externalSelectBlockId}
            onActiveBlockChange={onActiveBlockChange}
          />
        )}
        {section === "tema" && (
          <TemaSection page={page} isPremium={page.is_premium} onPatch={handlePatch} onError={setError} onUploadBackground={handleUploadBackground} />
        )}
        {section === "header" && (
          <HeaderSection
            page={page}
            onLocalChange={handleDesignLocalChange}
            onPatch={handlePatch}
            onError={setError}
            onUploadAvatar={handleUploadAvatar}
            onSaveProfileExtras={async (next) => {
              const res = await updateExtraPageProfileExtras(page.id, next);
              handleDesignLocalChange({ profile_extras: res.profile_extras });
            }}
          />
        )}
        {section === "tombol" && <TombolSection page={page} onLocalChange={handleDesignLocalChange} onStyleOverride={handleStyleOverride} />}
        {section === "font" && <FontSection page={page} onLocalChange={handleDesignLocalChange} onStyleOverride={handleStyleOverride} />}
        {section === "stiker" && (
          <section className="glass rounded-jmd p-5 shadow-card">
            <StickerCanvasEditor stickers={page.stickers} onChange={onStickersChange} />
          </section>
        )}
      </div>

      <div className="mt-4">
        <SectionCard title={settingsCardTitle} action={settingsCardAction}>
          {settingsCardBody}
        </SectionCard>
      </div>
    </div>
  );
}
// ---------- Blok & Tautan ----------

// FormField -- SEKARANG diimpor dari components/FormField.tsx (25 September
// 2026: chip "Opsional" perlu tampil sama di halaman utama & Toko; salinan
// lokal yang identik dihapus supaya tidak tertinggal lagi).
function BlockSection({
  pageId,
  links,
  setLinks,
  setError,
  products,
  onProductCreated,
  isPremium,
  externalSelectBlockId,
  onActiveBlockChange,
}: {
  pageId: string;
  links: LinkItem[];
  setLinks: (fn: (prev: LinkItem[]) => LinkItem[]) => void;
  setError: (msg: string | null) => void;
  products: DashboardProduct[];
  onProductCreated: (product: DashboardProduct) => void;
  // isPremium -- audit bug 22 September 2026: BlockDrilldownEditor di
  // bawah (render drilldownLink) SEBELUMNYA hardcode isPremium={false},
  // lihat catatan panjang di situ -- diteruskan dari page.is_premium milik
  // ProdukPageEditor (komponen ini tidak menerima `page` sama sekali,
  // cuma pageId string).
  isPremium: boolean;
  // externalSelectBlockId -- lihat catatan panjang di prop sama namanya
  // di ProdukPageEditor, diteruskan apa adanya ke komponen INI karena
  // links/contentEditId/drilldownBlockId semuanya state LOKAL di sini,
  // bukan di ProdukPageEditor.
  externalSelectBlockId?: string | null;
  // onActiveBlockChange -- susulan 23 September 2026 (permintaan
  // pengguna: "arah sebaliknya dari sorotan pratinjau ... belum ada"),
  // arah SEBALIKNYA dari externalSelectBlockId di atas. Dipanggil lewat
  // useEffect (BUKAN langsung di render) SETIAP KALI contentEditId ATAU
  // drilldownBlockId berubah -- ini pola resmi React yang BERBEDA dari
  // "adjust state during render": di sini yang di-setState adalah state
  // milik INDUK (lewat prop callback), bukan state MILIK KOMPONEN INI
  // sendiri, jadi TIDAK melanggar react-hooks/set-state-in-effect (aturan
  // itu soal efek yang men-setState dirinya sendiri) -- ini justru contoh
  // resmi "notify parent tentang perubahan state" dari dokumentasi React.
  // Induk (dashboard/products/page.tsx) meneruskan nilai ini balik ke
  // LivePreviewPanel.highlightLinkId, MENUTUP lingkaran yang sebelumnya
  // cuma satu arah (pratinjau -> editor kiri, commit faf5170) -- sekarang
  // editor kiri -> pratinjau juga tersorot.
  onActiveBlockChange?: (id: string | null) => void;
}) {
  const { t } = useLocale();
  const CONTENT_TILES = getContentTiles(t);
  const BLOCK_LABEL = getBlockLabel(t);

  // Sinkronisasi externalSelectBlockId -- pola resmi React "adjust state
  // during render" (CLAUDE.md: bandingkan prop ke prevXxx yang dilacak
  // state, panggil setState kondisional LANGSUNG di badan komponen,
  // BUKAN di useEffect) -- BUKAN useEffect supaya tidak melanggar
  // react-hooks/set-state-in-effect. selectBlockForEdit didefinisikan
  // LEBIH BAWAH di komponen ini tapi tetap aman dipanggil di sini --
  // `function` declaration di-hoist penuh oleh JS/TS, beda dari
  // `const`/arrow function.
  const [lastHandledExternalSelectId, setLastHandledExternalSelectId] = useState<string | null | undefined>(undefined);
  if (externalSelectBlockId !== undefined && externalSelectBlockId !== lastHandledExternalSelectId) {
    setLastHandledExternalSelectId(externalSelectBlockId);
    if (externalSelectBlockId) {
      const target = links.find((l) => l.id === externalSelectBlockId);
      if (target) selectBlockForEdit(target);
    }
  }

  // addModalOpen/addCategory/addSearch -- pengganti grid tile inline lama
  // (susulan 15 September 2026, permintaan langsung pengguna: "samakan
  // semua blok/link... seperti yang ada di my page") -- AddLinkModal yang
  // SAMA PERSIS dipakai dashboard/links/page.tsx, diimpor APA ADANYA
  // (komponen itu sudah murni prop-driven, lihat catatan di file itu
  // sendiri "diangkat keluar dari links/page.tsx").
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<AddCategory>("populer");
  const [addSearch, setAddSearch] = useState("");

  const [adding, setAdding] = useState(false);
  const [blockType, setBlockType] = useState<BlockType>("link");
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  // videoSource -- paritas form buat blok halaman utama (25 September 2026).
  const [videoSource, setVideoSource] = useState<"url" | "upload">("url");
  const [mapsUrl, setMapsUrl] = useState("");
  const [mapsEmbed, setMapsEmbed] = useState(true);
  const [text, setText] = useState("");
  // accordionText -- state TERPISAH dari `text` (walau block_data-nya sama
  // {text}) sama seperti dashboard/links/page.tsx: hindari isian nyasar
  // saat kreator ganti-ganti pilihan tipe blok sebelum submit.
  const [accordionText, setAccordionText] = useState("");
  const [faqItems, setFaqItems] = useState<{ question: string; answer: string }[]>([{ question: "", answer: "" }]);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  // 10 field blok baru (susulan 15 September 2026) -- state create-form,
  // pola & nama SAMA PERSIS dashboard/links/page.tsx supaya gampang
  // dibandingkan/di-diff kalau ada perubahan lagi di sana nanti.
  const [showcaseUrl, setShowcaseUrl] = useState("");
  const [showcaseDescription, setShowcaseDescription] = useState("");
  const [showcaseBadge, setShowcaseBadge] = useState("");
  const [showcaseCta, setShowcaseCta] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [buttonMode, setButtonMode] = useState<"url" | "whatsapp">("url");
  const [buttonWhatsappNumber, setButtonWhatsappNumber] = useState("");
  const [buttonWhatsappMessage, setButtonWhatsappMessage] = useState("");
  const [countdownTargetAt, setCountdownTargetAt] = useState("");
  const [countdownProductId, setCountdownProductId] = useState("");
  const [countdownCtaLabel, setCountdownCtaLabel] = useState("");
  const [countdownCtaUrl, setCountdownCtaUrl] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");
  const [videoImageVideoUrl, setVideoImageVideoUrl] = useState("");
  const [embedLinkUrl, setEmbedLinkUrl] = useState("");
  const [embedLinkDescription, setEmbedLinkDescription] = useState("");
  const [listStyle, setListStyle] = useState<"list" | "card" | "testimony">("list");
  const [listItems, setListItems] = useState<ListEditorItem[]>([{ title: "", description: "", author: "" }]);

  // contentEditId -- redesain "Konsisten & Ringkas" (14 September 2026 di
  // dashboard/links/page.tsx, sekarang diporting ke Toko 15 September
  // 2026): SATU pola accordion utk SEMUA tipe blok yang punya isi bisa
  // disunting lagi setelah dibuat -- SEBELUMNYA di file ini video/maps/
  // teks/accordion/faq TIDAK BISA disunting lagi sama sekali sesudah
  // dibuat (cuma bisa dihapus), lihat memori project_toko-missing-edit-
  // content -- gap itu ditutup di sini sekaligus dgn menambah 10 tipe baru.
  const [contentEditId, setContentEditId] = useState<string | null>(null);
  // Buffer edit isi blok (10 tipe berbasis form) + snapshot cek draft
  // belum-disimpan -- lihat lib/use-content-edit-buffers.ts (dipakai
  // bersama halaman utama & Toko sejak audit P4 24 September 2026).
  const {
    editVideoUrl, setEditVideoUrl, editVideoAutoplay, setEditVideoAutoplay, editVideoSource, setEditVideoSource, editMapsUrl, setEditMapsUrl, editMapsEmbed, setEditMapsEmbed,
    editText, setEditText, editAccordionText, setEditAccordionText, editShowcaseUrl,
    setEditShowcaseUrl, editShowcaseDescription, setEditShowcaseDescription, editShowcaseBadge,
    setEditShowcaseBadge, editShowcaseCta, setEditShowcaseCta, editButtonUrl, setEditButtonUrl,
    editButtonMode, setEditButtonMode, editButtonWhatsappNumber, setEditButtonWhatsappNumber,
    editButtonWhatsappMessage, setEditButtonWhatsappMessage, editCountdownTargetAt,
    setEditCountdownTargetAt, editCountdownProductId, setEditCountdownProductId,
    editCountdownCtaLabel, setEditCountdownCtaLabel, editCountdownCtaUrl, setEditCountdownCtaUrl,
    editEmbedUrl, setEditEmbedUrl, editVideoImageVideoUrl, setEditVideoImageVideoUrl,
    editEmbedLinkUrl, setEditEmbedLinkUrl, editEmbedLinkDescription, setEditEmbedLinkDescription,
    loadContentEditBuffers, isContentEditDirty, clearContentEditSnapshot,
  } = useContentEditBuffers();
  const [savingContent, setSavingContent] = useState(false);

  // drilldownBlockId -- blok "catalog"/"faq" yang sedang dibuka lewat
  // BlockDrilldownEditor (redesain drill-down gaya Linktree, sama persis
  // dashboard/links/page.tsx) -- SATU-SATUNYA cara isi katalog/pertanyaan
  // FAQ bisa disunting lagi setelah blok pertama kali dibuat.
  const [drilldownBlockId, setDrilldownBlockId] = useState<string | null>(null);

  // Lapor balik blok aktif ke induk -- lihat catatan panjang di
  // onActiveBlockChange (signature komponen ini). contentEditId dan
  // drilldownBlockId TIDAK PERNAH aktif bersamaan (satu blok cuma bisa
  // lewat SALAH SATU jalur, lihat selectBlockForEdit/toggleContentEdit di
  // bawah), jadi `?? null` aman -- tidak ada kasus keduanya terisi lalu
  // salah satu terpilih diam-diam.
  useEffect(() => {
    onActiveBlockChange?.(contentEditId ?? drilldownBlockId ?? null);
  }, [contentEditId, drilldownBlockId, onActiveBlockChange]);

  // State strip alat kelola per blok -- paritas Toko <-> Links (permintaan
  // langsung pengguna, 18 September 2026: "buat tiap blok yang ada di page
  // store itu disamakan seperti di links ada tombol pengaturan nya terus
  // kalo mau edit di klik dulu blok nya biar muncul data datanya"). Nama &
  // pola SAMA PERSIS dashboard/links/page.tsx supaya gampang di-diff.
  const [toolsOpenId, setToolsOpenId] = useState<string | null>(null);
  // toolsTab -- tab "Alat"/"Desain" (25 September 2026, paritas tab
  // Konten/Desain di editor blok halaman utama: "daripada menumpuk dibawah
  // style dan design lebih bagus dibuat di tab baru").
  const [toolsTab, setToolsTab] = useState<"tools" | "design">("tools");
  const [iconUploadingId, setIconUploadingId] = useState<string | null>(null);
  const [thumbnailUploadingId, setThumbnailUploadingId] = useState<string | null>(null);
  const [iconPickerLinkId, setIconPickerLinkId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{ id: string; field: "title" | "url" | "description" } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [scheduleEditId, setScheduleEditId] = useState<string | null>(null);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [lockEditId, setLockEditId] = useState<string | null>(null);
  const [lockTypeInput, setLockTypeInput] = useState<"age" | "code" | "subscribe" | "sensitive">("code");
  const [lockCodeInput, setLockCodeInput] = useState("");
  const [lockMinAgeInput, setLockMinAgeInput] = useState("18");
  const [savingLock, setSavingLock] = useState(false);
  // catalogSaveQueueRef -- antrean promise PER link, pola SAMA PERSIS
  // dashboard/links/page.tsx: PATCH kedua baru dikirim setelah PATCH
  // pertama (link yang sama) beres, supaya urutan tulis di backend sama
  // dgn urutan sebenarnya di client.
  const catalogSaveQueueRef = useRef<Record<string, Promise<unknown>>>({});

  // Blok "gallery"/"audio" (hasil analisa galeri tema kompetitor, 17
  // Agustus 2026): foto/audio diunggah SETELAH blok dibuat (lihat catatan
  // di CONTENT_TILES) -- id blok yang sedang mengunggah.
  const [galleryUploadingId, setGalleryUploadingId] = useState<string | null>(null);
  // "Foto di dalam foto" (bug fungsional ditemukan 21 September 2026: fitur
  // ini sebelumnya tidak punya UI sama sekali di Toko walau backend sudah
  // generik/siap) -- pola sama persis dashboard/links/page.tsx.
  const [nestedPanelOpenFor, setNestedPanelOpenFor] = useState<string | null>(null);
  const [nestedUploadingFor, setNestedUploadingFor] = useState<string | null>(null);
  // uploadProgress -- "2/5" di tombol unggah selama multi-upload berjalan.
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [audioUploadingId, setAudioUploadingId] = useState<string | null>(null);
  // "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
  // file pdf download", pola sama seperti galleryUploadingId/audioUploadingId.
  const [fileUploadingId, setFileUploadingId] = useState<string | null>(null);
  // showcaseUploadingId/mediaImageUploadingId -- susulan 15 September 2026,
  // pola sama persis dashboard/links/page.tsx.
  const [showcaseUploadingId, setShowcaseUploadingId] = useState<string | null>(null);
  const [mediaImageUploadingId, setMediaImageUploadingId] = useState<string | null>(null);

  async function handleGalleryImageUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    // multi-upload (25 September 2026) -- lihat lib/multi-upload.ts.
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length === 0) return;
    setGalleryUploadingId(link.id);
    setError(null);
    const current = ((link.block_data?.images as string[]) ?? []).length;
    const outcome = await uploadFilesSequentially(
      files,
      maxGalleryImages - current,
      (file) => uploadGalleryImage(link.id, file),
      ({ images }, done, total) => {
        setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, images } } : l)));
        setUploadProgress({ done, total });
      },
      (total) => setUploadProgress({ done: 0, total }),
    );
    setGalleryUploadingId(null);
    setUploadProgress(null);
    reportMultiUpload(outcome, maxGalleryImages, "dashboard.components.produkPageEditor.errors.uploadGalleryImage");
  }

  async function handleGalleryImageDelete(link: LinkItem, index: number) {
    setError(null);
    try {
      // captions/nestedImages ikut ditimpa dari respons server -- lihat
      // catatan panjang di handler kembarnya, app/dashboard/links/page.tsx
      // (bug fungsional ditemukan 21 September 2026: data basi bisa "hidup
      // lagi" lewat PATCH block_data lain kalau cuma `images` yang disinkron).
      const { images, captions, nested_images } = await deleteGalleryImage(link.id, index);
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, images, captions, nestedImages: nested_images } } : l))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteGalleryImage"));
    }
  }

  // handleNestedImageUpload/Delete -- "foto di dalam foto" (bug fungsional
  // ditemukan 21 September 2026: fitur ini tidak punya UI di Toko sama
  // sekali, walau backend generik & sudah dipakai penuh di Links) -- pola
  // APA ADANYA dari dashboard/links/page.tsx.
  async function handleNestedImageUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem, parentUrl: string) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length === 0) return;
    setNestedUploadingFor(parentUrl);
    setError(null);
    const current = ((link.block_data?.nestedImages as Record<string, string[]> | undefined)?.[parentUrl] ?? []).length;
    const outcome = await uploadFilesSequentially(
      files,
      maxNestedGalleryImages - current,
      (file) => uploadGalleryNestedImage(link.id, parentUrl, file),
      ({ nested_images }, done, total) => {
        setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, nestedImages: nested_images } } : l)));
        setUploadProgress({ done, total });
      },
      (total) => setUploadProgress({ done: 0, total }),
    );
    setNestedUploadingFor(null);
    setUploadProgress(null);
    reportMultiUpload(outcome, maxNestedGalleryImages, "dashboard.components.produkPageEditor.errors.uploadNestedPhoto");
  }

  // reportMultiUpload -- pesan akhir multi-upload: error unggahan (foto yg
  // sudah masuk tetap tersimpan) dan/atau jumlah foto di luar kuota.
  function reportMultiUpload(outcome: MultiUploadOutcome, max: number, fallbackKey: string) {
    const parts: string[] = [];
    if (outcome.error) parts.push(outcome.error instanceof ApiError ? outcome.error.message : t(fallbackKey));
    if (outcome.skipped > 0) {
      parts.push(
        t("dashboard.pages.links.galleryPanel.uploadSkipped").replace("{count}", String(outcome.skipped)).replace("{max}", String(max)),
      );
    }
    if (parts.length > 0) setError(parts.join(" "));
  }

  async function handleNestedImageDelete(link: LinkItem, parentUrl: string, index: number) {
    setError(null);
    try {
      const { nested_images } = await deleteGalleryNestedImage(link.id, parentUrl, index);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, nestedImages: nested_images } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteNestedPhoto"));
    }
  }

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAudioUploadingId(link.id);
    setError(null);
    try {
      const { audio_url, title: newTitle } = await uploadAudioBlock(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, title: newTitle, block_data: { ...l.block_data, audio_url } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadAudio"));
    } finally {
      setAudioUploadingId(null);
    }
  }

  async function handleAudioDelete(link: LinkItem) {
    setError(null);
    try {
      await deleteAudioBlock(link.id);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, audio_url: "" } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteAudio"));
    }
  }

  // "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
  // file pdf download", pola sama seperti handleAudioUpload/handleAudioDelete.
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileUploadingId(link.id);
    setError(null);
    try {
      const { file_url, file_name, file_size_bytes } = await uploadFileBlock(link.id, file);
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, file_url, file_name, file_size_bytes } } : l))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadFile"));
    } finally {
      setFileUploadingId(null);
    }
  }

  async function handleFileDelete(link: LinkItem) {
    setError(null);
    try {
      await deleteFileBlock(link.id);
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, file_url: "", file_name: "", file_size_bytes: 0 } } : l))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteFile"));
    }
  }

  // handleShowcaseImageUpload -- blok "project_showcase", pola sama seperti
  // dashboard/links/page.tsx: satu gambar, unggah ulang menimpa, disimpan
  // di block_data.image_url (endpoint UploadShowcaseImage, links.go).
  async function handleShowcaseImageUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setShowcaseUploadingId(link.id);
    setError(null);
    try {
      const { image_url } = await uploadShowcaseImage(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, image_url } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadFile"));
    } finally {
      setShowcaseUploadingId(null);
    }
  }

  // handleMediaImageUpload/Delete -- panel "Kelola Gambar" bersama blok
  // "image"/"video_image"/"embed_link" (pola SAMA PERSIS dashboard/links/
  // page.tsx) -- SATU endpoint uploadBuilderMediaImage/deleteBuilderMediaImage
  // dipakai bersama ketiganya.
  async function handleMediaImageUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMediaImageUploadingId(link.id);
    setError(null);
    try {
      const { image_url } = await uploadBuilderMediaImage(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, image_url } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadFile"));
    } finally {
      setMediaImageUploadingId(null);
    }
  }
  async function handleMediaImageDelete(link: LinkItem) {
    setError(null);
    try {
      await deleteBuilderMediaImage(link.id);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, image_url: "" } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteFile"));
    }
  }

  // saveCatalogItems/handleSaveFaqItems -- disalin APA ADANYA dari
  // dashboard/links/page.tsx (lihat catatan lengkap di sana): satu-satunya
  // jalan isi blok "catalog"/"faq" tingkat atas bisa disunting lagi setelah
  // dibuat, lewat BlockDrilldownEditor.
  async function saveCatalogItems(link: LinkItem, items: CatalogItem[]) {
    setError(null);
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, items } } : l)));
    const queuedBefore = catalogSaveQueueRef.current[link.id] ?? Promise.resolve();
    const thisSave = queuedBefore.catch(() => {}).then(() => updateLink(link.id, { block_data: { items } }));
    catalogSaveQueueRef.current[link.id] = thisSave.catch(() => {});
    try {
      await thisSave;
    } catch (err) {
      setLinks(() => previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.saveCatalogItemFailed"));
    }
  }

  async function handleSaveFaqItems(link: LinkItem, items: { question: string; answer: string }[]): Promise<boolean> {
    setError(null);
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, items } } : l)));
    try {
      await updateLink(link.id, { block_data: { items } });
      return true;
    } catch (err) {
      setLinks(() => previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.saveBlockContentFailed"));
      return false;
    }
  }

  function resetForm() {
    setTitle("");
    setLinkUrl("");
    setVideoUrl("");
    setVideoSource("url");
    setMapsUrl("");
    setMapsEmbed(true);
    setText("");
    setAccordionText("");
    setFaqItems([{ question: "", answer: "" }]);
    setShowcaseUrl("");
    setShowcaseDescription("");
    setShowcaseBadge("");
    setShowcaseCta("");
    setButtonUrl("");
    setButtonMode("url");
    setButtonWhatsappNumber("");
    setButtonWhatsappMessage("");
    setCountdownTargetAt("");
    setCountdownProductId("");
    setCountdownCtaLabel("");
    setCountdownCtaUrl("");
    setEmbedUrl("");
    setVideoImageVideoUrl("");
    setEmbedLinkUrl("");
    setEmbedLinkDescription("");
    setListStyle("list");
    setListItems([{ title: "", description: "", author: "" }]);
  }

  // handleSelectContentTile -- dipicu AddLinkModal (pengganti grid tile
  // lama). "link" tetap butuh judul+url langsung di form (sama seperti
  // sebelumnya) -- tipe lain buka form kosong dgn blockType terpilih.
  function handleSelectContentTile(tile: ContentTile) {
    setBlockType(tile.key as BlockType);
    // judul blok baru dikosongkan (bukan lagi label tipe generik) --
    // permintaan langsung pengguna, 19 September 2026 ("judul blok juga
    // itu optional untuk bisa ditampilkan"), disamakan dgn perbaikan
    // sepadan di dashboard/links/page.tsx (Links) -- "catalog" tetap
    // diberi label (butuh identitas awal jelas di daftar), tipe lain
    // mulai tanpa judul (halaman publik menyembunyikannya kalau kosong).
    setTitle(tile.key === "catalog" ? tile.label : "");
    setAdding(true);
    setAddModalOpen(false);
  }

  // handleSelectPlatform -- tab "Sosial"/rekomendasi Populer di AddLinkModal
  // (Instagram/TikTok/dll) -- buka form "link" terisi label+template URL
  // platform itu, kreator tinggal lengkapi username/tautannya.
  function handleSelectPlatform(platform: PlatformQuickAdd) {
    // Cabang platform.kind -- drift diperbaiki 24 September 2026 (audit
    // kualitas kode). Versi Toko ini SEBELUMNYA selalu setBlockType("link")
    // dan mengabaikan kind, padahal YouTube & TikTok di AddLinkModal (yang
    // dipakai BERSAMA oleh Simple Mode & Toko) ber-kind "video" dengan
    // urlTemplate kosong. Akibatnya klik YouTube/TikTok di Toko membuka form
    // LINK dengan URL kosong -- submit langsung error "URL wajib diisi", dan
    // kalaupun URL YouTube ditempel, hasilnya baris tautan biasa, bukan
    // pemutar video tertanam. Klik yang sama di halaman utama
    // (links/page.tsx handleSelectPlatform) memberi blok video yang benar;
    // jalur video Toko sendiri sudah lengkap & berfungsi, cuma jalan pintas
    // platform yang tidak pernah mengarah ke sana.
    if (platform.kind === "video") {
      setBlockType("video");
      setTitle(t("dashboard.pages.links.videoTitleTemplate").replace("{platform}", platform.label));
      setVideoUrl("");
    } else {
      setBlockType("link");
      setTitle(platform.label);
      setLinkUrl(platform.urlTemplate);
    }
    setAdding(true);
    setAddModalOpen(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    // Bug fungsional ditemukan 21 September 2026 (audit menyeluruh) -- pola
    // sama persis dashboard/links/page.tsx handleCreateBlock: tile "catalog"
    // di atas SUDAH prefill judulnya (baris 949, sama alasannya -- baris
    // blok katalog baru butuh identitas awal jelas), tipe lain SEMUA sengaja
    // mulai kosong tapi gerbang submit ini masih memaksa wajib utk semuanya.
    if (blockType === "catalog" && !title.trim()) {
      setError(t("dashboard.components.produkPageEditor.errors.titleRequired"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (blockType === "link") {
        if (!linkUrl.trim()) {
          setError(t("dashboard.components.produkPageEditor.errors.urlRequired"));
          setSaving(false);
          return;
        }
        const created = await createExtraPageLink(pageId, { title: title.trim(), url: linkUrl.trim() });
        setLinks((prev) => [...prev, created]);
      } else {
        let blockData: Record<string, unknown> = {};
        let url: string | undefined;
        let description: string | undefined;
        if (blockType === "video" && videoSource === "upload") {
          blockData = { source: "upload" };
        } else if (blockType === "video") {
          if (!videoUrl.trim()) {
            setError(t("dashboard.components.produkPageEditor.errors.videoUrlRequired"));
            setSaving(false);
            return;
          }
          blockData = { video_url: videoUrl.trim() };
        } else if (blockType === "faq") {
          const items = faqItems.filter((it) => it.question.trim() && it.answer.trim());
          if (items.length === 0) {
            setError(t("dashboard.components.produkPageEditor.errors.faqItemRequired"));
            setSaving(false);
            return;
          }
          blockData = { items };
        } else if (blockType === "maps") {
          if (!mapsUrl.trim()) {
            setError(t("dashboard.components.produkPageEditor.errors.mapsUrlRequired"));
            setSaving(false);
            return;
          }
          url = mapsUrl.trim();
          blockData = { embed: mapsEmbed };
        } else if (blockType === "text") {
          if (!text.trim()) {
            setError(t("dashboard.components.produkPageEditor.errors.textRequired"));
            setSaving(false);
            return;
          }
          blockData = { text: text.trim() };
        } else if (blockType === "accordion") {
          if (!accordionText.trim()) {
            setError(t("dashboard.components.produkPageEditor.errors.accordionTextRequired"));
            setSaving(false);
            return;
          }
          blockData = { text: accordionText.trim() };
        } else if (blockType === "project_showcase") {
          if (!showcaseUrl.trim()) {
            setError(t("dashboard.pages.links.errors.ctaUrlRequired"));
            setSaving(false);
            return;
          }
          url = showcaseUrl.trim();
          blockData = { badge_text: showcaseBadge.trim(), cta_text: showcaseCta.trim() };
          description = showcaseDescription.trim();
        } else if (blockType === "button") {
          if (buttonMode === "whatsapp") {
            if (!buttonWhatsappNumber.trim()) {
              setError(t("dashboard.pages.links.errors.whatsappNumberRequired"));
              setSaving(false);
              return;
            }
            url = buildWhatsappButtonUrl(buttonWhatsappNumber, buttonWhatsappMessage);
            blockData = { whatsapp_number: buttonWhatsappNumber.trim(), whatsapp_message: buttonWhatsappMessage.trim() };
          } else {
            if (!buttonUrl.trim()) {
              setError(t("dashboard.pages.links.errors.buttonUrlRequired"));
              setSaving(false);
              return;
            }
            url = buttonUrl.trim();
          }
        } else if (blockType === "countdown") {
          if (!countdownTargetAt) {
            setError(t("dashboard.pages.links.errors.countdownTargetRequired"));
            setSaving(false);
            return;
          }
          blockData = {
            target_at: new Date(countdownTargetAt).toISOString(),
            product_id: countdownProductId || undefined,
            cta_label: countdownProductId ? undefined : countdownCtaLabel.trim() || undefined,
            cta_url: countdownProductId ? undefined : countdownCtaUrl.trim() || undefined,
          };
        } else if (blockType === "embed") {
          if (!embedUrl.trim()) {
            setError(t("dashboard.pages.links.errors.embedUrlRequired"));
            setSaving(false);
            return;
          }
          blockData = { embed_url: embedUrl.trim() };
        } else if (blockType === "video_image") {
          if (videoImageVideoUrl.trim()) blockData = { video_url: videoImageVideoUrl.trim() };
        } else if (blockType === "embed_link") {
          if (!embedLinkUrl.trim()) {
            setError(t("dashboard.pages.links.errors.embedLinkUrlRequired"));
            setSaving(false);
            return;
          }
          url = embedLinkUrl.trim();
          description = embedLinkDescription.trim();
        } else if (blockType === "list") {
          const items = listItems.filter((it) => it.title.trim() || it.description?.trim() || it.author?.trim() || it.url?.trim());
          blockData = { style: listStyle, items };
        }
        const created = await createExtraPageBlock(pageId, { block_type: blockType, title: title.trim(), url, block_data: blockData, description });
        setLinks((prev) => [...prev, created]);
        // Auto-buka BlockDrilldownEditor setelah blok "catalog" baru dibuat --
        // tanpa ini kreator mendarat di baris kosong tanpa cara masuk (blok
        // "faq" tidak butuh ini, form buat FAQ sudah mengumpulkan
        // pertanyaan pertama di awal).
        if (blockType === "catalog") setDrilldownBlockId(created.id);
        if (blockType === "video" && videoSource === "upload") openContentEdit(created);
      }
      resetForm();
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.addBlock"));
    } finally {
      setSaving(false);
    }
  }

  function openContentEdit(link: LinkItem) {
    setContentEditId(link.id);
    loadContentEditBuffers(link);
  }

  // closeContentEdit -- audit bug 22 September 2026 (paritas dgn
  // dashboard/links/page.tsx, lihat catatan panjang di
  // contentEditSnapshot). Menggantikan setContentEditId(null) langsung
  // di toggleContentEdit di bawah.
  async function closeContentEdit(link: LinkItem) {
    if (isContentEditDirty(link.block_type)) {
      const ok = await confirmAction(t("dashboard.pages.links.contentEditorPage.discardDraftText"), {
        title: t("dashboard.pages.links.contentEditorPage.discardDraftTitle"),
        confirmButtonText: t("dashboard.pages.links.contentEditorPage.discardDraftConfirm"),
      });
      if (!ok) return;
    }
    clearContentEditSnapshot();
    setContentEditId(null);
  }

  function toggleContentEdit(link: LinkItem) {
    if (contentEditId === link.id) {
      closeContentEdit(link);
    } else {
      openContentEdit(link);
    }
  }

  // selectBlockForEdit -- audit bug 22 September 2026: paritas dengan
  // dashboard/links/page.tsx (fungsi sama persis, disalin 22 September
  // untuk memperbaiki "klik blok di pratinjau diam-diam membuka tab
  // baru") -- dipanggil dari efek externalSelectBlockId di bawah, BUKAN
  // langsung dari sini. Sengaja TERPISAH dari toggleContentEdit: klik
  // pratinjau pada blok yang SUDAH terbuka harus no-op (tetap terbuka),
  // bukan menutupnya seperti toggleContentEdit.
  function selectBlockForEdit(link: LinkItem) {
    if (link.block_type === "catalog" || link.block_type === "faq") {
      setDrilldownBlockId(link.id);
      return;
    }
    if (contentEditId === link.id) return;
    openContentEdit(link);
  }

  async function handleSaveContent(link: LinkItem) {
    let blockData: Record<string, unknown>;
    let blockUrl: string | undefined;
    let blockDescription: string | undefined;
    if (link.block_type === "video") {
      // Paritas halaman utama (sumber video, 25 September 2026).
      if (editVideoSource === "upload") {
        if (!link.block_data?.video_file_url) {
          setError(t("dashboard.pages.links.blockForm.video.uploadRequired"));
          return;
        }
        blockData = { ...link.block_data, source: "upload", autoplay: editVideoAutoplay };
      } else {
        if (!editVideoUrl.trim()) {
          setError(t("dashboard.components.produkPageEditor.errors.videoUrlRequired"));
          return;
        }
        blockData = { ...link.block_data, source: "url", video_url: editVideoUrl.trim(), autoplay: editVideoAutoplay };
      }
    } else if (link.block_type === "maps") {
      if (!editMapsUrl.trim()) {
        setError(t("dashboard.components.produkPageEditor.errors.mapsUrlRequired"));
        return;
      }
      blockUrl = editMapsUrl.trim();
      blockData = { embed: editMapsEmbed };
    } else if (link.block_type === "text") {
      if (!editText.trim()) {
        setError(t("dashboard.components.produkPageEditor.errors.textRequired"));
        return;
      }
      blockData = { text: editText.trim() };
    } else if (link.block_type === "accordion") {
      if (!editAccordionText.trim()) {
        setError(t("dashboard.components.produkPageEditor.errors.accordionTextRequired"));
        return;
      }
      blockData = { text: editAccordionText.trim() };
    } else if (link.block_type === "project_showcase") {
      if (!editShowcaseUrl.trim()) {
        setError(t("dashboard.pages.links.errors.ctaUrlRequired"));
        return;
      }
      blockUrl = editShowcaseUrl.trim();
      blockDescription = editShowcaseDescription.trim();
      // ...link.block_data -- bug ditemukan lewat review di dashboard/links/
      // page.tsx (12 September 2026, menulis panel serupa utk video_image/
      // embed_link): PATCH generik updateLink MENGGANTI block_data UTUH,
      // bukan merge -- tanpa spread, image_url yang sudah diunggah lewat
      // panel "Kelola gambar" terpisah akan terhapus diam-diam.
      blockData = { ...link.block_data, badge_text: editShowcaseBadge.trim(), cta_text: editShowcaseCta.trim() };
    } else if (link.block_type === "button") {
      if (editButtonMode === "whatsapp") {
        if (!editButtonWhatsappNumber.trim()) {
          setError(t("dashboard.pages.links.errors.whatsappNumberRequired"));
          return;
        }
        blockUrl = buildWhatsappButtonUrl(editButtonWhatsappNumber, editButtonWhatsappMessage);
        blockData = { whatsapp_number: editButtonWhatsappNumber.trim(), whatsapp_message: editButtonWhatsappMessage.trim() };
      } else {
        if (!editButtonUrl.trim()) {
          setError(t("dashboard.pages.links.errors.buttonUrlRequired"));
          return;
        }
        blockUrl = editButtonUrl.trim();
        blockData = {};
      }
    } else if (link.block_type === "countdown") {
      if (!editCountdownTargetAt) {
        setError(t("dashboard.pages.links.errors.countdownTargetRequired"));
        return;
      }
      blockData = {
        target_at: new Date(editCountdownTargetAt).toISOString(),
        product_id: editCountdownProductId || undefined,
        cta_label: editCountdownProductId ? undefined : editCountdownCtaLabel.trim() || undefined,
        cta_url: editCountdownProductId ? undefined : editCountdownCtaUrl.trim() || undefined,
      };
    } else if (link.block_type === "embed") {
      if (!editEmbedUrl.trim()) {
        setError(t("dashboard.pages.links.errors.embedUrlRequired"));
        return;
      }
      blockData = { embed_url: editEmbedUrl.trim() };
    } else if (link.block_type === "video_image") {
      // ...link.block_data -- sama alasan project_showcase di atas.
      blockData = { ...link.block_data, video_url: editVideoImageVideoUrl.trim() };
    } else if (link.block_type === "embed_link") {
      if (!editEmbedLinkUrl.trim()) {
        setError(t("dashboard.pages.links.errors.embedLinkUrlRequired"));
        return;
      }
      blockUrl = editEmbedLinkUrl.trim();
      blockDescription = editEmbedLinkDescription.trim();
      blockData = { ...link.block_data };
    } else {
      return;
    }
    setError(null);
    setSavingContent(true);
    try {
      await updateLink(link.id, { url: blockUrl, block_data: blockData, description: blockDescription });
      const refreshed = await listExtraPageLinks(pageId);
      setLinks(() => refreshed);
      clearContentEditSnapshot();
      setContentEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.saveBlockContentFailed"));
    } finally {
      setSavingContent(false);
    }
  }

  // handleBlockDataPatch -- pola identik dashboard/links/page.tsx (blok
  // "produk"): PATCH langsung ke updateLink, dipakai ProdukBlockEditor di
  // bawah utk menyimpan pilihan product_ids/layout kreator, dan
  // ListItemsEditor utk blok "list".
  async function handleBlockDataPatch(link: LinkItem, patch: Record<string, unknown>) {
    setError(null);
    const nextBlockData = { ...link.block_data, ...patch };
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: nextBlockData } : l)));
    try {
      await updateLink(link.id, { block_data: nextBlockData });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.addBlock"));
    }
  }

  // handleListItemsPatch -- audit bug 22 September 2026: ListItemsEditor's
  // onUpdateItems SEBELUMNYA memanggil handleBlockDataPatch di atas
  // langsung, yang PATCH ke server TANPA debounce -- field deskripsi item
  // (RichTextEditor) memanggil onChange di SETIAP ketukan, jadi tiap
  // huruf yang diketik kreator = satu PATCH berisi SELURUH array items
  // ke server. Kalau dua request tiba di backend TIDAK berurutan (jitter
  // jaringan), payload yang lebih lama (teks lebih pendek) bisa menimpa
  // balik payload lebih baru -- sebagian ketikan hilang senyap setelah
  // reload. dashboard/links/page.tsx SUDAH punya varian debounce ini
  // (handleListItemsPatch) sejak field deskripsi RichTextEditor
  // ditambahkan ke blok "list" -- Toko sengaja ketinggalan, disamakan di
  // sini APA ADANYA (pola & nama fungsi identik). State lokal (`links`)
  // tetap diperbarui LANGSUNG (optimis) supaya RichTextEditor yang
  // terkontrol tetap responsif -- cuma panggilan API-nya yang ditunda.
  const listItemsSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  function handleListItemsPatch(link: LinkItem, items: ListEditorItem[]) {
    setError(null);
    const nextBlockData = { ...link.block_data, items };
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: nextBlockData } : l)));
    const existing = listItemsSaveTimers.current.get(link.id);
    if (existing) clearTimeout(existing);
    listItemsSaveTimers.current.set(
      link.id,
      setTimeout(() => {
        listItemsSaveTimers.current.delete(link.id);
        updateLink(link.id, { block_data: nextBlockData }).catch((err) => {
          setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.saveBlockContentFailed"));
        });
      }, 700)
    );
  }

  // handleDelete -- audit bug 22 September 2026: tidak rollback saat API
  // gagal, satu-satunya handler di file ini yang lupa menerapkan pola
  // "previous = links; ... catch { setLinks(() => previous) }" yang SUDAH
  // konsisten dipakai 8 handler setara lain (handleToggleActive,
  // handleRemoveIcon, dst) -- omission murni, bukan keputusan desain.
  // Tanpa ini, koneksi terputus/token kedaluwarsa saat hapus blok bikin
  // blok hilang dari UI & live preview meski recordnya masih ada di server,
  // sampai kreator reload manual.
  async function handleDelete(id: string) {
    const previous = links;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteLink(id);
    } catch (err) {
      setLinks(() => previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteBlock"));
    }
  }

  // Handler strip alat kelola -- paritas Toko <-> Links (18 September 2026),
  // disalin dari dashboard/links/page.tsx dgn dua penyesuaian: refresh
  // daftar lewat listExtraPageLinks(pageId) (bukan listLinks halaman
  // utama), dan setLinks di sini HANYA menerima updater (lihat tipe prop
  // BlockSection), jadi rollback ditulis setLinks(() => previous). Semua
  // endpoint (updateLink/uploadLinkIcon/duplicateLink/dst) generik per id
  // blok, tidak peduli blok itu milik halaman utama atau Toko.
  // Mengembalikan daftar terbaru (sejak 24 September 2026) supaya pemanggil
  // seperti handleDuplicate bisa langsung mencari blok barunya tanpa fetch
  // ulang. Pemanggil lama yang mengabaikan nilai kembaliannya tidak berubah.
  async function refreshLinks() {
    const refreshed = await listExtraPageLinks(pageId);
    setLinks(() => refreshed);
    return refreshed;
  }

  async function handleToggleActive(link: LinkItem) {
    const nextActive = !link.is_active;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_active: nextActive } : l)));
    try {
      await updateLink(link.id, { is_active: nextActive });
    } catch (err) {
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_active: link.is_active } : l)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.updateLinkFailed"));
    }
  }

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIconUploadingId(link.id);
    setError(null);
    try {
      const { custom_icon_url } = await uploadLinkIcon(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, custom_icon_url } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadIconFailed"));
    } finally {
      setIconUploadingId(null);
    }
  }

  async function handleRemoveIcon(link: LinkItem) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, custom_icon_url: "", icon_key: "" } : l)));
    try {
      await Promise.all([deleteLinkIcon(link.id), updateLink(link.id, { icon_key: "" })]);
    } catch (err) {
      setLinks(() => previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteIconFailed"));
    }
  }

  async function handleIconColorChange(link: LinkItem, color: string) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, icon_color: color } : l)));
    try {
      await updateLink(link.id, { icon_color: color });
    } catch (err) {
      setLinks(() => previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.changeIconColorFailed"));
    }
  }

  // handleBlockStylePreview/Commit -- desain per blok (migrasi 000110,
  // BlockDesignMenu). Preview mengubah state lokal saja (pratinjau langsung
  // ikut berubah); Commit mengirim PATCH. savedBlockStyles menyimpan nilai
  // terakhir yang dikonfirmasi server per blok, dipakai utk rollback kalau
  // PATCH gagal (preview sudah mengubah `links` sebelum commit).
  const savedBlockStyles = useRef<Map<string, BlockStyle>>(new Map());
  function handleBlockStylePreview(link: LinkItem, style: BlockStyle) {
    if (!savedBlockStyles.current.has(link.id)) savedBlockStyles.current.set(link.id, link.block_style ?? {});
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_style: style } : l)));
  }
  async function handleBlockStyleCommit(link: LinkItem, style: BlockStyle) {
    try {
      await updateLink(link.id, { block_style: style });
      savedBlockStyles.current.set(link.id, style);
    } catch (err) {
      const revert = savedBlockStyles.current.get(link.id) ?? {};
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_style: revert } : l)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.linkCard.blockDesign.saveFailed"));
    }
  }

  // handleButtonStyleChange -- warna tombol / label harga per tautan
  // (migrasi 000109, ButtonStyleMenu). Rollback per-field (hanya field yang
  // diubah dikembalikan), bukan snapshot seluruh `links`, supaya perubahan
  // lain yang terjadi selama request berjalan tidak ikut tertimpa.
  async function handleButtonStyleChange(link: LinkItem, patch: { accent_color?: string; badge_text?: string }) {
    const revert: { accent_color?: string; badge_text?: string } = {};
    if (patch.accent_color !== undefined) revert.accent_color = link.accent_color;
    if (patch.badge_text !== undefined) revert.badge_text = link.badge_text;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, ...patch } : l)));
    try {
      await updateLink(link.id, patch);
    } catch (err) {
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, ...revert } : l)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.changeButtonStyleFailed"));
    }
  }

  async function handleClearIconColor(link: LinkItem) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, icon_color: "" } : l)));
    try {
      await updateLink(link.id, { icon_color: "" });
    } catch (err) {
      setLinks(() => previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.resetIconColorFailed"));
    }
  }

  async function handleSelectLibraryIcon(link: LinkItem, key: string) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, icon_key: key, custom_icon_url: "" } : l)));
    setIconPickerLinkId(null);
    try {
      await updateLink(link.id, { icon_key: key });
      if (link.custom_icon_url) {
        await deleteLinkIcon(link.id);
      }
    } catch (err) {
      setLinks(() => previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.selectIconFailed"));
    }
  }

  async function handleToggleFeatured(link: LinkItem) {
    const nextFeatured = !link.is_featured;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_featured: nextFeatured } : l)));
    try {
      await updateLink(link.id, { is_featured: nextFeatured });
      await refreshLinks();
    } catch (err) {
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_featured: link.is_featured } : l)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.updateLinkFailed"));
    }
  }

  async function handleThumbnailUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setThumbnailUploadingId(link.id);
    setError(null);
    try {
      const { thumbnail_url } = await uploadLinkThumbnail(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, thumbnail_url, is_featured: true } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadThumbnailFailed"));
    } finally {
      setThumbnailUploadingId(null);
    }
  }

  async function handleRemoveThumbnail(link: LinkItem) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, thumbnail_url: "", is_featured: false } : l)));
    try {
      await deleteLinkThumbnail(link.id);
    } catch (err) {
      setLinks(() => previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteThumbnailFailed"));
    }
  }

  function startEditField(link: LinkItem, field: "title" | "url" | "description") {
    setEditingField({ id: link.id, field });
    setEditingValue(field === "title" ? link.title : field === "url" ? link.url : link.description);
  }

  async function saveEditField(link: LinkItem) {
    if (!editingField || editingField.id !== link.id) return;
    const field = editingField.field;
    const value = editingValue.trim();
    setEditingField(null);
    const currentValue = field === "title" ? link.title : field === "url" ? link.url : link.description;
    const urlOptionalForThisBlock = field === "url" && link.block_type === "image";
    if (field !== "description" && !urlOptionalForThisBlock && !value) return;
    if (value === currentValue) return;
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, [field]: value } : l)));
    try {
      await updateLink(link.id, field === "title" ? { title: value } : field === "url" ? { url: value } : { description: value });
    } catch (err) {
      setLinks(() => previous);
      setError(
        err instanceof ApiError
          ? err.message
          : t("dashboard.pages.links.errors.updateFieldFailed").replace(
              "{field}",
              field === "title"
                ? t("dashboard.pages.links.fieldNames.title")
                : field === "url"
                  ? t("dashboard.pages.links.fieldNames.url")
                  : t("dashboard.pages.links.fieldNames.description")
            )
      );
    }
  }

  function openScheduleForm(link: LinkItem) {
    setScheduleEditId(link.id);
    setScheduleStart(link.starts_at ? link.starts_at.slice(0, 16) : "");
    setScheduleEnd(link.ends_at ? link.ends_at.slice(0, 16) : "");
  }

  async function handleSaveSchedule(link: LinkItem) {
    if (!scheduleStart || !scheduleEnd) {
      setError(t("dashboard.pages.links.errors.scheduleRequired"));
      return;
    }
    const startsAt = new Date(scheduleStart).toISOString();
    const endsAt = new Date(scheduleEnd).toISOString();
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError(t("dashboard.pages.links.errors.scheduleEndAfterStart"));
      return;
    }
    setError(null);
    setSavingSchedule(true);
    try {
      await updateLink(link.id, { starts_at: startsAt, ends_at: endsAt });
      await refreshLinks();
      setScheduleEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.scheduleFailed"));
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleClearSchedule(link: LinkItem) {
    setError(null);
    try {
      await updateLink(link.id, { clear_schedule: true });
      await refreshLinks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.cancelScheduleFailed"));
    }
  }

  function openLockForm(link: LinkItem) {
    setLockEditId(link.id);
    setLockTypeInput(link.lock_type || "code");
    setLockCodeInput(link.lock_code || "");
    setLockMinAgeInput(link.lock_min_age ? String(link.lock_min_age) : "18");
  }

  async function handleSaveLock(link: LinkItem) {
    if (lockTypeInput === "code" && !lockCodeInput.trim()) {
      setError(t("dashboard.pages.links.errors.lockCodeRequired"));
      return;
    }
    if (lockTypeInput === "age" && (!lockMinAgeInput || Number(lockMinAgeInput) < 13)) {
      setError(t("dashboard.pages.links.errors.lockMinAge"));
      return;
    }
    setError(null);
    setSavingLock(true);
    try {
      await updateLink(link.id, {
        lock_type: lockTypeInput,
        lock_code: lockTypeInput === "code" ? lockCodeInput.trim() : undefined,
        lock_min_age: lockTypeInput === "age" ? Number(lockMinAgeInput) : undefined,
      });
      await refreshLinks();
      setLockEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.lockLinkFailed"));
    } finally {
      setSavingLock(false);
    }
  }

  async function handleClearLock(link: LinkItem) {
    setError(null);
    try {
      await updateLink(link.id, { clear_lock: true });
      await refreshLinks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.unlockLinkFailed"));
    }
  }

  async function handleToggleSensitive(link: LinkItem) {
    setError(null);
    try {
      if (link.lock_type === "sensitive") {
        await updateLink(link.id, { clear_lock: true });
      } else {
        await updateLink(link.id, { lock_type: "sensitive" });
      }
      await refreshLinks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.markSensitiveFailed"));
    }
  }

  async function handleDuplicate(link: LinkItem) {
    setError(null);
    try {
      const { id: newId } = await duplicateLink(link.id);
      const refreshed = await refreshLinks();
      // Buka panel hasil duplikatnya -- drift diperbaiki 24 September 2026
      // (audit kualitas kode). Simple Mode (links/page.tsx handleDuplicate)
      // sudah melakukan ini sejak perbaikan 21 September ("SEBELUMNYA
      // pengguna harus kembali ke daftar & cari sendiri salinannya, tanpa
      // penanda pembeda"), tapi perbaikan itu tidak pernah diport ke sini:
      // di Toko salinannya muncul di daftar tanpa panel terbuka dan tanpa
      // penanda mana yang baru -- kreator harus menyisir dua baris berjudul
      // sama sendiri. openContentEdit sudah ada di file ini (identik dengan
      // versi Simple Mode), jadi ini murni port.
      const duplicated = refreshed.find((l) => l.id === newId);
      if (duplicated) openContentEdit(duplicated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.duplicateFailed"));
    }
  }

  // moveLinkByOffset -- alternatif keyboard utk drag-reorder (tombol ▲/▼),
  // sama seperti dashboard/links/page.tsx; simpan urutan lewat endpoint
  // reorder halaman tambahan yang sudah dipakai handleDrop di bawah.
  function moveLinkByOffset(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= links.length) return;
    const reordered = [...links];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(to, 0, moved);
    const withPositions = reordered.map((l, idx) => ({ ...l, position: idx }));
    setLinks(() => withPositions);
    reorderExtraPageLinks(
      pageId,
      withPositions.map((l) => ({ id: l.id, position: l.position }))
    ).catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.saveOrder")));
  }

  // handleDrop -- audit bug 22 September 2026: SEBELUMNYA memanggil
  // reorderExtraPageLinks (side effect API) DI DALAM body updater
  // setLinks, melanggar kontrak React "updater harus pure". reactStrictMode
  // (next.config.js) sengaja memanggil updater DUA KALI di development
  // utk mendeteksi persis pola ini -- satu drag-reorder memicu 2x PATCH.
  // Payloadnya idempoten (posisi akhir sama) jadi tidak ada data yang
  // salah, tapi tetap PATCH ganda percuma & pola berbahaya (kelas bug yang
  // sama pernah jadi crash sungguhan di Canvas Builder -- lihat riwayat
  // proyek). moveLinkByOffset di atas SUDAH benar (hitung di luar,
  // setLinks(() => value) baru API terpisah) -- disamakan persis di sini.
  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = links.findIndex((l) => l.id === dragId);
    const to = links.findIndex((l) => l.id === targetId);
    setDragId(null);
    if (from === -1 || to === -1) return;
    const reordered = [...links];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withPositions = reordered.map((l, idx) => ({ ...l, position: idx }));
    setLinks(() => withPositions);
    reorderExtraPageLinks(
      pageId,
      withPositions.map((l) => ({ id: l.id, position: l.position }))
    ).catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.saveOrder")));
  }

  // drilldownLink -- blok "catalog"/"faq" yang sedang dibuka penuh layar
  // lewat BlockDrilldownEditor, MENGGANTIKAN seluruh daftar blok di bawah
  // (pola sama persis dashboard/links/page.tsx).
  const drilldownLink = drilldownBlockId ? links.find((l) => l.id === drilldownBlockId) ?? null : null;
  if (drilldownLink) {
    return (
      <BlockDrilldownEditor
        link={drilldownLink}
        // isPremium -- audit bug 22 September 2026: hardcode `false`
        // membuat "Katalog di dalam Katalog" (satu-satunya tile
        // premium-only, lihat lib/catalog-blocks.ts) SELALU terkunci di
        // Toko apa pun status akun -- kreator Premium yang sudah bayar
        // tetap diarahkan ke upsell tiap edit Katalog/FAQ di sini, padahal
        // fitur yang sama terbuka normal di halaman Bio (yang sudah pakai
        // page?.is_premium ?? false, dashboard/links/page.tsx). Backend
        // (checkCatalogPremiumGate) SUDAH benar memvalidasi terlepas dari
        // ini -- bukan celah keamanan, murni bug UX/fitur berbayar. Prop
        // `isPremium` diteruskan dari page.is_premium milik
        // ProdukPageEditor (lihat catatan di signature BlockSection).
        isPremium={isPremium}
        products={products}
        onProductCreated={onProductCreated}
        onCommitCatalogRoot={(items) => saveCatalogItems(drilldownLink, items)}
        onSaveFaqItems={(items) => handleSaveFaqItems(drilldownLink, items)}
        onExit={() => setDrilldownBlockId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="glass rounded-jmd p-5 shadow-card">
        {!adding ? (
          <button
            type="button"
            onClick={() => {
              setAddCategory("populer");
              setAddSearch("");
              setAddModalOpen(true);
            }}
            className="flex items-center gap-2 text-sm font-bold text-jeon-purple hover:underline"
          >
            <IconPlus className="h-4 w-4" />
            {t("dashboard.components.produkPageEditor.addBlockButton")}
          </button>
        ) : (
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <FormField
              label={
                blockType === "link"
                  ? t("dashboard.components.produkPageEditor.blockForm.titleLabel")
                  : t("dashboard.components.produkPageEditor.blockForm.blockTitleLabel")
              }
              // judul tautan wajib (backend), judul blok opsional kecuali Katalog
              optional={blockType !== "link" && blockType !== "catalog"}
              hint={
                blockType === "link"
                  ? t("dashboard.components.produkPageEditor.blockForm.titleHintLink")
                  : blockType === "text"
                  ? t("dashboard.components.produkPageEditor.blockForm.titleHintText")
                  : blockType === "accordion"
                  ? t("dashboard.components.produkPageEditor.blockForm.titleHintAccordion")
                  : undefined
              }
            >
              <input
                type="text"
                required={blockType === "catalog"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("dashboard.components.produkPageEditor.blockForm.titlePlaceholder")}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
              />
            </FormField>

            {blockType === "link" && (
              <FormField
                label={t("dashboard.components.produkPageEditor.blockForm.urlLabel")}
                hint={t("dashboard.components.produkPageEditor.blockForm.urlHint")}
              >
                <input
                  type="url"
                  required
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                />
              </FormField>
            )}
            {blockType === "video" && (
              <VideoSourceField
                source={videoSource}
                onSourceChange={setVideoSource}
                url={videoUrl}
                onUrlChange={setVideoUrl}
                urlInputClassName="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                linkId={null}
              />
            )}
            {blockType === "maps" && (
              <>
                <FormField label={t("dashboard.components.produkPageEditor.blockForm.mapsUrlLabel")}>
                  <input
                    type="url"
                    required
                    value={mapsUrl}
                    onChange={(e) => setMapsUrl(e.target.value)}
                    placeholder={t("dashboard.components.produkPageEditor.blockForm.mapsUrlLabel")}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <label className="flex items-center gap-2 text-xs font-semibold text-app-ink">
                  <input type="checkbox" checked={mapsEmbed} onChange={(e) => setMapsEmbed(e.target.checked)} />
                  {t("dashboard.components.produkPageEditor.blockForm.mapsEmbedCheckbox")}
                </label>
              </>
            )}
            {blockType === "text" && (
              <FormField label={t("dashboard.components.produkPageEditor.blockForm.textLabel")}>
                <RichTextEditor html={text} onChange={setText} />
              </FormField>
            )}
            {blockType === "accordion" && (
              <FormField label={t("dashboard.components.produkPageEditor.blockForm.accordionTextLabel")}>
                <RichTextEditor html={accordionText} onChange={setAccordionText} />
              </FormField>
            )}
            {blockType === "faq" && (
              <div className="flex flex-col gap-2">
                {faqItems.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5 rounded-lg border border-app-border p-2.5">
                    <FormField label={t("dashboard.components.produkPageEditor.blockForm.faqQuestionLabel").replace("{index}", String(idx + 1))}>
                      <input
                        type="text"
                        value={item.question}
                        onChange={(e) => setFaqItems((prev) => prev.map((it, i) => (i === idx ? { ...it, question: e.target.value } : it)))}
                        placeholder={t("dashboard.components.produkPageEditor.blockForm.faqQuestionPlaceholder")}
                        className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.components.produkPageEditor.blockForm.faqAnswerLabel")}>
                      <RichTextEditor
                        html={item.answer}
                        onChange={(value) => setFaqItems((prev) => prev.map((it, i) => (i === idx ? { ...it, answer: value } : it)))}
                      />
                    </FormField>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFaqItems((prev) => [...prev, { question: "", answer: "" }])}
                  className="self-start text-xs font-semibold text-jeon-purple hover:underline"
                >
                  {t("dashboard.components.produkPageEditor.blockForm.addFaqQuestion")}
                </button>
              </div>
            )}
            {blockType === "contact_form" && (
              <p className="text-xs text-app-muted">{t("dashboard.components.produkPageEditor.blockForm.contactFormHint")}</p>
            )}
            {(blockType === "gallery" || blockType === "audio" || blockType === "file" || blockType === "produk") && (
              <p className="text-xs text-app-muted">
                {blockType === "gallery"
                  ? t("dashboard.components.produkPageEditor.blockForm.galleryHint")
                  : blockType === "audio"
                  ? t("dashboard.components.produkPageEditor.blockForm.audioHint")
                  : blockType === "file"
                  ? t("dashboard.components.produkPageEditor.blockForm.fileHint")
                  : t("dashboard.components.produkPageEditor.blockForm.produkHint")}
              </p>
            )}

            {/* 10 tipe blok baru (susulan 15 September 2026) -- form field
                pakai i18n dashboard.pages.links.blockForm.* (lihat catatan
                namespace di getContentTiles). */}
            {blockType === "project_showcase" && (
              <div className="flex flex-col gap-2">
                <FormField label={t("dashboard.pages.links.blockForm.showcase.badgeLabel")} hint={t("dashboard.pages.links.blockForm.showcase.badgeHint")}>
                  <input
                    type="text"
                    placeholder={t("dashboard.pages.links.blockForm.showcase.badgePlaceholder")}
                    value={showcaseBadge}
                    onChange={(e) => setShowcaseBadge(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.showcase.descriptionLabel")} hint={t("dashboard.pages.links.blockForm.showcase.descriptionHint")}>
                  <RichTextEditor html={showcaseDescription} onChange={setShowcaseDescription} />
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.showcase.ctaUrlLabel")} hint={t("dashboard.pages.links.blockForm.showcase.ctaUrlHint")}>
                  <input
                    type="url"
                    required
                    placeholder="https://..."
                    value={showcaseUrl}
                    onChange={(e) => setShowcaseUrl(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.showcase.ctaTextLabel")} hint={t("dashboard.pages.links.blockForm.showcase.ctaTextHint")}>
                  <input
                    type="text"
                    placeholder={t("dashboard.pages.links.blockForm.showcase.ctaTextPlaceholder")}
                    value={showcaseCta}
                    onChange={(e) => setShowcaseCta(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <p className="text-xs text-app-muted">{t("dashboard.pages.links.blockForm.uploadHints.image")}</p>
              </div>
            )}
            {blockType === "button" && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-1.5">
                  {(["url", "whatsapp"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setButtonMode(mode)}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                        buttonMode === mode ? "bg-jeon-sidebar text-white" : "bg-gray-100 text-app-muted hover:bg-gray-200"
                      }`}
                    >
                      {mode === "url" ? t("dashboard.pages.links.blockForm.button.modeUrl") : t("dashboard.pages.links.blockForm.button.modeWhatsapp")}
                    </button>
                  ))}
                </div>
                {buttonMode === "whatsapp" ? (
                  <>
                    <FormField label={t("dashboard.pages.links.blockForm.button.whatsappNumberLabel")}>
                      <input
                        type="tel"
                        required
                        placeholder={t("dashboard.pages.links.blockForm.button.whatsappNumberPlaceholder")}
                        value={buttonWhatsappNumber}
                        onChange={(e) => setButtonWhatsappNumber(e.target.value)}
                        className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.pages.links.blockForm.button.whatsappMessageLabel")}>
                      <textarea
                        placeholder={t("dashboard.pages.links.blockForm.button.whatsappMessagePlaceholder")}
                        value={buttonWhatsappMessage}
                        onChange={(e) => setButtonWhatsappMessage(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <p className="text-[11px] text-app-muted">{t("dashboard.pages.links.blockForm.button.whatsappHint")}</p>
                  </>
                ) : (
                  <FormField label={t("dashboard.pages.links.blockForm.button.urlLabel")}>
                    <input
                      type="url"
                      required
                      placeholder="https://..."
                      value={buttonUrl}
                      onChange={(e) => setButtonUrl(e.target.value)}
                      className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                    />
                  </FormField>
                )}
              </div>
            )}
            {blockType === "countdown" && (
              <div className="flex flex-col gap-3">
                <FormField label={t("dashboard.pages.links.blockForm.countdown.targetLabel")}>
                  <input
                    type="datetime-local"
                    required
                    value={countdownTargetAt}
                    onChange={(e) => setCountdownTargetAt(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.countdown.productLabel")} hint={t("dashboard.pages.links.blockForm.countdown.productHint")}>
                  <select
                    value={countdownProductId}
                    onChange={(e) => setCountdownProductId(e.target.value)}
                    className="bg-app-surface text-app-ink w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  >
                    <option value="">{t("dashboard.pages.links.blockForm.countdown.noProduct")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                {!countdownProductId && (
                  <>
                    <FormField label={t("dashboard.pages.links.blockForm.countdown.ctaLabelLabel")}>
                      <input
                        type="text"
                        placeholder={t("dashboard.pages.links.blockForm.countdown.ctaLabelPlaceholder")}
                        value={countdownCtaLabel}
                        onChange={(e) => setCountdownCtaLabel(e.target.value)}
                        className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.pages.links.blockForm.countdown.ctaUrlLabel")}>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={countdownCtaUrl}
                        onChange={(e) => setCountdownCtaUrl(e.target.value)}
                        className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                  </>
                )}
              </div>
            )}
            {blockType === "embed" && (
              <FormField label={t("dashboard.pages.links.blockForm.embed.urlLabel")} hint={t("dashboard.pages.links.blockForm.embed.urlHint")}>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={embedUrl}
                  onChange={(e) => setEmbedUrl(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                />
              </FormField>
            )}
            {blockType === "video_image" && (
              <>
                <FormField label={t("dashboard.pages.links.blockForm.video.label")} hint={t("dashboard.pages.links.blockForm.videoImage.videoUrlHint")}>
                  <input
                    type="url"
                    placeholder={t("dashboard.pages.links.blockForm.video.placeholder")}
                    value={videoImageVideoUrl}
                    onChange={(e) => setVideoImageVideoUrl(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <p className="text-xs text-app-muted">{t("dashboard.pages.links.blockForm.uploadHints.videoImage")}</p>
              </>
            )}
            {blockType === "image_slider" && <p className="text-xs text-app-muted">{t("dashboard.pages.links.blockForm.uploadHints.imageSlider")}</p>}
            {blockType === "image" && <p className="text-xs text-app-muted">{t("dashboard.pages.links.blockForm.uploadHints.image")}</p>}
            {blockType === "catalog" && <p className="text-xs text-app-muted">{t("dashboard.pages.links.blockForm.uploadHints.catalog")}</p>}
            {blockType === "embed_link" && (
              <div className="flex flex-col gap-2">
                <FormField label={t("dashboard.pages.links.blockForm.embedLink.urlLabel")}>
                  <input
                    type="url"
                    required
                    placeholder="https://..."
                    value={embedLinkUrl}
                    onChange={(e) => setEmbedLinkUrl(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.embedLink.descriptionLabel")}>
                  <RichTextEditor html={embedLinkDescription} onChange={setEmbedLinkDescription} />
                </FormField>
                <p className="text-xs text-app-muted">{t("dashboard.pages.links.blockForm.uploadHints.embedLink")}</p>
              </div>
            )}
            {blockType === "list" && (
              <FormField label={t("dashboard.pages.links.blockForm.list.itemsLabel")}>
                <ListItemsEditor
                  style={listStyle}
                  items={listItems}
                  onUpdateStyle={setListStyle}
                  onUpdateItems={(items) =>
                    setListItems(items.map((it) => ({ title: it.title, description: it.description ?? "", author: it.author ?? "", url: it.url ?? "" })))
                  }
                />
              </FormField>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  resetForm();
                }}
                className="flex-1 rounded-lg border-2 border-jeon-ink py-2 text-xs font-bold text-app-muted hover:border-ink/30"
              >
                {t("dashboard.components.produkPageEditor.blockForm.cancel")}
              </button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60">
                {saving ? t("dashboard.components.produkPageEditor.blockForm.saving") : t("dashboard.components.produkPageEditor.blockForm.add")}
              </button>
            </div>
          </form>
        )}
      </section>

      {addModalOpen && (
        <AddLinkModal
          category={addCategory}
          onCategoryChange={setAddCategory}
          search={addSearch}
          onSearchChange={setAddSearch}
          onClose={() => setAddModalOpen(false)}
          onSelectPlatform={handleSelectPlatform}
          onSelectContentTile={handleSelectContentTile}
          onQuickPasteLink={(url) => {
            setBlockType("link");
            setTitle("");
            setLinkUrl(url);
            setAdding(true);
            setAddModalOpen(false);
          }}
          contentTiles={CONTENT_TILES}
        />
      )}

      <div className="flex flex-col gap-2">
        {links.length === 0 && (
          <p className="text-center text-xs text-app-muted">{t("dashboard.components.produkPageEditor.blockForm.emptyState")}</p>
        )}
        {links.map((link, index) => (
          <div
            key={link.id}
            draggable
            onDragStart={() => setDragId(link.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(link.id)}
            // Kulit kartu SAMA PERSIS dashboard/links/page.tsx (redesain baris
            // blok 18 September 2026, referensi gambar pengguna) -- lihat
            // catatan di sana.
            className={`group flex flex-col gap-3 rounded-[22px] border border-app-border bg-app-surface p-3 transition-colors sm:p-4 ${link.is_active ? "" : "opacity-60"}`}
          >
            {/* Baris header blok -- paritas Toko <-> Links (permintaan
                langsung pengguna, 18 September 2026: "buat tiap blok yang
                ada di page store itu disamakan seperti di links ada tombol
                pengaturan nya terus kalo mau edit di klik dulu blok nya
                biar muncul data datanya"). Markup, urutan kontrol, &
                alasan tiap stopPropagation SAMA PERSIS dashboard/links/
                page.tsx (lihat catatan lengkap di sana): ▲▼/grip, badge
                ikon, judul inline-edit, baris ringkasan, chip klik,
                chevron isi, tombol Kelola (gear), sakelar aktif. Tombol
                hapus yang dulu ada di header PINDAH ke strip alat kelola
                (dengan dialog konfirmasi, bukan langsung hapus). */}
            <div
              onClick={() => {
                if (!isBlockExpandable(link, t)) return;
                if (link.block_type === "catalog" || link.block_type === "faq") {
                  setDrilldownBlockId(link.id);
                } else {
                  toggleContentEdit(link);
                }
              }}
              className={`relative flex items-center gap-3 ${isBlockExpandable(link, t) ? "cursor-pointer" : ""}`}
            >
              {/* Grip drag hover-only + tombol ▲/▼ pindah ke BlockToolsStrip
                  (menu ⋮) -- redesain 18 September 2026, sama Links. */}
              <IconGripVertical className="absolute -left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 cursor-grab text-app-muted opacity-0 transition-opacity group-hover:opacity-60" />
              {/* Badge ikon -- urutan resolusi sama Links: custom_icon_url >
                  icon_key galeri > deteksi platform dari URL (tautan biasa)
                  > ikon tipe blok (dari CONTENT_TILES, peta ikon yang sama
                  dipakai modal Tambah di sini). Tile 48px (redesain 18
                  September 2026): platform terdeteksi = warna mereknya,
                  selain itu tile putih bergaris (BLOCK_TILE_CLASS). */}
              {link.custom_icon_url ? (
                <Image
                  src={link.custom_icon_url}
                  alt=""
                  title={t("dashboard.pages.links.linkCard.customIcon")}
                  width={48}
                  height={48}
                  className="h-12 w-12 flex-shrink-0 rounded-2xl object-cover ring-1 ring-black/5"
                />
              ) : link.icon_key && getLibraryIcon(link.icon_key) ? (
                (() => {
                  const libraryIcon = getLibraryIcon(link.icon_key)!;
                  const tileColor = libraryIconColor(link.icon_key, link.icon_color);
                  return (
                    <span title={libraryIcon.label} className={BLOCK_TILE_CLASS} style={tileColor ? { color: tileColor } : undefined}>
                      <libraryIcon.Icon className="h-5 w-5" />
                    </span>
                  );
                })()
              ) : link.block_type === "link" ? (
                (() => {
                  const { Icon, label, badgeClass, isFallback } = detectLinkIcon(link.url);
                  return (
                    <span
                      title={label}
                      className={isFallback ? BLOCK_TILE_CLASS : `flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ring-1 ring-black/5 ${badgeClass}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                  );
                })()
              ) : (
                (() => {
                  const TypeIcon = CONTENT_TILES.find((tile) => tile.key === link.block_type)?.Icon ?? LayoutGrid;
                  return (
                    <span title={BLOCK_LABEL[link.block_type] ?? link.block_type} className={BLOCK_TILE_CLASS}>
                      <TypeIcon className="h-5 w-5" />
                    </span>
                  );
                })()
              )}
              <div className="min-w-0 flex-1">
                {editingField?.id === link.id && editingField.field === "title" ? (
                  <input
                    type="text"
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={() => saveEditField(link)}
                    onKeyDown={(e) => e.key === "Enter" && saveEditField(link)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded-md border border-jeon-purple px-2 py-1 text-sm font-bold text-app-ink focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    {/* Fallback label tipe blok -- permintaan langsung
                        pengguna, 19 September 2026 ("judul blok juga itu
                        optional untuk bisa ditampilkan"), disamakan dgn
                        dashboard/links/page.tsx -- `BLOCK_LABEL` sudah ada
                        di file ini (dipakai tile "Tambah Blok"), TIDAK
                        PERNAH dipakai di rendering halaman publik. */}
                    <p className="truncate text-[15px] font-bold leading-snug text-app-ink">{link.title || BLOCK_LABEL[link.block_type] || link.block_type}</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditField(link, "title");
                      }}
                      className="flex-shrink-0 p-1 text-app-muted opacity-0 transition-opacity hover:text-jeon-purple focus:opacity-100 group-hover:opacity-100"
                      title={t("dashboard.pages.links.linkCard.editTitle")}
                    >
                      <IconPencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {/* Subjudul "n klik · domain/ringkasan" -- sama persis Links
                    (lihat catatan di sana); tiap bagian <span> terpisah. */}
                {(() => {
                  const parts: string[] = [];
                  if (showsClickCount(link)) {
                    parts.push(t("dashboard.pages.links.linkCard.clicksCount").replace("{n}", link.click_count.toLocaleString("id-ID")));
                  }
                  if (link.block_type === "link") {
                    const host = linkHostname(link.url);
                    if (host) parts.push(host);
                  } else if (contentEditId !== link.id) {
                    const preview = blockPreviewFor(link, t);
                    if (preview) parts.push(preview);
                  }
                  if (parts.length === 0) return null;
                  return (
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-app-muted">
                      {parts.flatMap((part, i) => [
                        i > 0 ? (
                          <span key={`sep-${i}`} aria-hidden className="opacity-50">
                            ·
                          </span>
                        ) : null,
                        <span key={`part-${i}`} className={i === parts.length - 1 ? "truncate" : "flex-shrink-0 tabular-nums"}>
                          {part}
                        </span>,
                      ])}
                    </p>
                  );
                })()}
              </div>
              {isBlockExpandable(link, t) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (link.block_type === "catalog" || link.block_type === "faq") {
                      setDrilldownBlockId(link.id);
                    } else {
                      toggleContentEdit(link);
                    }
                  }}
                  aria-expanded={contentEditId === link.id}
                  title={link.block_type === "link" ? t("dashboard.pages.links.linkCard.editLinkDetails") : t("dashboard.pages.links.linkCard.editContent")}
                  className={`hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors sm:flex ${
                    contentEditId === link.id ? "bg-jeon-purple/10 text-jeon-purple" : "text-app-muted hover:bg-app-surface-2 hover:text-app-ink"
                  }`}
                >
                  <IconChevronRight className={`h-4 w-4 transition-transform ${contentEditId === link.id ? "rotate-90" : ""}`} />
                </button>
              )}
              <div onClick={(e) => e.stopPropagation()}>
                <Toggle checked={link.is_active} onChange={() => handleToggleActive(link)} label={t("dashboard.pages.links.linkCard.activateLabel").replace("{title}", link.title)} />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setToolsOpenId((v) => (v === link.id ? null : link.id));
                  setToolsTab("tools");
                }}
                aria-expanded={toolsOpenId === link.id}
                title={t("dashboard.pages.links.linkCard.manageTools")}
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                  toolsOpenId === link.id ? "bg-jeon-purple/10 text-jeon-purple" : "text-app-ink hover:bg-app-surface-2"
                }`}
              >
                <IconDotsVertical className="h-5 w-5" />
              </button>
            </div>

            {(link.block_type === "image" || (link.block_type === "link" && contentEditId === link.id)) && (
              <div className="sm:ml-[60px] flex items-center gap-1.5">
                {editingField?.id === link.id && editingField.field === "url" ? (
                  <input
                    type="url"
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={() => saveEditField(link)}
                    onKeyDown={(e) => e.key === "Enter" && saveEditField(link)}
                    placeholder={link.block_type === "image" ? t("dashboard.pages.links.linkCard.imageLinkPlaceholder") : undefined}
                    className="w-full rounded-md border border-jeon-purple px-2 py-1 text-xs text-app-muted focus:outline-none"
                  />
                ) : link.url ? (
                  <>
                    <p className="truncate text-xs text-app-muted">{link.url}</p>
                    <button type="button" onClick={() => startEditField(link, "url")} className="flex-shrink-0 p-1 text-app-muted hover:text-jeon-purple" title={t("dashboard.pages.links.linkCard.editUrl")}>
                      <IconPencil className="h-3 w-3" />
                    </button>
                  </>
                ) : link.block_type === "image" ? (
                  <button type="button" onClick={() => startEditField(link, "url")} className="text-[11px] font-semibold text-jeon-purple hover:underline">
                    {t("dashboard.pages.links.linkCard.addImageLink")}
                  </button>
                ) : null}
              </div>
            )}

            {link.block_type === "link" && contentEditId === link.id && (
              <div className="sm:ml-[60px] flex items-center gap-1.5">
                {editingField?.id === link.id && editingField.field === "description" ? (
                  <input
                    type="text"
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={() => saveEditField(link)}
                    onKeyDown={(e) => e.key === "Enter" && saveEditField(link)}
                    maxLength={240}
                    placeholder={t("dashboard.pages.links.linkCard.descriptionPlaceholder")}
                    className="w-full rounded-md border border-jeon-purple px-2 py-1 text-xs text-app-muted focus:outline-none"
                  />
                ) : (
                  <>
                    <p className="truncate text-xs italic text-app-muted">{link.description || t("dashboard.pages.links.linkCard.noDescription")}</p>
                    <button
                      type="button"
                      onClick={() => startEditField(link, "description")}
                      className="flex-shrink-0 p-1 text-app-muted hover:text-jeon-purple"
                      title={t("dashboard.pages.links.linkCard.editDescription")}
                    >
                      <IconPencil className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Strip alat kelola -- komponen bersama BlockToolsStrip.tsx
                (berlabel, sama persis dgn Links); gerbang per tipe & alasannya
                ada di komponen itu. */}
            {toolsOpenId === link.id && (
              <div className="sm:ml-[60px] flex flex-col gap-2">
                <div role="tablist" aria-label={t("dashboard.pages.links.contentEditorPage.tabsLabel")} className="flex gap-1 self-start rounded-full border border-app-border p-0.5">
                  {(["tools", "design"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={toolsTab === tab}
                      onClick={() => setToolsTab(tab)}
                      className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${toolsTab === tab ? "bg-[#111111] text-white" : "text-app-ink hover:bg-app-surface-2"}`}
                    >
                      {t(`dashboard.pages.links.contentEditorPage.tab${tab === "tools" ? "Tools" : "Design"}`)}
                    </button>
                  ))}
                </div>
                {toolsTab === "tools" ? (
                  <BlockToolsStrip
                    link={link}
                    className=""
                    iconUploading={iconUploadingId === link.id}
                    onMoveUp={() => moveLinkByOffset(index, -1)}
                    onMoveDown={() => moveLinkByOffset(index, 1)}
                    canMoveUp={index > 0}
                    canMoveDown={index < links.length - 1}
                    onSchedule={() => openScheduleForm(link)}
                    onLock={() => openLockForm(link)}
                    onToggleSensitive={() => handleToggleSensitive(link)}
                    onIconUpload={(e) => handleIconUpload(e, link)}
                    onOpenIconGallery={() => setIconPickerLinkId(link.id)}
                    onIconColorChange={(color) => handleIconColorChange(link, color)}
                    onClearIconColor={() => handleClearIconColor(link)}
                    onRemoveIcon={() => handleRemoveIcon(link)}
                    onToggleFeatured={() => handleToggleFeatured(link)}
                    onDuplicate={() => handleDuplicate(link)}
                    onDelete={() => setConfirmDeleteId(link.id)}
                  />
                ) : (
                  <div role="tabpanel" className="flex flex-col gap-5 rounded-lg border border-app-border bg-app-surface p-3">
                    {link.block_type === "link" && (
                      <section className="flex flex-col gap-3 border-b border-app-border pb-5">
                        <h3 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.links.linkCard.buttonStyle.trigger")}</h3>
                        <ButtonStyleMenu inline link={link} chipClassName="" activeClassName="" idleClassName="" onChange={(patch) => handleButtonStyleChange(link, patch)} />
                      </section>
                    )}
                    <BlockDesignMenu
                      inline
                      link={link}
                      chipClassName=""
                      activeClassName=""
                      idleClassName=""
                      onPreview={(style) => handleBlockStylePreview(link, style)}
                      onCommit={(style) => handleBlockStyleCommit(link, style)}
                    />
                  </div>
                )}
              </div>
            )}

            {link.block_type === "link" && link.is_featured && (
              <div className="sm:ml-[60px] flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                {link.thumbnail_url ? (
                  // Ukuran TETAP 96x56 (w-24 h-14).
                  <Image src={link.thumbnail_url} alt="" width={96} height={56} className="h-14 w-24 flex-shrink-0 rounded-md object-cover ring-1 ring-black/5" />
                ) : (
                  <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-app-border text-[10px] text-app-muted">
                    {t("dashboard.pages.links.common.noneYet")}
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-[11px] text-app-muted">
                    {link.thumbnail_url ? t("dashboard.pages.links.featuredPanel.hasThumbnail") : t("dashboard.pages.links.featuredPanel.noThumbnail")}
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                      {thumbnailUploadingId === link.id
                        ? t("dashboard.pages.links.common.uploading")
                        : link.thumbnail_url
                          ? t("dashboard.pages.links.featuredPanel.changeThumbnail")
                          : t("dashboard.pages.links.featuredPanel.uploadThumbnail")}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={(e) => handleThumbnailUpload(e, link)}
                        disabled={thumbnailUploadingId === link.id}
                        className="hidden"
                      />
                    </label>
                    {link.thumbnail_url && (
                      <button type="button" onClick={() => handleRemoveThumbnail(link)} className="text-[11px] font-semibold text-red-600 hover:underline">
                        {t("dashboard.pages.links.common.delete")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {scheduleEditId === link.id ? (
              <div className="sm:ml-[60px] flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <div className="flex gap-1.5">
                  <FormField label={t("dashboard.pages.links.schedulePanel.startLabel")}>
                    <input
                      type="datetime-local"
                      value={scheduleStart}
                      onChange={(e) => setScheduleStart(e.target.value)}
                      className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    />
                  </FormField>
                  <FormField label={t("dashboard.pages.links.schedulePanel.endLabel")}>
                    <input
                      type="datetime-local"
                      value={scheduleEnd}
                      onChange={(e) => setScheduleEnd(e.target.value)}
                      className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    />
                  </FormField>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setScheduleEditId(null)} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
                    {t("dashboard.pages.links.common.cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={savingSchedule}
                    onClick={() => handleSaveSchedule(link)}
                    className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                  >
                    {savingSchedule ? t("dashboard.pages.links.common.saving") : t("dashboard.pages.links.common.save")}
                  </button>
                </div>
              </div>
            ) : (
              link.starts_at &&
              link.ends_at && (
                <div className="sm:ml-[60px] flex items-center justify-between rounded-lg bg-jeon-warning/15 px-2.5 py-1.5">
                  <span className="text-[11px] font-semibold text-jeon-warning">
                    {t("dashboard.pages.links.schedulePanel.scheduledLabel")} {new Date(link.starts_at).toLocaleString("id-ID")} {t("dashboard.pages.links.schedulePanel.until")}{" "}
                    {new Date(link.ends_at).toLocaleString("id-ID")}
                  </span>
                  <button type="button" onClick={() => handleClearSchedule(link)} className="text-[11px] font-bold text-red-600 hover:underline">
                    {t("dashboard.pages.links.schedulePanel.cancelSchedule")}
                  </button>
                </div>
              )
            )}

            {(link.block_type === "link" || link.block_type === "button") &&
              (lockEditId === link.id ? (
                <div className="sm:ml-[60px] flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  <select
                    value={lockTypeInput}
                    onChange={(e) => setLockTypeInput(e.target.value as "age" | "code" | "subscribe" | "sensitive")}
                    className="bg-app-surface text-app-ink w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                  >
                    <option value="code">{t("dashboard.pages.links.lockPanel.types.code")}</option>
                    <option value="age">{t("dashboard.pages.links.lockPanel.types.age")}</option>
                    <option value="subscribe">{t("dashboard.pages.links.lockPanel.types.subscribe")}</option>
                    <option value="sensitive">{t("dashboard.pages.links.lockPanel.types.sensitive")}</option>
                  </select>
                  {lockTypeInput === "code" && (
                    <input
                      type="text"
                      placeholder={t("dashboard.pages.links.lockPanel.codePlaceholder")}
                      value={lockCodeInput}
                      onChange={(e) => setLockCodeInput(e.target.value)}
                      className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    />
                  )}
                  {lockTypeInput === "age" && (
                    <input
                      type="number"
                      min={13}
                      max={99}
                      placeholder={t("dashboard.pages.links.lockPanel.minAgePlaceholder")}
                      value={lockMinAgeInput}
                      onChange={(e) => setLockMinAgeInput(e.target.value)}
                      className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    />
                  )}
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setLockEditId(null)} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
                      {t("dashboard.pages.links.common.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={savingLock}
                      onClick={() => handleSaveLock(link)}
                      className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      {savingLock ? t("dashboard.pages.links.common.saving") : t("dashboard.pages.links.common.save")}
                    </button>
                  </div>
                </div>
              ) : (
                link.lock_type && (
                  <div className="sm:ml-[60px] flex items-center justify-between rounded-lg bg-jeon-purple/10 px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-jeon-purple">
                      {t("dashboard.pages.links.lockPanel.lockedLabel")}{" "}
                      {link.lock_type === "code"
                        ? t("dashboard.pages.links.lockPanel.statusTypes.code")
                        : link.lock_type === "age"
                          ? t("dashboard.pages.links.lockPanel.statusTypes.age").replace("{age}", String(link.lock_min_age ?? 18))
                          : link.lock_type === "sensitive"
                            ? t("dashboard.pages.links.lockPanel.statusTypes.sensitive")
                            : t("dashboard.pages.links.lockPanel.statusTypes.subscribe")}
                    </span>
                    <button type="button" onClick={() => handleClearLock(link)} className="text-[11px] font-bold text-red-600 hover:underline">
                      {t("dashboard.pages.links.lockPanel.unlock")}
                    </button>
                  </div>
                )
              ))}

            {/* Panel accordion isi blok -- 10 tipe "buffer field" (video/
                maps/teks/accordion/project_showcase/button/countdown/embed/
                video_image/embed_link), pola & JSX SAMA PERSIS dashboard/
                links/page.tsx. */}
            {(link.block_type === "video" ||
              link.block_type === "maps" ||
              link.block_type === "text" ||
              link.block_type === "accordion" ||
              link.block_type === "project_showcase" ||
              link.block_type === "button" ||
              link.block_type === "countdown" ||
              link.block_type === "embed" ||
              link.block_type === "video_image" ||
              link.block_type === "embed_link") &&
              contentEditId === link.id && (
              <div className="sm:ml-[60px] flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                {link.block_type === "video" ? (
                  <>
                    <VideoSourceField
                      source={editVideoSource}
                      onSourceChange={setEditVideoSource}
                      url={editVideoUrl}
                      onUrlChange={setEditVideoUrl}
                      urlInputClassName="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      linkId={link.id}
                      fileName={link.block_data?.video_file_name as string | undefined}
                      fileUrl={link.block_data?.video_file_url as string | undefined}
                      onUploaded={(res) =>
                        setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, ...res, source: "upload" } } : l)))
                      }
                      onRemoved={() =>
                        setLinks((prev) =>
                          prev.map((l) => {
                            if (l.id !== link.id) return l;
                            const rest = { ...l.block_data };
                            delete rest.video_file_url;
                            delete rest.video_file_name;
                            return { ...l, block_data: rest };
                          }),
                        )
                      }
                      onError={setError}
                    />
                    <label className="flex items-start gap-2 text-xs text-app-ink">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={editVideoAutoplay}
                        onChange={(e) => setEditVideoAutoplay(e.target.checked)}
                      />
                      <span>
                        <span className="font-semibold">{t("dashboard.pages.links.blockForm.video.autoplayToggle")}</span>
                        <span className="block text-[11px] text-app-muted">{t("dashboard.pages.links.blockForm.video.autoplayHint")}</span>
                      </span>
                    </label>
                  </>
                ) : link.block_type === "maps" ? (
                  <FormField label={t("dashboard.components.produkPageEditor.blockForm.mapsUrlLabel")}>
                    <input
                      type="url"
                      value={editMapsUrl}
                      onChange={(e) => setEditMapsUrl(e.target.value)}
                      className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    />
                    <label className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-app-ink">
                      <input type="checkbox" checked={editMapsEmbed} onChange={(e) => setEditMapsEmbed(e.target.checked)} />
                      {t("dashboard.components.produkPageEditor.blockForm.mapsEmbedCheckbox")}
                    </label>
                  </FormField>
                ) : link.block_type === "text" ? (
                  <FormField label={t("dashboard.pages.links.blockForm.text.label")}>
                    <RichTextEditor html={editText} onChange={setEditText} />
                  </FormField>
                ) : link.block_type === "accordion" ? (
                  <FormField label={t("dashboard.pages.links.blockForm.accordion.label")}>
                    <RichTextEditor html={editAccordionText} onChange={setEditAccordionText} />
                  </FormField>
                ) : link.block_type === "project_showcase" ? (
                  <div className="flex flex-col gap-2">
                    <FormField label={t("dashboard.pages.links.blockForm.showcase.badgeLabel")}>
                      <input
                        type="text"
                        placeholder={t("dashboard.pages.links.blockForm.showcase.badgePlaceholder")}
                        value={editShowcaseBadge}
                        onChange={(e) => setEditShowcaseBadge(e.target.value)}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.pages.links.blockForm.showcase.descriptionLabel")}>
                      <RichTextEditor html={editShowcaseDescription} onChange={setEditShowcaseDescription} />
                    </FormField>
                    <FormField label={t("dashboard.pages.links.blockForm.showcase.ctaUrlLabel")}>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={editShowcaseUrl}
                        onChange={(e) => setEditShowcaseUrl(e.target.value)}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.pages.links.blockForm.showcase.ctaTextLabel")}>
                      <input
                        type="text"
                        placeholder={t("dashboard.pages.links.blockForm.showcase.ctaTextPlaceholder")}
                        value={editShowcaseCta}
                        onChange={(e) => setEditShowcaseCta(e.target.value)}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                  </div>
                ) : link.block_type === "button" ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1.5">
                      {(["url", "whatsapp"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setEditButtonMode(mode)}
                          className={`flex-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                            editButtonMode === mode ? "bg-jeon-sidebar text-white" : "bg-gray-100 text-app-muted hover:bg-gray-200"
                          }`}
                        >
                          {mode === "url" ? t("dashboard.pages.links.blockForm.button.modeUrl") : t("dashboard.pages.links.blockForm.button.modeWhatsapp")}
                        </button>
                      ))}
                    </div>
                    {editButtonMode === "whatsapp" ? (
                      <>
                        <FormField label={t("dashboard.pages.links.blockForm.button.whatsappNumberLabel")}>
                          <input
                            type="tel"
                            value={editButtonWhatsappNumber}
                            onChange={(e) => setEditButtonWhatsappNumber(e.target.value)}
                            className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                          />
                        </FormField>
                        <FormField label={t("dashboard.pages.links.blockForm.button.whatsappMessageLabel")}>
                          <textarea
                            value={editButtonWhatsappMessage}
                            onChange={(e) => setEditButtonWhatsappMessage(e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                          />
                        </FormField>
                      </>
                    ) : (
                      <FormField label={t("dashboard.pages.links.blockForm.button.urlLabel")}>
                        <input
                          type="url"
                          value={editButtonUrl}
                          onChange={(e) => setEditButtonUrl(e.target.value)}
                          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                        />
                      </FormField>
                    )}
                  </div>
                ) : link.block_type === "countdown" ? (
                  <div className="flex flex-col gap-2">
                    <FormField label={t("dashboard.pages.links.blockForm.countdown.targetLabel")}>
                      <input
                        type="datetime-local"
                        value={editCountdownTargetAt}
                        onChange={(e) => setEditCountdownTargetAt(e.target.value)}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.pages.links.blockForm.countdown.productLabel")} hint={t("dashboard.pages.links.blockForm.countdown.productHint")}>
                      <select
                        value={editCountdownProductId}
                        onChange={(e) => setEditCountdownProductId(e.target.value)}
                        className="bg-app-surface text-app-ink w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      >
                        <option value="">{t("dashboard.pages.links.blockForm.countdown.noProduct")}</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    {!editCountdownProductId && (
                      <>
                        <FormField label={t("dashboard.pages.links.blockForm.countdown.ctaLabelLabel")}>
                          <input
                            type="text"
                            value={editCountdownCtaLabel}
                            onChange={(e) => setEditCountdownCtaLabel(e.target.value)}
                            className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                          />
                        </FormField>
                        <FormField label={t("dashboard.pages.links.blockForm.countdown.ctaUrlLabel")}>
                          <input
                            type="url"
                            value={editCountdownCtaUrl}
                            onChange={(e) => setEditCountdownCtaUrl(e.target.value)}
                            className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                          />
                        </FormField>
                      </>
                    )}
                  </div>
                ) : link.block_type === "embed" ? (
                  <FormField label={t("dashboard.pages.links.blockForm.embed.urlLabel")}>
                    <input
                      type="url"
                      value={editEmbedUrl}
                      onChange={(e) => setEditEmbedUrl(e.target.value)}
                      className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    />
                  </FormField>
                ) : link.block_type === "video_image" ? (
                  <FormField label={t("dashboard.pages.links.blockForm.video.label")}>
                    <input
                      type="url"
                      value={editVideoImageVideoUrl}
                      onChange={(e) => setEditVideoImageVideoUrl(e.target.value)}
                      className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    />
                  </FormField>
                ) : link.block_type === "embed_link" ? (
                  <div className="flex flex-col gap-2">
                    <FormField label={t("dashboard.pages.links.blockForm.embedLink.urlLabel")}>
                      <input
                        type="url"
                        value={editEmbedLinkUrl}
                        onChange={(e) => setEditEmbedLinkUrl(e.target.value)}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.pages.links.blockForm.embedLink.descriptionLabel")}>
                      <RichTextEditor html={editEmbedLinkDescription} onChange={setEditEmbedLinkDescription} />
                    </FormField>
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={savingContent}
                    onClick={() => handleSaveContent(link)}
                    className="btn-primary rounded-md px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                  >
                    {/* Label "Simpan" (bukan "Tambah" milik form buat-blok) --
                        audit 24 Sept 2026: tombol ini MENYIMPAN blok yang sudah
                        ada, sama seperti tombol yang sama di halaman utama. */}
                    {savingContent ? t("dashboard.pages.links.common.saving") : t("dashboard.pages.links.common.save")}
                  </button>
                </div>
              </div>
            )}

            {/* Panel "Kelola foto"/"Kelola audio"/"Kelola file"/"Kelola
                Gambar"/"Kelola Item"/"Kelola Produk" di bawah -- SEBELUMNYA
                selalu tampil unconditional; sejak paritas Toko <-> Links
                (18 September 2026) SEMUANYA digerbang `contentEditId ===
                link.id` sama seperti 10 tipe buffer di atas: isi blok baru
                muncul begitu barisnya diklik (baris ringkasan di header
                sudah memberi tahu jumlah foto/status audio/dst tanpa perlu
                membuka). "image_slider" reuse PERSIS panel galeri -- alias
                tervalidasi "gallery" di backend. */}
            {(link.block_type === "gallery" || link.block_type === "image_slider") && contentEditId === link.id && (
              <div className="sm:ml-[60px] flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-app-muted">
                    {t("dashboard.components.produkPageEditor.blockForm.galleryCount")
                      .replace("{count}", String(((link.block_data?.images as string[]) ?? []).length))
                      .replace("{max}", String(maxGalleryImages))}
                  </p>
                  {/* Tampilan Grid/Tumpukan + caption per foto -- pola SAMA
                      PERSIS dashboard/links/page.tsx (18 September 2026),
                      lihat catatan di sana & GalleryBlock.tsx. */}
                </div>
                {link.block_type === "gallery" && (
                  <GalleryDisplayPicker value={normalizeGalleryDisplay(link.block_data?.display)} onChange={(display) => handleBlockDataPatch(link, { display })} />
                )}
                {((link.block_data?.images as string[]) ?? []).length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {((link.block_data?.images as string[]) ?? []).map((src, i) => {
                      const captions = (link.block_data?.captions as Record<string, { title?: string; description?: string }> | undefined) ?? {};
                      const cap = captions[src] ?? {};
                      const saveCaption = (field: "title" | "description", value: string) => {
                        const next = { ...captions, [src]: { ...cap, [field]: value.trim() } };
                        if ((cap[field] ?? "") === value.trim()) return;
                        handleBlockDataPatch(link, { captions: next });
                      };
                      // "Foto di dalam foto" -- lihat catatan panjang di
                      // dashboard/links/page.tsx, pola dipindah apa adanya.
                      const nestedImages = (link.block_data?.nestedImages as Record<string, string[]> | undefined) ?? {};
                      const nested = nestedImages[src] ?? [];
                      const nestedPanelOpen = nestedPanelOpenFor === src;
                      return (
                        <div key={src} className="flex flex-col gap-1.5 rounded-md border border-app-border bg-app-surface p-1.5">
                          <div className="flex items-start gap-2">
                            {/* Ukuran TETAP 48px -- thumbnail baris caption h-12 w-12. */}
                            <Image src={src} alt="" width={48} height={48} className="h-12 w-12 flex-shrink-0 rounded-md object-cover ring-1 ring-black/5" />
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <input
                                type="text"
                                maxLength={120}
                                defaultValue={cap.title ?? ""}
                                onBlur={(e) => saveCaption("title", e.target.value)}
                                placeholder={t("dashboard.pages.links.galleryPanel.captionTitlePlaceholder")}
                                className="w-full rounded-md border border-app-border bg-app-surface px-2 py-1 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
                              />
                              <input
                                type="text"
                                maxLength={500}
                                defaultValue={cap.description ?? ""}
                                onBlur={(e) => saveCaption("description", e.target.value)}
                                placeholder={t("dashboard.pages.links.galleryPanel.captionDescPlaceholder")}
                                className="w-full rounded-md border border-app-border bg-app-surface px-2 py-1 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleGalleryImageDelete(link, i)}
                              title={t("dashboard.components.produkPageEditor.blockForm.deletePhoto")}
                              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-app-muted hover:bg-red-50 hover:text-red-600"
                            >
                              <IconX className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNestedPanelOpenFor(nestedPanelOpen ? null : src)}
                            className={`ml-[56px] flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              nested.length > 0 ? "bg-jeon-purple/10 text-jeon-purple" : "text-app-muted hover:text-jeon-purple"
                            }`}
                          >
                            <LucideImages className="h-3 w-3" />
                            {nested.length > 0
                              ? t("dashboard.pages.links.galleryPanel.relatedPhotosCount").replace("{count}", String(nested.length))
                              : t("dashboard.pages.links.galleryPanel.addRelatedPhoto")}
                          </button>
                          {nestedPanelOpen && (
                            <div className="ml-[56px] flex flex-col gap-1.5 rounded-md bg-jeon-purple/5 p-2">
                              <p className="text-[11px] text-app-muted">{t("dashboard.pages.links.galleryPanel.relatedPhotosHint")}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {nested.map((nestedSrc, nestedIndex) => (
                                  <div key={nestedSrc} className="group relative h-12 w-12 flex-shrink-0">
                                    <Image src={nestedSrc} alt="" width={48} height={48} className="h-12 w-12 rounded-md object-cover ring-1 ring-black/5" />
                                    <button
                                      type="button"
                                      onClick={() => handleNestedImageDelete(link, src, nestedIndex)}
                                      title={t("dashboard.pages.links.galleryPanel.deleteRelatedPhoto")}
                                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100"
                                    >
                                      <IconX className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                ))}
                                {nested.length < maxNestedGalleryImages ? (
                                  <label
                                    title={t("dashboard.pages.links.galleryPanel.uploadHint")}
                                    className={`flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-app-border text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
                                      nestedUploadingFor === src ? "opacity-60" : ""
                                    }`}
                                  >
                                    {nestedUploadingFor === src ? (
                                      <span className="flex flex-col items-center">
                                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                                      {uploadProgress && uploadProgress.total > 1 && <span className="text-[8px] font-semibold tabular-nums">{uploadProgress.done}/{uploadProgress.total}</span>}
                                      </span>
                                    ) : (
                                      <IconPlus className="h-4 w-4" />
                                    )}
                                    <input
                                      type="file"
                                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                      onChange={(e) => handleNestedImageUpload(e, link, src)}
                                      multiple
                                      disabled={nestedUploadingFor === src}
                                      className="hidden"
                                    />
                                  </label>
                                ) : (
                                  <p className="flex items-center text-[11px] text-app-muted">
                                    {t("dashboard.pages.links.galleryPanel.relatedPhotosLimitReached").replace("{max}", String(maxNestedGalleryImages))}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {(((link.block_data?.images as string[]) ?? []).length) < maxGalleryImages && (
                    <label
                      title={t("dashboard.pages.links.galleryPanel.uploadHint")}
                      className={`flex h-16 w-16 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-app-border text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
                        galleryUploadingId === link.id ? "opacity-60" : ""
                      }`}
                    >
                      {galleryUploadingId === link.id ? (
                        <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                        {uploadProgress && uploadProgress.total > 1 && <span className="text-[9px] font-semibold tabular-nums">{uploadProgress.done}/{uploadProgress.total}</span>}
                        </>
                      ) : (
                        <>
                          <IconPlus className="h-4 w-4" />
                          <span className="text-[9px] font-semibold">{t("dashboard.components.produkPageEditor.blockForm.add")}</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={(e) => handleGalleryImageUpload(e, link)}
                        multiple
                        disabled={galleryUploadingId === link.id}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
            {link.block_type === "audio" && contentEditId === link.id && (
              <div className="sm:ml-[60px] flex items-center gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-app-muted">
                  {(link.block_data?.audio_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.audioUploaded")
                    : t("dashboard.components.produkPageEditor.blockForm.audioEmpty")}
                </p>
                <label className="flex-shrink-0 cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                  {audioUploadingId === link.id
                    ? t("dashboard.components.produkPageEditor.blockForm.uploading")
                    : (link.block_data?.audio_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.replace")
                    : t("dashboard.components.produkPageEditor.blockForm.upload")}
                  <input
                    type="file"
                    accept=".mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/ogg"
                    onChange={(e) => handleAudioUpload(e, link)}
                    disabled={audioUploadingId === link.id}
                    className="hidden"
                  />
                </label>
                {(link.block_data?.audio_url as string) && (
                  <button type="button" onClick={() => handleAudioDelete(link)} className="flex-shrink-0 text-[11px] font-semibold text-red-600 hover:underline">
                    {t("dashboard.components.produkPageEditor.blockForm.delete")}
                  </button>
                )}
              </div>
            )}
            {/* Panel "Kelola file" -- blok "file" (permintaan langsung
                pengguna, 20 Agustus 2026: "tambahkan file pdf download"),
                pola sama persis seperti panel Kelola audio di atas. */}
            {link.block_type === "file" && contentEditId === link.id && (
              <div className="sm:ml-[60px] flex items-center gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-app-muted">
                  {(link.block_data?.file_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.fileUploaded")
                    : t("dashboard.components.produkPageEditor.blockForm.fileEmpty")}
                </p>
                <label className="flex-shrink-0 cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                  {fileUploadingId === link.id
                    ? t("dashboard.components.produkPageEditor.blockForm.uploading")
                    : (link.block_data?.file_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.replace")
                    : t("dashboard.components.produkPageEditor.blockForm.upload")}
                  <input
                    type="file"
                    accept=".pdf,.zip,.epub,application/pdf,application/zip,application/epub+zip"
                    onChange={(e) => handleFileUpload(e, link)}
                    disabled={fileUploadingId === link.id}
                    className="hidden"
                  />
                </label>
                {(link.block_data?.file_url as string) && (
                  <button type="button" onClick={() => handleFileDelete(link)} className="flex-shrink-0 text-[11px] font-semibold text-red-600 hover:underline">
                    {t("dashboard.components.produkPageEditor.blockForm.delete")}
                  </button>
                )}
              </div>
            )}
            {/* Panel "Kelola Gambar" -- bersama blok "image"/"video_image"/
                "embed_link" (susulan 15 September 2026, pola SAMA PERSIS
                dashboard/links/page.tsx: satu endpoint uploadBuilderMediaImage
                dipakai bersama ketiganya). */}
            {(link.block_type === "image" || link.block_type === "video_image" || link.block_type === "embed_link") && contentEditId === link.id && (
              <div className="sm:ml-[60px] flex items-center gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-app-muted">
                  {(link.block_data?.image_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.audioUploaded")
                    : t("dashboard.pages.links.mediaImagePanel.imageHint")}
                </p>
                <label className="flex-shrink-0 cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                  {mediaImageUploadingId === link.id
                    ? t("dashboard.components.produkPageEditor.blockForm.uploading")
                    : (link.block_data?.image_url as string)
                    ? t("dashboard.pages.links.showcasePanel.changeImage")
                    : t("dashboard.pages.links.showcasePanel.uploadImage")}
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={(e) => handleMediaImageUpload(e, link)}
                    disabled={mediaImageUploadingId === link.id}
                    className="hidden"
                  />
                </label>
                {(link.block_data?.image_url as string) && (
                  <button type="button" onClick={() => handleMediaImageDelete(link)} className="flex-shrink-0 text-[11px] font-semibold text-red-600 hover:underline">
                    {t("dashboard.components.produkPageEditor.blockForm.delete")}
                  </button>
                )}
              </div>
            )}
            {/* Panel "Kelola Gambar" -- blok "project_showcase" (endpoint
                terpisah, uploadShowcaseImage). */}
            {link.block_type === "project_showcase" && contentEditId === link.id && (
              <div className="sm:ml-[60px] flex items-center gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-app-muted">
                  {(link.block_data?.image_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.audioUploaded")
                    : t("dashboard.pages.links.showcasePanel.imageHint")}
                </p>
                <label className="flex-shrink-0 cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                  {showcaseUploadingId === link.id
                    ? t("dashboard.components.produkPageEditor.blockForm.uploading")
                    : (link.block_data?.image_url as string)
                    ? t("dashboard.pages.links.showcasePanel.changeImage")
                    : t("dashboard.pages.links.showcasePanel.uploadImage")}
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={(e) => handleShowcaseImageUpload(e, link)}
                    disabled={showcaseUploadingId === link.id}
                    className="hidden"
                  />
                </label>
                {(link.block_data?.image_url as string) && (
                  <button type="button" onClick={() => handleMediaImageDelete(link)} className="flex-shrink-0 text-[11px] font-semibold text-red-600 hover:underline">
                    {t("dashboard.components.produkPageEditor.blockForm.delete")}
                  </button>
                )}
              </div>
            )}
            {/* Panel "Kelola Item" -- blok "list" (susulan 15 September
                2026), ListItemsEditor yang SAMA PERSIS dipakai form buat-
                baru di atas, cuma sekarang dgn onUpdateItems yang langsung
                PATCH ke server (autosave, tanpa draft lokal, pola SAMA
                dashboard/links/page.tsx). */}
            {link.block_type === "list" && contentEditId === link.id && (
              <div className="sm:ml-[60px] rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <ListItemsEditor
                  style={(link.block_data?.style as "list" | "card" | "testimony" | undefined) ?? "list"}
                  items={(link.block_data?.items as ListEditorItem[] | undefined) ?? []}
                  onUpdateStyle={(style) => handleBlockDataPatch(link, { style })}
                  onUpdateItems={(items) => handleListItemsPatch(link, items)}
                />
              </div>
            )}
            {/* Panel "Kelola Produk" -- blok "produk" di Halaman Toko
                (permintaan langsung pengguna, 13 September 2026), pola
                IDENTIK dashboard/links/page.tsx: ProdukBlockEditor yang
                sama dipakai ulang apa adanya. Begitu blok ini ADA di Toko,
                grid otomatis Halaman Toko berhenti tampil (lihat gating
                hasProdukBlock di PagePreview.tsx). */}
            {link.block_type === "produk" && contentEditId === link.id && (
              <div className="sm:ml-[60px] rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <ProdukBlockEditor
                  blockData={link.block_data}
                  products={products}
                  onToggleProduct={(productId) => {
                    const current = (link.block_data?.product_ids as string[] | undefined) ?? [];
                    const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
                    handleBlockDataPatch(link, { product_ids: next });
                  }}
                  onProductCreated={(product) => {
                    onProductCreated(product);
                    const current = (link.block_data?.product_ids as string[] | undefined) ?? [];
                    handleBlockDataPatch(link, { product_ids: [...current, product.id] });
                  }}
                  onLayoutChange={(layout) => handleBlockDataPatch(link, { layout })}
                  onShowCategoryFilterChange={(show) => handleBlockDataPatch(link, { show_category_filter: show })}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {iconPickerLinkId &&
        (() => {
          const target = links.find((l) => l.id === iconPickerLinkId);
          if (!target) return null;
          return <IconPickerModal currentKey={target.icon_key} onSelect={(icon) => handleSelectLibraryIcon(target, icon.key)} onClose={() => setIconPickerLinkId(null)} />;
        })()}

      {/* Dialog konfirmasi hapus -- sama seperti dashboard/links/page.tsx
          ("kalau mau hapus tampilkan toast peringatan dulu"); SEBELUMNYA
          tombol sampah di header Toko langsung menghapus tanpa jeda. */}
      {confirmDeleteId &&
        (() => {
          const target = links.find((l) => l.id === confirmDeleteId);
          if (!target) return null;
          const noun = target.block_type === "link" ? t("dashboard.pages.links.deleteConfirm.linkNoun") : BLOCK_LABEL[target.block_type]?.toLowerCase() ?? t("dashboard.pages.links.deleteConfirm.blockNoun");
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDeleteId(null)}>
              <div className="w-full max-w-sm rounded-jmd border-2 border-jeon-ink bg-app-surface p-5 shadow-brutal" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#111111] bg-jeon-coral text-[#111111]">
                    <TriangleAlert className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.links.deleteConfirm.title").replace("{noun}", noun)}</h2>
                    <p className="mt-1 text-xs text-app-muted">
                      {t("dashboard.pages.links.deleteConfirm.body").replace("{title}", target.title || t("dashboard.pages.links.deleteConfirm.untitled"))}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setConfirmDeleteId(null)} className="flex-1 rounded-lg border-2 border-jeon-ink py-2 text-xs font-bold text-app-muted hover:bg-app-surface-2">
                    {t("dashboard.pages.links.common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDelete(confirmDeleteId);
                      setConfirmDeleteId(null);
                    }}
                    className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700"
                  >
                    {t("dashboard.pages.links.deleteConfirm.confirmButton")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
