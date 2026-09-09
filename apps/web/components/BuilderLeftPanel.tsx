"use client";

import { useMemo, useState } from "react";
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
import {
  FontSection,
  HeaderSection,
  TemaSection,
  TombolSection,
  type DesignSectionPage,
  type DesignSectionPatch,
} from "@/components/dashboard/page/design-sections";

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

// BuilderLeftPanel -- Canvas Page Builder (migrasi 000096, permintaan
// langsung pengguna 7 September 2026, dua screenshot Lynk.id): shell tab
// Content/Design/Settings di sebelah kiri BuilderCanvas. Fase 1: Design &
// Settings TIDAK membangun UI baru sama sekali (per rencana) -- cukup
// tautan keluar ke halaman Desain/Pengaturan yang SUDAH ADA (mengelola
// tema/tombol/header di sini juga akan berarti menyalin ulang komponen
// besar dashboard/design/*, di luar cakupan Fase 1). Content tab: daftar
// blok berindentasi (root + isi Section/Column) + tombol "Tambah
// Komponen" yang menambah di ROOT atau DI DALAM kontainer terpilih.
//
// Drag-and-drop (@dnd-kit, dependency baru disetujui eksplisit): SATU
// DndContext membungkus seluruh pohon, TIAP level kontainer (root, isi
// SATU Section, isi SATU kolom) punya SortableContext independen sendiri
// -- reorder DI DALAM satu kontainer yang sama didukung penuh. Memindah
// blok LINTAS kontainer (root -> dalam Section, kolom 1 -> kolom 2, dst)
// SENGAJA belum didukung di Fase 1 (containerKeyOf di bawah menolak drop
// kalau kontainer asal & tujuan beda) -- itu jauh lebih rumit (perlu
// PATCH ke DUA baris root berbeda sekaligus utk kasus lintas-root), utk
// sekarang tambah komponen baru langsung ke kontainer tujuan lewat
// "Tambah Komponen", pindahkan lewat hapus+tambah ulang.
// containerKeyOf -- kunci identitas kontainer (root, ATAU SATU Section/
// kolom tertentu) yang menaungi `node`. Dipakai handleDragEnd utk menolak
// drop LINTAS kontainer (lihat catatan lengkap di atas komponen ini).
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
  // Fase 2 (permintaan langsung pengguna 8 September 2026) -- ikon SAMA
  // persis dgn tile BuilderAddComponentModal.tsx, "gallery" (block_type
  // asli) tampil sbg "Image Grid" di sini juga.
  video: IconPlayCircle,
  faq: IconBook,
  gallery: IconPhotoLibrary,
  image: IconCamera,
  video_image: IconVideoImage,
  embed_link: IconLink,
  // Fase 3 (permintaan langsung pengguna 8 September 2026).
  countdown: IconClock,
  list: IconListCard,
  image_slider: IconSlideshow,
  embed: IconIframe,
  maps: IconMapPin,
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

