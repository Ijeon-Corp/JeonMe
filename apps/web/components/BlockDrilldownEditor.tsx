"use client";

import { useEffect, useRef, useState } from "react";
import { CatalogItem, EmbeddedCatalogBlock, LinkItem } from "@/lib/api-client";
import { IconChevronRight, IconPlus, IconTrash } from "@/components/icons";
import FormField from "@/components/FormField";
import { CatalogBlockTypePicker } from "@/components/CatalogBlockTypePicker";
import { confirmDelete } from "@/lib/confirm";
import { useLocale } from "@/lib/locale-context";
import {
  CatalogRoot,
  CatalogSeg,
  buildEmbeddableTypes,
  emptyBlockData,
  getBlocks,
  getCatalogItems,
  maxCatalogDepth,
  maxCatalogImagesPerItem,
  maxCatalogItemBlocks,
  maxCatalogItems,
  resolveAt,
  setBlocks,
  setCatalogItems,
  updateAt,
} from "@/lib/catalog-blocks";

type FaqQA = { question: string; answer: string };

// EditorFrame -- satu tumpukan navigasi (gaya Linktree: klik blok -> masuk
// ke dalamnya -> baru bisa edit isinya, lihat komentar panjang di
// lib/catalog-blocks.ts soal kenapa path-based bukan snapshot-based).
// faqList/faqItem dengan path=[] berarti blok "faq" TINGKAT ATAS (mode
// "faq" di bawah); path.length>0 berarti FAQ TERTANAM di dalam katalog
// (mode "catalog", dicapai lewat embeddedBlock bertipe "faq").
type EditorFrame =
  | { view: "catalogItems"; path: CatalogSeg[] }
  | { view: "catalogItem"; path: CatalogSeg[] }
  | { view: "embeddedBlock"; path: CatalogSeg[] }
  | { view: "faqList"; path: CatalogSeg[] }
  | { view: "faqItem"; path: CatalogSeg[]; index: number };

function pathKey(frame: EditorFrame): string {
  const base = frame.path.map((s) => `${s.kind}:${s.id}`).join(">");
  return frame.view === "faqItem" ? `faqItem|${base}|${frame.index}` : `${frame.view}|${base}`;
}

function blockSegCount(path: CatalogSeg[]): number {
  return path.filter((s) => s.kind === "block").length;
}

