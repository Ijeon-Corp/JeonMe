"use client";

import { ArrowDown, ArrowUp, LayoutGrid, TriangleAlert } from "lucide-react";
import { IconCamera, IconClock, IconClose, IconCopy, IconLock, IconPaintbrush, IconStar, IconTrash } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import type { LinkItem } from "@/lib/api-client";

// BlockToolsStrip -- strip alat kelola per blok (jadwal/kunci/sensitif/ikon/
// featured/duplikat/hapus), dipakai bersama dashboard/links/page.tsx (Links)
// & ProdukPageEditor.tsx (Toko). Redesain 18 September 2026 -- laporan
// langsung pengguna: "semua icon yang ada di settings blok itu secara ui
// dan ux sangat tidak user friendly" -- SEBELUMNYA deretan tombol 32px
// ikon-saja (satu-satunya petunjuk fungsi = tooltip hover, tidak ada di
// sentuh/mobile), sekarang tiap aksi punya LABEL teks di samping ikonnya
// & dikelompokkan dua baris: aksi blok (atas) vs kontrol ikon (bawah,
// diberi caption "Ikon"). Atribut `title` tiap tombol SENGAJA
// dipertahankan persis (e2e links.spec.ts memakai getByTitle + memeriksa
// kelas text-jeon-purple utk status aktif). Gerbang per tipe blok
// (kunci penuh cuma link/button, sensitif utk tipe lain, featured cuma
// link) SAMA PERSIS & dgn alasan yang sama seperti versi lama di
// links/page.tsx -- lihat catatan panjang di UpdateLink (links.go).
//
// Komponen presentasional murni: semua state (upload, picker) & PATCH
// dipegang pemanggil, sama pola BlockPanelHeader.tsx.
type IconComponent = React.ComponentType<{ className?: string }>;

function ToolButton({
  icon: Icon,
  label,
  title,
  active,
  danger,
  disabled,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "border-red-200 bg-app-surface text-red-600 hover:bg-red-50"
          : active
            ? "border-jeon-purple bg-jeon-lavender/40 text-jeon-purple"
            : "border-app-border bg-app-surface text-app-ink hover:border-jeon-purple hover:text-jeon-purple disabled:hover:border-app-border disabled:hover:text-app-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      {label}
    </button>
  );
}

const FILE_LABEL_CLASS =
  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors";

