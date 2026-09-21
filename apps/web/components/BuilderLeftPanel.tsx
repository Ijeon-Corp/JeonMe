"use client";

import Image from "next/image";
import dynamic from "next/dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconBox,
  IconCamera,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconDotsVertical,
  IconExternal,
  IconFileText,
  IconGripVertical,
  IconLock,
  IconPaintbrush,
  IconPlus,
  IconSettings,
  IconTrash,
  IconX,
} from "@/components/icons";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Clapperboard,
  ExternalLink,
  Eye,
  EyeOff,
  ClipboardList,
  Code2,
  Columns3,
  FileText as LucideFileText,
  GalleryHorizontal,
  Heading as LucideHeading,
  HelpCircle,
  Image as LucideImage,
  Images as LucideImages,
  LayoutGrid,
  TriangleAlert,
  Link as LucideLink,
  Link2,
  List as LucideList,
  MapPin as LucideMapPin,
  MousePointerClick,
  Music as LucideMusic,
  Presentation,
  Rows3,
  SeparatorHorizontal,
  ShoppingBag as LucideShoppingBag,
  Timer,
  Type as LucideType,
  Video as LucideVideo,
  type LucideIcon,
} from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import {
  ApiError,
  deleteAudioBlock,
  deleteBuilderMediaImage,
  deleteCatalogItemImage,
  deleteFileBlock,
  deleteGalleryImage,
  deleteLinkIcon,
  deleteLinkThumbnail,
  uploadAudioBlock,
  uploadBuilderMediaImage,
  uploadCatalogItemImage,
  uploadFileBlock,
  uploadGalleryImage,
  uploadLinkIcon,
  uploadLinkThumbnail,
  type CatalogItem,
  type DashboardProduct,
  type EmbeddedBuilderBlock,
  type LinkItem,
  type PageStickerData,
} from "@/lib/api-client";
import { getLibraryIcon } from "@/lib/icon-library";
import {
  buildTree,
  findNodeByPath,
  selectionOf,
  type BuilderNodePatch,
  type BuilderSeg,
  type BuilderSelection,
  type BuilderTreeNode,
} from "@/lib/builder-blocks";
import Toggle from "@/components/Toggle";
import BuilderAddComponentModal from "@/components/BuilderAddComponentModal";
import FormField from "@/components/FormField";
import BlockPanelHeaderView from "@/components/dashboard/page/BlockPanelHeader";
import LinkDisplayModePicker from "@/components/dashboard/page/LinkDisplayModePicker";
import DesignCategoryTabs from "@/components/dashboard/page/DesignCategoryTabs";
import StickerCanvasEditor from "@/components/StickerCanvasEditor";
import RichTextEditor from "@/components/dashboard/page/RichTextEditor";
import { ProdukBlockEditor, getBlockProductIds } from "@/components/dashboard/page/ProdukBlockEditor";
import { ListItemsEditor, toDatetimeLocalValue } from "@/components/dashboard/page/ListItemsEditor";
import {
  FontSection,
  HeaderSection,
  TemaSection,
  TombolSection,
  type DesignSectionPage,
  type DesignSectionPatch,
} from "@/components/dashboard/page/design-sections";
import { normalizeGalleryDisplay, type GalleryDisplay } from "@/lib/gallery-display";
import GalleryDisplayPicker from "@/components/dashboard/page/GalleryDisplayPicker";

// BuilderDesignSection -- 5 sub-tab Design di dalam builder (permintaan
// langsung pengguna 9 September 2026, "design langsung di builder juga")
// -- SENGAJA cuma 5, TIDAK 6 seperti DesignSection (ProdukPageEditor.tsx):
// "blok" (isi/urutan blok) di sini SUDAH jadi tab "content" tersendiri di
// level atas panel ini, tidak perlu diduplikasi sebagai sub-tab Design.
export type BuilderDesignSection = "tema" | "header" | "tombol" | "font" | "stiker";

// BuilderPageSettings -- subset field halaman yang diedit tab "Pengaturan"
// Builder (18 September 2026); semuanya kolom `pages` yang SUDAH diterima
// updateMyPage/updateExtraPage, cuma belum pernah bisa diubah dari Builder.
export interface BuilderPageSettings {
  is_published: boolean;
  hide_watermark: boolean;
  noindex: boolean;
  seo_title: string;
  seo_description: string;
}

// maxGalleryImages -- SAMA PERSIS dengan batas backend (links.go), lihat
// juga const yang sama di dashboard/links/page.tsx (galeri lama, jalur
// kode terpisah dari builder tapi endpoint & limit-nya dibagi bersama).
const maxGalleryImages = 9;

// containerKeyOf/siblingsOf -- APA ADANYA dari versi sebelumnya, dipakai
// handleDragEnd (lihat catatan lengkap di komponen utama).
function containerKeyOf(node: BuilderTreeNode): string {
  if (node.path.length === 0) return "root";
  return `${node.rootId}:${JSON.stringify(node.path.slice(0, -1))}`;
}

// IconPickerModal -- dynamic() spt Links (app/dashboard/links/page.tsx):
// galeri ikon siap-pakai (lib/icon-library.ts) yang cukup besar, tidak
// perlu ikut bundle awal Builder.
const IconPickerModal = dynamic(() => import("@/components/IconPickerModal"));

function siblingsOf(tree: BuilderTreeNode[], node: BuilderTreeNode): BuilderTreeNode[] {
  if (node.path.length === 0) return tree;
  const parent = findNodeByPath(tree, node.rootId, node.path.slice(0, -1));
  return parent ? parent.children : [];
}

const TYPE_ICON: Record<string, LucideIcon | ((p: { className?: string }) => React.ReactElement)> = {
  text: LucideType,
  button: MousePointerClick,
  divider: SeparatorHorizontal,
  // "link" -- tautan klasik lama (bukan tipe Canvas, lihat catatan
  // lengkap di NodeFieldEditor case-nya) -- perlu entry di sini SUPAYA
  // BlockPanelHeader (redesain panel blok, 13 September 2026) tidak
  // jatuh ke fallback "typeText"/LucideType yang salah.
  link: LucideLink,
  column: Columns3,
  section: Rows3,
  video: LucideVideo,
  faq: HelpCircle,
  gallery: LucideImages,
  image: LucideImage,
  video_image: Clapperboard,
  embed_link: Link2,
  countdown: Timer,
  list: LucideList,
  image_slider: GalleryHorizontal,
  embed: Code2,
  maps: LucideMapPin,
  produk: LucideShoppingBag,
  heading: LucideHeading,
  contact_form: ClipboardList,
  accordion: ChevronDown,
  audio: LucideMusic,
  file: LucideFileText,
  project_showcase: Presentation,
  catalog: LayoutGrid,
};

// TYPE_LABEL_KEY -- pemetaan STATIS block_type -> suffix key
// dashboard.components.builderAddComponentModal.type* (bukan template
// string dinamis dari block_type mentah -- lihat catatan i18n key
// insertion pitfall, string dibangun bebas gampang salah namespace &
// tsc tidak menangkapnya).
const TYPE_LABEL_KEY: Record<string, string> = {
  text: "typeText",
  button: "typeButton",
  divider: "typeDivider",
  link: "typeLink",
  column: "typeColumn",
  section: "typeSection",
  video: "typeVideo",
  faq: "typeFaq",
  gallery: "typeImageGrid",
  image: "typeImage",
  video_image: "typeVideoImage",
  embed_link: "typeEmbedLink",
  countdown: "typeCountdown",
  list: "typeList",
  image_slider: "typeImageSlider",
  embed: "typeEmbed",
  maps: "typeMaps",
  produk: "typeProduk",
  heading: "typeHeading",
  contact_form: "typeContactForm",
  accordion: "typeAccordion",
  audio: "typeAudio",
  file: "typeFile",
  project_showcase: "typeProjectShowcase",
  catalog: "typeCatalog",
};

// DESIGN_SECTION_ENTRIES -- 5 sub-tab tab "design" (Bagian 2, permintaan
// langsung pengguna 9 September 2026), label i18n key SAMA PERSIS dipakai
// ProdukPageEditor.tsx (dashboard.components.produkPageEditor.designTabs.*)
// -- label "Tema/Header/Tombol/Font/Stiker" sudah diterjemahkan ID/EN di
// sana, tidak perlu key baru.
const DESIGN_SECTION_ENTRIES: [BuilderDesignSection, string][] = [
  ["tema", "dashboard.components.produkPageEditor.designTabs.tema"],
  ["header", "dashboard.components.produkPageEditor.designTabs.header"],
  ["tombol", "dashboard.components.produkPageEditor.designTabs.tombol"],
  ["font", "dashboard.components.produkPageEditor.designTabs.font"],
  ["stiker", "dashboard.components.produkPageEditor.designTabs.stiker"],
];

// previewLabelFor -- riwayat perbaikan bolak-balik di titik yang SAMA
// PERSIS (baca dulu sebelum mengubah lagi kalau ada laporan baru):
// (1) awalnya SELALU nama tipe generik; (2) 10 September 2026 diubah
// utk "text" tampilkan cuplikan ISI ("tidak perlu tampilkan teks
// component nya tetapi hanya isi dari component nya saja"); (3) 12
// September 2026 blok daftar (produk/faq/list/gallery/image_slider)
// dikembalikan ke nama tipe generik ("harusnya teks yang muncul itu
// teks jenis blok nya"); (4) 13 September 2026 (permintaan ini,
// screenshot tree menunjukkan campuran judul kustom & cuplikan isi):
// "nama nama blok ini harusnya itu nama tiap blok bukan nama tiap isi
// dari blok" -- SEMUA blok, TERMASUK "text", jadi SELALU nama tipe
// generik; (5) 18 September 2026 (screenshot tree: "Link / Link / Text /
// FAQ / Image Grid / Video / Link" -- tujuh baris yang tidak bisa
// dibedakan): "ubah nama tiap blok ini jadi judul yang diisi" -- label =
// JUDUL blok (`node.title`, field judul yang diketik kreator sendiri)
// kalau terisi, fallback nama tipe generik kalau kosong. Ini BUKAN
// membatalkan (4): yang ditolak di (4) adalah CUPLIKAN ISI blok
// (block_data teks/jumlah item), dan isi memang TETAP tidak pernah
// dipakai di sini -- blok Teks tanpa judul tetap berlabel "Teks" walau
// isinya panjang (e2e builder-mode.spec.ts mengandalkan ini).
function previewLabelFor(node: BuilderTreeNode, t: (key: string) => string): string {
  if (node.kind === "column-slot") {
    const lastSeg = node.path[node.path.length - 1];
    return `${t("dashboard.pages.linksBuilder.columnLabel")} ${lastSeg && lastSeg.kind === "column" ? lastSeg.index + 1 : ""}`;
  }
  const customTitle = node.title?.trim();
  if (customTitle) return customTitle;
  return t(`dashboard.components.builderAddComponentModal.${TYPE_LABEL_KEY[node.blockType ?? ""] ?? "typeText"}`);
}

