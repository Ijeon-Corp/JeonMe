"use client";

import PageSkeleton from "@/components/Skeleton";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
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
  deleteLink,
  listExtraPageLinks,
  reorderExtraPageLinks,
  updateExtraPage,
  updateLink,
  uploadAudioBlock,
  uploadBuilderMediaImage,
  uploadExtraPageAvatar,
  uploadExtraPageBackground,
  uploadFileBlock,
  uploadGalleryImage,
  uploadShowcaseImage,
} from "@/lib/api-client";
import {
  IconBook,
  IconCamera,
  IconChevronRight,
  IconClock,
  IconColumns,
  IconExternal,
  IconFileText,
  IconGrid,
  IconGripVertical,
  IconIframe,
  IconLink,
  IconListCard,
  IconLock,
  IconMail,
  IconMapPin,
  IconMusicNote,
  IconPhotoLibrary,
  IconPlayCircle,
  IconPlus,
  IconShoppingBag,
  IconSlideshow,
  IconSparkle,
  IconTextLines,
  IconTrash,
  IconVideoImage,
  IconX,
} from "@/components/icons";
import StickerCanvasEditor from "@/components/StickerCanvasEditor";
import { ProdukBlockEditor } from "@/components/dashboard/page/ProdukBlockEditor";
import RichTextEditor from "@/components/dashboard/page/RichTextEditor";
import { ListItemsEditor, toDatetimeLocalValue, type ListEditorItem } from "@/components/dashboard/page/ListItemsEditor";
import Toggle from "@/components/Toggle";
import SectionCard from "@/components/dashboard/page/SectionCard";
import DesignCategoryTabs from "@/components/dashboard/page/DesignCategoryTabs";
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

// AddLinkModal/BlockDrilldownEditor -- susulan 15 September 2026 (permintaan
// langsung pengguna: "samakan semua blok/link beserta fungsi nya di menu
// store seperti yang ada di my page"). Sama persis pola dynamic import di
// dashboard/links/page.tsx -- keduanya cuma perlu dimuat begitu kreator
// benar-benar membuka modal "Tambah"/blok Katalog-FAQ, bukan eager di setiap
// kunjungan menu Toko.
const AddLinkModal = dynamic(() => import("@/components/AddLinkModal"));
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

// maxGalleryImages -- SAMA PERSIS dengan batas backend (links.go).
const maxGalleryImages = 9;

