"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  IconBox,
  IconChevronRight,
  IconColumns,
  IconDivider,
  IconExternal,
  IconPlus,
  IconSettings,
  IconTextLines,
  IconTrash,
} from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import type { EmbeddedBuilderBlock, LinkItem } from "@/lib/api-client";
import type { BuilderSeg } from "@/lib/builder-blocks";
import BuilderAddComponentModal from "@/components/BuilderAddComponentModal";

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
// Reorder Fase 1 SENGAJA cuma tombol naik/turun di level ROOT (lewat
// reorderLinks/reorderExtraPageLinks yang sudah ada) -- drag-and-drop
// (termasuk pindah blok masuk/keluar Section/Column) menyusul di commit
// @dnd-kit berikutnya, per urutan fase yang disetujui pengguna.

export interface BuilderSelection {
  rootId: string;
  path: BuilderSeg[];
  kind: "block" | "column-slot";
  blockType?: string;
}

interface BuilderTreeNode {
  id: string;
  rootId: string;
  path: BuilderSeg[];
  kind: "block" | "column-slot";
  title: string;
  blockType?: string;
  url?: string;
  blockData?: Record<string, unknown>;
  children: BuilderTreeNode[];
}

function buildChildNodes(rootId: string, parentPath: BuilderSeg[], children: EmbeddedBuilderBlock[]): BuilderTreeNode[] {
  return children.map((child) => buildBlockNode(rootId, [...parentPath, { kind: "child", id: child.id }], child.id, child.block_type, child.title, child.url, child.block_data));
}

function buildBlockNode(
  rootId: string,
  path: BuilderSeg[],
  id: string,
  blockType: string,
  title: string,
  url: string | undefined,
  blockData: Record<string, unknown> | undefined
): BuilderTreeNode {
  const data = blockData ?? {};
  let children: BuilderTreeNode[] = [];
  if (blockType === "section") {
    children = buildChildNodes(rootId, path, (data.children as EmbeddedBuilderBlock[] | undefined) ?? []);
  } else if (blockType === "column") {
    const columns = (data.columns as { children?: EmbeddedBuilderBlock[] }[] | undefined) ?? [];
    children = columns.map((col, i) => {
      const colPath: BuilderSeg[] = [...path, { kind: "column", index: i }];
      return {
        id: `${id}::col${i}`,
        rootId,
        path: colPath,
        kind: "column-slot" as const,
        title: "",
        children: buildChildNodes(rootId, colPath, col.children ?? []),
      };
    });
  }
  return { id, rootId, path, kind: "block", title, blockType, url, blockData: data, children };
}

function buildTree(links: LinkItem[]): BuilderTreeNode[] {
  return links.map((link) => buildBlockNode(link.id, [], link.id, link.block_type, link.title, link.url, link.block_data));
}

const TYPE_ICON: Record<string, (p: { className?: string }) => React.ReactElement> = {
  text: IconTextLines,
  button: IconExternal,
  divider: IconDivider,
  column: IconColumns,
  section: IconBox,
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
};