// FaqItemsEditor -- Canvas Page Builder Fase 2 (permintaan langsung
// pengguna 8 September 2026): daftar Q&A FLAT di satu layar (BEDA dari
// FaqListFrame/EmbeddedFaqItemFrame drill-down BlockDrilldownEditor.tsx --
// builder tidak perlu navigasi terpisah per pertanyaan, cukup satu panel).
// Item FAQ TIDAK punya id sendiri dari backend (cuma {question, answer}),
// jadi key React dibuat dari INDEX + panjang array (bukan index saja) --
// memaksa seluruh baris REMOUNT (reset defaultValue ke data terbaru)
// setiap kali panjang array berubah (tambah/hapus), menghindari baris yang
// digeser index-nya menampilkan teks BASI dari baris lain (uncontrolled
// input, defaultValue cuma berlaku saat mount pertama).
// FaqItemsEditor -- redesain panel blok (13 September 2026, benchmark
// Linktree, lihat BlockPanelHeader): header ikon+jumlah pertanyaan
// dinamis, tiap item jadi kartu bernomor dengan label eksplisit per
// field (bukan cuma placeholder), bukan cuma baris tipis bertumpuk.
function FaqItemsEditor({ node, onUpdate }: { node: BuilderTreeNode; onUpdate: (items: { question: string; answer: string }[]) => void }) {
  const { t } = useLocale();
  const items = (node.blockData?.items as { question: string; answer: string }[] | undefined) ?? [];
  const subtitle =
    items.length === 0
      ? t("dashboard.pages.linksBuilder.faqEmptySubtitle")
      : t("dashboard.pages.linksBuilder.faqCountSubtitle").replace("{n}", String(items.length));

  function updateItem(index: number, patch: Partial<{ question: string; answer: string }>) {
    onUpdate(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  return (
    <div className="flex flex-col gap-3">
      <BlockPanelHeader node={node} t={t} subtitle={subtitle} />
      <div className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <div key={`${i}-${items.length}`} className="relative flex flex-col gap-2 rounded-xl border border-app-border p-3 pt-4">
            <span className="absolute -top-2.5 left-3 flex h-5 w-5 items-center justify-center rounded-full bg-jeon-purple text-[10px] font-bold text-white">
              {i + 1}
            </span>
            <button
              type="button"
              onClick={() => onUpdate(items.filter((_, idx) => idx !== i))}
              aria-label={t("dashboard.pages.linksBuilder.faqRemoveQuestion")}
              className="absolute right-2.5 top-2.5 text-app-muted hover:text-red-600"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
            <FormField label={t("dashboard.pages.linksBuilder.faqQuestionLabel")}>
              <input
                defaultValue={item.question}
                onBlur={(e) => updateItem(i, { question: e.target.value })}
                placeholder={t("dashboard.pages.linksBuilder.faqQuestionPlaceholder")}
                className="w-full rounded-md border border-app-border p-1.5 pr-6 text-xs outline-none focus:border-jeon-purple"
              />
            </FormField>
            <FormField label={t("dashboard.pages.linksBuilder.faqAnswerLabel")}>
              {/* Jawaban FAQ -- rich text (susulan 12 September 2026, "tiap
                  blok yang ada teks nya buat semua jadi rich teks",
                  dikonfirmasi via AskUserQuestion: field isi/deskripsi panjang
                  saja) -- reuse RichTextEditor sama persis blok "text". */}
              <RichTextEditor html={item.answer} onChange={(html) => updateItem(i, { answer: html })} />
            </FormField>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onUpdate([...items, { question: "", answer: "" }])}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
        >
          <IconPlus className="h-3.5 w-3.5" />
          {t("dashboard.pages.linksBuilder.faqAddQuestion")}
        </button>
      </div>
    </div>
  );
}

// maxCatalogItemImages -- SAMA PERSIS batas backend (maxCatalogImagesPerItem,
// links.go).
const maxCatalogItemImages = 6;

// CatalogItemPhotos -- perbaikan Builder 19 September 2026 (audit: "editor
// foto & blok tertanam Katalog native di Builder"). Ditemukan lewat
// tinjauan kode SEBELUM implementasi (bukan asumsi dari daftar audit
// begitu saja): `item.images[]` MASIH dirender di halaman publik
// (PagePreview.tsx, galeri geser per item) -- TAPI sejak 15 September 2026
// (redesain CatalogItemFrame, "layar item katalog tidak lagi punya field
// title/description/photo manual") UI untuk MENGISINYA dihapus dari
// KEDUA editor (klasik maupun Builder yang baru ditambah C10 sehari
// sebelumnya) -- item lama yang sudah punya foto tetap tampil apa adanya,
// tapi TIDAK ADA cara menambah foto baru ke item mana pun, di mana pun,
// dari 15 September sampai sekarang. Ini PEMULIHAN kapabilitas yang
// hilang, BUKAN pembalikan keputusan 15 September itu (yang mencabut
// field title/description/photo WAJIB di layar item -- title/description
// tetap ada sbg field OPSIONAL di CatalogItemsEditor, lihat di bawah;
// panel ini murni menambahkan galeri foto opsional yang sudah lama
// didukung backend & tampilan publik). Pola upload SAMA PERSIS
// MediaImageEditor (ensureRootPersisted dulu -- item katalog BARU yang
// root-nya "temp-..." harus dipersist dulu sebelum upload bisa
// menunjuk itemId yang benar ke server) + GalleryGridEditor (banyak
// foto, hapus per-indeks).
function CatalogItemPhotos({
  rootId,
  itemId,
  images,
  onEnsureRootPersisted,
  onChanged,
}: {
  rootId: string;
  itemId: string;
  images: string[];
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  // onChanged -- SELALU sertakan `resolvedRootId` (id ASLI dari
  // onEnsureRootPersisted, BUKAN prop `rootId` yang bisa saja masih
  // "temp-..."), pola SAMA PERSIS MediaImageEditor/GalleryGridEditor.
  // Bug ditemukan lewat verifikasi live (19 September 2026): versi
  // pertama fungsi ini cuma mengirim `images` tanpa id, pemanggil
  // (CatalogItemsEditor) lalu memakai `node.rootId` dari closure RENDER
  // (nilai "temp-..." LAMA, sudah diganti id server oleh
  // ensureRootPersistedImpl SAAT upload ini masih berjalan) -- update
  // ke `applyFieldToPath` mencari id lama yang sudah tidak ada di
  // `links`, gagal DIAM-DIAM (early return `if (!root) return list`),
  // foto ke-1 pada item BARU tidak pernah tersimpan di UI walau upload
  // ke server sukses (200).
  onChanged: (images: string[], resolvedRootId: string) => void;
}) {
  const { t } = useLocale();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      const res = await uploadCatalogItemImage(realRootId, itemId, file);
      onChanged(res.images, realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.uploadImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  // uploading dijadikan guard bersama upload & hapus -- alasan SAMA
  // PERSIS GalleryGridEditor (hapus berbasis indeks, dua klik cepat
  // berurutan bisa menghapus foto yang salah kalau tidak saling menunggu).
  async function handleDelete(index: number) {
    if (uploading) return;
    setUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      const res = await deleteCatalogItemImage(realRootId, itemId, index);
      onChanged(res.images, realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.deleteImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {images.map((src, i) => (
          <div key={src} className="group relative h-14 w-14 flex-shrink-0">
            <Image src={src} alt="" fill sizes="56px" className="rounded-md object-cover ring-1 ring-black/5" />
            <button
              type="button"
              onClick={() => handleDelete(i)}
              disabled={uploading}
              title={t("dashboard.pages.linksBuilder.removePhoto")}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
            >
              <IconX className="h-3 w-3" />
            </button>
          </div>
        ))}
        {images.length < maxCatalogItemImages && (
          <label
            className={`flex h-14 w-14 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-app-border text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
              uploading ? "opacity-60" : ""
            }`}
          >
            {uploading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            ) : (
              <IconPlus className="h-4 w-4" />
            )}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        )}
      </div>
      <p className="text-[10px] text-app-muted">
        {images.length}/{maxCatalogItemImages}
      </p>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

// CatalogItemsEditor -- audit ROUND 2 (C10, 14 September 2026): SEBELUMNYA
// blok "catalog" di Builder cuma menampilkan judul blok + link keluar ke
// halaman Tautan, jalan buntu total kalau mau isi item apa pun dari dalam
// Builder sendiri. Pola SAMA PERSIS FaqItemsEditor di atas (kartu bernomor,
// key `${i}-${items.length}` supaya baris yang bergeser index-nya tidak
// menampilkan teks basi dari baris lain, defaultValue+onBlur utk title,
// RichTextEditor utk deskripsi). 19 September 2026: galeri foto per item
// (CatalogItemPhotos di atas) ditambahkan -- lihat catatan lengkap di
// sana kenapa ini pemulihan, bukan fitur baru. Blok tertanam (`blocks[]`,
// sampai 5 tipe termasuk katalog bersarang, navigasi drill-down
// bertingkat) TETAP hanya bisa diatur lewat BlockDrilldownEditor.tsx di
// halaman Tautan (link "fitur lanjutan" di bawah) -- port PENUH navigasi
// drill-down itu ke panel sempit Builder adalah pekerjaan tersendiri yang
// jauh lebih besar, di luar cakupan perbaikan ini.
function CatalogItemsEditor({
  node,
  onUpdate,
  onEnsureRootPersisted,
  onItemImagesChanged,
}: {
  node: BuilderTreeNode;
  onUpdate: (items: CatalogItem[]) => void;
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  // onItemImagesChanged -- BEDA dari `onUpdate` (draft, dipakai title/
  // description): foto upload/hapus IMMEDIATE-write (langsung ke server,
  // sama pola onGalleryImagesChanged dkk), lihat catatan lengkap di
  // CatalogItemPhotos & handleCatalogItemImagesChanged
  // (app/builder/[pageId]/page.tsx) kenapa dipisah dari jalur draft biasa.
  onItemImagesChanged: (rootId: string, itemId: string, images: string[]) => void;
}) {
  const { t } = useLocale();
  const items = (node.blockData?.items as CatalogItem[] | undefined) ?? [];
  const subtitle =
    items.length === 0
      ? t("dashboard.pages.linksBuilder.catalogItemsEmptySubtitle")
      : t("dashboard.pages.linksBuilder.catalogItemsCountSubtitle").replace("{n}", String(items.length));

  function updateItem(index: number, patch: Partial<CatalogItem>) {
    onUpdate(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  return (
    <div className="flex flex-col gap-3">
      <BlockPanelHeader node={node} t={t} subtitle={subtitle} />
      <div className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <div key={`${i}-${items.length}`} className="relative flex flex-col gap-2 rounded-xl border border-app-border p-3 pt-4">
            <span className="absolute -top-2.5 left-3 flex h-5 w-5 items-center justify-center rounded-full bg-jeon-purple text-[10px] font-bold text-white">
              {i + 1}
            </span>
            <button
              type="button"
              onClick={() => onUpdate(items.filter((_, idx) => idx !== i))}
              aria-label={t("dashboard.pages.linksBuilder.catalogRemoveItem")}
              className="absolute right-2.5 top-2.5 text-app-muted hover:text-red-600"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
            <FormField label={t("dashboard.pages.linksBuilder.catalogItemTitleLabel")}>
              <input
                defaultValue={item.title}
                onBlur={(e) => updateItem(i, { title: e.target.value })}
                placeholder={t("dashboard.pages.linksBuilder.catalogItemTitlePlaceholder")}
                className="w-full rounded-md border border-app-border p-1.5 pr-6 text-xs outline-none focus:border-jeon-purple"
              />
            </FormField>
            <FormField label={t("dashboard.pages.linksBuilder.catalogItemDescriptionLabel")}>
              <RichTextEditor html={item.description ?? ""} onChange={(html) => updateItem(i, { description: html })} />
            </FormField>
            <FormField label={t("dashboard.pages.linksBuilder.catalogItemPhotosLabel")}>
              <CatalogItemPhotos
                rootId={node.rootId}
                itemId={item.id}
                images={item.images ?? []}
                onEnsureRootPersisted={onEnsureRootPersisted}
                onChanged={(images, resolvedRootId) => onItemImagesChanged(resolvedRootId, item.id, images)}
              />
            </FormField>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onUpdate([...items, { id: crypto.randomUUID(), title: "", description: "", images: [] }])}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
        >
          <IconPlus className="h-3.5 w-3.5" />
          {t("dashboard.pages.linksBuilder.catalogAddItem")}
        </button>
      </div>
    </div>
  );
}

// MediaImageEditor -- redesain total (10 September 2026): `onChanged`
// SEKARANG menerima URL baru LANGSUNG dari respons upload/delete (bukan
// callback tanpa argumen yang memicu refetch PENUH seperti sebelumnya) --
// rute Builder (arsitektur draft) memakai nilai ini utk menambal HANYA
// path ini di draft & server snapshot sekaligus (lihat handleMediaImageChanged
// di app/builder/[pageId]/page.tsx), supaya edit draft yang BELUM disimpan
// di blok LAIN tidak ikut tertimpa oleh refetch penuh (upload gambar
// SENGAJA tetap langsung ke server terlepas dari status draft, lihat
// catatan lengkap di rencana Fase 2 -- tapi TIDAK BOLEH ikut menghapus
// perubahan draft yang belum disimpan di blok lain).
//
// `ensureRootPersisted` -- ditemukan lewat tinjauan kode sendiri (bukan
// dari plan): endpoint upload/hapus ini butuh id ROOT ASLI dari backend --
// kalau blok/kontainer induknya BARU ditambah & belum pernah disimpan
// (id masih "temp-...", murni draft lokal), upload akan gagal (baris itu
// belum ada di database). Dipanggil DULU (sebelum upload/hapus) -- kalau
// perlu, root itu di-create dulu ke server secara diam-diam, id ASLI hasil
// panggilan itu dipakai utk request upload/hapus MAUPUN dikirim balik ke
// `onChanged` (BUKAN `rootId` prop mentah, yang bisa saja masih sementara).
function MediaImageEditor({
  rootId,
  path,
  imageUrl,
  onEnsureRootPersisted,
  onChanged,
}: {
  rootId: string;
  path: BuilderSeg[];
  imageUrl: string | undefined;
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  onChanged: (imageUrl: string, resolvedRootId: string) => void;
}) {
  const { t } = useLocale();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      const { image_url } = await uploadBuilderMediaImage(realRootId, file, path);
      onChanged(image_url, realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.uploadImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    setUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      await deleteBuilderMediaImage(realRootId, path);
      onChanged("", realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.deleteImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {imageUrl && (
        <div className="group relative h-28 w-full">
          {/* `fill` -- pratinjau ini `h-28 w-full` (tinggi tetap, lebar ikut
              panel kiri Builder yang lebarnya bisa berubah). Pembungkusnya
              sudah `group relative h-28 w-full`. */}
          <Image src={imageUrl} alt="" fill sizes="320px" className="rounded-lg object-cover ring-1 ring-black/5" />
          <button
            type="button"
            onClick={handleDelete}
            disabled={uploading}
            title={t("dashboard.pages.linksBuilder.removePhoto")}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
          >
            <IconX className="h-3 w-3" />
          </button>
        </div>
      )}
      <label
        className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
          uploading ? "opacity-60" : ""
        }`}
      >
        {uploading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
        ) : (
          <IconPlus className="h-3.5 w-3.5" />
        )}
        {uploading
          ? t("dashboard.pages.linksBuilder.uploading")
          : imageUrl
            ? t("dashboard.pages.linksBuilder.replacePhoto")
            : t("dashboard.pages.linksBuilder.uploadPhoto")}
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
        />
      </label>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

// GalleryGridEditor -- lihat catatan lengkap di MediaImageEditor di atas:
// `onChanged` sekarang menerima array `images` TERBARU langsung dari
// respons upload/delete (BUKAN callback tanpa argumen), PLUS id root ASLI
// yang benar-benar dipakai request (lihat `onEnsureRootPersisted`).
function GalleryGridEditor({
  rootId,
  path,
  images,
  blockType,
  display,
  captions,
  onPatchBlockData,
  onEnsureRootPersisted,
  onChanged,
}: {
  rootId: string;
  path: BuilderSeg[];
  images: string[];
  blockType: string;
  // display/captions/onPatchBlockData -- tampilan Tumpukan + keterangan per
  // foto (18 September 2026), paritas dgn panel galeri Links/Toko; patch
  // ditulis ke draft lokal lewat onUpdateNode (pemanggil), pola field lain.
  display: GalleryDisplay;
  captions: Record<string, { title?: string; description?: string }>;
  onPatchBlockData: (patch: Record<string, unknown>) => void;
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  onChanged: (images: string[], resolvedRootId: string) => void;
}) {
  const { t } = useLocale();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      const res = await uploadGalleryImage(realRootId, file, path);
      onChanged(res.images, realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.uploadImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  // uploading dipakai bersama guard upload MAUPUN hapus -- bug ditemukan
  // lewat audit (13 September 2026): SEBELUMNYA hapus tidak pernah
  // men-set `uploading` sama sekali, tombol X tidak pernah disabled --
  // `deleteGalleryImage` berbasis INDEKS, jadi dua klik X cepat berurutan
  // (mis. hapus foto index 1 lalu index 2 sebelum request pertama
  // selesai) berbahaya: request kedua menghapus indeks dari daftar yang
  // sudah bergeser akibat request pertama, salah foto yang terhapus.
  // Guard bersama ini membuat upload & hapus MUTUAL EXCLUSIVE (satu per
  // satu), menutup race ini sepenuhnya.
  async function handleDelete(index: number) {
    if (uploading) return;
    setUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      const res = await deleteGalleryImage(realRootId, index, path);
      onChanged(res.images, realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.deleteImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-app-muted">
          {images.length}/{maxGalleryImages}
        </p>
      </div>
      {blockType === "gallery" && <GalleryDisplayPicker value={display} onChange={(next) => onPatchBlockData({ display: next })} />}
      {images.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {images.map((src, i) => {
            const cap = captions[src] ?? {};
            const saveCaption = (field: "title" | "description", value: string) => {
              if ((cap[field] ?? "") === value.trim()) return;
              onPatchBlockData({ captions: { ...captions, [src]: { ...cap, [field]: value.trim() } } });
            };
            return (
              <div key={src} className="flex items-start gap-2 rounded-md border border-app-border bg-app-surface p-1.5">
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
                  onClick={() => handleDelete(i)}
                  disabled={uploading}
                  title={t("dashboard.pages.linksBuilder.removePhoto")}
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-app-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {images.length < maxGalleryImages && (
          <label
            className={`flex h-16 w-16 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-app-border text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
              uploading ? "opacity-60" : ""
            }`}
          >
            {uploading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            ) : (
              <IconPlus className="h-4 w-4" />
            )}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

// AudioUploadEditor/FileUploadEditor -- Fase 4 (13 September 2026, blok
// klasik "audio"/"file" ditambahkan ke Builder): pola SAMA PERSIS
// MediaImageEditor di atas (SATU file per blok, upload/hapus langsung ke
// server terlepas status draft, `onEnsureRootPersisted` dulu supaya blok
// "temp-..." yang belum pernah disimpan tetap bisa diunggah). Audio
// PUNYA field title auto-derive dari tag ID3 -- backend HANYA mengisi
// `title` di respons kalau path kosong (root), lihat catatan lengkap di
// UploadAudio (links.go) -- makanya `onChanged` audio ikut membawa title
// opsional, file tidak pernah menyentuh title sama sekali.
function AudioUploadEditor({
  rootId,
  path,
  audioUrl,
  onEnsureRootPersisted,
  onChanged,
}: {
  rootId: string;
  path: BuilderSeg[];
  audioUrl: string | undefined;
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  onChanged: (patch: { audio_url: string; title?: string }, resolvedRootId: string) => void;
}) {
  const { t } = useLocale();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      const res = path.length > 0 ? await uploadAudioBlock(realRootId, file, path) : await uploadAudioBlock(realRootId, file);
      onChanged({ audio_url: res.audio_url, title: res.title }, realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.uploadImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    setUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      await deleteAudioBlock(realRootId, path);
      onChanged({ audio_url: "" }, realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.deleteImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {audioUrl && (
        <div className="flex items-center gap-2">
          <audio controls src={audioUrl} className="h-9 flex-1" />
          <button
            type="button"
            onClick={handleDelete}
            disabled={uploading}
            title={t("dashboard.pages.linksBuilder.removePhoto")}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <label
        className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
          uploading ? "opacity-60" : ""
        }`}
      >
        {uploading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
        ) : (
          <IconPlus className="h-3.5 w-3.5" />
        )}
        {uploading ? t("dashboard.pages.linksBuilder.uploading") : audioUrl ? t("dashboard.pages.linksBuilder.replacePhoto") : t("dashboard.pages.linksBuilder.uploadPhoto")}
        <input type="file" accept=".mp3,.wav,.m4a,.ogg,audio/*" onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

function FileUploadEditor({
  rootId,
  path,
  fileUrl,
  fileName,
  onEnsureRootPersisted,
  onChanged,
}: {
  rootId: string;
  path: BuilderSeg[];
  fileUrl: string | undefined;
  fileName: string | undefined;
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  onChanged: (patch: { file_url: string; file_name?: string; file_size_bytes?: number }, resolvedRootId: string) => void;
}) {
  const { t } = useLocale();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      const res = await uploadFileBlock(realRootId, file, path);
      onChanged({ file_url: res.file_url, file_name: res.file_name, file_size_bytes: res.file_size_bytes }, realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.uploadImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    setUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      await deleteFileBlock(realRootId, path);
      onChanged({ file_url: "" }, realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.deleteImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {fileUrl && (
        <div className="flex items-center gap-2 rounded-lg border border-app-border p-2">
          <IconFileText className="h-4 w-4 flex-shrink-0 text-app-muted" />
          <span className="min-w-0 flex-1 truncate text-xs text-app-ink">{fileName || fileUrl}</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={uploading}
            title={t("dashboard.pages.linksBuilder.removePhoto")}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
          >
            <IconX className="h-3 w-3" />
          </button>
        </div>
      )}
      <label
        className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
          uploading ? "opacity-60" : ""
        }`}
      >
        {uploading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
        ) : (
          <IconPlus className="h-3.5 w-3.5" />
        )}
        {uploading ? t("dashboard.pages.linksBuilder.uploading") : fileUrl ? t("dashboard.pages.linksBuilder.replacePhoto") : t("dashboard.pages.linksBuilder.uploadPhoto")}
        <input type="file" accept=".pdf,.zip,.epub" onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

// MapsEditor -- Canvas Page Builder Fase 3, block "maps" (ROOT-ONLY, lihat
// catatan lengkap di plan): url+embed WAJIB dikirim BERSAMAAN dalam SATU
// PATCH tiap kali salah satunya berubah (BUKAN per-field onBlur independen
// spt panel lain) -- backend (UpdateLink, links.go) cuma menjalankan
// resolveMapsEmbedCoords ulang ketika `block_data.embed` ADA di payload
// PATCH yang sama, jadi kalau url & embed dikirim terpisah, mengedit URL
// SETELAH toggle embed sudah aktif akan meninggalkan koordinat lama/basi.
// State lokal (url/embed) dipakai supaya nilai TERBARU dari KEDUA field
// selalu ikut terbawa, apa pun yang baru saja diubah pengguna -- di rute
// Builder yang baru, "onUpdate" di sini menulis ke DRAFT lokal (bukan
// langsung API), jadi catatan di atas soal satu-PATCH-sekaligus sekarang
// berlaku terhadap satu setLinks() sekaligus, bukan satu HTTP request.
function MapsEditor({ node, onUpdate }: { node: BuilderTreeNode; onUpdate: (url: string, embed: boolean) => void }) {
  const { t } = useLocale();
  const [url, setUrl] = useState(node.url ?? "");
  const [embed, setEmbed] = useState(Boolean(node.blockData?.embed));

  return (
    <div className="flex flex-col gap-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => onUpdate(url, embed)}
        placeholder={t("dashboard.pages.linksBuilder.mapsUrlPlaceholder")}
        className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
      />
      <label className="flex items-center gap-2 text-xs text-app-ink">
        <input
          type="checkbox"
          checked={embed}
          onChange={(e) => {
            setEmbed(e.target.checked);
            onUpdate(url, e.target.checked);
          }}
        />
        {t("dashboard.pages.linksBuilder.mapsEmbedToggle")}
      </label>
    </div>
  );
}

// BlockPanelHeader -- redesain panel edit blok (permintaan langsung
// pengguna 13 September 2026, "saya mau redesign ui dan ux setiap blok
// mengikuti benchmark seperti di linktree" -- draf disetujui via Artifact
// sebelum implementasi). Header ikon+nama tipe+subjudul di atas tiap
// panel, supaya jelas blok APA yang sedang diedit tanpa perlu lihat tree
// -- reuse TYPE_ICON/TYPE_LABEL_KEY yang sudah ada, TIDAK menambah
// pemetaan baru. `subtitle` opsional -- kalau tidak diisi, jatuh ke
// deskripsi statis tipe blok (typeXDesc, sudah ada dari
// BuilderAddComponentModal.tsx); diisi kalau panel butuh info DINAMIS
// (mis. "2 pertanyaan", "1 produk dipilih"). Diterapkan BERTAHAP: Tahap 1
// (Tombol/Video/FAQ/Produk, tersering dipakai) lalu Tahap 2/3 SAMA HARI
// (13 September 2026, permintaan "lanjut") merampungkan SEMUA tipe blok
// tersisa dgn pola yang SAMA -- SEMUA tipe blok di panel ini sekarang
// pakai header ini, TIDAK ADA lagi yang tertinggal di pola lama. Kalau
// sesi mendatang menemukan tipe blok TANPA header ini, itu genuinely
// terlewat (bukan "belum sempat", lihat riwayat lengkap di atas), layak
// diperbaiki.
function BlockPanelHeader({ node, t, subtitle }: { node: BuilderTreeNode; t: (key: string) => string; subtitle?: string }) {
  const Icon = TYPE_ICON[node.blockType ?? ""] ?? IconBox;
  const typeLabelKey = TYPE_LABEL_KEY[node.blockType ?? ""] ?? "typeText";
  const title = t(`dashboard.components.builderAddComponentModal.${typeLabelKey}`);
  const desc = subtitle ?? t(`dashboard.components.builderAddComponentModal.${typeLabelKey}Desc`);
  return <BlockPanelHeaderView icon={Icon} title={title} subtitle={desc} />;
}

// NodeFieldEditor -- redesain total (10 September 2026): badan JSX dari
// panel "Edit Blok Terpilih" LAMA (dulu satu blok terpisah, mengambang di
// BAWAH seluruh tree) -- APA ADANYA (per-blockType switch yang sama persis),
// cuma diekstrak jadi komponen sendiri supaya bisa dirender IN-PLACE di
// bawah baris accordion node yang sedang dipilih (lihat TreeNodeView di
// bawah), bukan di lokasi tetap terpisah dari daftar blok.
function NodeFieldEditor({
  node,
  onUpdateNode,
  onEnsureRootPersisted,
  onMediaImageChanged,
  onGalleryImagesChanged,
  onAudioChanged,
  onFileChanged,
  onCatalogItemImagesChanged,
  products,
  onProductCreated,
}: {
  node: BuilderTreeNode;
  onUpdateNode: (target: BuilderSelection, patch: BuilderNodePatch) => void;
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  onMediaImageChanged: (rootId: string, path: BuilderSeg[], imageUrl: string) => void;
  onGalleryImagesChanged: (rootId: string, path: BuilderSeg[], images: string[]) => void;
  onAudioChanged: (rootId: string, path: BuilderSeg[], patch: { audio_url: string; title?: string }) => void;
  onFileChanged: (rootId: string, path: BuilderSeg[], patch: { file_url: string; file_name?: string; file_size_bytes?: number }) => void;
  // onCatalogItemImagesChanged -- foto per item Katalog (19 September
  // 2026), immediate-write spt onGalleryImagesChanged dkk di atas, lihat
  // catatan lengkap di CatalogItemPhotos/CatalogItemsEditor.
  onCatalogItemImagesChanged: (rootId: string, itemId: string, images: string[]) => void;
  products: DashboardProduct[];
  onProductCreated: (product: DashboardProduct) => void;
}) {
  const { t } = useLocale();
  const sel = selectionOf(node);

  if (node.blockType === "text") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <RichTextEditor
          key={node.id}
          html={(node.blockData?.text as string) ?? ""}
          onChange={(html) => onUpdateNode(sel, { blockData: { text: html } })}
        />
      </div>
    );
  }

  // "heading" -- Fase 4 (13 September 2026): SEBELUMNYA tipe legacy
  // landing-page saja (lihat LandingPagePreview, PagePreview.tsx), tidak
  // pernah punya editor apa pun -- sekarang blok Builder biasa, isi teks
  // sama persis "text" (RichTextEditor), bedanya cuma cara tampil di
  // halaman publik (judul besar, bukan paragraf).
  if (node.blockType === "heading") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <RichTextEditor
          key={node.id}
          html={(node.blockData?.text as string) ?? ""}
          onChange={(html) => onUpdateNode(sel, { blockData: { text: html } })}
        />
      </div>
    );
  }

  // "link" -- tautan biasa klasik (mis. "Follow di Instagram" dari template
  // Quick Setup), bukan blok Canvas -- TAPI baris `links` yang sama dibagi
  // rata antara editor klasik (dashboard/links/page.tsx) & tree builder ini
  // (buildTree tidak menyaring block_type sama sekali), jadi tautan lama
  // MUNCUL di sini juga. Bug ditemukan lewat laporan langsung pengguna (10
  // September 2026, screenshot "Follow di Instagram" menampilkan pesan
  // "blok ini murni wadah" yang SALAH -- fallback lama tidak mengenali tipe
  // ini sama sekali) -- field MINIMAL (judul+url) yang sama seperti "button".
  // Subjudul "ikon/kunci/jadwal masih di halaman Tautan" DIHAPUS 19
  // September 2026 -- sudah TIDAK BENAR sejak RootToolsPanel (lihat di
  // atas TreeNodeView) menaruh kontrol itu LANGSUNG di sini juga.
  if (node.blockType === "link") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <div className="flex flex-col gap-2.5 rounded-xl bg-app-surface-2 p-3">
          <FormField label={t("dashboard.pages.linksBuilder.buttonTitlePlaceholder")}>
            <input
              defaultValue={node.title}
              onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.linksBuilder.buttonUrlLabel")}>
            <input
              defaultValue={node.url ?? ""}
              onBlur={(e) => onUpdateNode(sel, { url: e.target.value })}
              placeholder={t("dashboard.pages.linksBuilder.buttonUrlPlaceholder")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
        </div>
      </div>
    );
  }

  if (node.blockType === "button") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <div className="flex flex-col gap-2.5 rounded-xl bg-app-surface-2 p-3">
          <FormField label={t("dashboard.pages.linksBuilder.buttonTitlePlaceholder")}>
            <input
              defaultValue={node.title}
              onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.linksBuilder.buttonUrlLabel")} hint={t("dashboard.pages.linksBuilder.buttonUrlHint")}>
            <input
              defaultValue={node.url ?? ""}
              onBlur={(e) => onUpdateNode(sel, { url: e.target.value })}
              placeholder={t("dashboard.pages.linksBuilder.buttonUrlPlaceholder")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
        </div>
      </div>
    );
  }

  if (node.blockType === "video") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <div className="flex flex-col gap-2.5 rounded-xl bg-app-surface-2 p-3">
          <FormField label={t("dashboard.pages.linksBuilder.videoTitlePlaceholder")}>
            <input
              defaultValue={node.title}
              onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.linksBuilder.videoUrlLabel")}>
            <input
              defaultValue={(node.blockData?.video_url as string) ?? ""}
              onBlur={(e) => onUpdateNode(sel, { blockData: { video_url: e.target.value } })}
              placeholder={t("dashboard.pages.linksBuilder.videoUrlPlaceholder")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
        </div>
      </div>
    );
  }

  if (node.blockType === "faq") {
    return <FaqItemsEditor node={node} onUpdate={(items) => onUpdateNode(sel, { blockData: { items } })} />;
  }

  if (node.blockType === "image") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <MediaImageEditor
          key={node.id}
          rootId={node.rootId}
          path={node.path}
          imageUrl={(node.blockData?.image_url as string) || undefined}
          onEnsureRootPersisted={onEnsureRootPersisted}
          onChanged={(url, resolvedRootId) => onMediaImageChanged(resolvedRootId, node.path, url)}
        />
      </div>
    );
  }

  if (node.blockType === "gallery" || node.blockType === "image_slider") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <GalleryGridEditor
          key={node.id}
          rootId={node.rootId}
          path={node.path}
          images={(node.blockData?.images as string[] | undefined) ?? []}
          blockType={node.blockType ?? "gallery"}
          display={normalizeGalleryDisplay(node.blockData?.display)}
          captions={(node.blockData?.captions as Record<string, { title?: string; description?: string }> | undefined) ?? {}}
          onPatchBlockData={(patch) => onUpdateNode(sel, { blockData: patch })}
          onEnsureRootPersisted={onEnsureRootPersisted}
          onChanged={(images, resolvedRootId) => onGalleryImagesChanged(resolvedRootId, node.path, images)}
        />
      </div>
    );
  }

  if (node.blockType === "video_image") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <FormField label={t("dashboard.pages.linksBuilder.videoUrlLabel")}>
          <input
            defaultValue={(node.blockData?.video_url as string) ?? ""}
            onBlur={(e) => onUpdateNode(sel, { blockData: { video_url: e.target.value } })}
            placeholder={t("dashboard.pages.linksBuilder.videoUrlPlaceholder")}
            className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
          />
        </FormField>
        <MediaImageEditor
          key={node.id}
          rootId={node.rootId}
          path={node.path}
          imageUrl={(node.blockData?.image_url as string) || undefined}
          onEnsureRootPersisted={onEnsureRootPersisted}
          onChanged={(url, resolvedRootId) => onMediaImageChanged(resolvedRootId, node.path, url)}
        />
      </div>
    );
  }

  if (node.blockType === "embed_link") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <div className="flex flex-col gap-2.5 rounded-xl bg-app-surface-2 p-3">
          <FormField label={t("dashboard.pages.linksBuilder.embedLinkTitlePlaceholder")}>
            <input
              defaultValue={node.title}
              onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.linksBuilder.embedLinkUrlLabel")}>
            <input
              defaultValue={node.url ?? ""}
              onBlur={(e) => onUpdateNode(sel, { url: e.target.value })}
              placeholder={t("dashboard.pages.linksBuilder.embedLinkUrlPlaceholder")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.linksBuilder.embedLinkDescLabel")}>
            {/* Deskripsi Embed Link -- rich text (susulan 12 September 2026,
                "tiap blok yang ada teks nya buat semua jadi rich teks",
                dikonfirmasi via AskUserQuestion: field isi/deskripsi panjang
                saja) -- reuse RichTextEditor sama persis blok "text". */}
            <RichTextEditor
              key={node.id}
              html={node.description ?? ""}
              onChange={(html) => onUpdateNode(sel, { description: html })}
            />
          </FormField>
        </div>
        <MediaImageEditor
          key={node.id}
          rootId={node.rootId}
          path={node.path}
          imageUrl={(node.blockData?.image_url as string) || undefined}
          onEnsureRootPersisted={onEnsureRootPersisted}
          onChanged={(url, resolvedRootId) => onMediaImageChanged(resolvedRootId, node.path, url)}
        />
      </div>
    );
  }

  if (node.blockType === "countdown") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <div className="flex flex-col gap-2.5 rounded-xl bg-app-surface-2 p-3">
          <FormField label={t("dashboard.pages.linksBuilder.countdownTitlePlaceholder")}>
            <input
              defaultValue={node.title}
              onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.linksBuilder.countdownTargetLabel")}>
            <input
              type="datetime-local"
              defaultValue={toDatetimeLocalValue(node.blockData?.target_at as string | undefined)}
              onBlur={(e) =>
                onUpdateNode(sel, {
                  blockData: { target_at: e.target.value ? new Date(e.target.value).toISOString() : "" },
                })
              }
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
        </div>
      </div>
    );
  }

  if (node.blockType === "list") {
    const listItems = (node.blockData?.items as { title: string; description?: string; author?: string }[] | undefined) ?? [];
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader
          node={node}
          t={t}
          subtitle={
            listItems.length === 0
              ? t("dashboard.pages.linksBuilder.listEmptySubtitle")
              : t("dashboard.pages.linksBuilder.listCountSubtitle").replace("{n}", String(listItems.length))
          }
        />
        <ListItemsEditor
          style={(node.blockData?.style as "list" | "card" | "testimony" | undefined) ?? "list"}
          items={listItems}
          onUpdateStyle={(style) => onUpdateNode(sel, { blockData: { style } })}
          onUpdateItems={(items) => onUpdateNode(sel, { blockData: { items } })}
        />
      </div>
    );
  }

  if (node.blockType === "embed") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <div className="flex flex-col gap-2.5 rounded-xl bg-app-surface-2 p-3">
          <FormField label={t("dashboard.pages.linksBuilder.embedTitlePlaceholder")}>
            <input
              defaultValue={node.title}
              onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.linksBuilder.embedUrlLabel")} hint={t("dashboard.pages.linksBuilder.embedHint")}>
            <input
              defaultValue={(node.blockData?.embed_url as string) ?? ""}
              onBlur={(e) => onUpdateNode(sel, { blockData: { embed_url: e.target.value } })}
              placeholder={t("dashboard.pages.linksBuilder.embedUrlPlaceholder")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
        </div>
      </div>
    );
  }

  if (node.blockType === "maps") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <MapsEditor node={node} onUpdate={(url, embed) => onUpdateNode(sel, { url, blockData: { embed } })} />
      </div>
    );
  }

  if (node.blockType === "produk") {
    return (
      <ProdukBlockEditor
        blockData={node.blockData}
        products={products}
        onToggleProduct={(productId) => {
          const current = getBlockProductIds(node.blockData);
          const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
          onUpdateNode(sel, { blockData: { product_ids: next } });
        }}
        onProductCreated={(product) => {
          onProductCreated(product);
          onUpdateNode(sel, { blockData: { product_ids: [...getBlockProductIds(node.blockData), product.id] } });
        }}
        onLayoutChange={(layout) => onUpdateNode(sel, { blockData: { layout } })}
        onShowCategoryFilterChange={(show) => onUpdateNode(sel, { blockData: { show_category_filter: show } })}
      />
    );
  }

  // "accordion" -- Fase 4 (13 September 2026): title = pertanyaan yang
  // diklik pengunjung utk buka isinya (sama persis field `title` node
  // ini), body = RichTextEditor blockData.text -- render publiknya reuse
  // FaqBlock 1-item (lihat renderBuilderNode/PagePreview.tsx), field &
  // placeholder di sini SENGAJA reuse namespace blockForm.* Simple Mode
  // (sudah ada, t() tidak terikat rute -- lihat catatan i18n key insertion
  // pitfall).
  if (node.blockType === "accordion") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <div className="flex flex-col gap-2.5 rounded-xl bg-app-surface-2 p-3">
          <FormField
            label={t("dashboard.pages.linksBuilder.accordionTitleLabel")}
            hint={t("dashboard.pages.links.blockForm.titleHint.accordion")}
          >
            <input
              defaultValue={node.title}
              onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
              placeholder={t("dashboard.pages.links.blockForm.titlePlaceholder.accordion")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.linksBuilder.faqAnswerLabel")}>
            <RichTextEditor
              key={node.id}
              html={(node.blockData?.text as string) ?? ""}
              onChange={(html) => onUpdateNode(sel, { blockData: { text: html } })}
            />
          </FormField>
        </div>
      </div>
    );
  }

  // "contact_form" -- Fase 4 (13 September 2026). Dulu ROOT-ONLY karena
  // SubmitContactForm resolve linkID langsung ke baris `links`; sejak 18
  // September 2026 backend mencari blok tertanam lewat root_link_id
  // (links.go), jadi editor ini dipakai utk root MAUPUN bersarang -- tidak
  // ada asumsi root di sini. Title saja, sama seperti "button" tanpa url
  // -- isi form sendiri (nama/email/pesan) di-render langsung oleh
  // ContactFormBlock, tidak ada field lain utk diedit di sini.
  if (node.blockType === "contact_form") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <div className="rounded-xl bg-app-surface-2 p-3">
          <FormField label={t("dashboard.pages.linksBuilder.genericTitleLabel")}>
            <input
              defaultValue={node.title}
              onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
              placeholder={t("dashboard.pages.links.blockForm.titlePlaceholder.default")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
        </div>
      </div>
    );
  }

  // "audio"/"file" -- Fase 4 (13 September 2026): title + AudioUploadEditor/
  // FileUploadEditor (path-aware, lihat catatan lengkap di komponen itu
  // sendiri di atas).
  if (node.blockType === "audio") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <FormField label={t("dashboard.pages.linksBuilder.genericTitleLabel")}>
          <input
            defaultValue={node.title}
            onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
            placeholder={t("dashboard.pages.links.blockForm.titlePlaceholder.default")}
            className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
          />
        </FormField>
        <AudioUploadEditor
          key={node.id}
          rootId={node.rootId}
          path={node.path}
          audioUrl={(node.blockData?.audio_url as string) || undefined}
          onEnsureRootPersisted={onEnsureRootPersisted}
          onChanged={(patch, resolvedRootId) => onAudioChanged(resolvedRootId, node.path, patch)}
        />
      </div>
    );
  }

  if (node.blockType === "file") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <FormField label={t("dashboard.pages.linksBuilder.genericTitleLabel")}>
          <input
            defaultValue={node.title}
            onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
            placeholder={t("dashboard.pages.links.blockForm.titlePlaceholder.default")}
            className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
          />
        </FormField>
        <FileUploadEditor
          key={node.id}
          rootId={node.rootId}
          path={node.path}
          fileUrl={(node.blockData?.file_url as string) || undefined}
          fileName={node.blockData?.file_name as string | undefined}
          onEnsureRootPersisted={onEnsureRootPersisted}
          onChanged={(patch, resolvedRootId) => onFileChanged(resolvedRootId, node.path, patch)}
        />
      </div>
    );
  }

  // "project_showcase" -- Fase 4 (13 September 2026): pola SAMA PERSIS
  // "embed_link" di atas (title+url+rich-text description+gambar), url
  // di sini WAJIB (CTA, ditegakkan backend saat create ROOT) -- gambar
  // lewat MediaImageEditor yang sama (project_showcase SEKARANG masuk
  // mediaImageBlockTypes, links.go).
  if (node.blockType === "project_showcase") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <div className="flex flex-col gap-2.5 rounded-xl bg-app-surface-2 p-3">
          <FormField label={t("dashboard.pages.linksBuilder.genericTitleLabel")}>
            <input
              defaultValue={node.title}
              onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
              placeholder={t("dashboard.pages.links.blockForm.titlePlaceholder.projectShowcase")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.links.blockForm.showcase.badgeLabel")} hint={t("dashboard.pages.links.blockForm.showcase.badgeHint")}>
            <input
              defaultValue={(node.blockData?.badge_text as string) ?? ""}
              onBlur={(e) => onUpdateNode(sel, { blockData: { badge_text: e.target.value } })}
              placeholder={t("dashboard.pages.links.blockForm.showcase.badgePlaceholder")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          {/* url -- WAJIB utk root (backend menolak project_showcase root
              tanpa url, links.go). */}
          <FormField label={t("dashboard.pages.links.blockForm.showcase.ctaUrlLabel")} hint={t("dashboard.pages.links.blockForm.showcase.ctaUrlHint")}>
            <input
              defaultValue={node.url ?? ""}
              onBlur={(e) => onUpdateNode(sel, { url: e.target.value })}
              placeholder="https://..."
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.links.blockForm.showcase.ctaTextLabel")} hint={t("dashboard.pages.links.blockForm.showcase.ctaTextHint")}>
            <input
              defaultValue={(node.blockData?.cta_text as string) ?? ""}
              onBlur={(e) => onUpdateNode(sel, { blockData: { cta_text: e.target.value } })}
              placeholder={t("dashboard.pages.links.blockForm.showcase.ctaTextPlaceholder")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
          <FormField label={t("dashboard.pages.links.blockForm.showcase.descriptionLabel")}>
            <RichTextEditor key={node.id} html={node.description ?? ""} onChange={(html) => onUpdateNode(sel, { description: html })} />
          </FormField>
        </div>
        <MediaImageEditor
          key={node.id}
          rootId={node.rootId}
          path={node.path}
          imageUrl={(node.blockData?.image_url as string) || undefined}
          onEnsureRootPersisted={onEnsureRootPersisted}
          onChanged={(url, resolvedRootId) => onMediaImageChanged(resolvedRootId, node.path, url)}
        />
      </div>
    );
  }

  // "catalog" -- ROOT-ONLY (keputusan v1, sama seperti backend, lihat
  // allowedBuilderEmbeddedBlockTypes/links.go). Item (judul+deskripsi)
  // SEKARANG bisa diisi native di sini lewat CatalogItemsEditor (audit
  // ROUND 2, C10 -- lihat catatan lengkap di deklarasi komponennya):
  // SEBELUMNYA panel ini cuma judul blok + link keluar, jalan buntu
  // total. Foto per item & blok tertanam (video/FAQ/lokasi/katalog
  // bersarang) TETAP hanya lewat halaman Tautan (link "fitur lanjutan"
  // di bawah, BlockDrilldownEditor.tsx) -- di luar cakupan.
  if (node.blockType === "catalog") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-app-surface-2 p-3">
          <FormField label={t("dashboard.pages.linksBuilder.genericTitleLabel")}>
            <input
              defaultValue={node.title}
              onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
              placeholder={t("dashboard.pages.links.blockForm.titlePlaceholder.default")}
              className="w-full rounded-lg border border-app-border bg-app-surface p-2 text-xs outline-none focus:border-jeon-purple"
            />
          </FormField>
        </div>
        <CatalogItemsEditor
          node={node}
          onUpdate={(items) => onUpdateNode(sel, { blockData: { items } })}
          onEnsureRootPersisted={onEnsureRootPersisted}
          onItemImagesChanged={onCatalogItemImagesChanged}
        />
        <Link href="/dashboard/links" target="_blank" className="text-center text-[11px] font-semibold text-jeon-purple underline">
          {t("dashboard.pages.linksBuilder.catalogOpenInLinksPage")}
        </Link>
      </div>
    );
  }

  if (node.blockType === "column") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <div className="flex items-center gap-2 rounded-xl bg-app-surface-2 p-3">
          <label className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.columnCount")}</label>
          <select
            defaultValue={((node.blockData?.columns as unknown[] | undefined)?.length ?? 2).toString()}
            onChange={(e) => {
              const count = Number(e.target.value);
              const existing = (node.blockData?.columns as { children?: EmbeddedBuilderBlock[] }[] | undefined) ?? [];
              // Konfirmasi kalau MENGURANGI jumlah kolom akan membuang isi
              // kolom yang dibuang (bug ditemukan lewat audit, 13 September
              // 2026): SEBELUMNYA mengganti 4->2 langsung menghapus
              // columns[2]/columns[3] BESERTA SEMUA blok di dalamnya,
              // instan (onChange, bukan onBlur) tanpa peringatan ATAU undo
              // -- salah pilih di dropdown = kehilangan data.
              const droppedColumns = existing.slice(count);
              const willLoseContent = droppedColumns.some((col) => (col.children ?? []).length > 0);
              if (willLoseContent && !window.confirm(t("dashboard.pages.linksBuilder.columnReduceWarning"))) {
                e.target.value = String(existing.length || 2);
                return;
              }
              const columns = Array.from({ length: count }, (_, i) => existing[i] ?? { children: [] });
              onUpdateNode(sel, { blockData: { columns } });
            }}
            className="rounded-lg border border-app-border bg-app-surface px-2 py-1 text-xs outline-none focus:border-jeon-purple"
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  // "divider" -- BUKAN kontainer (tidak punya children, canExpand di
  // TreeNodeView bawah SUDAH TIDAK menyertakannya), jadi pesan
  // containerHint ("pilih salah satu isinya...") tidak nyambung sama
  // sekali kalau dipakai di sini. Bug ditemukan lewat audit (13 September
  // 2026, kategori sama dgn perbaikan "link" 10 September di atas) --
  // sebelumnya ikut baris section/column-slot di bawah, dipisah sendiri
  // dgn pesan yang jujur soal batasannya.
  if (node.blockType === "divider") {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader node={node} t={t} />
        <p className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.dividerNoSettings")}</p>
      </div>
    );
  }

  // section/column-slot -- murni wadah, tidak ada field sendiri.
  if (node.kind === "column-slot" || node.blockType === "section") {
    return <p className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.containerHint")}</p>;
  }

  // Fallback murni jaga-jaga -- SEMUA block_type yang dikenal repo ini
  // sekarang punya case sendiri di atas (Fase 4, 13 September 2026,
  // melengkapi heading/contact_form/accordion/audio/file/project_showcase/
  // catalog yang SEBELUMNYA jatuh ke sini dengan pesan "blok ini murni
  // wadah" yang salah -- bug ditemukan lewat laporan langsung pengguna 10
  // September 2026). Baris ini seharusnya TIDAK PERNAH ter-render lagi
  // kecuali ada block_type baru yang lupa ditambah case-nya.
  return <p className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.legacyBlockHint")}</p>;
}

// TreeNodeView -- redesain total (permintaan langsung pengguna 10 September
// 2026, referensi "LYNK": "ketika kita mau merubah isi tiap blok/component
// kita klik sekali pada blok nya baru muncul opsi merubah nya"): SEBELUMNYA
// klik baris di tree cuma menyalakan `isSelected` (dipakai HANYA sbg
// highlight visual) sementara editor field-nya mengambang terpisah di
// BAWAH SELURUH tree (`{selectedNode && (...)}` lama) -- pengguna harus
// scroll turun mencarinya, tidak jelas blok mana yang sedang diedit kalau
// tree panjang. SEKARANG: baris yang TERPILIH langsung expand IN-PLACE
// menampilkan NodeFieldEditor tepat di bawah dirinya sendiri (accordion),
// mendorong baris-baris lain -- BUKAN mengubah `canExpand`/`collapsed`
// (itu MASIH murni utk anak Section/Column, konsep terpisah dari "sedang
// diedit").
// selectionsEqual -- bug ditemukan lewat audit ROUND 2 (13 September
// 2026): pengecekan "apakah seleksi berubah" di bawah (pola resmi
// "adjust state during render") membandingkan `selection` lewat
// IDENTITAS OBJEK (`!==`) -- ensureRootPersisted & commitSave
// (app/builder/[pageId]/page.tsx) SAMA-SAMA menambal `selection.rootId`
// dari id sementara ke id asli lewat `setSelection((prev) => ({...prev,
// rootId: ...}))`, objek BARU meski secara LOGIS seleksinya tidak
// berubah sama sekali -- perbandingan reference menganggap ini "seleksi
// baru" & memaksa tab balik ke "Konten", membatalkan pindah tab manual
// pengguna ke "Desain"/"Pengaturan" persis saat upload/Save selesai.
// Dibandingkan lewat NILAI (rootId+path) di sini supaya remap id murni
// tidak dianggap seleksi baru.
function selectionsEqual(a: BuilderSelection | null, b: BuilderSelection | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.rootId === b.rootId && JSON.stringify(a.path) === JSON.stringify(b.path);
}

// collectAncestorIds -- bug ditemukan lewat audit (13 September 2026):
// memilih blok lewat KANVAS (BuilderCanvas.tsx, klik langsung di
// pratinjau) tidak pernah membuka otomatis Section/Column/kolom
// pembungkusnya kalau sedang di-collapse -- ring ungu menyala di kanvas,
// tapi panel kiri tidak menampilkan APA PUN (baris & editornya
// tersembunyi di dalam kontainer yang collapsed), jalan buntu total.
// Fungsi ini menelusuri `path` seleksi turun dari root, mengumpulkan id
// SETIAP kontainer (Section/Column blok ATAU kolom-slot "Kolom N") yang
// dilewati SEBELUM node target sendiri -- dipakai utk menghapus id-id
// itu dari `collapsed` begitu seleksi berubah (lihat efek di
// BuilderLeftPanel di bawah).
function collectAncestorIds(tree: BuilderTreeNode[], rootId: string, path: BuilderSeg[]): string[] {
  const root = tree.find((n) => n.rootId === rootId && n.path.length === 0);
  if (!root) return [];
  // Bug ditemukan lewat audit ROUND 2 (13 September 2026): loop di bawah
  // cuma mengumpulkan ancestor DI ANTARA root & target -- utk path
  // sepanjang 1 (anak LANGSUNG root, mis. klik anak Section top-level
  // lewat kanvas) loop TIDAK PERNAH jalan sama sekali (`0 < 0` false),
  // jadi id root itu SENDIRI tidak pernah masuk `ids` & tidak pernah
  // dihapus dari `collapsed` -- bug asli yang mau diperbaiki fungsi ini
  // (ring ungu menyala di kanvas, panel kiri tidak menampilkan apa pun)
  // masih terjadi persis, cuma butuh root-nya collapsed (bukan 2 level
  // ke bawah) utk memicunya. Root SELALU relevan begitu path tidak
  // kosong -- masukkan lebih dulu di sini, di luar loop penelusuran anak.
  const ids: string[] = path.length > 0 ? [root.id] : [];
  let current = root;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const next: BuilderTreeNode | undefined =
      seg.kind === "child" ? current.children.find((c) => c.kind === "block" && c.id === seg.id) : current.children[seg.index];
    if (!next) break;
    ids.push(next.id);
    current = next;
  }
  return ids;
}

// RootToolsPanel -- paritas BlockToolsStrip (19 September 2026, audit
// Builder: "menu ⋮ hanya Duplikat+Hapus, tidak ada jadwal/kunci/ikon/
// unggulan seperti Mode Simple"). HANYA dipasang utk root (lihat
// TreeNodeView), field-fieldnya murni `links` (BuilderTreeNode.isActive
// dkk, lihat catatan lengkap di lib/builder-blocks.ts) -- tidak ada
// padanan blok bersarang.
//
// Jadwal/kunci/unggulan/warna+galeri ikon SEMUA draft (onUpdateNode,
// BuilderNodePatch) -- baru terkirim ke server saat Simpan, KONSISTEN
// dgn arsitektur draft Builder (beda dari Mode Simple yang langsung PATCH
// per field, lihat openScheduleForm/openLockForm dashboard/links/
// page.tsx). Upload/hapus ikon kustom & thumbnail TETAP immediate-write
// (ensureRootPersisted + endpoint upload, pola sama MediaImageEditor) --
// backend menolak custom_icon_url lewat PATCH generik (upload-only).
function RootToolsPanel({
  node,
  onUpdateNode,
  onEnsureRootPersisted,
  onIconChanged,
  onThumbnailChanged,
  onThumbnailRemoved,
}: {
  node: BuilderTreeNode;
  onUpdateNode: (target: BuilderSelection, patch: BuilderNodePatch) => void;
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  onIconChanged: (rootId: string, patch: { customIconUrl?: string; iconKey?: string }) => void;
  onThumbnailChanged: (rootId: string, thumbnailUrl: string) => void;
  onThumbnailRemoved: (rootId: string) => void;
}) {
  const { t } = useLocale();
  const sel = selectionOf(node);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [lockOpen, setLockOpen] = useState(false);
  const [lockType, setLockType] = useState<"age" | "code" | "subscribe" | "sensitive">("code");
  const [lockCode, setLockCode] = useState("");
  const [lockMinAge, setLockMinAge] = useState("18");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fullLock/scheduled -- SAMA PERSIS gerbang BlockToolsStrip.tsx (Links/
  // Toko): kunci lengkap (4 pilihan) cuma utk link/button, tipe lain
  // cukup toggle sensitif; ditemukan sudah ada `sel`/`node.blockType` di
  // sini jadi tidak perlu re-derive.
  const fullLock = node.blockType === "link" || node.blockType === "button";
  const scheduled = Boolean(node.startsAt && node.endsAt);

  function openSchedule() {
    setScheduleStart(node.startsAt ? node.startsAt.slice(0, 16) : "");
    setScheduleEnd(node.endsAt ? node.endsAt.slice(0, 16) : "");
    setScheduleOpen(true);
  }
  function saveSchedule() {
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
    onUpdateNode(sel, { startsAt, endsAt });
    setScheduleOpen(false);
  }

  function openLock() {
    setLockType((node.lockType as typeof lockType) || "code");
    setLockCode(node.lockCode || "");
    setLockMinAge(node.lockMinAge ? String(node.lockMinAge) : "18");
    setLockOpen(true);
  }
  function saveLock() {
    if (lockType === "code" && !lockCode.trim()) {
      setError(t("dashboard.pages.links.errors.lockCodeRequired"));
      return;
    }
    if (lockType === "age" && (!lockMinAge || Number(lockMinAge) < 13)) {
      setError(t("dashboard.pages.links.errors.lockMinAge"));
      return;
    }
    setError(null);
    onUpdateNode(sel, {
      lockType,
      lockCode: lockType === "code" ? lockCode.trim() : undefined,
      lockMinAge: lockType === "age" ? Number(lockMinAge) : undefined,
    });
    setLockOpen(false);
  }
  function toggleSensitive() {
    onUpdateNode(sel, node.lockType === "sensitive" ? { clearLock: true } : { lockType: "sensitive" });
  }

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIconUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(node.rootId);
      const { custom_icon_url } = await uploadLinkIcon(realRootId, file);
      onIconChanged(realRootId, { customIconUrl: custom_icon_url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadIconFailed"));
    } finally {
      setIconUploading(false);
    }
  }
  async function handleRemoveIcon() {
    setIconUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(node.rootId);
      await deleteLinkIcon(realRootId);
      onUpdateNode(sel, { iconKey: "" });
      onIconChanged(realRootId, { customIconUrl: "", iconKey: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteIconFailed"));
    } finally {
      setIconUploading(false);
    }
  }
  async function handleThumbnailUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setThumbnailUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(node.rootId);
      const { thumbnail_url } = await uploadLinkThumbnail(realRootId, file);
      onThumbnailChanged(realRootId, thumbnail_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadThumbnailFailed"));
    } finally {
      setThumbnailUploading(false);
    }
  }
  async function handleRemoveThumbnail() {
    setThumbnailUploading(true);
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(node.rootId);
      await deleteLinkThumbnail(realRootId);
      onThumbnailRemoved(realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteThumbnailFailed"));
    } finally {
      setThumbnailUploading(false);
    }
  }

  const libraryIcon = getLibraryIcon(node.iconKey);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-app-border bg-app-surface-2 p-2.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1.5">
        <RootToolButton icon={IconClock} label={t("dashboard.pages.links.linkCard.toolLabels.schedule")} active={scheduled} onClick={openSchedule} />
        {fullLock ? (
          <RootToolButton icon={IconLock} label={t("dashboard.pages.links.linkCard.toolLabels.lock")} active={Boolean(node.lockType)} onClick={openLock} />
        ) : (
          <RootToolButton icon={TriangleAlert} label={t("dashboard.pages.links.linkCard.toolLabels.sensitive")} active={node.lockType === "sensitive"} onClick={toggleSensitive} />
        )}
      </div>

      {/* LinkDisplayModePicker -- permintaan langsung pengguna, 19 September
          2026 (referensi screenshot Linktree "Classic"/"Featured"):
          menggantikan ikon bintang kecil "Unggulan" yang tadinya diselipkan
          di strip ikon di atas, sekarang jadi 2 kotak pilihan besar yang
          jelas -- data & logika di baliknya (isFeatured) TIDAK berubah,
          murni reskin tampilan. Komponen bersama, dipakai juga oleh Simple
          Mode (dashboard/links/page.tsx, halaman penuh per blok). */}
      {node.blockType === "link" && (
        <LinkDisplayModePicker active={Boolean(node.isFeatured)} onSelect={(featured) => onUpdateNode(sel, { isFeatured: featured })} />
      )}

      {scheduleOpen && (
        <div className="flex flex-col gap-2 rounded-lg border border-app-border bg-app-surface p-2.5">
          <FormField label={t("dashboard.pages.links.schedulePanel.startLabel")}>
            <input type="datetime-local" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} className="w-full rounded-md border border-app-border bg-app-surface px-2 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none" />
          </FormField>
          <FormField label={t("dashboard.pages.links.schedulePanel.endLabel")}>
            <input type="datetime-local" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} className="w-full rounded-md border border-app-border bg-app-surface px-2 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none" />
          </FormField>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setScheduleOpen(false)} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
              {t("dashboard.pages.links.common.cancel")}
            </button>
            <button type="button" onClick={saveSchedule} className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white">
              {t("dashboard.pages.links.common.save")}
            </button>
          </div>
        </div>
      )}
      {!scheduleOpen && scheduled && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-jeon-warning/15 px-2.5 py-1.5">
          <span className="min-w-0 truncate text-[11px] font-semibold text-jeon-warning">
            {t("dashboard.pages.links.schedulePanel.scheduledLabel")} {new Date(node.startsAt!).toLocaleString("id-ID")} {t("dashboard.pages.links.schedulePanel.until")} {new Date(node.endsAt!).toLocaleString("id-ID")}
          </span>
          <button type="button" onClick={() => onUpdateNode(sel, { clearSchedule: true })} className="flex-shrink-0 text-[11px] font-bold text-red-600 hover:underline">
            {t("dashboard.pages.links.schedulePanel.cancelSchedule")}
          </button>
        </div>
      )}

      {fullLock && lockOpen && (
        <div className="flex flex-col gap-2 rounded-lg border border-app-border bg-app-surface p-2.5">
          <select value={lockType} onChange={(e) => setLockType(e.target.value as typeof lockType)} className="w-full rounded-md border border-app-border bg-app-surface px-2 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none">
            <option value="code">{t("dashboard.pages.links.lockPanel.types.code")}</option>
            <option value="age">{t("dashboard.pages.links.lockPanel.types.age")}</option>
            <option value="subscribe">{t("dashboard.pages.links.lockPanel.types.subscribe")}</option>
            <option value="sensitive">{t("dashboard.pages.links.lockPanel.types.sensitive")}</option>
          </select>
          {lockType === "code" && (
            <input type="text" placeholder={t("dashboard.pages.links.lockPanel.codePlaceholder")} value={lockCode} onChange={(e) => setLockCode(e.target.value)} className="w-full rounded-md border border-app-border bg-app-surface px-2.5 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none" />
          )}
          {lockType === "age" && (
            <input type="number" min={13} max={99} placeholder={t("dashboard.pages.links.lockPanel.minAgePlaceholder")} value={lockMinAge} onChange={(e) => setLockMinAge(e.target.value)} className="w-full rounded-md border border-app-border bg-app-surface px-2.5 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none" />
          )}
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setLockOpen(false)} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
              {t("dashboard.pages.links.common.cancel")}
            </button>
            <button type="button" onClick={saveLock} className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white">
              {t("dashboard.pages.links.common.save")}
            </button>
          </div>
        </div>
      )}
      {fullLock && !lockOpen && node.lockType && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-jeon-purple/10 px-2.5 py-1.5">
          <span className="min-w-0 truncate text-[11px] font-semibold text-jeon-purple">
            {t("dashboard.pages.links.lockPanel.lockedLabel")}{" "}
            {node.lockType === "code"
              ? t("dashboard.pages.links.lockPanel.statusTypes.code")
              : node.lockType === "age"
                ? t("dashboard.pages.links.lockPanel.statusTypes.age").replace("{age}", String(node.lockMinAge ?? 18))
                : node.lockType === "sensitive"
                  ? t("dashboard.pages.links.lockPanel.statusTypes.sensitive")
                  : t("dashboard.pages.links.lockPanel.statusTypes.subscribe")}
          </span>
          <button type="button" onClick={() => onUpdateNode(sel, { clearLock: true })} className="flex-shrink-0 text-[11px] font-bold text-red-600 hover:underline">
            {t("dashboard.pages.links.lockPanel.unlock")}
          </button>
        </div>
      )}

      {node.blockType === "link" && node.isFeatured && (
        <div className="flex items-center gap-3 rounded-lg border border-app-border bg-app-surface p-2.5">
          {node.thumbnailUrl ? (
            <Image src={node.thumbnailUrl} alt="" width={96} height={56} className="h-14 w-24 flex-shrink-0 rounded-md object-cover ring-1 ring-black/5" />
          ) : (
            <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-app-border text-[10px] text-app-muted">{t("dashboard.pages.links.common.noneYet")}</div>
          )}
          <div className="flex flex-1 flex-col gap-1">
            <label className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-app-border py-1.5 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple ${thumbnailUploading ? "opacity-60" : ""}`}>
              {thumbnailUploading ? t("dashboard.pages.linksBuilder.uploading") : t("dashboard.pages.linksBuilder.uploadPhoto")}
              <input type="file" accept="image/*" onChange={handleThumbnailUpload} disabled={thumbnailUploading} className="hidden" />
            </label>
            {node.thumbnailUrl && (
              <button type="button" onClick={handleRemoveThumbnail} disabled={thumbnailUploading} className="text-[11px] font-bold text-red-600 hover:underline disabled:opacity-60">
                {t("dashboard.pages.linksBuilder.removePhoto")}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[10px] font-bold uppercase tracking-wide text-app-muted">{t("dashboard.pages.links.linkCard.toolLabels.iconGroup")}</span>
        {node.customIconUrl ? (
          <Image src={node.customIconUrl} alt="" width={24} height={24} className="h-6 w-6 flex-shrink-0 rounded-md object-cover ring-1 ring-black/5" />
        ) : libraryIcon ? (
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-jeon-lavender text-[#111111]">
            <libraryIcon.Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <label
          title={node.customIconUrl ? t("dashboard.pages.links.linkCard.changeCustomIcon") : t("dashboard.pages.links.linkCard.uploadCustomIcon")}
          className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold ${
            node.customIconUrl ? "border-jeon-purple bg-jeon-lavender/40 text-jeon-purple" : "border-app-border bg-app-surface text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
          } ${iconUploading ? "opacity-60" : ""}`}
        >
          {iconUploading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <IconCamera className="h-3.5 w-3.5 flex-shrink-0" />}
          {t("dashboard.pages.links.linkCard.toolLabels.uploadIcon")}
          <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleIconUpload} disabled={iconUploading} className="hidden" />
        </label>
        <RootToolButton icon={LayoutGrid} label={t("dashboard.pages.links.linkCard.toolLabels.iconGallery")} active={Boolean(node.iconKey)} onClick={() => setIconPickerOpen(true)} />
        {!node.customIconUrl && (
          <label
            title={node.iconColor ? t("dashboard.pages.links.linkCard.changeIconColor") : t("dashboard.pages.links.linkCard.pickIconColor")}
            className={`relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold ${
              node.iconColor ? "border-jeon-purple bg-jeon-lavender/40 text-jeon-purple" : "border-app-border bg-app-surface text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
            }`}
          >
            {node.iconColor ? <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: node.iconColor }} aria-hidden /> : <IconPaintbrush className="h-3.5 w-3.5 flex-shrink-0" />}
            {t("dashboard.pages.links.linkCard.toolLabels.iconColor")}
            <input type="color" value={node.iconColor || "#000000"} onChange={(e) => onUpdateNode(sel, { iconColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
        )}
        {node.iconColor && <RootToolButton icon={IconX} label={t("dashboard.pages.links.linkCard.toolLabels.clearIconColor")} onClick={() => onUpdateNode(sel, { iconColor: "" })} />}
        {(node.customIconUrl || node.iconKey) && <RootToolButton icon={IconX} label={t("dashboard.pages.links.linkCard.toolLabels.removeIcon")} onClick={handleRemoveIcon} />}
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      {iconPickerOpen && (
        <IconPickerModal
          currentKey={node.iconKey}
          onSelect={(icon) => {
            onUpdateNode(sel, { iconKey: icon.key });
            setIconPickerOpen(false);
          }}
          onClose={() => setIconPickerOpen(false)}
        />
      )}
    </div>
  );
}

function RootToolButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon | ((p: { className?: string }) => React.ReactElement);
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
        active ? "border-jeon-purple bg-jeon-lavender/40 text-jeon-purple" : "border-app-border bg-app-surface text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
      }`}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      {label}
    </button>
  );
}

function TreeNodeView({
  node,
  depth,
  selection,
  onSelect,
  onDeselect,
  onDelete,
  onClone,
  collapsed,
  onToggleCollapsed,
  onUpdateNode,
  onEnsureRootPersisted,
  onMediaImageChanged,
  onGalleryImagesChanged,
  onAudioChanged,
  onFileChanged,
  onIconChanged,
  onThumbnailChanged,
  onThumbnailRemoved,
  onCatalogItemImagesChanged,
  products,
  onProductCreated,
  siblingIds,
  onReorderRoot,
  onReorderChildren,
}: {
  node: BuilderTreeNode;
  depth: number;
  selection: BuilderSelection | null;
  onSelect: (node: BuilderTreeNode) => void;
  onDeselect: () => void;
  // onDelete -- sejak 18 September 2026 ini MEMINTA hapus (rute Builder
  // menampilkan dialog konfirmasi dulu), bukan langsung menghapus.
  onDelete: (target: BuilderSelection) => void;
  onClone: (target: BuilderSelection) => void;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string) => void;
  onUpdateNode: (target: BuilderSelection, patch: BuilderNodePatch) => void;
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  onMediaImageChanged: (rootId: string, path: BuilderSeg[], imageUrl: string) => void;
  onGalleryImagesChanged: (rootId: string, path: BuilderSeg[], images: string[]) => void;
  onAudioChanged: (rootId: string, path: BuilderSeg[], patch: { audio_url: string; title?: string }) => void;
  onFileChanged: (rootId: string, path: BuilderSeg[], patch: { file_url: string; file_name?: string; file_size_bytes?: number }) => void;
  // onIconChanged/onThumbnailChanged/onThumbnailRemoved -- paritas
  // BlockToolsStrip (19 September 2026), dipakai HANYA oleh RootToolsPanel
  // (isRoot, lihat di bawah) -- tetap dithread lewat rekursi TreeNodeView
  // spt prop upload lain di atas, sama sekali tidak dipanggil utk blok
  // bersarang (custom_icon_url/thumbnail_url bukan bagian block_data).
  onIconChanged: (rootId: string, patch: { customIconUrl?: string; iconKey?: string }) => void;
  onThumbnailChanged: (rootId: string, thumbnailUrl: string) => void;
  onThumbnailRemoved: (rootId: string) => void;
  onCatalogItemImagesChanged: (rootId: string, itemId: string, images: string[]) => void;
  products: DashboardProduct[];
  onProductCreated: (product: DashboardProduct) => void;
  // siblingIds/onReorderRoot/onReorderChildren -- item "Pindah ke atas/
  // bawah" di menu ⋮ (perbaikan Builder 18 September 2026): alternatif
  // drag yang bisa dipakai keyboard/sentuh, urutan saudara diambil dari
  // pemanggil (rootIds utk root, childIds utk anak) lalu dikirim ke handler
  // reorder yang SAMA dipakai drag & drop.
  siblingIds: string[];
  onReorderRoot: (orderedIds: string[]) => void;
  onReorderChildren: (rootId: string, containerPath: BuilderSeg[], orderedIds: string[]) => void;
}) {
  const { t } = useLocale();
  const siblingIndex = siblingIds.indexOf(node.id);
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex !== -1 && siblingIndex < siblingIds.length - 1;
  function moveBy(delta: -1 | 1) {
    if (siblingIndex === -1) return;
    const reordered = arrayMove(siblingIds, siblingIndex, siblingIndex + delta);
    if (node.path.length === 0) onReorderRoot(reordered);
    else onReorderChildren(node.rootId, node.path.slice(0, -1), reordered);
  }
  const isRoot = node.path.length === 0;
  const isInactive = isRoot && node.isActive === false;
  // menuOpen -- permintaan langsung pengguna, 12 September 2026 ("tambahkan
  // titik tiga diujung tiap blok untuk hapus dan clone"): menggantikan
  // ikon hapus lama yang cuma tampil saat baris terpilih -- menu ini
  // SELALU ada di tiap baris blok, apa pun status pilihannya. Tutup lewat
  // listener dokumen (klik di luar ATAU tombol Escape) -- BUKAN backdrop
  // `fixed inset-0` (percobaan awal, dibuang): backdrop begitu menutupi
  // SELURUH viewport dengan z-index eksplisit ternyata malah ikut
  // menghalangi klik ke tombol pemicu "..." itu sendiri (elemen biasa
  // tanpa z-index eksplisit kalah tumpuk terhadap sibling `fixed`
  // ber-z-index, ditemukan lewat verifikasi live/Playwright).
  const [menuOpen, setMenuOpen] = useState(false);
  // menuFlipUp -- bug ditemukan lewat audit (13 September 2026): menu ini
  // SELALU muncul KE BAWAH (`top-full`) di dalam kontainer tree yang
  // sendirinya overflow-y-auto -- utk beberapa baris terakhir (dekat
  // dasar panel), menu muncul di bawah lipatan panel, tersembunyi sampai
  // pengguna scroll dulu. Dihitung sekali saat menu DIBUKA (bukan terus-
  // menerus via effect) dari posisi tombol pemicu relatif terhadap
  // viewport -- ~90px = perkiraan tinggi menu (2 item), cukup akurat
  // tanpa perlu ukur DOM menu-nya sendiri (yang belum ter-render saat
  // keputusan flip harus diambil, SEBELUM menuOpen jadi true).
  const [menuFlipUp, setMenuFlipUp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // menuTriggerRef -- aksesibilitas (gap ditemukan lewat audit, 13
  // September 2026): fokus dikembalikan ke tombol "..." begitu menu
  // ditutup lewat Escape, supaya pengguna keyboard tidak "kehilangan"
  // posisi fokusnya (tanpa ini, fokus jatuh ke <body>, harus Tab ulang
  // dari awal dokumen).
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    // ArrowDown/ArrowUp -- gap ditemukan lewat audit ROUND 2 (13 September
    // 2026): menu ini diberi `role="menu"`/`role="menuitem"` (putaran 1,
    // C9) tapi tidak ada navigasi panah sama sekali -- role ARIA menu
    // MENGISYARATKAN ke pembaca layar bahwa Panah Atas/Bawah berpindah
    // antar item (pola baku WAI-ARIA APG), padahal cuma Tab yang berfungsi
    // di sini. Fokus mulai dari tombol pemicu (currentIndex -1) ->
    // ArrowDown ke item pertama, ArrowUp ke item terakhir; dari sebuah
    // item, muter (wrap) ke ujung yang berlawanan.
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = menuRef.current ? Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')) : [];
        if (items.length === 0) return;
        e.preventDefault();
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex =
          currentIndex === -1
            ? e.key === "ArrowDown"
              ? 0
              : items.length - 1
            : (currentIndex + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[nextIndex]?.focus();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);
  // useSortable -- HANYA node "block" yang bisa diseret (column-slot murni
  // wadah tampilan "Kolom N", tidak punya urutan sendiri untuk diubah).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    disabled: node.kind !== "block",
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const isThisSelected = !!selection && selection.rootId === node.rootId && JSON.stringify(selection.path) === JSON.stringify(node.path);
  const Icon = node.kind === "block" ? (TYPE_ICON[node.blockType ?? ""] ?? IconBox) : null;
  const canExpand = node.kind === "column-slot" || node.blockType === "section" || node.blockType === "column";
  const label = previewLabelFor(node, t);
  const childIds = node.children.filter((c) => c.kind === "block").map((c) => c.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-tree-node-id={node.id}
      // role="treeitem" dkk -- uxd-3 (audit UI/UX 21 September 2026):
      // pohon blok kiri sebelumnya sama sekali tanpa semantik ARIA tree,
      // pembaca layar mendengarnya sebagai tumpukan tombol lepas tanpa
      // info level/posisi/status pilih-buka. Cakupan SENGAJA dibatasi ke
      // atribut STRUKTURAL saja (level/selected/expanded/group) -- model
      // interaksi keyboard yang sudah ada (tiap tombol dlm baris fokus
      // independen: drag handle/chevron/pilih/menu ⋮, BUKAN roving
      // tabindex satu-tombol-per-baris ala pola APG TreeView murni) TETAP
      // dipertahankan apa adanya supaya tidak mengubah perilaku yang
      // sudah stabil & dites banyak e2e -- retrofit navigasi panah penuh
      // adalah pekerjaan aksesibilitas terpisah, bukan cakupan temuan ini.
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isThisSelected}
      aria-expanded={canExpand ? !collapsed.has(node.id) : undefined}
    >
      <div
        style={{ paddingLeft: `${depth * 16}px` }}
        // py-2 -- permintaan langsung pengguna, 12 September 2026
        // ("perbesar sedikit tinggi tiap blok nya"), naik dari py-1.5.
        className={`flex items-center gap-1 rounded-lg py-2 pr-1.5 text-xs ${isThisSelected ? "bg-jeon-lavender/60" : "hover:bg-app-surface-2"}`}
      >
        {node.kind === "block" ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t("dashboard.pages.linksBuilder.dragHandle")}
            className="flex-shrink-0 cursor-grab touch-none text-app-muted active:cursor-grabbing"
          >
            <IconGripVertical className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        {canExpand ? (
          <button type="button" onClick={() => onToggleCollapsed(node.id)} className="flex-shrink-0 text-app-muted">
            <IconChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has(node.id) ? "" : "rotate-90"}`} />
          </button>
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <button
          type="button"
          onClick={() => (isThisSelected ? onDeselect() : onSelect(node))}
          className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${isInactive ? "opacity-50" : ""}`}
        >
          {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0 text-app-muted" />}
          <span className={`truncate ${isThisSelected ? "font-bold text-jeon-purple" : "font-semibold text-app-ink"}`}>{label}</span>
          {isInactive && (
            <span className="flex-shrink-0 rounded-full bg-app-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-muted">
              {t("dashboard.pages.linksBuilder.inactiveBadge")}
            </span>
          )}
        </button>
        {node.kind === "block" && (
          <div
            ref={menuRef}
            className="relative flex-shrink-0"
            // onBlur (focusout, ikut BUBBLE dari anak) -- gap ditemukan
            // lewat audit ROUND 2 (13 September 2026): sebelumnya menu
            // cuma tertutup lewat klik-di-luar atau Escape -- pengguna
            // keyboard yang Tab MENJAUH dari menu (bukan Escape) meninggalkan
            // menu ini tetap terbuka (absolute, z-20) menutupi baris tree
            // di bawahnya sampai diklik/Escape secara terpisah. Tutup begitu
            // fokus pindah ke elemen di LUAR menu ini (relatedTarget null
            // pun dihitung "di luar" -- kasus fokus jatuh ke elemen yang
            // tidak bisa difokus/luar dokumen, mis. klik area non-interaktif).
            onBlur={(e) => {
              if (!menuRef.current) return;
              const next = e.relatedTarget as Node | null;
              if (!next || !menuRef.current.contains(next)) setMenuOpen(false);
            }}
          >
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!menuOpen) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  // ~5 item x ~36px sejak menu punya Naik/Turun/Nonaktifkan
                  // (18 September 2026), dulu 90px utk 2 item.
                  const estimatedMenuHeight = 200;
                  setMenuFlipUp(window.innerHeight - rect.bottom < estimatedMenuHeight);
                }
                setMenuOpen((prev) => !prev);
              }}
              aria-label={t("dashboard.pages.linksBuilder.blockMenu")}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-6 w-6 items-center justify-center rounded-md text-app-muted hover:bg-app-surface hover:text-app-ink"
            >
              <IconDotsVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className={`absolute right-0 z-20 w-40 overflow-hidden rounded-lg border-2 border-jeon-ink bg-app-surface shadow-brutal ${
                  menuFlipUp ? "bottom-full mb-1" : "top-full mt-1"
                }`}
              >
                {/* "link" -- tautan klasik lama (dari Mode Simple, BUKAN
                    tipe Canvas, lihat catatan NodeFieldEditor) SENGAJA TIDAK
                    bisa diduplikat. Bug ditemukan lewat audit (13 September
                    2026): clone root "link" dikirim ke createBlock/
                    createExtraPageBlock saat Save (createRootOnServer,
                    app/builder/[pageId]/page.tsx) yang MENOLAK block_type
                    itu (binding oneof backend, links.go) -- Save gagal
                    terus-menerus tanpa cara pengguna mendiagnosis blok mana
                    penyebabnya. Rute clone yang benar (createLink) kehilangan
                    field ikon/kunci/jadwal, jadi bukan solusi -- paling aman
                    cuma disembunyikan sama sekali. */}
                {/* Naik/Turun + Aktif/Nonaktif -- perbaikan Builder 18
                    September 2026 (paritas dgn Mode Simple: BlockToolsStrip
                    punya Pindah ke atas/bawah & tiap baris punya sakelar
                    aktif; Builder sebelumnya cuma Duplikat+Hapus, satu-
                    satunya cara menyembunyikan blok = menghapusnya). */}
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canMoveUp}
                  onClick={() => {
                    setMenuOpen(false);
                    moveBy(-1);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-app-ink hover:bg-app-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  {t("dashboard.pages.linksBuilder.moveUp")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canMoveDown}
                  onClick={() => {
                    setMenuOpen(false);
                    moveBy(1);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-app-ink hover:bg-app-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  {t("dashboard.pages.linksBuilder.moveDown")}
                </button>
                {isRoot && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onUpdateNode(selectionOf(node), { isActive: isInactive });
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-app-ink hover:bg-app-surface-2"
                  >
                    {isInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {isInactive ? t("dashboard.pages.linksBuilder.activateBlock") : t("dashboard.pages.linksBuilder.deactivateBlock")}
                  </button>
                )}
                {node.blockType !== "link" && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onClone(selectionOf(node));
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-app-ink hover:bg-app-surface-2"
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                    {t("dashboard.pages.linksBuilder.duplicateBlock")}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    // Konfirmasi ditampilkan rute Builder (18 September 2026)
                    // -- deselect TIDAK lagi di sini; dilakukan handleDelete
                    // sesudah pengguna benar-benar mengonfirmasi.
                    onDelete(selectionOf(node));
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                  {t("dashboard.pages.linksBuilder.deleteSelected")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isThisSelected && (
        <div style={{ paddingLeft: `${(depth + 1) * 16}px` }} className="flex flex-col gap-2.5 pb-2.5 pr-1.5 pt-1">
          <NodeFieldEditor
            node={node}
            onUpdateNode={onUpdateNode}
            onEnsureRootPersisted={onEnsureRootPersisted}
            onMediaImageChanged={onMediaImageChanged}
            onGalleryImagesChanged={onGalleryImagesChanged}
            onAudioChanged={onAudioChanged}
            onFileChanged={onFileChanged}
            onCatalogItemImagesChanged={onCatalogItemImagesChanged}
            products={products}
            onProductCreated={onProductCreated}
          />
          {/* RootToolsPanel -- paritas BlockToolsStrip (19 September 2026),
              HANYA utk root (jadwal/kunci/unggulan/ikon adalah field
              `links`, tidak ada padanannya di blok bersarang). Taruh
              SESUDAH NodeFieldEditor (bukan di dalamnya, bukan SEBELUM
              -- bug ditemukan lewat regresi builder-mode.spec.ts:
              input file ikon RootToolsPanel yang lebih dulu di DOM
              membuat selector "input file pertama" milik editor gambar/
              galeri salah sasaran) supaya berlaku utk SEMUA tipe blok
              tanpa menyentuh 20-an cabang switch NodeFieldEditor, & urutan
              vertikal ini SEKALIGUS meniru Mode Simple: field isi dulu,
              strip alat (jadwal/kunci/ikon) di bawahnya. */}
          {isRoot && (
            <RootToolsPanel
              node={node}
              onUpdateNode={onUpdateNode}
              onEnsureRootPersisted={onEnsureRootPersisted}
              onIconChanged={onIconChanged}
              onThumbnailChanged={onThumbnailChanged}
              onThumbnailRemoved={onThumbnailRemoved}
            />
          )}
        </div>
      )}

      {canExpand && !collapsed.has(node.id) && (
        <div role="group">
          {node.children.length === 0 ? (
            <p style={{ paddingLeft: `${(depth + 1) * 16 + 20}px` }} className="py-1 text-[11px] text-app-muted">
              {t("dashboard.pages.linksBuilder.emptyContainer")}
            </p>
          ) : (
            <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
              {node.children.map((child) => (
                <TreeNodeView
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  selection={selection}
                  onSelect={onSelect}
                  onDeselect={onDeselect}
                  onDelete={onDelete}
                  onClone={onClone}
                  collapsed={collapsed}
                  onToggleCollapsed={onToggleCollapsed}
                  onUpdateNode={onUpdateNode}
                  onEnsureRootPersisted={onEnsureRootPersisted}
                  onMediaImageChanged={onMediaImageChanged}
                  onGalleryImagesChanged={onGalleryImagesChanged}
                  onAudioChanged={onAudioChanged}
                  onFileChanged={onFileChanged}
                  onIconChanged={onIconChanged}
                  onThumbnailChanged={onThumbnailChanged}
                  onThumbnailRemoved={onThumbnailRemoved}
                  onCatalogItemImagesChanged={onCatalogItemImagesChanged}
                  products={products}
                  onProductCreated={onProductCreated}
                  siblingIds={childIds}
                  onReorderRoot={onReorderRoot}
                  onReorderChildren={onReorderChildren}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}

export default function BuilderLeftPanel({
  links,
  selection,
  onSelectionChange,
  onAdd,
  onDelete,
  onClone,
  onReorderRoot,
  onReorderChildren,
  onUpdateNode,
  onEnsureRootPersisted,
  onMediaImageChanged,
  onGalleryImagesChanged,
  onAudioChanged,
  onFileChanged,
  onIconChanged,
  onThumbnailChanged,
  onThumbnailRemoved,
  onCatalogItemImagesChanged,
  settingsHref,
  page,
  isPremium,
  onPatch,
  onLocalChange,
  onStyleOverride,
  onUploadAvatar,
  onUploadBackground,
  onError,
  stickers,
  onStickersChange,
  designSection,
  onDesignSectionChange,
  products,
  onProductCreated,
  pageSettings,
  onPageSettingsChange,
  publicUrl,
}: {
  links: LinkItem[];
  // selection/onSelectionChange -- dinaikkan ke rute builder (permintaan
  // langsung pengguna 9 September 2026, "klik blok di kanvas juga"):
  // BuilderCanvas.tsx (klik DOM lewat data-builder-node-id) & panel ini
  // (klik tree) sekarang menulis ke SATU state yang sama di induk.
  selection: BuilderSelection | null;
  onSelectionChange: (selection: BuilderSelection | null) => void;
  onAdd: (target: BuilderSelection | null, type: EmbeddedBuilderBlock["block_type"] | "maps" | "catalog" | "contact_form") => void;
  onDelete: (target: BuilderSelection) => void;
  // onClone -- permintaan langsung pengguna, 12 September 2026 ("tambahkan
  // titik tiga diujung tiap blok untuk hapus dan clone").
  onClone: (target: BuilderSelection) => void;
  onReorderRoot: (orderedIds: string[]) => void;
  onReorderChildren: (rootId: string, containerPath: BuilderSeg[], orderedIds: string[]) => void;
  onUpdateNode: (target: BuilderSelection, patch: BuilderNodePatch) => void;
  // onEnsureRootPersisted -- ditemukan lewat tinjauan kode sendiri (bukan
  // dari plan): upload gambar blok (lihat onMediaImageChanged/
  // onGalleryImagesChanged di bawah) butuh id ROOT ASLI dari backend --
  // dipanggil MediaImageEditor/GalleryGridEditor SEBELUM upload/hapus,
  // supaya root yang BARU ditambah & belum pernah disimpan (id masih
  // "temp-...") otomatis di-create dulu ke server kalau perlu.
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  // onMediaImageChanged/onGalleryImagesChanged -- redesain total (10
  // September 2026, arsitektur draft): pengganti `onRefresh` lama (refetch
  // PENUH dari server, menimpa balik SELURUH `links` -- termasuk draft blok
  // LAIN yang belum disimpan). Upload gambar tetap langsung ke server
  // (pengecualian yang disetujui, lihat plan), tapi hasilnya ditambal HANYA
  // ke path spesifik ini di draft & server snapshot rute Builder.
  onMediaImageChanged: (rootId: string, path: BuilderSeg[], imageUrl: string) => void;
  onGalleryImagesChanged: (rootId: string, path: BuilderSeg[], images: string[]) => void;
  // onAudioChanged/onFileChanged -- Fase 4 (13 September 2026): pola SAMA
  // PERSIS onMediaImageChanged/onGalleryImagesChanged di atas (upload
  // langsung ke server terlepas draft, hasil ditambal ke path spesifik),
  // generalisasi jadi objek patch (bukan satu string) karena audio/file
  // masing-masing punya lebih dari satu field block_data yang berubah
  // sekaligus (audio: audio_url+title opsional; file: file_url/file_name/
  // file_size_bytes).
  onAudioChanged: (rootId: string, path: BuilderSeg[], patch: { audio_url: string; title?: string }) => void;
  onFileChanged: (rootId: string, path: BuilderSeg[], patch: { file_url: string; file_name?: string; file_size_bytes?: number }) => void;
  onIconChanged: (rootId: string, patch: { customIconUrl?: string; iconKey?: string }) => void;
  onThumbnailChanged: (rootId: string, thumbnailUrl: string) => void;
  onThumbnailRemoved: (rootId: string) => void;
  onCatalogItemImagesChanged: (rootId: string, itemId: string, images: string[]) => void;
  settingsHref: string;
  // page/isPremium/onPatch/onLocalChange/onStyleOverride/onUploadAvatar/
  // onUploadBackground/onError/stickers/onStickersChange/designSection/
  // onDesignSectionChange -- Bagian 2 (permintaan langsung pengguna 9
  // September 2026, "design langsung di builder juga"): tab "design" di
  // bawah SEBELUMNYA cuma placeholder + tautan keluar ke /dashboard/design
  // (Fase 1 builder) -- sekarang berisi Tema/Header/Tombol/Font/Stiker
  // SUNGGUHAN, komponen yang SAMA dipakai ProdukPageEditor.tsx (lihat
  // components/dashboard/page/design-sections.tsx). `onPatch`/`onStyleOverride`
  // di rute Builder (arsitektur draft) SEKARANG menulis ke draft lokal saja,
  // TIDAK memanggil API -- komponen ini sendiri TIDAK berubah sama sekali,
  // cuma perilaku pemanggil (app/builder/[pageId]/page.tsx) yang beda.
  page: DesignSectionPage;
  isPremium: boolean;
  onPatch: (patch: DesignSectionPatch) => void;
  onLocalChange: (patch: DesignSectionPatch) => void;
  onStyleOverride: (patch: Omit<DesignSectionPatch, "theme" | "custom_style_override">) => void;
  onUploadAvatar: (file: File) => Promise<{ avatar_url: string }>;
  onUploadBackground: (file: File) => Promise<string>;
  onError: (msg: string | null) => void;
  stickers: PageStickerData[];
  onStickersChange: (stickers: PageStickerData[]) => void;
  designSection: BuilderDesignSection;
  onDesignSectionChange: (section: BuilderDesignSection) => void;
  // products/onProductCreated -- blok "produk" (permintaan langsung
  // pengguna 10 September 2026): daftar produk kreator SUDAH di-fetch di
  // rute Builder (app/builder/[pageId]/page.tsx, dipakai jalur lain juga),
  // diteruskan apa adanya ke sini alih-alih fetch ulang. onProductCreated
  // bubble ke rute Builder supaya produk baru dari modal builder juga
  // muncul di state `products` global-nya (dashboard Produk tetap sumber
  // kebenaran, ini cuma menambal state lokal biar konsisten tanpa refetch).
  products: DashboardProduct[];
  onProductCreated: (product: DashboardProduct) => void;
  // pageSettings/onPageSettingsChange/publicUrl -- tab "Pengaturan" (18
  // September 2026): SEBELUMNYA cuma placeholder + tautan keluar, memakan
  // 1/3 tab bar. Sekarang berisi pengaturan halaman yang paling sering
  // dibutuhkan saat membangun (terbit/draft, watermark, noindex, SEO,
  // alamat publik) -- semua ditulis ke DRAFT lokal rute Builder (pola sama
  // field desain), terkirim saat Simpan lewat diffPageDesignPatch.
  pageSettings: BuilderPageSettings;
  onPageSettingsChange: (patch: Partial<BuilderPageSettings>) => void;
  publicUrl: string | null;
}) {
  const { t } = useLocale();
  const [tab, setTab] = useState<"content" | "design" | "settings">("content");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addModalOpen, setAddModalOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const tree = useMemo(() => buildTree(links), [links]);
  const rootIds = useMemo(() => tree.map((n) => n.id), [tree]);

  // Klik blok di KANVAS (BuilderCanvas.tsx) bisa terjadi sementara tab
  // kiri sedang di "design"/"settings" -- pindahkan otomatis ke "content"
  // supaya field edit-nya langsung terlihat. Pola "adjust state during
  // render" resmi React (BUKAN useEffect+setState, lihat CLAUDE.md) --
  // bandingkan `selection` (identitas objek) ke render sebelumnya --
  // SENGAJA identitas, BUKAN nilai (selectionsEqual) utk gerbang LUAR ini:
  // findSelectionByNodeId (dipakai tiap klik tree/kanvas) SELALU
  // mengonstruksi objek BARU meski nodenya SAMA PERSIS dgn seleksi
  // sebelumnya -- re-klik blok yang SUDAH terpilih di kanvas (mis. setelah
  // leluhurnya di-collapse manual TANPA mengubah seleksi) harus TETAP
  // memicu buka-otomatis-leluhur di bawah supaya baris itu tidak jadi
  // jalan buntu (bug asli #3) -- kalau gerbang ini pakai NILAI, re-klik
  // semacam itu dianggap "tidak berubah" & uncollapse tidak pernah jalan.
  // Bagian buka-otomatis-kontainer-leluhur (bug ditemukan lewat audit, 13
  // September 2026, lihat catatan lengkap di collectAncestorIds di atas)
  // DIGABUNG ke blok yang SAMA (bukan useEffect terpisah) -- react-hooks/
  // set-state-in-effect (ESLint, lihat CLAUDE.md) melarang setState
  // langsung di badan efek; pola "adjust state during render" ini SUDAH
  // resmi diizinkan pattern-nya utk kasus "sinkronkan state lokal dari
  // prop yang berubah" macam ini.
  const [prevSelection, setPrevSelection] = useState(selection);
  if (selection !== prevSelection) {
    // setTab("content") sendiri DIGERBANG lebih ketat, SECARA NILAI (bug
    // ROUND 2 -- 13 September 2026): ensureRootPersisted/commitSave
    // (app/builder/[pageId]/page.tsx) menambal `selection.rootId` dari id
    // sementara ke id asli lewat objek BARU meski seleksi LOGISNYA sama
    // sekali tidak berubah -- gerbang identitas di atas (perlu, lihat
    // alasannya) akan salah mengira ini "seleksi baru" & memaksa tab
    // balik ke "Konten", membatalkan pindah tab manual pengguna ke
    // "Desain"/"Pengaturan" persis saat upload/Save selesai. Uncollapse
    // ancestor TETAP jalan tanpa syarat tambahan ini -- menjalankannya
    // ulang thd seleksi yang logisnya sama itu tidak berbahaya (idempoten,
    // paling banter menghapus id yang memang sudah tidak collapsed).
    const valueChanged = !selectionsEqual(selection, prevSelection);
    setPrevSelection(selection);
    if (selection) {
      if (valueChanged) setTab("content");
      const ancestorIds = collectAncestorIds(tree, selection.rootId, selection.path);
      if (ancestorIds.length > 0) {
        setCollapsed((prev) => {
          if (!ancestorIds.some((id) => prev.has(id))) return prev;
          const next = new Set(prev);
          ancestorIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    }
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Scroll ke baris terpilih -- SISA perbaikan bug di atas, murni efek
  // DOM (bukan setState) jadi TETAP di useEffect biasa apa adanya. Butuh
  // DOM sudah ter-render dgn `collapsed` TERBARU (dari penyesuaian di
  // atas) -- `setTimeout(...,0)` menunggu satu microtask render (React
  // commit dulu, baru DOM query) supaya baris yang baru saja dibuka dari
  // collapsed sudah benar-benar ada di DOM saat scrollIntoView dipanggil.
  useEffect(() => {
    if (!selection) return;
    const targetId = selection.path.length === 0 ? selection.rootId : (findNodeByPath(tree, selection.rootId, selection.path)?.id ?? null);
    if (!targetId) return;
    const timer = setTimeout(() => {
      document.querySelector(`[data-tree-node-id="${targetId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
    return () => clearTimeout(timer);
    // `tree` sengaja tidak ikut dependency: berubah tiap ketikan (RichTextEditor
    // dst) via buildTree ulang, TIDAK boleh memicu re-scroll tiap keystroke --
    // hanya `selection` (blok MANA yang aktif) yang relevan di sini.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const findById = (nodes: BuilderTreeNode[], id: string): BuilderTreeNode | null => {
      for (const n of nodes) {
        if (n.id === id) return n;
        const found = findById(n.children, id);
        if (found) return found;
      }
      return null;
    };
    const dragged = findById(tree, String(active.id));
    const target = findById(tree, String(over.id));
    if (!dragged || !target || dragged.kind !== "block") return;
    if (containerKeyOf(dragged) !== containerKeyOf(target)) {
      // Lintas kontainer belum didukung (Fase 1) -- bug ditemukan lewat
      // audit (13 September 2026): SEBELUMNYA drop ditolak SENYAP (blok
      // memantul balik ke tempat semula, tanpa pesan apa pun) -- dari
      // sisi pengguna ini terbaca sbg bug ("kenapa drag-nya tidak
      // berhasil"), bukan batasan yang disengaja. Pesan ini SEKURANG-nya
      // menjelaskan APA yang terjadi -- implementasi drag lintas
      // kontainer sungguhan tetap di luar cakupan perbaikan bug ini
      // (fitur baru, bukan bug).
      onError(t("dashboard.pages.linksBuilder.errors.crossContainerDragUnsupported"));
      return;
    }

    const siblings = siblingsOf(tree, dragged).filter((n) => n.kind === "block");
    const ids = siblings.map((n) => n.id);
    const oldIndex = ids.indexOf(dragged.id);
    const newIndex = ids.indexOf(target.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(ids, oldIndex, newIndex);

    if (dragged.path.length === 0) {
      onReorderRoot(reordered);
    } else {
      onReorderChildren(dragged.rootId, dragged.path.slice(0, -1), reordered);
    }
  }

  const selectedNode = useMemo(() => {
    if (!selection) return null;
    return findNodeByPath(tree, selection.rootId, selection.path);
  }, [selection, tree]);

  const addTarget: BuilderSelection | null =
    selection && (selection.kind === "column-slot" || selection.blockType === "section") ? selection : null;

  return (
    <div className="flex h-full min-w-0 flex-col rounded-jmd border-2 border-jeon-ink bg-app-surface">
      <div className="flex flex-shrink-0 border-b border-app-border">
        {(["content", "design", "settings"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 border-b-2 px-3 py-2.5 text-xs font-bold transition-colors ${
              tab === key ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
            }`}
          >
            {t(`dashboard.pages.linksBuilder.tab.${key}`)}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-shrink-0 border-b border-app-border p-3">
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-jeon-sidebar px-4 py-2 text-xs font-bold text-white hover:opacity-90"
            >
              <IconPlus className="h-4 w-4" />
              {t("dashboard.components.builderAddComponentModal.title")}
            </button>
            {addTarget && (
              <p className="mt-1.5 text-center text-[11px] text-app-muted">{t("dashboard.pages.linksBuilder.addingInto")}</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2" role="tree" aria-label={t("dashboard.pages.linksBuilder.treeLabel")}>
            {tree.length === 0 ? (
              <p className="p-3 text-center text-xs text-app-muted">{t("dashboard.pages.linksBuilder.emptyRoot")}</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
                  {/* key={index}, BUKAN key={node.id} -- bug ditemukan lewat
                      audit (13 September 2026): id ROOT berubah format
                      ("temp-..." -> id asli backend) begitu ensureRootPersisted
                      mempersist blok ini (dipicu upload gambar/audio/file ke
                      blok ROOT itu SENDIRI, lihat catatan lengkap di sana) --
                      key={node.id} membuat React unmount+remount SELURUH
                      subtree baris itu PERSIS di tengah upload sedang
                      berjalan, mematikan komponen editor upload sebelum
                      `finally`/`catch`-nya sempat jalan: spinner "Mengunggah..."
                      hilang seketika (kembali ke tombol "Unggah" semula
                      padahal masih proses, mendorong klik ganda) DAN pesan
                      error kalau upload gagal TIDAK PERNAH tampil sama sekali
                      (setState dipanggil ke instance yang sudah unmount).
                      Blok BERSARANG (di dalam Section/Column) tidak kena
                      masalah ini -- id-nya murni JSON di block_data,
                      TIDAK PERNAH berubah setelah dibuat, jadi TreeNodeView
                      children tetap key={child.id} apa adanya. Trade-off:
                      dnd-kit's SortableContext/useSortable tetap pakai
                      node.id (id SEBENARNYA, bukan index) utk identitas
                      sortable-nya -- itu prop TERPISAH dari React key di
                      sini, tidak terpengaruh. Konsekuensi index-key yang
                      diterima: kalau root #2 dihapus lalu root BARU lain
                      ditambah tepat menempati index yang sama sebelum
                      re-render berikutnya, root baru itu bisa mewarisi state
                      lokal TreeNodeView milik root lama (mis. menu "..."
                      sempat kebuka) -- glitch UI kecil &amp; jarang, jauh lebih
                      ringan drpd upload yang senyap gagal di skenario yang
                      jauh lebih umum ("tambah blok, langsung unggah"). */}
                  {tree.map((node, index) => (
                    <TreeNodeView
                      key={index}
                      node={node}
                      depth={0}
                      selection={selection}
                      onSelect={(n) => onSelectionChange(selectionOf(n))}
                      onDeselect={() => onSelectionChange(null)}
                      onDelete={onDelete}
                      onClone={onClone}
                      collapsed={collapsed}
                      onToggleCollapsed={toggleCollapsed}
                      onUpdateNode={onUpdateNode}
                      onEnsureRootPersisted={onEnsureRootPersisted}
                      onMediaImageChanged={onMediaImageChanged}
                      onGalleryImagesChanged={onGalleryImagesChanged}
                      onAudioChanged={onAudioChanged}
                      onFileChanged={onFileChanged}
                      onIconChanged={onIconChanged}
                      onThumbnailChanged={onThumbnailChanged}
                      onThumbnailRemoved={onThumbnailRemoved}
                      onCatalogItemImagesChanged={onCatalogItemImagesChanged}
                      products={products}
                      onProductCreated={onProductCreated}
                      siblingIds={rootIds}
                      onReorderRoot={onReorderRoot}
                      onReorderChildren={onReorderChildren}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
          {/* selectedNode dipakai HANYA supaya `addTarget` (di atas) & modal
              tambah-komponen tahu konteksnya -- editor field-nya sendiri
              SEKARANG inline di TreeNodeView (lihat catatan lengkap di
              atas komponen itu), bukan di sini lagi. */}
          {selectedNode === null && selection && (
            <p className="flex-shrink-0 border-t border-app-border p-3 text-center text-[11px] text-app-muted">
              {t("dashboard.pages.linksBuilder.containerHint")}
            </p>
          )}
        </div>
      )}

      {tab === "design" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <DesignCategoryTabs
            tabs={DESIGN_SECTION_ENTRIES.map(([key, labelKey]) => ({ key, label: t(labelKey), onClick: () => onDesignSectionChange(key) }))}
            activeKey={designSection}
          />
          {designSection === "tema" && <TemaSection page={page} isPremium={isPremium} onPatch={onPatch} onError={onError} onUploadBackground={onUploadBackground} />}
          {designSection === "header" && (
            <HeaderSection page={page} onLocalChange={onLocalChange} onPatch={onPatch} onError={onError} onUploadAvatar={onUploadAvatar} />
          )}
          {designSection === "tombol" && <TombolSection page={page} onLocalChange={onLocalChange} onStyleOverride={onStyleOverride} />}
          {designSection === "font" && <FontSection page={page} onLocalChange={onLocalChange} onStyleOverride={onStyleOverride} />}
          {designSection === "stiker" && (
            <section className="glass rounded-jmd p-5 shadow-card">
              <StickerCanvasEditor stickers={stickers} onChange={onStickersChange} />
            </section>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <section className="flex flex-col gap-3 rounded-2xl border border-app-border bg-app-surface p-4">
            <div className="flex items-center gap-2">
              <IconSettings className="h-4 w-4 text-app-muted" />
              <h3 className="text-sm font-bold text-app-ink">{t("dashboard.pages.linksBuilder.settings.title")}</h3>
            </div>
            <label className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-xs font-bold text-app-ink">{t("dashboard.pages.linksBuilder.settings.publish")}</span>
                <span className="block text-[11px] text-app-muted">{t("dashboard.pages.linksBuilder.settings.publishHint")}</span>
              </span>
              <Toggle checked={pageSettings.is_published} onChange={() => onPageSettingsChange({ is_published: !pageSettings.is_published })} label={t("dashboard.pages.linksBuilder.settings.publish")} />
            </label>
            <label className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-xs font-bold text-app-ink">{t("dashboard.pages.linksBuilder.settings.hideWatermark")}</span>
                <span className="block text-[11px] text-app-muted">
                  {isPremium ? t("dashboard.pages.linksBuilder.settings.hideWatermarkHint") : t("dashboard.pages.linksBuilder.settings.premiumOnly")}
                </span>
              </span>
              <Toggle
                checked={pageSettings.hide_watermark}
                disabled={!isPremium}
                onChange={() => onPageSettingsChange({ hide_watermark: !pageSettings.hide_watermark })}
                label={t("dashboard.pages.linksBuilder.settings.hideWatermark")}
              />
            </label>
            <label className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-xs font-bold text-app-ink">{t("dashboard.pages.linksBuilder.settings.noindex")}</span>
                <span className="block text-[11px] text-app-muted">{t("dashboard.pages.linksBuilder.settings.noindexHint")}</span>
              </span>
              <Toggle checked={pageSettings.noindex} onChange={() => onPageSettingsChange({ noindex: !pageSettings.noindex })} label={t("dashboard.pages.linksBuilder.settings.noindex")} />
            </label>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-app-border bg-app-surface p-4">
            <h3 className="text-sm font-bold text-app-ink">{t("dashboard.pages.linksBuilder.settings.seoTitle")}</h3>
            <FormField label={t("dashboard.pages.linksBuilder.settings.seoTitleLabel")}>
              <input
                type="text"
                maxLength={70}
                defaultValue={pageSettings.seo_title}
                key={`seo-title-${pageSettings.seo_title}`}
                onBlur={(e) => {
                  if (e.target.value.trim() !== pageSettings.seo_title) onPageSettingsChange({ seo_title: e.target.value.trim() });
                }}
                placeholder={t("dashboard.pages.linksBuilder.settings.seoTitlePlaceholder")}
                className="w-full rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-ink outline-none focus:border-jeon-purple"
              />
            </FormField>
            <FormField label={t("dashboard.pages.linksBuilder.settings.seoDescriptionLabel")}>
              <textarea
                rows={3}
                maxLength={160}
                defaultValue={pageSettings.seo_description}
                key={`seo-desc-${pageSettings.seo_description}`}
                onBlur={(e) => {
                  if (e.target.value.trim() !== pageSettings.seo_description) onPageSettingsChange({ seo_description: e.target.value.trim() });
                }}
                placeholder={t("dashboard.pages.linksBuilder.settings.seoDescriptionPlaceholder")}
                className="w-full resize-none rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-ink outline-none focus:border-jeon-purple"
              />
            </FormField>
          </section>

          <section className="flex flex-col gap-2 rounded-2xl border border-app-border bg-app-surface p-4">
            <h3 className="text-sm font-bold text-app-ink">{t("dashboard.pages.linksBuilder.settings.publicUrl")}</h3>
            {publicUrl ? (
              <a href={publicUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 break-all text-xs font-semibold text-jeon-purple hover:underline">
                {publicUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              </a>
            ) : (
              <p className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.settings.publicUrlUnavailable")}</p>
            )}
            {/* target="_blank" -- bug ditemukan lewat audit (13 September
                2026): tanpa ini, navigasi client-side Next.js TIDAK
                memicu listener beforeunload (page.tsx) ATAUPUN lewat
                handleBack (yang punya window.confirm) -- klik tautan ini
                membuang SELURUH draft belum tersimpan TANPA peringatan
                apa pun. */}
            <Link href={settingsHref} target="_blank" className="flex items-center gap-1 text-xs font-bold text-app-muted hover:text-jeon-purple">
              {t("dashboard.pages.linksBuilder.openSettingsPage")}
              <IconExternal className="h-3.5 w-3.5" />
            </Link>
          </section>
        </div>
      )}

      {addModalOpen && (
        <BuilderAddComponentModal
          onClose={() => setAddModalOpen(false)}
          nested={!!addTarget}
          onSelect={(type) => {
            setAddModalOpen(false);
            onAdd(addTarget, type);
          }}
        />
      )}
    </div>
  );
}
