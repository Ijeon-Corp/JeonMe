"use client";

import { useRouter } from "next/navigation";
import { CatalogItem, EmbeddedCatalogBlock } from "@/lib/api-client";
import { IconBook, IconGrid, IconLock, IconMapPin, IconPlayCircle, IconPlus, IconTextLines, IconTrash } from "@/components/icons";
import { confirmDelete } from "@/lib/confirm";
import { useLocale } from "@/lib/locale-context";

// CatalogBlocksEditor/CatalogNodeEditor -- permintaan langsung pengguna, 27
// Agustus 2026: "saya mau di blok katalog bisa menambahkan semua blok yang
// sudah ada di web ini di dalam katalog, dan juga sub blok ini bisa lebih
// dari 2, 3 untuk user premium". Dua komponen ini SALING REKURSIF (bukan
// satu komponen tunggal) mengikuti bentuk data (lihat EmbeddedCatalogBlock,
// api-client.ts): satu item katalog punya `blocks[]` (dikelola
// CatalogBlocksEditor), salah satu blok tertanam boleh bertipe "catalog"
// yang punya `items[]` SENDIRI (dikelola CatalogNodeEditor lagi, depth+1).
//
// SENGAJA TIDAK menyentuh panel "Kelola Katalog" yang SUDAH ADA di
// dashboard/links/page.tsx (add/edit/delete item tingkat ATAS + upload
// foto) -- CatalogBlocksEditor cuma DITAMBAHKAN sebagai seksi baru di
// bawah UI item yang sudah ada di sana, supaya alur yang sudah teruji
// (14 test e2e sebelumnya) sama sekali tidak berisiko regresi.
//
// Cakupan v1 (dikonfirmasi via AskUserQuestion): 5 tipe blok tertanam yang
// TIDAK butuh upload file -- Teks/FAQ/Video/Maps/Katalog. Item BERSARANG
// (di dalam blok "Katalog" tertanam) SENGAJA TIDAK punya UI unggah foto --
// endpoint upload foto per-item (uploadCatalogItemImage) cuma bisa
// menunjuk item tingkat ATAS (findCatalogItem di backend belum rekursif,
// menyusul kalau iterasi upload-tertanam beneran dikerjakan) -- item
// bersarang cuma punya judul+deskripsi+blok tertanam lagi.
//
// Semua field teks di file ini pakai defaultValue+onBlur (BUKAN
// value+onChange) -- konsisten dengan panel "Kelola Katalog" tingkat atas
// yang sudah ada. Ini bukan cuma gaya: onChange per keystroke berarti tiap
// huruf yang diketik memicu PATCH block_data.items UTUH ke backend --
// boros, dan kalau 2 field diketik nyaris bersamaan bisa saling balapan.
// onBlur cuma terpicu sekali per field, setelah kreator selesai mengetik.
type EmbeddableTypeOption = {
  type: EmbeddedCatalogBlock["block_type"];
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  premiumOnly?: boolean;
};

// buildEmbeddableTypes -- fungsi (bukan konstanta modul lagi), mengikuti
// pola buildNavItems() di dashboard/layout.tsx: dipanggil ulang tiap
// render di dalam komponen yang sudah punya akses ke t(), supaya label
// tipe blok ikut berganti bahasa.
function buildEmbeddableTypes(t: (key: string) => string): EmbeddableTypeOption[] {
  return [
    { type: "text", label: t("dashboard.components.catalogBlocksEditor.typeText"), Icon: IconTextLines },
    { type: "faq", label: t("dashboard.components.catalogBlocksEditor.typeFaq"), Icon: IconBook },
    { type: "video", label: t("dashboard.components.catalogBlocksEditor.typeVideo"), Icon: IconPlayCircle },
    { type: "maps", label: t("dashboard.components.catalogBlocksEditor.typeMaps"), Icon: IconMapPin },
    { type: "catalog", label: t("dashboard.components.catalogBlocksEditor.typeCatalog"), Icon: IconGrid, premiumOnly: true },
  ];
}

// maxCatalogDepth/maxCatalogItemBlocks -- SATU sumber kebenaran ANGKA di
// backend (links.go), nilai di sini HANYA untuk teks/progres UI & mencegah
// klik sia-sia, backend tetap menegakkan ulang (pola sama seperti limit
// halaman Produk/Landing, dashboard/pages/page.tsx).
const maxCatalogDepth = 5;
const maxCatalogItemBlocks = 10;