export default function BuilderLeftPanel({
  links,
  onAdd,
  onDelete,
  onMoveRoot,
  onUpdateNode,
  designHref,
  settingsHref,
}: {
  links: LinkItem[];
  onAdd: (target: BuilderSelection | null, type: EmbeddedBuilderBlock["block_type"]) => void;
  onDelete: (target: BuilderSelection) => void;
  onMoveRoot: (id: string, direction: "up" | "down") => void;
  onUpdateNode: (target: BuilderSelection, patch: { title?: string; url?: string; blockData?: Record<string, unknown> }) => void;
  designHref: string;
  settingsHref: string;
}) {
  const { t } = useLocale();
  const [tab, setTab] = useState<"content" | "design" | "settings">("content");
  const [selection, setSelection] = useState<BuilderSelection | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addModalOpen, setAddModalOpen] = useState(false);

  const tree = useMemo(() => buildTree(links), [links]);

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectionOf(node: BuilderTreeNode): BuilderSelection {
    return { rootId: node.rootId, path: node.path, kind: node.kind, blockType: node.blockType };
  }

  function isSelected(node: BuilderTreeNode) {
    return !!selection && selection.rootId === node.rootId && JSON.stringify(selection.path) === JSON.stringify(node.path);
  }

  function renderTreeNode(node: BuilderTreeNode, depth: number): React.ReactNode {
    const Icon = node.kind === "block" ? (TYPE_ICON[node.blockType ?? ""] ?? IconBox) : null;
    const canExpand = node.kind === "column-slot" || node.blockType === "section" || node.blockType === "column";
    const lastSeg = node.path[node.path.length - 1];
    const label =
      node.kind === "column-slot"
        ? `${t("dashboard.pages.linksBuilder.columnLabel")} ${lastSeg && lastSeg.kind === "column" ? lastSeg.index + 1 : ""}`
        : node.title || t(`dashboard.components.builderAddComponentModal.${TYPE_LABEL_KEY[node.blockType ?? ""] ?? "typeText"}`);

    return (
      <div key={`${node.rootId}:${JSON.stringify(node.path)}`}>
        <div
          style={{ paddingLeft: `${depth * 16}px` }}
          className={`flex items-center gap-1.5 rounded-lg py-1.5 pr-1.5 text-xs ${isSelected(node) ? "bg-jeon-lavender/60" : "hover:bg-app-surface-2"}`}
        >
          {canExpand ? (
            <button type="button" onClick={() => toggleCollapsed(node.id)} className="flex-shrink-0 text-app-muted">
              <IconChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has(node.id) ? "" : "rotate-90"}`} />
            </button>
          ) : (
            <span className="w-3.5 flex-shrink-0" />
          )}
          <button type="button" onClick={() => setSelection(selectionOf(node))} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0 text-app-muted" />}
            <span className="truncate font-semibold text-app-ink">{label}</span>
          </button>
          {node.kind === "block" && node.path.length === 0 && (
            <div className="flex flex-shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => onMoveRoot(node.id, "up")} title={t("dashboard.pages.linksBuilder.moveUp")} className="text-app-muted hover:text-app-ink">
                <IconChevronRight className="h-3 w-3 -rotate-90" />
              </button>
              <button type="button" onClick={() => onMoveRoot(node.id, "down")} title={t("dashboard.pages.linksBuilder.moveDown")} className="text-app-muted hover:text-app-ink">
                <IconChevronRight className="h-3 w-3 rotate-90" />
              </button>
            </div>
          )}
        </div>
        {canExpand && !collapsed.has(node.id) && (
          <div>
            {node.children.length === 0 ? (
              <p style={{ paddingLeft: `${(depth + 1) * 16 + 20}px` }} className="py-1 text-[11px] text-app-muted">
                {t("dashboard.pages.linksBuilder.emptyContainer")}
              </p>
            ) : (
              node.children.map((child) => renderTreeNode(child, depth + 1))
            )}
          </div>
        )}
      </div>
    );
  }

  const selectedNode = useMemo(() => {
    if (!selection) return null;
    const findIn = (nodes: BuilderTreeNode[]): BuilderTreeNode | null => {
      for (const n of nodes) {
        if (n.rootId === selection.rootId && JSON.stringify(n.path) === JSON.stringify(selection.path)) return n;
        const found = findIn(n.children);
        if (found) return found;
      }
      return null;
    };
    return findIn(tree);
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
              tree.map((node) => renderTreeNode(node, 0))
            )}
          </div>

          {selectedNode && (
            <div className="flex-shrink-0 border-t border-app-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-app-muted">{t("dashboard.pages.linksBuilder.editSelected")}</p>
                {selectedNode.kind === "block" && (
                  <button
                    type="button"
                    onClick={() => { onDelete(selectionOf(selectedNode)); setSelection(null); }}
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
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <IconBox className="h-6 w-6 text-app-muted" />
          <p className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.designPlaceholder")}</p>
          <Link href={designHref} className="flex items-center gap-1 text-xs font-bold text-jeon-purple hover:underline">
            {t("dashboard.pages.linksBuilder.openDesignPage")}
            <IconExternal className="h-3.5 w-3.5" />
          </Link>
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
          onSelect={(type) => {
            setAddModalOpen(false);
            onAdd(addTarget, type);
          }}
        />
      )}
    </div>
  );
}