// BlockDrilldownEditor -- SATU komponen untuk blok "catalog" DAN "faq"
// (permintaan langsung pengguna, 6 September 2026, lihat plan
// robust-tinkering-shannon.md). Format payload API TIDAK berubah -- murni
// redesain presentasi+navigasi menggantikan CatalogBlocksEditor/panel
// "Kelola Katalog" yang merender semua level sekaligus.
//
// Model simpan SENGAJA beda antara Katalog dan FAQ tingkat atas (dipaksa
// backend, lihat validateBlockDataAtDepth di links.go): Katalog (termasuk
// FAQ TERTANAM di dalamnya, depth>1) tetap autosave onBlur lewat
// onCommitCatalogRoot; FAQ TINGKAT ATAS (depth==1, backend mewajibkan
// question+answer lengkap) WAJIB tombol Simpan eksplisit lewat
// onSaveFaqItems -- autosave di sana akan 400 di blur field pertama
// pertanyaan baru.
export default function BlockDrilldownEditor({
  link,
  isPremium,
  uploadingKey,
  onCommitCatalogRoot,
  onSaveFaqItems,
  onUploadImage,
  onDeleteImage,
  onExit,
}: {
  link: LinkItem;
  isPremium: boolean;
  uploadingKey: string | null;
  onCommitCatalogRoot: (items: CatalogItem[]) => void;
  onSaveFaqItems: (items: FaqQA[]) => Promise<boolean>;
  onUploadImage: (itemId: string, file: File) => void;
  onDeleteImage: (itemId: string, index: number) => void;
  onExit: () => void;
}) {
  const { t } = useLocale();
  const mode: "catalog" | "faq" = link.block_type === "faq" ? "faq" : "catalog";
  const root: CatalogRoot = { items: (link.block_data?.items as CatalogItem[] | undefined) ?? [] };
  const topFaqItems = ((link.block_data?.items as FaqQA[] | undefined) ?? []).filter(
    (it) => it && typeof it.question === "string"
  );

  const [stack, setStack] = useState<EditorFrame[]>(() => [
    mode === "faq" ? { view: "faqList", path: [] } : { view: "catalogItems", path: [] },
  ]);
  const frame = stack[stack.length - 1];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function push(next: EditorFrame) {
    setStack((s) => [...s, next]);
  }
  function goBack() {
    if (stack.length > 1) {
      setStack((s) => s.slice(0, -1));
    } else {
      onExit();
    }
  }

  // Fokus & scroll ke atas tiap kali kedalaman tumpukan berubah (push/pop),
  // BUKAN tiap render (autosave onBlur di frame yang sama tidak boleh
  // memindah fokus/scroll).
  useEffect(() => {
    headingRef.current?.focus();
    containerRef.current?.scrollTo({ top: 0 });
  }, [stack.length]);

  // Escape -> kembali satu tingkat, KECUALI sedang fokus di text field
  // (biar Escape tetap bisa dipakai untuk blur biasa).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      if (stack.length > 1) setStack((s) => s.slice(0, -1));
      else onExit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stack.length, onExit]);

  // Self-heal -- kalau path frame mana pun di tumpukan sudah tidak resolve
  // lagi (item/blok terhapus dari tempat lain, atau rollback saveCatalogItems
  // gagal), pangkas ke prefix terdalam yang masih valid alih-alih crash.
  // Pola resmi React "adjust state during render" (CLAUDE.md) -- BUKAN di
  // useEffect (react-hooks/set-state-in-effect) -- bandingkan prop `link`
  // (identitas objek baru tiap kali saveCatalogItems/refreshLinks mengganti
  // `links` di parent) ke `prevLink` yang dilacak state, setState kondisional
  // LANGSUNG di badan komponen kalau berubah.
  const [prevLink, setPrevLink] = useState(link);
  if (link !== prevLink) {
    setPrevLink(link);
    if (mode === "catalog") {
      for (let i = stack.length - 1; i >= 0; i--) {
        const f = stack[i];
        if (f.path.length === 0) continue;
        if (!resolveAt(root, f.path)) {
          setStack(stack.slice(0, Math.max(i, 1)));
          break;
        }
      }
    }
  }

  function commitRoot(newRoot: CatalogRoot) {
    onCommitCatalogRoot(newRoot.items ?? []);
  }

  function updateItemField(path: CatalogSeg[], field: "title" | "description", value: string) {
    commitRoot(updateAt(root, path, (node) => ({ ...(node as CatalogItem), [field]: value })));
  }

  function updateEmbeddedBlock(path: CatalogSeg[], patch: Partial<EmbeddedCatalogBlock>) {
    commitRoot(updateAt(root, path, (node) => ({ ...(node as EmbeddedCatalogBlock), ...patch })));
  }

  function addCatalogItem(listPath: CatalogSeg[], title: string): string {
    const id = crypto.randomUUID();
    const newItem: CatalogItem = { id, title, description: "", images: [] };
    commitRoot(setCatalogItems(root, listPath, [...getCatalogItems(root, listPath), newItem]));
    return id;
  }

  async function removeCatalogItem(listPath: CatalogSeg[], itemId: string): Promise<boolean> {
    const ok = await confirmDelete(t("dashboard.components.catalogBlocksEditor.confirmDeleteItemText"), {
      title: t("dashboard.components.catalogBlocksEditor.confirmDeleteItemTitle"),
    });
    if (!ok) return false;
    commitRoot(setCatalogItems(root, listPath, getCatalogItems(root, listPath).filter((it) => it.id !== itemId)));
    return true;
  }

  function addEmbeddedBlock(itemPath: CatalogSeg[], type: EmbeddedCatalogBlock["block_type"]) {
    const embeddableTypes = buildEmbeddableTypes(t);
    const next: EmbeddedCatalogBlock = {
      id: crypto.randomUUID(),
      block_type: type,
      title: embeddableTypes.find((opt) => opt.type === type)?.label ?? type,
      url: type === "maps" ? "" : undefined,
      block_data: emptyBlockData(type),
    };
    commitRoot(setBlocks(root, itemPath, [...getBlocks(root, itemPath), next]));
    return next;
  }

  async function removeEmbeddedBlock(itemPath: CatalogSeg[], blockId: string) {
    const ok = await confirmDelete(t("dashboard.components.catalogBlocksEditor.confirmDeleteBlockText"), {
      title: t("dashboard.components.catalogBlocksEditor.confirmDeleteBlockTitle"),
    });
    if (!ok) return;
    commitRoot(setBlocks(root, itemPath, getBlocks(root, itemPath).filter((b) => b.id !== blockId)));
  }

  function openEmbeddedBlock(blockPath: CatalogSeg[], block: EmbeddedCatalogBlock) {
    if (block.block_type === "catalog") push({ view: "catalogItems", path: blockPath });
    else if (block.block_type === "faq") push({ view: "faqList", path: blockPath });
    else push({ view: "embeddedBlock", path: blockPath });
  }

  const frameTitle = (() => {
    if (frame.path.length === 0) return link.title;
    const resolved = resolveAt(root, frame.path);
    if (frame.view === "catalogItem" || frame.view === "faqItem") {
      return resolved?.item?.title || resolved?.block?.title || t("dashboard.components.blockDrilldown.untitledItem");
    }
    return resolved?.block?.title || resolved?.item?.title || "";
  })();

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          className="flex flex-shrink-0 items-center gap-1 rounded-full border-2 border-[#111111] bg-jeon-lavender px-3 py-1.5 text-xs font-bold text-[#111111] transition-transform hover:-translate-x-0.5"
        >
          <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
          {t("dashboard.components.blockDrilldown.back")}
        </button>
        <h2 ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 truncate font-display text-lg font-bold text-app-ink outline-none">
          {frameTitle}
        </h2>
      </div>

      <div key={pathKey(frame)} className="rounded-jmd border border-app-border bg-app-surface p-4 shadow-card">
        {frame.view === "catalogItems" && (
          <CatalogItemsFrame
            items={getCatalogItems(root, frame.path)}
            onOpenItem={(id) => push({ view: "catalogItem", path: [...frame.path, { kind: "item", id }] })}
            onAddItem={(title) => {
              const id = addCatalogItem(frame.path, title);
              push({ view: "catalogItem", path: [...frame.path, { kind: "item", id }] });
            }}
          />
        )}

        {frame.view === "catalogItem" &&
          (() => {
            const item = resolveAt(root, frame.path)?.item;
            if (!item) return <NotFoundNotice />;
            const canUploadImages = frame.path.length === 1;
            const depth = 2 + blockSegCount(frame.path);
            return (
              <CatalogItemFrame
                item={item}
                canUploadImages={canUploadImages}
                uploadingKey={uploadingKey}
                onUploadImage={(file) => onUploadImage(item.id, file)}
                onDeleteImage={(index) => onDeleteImage(item.id, index)}
                onUpdateField={(field, value) => updateItemField(frame.path, field, value)}
                onDeleteItem={async () => {
                  const ok = await removeCatalogItem(frame.path.slice(0, -1), item.id);
                  if (ok) goBack();
                }}
                isPremium={isPremium}
                depth={depth}
                onOpenBlock={(block) => openEmbeddedBlock([...frame.path, { kind: "block", id: block.id }], block)}
                onAddBlock={(type) => {
                  const block = addEmbeddedBlock(frame.path, type);
                  openEmbeddedBlock([...frame.path, { kind: "block", id: block.id }], block);
                }}
                onDeleteBlock={(blockId) => removeEmbeddedBlock(frame.path, blockId)}
              />
            );
          })()}

        {frame.view === "embeddedBlock" &&
          (() => {
            const block = resolveAt(root, frame.path)?.block;
            if (!block) return <NotFoundNotice />;
            return (
              <EmbeddedBlockFrame
                block={block}
                onUpdate={(patch) => updateEmbeddedBlock(frame.path, patch)}
                onDeleteBlock={() => {
                  removeEmbeddedBlock(frame.path.slice(0, -1), block.id);
                  goBack();
                }}
              />
            );
          })()}

        {frame.view === "faqList" &&
          (() => {
            const items = frame.path.length === 0 ? topFaqItems : ((resolveAt(root, frame.path)?.block?.block_data?.items as FaqQA[] | undefined) ?? []);
            return (
              <FaqListFrame
                items={items}
                onOpenQuestion={(index) => push({ view: "faqItem", path: frame.path, index })}
                onAddQuestion={() => push({ view: "faqItem", path: frame.path, index: items.length })}
              />
            );
          })()}

        {frame.view === "faqItem" &&
          (() => {
            const topLevel = frame.path.length === 0;
            const items = topLevel ? topFaqItems : ((resolveAt(root, frame.path)?.block?.block_data?.items as FaqQA[] | undefined) ?? []);
            const isDraft = frame.index >= items.length;
            const qa: FaqQA = isDraft ? { question: "", answer: "" } : items[frame.index];
            if (topLevel) {
              return (
                <TopLevelFaqItemFrame
                  key={frame.index}
                  qa={qa}
                  isDraft={isDraft}
                  canDelete={items.length > 1}
                  onCancel={goBack}
                  onSave={async (next) => {
                    const updated = isDraft ? [...items, next] : items.map((it, i) => (i === frame.index ? next : it));
                    const ok = await onSaveFaqItems(updated);
                    if (ok) goBack();
                    return ok;
                  }}
                  onDelete={
                    isDraft
                      ? undefined
                      : async () => {
                          const ok = await confirmDelete(t("dashboard.components.blockDrilldown.confirmDeleteQuestionText"), {
                            title: t("dashboard.components.blockDrilldown.confirmDeleteQuestionTitle"),
                          });
                          if (!ok) return;
                          const updated = items.filter((_, i) => i !== frame.index);
                          const ok2 = await onSaveFaqItems(updated);
                          if (ok2) goBack();
                        }
                  }
                />
              );
            }
            return (
              <EmbeddedFaqItemFrame
                qa={qa}
                onUpdate={(next) => {
                  const updated = isDraft ? [...items, next] : items.map((it, i) => (i === frame.index ? next : it));
                  updateEmbeddedBlock(frame.path, { block_data: { items: updated } });
                }}
                onDelete={
                  isDraft
                    ? undefined
                    : async () => {
                        const ok = await confirmDelete(t("dashboard.components.blockDrilldown.confirmDeleteQuestionText"), {
                          title: t("dashboard.components.blockDrilldown.confirmDeleteQuestionTitle"),
                        });
                        if (!ok) return;
                        updateEmbeddedBlock(frame.path, { block_data: { items: items.filter((_, i) => i !== frame.index) } });
                        goBack();
                      }
                }
              />
            );
          })()}
      </div>
    </div>
  );
}