type FaqQA = { question: string; answer: string };

function emptyBlockData(type: EmbeddedCatalogBlock["block_type"]): Record<string, unknown> {
  switch (type) {
    case "faq":
      return { items: [{ question: "", answer: "" }] };
    case "catalog":
      return { items: [] };
    default:
      return {};
  }
}

function CatalogBlockTypePicker({
  isPremium,
  disabled,
  onPick,
}: {
  isPremium: boolean;
  disabled: boolean;
  onPick: (type: EmbeddedCatalogBlock["block_type"]) => void;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const embeddableTypes = buildEmbeddableTypes(t);
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
      {embeddableTypes.map((opt) => {
        const locked = !!opt.premiumOnly && !isPremium;
        return (
          <button
            key={opt.type}
            type="button"
            disabled={disabled && !locked}
            onClick={() => (locked ? router.push("/dashboard/settings/subscription") : onPick(opt.type))}
            title={
              locked
                ? t("dashboard.components.catalogBlocksEditor.premiumOnlyTitle")
                : disabled
                  ? t("dashboard.components.catalogBlocksEditor.atLimitTitle")
                  : undefined
            }
            className={`flex flex-col items-center gap-1 rounded-xl border-2 border-jeon-ink px-2 py-2.5 text-center text-[10.5px] font-semibold text-app-ink transition-colors hover:border-jeon-purple hover:text-jeon-purple disabled:cursor-not-allowed disabled:opacity-40 ${
              locked ? "relative" : ""
            }`}
          >
            {locked ? <IconLock className="h-4 w-4 text-app-muted" /> : <opt.Icon className="h-4 w-4" />}
            <span>
              {opt.label}
              {locked && (
                <span className="block text-[9px] text-app-muted">
                  {t("dashboard.components.catalogBlocksEditor.premiumBadge")}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// CatalogBlocksEditor -- mengelola `blocks[]` SATU item katalog (tingkat
// atas MAUPUN bersarang, lihat depth). onChange menimpa SELURUH array
// blocks item ini -- pemanggil (dashboard/links/page.tsx untuk tingkat
// atas, atau CatalogNodeEditor untuk tingkat bersarang) yang tahu cara
// menyimpannya (PATCH block_data.items keseluruhan, pola yang sama persis
// dengan saveCatalogItems yang sudah ada).
export function CatalogBlocksEditor({
  blocks,
  isPremium,
  depth,
  onChange,
}: {
  blocks: EmbeddedCatalogBlock[];
  isPremium: boolean;
  depth: number;
  onChange: (blocks: EmbeddedCatalogBlock[]) => void;
}) {
  const { t } = useLocale();
  const embeddableTypes = buildEmbeddableTypes(t);

  function addBlock(type: EmbeddedCatalogBlock["block_type"]) {
    const next: EmbeddedCatalogBlock = {
      id: crypto.randomUUID(),
      block_type: type,
      title: embeddableTypes.find((opt) => opt.type === type)?.label ?? type,
      url: type === "maps" ? "" : undefined,
      block_data: emptyBlockData(type),
    };
    onChange([...blocks, next]);
  }

  function updateBlock(id: string, patch: Partial<EmbeddedCatalogBlock>) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function removeBlock(id: string) {
    const ok = await confirmDelete(t("dashboard.components.catalogBlocksEditor.confirmDeleteBlockText"), {
      title: t("dashboard.components.catalogBlocksEditor.confirmDeleteBlockTitle"),
    });
    if (!ok) return;
    onChange(blocks.filter((b) => b.id !== id));
  }

  const atLimit = blocks.length >= maxCatalogItemBlocks || depth >= maxCatalogDepth;

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-dashed border-app-border p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-app-muted">
        {t("dashboard.components.catalogBlocksEditor.additionalBlocksTitle")}
      </p>

      {blocks.map((block) => (
        <div key={block.id} className="rounded-lg border-2 border-jeon-ink bg-app-surface p-2.5">
          <div className="flex items-center gap-2">
            <input
              defaultValue={block.title}
              onBlur={(e) => updateBlock(block.id, { title: e.target.value })}
              placeholder={t("dashboard.components.catalogBlocksEditor.blockTitlePlaceholder")}
              aria-label={t("dashboard.components.catalogBlocksEditor.blockTitleAriaLabel")}
              className="min-w-0 flex-1 rounded-md border border-app-border px-2 py-1 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeBlock(block.id)}
              aria-label={t("dashboard.components.catalogBlocksEditor.removeBlockAriaLabel")}
              className="flex-shrink-0 text-app-muted hover:text-red-600"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>

          {block.block_type === "text" && (
            <textarea
              defaultValue={(block.block_data.text as string) ?? ""}
              onBlur={(e) => updateBlock(block.id, { block_data: { ...block.block_data, text: e.target.value } })}
              placeholder={t("dashboard.components.catalogBlocksEditor.textContentPlaceholder")}
              aria-label={t("dashboard.components.catalogBlocksEditor.textContentAriaLabel")}
              rows={2}
              className="mt-2 w-full rounded-md border border-app-border px-2 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
            />
          )}

          {block.block_type === "video" && (
            <input
              defaultValue={(block.block_data.video_url as string) ?? ""}
              onBlur={(e) => updateBlock(block.id, { block_data: { ...block.block_data, video_url: e.target.value } })}
              placeholder={t("dashboard.components.catalogBlocksEditor.videoUrlPlaceholder")}
              aria-label={t("dashboard.components.catalogBlocksEditor.videoUrlAriaLabel")}
              className="mt-2 w-full rounded-md border border-app-border px-2 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
            />
          )}

          {block.block_type === "maps" && (
            <div className="mt-2 flex flex-col gap-1">
              <input
                defaultValue={block.url ?? ""}
                onBlur={(e) => updateBlock(block.id, { url: e.target.value })}
                placeholder={t("dashboard.components.catalogBlocksEditor.mapsUrlLabel")}
                aria-label={t("dashboard.components.catalogBlocksEditor.mapsUrlLabel")}
                className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
              />
              <p className="text-[10px] text-app-muted">{t("dashboard.components.catalogBlocksEditor.mapsHint")}</p>
            </div>
          )}

          {block.block_type === "faq" && (
            <FaqEmbeddedEditor
              items={(block.block_data.items as FaqQA[]) ?? []}
              onChange={(items) => updateBlock(block.id, { block_data: { ...block.block_data, items } })}
            />
          )}

          {block.block_type === "catalog" && (
            <div className="mt-2">
              <p className="mb-1.5 text-[10.5px] text-app-muted">{t("dashboard.components.catalogBlocksEditor.nestedCatalogHint")}</p>
              <CatalogNodeEditor
                items={(block.block_data.items as CatalogItem[]) ?? []}
                isPremium={isPremium}
                depth={depth + 1}
                onChange={(items) => updateBlock(block.id, { block_data: { ...block.block_data, items } })}
              />
            </div>
          )}
        </div>
      ))}

      {atLimit ? (
        <p className="text-[10.5px] text-app-muted">
          {depth >= maxCatalogDepth
            ? t("dashboard.components.catalogBlocksEditor.maxDepthReached")
            : t("dashboard.components.catalogBlocksEditor.maxBlocksReached").replace("{max}", String(maxCatalogItemBlocks))}
        </p>
      ) : (
        <CatalogBlockTypePicker isPremium={isPremium} disabled={atLimit} onPick={addBlock} />
      )}
    </div>
  );
}

// CatalogNodeEditor -- mengelola `items[]` satu simpul katalog BERSARANG
// (block_data milik blok tertanam bertipe "catalog"). Sengaja jauh lebih
// ringkas dari panel "Kelola Katalog" tingkat atas (dashboard/links/
// page.tsx) -- TANPA upload foto (lihat catatan lingkup di atas file ini)
// -- cuma judul, deskripsi, dan blok tertanam lagi (rekursif lewat
// CatalogBlocksEditor).
export function CatalogNodeEditor({
  items,
  isPremium,
  depth,
  onChange,
}: {
  items: CatalogItem[];
  isPremium: boolean;
  depth: number;
  onChange: (items: CatalogItem[]) => void;
}) {
  const { t } = useLocale();

  function addItem() {
    onChange([
      ...items,
      { id: crypto.randomUUID(), title: t("dashboard.components.catalogBlocksEditor.defaultItemTitle"), description: "", images: [] },
    ]);
  }

  function updateItem(id: string, patch: Partial<CatalogItem>) {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function removeItem(id: string) {
    const ok = await confirmDelete(t("dashboard.components.catalogBlocksEditor.confirmDeleteItemText"), {
      title: t("dashboard.components.catalogBlocksEditor.confirmDeleteItemTitle"),
    });
    if (!ok) return;
    onChange(items.filter((it) => it.id !== id));
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
          <div className="flex items-center gap-2">
            <input
              defaultValue={item.title}
              onBlur={(e) => updateItem(item.id, { title: e.target.value })}
              placeholder={t("dashboard.components.catalogBlocksEditor.itemTitlePlaceholder")}
              aria-label={t("dashboard.components.catalogBlocksEditor.itemTitleAriaLabel")}
              className="min-w-0 flex-1 rounded-md border border-app-border px-2 py-1 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              aria-label={t("dashboard.components.catalogBlocksEditor.removeItemAriaLabel")}
              className="flex-shrink-0 text-app-muted hover:text-red-600"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
          <textarea
            defaultValue={item.description}
            onBlur={(e) => updateItem(item.id, { description: e.target.value })}
            placeholder={t("dashboard.components.catalogBlocksEditor.itemDescriptionPlaceholder")}
            aria-label={t("dashboard.components.catalogBlocksEditor.itemDescriptionAriaLabel")}
            rows={2}
            className="mt-1.5 w-full rounded-md border border-app-border px-2 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
          />
          <CatalogBlocksEditor blocks={item.blocks ?? []} isPremium={isPremium} depth={depth} onChange={(blocks) => updateItem(item.id, { blocks })} />
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
      >
        <IconPlus className="h-3.5 w-3.5" /> {t("dashboard.components.catalogBlocksEditor.addItemButton")}
      </button>
    </div>
  );
}

// FaqEmbeddedEditor -- editor Q&A ringkas untuk blok "faq" tertanam,
// bentuk data SAMA PERSIS dengan block_data.items blok FAQ biasa
// (question/answer), cuma UI-nya lebih ringkas (tanpa modal terpisah)
// karena sudah bersarang di dalam CatalogBlocksEditor.
function FaqEmbeddedEditor({
  items,
  onChange,
}: {
  items: FaqQA[];
  onChange: (items: FaqQA[]) => void;
}) {
  const { t } = useLocale();

  function update(i: number, patch: Partial<FaqQA>) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      {items.map((qa, i) => (
        // key gabung index+panjang array -- remount paksa tiap kali daftar
        // berubah struktur (tambah/hapus baris) supaya defaultValue baris
        // yang index-nya bergeser tetap sinkron ke data terbaru, tapi TIDAK
        // remount di tiap ketikan (panjang array tidak berubah saat mengetik).
        <div key={`${i}-${items.length}`} className="flex flex-col gap-1 rounded-md border border-app-border p-2">
          <div className="flex items-center gap-1.5">
            <input
              defaultValue={qa.question}
              onBlur={(e) => update(i, { question: e.target.value })}
              placeholder={t("dashboard.components.catalogBlocksEditor.questionPlaceholder")}
              aria-label={t("dashboard.components.catalogBlocksEditor.questionAriaLabel").replace("{n}", String(i + 1))}
              className="min-w-0 flex-1 rounded-md border border-app-border px-2 py-1 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={t("dashboard.components.catalogBlocksEditor.removeQuestionAriaLabel")}
              className="flex-shrink-0 text-app-muted hover:text-red-600"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            defaultValue={qa.answer}
            onBlur={(e) => update(i, { answer: e.target.value })}
            placeholder={t("dashboard.components.catalogBlocksEditor.answerPlaceholder")}
            aria-label={t("dashboard.components.catalogBlocksEditor.answerAriaLabel").replace("{n}", String(i + 1))}
            rows={2}
            className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { question: "", answer: "" }])}
        className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-app-border py-1.5 text-[11px] font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
      >
        <IconPlus className="h-3 w-3" /> {t("dashboard.components.catalogBlocksEditor.addQuestionButton")}
      </button>
    </div>
  );
}
