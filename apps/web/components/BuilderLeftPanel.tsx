"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
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
  IconBook,
  IconBox,
  IconCamera,
  IconChevronRight,
  IconClock,
  IconColumns,
  IconDivider,
  IconExternal,
  IconGripVertical,
  IconIframe,
  IconLink,
  IconListCard,
  IconMapPin,
  IconPhotoLibrary,
  IconPlayCircle,
  IconPlus,
  IconSettings,
  IconShoppingBag,
  IconSlideshow,
  IconTextLines,
  IconTrash,
  IconVideoImage,
  IconX,
} from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import {
  ApiError,
  deleteBuilderMediaImage,
  deleteGalleryImage,
  uploadBuilderMediaImage,
  uploadGalleryImage,
  type DashboardProduct,
  type EmbeddedBuilderBlock,
  type LinkItem,
  type PageStickerData,
} from "@/lib/api-client";
import {
  buildTree,
  findNodeByPath,
  selectionOf,
  type BuilderSeg,
  type BuilderSelection,
  type BuilderTreeNode,
} from "@/lib/builder-blocks";
import BuilderAddComponentModal from "@/components/BuilderAddComponentModal";
import DesignCategoryTabs from "@/components/dashboard/page/DesignCategoryTabs";
import StickerCanvasEditor from "@/components/StickerCanvasEditor";
import RichTextEditor from "@/components/dashboard/page/RichTextEditor";
import {
  FontSection,
  HeaderSection,
  TemaSection,
  TombolSection,
  type DesignSectionPage,
  type DesignSectionPatch,
} from "@/components/dashboard/page/design-sections";

// CreateProductForm -- lihat catatan lengkap di komponen itu sendiri:
// blok "produk" (NodeFieldEditor case di bawah) memakai form BUAT PRODUK
// BARU yang SAMA PERSIS dengan menu Produk dashboard, dibungkus modal
// overlay baru di sini (dashboard/products/page.tsx makainya inline).
const CreateProductForm = dynamic(() => import("@/components/dashboard/products/CreateProductForm"));

// BuilderDesignSection -- 5 sub-tab Design di dalam builder (permintaan
// langsung pengguna 9 September 2026, "design langsung di builder juga")
// -- SENGAJA cuma 5, TIDAK 6 seperti DesignSection (ProdukPageEditor.tsx):
// "blok" (isi/urutan blok) di sini SUDAH jadi tab "content" tersendiri di
// level atas panel ini, tidak perlu diduplikasi sebagai sub-tab Design.
export type BuilderDesignSection = "tema" | "header" | "tombol" | "font" | "stiker";

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

function siblingsOf(tree: BuilderTreeNode[], node: BuilderTreeNode): BuilderTreeNode[] {
  if (node.path.length === 0) return tree;
  const parent = findNodeByPath(tree, node.rootId, node.path.slice(0, -1));
  return parent ? parent.children : [];
}