function NotFoundNotice() {
  const { t } = useLocale();
  return <p className="text-sm text-app-muted">{t("dashboard.components.blockDrilldown.notFound")}</p>;
}

function CatalogItemsFrame({
  items,
  onOpenItem,
  onAddItem,
}: {
  items: CatalogItem[];
  onOpenItem: (id: string) => void;
  onAddItem: (title: string) => void;
}) {
  const { t } = useLocale();
  const [draftTitle, setDraftTitle] = useState("");
  const atLimit = items.length >= maxCatalogItems;

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <p className="text-sm text-app-muted">{t("dashboard.components.blockDrilldown.emptyItems")}</p>}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpenItem(item.id)}
          className="flex items-center gap-3 rounded-xl border border-app-border bg-app-surface-2 p-3 text-left hover:border-jeon-purple"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-app-ink">
              {item.title || t("dashboard.components.blockDrilldown.untitledItem")}
            </p>
            <p className="truncate text-[11px] text-app-muted">
              {item.images.length > 0 && `${item.images.length} ${t("dashboard.pages.links.galleryPanel.photoCountSuffix")}`}
              {item.images.length > 0 && (item.blocks?.length ?? 0) > 0 && " · "}
              {(item.blocks?.length ?? 0) > 0 &&
                t("dashboard.components.blockDrilldown.blocksCount").replace("{n}", String(item.blocks?.length ?? 0))}
            </p>
          </div>
          <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted" />
        </button>
      ))}

      {atLimit ? (
        <p className="text-[11px] text-app-muted">{t("dashboard.components.blockDrilldown.maxItemsReached")}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draftTitle.trim()) return;
            onAddItem(draftTitle.trim());
            setDraftTitle("");
          }}
          className="flex flex-col gap-1.5 rounded-lg border border-dashed border-app-border p-2.5"
        >
          <FormField label={t("dashboard.pages.links.catalogPanel.newItemTitleLabel")}>
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder={t("dashboard.pages.links.catalogPanel.newItemTitlePlaceholder")}
              className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-sm focus:border-jeon-purple focus:outline-none"
            />
          </FormField>
          <button
            type="submit"
            disabled={!draftTitle.trim()}
            className="btn-primary self-start rounded-md px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
          >
            {t("dashboard.pages.links.catalogPanel.addItem")}
          </button>
        </form>
      )}
    </div>
  );
}