// normalizeWhatsappNumber/buildWhatsappButtonUrl -- disalin APA ADANYA dari
// dashboard/links/page.tsx (fungsi murni, tanpa state) -- pola sama "dua
// jalur kode berbeda" yang sudah dipakai proyek ini utk paritas halaman
// utama/Toko (lihat catatan FormField di bawah).
function normalizeWhatsappNumber(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}
function buildWhatsappButtonUrl(number: string, message: string): string {
  const normalized = normalizeWhatsappNumber(number);
  const encoded = encodeURIComponent(message.trim());
  return encoded ? `https://wa.me/${normalized}?text=${encoded}` : `https://wa.me/${normalized}`;
}

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
    { key: "link", label: t("dashboard.components.produkPageEditor.contentTiles.link.label"), description: t("dashboard.components.produkPageEditor.contentTiles.link.desc"), Icon: IconLink },
    { key: "video", label: t("dashboard.components.produkPageEditor.contentTiles.video.label"), description: t("dashboard.components.produkPageEditor.contentTiles.video.desc"), Icon: IconPlayCircle },
    { key: "faq", label: t("dashboard.components.produkPageEditor.contentTiles.faq.label"), description: t("dashboard.components.produkPageEditor.contentTiles.faq.desc"), Icon: IconBook },
    // "accordion" -- permintaan langsung pengguna: "blok yang bisa diklik
    // lalu keluar text, bukan hanya untuk faq saja" -- lihat catatan lengkap
    // di dashboard/links/page.tsx (pola sama persis, dipakai ulang di sini
    // untuk paritas halaman utama/Toko).
    { key: "accordion", label: t("dashboard.components.produkPageEditor.contentTiles.accordion.label"), description: t("dashboard.components.produkPageEditor.contentTiles.accordion.desc"), Icon: IconChevronRight },
    { key: "contact_form", label: t("dashboard.components.produkPageEditor.contentTiles.contactForm.label"), description: t("dashboard.components.produkPageEditor.contentTiles.contactForm.desc"), Icon: IconMail },
    { key: "maps", label: t("dashboard.components.produkPageEditor.contentTiles.maps.label"), description: t("dashboard.components.produkPageEditor.contentTiles.maps.desc"), Icon: IconMapPin },
    { key: "text", label: t("dashboard.components.produkPageEditor.contentTiles.text.label"), description: t("dashboard.components.produkPageEditor.contentTiles.text.desc"), Icon: IconTextLines },
    // "gallery"/"audio" -- hasil analisa galeri tema kompetitor, 17 Agustus
    // 2026, lihat catatan lengkap di dashboard/links/page.tsx (pola sama
    // persis, dipakai ulang di sini untuk paritas halaman utama/Toko).
    { key: "gallery", label: t("dashboard.components.produkPageEditor.contentTiles.gallery.label"), description: t("dashboard.components.produkPageEditor.contentTiles.gallery.desc"), Icon: IconPhotoLibrary },
    { key: "audio", label: t("dashboard.components.produkPageEditor.contentTiles.audio.label"), description: t("dashboard.components.produkPageEditor.contentTiles.audio.desc"), Icon: IconMusicNote },
    // "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
    // file pdf download", lihat catatan lengkap di dashboard/links/page.tsx
    // (pola sama persis, dipakai ulang di sini untuk paritas halaman
    // utama/Toko).
    { key: "file", label: t("dashboard.components.produkPageEditor.contentTiles.file.label"), description: t("dashboard.components.produkPageEditor.contentTiles.file.desc"), Icon: IconFileText },
    // "produk" -- permintaan langsung pengguna, 13 September 2026 ("jangan
    // tampil langsung di link nya, tapi data produk itu akan bisa dipilih
    // ketika menggunakan blok produk"): grid otomatis Halaman Toko (SEMUA
    // produk aktif, lihat renderProductGrid di PagePreview.tsx) sekarang
    // jadi FALLBACK -- begitu Toko punya minimal satu blok "produk" ini,
    // grid otomatis berhenti tampil & kreator kurasi sendiri produk mana
    // yang muncul, persis seperti blok "produk" di halaman Bio/Landing
    // (ProdukBlockEditor, dipakai ulang APA ADANYA di bawah).
    { key: "produk", label: t("dashboard.components.produkPageEditor.contentTiles.produk.label"), description: t("dashboard.components.produkPageEditor.contentTiles.produk.desc"), Icon: IconShoppingBag },
    // 10 tipe baru (susulan 15 September 2026) -- lihat catatan namespace
    // i18n di atas fungsi ini.
    { key: "project_showcase", label: t("dashboard.pages.links.contentTiles.projectShowcase.label"), description: t("dashboard.pages.links.contentTiles.projectShowcase.description"), Icon: IconCamera },
    { key: "catalog", label: t("dashboard.pages.links.contentTiles.catalog.label"), description: t("dashboard.pages.links.contentTiles.catalog.description"), Icon: IconGrid },
    { key: "button", label: t("dashboard.pages.links.contentTiles.button.label"), description: t("dashboard.pages.links.contentTiles.button.description"), Icon: IconExternal },
    { key: "image", label: t("dashboard.pages.links.contentTiles.image.label"), description: t("dashboard.pages.links.contentTiles.image.description"), Icon: IconCamera },
    { key: "video_image", label: t("dashboard.pages.links.contentTiles.videoImage.label"), description: t("dashboard.pages.links.contentTiles.videoImage.description"), Icon: IconVideoImage },
    { key: "image_slider", label: t("dashboard.pages.links.contentTiles.imageSlider.label"), description: t("dashboard.pages.links.contentTiles.imageSlider.description"), Icon: IconSlideshow },
    { key: "list", label: t("dashboard.pages.links.contentTiles.list.label"), description: t("dashboard.pages.links.contentTiles.list.description"), Icon: IconListCard },
    { key: "countdown", label: t("dashboard.pages.links.contentTiles.countdown.label"), description: t("dashboard.pages.links.contentTiles.countdown.description"), Icon: IconClock },
    { key: "embed_link", label: t("dashboard.pages.links.contentTiles.embedLink.label"), description: t("dashboard.pages.links.contentTiles.embedLink.description"), Icon: IconLink },
    { key: "embed", label: t("dashboard.pages.links.contentTiles.embed.label"), description: t("dashboard.pages.links.contentTiles.embed.description"), Icon: IconIframe },
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
          />
        )}
        {section === "tema" && (
          <TemaSection page={page} isPremium={page.is_premium} onPatch={handlePatch} onError={setError} onUploadBackground={handleUploadBackground} />
        )}
        {section === "header" && (
          <HeaderSection page={page} onLocalChange={handleDesignLocalChange} onPatch={handlePatch} onError={setError} onUploadAvatar={handleUploadAvatar} />
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

// FormField -- permintaan langsung pengguna, 27 Agustus 2026: "perbaiki ui
// dan ux semua blok yang ada di link bio dan juga toko seperti kasih label
// url atau desc dsb" -- field bertumpuk (mis. Judul lalu Tautan) tanpa
// label bikin bingung mana yang teks tampil vs mana yang URL tujuan,
// terutama setelah field terisi (placeholder hilang begitu ada teks).
// Disalin APA ADANYA dari dashboard/links/page.tsx (BUKAN diimpor dari satu
// sumber) -- konsisten dengan pola "dua jalur kode berbeda" yang sudah
// dipakai proyek ini untuk paritas halaman utama/Toko (lihat catatan
// LAYOUT_OPTIONS di atas). label dibungkus DI DALAM <label> (asosiasi a11y
// otomatis, tanpa id/htmlFor manual, juga kebaca getByLabel() di test) --
// hint SENGAJA di LUAR <label> supaya prosa hint tidak ikut masuk ke nama
// aksesibel elemen (kalau hint kebetulan memuat kata yang sama dengan
// label lain, getByLabel() bisa salah tangkap).
function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-wide text-app-muted">{label}</span>
        {children}
      </label>
      {hint && <p className="text-[10.5px] text-app-muted">{hint}</p>}
    </div>
  );
}