export default function BlockToolsStrip({
  link,
  iconUploading,
  className = "",
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  onSchedule,
  onLock,
  onToggleSensitive,
  onIconUpload,
  onOpenIconGallery,
  onIconColorChange,
  onClearIconColor,
  onRemoveIcon,
  onToggleFeatured,
  onDuplicate,
  onDelete,
}: {
  link: LinkItem;
  iconUploading: boolean;
  className?: string;
  // Urutan blok -- redesain baris blok 18 September 2026 (referensi gambar
  // pengguna: baris bersih tanpa kolom ▲▼ di kiri). Tombol ▲/▼ yang dulu
  // selalu tampil di header PINDAH ke sini sebagai tombol berlabel;
  // drag & drop di kartu tetap ada (grip muncul saat hover). Opsional
  // supaya pemanggil lama tanpa reorder tetap kompatibel.
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onSchedule: () => void;
  onLock: () => void;
  onToggleSensitive: () => void;
  onIconUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenIconGallery: () => void;
  onIconColorChange: (color: string) => void;
  onClearIconColor: () => void;
  onRemoveIcon: () => void;
  onToggleFeatured: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  const L = (key: string) => t(`dashboard.pages.links.linkCard.toolLabels.${key}`);
  const fullLock = link.block_type === "link" || link.block_type === "button";
  const scheduled = Boolean(link.starts_at && link.ends_at);

  return (
    <div className={`flex flex-col gap-2 rounded-2xl border border-app-border bg-app-surface-2 p-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {onMoveUp && <ToolButton icon={ArrowUp} label={t("dashboard.pages.links.moveUp")} title={t("dashboard.pages.links.moveUp")} disabled={!canMoveUp} onClick={onMoveUp} />}
        {onMoveDown && <ToolButton icon={ArrowDown} label={t("dashboard.pages.links.moveDown")} title={t("dashboard.pages.links.moveDown")} disabled={!canMoveDown} onClick={onMoveDown} />}
        <ToolButton icon={IconClock} label={L("schedule")} title={t("dashboard.pages.links.linkCard.scheduleTooltip")} active={scheduled} onClick={onSchedule} />
        {fullLock ? (
          <ToolButton icon={IconLock} label={L("lock")} title={t("dashboard.pages.links.linkCard.lockTooltip")} active={Boolean(link.lock_type)} onClick={onLock} />
        ) : (
          <ToolButton
            icon={TriangleAlert}
            label={L("sensitive")}
            title={link.lock_type === "sensitive" ? t("dashboard.pages.links.linkCard.unmarkSensitive") : t("dashboard.pages.links.linkCard.markSensitive")}
            active={link.lock_type === "sensitive"}
            onClick={onToggleSensitive}
          />
        )}
        {link.block_type === "link" && (
          <ToolButton
            icon={IconStar}
            label={L("featured")}
            title={link.is_featured ? t("dashboard.pages.links.linkCard.unfeature") : t("dashboard.pages.links.linkCard.makeFeatured")}
            active={link.is_featured}
            onClick={onToggleFeatured}
          />
        )}
        <div className="flex-1" />
        <ToolButton icon={IconCopy} label={L("duplicate")} title={t("dashboard.pages.links.linkCard.duplicate")} onClick={onDuplicate} />
        <ToolButton icon={IconTrash} label={L("delete")} title={t("dashboard.pages.links.common.delete")} danger onClick={onDelete} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[10px] font-bold uppercase tracking-wide text-app-muted">{L("iconGroup")}</span>
        <label
          title={link.custom_icon_url ? t("dashboard.pages.links.linkCard.changeCustomIcon") : t("dashboard.pages.links.linkCard.uploadCustomIcon")}
          className={`${FILE_LABEL_CLASS} ${
            link.custom_icon_url ? "border-jeon-purple bg-jeon-lavender/40 text-jeon-purple" : "border-app-border bg-app-surface text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
          }`}
        >
          {iconUploading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          ) : (
            <IconCamera className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          {L("uploadIcon")}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={onIconUpload}
            disabled={iconUploading}
            className="hidden"
          />
        </label>
        <ToolButton icon={LayoutGrid} label={L("iconGallery")} title={t("dashboard.pages.links.linkCard.pickFromIconGallery")} active={Boolean(link.icon_key)} onClick={onOpenIconGallery} />
        {!link.custom_icon_url && (
          <label
            title={link.icon_color ? t("dashboard.pages.links.linkCard.changeIconColor") : t("dashboard.pages.links.linkCard.pickIconColor")}
            className={`${FILE_LABEL_CLASS} relative ${
              link.icon_color ? "border-jeon-purple bg-jeon-lavender/40 text-jeon-purple" : "border-app-border bg-app-surface text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
            }`}
          >
            {link.icon_color ? (
              <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: link.icon_color }} aria-hidden />
            ) : (
              <IconPaintbrush className="h-3.5 w-3.5 flex-shrink-0" />
            )}
            {L("iconColor")}
            <input
              type="color"
              value={link.icon_color || "#000000"}
              onChange={(e) => onIconColorChange(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        )}
        {link.icon_color && <ToolButton icon={IconClose} label={L("clearIconColor")} title={t("dashboard.pages.links.linkCard.clearIconColor")} onClick={onClearIconColor} />}
        {(link.custom_icon_url || link.icon_key) && (
          <ToolButton icon={IconClose} label={L("removeIcon")} title={t("dashboard.pages.links.linkCard.removeIcon")} onClick={onRemoveIcon} />
        )}
      </div>
    </div>
  );
}