function CatalogItemFrame({
  item,
  canUploadImages,
  uploadingKey,
  onUploadImage,
  onDeleteImage,
  onUpdateField,
  onDeleteItem,
  isPremium,
  depth,
  onOpenBlock,
  onAddBlock,
  onDeleteBlock,
}: {
  item: CatalogItem;
  canUploadImages: boolean;
  uploadingKey: string | null;
  onUploadImage: (file: File) => void;
  onDeleteImage: (index: number) => void;
  onUpdateField: (field: "title" | "description", value: string) => void;
  onDeleteItem: () => void;
  isPremium: boolean;
  depth: number;
  onOpenBlock: (block: EmbeddedCatalogBlock) => void;
  onAddBlock: (type: EmbeddedCatalogBlock["block_type"]) => void;
  onDeleteBlock: (blockId: string) => void;
}) {
  const { t } = useLocale();
  const blocks = item.blocks ?? [];
  const atLimit = blocks.length >= maxCatalogItemBlocks || depth >= maxCatalogDepth;
  const isUploading = uploadingKey !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <FormField label={t("dashboard.pages.links.catalogPanel.itemTitleLabel")}>
            <input
              type="text"
              defaultValue={item.title}
              placeholder={t("dashboard.pages.links.catalogPanel.itemTitlePlaceholder")}
              onBlur={(e) => e.target.value.trim() && onUpdateField("title", e.target.value.trim())}
              className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-sm font-semibold focus:border-jeon-purple focus:outline-none"
            />
          </FormField>
          <FormField label={t("dashboard.pages.links.catalogPanel.itemDescriptionLabel")}>
            <textarea
              defaultValue={item.description}
              placeholder={t("dashboard.pages.links.catalogPanel.itemDescriptionPlaceholder")}
              rows={2}
              onBlur={(e) => onUpdateField("description", e.target.value.trim())}
              className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-sm focus:border-jeon-purple focus:outline-none"
            />
          </FormField>
        </div>
        <button
          type="button"
          onClick={onDeleteItem}
          title={t("dashboard.pages.links.catalogPanel.deleteItem")}
          className="flex-shrink-0 rounded-md p-1.5 text-red-600 hover:bg-red-50"
        >
          <IconTrash className="h-4 w-4" />
        </button>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-app-muted">
          {t("dashboard.components.blockDrilldown.photosHeading")}
        </p>
        {canUploadImages ? (
          <div className="flex flex-wrap gap-2">
            {item.images.map((src, i) => (
              <div key={i} className="group relative h-16 w-16 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full rounded-md object-cover ring-1 ring-black/5" />
                <button
                  type="button"
                  onClick={() => onDeleteImage(i)}
                  title={t("dashboard.pages.links.galleryPanel.deletePhoto")}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
                >
                  <IconTrash className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
            {item.images.length < maxCatalogImagesPerItem && (
              <label
                className={`flex h-16 w-16 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-app-border text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
                  isUploading ? "opacity-60" : ""
                }`}
              >
                {isUploading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                ) : (
                  <IconPlus className="h-4 w-4" />
                )}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) onUploadImage(file);
                  }}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-app-muted">{t("dashboard.components.blockDrilldown.photosNestedUnsupported")}</p>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-app-muted">
          {t("dashboard.components.blockDrilldown.blocksHeading")}
        </p>
        <div className="flex flex-col gap-1.5">
          {blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              onClick={() => onOpenBlock(block)}
              className="flex items-center gap-3 rounded-lg border border-app-border bg-app-surface-2 p-2.5 text-left hover:border-jeon-purple"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-app-ink">{block.title}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteBlock(block.id);
                }}
                title={t("dashboard.components.catalogBlocksEditor.removeBlockAriaLabel")}
                className="flex-shrink-0 text-app-muted hover:text-red-600"
              >
                <IconTrash className="h-3.5 w-3.5" />
              </button>
              <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted" />
            </button>
          ))}
        </div>
        {atLimit ? (
          <p className="mt-1.5 text-[10.5px] text-app-muted">
            {depth >= maxCatalogDepth
              ? t("dashboard.components.catalogBlocksEditor.maxDepthReached")
              : t("dashboard.components.catalogBlocksEditor.maxBlocksReached").replace("{max}", String(maxCatalogItemBlocks))}
          </p>
        ) : (
          <div className="mt-1.5">
            <CatalogBlockTypePicker isPremium={isPremium} disabled={atLimit} onPick={onAddBlock} />
          </div>
        )}
      </div>
    </div>
  );
}