function BlockSection({
  pageId,
  links,
  setLinks,
  setError,
  products,
  onProductCreated,
}: {
  pageId: string;
  links: LinkItem[];
  setLinks: (fn: (prev: LinkItem[]) => LinkItem[]) => void;
  setError: (msg: string | null) => void;
  products: DashboardProduct[];
  onProductCreated: (product: DashboardProduct) => void;
}) {
  const { t } = useLocale();
  const CONTENT_TILES = getContentTiles(t);
  const BLOCK_LABEL = getBlockLabel(t);

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
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editMapsUrl, setEditMapsUrl] = useState("");
  const [editMapsEmbed, setEditMapsEmbed] = useState(true);
  const [editText, setEditText] = useState("");
  const [editAccordionText, setEditAccordionText] = useState("");
  const [editShowcaseUrl, setEditShowcaseUrl] = useState("");
  const [editShowcaseDescription, setEditShowcaseDescription] = useState("");
  const [editShowcaseBadge, setEditShowcaseBadge] = useState("");
  const [editShowcaseCta, setEditShowcaseCta] = useState("");
  const [editButtonUrl, setEditButtonUrl] = useState("");
  const [editButtonMode, setEditButtonMode] = useState<"url" | "whatsapp">("url");
  const [editButtonWhatsappNumber, setEditButtonWhatsappNumber] = useState("");
  const [editButtonWhatsappMessage, setEditButtonWhatsappMessage] = useState("");
  const [editCountdownTargetAt, setEditCountdownTargetAt] = useState("");
  const [editCountdownProductId, setEditCountdownProductId] = useState("");
  const [editCountdownCtaLabel, setEditCountdownCtaLabel] = useState("");
  const [editCountdownCtaUrl, setEditCountdownCtaUrl] = useState("");
  const [editEmbedUrl, setEditEmbedUrl] = useState("");
  const [editVideoImageVideoUrl, setEditVideoImageVideoUrl] = useState("");
  const [editEmbedLinkUrl, setEditEmbedLinkUrl] = useState("");
  const [editEmbedLinkDescription, setEditEmbedLinkDescription] = useState("");
  const [savingContent, setSavingContent] = useState(false);

  // drilldownBlockId -- blok "catalog"/"faq" yang sedang dibuka lewat
  // BlockDrilldownEditor (redesain drill-down gaya Linktree, sama persis
  // dashboard/links/page.tsx) -- SATU-SATUNYA cara isi katalog/pertanyaan
  // FAQ bisa disunting lagi setelah blok pertama kali dibuat.
  const [drilldownBlockId, setDrilldownBlockId] = useState<string | null>(null);
  // catalogSaveQueueRef -- antrean promise PER link, pola SAMA PERSIS
  // dashboard/links/page.tsx: PATCH kedua baru dikirim setelah PATCH
  // pertama (link yang sama) beres, supaya urutan tulis di backend sama
  // dgn urutan sebenarnya di client.
  const catalogSaveQueueRef = useRef<Record<string, Promise<unknown>>>({});

  // Blok "gallery"/"audio" (hasil analisa galeri tema kompetitor, 17
  // Agustus 2026): foto/audio diunggah SETELAH blok dibuat (lihat catatan
  // di CONTENT_TILES) -- id blok yang sedang mengunggah.
  const [galleryUploadingId, setGalleryUploadingId] = useState<string | null>(null);
  const [audioUploadingId, setAudioUploadingId] = useState<string | null>(null);
  // "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
  // file pdf download", pola sama seperti galleryUploadingId/audioUploadingId.
  const [fileUploadingId, setFileUploadingId] = useState<string | null>(null);
  // showcaseUploadingId/mediaImageUploadingId -- susulan 15 September 2026,
  // pola sama persis dashboard/links/page.tsx.
  const [showcaseUploadingId, setShowcaseUploadingId] = useState<string | null>(null);
  const [mediaImageUploadingId, setMediaImageUploadingId] = useState<string | null>(null);

  async function handleGalleryImageUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setGalleryUploadingId(link.id);
    setError(null);
    try {
      const { images } = await uploadGalleryImage(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, images } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadGalleryImage"));
    } finally {
      setGalleryUploadingId(null);
    }
  }

  async function handleGalleryImageDelete(link: LinkItem, index: number) {
    setError(null);
    try {
      const { images } = await deleteGalleryImage(link.id, index);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, images } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteGalleryImage"));
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
    setTitle(tile.key === "link" ? "" : tile.label);
    setAdding(true);
    setAddModalOpen(false);
  }

  // handleSelectPlatform -- tab "Sosial"/rekomendasi Populer di AddLinkModal
  // (Instagram/TikTok/dll) -- buka form "link" terisi label+template URL
  // platform itu, kreator tinggal lengkapi username/tautannya.
  function handleSelectPlatform(platform: PlatformQuickAdd) {
    setBlockType("link");
    setTitle(platform.label);
    setLinkUrl(platform.urlTemplate);
    setAdding(true);
    setAddModalOpen(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
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
        if (blockType === "video") {
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
    if (link.block_type === "video") {
      setEditVideoUrl((link.block_data?.video_url as string) ?? "");
    } else if (link.block_type === "maps") {
      setEditMapsUrl(link.url ?? "");
      setEditMapsEmbed(Boolean(link.block_data?.embed));
    } else if (link.block_type === "text") {
      setEditText((link.block_data?.text as string) ?? "");
    } else if (link.block_type === "accordion") {
      setEditAccordionText((link.block_data?.text as string) ?? "");
    } else if (link.block_type === "project_showcase") {
      setEditShowcaseUrl(link.url ?? "");
      setEditShowcaseDescription(link.description ?? "");
      setEditShowcaseBadge((link.block_data?.badge_text as string) ?? "");
      setEditShowcaseCta((link.block_data?.cta_text as string) ?? "");
    } else if (link.block_type === "button") {
      setEditButtonUrl(link.url ?? "");
      const savedWhatsappNumber = (link.block_data?.whatsapp_number as string) ?? "";
      setEditButtonMode(savedWhatsappNumber ? "whatsapp" : "url");
      setEditButtonWhatsappNumber(savedWhatsappNumber);
      setEditButtonWhatsappMessage((link.block_data?.whatsapp_message as string) ?? "");
    } else if (link.block_type === "countdown") {
      setEditCountdownTargetAt(toDatetimeLocalValue(link.block_data?.target_at as string | undefined));
      setEditCountdownProductId((link.block_data?.product_id as string) ?? "");
      setEditCountdownCtaLabel((link.block_data?.cta_label as string) ?? "");
      setEditCountdownCtaUrl((link.block_data?.cta_url as string) ?? "");
    } else if (link.block_type === "embed") {
      setEditEmbedUrl((link.block_data?.embed_url as string) ?? "");
    } else if (link.block_type === "video_image") {
      setEditVideoImageVideoUrl((link.block_data?.video_url as string) ?? "");
    } else if (link.block_type === "embed_link") {
      setEditEmbedLinkUrl(link.url ?? "");
      setEditEmbedLinkDescription(link.description ?? "");
    }
  }

  function toggleContentEdit(link: LinkItem) {
    if (contentEditId === link.id) {
      setContentEditId(null);
    } else {
      openContentEdit(link);
    }
  }

  async function handleSaveContent(link: LinkItem) {
    let blockData: Record<string, unknown>;
    let blockUrl: string | undefined;
    let blockDescription: string | undefined;
    if (link.block_type === "video") {
      if (!editVideoUrl.trim()) {
        setError(t("dashboard.components.produkPageEditor.errors.videoUrlRequired"));
        return;
      }
      blockData = { video_url: editVideoUrl.trim() };
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

  async function handleDelete(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteLink(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteBlock"));
    }
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setLinks((prev) => {
      const from = prev.findIndex((l) => l.id === dragId);
      const to = prev.findIndex((l) => l.id === targetId);
      if (from === -1 || to === -1) return prev;
      const reordered = [...prev];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      const withPositions = reordered.map((l, idx) => ({ ...l, position: idx }));
      reorderExtraPageLinks(
        pageId,
        withPositions.map((l) => ({ id: l.id, position: l.position }))
      ).catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.saveOrder")));
      return withPositions;
    });
    setDragId(null);
  }

  // drilldownLink -- blok "catalog"/"faq" yang sedang dibuka penuh layar
  // lewat BlockDrilldownEditor, MENGGANTIKAN seluruh daftar blok di bawah
  // (pola sama persis dashboard/links/page.tsx).
  const drilldownLink = drilldownBlockId ? links.find((l) => l.id === drilldownBlockId) ?? null : null;
  if (drilldownLink) {
    return (
      <BlockDrilldownEditor
        link={drilldownLink}
        isPremium={false}
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
                required
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
              <FormField label={t("dashboard.components.produkPageEditor.blockForm.videoUrlLabel")}>
                <input
                  type="url"
                  required
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder={t("dashboard.components.produkPageEditor.blockForm.videoUrlPlaceholder")}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                />
              </FormField>
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
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
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
        {links.map((link) => (
          <div
            key={link.id}
            draggable
            onDragStart={() => setDragId(link.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(link.id)}
            className="flex flex-col gap-2.5 rounded-xl border-2 border-jeon-ink bg-app-surface p-3 shadow-card"
          >
            <div className="flex items-center gap-2.5">
              <IconGripVertical className="h-4 w-4 flex-shrink-0 cursor-grab text-app-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-app-ink">
                  {link.lock_type && <IconLock className="mr-1 inline h-3.5 w-3.5 text-app-muted" />}
                  {link.title}
                </p>
                <p className="truncate text-xs text-app-muted">
                  {link.block_type && link.block_type !== "link" ? BLOCK_LABEL[link.block_type] ?? link.block_type : link.url}
                </p>
              </div>
              {/* Tombol buka/tutup isi blok -- susulan 15 September 2026,
                  pola SAMA PERSIS dashboard/links/page.tsx: menutup gap
                  lama "Toko missing edit-content UI" (video/maps/teks/
                  accordion/dst SEBELUMNYA tidak bisa disunting lagi setelah
                  dibuat sama sekali). "catalog"/"faq" buka BlockDrilldownEditor
                  penuh layar, tipe lain buka panel accordion contentEditId. */}
              {link.block_type &&
                link.block_type !== "link" &&
                link.block_type !== "gallery" &&
                link.block_type !== "audio" &&
                link.block_type !== "file" &&
                link.block_type !== "produk" &&
                link.block_type !== "list" &&
                link.block_type !== "image" &&
                link.block_type !== "image_slider" && (
                <button
                  type="button"
                  onClick={() =>
                    link.block_type === "catalog" || link.block_type === "faq" ? setDrilldownBlockId(link.id) : toggleContentEdit(link)
                  }
                  aria-expanded={contentEditId === link.id}
                  title={t("dashboard.pages.links.linkCard.editContent")}
                  className={`flex h-8 flex-shrink-0 items-center rounded-lg px-1.5 transition-colors ${
                    contentEditId === link.id ? "bg-jeon-purple/10 text-jeon-purple" : "text-app-muted hover:bg-jeon-purple/10 hover:text-jeon-purple"
                  }`}
                >
                  <IconChevronRight className={`h-3.5 w-3.5 transition-transform ${contentEditId === link.id ? "rotate-90" : ""}`} />
                </button>
              )}
              <button type="button" onClick={() => handleDelete(link.id)} className="flex-shrink-0 rounded-lg p-1.5 text-app-muted hover:bg-red-50 hover:text-red-600">
                <IconTrash className="h-4 w-4" />
              </button>
            </div>

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
              <div className="ml-6 flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                {link.block_type === "video" ? (
                  <FormField label={t("dashboard.pages.links.blockForm.video.label")}>
                    <input
                      type="url"
                      placeholder={t("dashboard.pages.links.blockForm.video.placeholder")}
                      value={editVideoUrl}
                      onChange={(e) => setEditVideoUrl(e.target.value)}
                      className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    />
                  </FormField>
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
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
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
                    {savingContent ? t("dashboard.components.produkPageEditor.blockForm.saving") : t("dashboard.components.produkPageEditor.blockForm.add")}
                  </button>
                </div>
              </div>
            )}

            {/* Panel "Kelola foto"/"Kelola audio" -- hasil analisa galeri
                tema kompetitor, 17 Agustus 2026. SELALU tampil (bukan
                dibalik toggle) karena inti dari blok ini, sama seperti
                catatan di dashboard/links/page.tsx. "image_slider" (susulan
                15 September 2026) reuse PERSIS panel ini -- alias
                tervalidasi "gallery" di backend. */}
            {(link.block_type === "gallery" || link.block_type === "image_slider") && (
              <div className="ml-6 flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <p className="text-[11px] font-semibold text-app-muted">
                  {t("dashboard.components.produkPageEditor.blockForm.galleryCount")
                    .replace("{count}", String(((link.block_data?.images as string[]) ?? []).length))
                    .replace("{max}", String(maxGalleryImages))}
                </p>
                <div className="flex flex-wrap gap-2">
                  {((link.block_data?.images as string[]) ?? []).map((src, i) => (
                    <div key={i} className="group relative h-16 w-16 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full rounded-md object-cover ring-1 ring-black/5" />
                      <button
                        type="button"
                        onClick={() => handleGalleryImageDelete(link, i)}
                        title={t("dashboard.components.produkPageEditor.blockForm.deletePhoto")}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {(((link.block_data?.images as string[]) ?? []).length) < maxGalleryImages && (
                    <label
                      className={`flex h-16 w-16 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-app-border text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
                        galleryUploadingId === link.id ? "opacity-60" : ""
                      }`}
                    >
                      {galleryUploadingId === link.id ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
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
                        disabled={galleryUploadingId === link.id}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
            {link.block_type === "audio" && (
              <div className="ml-6 flex items-center gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
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
            {link.block_type === "file" && (
              <div className="ml-6 flex items-center gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
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
            {(link.block_type === "image" || link.block_type === "video_image" || link.block_type === "embed_link") && (
              <div className="ml-6 flex items-center gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
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
            {link.block_type === "project_showcase" && (
              <div className="ml-6 flex items-center gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
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
            {link.block_type === "list" && (
              <div className="ml-6 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <ListItemsEditor
                  style={(link.block_data?.style as "list" | "card" | "testimony" | undefined) ?? "list"}
                  items={(link.block_data?.items as ListEditorItem[] | undefined) ?? []}
                  onUpdateStyle={(style) => handleBlockDataPatch(link, { style })}
                  onUpdateItems={(items) => handleBlockDataPatch(link, { items })}
                />
              </div>
            )}
            {/* Panel "Kelola Produk" -- blok "produk" di Halaman Toko
                (permintaan langsung pengguna, 13 September 2026), pola
                IDENTIK dashboard/links/page.tsx: ProdukBlockEditor yang
                sama dipakai ulang apa adanya. Begitu blok ini ADA di Toko,
                grid otomatis Halaman Toko berhenti tampil (lihat gating
                hasProdukBlock di PagePreview.tsx). */}
            {link.block_type === "produk" && (
              <div className="ml-6 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
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
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
