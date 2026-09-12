"use client";

import { IconPlus, IconTrash } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import RichTextEditor from "@/components/dashboard/page/RichTextEditor";

// toDatetimeLocalValue -- Canvas Page Builder Fase 3 (block "countdown"):
// `<input type="datetime-local">` butuh format LOKAL tanpa offset zona
// waktu ("YYYY-MM-DDTHH:mm"), beda dari `target_at` yang disimpan sbg
// ISO 8601 UTC (`toISOString()`) -- konversi manual pakai getFullYear/dst
// (BUKAN slice string ISO) supaya representasi yang ditampilkan konsisten
// di ZONA WAKTU BROWSER kreator, bukan UTC mentah.
export function toDatetimeLocalValue(targetAt: string | undefined): string {
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
//
// Diekstrak dari BuilderLeftPanel.tsx (12 September 2026, "full parity"
// mode Simple vs Builder) supaya bisa dipakai dari dashboard/links/page.tsx
// JUGA -- signature diubah dari `(node: BuilderTreeNode)` jadi `(items,
// style)` langsung, satu-satunya field `node` yang sebenarnya dipakai.
// Dipakai DUA kali di mode Simple: inline di form "Tambah Blok" (sebelum
// blok dibuat, pola sama blockFaqItems) DAN di panel "Kelola Item" pasca-
// buat (autosave onBlur per field, validasi backend "list" longgar --
// item cuma perlu berupa object, TIDAK ada field wajib seperti FAQ
// top-level).
export interface ListEditorItem {
  title: string;
  description?: string;
  author?: string;
}

export function ListItemsEditor({
  style,
  items,
  onUpdateStyle,
  onUpdateItems,
}: {
  style: "list" | "card" | "testimony";
  items: ListEditorItem[];
  onUpdateStyle: (style: "list" | "card" | "testimony") => void;
  onUpdateItems: (items: ListEditorItem[]) => void;
}) {
  const { t } = useLocale();
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
            {/* Deskripsi/kutipan -- rich text (susulan 12 September 2026,
                "tiap blok yang ada teks nya buat semua jadi rich teks",
                dikonfirmasi via AskUserQuestion: field isi/deskripsi
                panjang saja) -- reuse RichTextEditor sama persis blok
                "text" (TIDAK punya placeholder dinamis list/testimoni
                seperti textarea lama, TipTap tidak punya extension
                placeholder terpasang). */}
            <RichTextEditor html={item.description ?? ""} onChange={(html) => updateItem(i, { description: html })} />
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