function EmbeddedBlockFrame({
  block,
  onUpdate,
  onDeleteBlock,
}: {
  block: EmbeddedCatalogBlock;
  onUpdate: (patch: Partial<EmbeddedCatalogBlock>) => void;
  onDeleteBlock: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          defaultValue={block.title}
          onBlur={(e) => e.target.value.trim() && onUpdate({ title: e.target.value.trim() })}
          placeholder={t("dashboard.components.catalogBlocksEditor.blockTitlePlaceholder")}
          aria-label={t("dashboard.components.catalogBlocksEditor.blockTitleAriaLabel")}
          className="min-w-0 flex-1 rounded-md border border-app-border px-2.5 py-1.5 text-sm font-semibold focus:border-jeon-purple focus:outline-none"
        />
        <button type="button" onClick={onDeleteBlock} className="flex-shrink-0 rounded-md p-1.5 text-red-600 hover:bg-red-50">
          <IconTrash className="h-4 w-4" />
        </button>
      </div>

      {block.block_type === "text" && (
        <textarea
          defaultValue={(block.block_data.text as string) ?? ""}
          onBlur={(e) => onUpdate({ block_data: { ...block.block_data, text: e.target.value } })}
          placeholder={t("dashboard.components.catalogBlocksEditor.textContentPlaceholder")}
          aria-label={t("dashboard.components.catalogBlocksEditor.textContentAriaLabel")}
          rows={4}
          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-sm focus:border-jeon-purple focus:outline-none"
        />
      )}

      {block.block_type === "video" && (
        <input
          defaultValue={(block.block_data.video_url as string) ?? ""}
          onBlur={(e) => onUpdate({ block_data: { ...block.block_data, video_url: e.target.value } })}
          placeholder={t("dashboard.components.catalogBlocksEditor.videoUrlPlaceholder")}
          aria-label={t("dashboard.components.catalogBlocksEditor.videoUrlAriaLabel")}
          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-sm focus:border-jeon-purple focus:outline-none"
        />
      )}

      {block.block_type === "maps" && (
        <div className="flex flex-col gap-1">
          <input
            defaultValue={block.url ?? ""}
            onBlur={(e) => onUpdate({ url: e.target.value })}
            placeholder={t("dashboard.components.catalogBlocksEditor.mapsUrlLabel")}
            aria-label={t("dashboard.components.catalogBlocksEditor.mapsUrlLabel")}
            className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-sm focus:border-jeon-purple focus:outline-none"
          />
          <p className="text-[10.5px] text-app-muted">{t("dashboard.components.catalogBlocksEditor.mapsHint")}</p>
        </div>
      )}
    </div>
  );
}