const TYPE_ICON: Record<string, (p: { className?: string }) => React.ReactElement> = {
  text: IconTextLines,
  button: IconExternal,
  divider: IconDivider,
  column: IconColumns,
  section: IconBox,
  video: IconPlayCircle,
  faq: IconBook,
  gallery: IconPhotoLibrary,
  image: IconCamera,
  video_image: IconVideoImage,
  embed_link: IconLink,
  countdown: IconClock,
  list: IconListCard,
  image_slider: IconSlideshow,
  embed: IconIframe,
  maps: IconMapPin,
  produk: IconShoppingBag,
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

// stripHtml/truncate -- redesain total (permintaan langsung pengguna 10
// September 2026, "tidak perlu tampilkan teks component nya tetapi hanya
// isi dari component nya saja"): blok "text" sekarang HTML (RichTextEditor),
// preview di tree HARUS teks polos ringkas, bukan markup mentah ataupun
// nama tipe generik "Text".
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

// previewLabelFor -- pengganti `label` lama (SELALU nama tipe generik utk
// blok tanpa `title`, keluhan langsung pengguna): "text" tampilkan cuplikan
// ISI, blok berbasis daftar (faq/list/gallery/image_slider) tampilkan
// JUMLAH item -- tipe lain (button/video/embed_link/dst) SUDAH benar
// (title terisi begitu pengguna mengisinya), fallback nama tipe generik
// HANYA kalau benar-benar belum diisi sama sekali, sama seperti sebelumnya.
function previewLabelFor(node: BuilderTreeNode, t: (key: string) => string, products: DashboardProduct[]): string {
  if (node.kind === "column-slot") {
    const lastSeg = node.path[node.path.length - 1];
    return `${t("dashboard.pages.linksBuilder.columnLabel")} ${lastSeg && lastSeg.kind === "column" ? lastSeg.index + 1 : ""}`;
  }
  const generic = () => node.title || t(`dashboard.components.builderAddComponentModal.${TYPE_LABEL_KEY[node.blockType ?? ""] ?? "typeText"}`);
  switch (node.blockType) {
    case "produk": {
      const productId = node.blockData?.product_id as string | undefined;
      const product = productId ? products.find((p) => p.id === productId) : undefined;
      return product ? product.name : t("dashboard.pages.linksBuilder.produkEmptyPreview");
    }
    case "text": {
      const plain = stripHtml((node.blockData?.text as string) ?? "");
      return plain ? truncate(plain, 40) : t("dashboard.pages.linksBuilder.textEmptyPreview");
    }
    case "faq": {
      const count = ((node.blockData?.items as unknown[] | undefined) ?? []).length;
      return count > 0 ? t("dashboard.pages.linksBuilder.faqCount").replace("{n}", String(count)) : generic();
    }
    case "list": {
      const count = ((node.blockData?.items as unknown[] | undefined) ?? []).length;
      return count > 0 ? t("dashboard.pages.linksBuilder.listCount").replace("{n}", String(count)) : generic();
    }
    case "gallery":
    case "image_slider": {
      const count = ((node.blockData?.images as unknown[] | undefined) ?? []).length;
      return count > 0 ? t("dashboard.pages.linksBuilder.photoCount").replace("{n}", String(count)) : generic();
    }
    default:
      return generic();
  }
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
function FaqItemsEditor({ node, onUpdate }: { node: BuilderTreeNode; onUpdate: (items: { question: string; answer: string }[]) => void }) {
  const { t } = useLocale();
  const items = (node.blockData?.items as { question: string; answer: string }[] | undefined) ?? [];

  function updateItem(index: number, patch: Partial<{ question: string; answer: string }>) {
    onUpdate(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={`${i}-${items.length}`} className="flex flex-col gap-1 rounded-lg border border-app-border p-2">
          <div className="flex items-center gap-1">
            <input
              defaultValue={item.question}
              onBlur={(e) => updateItem(i, { question: e.target.value })}
              placeholder={t("dashboard.pages.linksBuilder.faqQuestionPlaceholder")}
              className="w-full rounded-md border border-app-border p-1.5 text-xs outline-none focus:border-jeon-purple"
            />
            <button
              type="button"
              onClick={() => onUpdate(items.filter((_, idx) => idx !== i))}
              aria-label={t("dashboard.pages.linksBuilder.faqRemoveQuestion")}
              className="flex-shrink-0 text-app-muted hover:text-red-600"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            defaultValue={item.answer}
            onBlur={(e) => updateItem(i, { answer: e.target.value })}
            rows={2}
            placeholder={t("dashboard.pages.linksBuilder.faqAnswerPlaceholder")}
            className="w-full rounded-md border border-app-border p-1.5 text-xs outline-none focus:border-jeon-purple"
          />
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-full w-full rounded-lg object-cover ring-1 ring-black/5" />
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
  onEnsureRootPersisted,
  onChanged,
}: {
  rootId: string;
  path: BuilderSeg[];
  images: string[];
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

  async function handleDelete(index: number) {
    setError(null);
    try {
      const realRootId = await onEnsureRootPersisted(rootId);
      const res = await deleteGalleryImage(realRootId, index, path);
      onChanged(res.images, realRootId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.deleteImageFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-app-muted">
        {images.length}/{maxGalleryImages}
      </p>
      <div className="flex flex-wrap gap-2">
        {images.map((src, i) => (
          <div key={i} className="group relative h-16 w-16 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full rounded-md object-cover ring-1 ring-black/5" />
            <button
              type="button"
              onClick={() => handleDelete(i)}
              title={t("dashboard.pages.linksBuilder.removePhoto")}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
            >
              <IconX className="h-3 w-3" />
            </button>
          </div>
        ))}
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

// toDatetimeLocalValue -- Canvas Page Builder Fase 3 (block "countdown"):
// `<input type="datetime-local">` butuh format LOKAL tanpa offset zona
// waktu ("YYYY-MM-DDTHH:mm"), beda dari `target_at` yang disimpan sbg
// ISO 8601 UTC (`toISOString()`, lihat onBlur di bawah) -- konversi manual
// pakai getFullYear/dst (BUKAN slice string ISO) supaya representasi yang
// ditampilkan konsisten di ZONA WAKTU BROWSER kreator, bukan UTC mentah.
function toDatetimeLocalValue(targetAt: string | undefined): string {
  if (!targetAt) return "";
  const d = new Date(targetAt);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ListItemsEditor -- Canvas Page Builder Fase 3 (permintaan langsung
// pengguna 8 September 2026): editor block_type "list" (gabungan "Card/
// List/Testimony" jadi satu block_type fleksibel, dikonfirmasi via
// AskUserQuestion) -- selector gaya (List/Card/Testimoni) + daftar item
// tambah/hapus, pola SAMA PERSIS FaqItemsEditor (termasuk key-remount fix
// `${i}-${items.length}` supaya baris yang digeser index-nya tidak
// menampilkan teks basi dari baris lain, uncontrolled input).
interface ListEditorItem {
  title: string;
  description?: string;
  author?: string;
}

function ListItemsEditor({
  node,
  onUpdateStyle,
  onUpdateItems,
}: {
  node: BuilderTreeNode;
  onUpdateStyle: (style: "list" | "card" | "testimony") => void;
  onUpdateItems: (items: ListEditorItem[]) => void;
}) {
  const { t } = useLocale();
  const style = (node.blockData?.style as "list" | "card" | "testimony" | undefined) ?? "list";
  const items = (node.blockData?.items as ListEditorItem[] | undefined) ?? [];
  const isTestimony = style === "testimony";

  function updateItem(index: number, patch: Partial<ListEditorItem>) {
    onUpdateItems(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {(
          [
            ["list", t("dashboard.pages.linksBuilder.listStyleList")],
            ["card", t("dashboard.pages.linksBuilder.listStyleCard")],
            ["testimony", t("dashboard.pages.linksBuilder.listStyleTestimony")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onUpdateStyle(key)}
            className={`flex-1 rounded-lg border-2 px-2 py-1.5 text-[11px] font-bold ${
              style === key ? "border-jeon-purple bg-jeon-lavender/40 text-jeon-purple" : "border-app-border text-app-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={`${i}-${items.length}`} className="flex flex-col gap-1 rounded-lg border border-app-border p-2">
            <div className="flex items-center gap-1">
              <input
                defaultValue={item.title}
                onBlur={(e) => updateItem(i, { title: e.target.value })}
                placeholder={
                  isTestimony ? t("dashboard.pages.linksBuilder.listItemNamePlaceholder") : t("dashboard.pages.linksBuilder.listItemTitlePlaceholder")
                }
                className="w-full rounded-md border border-app-border p-1.5 text-xs outline-none focus:border-jeon-purple"
              />
              <button
                type="button"
                onClick={() => onUpdateItems(items.filter((_, idx) => idx !== i))}
                aria-label={t("dashboard.pages.linksBuilder.listRemoveItem")}
                className="flex-shrink-0 text-app-muted hover:text-red-600"
              >
                <IconTrash className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              defaultValue={item.description ?? ""}
              onBlur={(e) => updateItem(i, { description: e.target.value })}
              rows={2}
              placeholder={
                isTestimony ? t("dashboard.pages.linksBuilder.listItemQuotePlaceholder") : t("dashboard.pages.linksBuilder.listItemDescriptionPlaceholder")
              }
              className="w-full rounded-md border border-app-border p-1.5 text-xs outline-none focus:border-jeon-purple"
            />
            {isTestimony && (
              <input
                defaultValue={item.author ?? ""}
                onBlur={(e) => updateItem(i, { author: e.target.value })}
                placeholder={t("dashboard.pages.linksBuilder.listItemAuthorPlaceholder")}
                className="w-full rounded-md border border-app-border p-1.5 text-xs outline-none focus:border-jeon-purple"
              />
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onUpdateItems([...items, { title: "", description: "" }])}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
      >
        <IconPlus className="h-3.5 w-3.5" />
        {t("dashboard.pages.linksBuilder.listAddItem")}
      </button>
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

// ProdukBlockEditor -- editor blok "produk" (permintaan langsung pengguna
// 10 September 2026, "harusnya ada blok produk isinya sama seperti mengisi
// di menu product... ada 3 pilihan"): pilih SATU produk existing dari
// daftar milik kreator, ATAU buat produk baru langsung dari builder lewat
// `CreateProductForm` (SAMA PERSIS alur menu Produk dashboard) dibungkus
// modal overlay baru (panel builder terlalu sempit utk form penuh inline,
// pola styling sama `ManageProductModal.tsx`). Produk baru langsung
// terpilih (onProductCreated dipanggil PLUS onSelectProduct via pemanggil
// di NodeFieldEditor) supaya kreator tidak perlu klik pilih lagi.
function ProdukBlockEditor({
  node,
  products,
  onSelectProduct,
  onProductCreated,
}: {
  node: BuilderTreeNode;
  products: DashboardProduct[];
  onSelectProduct: (productId: string) => void;
  onProductCreated: (product: DashboardProduct) => void;
}) {
  const { t } = useLocale();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const selectedId = node.blockData?.product_id as string | undefined;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-app-muted">{t("dashboard.pages.linksBuilder.produkSelectExisting")}</p>
      {products.length === 0 ? (
        <p className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.produkNoProducts")}</p>
      ) : (
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectProduct(p.id)}
              className={`flex items-center gap-2 rounded-lg border-2 p-1.5 text-left ${
                selectedId === p.id ? "border-jeon-purple bg-jeon-lavender/40" : "border-app-border hover:border-jeon-purple"
              }`}
            >
              {p.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.cover_image_url} alt="" className="h-8 w-8 flex-shrink-0 rounded-md object-cover" />
              ) : (
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-jeon-lavender/50">
                  <IconShoppingBag className="h-4 w-4 text-jeon-purple" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-app-ink">{p.name}</span>
                <span className="block text-[11px] text-app-muted">Rp {p.effective_price_idr.toLocaleString("id-ID")}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
      >
        <IconPlus className="h-3.5 w-3.5" />
        {t("dashboard.pages.linksBuilder.produkCreateNew")}
      </button>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setCreating(false)}>
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-jlg border-2 border-jeon-ink bg-app-surface p-4 shadow-brutal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.linksBuilder.produkCreateNew")}</h2>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-app-muted hover:bg-jeon-purple/10"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>
            {createError && <p className="mt-1 text-[11px] text-red-600">{createError}</p>}
            <CreateProductForm
              onCreated={(product) => {
                setCreating(false);
                onProductCreated(product);
              }}
              onCancel={() => setCreating(false)}
              onError={setCreateError}
            />
          </div>
        </div>
      )}
    </div>
  );
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
  products,
  onProductCreated,
}: {
  node: BuilderTreeNode;
  onUpdateNode: (target: BuilderSelection, patch: { title?: string; url?: string; description?: string; blockData?: Record<string, unknown> }) => void;
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  onMediaImageChanged: (rootId: string, path: BuilderSeg[], imageUrl: string) => void;
  onGalleryImagesChanged: (rootId: string, path: BuilderSeg[], images: string[]) => void;
  products: DashboardProduct[];
  onProductCreated: (product: DashboardProduct) => void;
}) {
  const { t } = useLocale();
  const sel = selectionOf(node);

  if (node.blockType === "text") {
    return (
      <RichTextEditor
        key={node.id}
        html={(node.blockData?.text as string) ?? ""}
        onChange={(html) => onUpdateNode(sel, { blockData: { text: html } })}
      />
    );
  }

  // "link" -- tautan biasa klasik (mis. "Follow di Instagram" dari template
  // Quick Setup), bukan blok Canvas -- TAPI baris `links` yang sama dibagi
  // rata antara editor klasik (dashboard/links/page.tsx) & tree builder ini
  // (buildTree tidak menyaring block_type sama sekali), jadi tautan lama
  // MUNCUL di sini juga. Bug ditemukan lewat laporan langsung pengguna (10
  // September 2026, screenshot "Follow di Instagram" menampilkan pesan
  // "blok ini murni wadah" yang SALAH -- fallback lama tidak mengenali tipe
  // ini sama sekali) -- field MINIMAL (judul+url) yang sama seperti "button",
  // fitur lanjutan (ikon/kunci/jadwal) tetap lewat halaman Tautan klasik.
  if (node.blockType === "link") {
    return (
      <div className="flex flex-col gap-2">
        <input
          defaultValue={node.title}
          onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
          placeholder={t("dashboard.pages.linksBuilder.buttonTitlePlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
        <input
          defaultValue={node.url ?? ""}
          onBlur={(e) => onUpdateNode(sel, { url: e.target.value })}
          placeholder={t("dashboard.pages.linksBuilder.buttonUrlPlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
        <p className="text-[11px] text-app-muted">{t("dashboard.pages.linksBuilder.legacyLinkHint")}</p>
      </div>
    );
  }

  if (node.blockType === "button") {
    return (
      <div className="flex flex-col gap-2">
        <input
          defaultValue={node.title}
          onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
          placeholder={t("dashboard.pages.linksBuilder.buttonTitlePlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
        <input
          defaultValue={node.url ?? ""}
          onBlur={(e) => onUpdateNode(sel, { url: e.target.value })}
          placeholder={t("dashboard.pages.linksBuilder.buttonUrlPlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
      </div>
    );
  }

  if (node.blockType === "video") {
    return (
      <div className="flex flex-col gap-2">
        <input
          defaultValue={node.title}
          onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
          placeholder={t("dashboard.pages.linksBuilder.videoTitlePlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
        <input
          defaultValue={(node.blockData?.video_url as string) ?? ""}
          onBlur={(e) => onUpdateNode(sel, { blockData: { video_url: e.target.value } })}
          placeholder={t("dashboard.pages.linksBuilder.videoUrlPlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
      </div>
    );
  }

  if (node.blockType === "faq") {
    return <FaqItemsEditor node={node} onUpdate={(items) => onUpdateNode(sel, { blockData: { items } })} />;
  }

  if (node.blockType === "image") {
    return (
      <MediaImageEditor
        key={node.id}
        rootId={node.rootId}
        path={node.path}
        imageUrl={(node.blockData?.image_url as string) || undefined}
        onEnsureRootPersisted={onEnsureRootPersisted}
        onChanged={(url, resolvedRootId) => onMediaImageChanged(resolvedRootId, node.path, url)}
      />
    );
  }

  if (node.blockType === "gallery" || node.blockType === "image_slider") {
    return (
      <GalleryGridEditor
        key={node.id}
        rootId={node.rootId}
        path={node.path}
        images={(node.blockData?.images as string[] | undefined) ?? []}
        onEnsureRootPersisted={onEnsureRootPersisted}
        onChanged={(images, resolvedRootId) => onGalleryImagesChanged(resolvedRootId, node.path, images)}
      />
    );
  }

  if (node.blockType === "video_image") {
    return (
      <div className="flex flex-col gap-3">
        <input
          defaultValue={(node.blockData?.video_url as string) ?? ""}
          onBlur={(e) => onUpdateNode(sel, { blockData: { video_url: e.target.value } })}
          placeholder={t("dashboard.pages.linksBuilder.videoUrlPlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
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
      <div className="flex flex-col gap-2">
        <input
          defaultValue={node.title}
          onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
          placeholder={t("dashboard.pages.linksBuilder.embedLinkTitlePlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
        <input
          defaultValue={node.url ?? ""}
          onBlur={(e) => onUpdateNode(sel, { url: e.target.value })}
          placeholder={t("dashboard.pages.linksBuilder.embedLinkUrlPlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
        <textarea
          defaultValue={node.description ?? ""}
          onBlur={(e) => onUpdateNode(sel, { description: e.target.value })}
          rows={2}
          placeholder={t("dashboard.pages.linksBuilder.embedLinkDescriptionPlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
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
      <div className="flex flex-col gap-2">
        <input
          defaultValue={node.title}
          onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
          placeholder={t("dashboard.pages.linksBuilder.countdownTitlePlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
        <input
          type="datetime-local"
          defaultValue={toDatetimeLocalValue(node.blockData?.target_at as string | undefined)}
          onBlur={(e) =>
            onUpdateNode(sel, {
              blockData: { target_at: e.target.value ? new Date(e.target.value).toISOString() : "" },
            })
          }
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
      </div>
    );
  }

  if (node.blockType === "list") {
    return (
      <ListItemsEditor
        node={node}
        onUpdateStyle={(style) => onUpdateNode(sel, { blockData: { style } })}
        onUpdateItems={(items) => onUpdateNode(sel, { blockData: { items } })}
      />
    );
  }

  if (node.blockType === "embed") {
    return (
      <div className="flex flex-col gap-2">
        <input
          defaultValue={node.title}
          onBlur={(e) => onUpdateNode(sel, { title: e.target.value })}
          placeholder={t("dashboard.pages.linksBuilder.embedTitlePlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
        <input
          defaultValue={(node.blockData?.embed_url as string) ?? ""}
          onBlur={(e) => onUpdateNode(sel, { blockData: { embed_url: e.target.value } })}
          placeholder={t("dashboard.pages.linksBuilder.embedUrlPlaceholder")}
          className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
        />
        <p className="text-[11px] text-app-muted">{t("dashboard.pages.linksBuilder.embedHint")}</p>
      </div>
    );
  }

  if (node.blockType === "maps") {
    return <MapsEditor node={node} onUpdate={(url, embed) => onUpdateNode(sel, { url, blockData: { embed } })} />;
  }

  if (node.blockType === "produk") {
    return (
      <ProdukBlockEditor
        node={node}
        products={products}
        onSelectProduct={(productId) => onUpdateNode(sel, { blockData: { product_id: productId } })}
        onProductCreated={(product) => {
          onProductCreated(product);
          onUpdateNode(sel, { blockData: { product_id: product.id } });
        }}
      />
    );
  }

  if (node.blockType === "column") {
    return (
      <div className="flex items-center gap-2">
        <label className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.columnCount")}</label>
        <select
          defaultValue={((node.blockData?.columns as unknown[] | undefined)?.length ?? 2).toString()}
          onChange={(e) => {
            const count = Number(e.target.value);
            const existing = (node.blockData?.columns as { children?: EmbeddedBuilderBlock[] }[] | undefined) ?? [];
            const columns = Array.from({ length: count }, (_, i) => existing[i] ?? { children: [] });
            onUpdateNode(sel, { blockData: { columns } });
          }}
          className="rounded-lg border border-app-border px-2 py-1 text-xs outline-none focus:border-jeon-purple"
        >
          {[2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // section/divider/column-slot -- murni wadah, tidak ada field sendiri.
  if (node.kind === "column-slot" || node.blockType === "section" || node.blockType === "divider") {
    return <p className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.containerHint")}</p>;
  }

  // Tipe blok klasik lain (heading/contact_form/accordion/audio/file/
  // project_showcase/catalog) -- dibuat lewat editor Tautan klasik
  // (dashboard/links/page.tsx) atau BlockDrilldownEditor, BUKAN tile
  // "Tambah Komponen" builder ini, jadi belum punya editor in-place di
  // sini. Bug ditemukan lewat laporan langsung pengguna (10 September
  // 2026): fallback LAMA di sini SELALU bilang "blok ini murni wadah"
  // (salah, blok-blok ini bukan wadah sama sekali) -- pesan ini jujur
  // soal batasannya alih-alih menyesatkan.
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
function TreeNodeView({
  node,
  depth,
  selection,
  onSelect,
  onDeselect,
  onDelete,
  collapsed,
  onToggleCollapsed,
  onUpdateNode,
  onEnsureRootPersisted,
  onMediaImageChanged,
  onGalleryImagesChanged,
  products,
  onProductCreated,
}: {
  node: BuilderTreeNode;
  depth: number;
  selection: BuilderSelection | null;
  onSelect: (node: BuilderTreeNode) => void;
  onDeselect: () => void;
  onDelete: (target: BuilderSelection) => void;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string) => void;
  onUpdateNode: (target: BuilderSelection, patch: { title?: string; url?: string; description?: string; blockData?: Record<string, unknown> }) => void;
  onEnsureRootPersisted: (rootId: string) => Promise<string>;
  onMediaImageChanged: (rootId: string, path: BuilderSeg[], imageUrl: string) => void;
  onGalleryImagesChanged: (rootId: string, path: BuilderSeg[], images: string[]) => void;
  products: DashboardProduct[];
  onProductCreated: (product: DashboardProduct) => void;
}) {
  const { t } = useLocale();
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
  const label = previewLabelFor(node, t, products);
  const childIds = node.children.filter((c) => c.kind === "block").map((c) => c.id);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        style={{ paddingLeft: `${depth * 16}px` }}
        className={`flex items-center gap-1 rounded-lg py-1.5 pr-1.5 text-xs ${isThisSelected ? "bg-jeon-lavender/60" : "hover:bg-app-surface-2"}`}
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
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0 text-app-muted" />}
          <span className={`truncate ${isThisSelected ? "font-bold text-jeon-purple" : "font-semibold text-app-ink"}`}>{label}</span>
        </button>
        {node.kind === "block" && isThisSelected && (
          <button
            type="button"
            onClick={() => {
              onDelete(selectionOf(node));
              onDeselect();
            }}
            aria-label={t("dashboard.pages.linksBuilder.deleteSelected")}
            className="flex-shrink-0 text-red-500 hover:text-red-600"
          >
            <IconTrash className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isThisSelected && (
        <div style={{ paddingLeft: `${(depth + 1) * 16}px` }} className="pb-2.5 pr-1.5 pt-1">
          <NodeFieldEditor
            node={node}
            onUpdateNode={onUpdateNode}
            onEnsureRootPersisted={onEnsureRootPersisted}
            onMediaImageChanged={onMediaImageChanged}
            onGalleryImagesChanged={onGalleryImagesChanged}
            products={products}
            onProductCreated={onProductCreated}
          />
        </div>
      )}

      {canExpand && !collapsed.has(node.id) && (
        <div>
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
                  collapsed={collapsed}
                  onToggleCollapsed={onToggleCollapsed}
                  onUpdateNode={onUpdateNode}
                  onEnsureRootPersisted={onEnsureRootPersisted}
                  onMediaImageChanged={onMediaImageChanged}
                  onGalleryImagesChanged={onGalleryImagesChanged}
                  products={products}
                  onProductCreated={onProductCreated}
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
  onReorderRoot,
  onReorderChildren,
  onUpdateNode,
  onEnsureRootPersisted,
  onMediaImageChanged,
  onGalleryImagesChanged,
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
}: {
  links: LinkItem[];
  // selection/onSelectionChange -- dinaikkan ke rute builder (permintaan
  // langsung pengguna 9 September 2026, "klik blok di kanvas juga"):
  // BuilderCanvas.tsx (klik DOM lewat data-builder-node-id) & panel ini
  // (klik tree) sekarang menulis ke SATU state yang sama di induk.
  selection: BuilderSelection | null;
  onSelectionChange: (selection: BuilderSelection | null) => void;
  onAdd: (target: BuilderSelection | null, type: EmbeddedBuilderBlock["block_type"] | "maps") => void;
  onDelete: (target: BuilderSelection) => void;
  onReorderRoot: (orderedIds: string[]) => void;
  onReorderChildren: (rootId: string, containerPath: BuilderSeg[], orderedIds: string[]) => void;
  onUpdateNode: (target: BuilderSelection, patch: { title?: string; url?: string; description?: string; blockData?: Record<string, unknown> }) => void;
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
  onUploadBackground: (file: File) => Promise<void>;
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
  // bandingkan `selection` (identitas objek) ke render sebelumnya.
  const [prevSelection, setPrevSelection] = useState(selection);
  if (selection !== prevSelection) {
    setPrevSelection(selection);
    if (selection) setTab("content");
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    if (containerKeyOf(dragged) !== containerKeyOf(target)) return; // lintas kontainer belum didukung Fase 1

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
          <div className="flex-1 overflow-y-auto p-2">
            {tree.length === 0 ? (
              <p className="p-3 text-center text-xs text-app-muted">{t("dashboard.pages.linksBuilder.emptyRoot")}</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
                  {tree.map((node) => (
                    <TreeNodeView
                      key={node.id}
                      node={node}
                      depth={0}
                      selection={selection}
                      onSelect={(n) => onSelectionChange(selectionOf(n))}
                      onDeselect={() => onSelectionChange(null)}
                      onDelete={onDelete}
                      collapsed={collapsed}
                      onToggleCollapsed={toggleCollapsed}
                      onUpdateNode={onUpdateNode}
                      onEnsureRootPersisted={onEnsureRootPersisted}
                      onMediaImageChanged={onMediaImageChanged}
                      onGalleryImagesChanged={onGalleryImagesChanged}
                      products={products}
                      onProductCreated={onProductCreated}
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
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <IconSettings className="h-6 w-6 text-app-muted" />
          <p className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.settingsPlaceholder")}</p>
          <Link href={settingsHref} className="flex items-center gap-1 text-xs font-bold text-jeon-purple hover:underline">
            {t("dashboard.pages.linksBuilder.openSettingsPage")}
            <IconExternal className="h-3.5 w-3.5" />
          </Link>
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