function TreeNodeView({
  node,
  depth,
  isSelected,
  onSelect,
  collapsed,
  onToggleCollapsed,
}: {
  node: BuilderTreeNode;
  depth: number;
  isSelected: (node: BuilderTreeNode) => boolean;
  onSelect: (node: BuilderTreeNode) => void;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string) => void;
}) {
  const { t } = useLocale();
  // useSortable -- HANYA node "block" yang bisa diseret (column-slot murni
  // wadah tampilan "Kolom N", tidak punya urutan sendiri untuk diubah).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    disabled: node.kind !== "block",
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const Icon = node.kind === "block" ? (TYPE_ICON[node.blockType ?? ""] ?? IconBox) : null;
  const canExpand = node.kind === "column-slot" || node.blockType === "section" || node.blockType === "column";
  const lastSeg = node.path[node.path.length - 1];
  const label =
    node.kind === "column-slot"
      ? `${t("dashboard.pages.linksBuilder.columnLabel")} ${lastSeg && lastSeg.kind === "column" ? lastSeg.index + 1 : ""}`
      : node.title || t(`dashboard.components.builderAddComponentModal.${TYPE_LABEL_KEY[node.blockType ?? ""] ?? "typeText"}`);
  const childIds = node.children.filter((c) => c.kind === "block").map((c) => c.id);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        style={{ paddingLeft: `${depth * 16}px` }}
        className={`flex items-center gap-1 rounded-lg py-1.5 pr-1.5 text-xs ${isSelected(node) ? "bg-jeon-lavender/60" : "hover:bg-app-surface-2"}`}
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
        <button type="button" onClick={() => onSelect(node)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0 text-app-muted" />}
          <span className="truncate font-semibold text-app-ink">{label}</span>
        </button>
      </div>
      {canExpand && !collapsed.has(node.id) && (
        <div>
          {node.children.length === 0 ? (
            <p style={{ paddingLeft: `${(depth + 1) * 16 + 20}px` }} className="py-1 text-[11px] text-app-muted">
              {t("dashboard.pages.linksBuilder.emptyContainer")}
            </p>
          ) : (
            <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
              {node.children.map((child) => (
                <TreeNodeView key={child.id} node={child} depth={depth + 1} isSelected={isSelected} onSelect={onSelect} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
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

// MediaImageEditor -- Canvas Page Builder Fase 2 langkah 7 (permintaan
// langsung pengguna 8 September 2026): upload foto TUNGGAL (unggah ulang
// menimpa), dipakai bersama utk "image", separuh foto "video_image", DAN
// thumbnail "embed_link" -- ketiganya sama-sama lewat endpoint
// uploadBuilderMediaImage/deleteBuilderMediaImage (mediaImageBlockTypes,
// links.go). `key={selectedNode.id}` di titik pemanggilan memaksa remount
// tiap ganti node terpilih supaya state `uploading` lokal tidak
// terbawa-bawa ke node lain (pola sama FaqItemsEditor di atas).
function MediaImageEditor({
  rootId,
  path,
  imageUrl,
  onChanged,
}: {
  rootId: string;
  path: BuilderSeg[];
  imageUrl: string | undefined;
  onChanged: () => void;
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
      await uploadBuilderMediaImage(rootId, file, path);
      onChanged();
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
      await deleteBuilderMediaImage(rootId, path);
      onChanged();
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

// GalleryGridEditor -- Canvas Page Builder Fase 2 langkah 7: grid
// multi-foto blok "gallery" (tile "Image Grid"), pola visual disalin dari
// panel "Kelola foto" dashboard/links/page.tsx TAPI UI baru berdiri
// sendiri (bukan reuse komponen -- tidak ada komponen gallery panel yang
// reusable, lihat catatan lengkap di plan) memakai fungsi upload yang
// SAMA (uploadGalleryImage/deleteGalleryImage) dengan tambahan `path`.
function GalleryGridEditor({
  rootId,
  path,
  images,
  onChanged,
}: {
  rootId: string;
  path: BuilderSeg[];
  images: string[];
  onChanged: () => void;
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
      await uploadGalleryImage(rootId, file, path);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.uploadImageFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(index: number) {
    setError(null);
    try {
      await deleteGalleryImage(rootId, index, path);
      onChanged();
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
// selalu ikut terbawa, apa pun yang baru saja diubah pengguna -- pola
// SAMA PERSIS `handleSaveContent` (dashboard/links/page.tsx) yang
// mengirim url+block_data.embed sekaligus lewat satu tombol Simpan.
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

export default function BuilderLeftPanel({
  links,
  selection,
  onSelectionChange,
  onAdd,
  onDelete,
  onReorderRoot,
  onReorderChildren,
  onUpdateNode,
  onRefresh,
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
  // onRefresh -- Fase 2 langkah 7: upload/hapus foto (image/gallery/
  // video_image/embed_link) memutasi baris `links` LANGSUNG di backend
  // (bukan lewat PATCH onUpdateNode) -- panel ini perlu memicu refetch
  // supaya `links` prop (dan tree turunannya) ikut termutakhir.
  onRefresh: () => void;
  settingsHref: string;
  // page/isPremium/onPatch/onLocalChange/onStyleOverride/onUploadAvatar/
  // onUploadBackground/onError/stickers/onStickersChange/designSection/
  // onDesignSectionChange -- Bagian 2 (permintaan langsung pengguna 9
  // September 2026, "design langsung di builder juga"): tab "design" di
  // bawah SEBELUMNYA cuma placeholder + tautan keluar ke /dashboard/design
  // (Fase 1 builder) -- sekarang berisi Tema/Header/Tombol/Font/Stiker
  // SUNGGUHAN, komponen yang SAMA dipakai ProdukPageEditor.tsx (lihat
  // components/dashboard/page/design-sections.tsx).
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

  function isSelected(node: BuilderTreeNode) {
    return !!selection && selection.rootId === node.rootId && JSON.stringify(selection.path) === JSON.stringify(node.path);
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
                    <TreeNodeView key={node.id} node={node} depth={0} isSelected={isSelected} onSelect={(n) => onSelectionChange(selectionOf(n))} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {selectedNode && (
            <div className="flex-shrink-0 border-t border-app-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-app-muted">{t("dashboard.pages.linksBuilder.editSelected")}</p>
                {selectedNode.kind === "block" && (
                  <button
                    type="button"
                    onClick={() => { onDelete(selectionOf(selectedNode)); onSelectionChange(null); }}
                    aria-label={t("dashboard.pages.linksBuilder.deleteSelected")}
                    className="text-red-500 hover:text-red-600"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </div>

              {selectedNode.blockType === "text" && (
                <textarea
                  defaultValue={(selectedNode.blockData?.text as string) ?? ""}
                  onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { blockData: { text: e.target.value } })}
                  rows={4}
                  placeholder={t("dashboard.pages.linksBuilder.textPlaceholder")}
                  className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                />
              )}

              {selectedNode.blockType === "button" && (
                <div className="flex flex-col gap-2">
                  <input
                    defaultValue={selectedNode.title}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { title: e.target.value })}
                    placeholder={t("dashboard.pages.linksBuilder.buttonTitlePlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                  <input
                    defaultValue={selectedNode.url ?? ""}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { url: e.target.value })}
                    placeholder={t("dashboard.pages.linksBuilder.buttonUrlPlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                </div>
              )}

              {selectedNode.blockType === "video" && (
                <div className="flex flex-col gap-2">
                  <input
                    defaultValue={selectedNode.title}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { title: e.target.value })}
                    placeholder={t("dashboard.pages.linksBuilder.videoTitlePlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                  <input
                    defaultValue={(selectedNode.blockData?.video_url as string) ?? ""}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { blockData: { video_url: e.target.value } })}
                    placeholder={t("dashboard.pages.linksBuilder.videoUrlPlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                </div>
              )}

              {selectedNode.blockType === "faq" && (
                <FaqItemsEditor
                  node={selectedNode}
                  onUpdate={(items) => onUpdateNode(selectionOf(selectedNode), { blockData: { items } })}
                />
              )}

              {selectedNode.blockType === "image" && (
                <MediaImageEditor
                  key={selectedNode.id}
                  rootId={selectedNode.rootId}
                  path={selectedNode.path}
                  imageUrl={(selectedNode.blockData?.image_url as string) || undefined}
                  onChanged={onRefresh}
                />
              )}

              {(selectedNode.blockType === "gallery" || selectedNode.blockType === "image_slider") && (
                <GalleryGridEditor
                  key={selectedNode.id}
                  rootId={selectedNode.rootId}
                  path={selectedNode.path}
                  images={(selectedNode.blockData?.images as string[] | undefined) ?? []}
                  onChanged={onRefresh}
                />
              )}

              {selectedNode.blockType === "video_image" && (
                <div className="flex flex-col gap-3">
                  <input
                    defaultValue={(selectedNode.blockData?.video_url as string) ?? ""}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { blockData: { video_url: e.target.value } })}
                    placeholder={t("dashboard.pages.linksBuilder.videoUrlPlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                  <MediaImageEditor
                    key={selectedNode.id}
                    rootId={selectedNode.rootId}
                    path={selectedNode.path}
                    imageUrl={(selectedNode.blockData?.image_url as string) || undefined}
                    onChanged={onRefresh}
                  />
                </div>
              )}

              {selectedNode.blockType === "embed_link" && (
                <div className="flex flex-col gap-2">
                  <input
                    defaultValue={selectedNode.title}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { title: e.target.value })}
                    placeholder={t("dashboard.pages.linksBuilder.embedLinkTitlePlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                  <input
                    defaultValue={selectedNode.url ?? ""}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { url: e.target.value })}
                    placeholder={t("dashboard.pages.linksBuilder.embedLinkUrlPlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                  <textarea
                    defaultValue={selectedNode.description ?? ""}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { description: e.target.value })}
                    rows={2}
                    placeholder={t("dashboard.pages.linksBuilder.embedLinkDescriptionPlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                  <MediaImageEditor
                    key={selectedNode.id}
                    rootId={selectedNode.rootId}
                    path={selectedNode.path}
                    imageUrl={(selectedNode.blockData?.image_url as string) || undefined}
                    onChanged={onRefresh}
                  />
                </div>
              )}

              {selectedNode.blockType === "countdown" && (
                <div className="flex flex-col gap-2">
                  <input
                    defaultValue={selectedNode.title}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { title: e.target.value })}
                    placeholder={t("dashboard.pages.linksBuilder.countdownTitlePlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                  <input
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(selectedNode.blockData?.target_at as string | undefined)}
                    onBlur={(e) =>
                      onUpdateNode(selectionOf(selectedNode), {
                        blockData: { target_at: e.target.value ? new Date(e.target.value).toISOString() : "" },
                      })
                    }
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                </div>
              )}

              {selectedNode.blockType === "list" && (
                <ListItemsEditor
                  node={selectedNode}
                  onUpdateStyle={(style) => onUpdateNode(selectionOf(selectedNode), { blockData: { style } })}
                  onUpdateItems={(items) => onUpdateNode(selectionOf(selectedNode), { blockData: { items } })}
                />
              )}

              {selectedNode.blockType === "embed" && (
                <div className="flex flex-col gap-2">
                  <input
                    defaultValue={selectedNode.title}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { title: e.target.value })}
                    placeholder={t("dashboard.pages.linksBuilder.embedTitlePlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                  <input
                    defaultValue={(selectedNode.blockData?.embed_url as string) ?? ""}
                    onBlur={(e) => onUpdateNode(selectionOf(selectedNode), { blockData: { embed_url: e.target.value } })}
                    placeholder={t("dashboard.pages.linksBuilder.embedUrlPlaceholder")}
                    className="w-full rounded-lg border border-app-border p-2 text-xs outline-none focus:border-jeon-purple"
                  />
                  <p className="text-[11px] text-app-muted">{t("dashboard.pages.linksBuilder.embedHint")}</p>
                </div>
              )}

              {selectedNode.blockType === "maps" && (
                <MapsEditor
                  node={selectedNode}
                  onUpdate={(url, embed) => onUpdateNode(selectionOf(selectedNode), { url, blockData: { embed } })}
                />
              )}

              {selectedNode.blockType === "column" && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.columnCount")}</label>
                  <select
                    defaultValue={((selectedNode.blockData?.columns as unknown[] | undefined)?.length ?? 2).toString()}
                    onChange={(e) => {
                      const count = Number(e.target.value);
                      const existing = (selectedNode.blockData?.columns as { children?: EmbeddedBuilderBlock[] }[] | undefined) ?? [];
                      const columns = Array.from({ length: count }, (_, i) => existing[i] ?? { children: [] });
                      onUpdateNode(selectionOf(selectedNode), { blockData: { columns } });
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
              )}

              {(selectedNode.blockType === "section" || selectedNode.blockType === "divider" || selectedNode.kind === "column-slot") && (
                <p className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.containerHint")}</p>
              )}
            </div>
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