function FaqListFrame({
  items,
  onOpenQuestion,
  onAddQuestion,
}: {
  items: FaqQA[];
  onOpenQuestion: (index: number) => void;
  onAddQuestion: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <p className="text-sm text-app-muted">{t("dashboard.components.blockDrilldown.emptyQuestions")}</p>}
      {items.map((qa, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onOpenQuestion(i)}
          className="flex items-center gap-3 rounded-xl border border-app-border bg-app-surface-2 p-3 text-left hover:border-jeon-purple"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-app-ink">
            {qa.question || t("dashboard.components.blockDrilldown.untitledQuestion")}
          </span>
          <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted" />
        </button>
      ))}
      <button
        type="button"
        onClick={onAddQuestion}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2.5 text-sm font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
      >
        <IconPlus className="h-3.5 w-3.5" /> {t("dashboard.components.blockDrilldown.newQuestion")}
      </button>
    </div>
  );
}

// TopLevelFaqItemFrame -- blok FAQ TINGKAT ATAS (depth==1), backend
// mewajibkan question+answer lengkap sebelum bisa disimpan (lihat
// validateBlockDataAtDepth). Kontrol (bukan onBlur) + tombol Simpan
// eksplisit -- autosave per keystroke di sini akan 400 di blur pertama
// (jawaban masih kosong saat pertanyaan baru diisi).
function TopLevelFaqItemFrame({
  qa,
  isDraft,
  canDelete,
  onSave,
  onCancel,
  onDelete,
}: {
  qa: FaqQA;
  isDraft: boolean;
  canDelete: boolean;
  onSave: (qa: FaqQA) => Promise<boolean>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { t } = useLocale();
  const [question, setQuestion] = useState(qa.question);
  const [answer, setAnswer] = useState(qa.answer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!question.trim() || !answer.trim()) {
      setError(t("dashboard.components.blockDrilldown.faqIncomplete"));
      return;
    }
    setError(null);
    setSaving(true);
    const ok = await onSave({ question: question.trim(), answer: answer.trim() });
    setSaving(false);
    if (!ok) setError(t("dashboard.pages.links.errors.saveBlockContentFailed"));
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField label={t("dashboard.components.catalogBlocksEditor.questionPlaceholder")}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("dashboard.components.catalogBlocksEditor.questionPlaceholder")}
          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-sm focus:border-jeon-purple focus:outline-none"
        />
      </FormField>
      <FormField label={t("dashboard.components.catalogBlocksEditor.answerPlaceholder")}>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={t("dashboard.components.catalogBlocksEditor.answerPlaceholder")}
          rows={4}
          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-sm focus:border-jeon-purple focus:outline-none"
        />
      </FormField>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border-2 border-jeon-ink py-2 text-xs font-bold text-app-muted"
        >
          {t("dashboard.pages.links.common.cancel")}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="btn-primary flex-1 rounded-md py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {saving ? t("dashboard.pages.links.common.saving") : t("dashboard.pages.links.common.save")}
        </button>
      </div>
      {!isDraft && onDelete && (
        <button
          type="button"
          onClick={canDelete ? onDelete : undefined}
          title={canDelete ? undefined : t("dashboard.components.blockDrilldown.faqMinOne")}
          disabled={!canDelete}
          className="self-start text-xs font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-app-muted disabled:no-underline"
        >
          {t("dashboard.components.catalogBlocksEditor.removeQuestionAriaLabel")}
        </button>
      )}
    </div>
  );
}

// EmbeddedFaqItemFrame -- FAQ tertanam di dalam katalog (depth>1), backend
// MELONGGARKAN validasi lengkap-nya (lihat komentar di links.go) supaya
// kompatibel dengan pola onBlur-per-field yang sama seperti field katalog
// lain -- SENGAJA autosave, BUKAN tombol Simpan.
function EmbeddedFaqItemFrame({
  qa,
  onUpdate,
  onDelete,
}: {
  qa: FaqQA;
  onUpdate: (qa: FaqQA) => void;
  onDelete?: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-app-muted">{t("dashboard.components.blockDrilldown.autosaveHint")}</p>
      <FormField label={t("dashboard.components.catalogBlocksEditor.questionPlaceholder")}>
        <input
          type="text"
          defaultValue={qa.question}
          onBlur={(e) => onUpdate({ question: e.target.value, answer: qa.answer })}
          placeholder={t("dashboard.components.catalogBlocksEditor.questionPlaceholder")}
          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-sm focus:border-jeon-purple focus:outline-none"
        />
      </FormField>
      <FormField label={t("dashboard.components.catalogBlocksEditor.answerPlaceholder")}>
        <textarea
          defaultValue={qa.answer}
          onBlur={(e) => onUpdate({ question: qa.question, answer: e.target.value })}
          placeholder={t("dashboard.components.catalogBlocksEditor.answerPlaceholder")}
          rows={4}
          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-sm focus:border-jeon-purple focus:outline-none"
        />
      </FormField>
      {onDelete && (
        <button type="button" onClick={onDelete} className="self-start text-xs font-semibold text-red-600 hover:underline">
          {t("dashboard.components.catalogBlocksEditor.removeQuestionAriaLabel")}
        </button>
      )}
    </div>
  );
}
