"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, ChevronDown, ImagePlus, LayoutGrid, Palette, Shapes, TriangleAlert, X } from "lucide-react";
import { IconClock, IconCopy, IconLock, IconStar, IconTrash } from "@/components/icons";
import { getLibraryIcon } from "@/lib/icon-library";
import { useLocale } from "@/lib/locale-context";
import type { LinkItem } from "@/lib/api-client";

// BlockToolsStrip -- alat kelola per blok (jadwal/kunci/sensitif/ikon/
// featured/urutan/duplikat/hapus), dipakai bersama dashboard/links/page.tsx
// (Links) & ProdukPageEditor.tsx (Toko).
//
// REDESAIN TOTAL 22 September 2026 -- permintaan langsung pengguna: "ini
// sangat jelek secara ui dan ux nya saya mau tolong rubah total dan ambil
// yang dibutuhkan saja". Versi 18 September (kotak krem bergaris + 3 baris
// tombol pil berlabel) terbaca sbg tumpukan tombol setara tanpa hierarki
// & di ponsel patah acak ("Hapus" sendirian di baris ketiga). Sekarang:
//   - SATU baris terstruktur dgn garis pemisah tipis, tanpa kotak/garis
//     pinggir per tombol (hantu/ghost, hanya keadaan aktif yg berwarna).
//   - KIRI = pengaturan blok (Jadwal, Kunci/Sensitif, Featured, dan SATU
//     tombol Ikon yg membuka menu -- menggantikan 3-4 tombol ikon terpisah).
//   - KANAN = aksi (panah urutan sbg SATU kontrol ringkas, Duplikat, Hapus
//     merah). Label teks TETAP ada di aksi penting: keluhan 18 September
//     justru soal tombol ikon-saja yg tak jelas di layar sentuh; panah
//     urutan boleh ikon-saja karena maknanya universal (+ aria-label) dan
//     jadi SATU-SATUNYA cara mengurutkan di ponsel (drag HTML5 di daftar
//     tidak jalan di sentuh).
// Atribut `title` tiap aksi DIPERTAHANKAN persis (e2e links.spec.ts memakai
// getByTitle & memeriksa kelas text-jeon-purple utk status aktif). Gerbang
// per tipe blok (kunci penuh cuma link/button, sensitif utk tipe lain,
// featured cuma link) SAMA PERSIS dgn versi lama -- lihat catatan panjang
// di UpdateLink (links.go).
//
// Komponen presentasional murni: semua state pengunggahan & PATCH dipegang
// pemanggil, sama pola BlockPanelHeader.tsx.
type IconComponent = React.ComponentType<{ className?: string }>;

const CHIP_BASE = "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors";
const CHIP_IDLE = "text-app-ink hover:bg-app-surface-2";
const CHIP_ACTIVE = "bg-jeon-lavender/60 text-jeon-purple";

function ToolButton({
  icon: Icon,
  label,
  title,
  active,
  danger,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  title: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`${CHIP_BASE} ${danger ? "text-red-600 hover:bg-red-500/10" : active ? CHIP_ACTIVE : CHIP_IDLE}`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </button>
  );
}

function ArrowButton({ icon: Icon, title, disabled, onClick }: { icon: IconComponent; title: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-app-muted"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function MenuItem({
  icon: Icon,
  label,
  title,
  active,
  danger,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  title: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors ${
        danger ? "text-red-600 hover:bg-red-500/10" : active ? "text-jeon-purple hover:bg-jeon-lavender/40" : "text-app-ink hover:bg-app-surface-2"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

// IconPreview -- pratinjau kecil ikon yg sedang dipakai di tombol "Ikon":
// gambar unggahan kustom > ikon dari galeri (berwarna kalau ada icon_color)
// > ikon generik. Ikon otomatis-deteksi dari URL (detectLinkIcon) SENGAJA
// tidak ditampilkan di sini -- itu keadaan "tidak ada pilihan" yg justru
// ingin ditandai dgn ikon generik.
function IconPreview({ link }: { link: LinkItem }) {
  if (link.custom_icon_url) {
    return <Image src={link.custom_icon_url} alt="" width={20} height={20} className="h-5 w-5 flex-shrink-0 rounded-md object-cover ring-1 ring-black/10" />;
  }
  const lib = getLibraryIcon(link.icon_key);
  const Glyph = lib?.Icon ?? Shapes;
  return (
    <span style={link.icon_color ? { color: link.icon_color } : undefined} className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
      <Glyph className="h-4 w-4" />
    </span>
  );
}

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
  hideFeaturedToggle = false,
  onDuplicate,
  onDelete,
}: {
  link: LinkItem;
  iconUploading: boolean;
  className?: string;
  // Urutan blok -- opsional supaya pemanggil tanpa reorder tetap kompatibel.
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
  // hideFeaturedToggle -- Simple Mode (dashboard/links/page.tsx) memindahkan
  // kontrol Featured ke LinkDisplayModePicker (2 kotak Classic/Featured yang
  // lebih prominent) di halaman penuh per blok, jadi tombol bintang di sini
  // duplikat & disembunyikan di sana. Toko (ProdukPageEditor.tsx) TIDAK
  // diubah -- default false mempertahankan tombol bintang lama.
  hideFeaturedToggle?: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  const L = (key: string) => t(`dashboard.pages.links.linkCard.toolLabels.${key}`);
  const fullLock = link.block_type === "link" || link.block_type === "button";
  const scheduled = Boolean(link.starts_at && link.ends_at);
  const hasCustomIcon = Boolean(link.custom_icon_url || link.icon_key || link.icon_color);

  // Menu Ikon -- tutup lewat klik-di-luar / Escape (pola sama menu ⋮ di
  // BuilderLeftPanel.tsx). Input file SELALU ter-mount (di luar menu) &
  // dipicu lewat .click() dari tombol "Unggah": kalau input-nya hidup di
  // dalam menu, menutup menu saat item diklik membongkar input itu SEBELUM
  // event `change`-nya sempat terkirim (unggahan hilang diam-diam). Bonus:
  // tombol sungguhan -> bisa dijangkau keyboard (label+input `hidden` versi
  // lama tidak bisa).
  const [iconMenuOpen, setIconMenuOpen] = useState(false);
  const iconMenuRef = useRef<HTMLDivElement>(null);
  const iconTriggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!iconMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (iconMenuRef.current && !iconMenuRef.current.contains(e.target as Node)) setIconMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIconMenuOpen(false);
        iconTriggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [iconMenuOpen]);

  return (
    <div role="toolbar" aria-label={L("toolbar")} className={`flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-app-border pt-3 ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={(e) => {
          onIconUpload(e);
          setIconMenuOpen(false);
        }}
        disabled={iconUploading}
        className="hidden"
      />

      {/* Grup kiri `relative w-full` di ponsel (menu Ikon menempel tepat di
          bawah baris chip ini & selebar penuh), `sm:static sm:w-auto` di
          layar lebar (menu ditambatkan ke tombol Ikon-nya sendiri). */}
      <div className="relative flex w-full flex-wrap items-center gap-1 sm:static sm:w-auto">
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
        {link.block_type === "link" && !hideFeaturedToggle && (
          <ToolButton
            icon={IconStar}
            label={L("featured")}
            title={link.is_featured ? t("dashboard.pages.links.linkCard.unfeature") : t("dashboard.pages.links.linkCard.makeFeatured")}
            active={link.is_featured}
            onClick={onToggleFeatured}
          />
        )}

        {/* wrapper `sm:relative` (bukan `relative` polos): di ponsel menu
            ditambatkan ke grup kiri di atas, di layar lebar ke tombol ini. */}
        <div ref={iconMenuRef} className="sm:relative">
          <button
            ref={iconTriggerRef}
            type="button"
            onClick={() => setIconMenuOpen((open) => !open)}
            aria-haspopup="true"
            aria-expanded={iconMenuOpen}
            title={L("iconGroup")}
            className={`${CHIP_BASE} ${iconMenuOpen || hasCustomIcon ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {iconUploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <IconPreview link={link} />}
            {L("iconGroup")}
            <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${iconMenuOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {iconMenuOpen && (
            <div className="absolute inset-x-0 top-full z-30 mt-1.5 rounded-xl border border-app-border bg-app-surface p-1.5 shadow-soft sm:inset-x-auto sm:left-0 sm:w-64">
              <MenuItem
                icon={ImagePlus}
                label={link.custom_icon_url ? t("dashboard.pages.links.linkCard.changeCustomIcon") : t("dashboard.pages.links.linkCard.uploadCustomIcon")}
                title={link.custom_icon_url ? t("dashboard.pages.links.linkCard.changeCustomIcon") : t("dashboard.pages.links.linkCard.uploadCustomIcon")}
                active={Boolean(link.custom_icon_url)}
                onClick={() => fileInputRef.current?.click()}
              />
              <MenuItem
                icon={LayoutGrid}
                label={t("dashboard.pages.links.linkCard.pickFromIconGallery")}
                title={t("dashboard.pages.links.linkCard.pickFromIconGallery")}
                active={Boolean(link.icon_key)}
                onClick={() => {
                  onOpenIconGallery();
                  setIconMenuOpen(false);
                }}
              />
              {!link.custom_icon_url && (
                <label
                  title={link.icon_color ? t("dashboard.pages.links.linkCard.changeIconColor") : t("dashboard.pages.links.linkCard.pickIconColor")}
                  className={`relative flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors focus-within:ring-2 focus-within:ring-jeon-purple/40 ${
                    link.icon_color ? "text-jeon-purple hover:bg-jeon-lavender/40" : "text-app-ink hover:bg-app-surface-2"
                  }`}
                >
                  {link.icon_color ? (
                    <span className="h-4 w-4 flex-shrink-0 rounded-full ring-1 ring-black/15" style={{ backgroundColor: link.icon_color }} aria-hidden />
                  ) : (
                    <Palette className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{link.icon_color ? t("dashboard.pages.links.linkCard.changeIconColor") : t("dashboard.pages.links.linkCard.pickIconColor")}</span>
                  <input
                    type="color"
                    value={link.icon_color || "#000000"}
                    onChange={(e) => onIconColorChange(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              )}
              {link.icon_color && !link.custom_icon_url && (
                <MenuItem
                  icon={X}
                  label={L("clearIconColor")}
                  title={t("dashboard.pages.links.linkCard.clearIconColor")}
                  onClick={() => {
                    onClearIconColor();
                    setIconMenuOpen(false);
                  }}
                />
              )}
              {(link.custom_icon_url || link.icon_key) && (
                <>
                  <div className="my-1 h-px bg-app-border" aria-hidden />
                  <MenuItem
                    icon={IconTrash}
                    label={L("removeIcon")}
                    title={t("dashboard.pages.links.linkCard.removeIcon")}
                    danger
                    onClick={() => {
                      onRemoveIcon();
                      setIconMenuOpen(false);
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 max-sm:w-full max-sm:justify-between max-sm:border-t max-sm:border-app-border max-sm:pt-2 sm:ml-auto">
        {(onMoveUp || onMoveDown) && (
          <div role="group" aria-label={L("reorder")} className="flex items-center">
            {onMoveUp && <ArrowButton icon={ArrowUp} title={t("dashboard.pages.links.moveUp")} disabled={!canMoveUp} onClick={onMoveUp} />}
            {onMoveDown && <ArrowButton icon={ArrowDown} title={t("dashboard.pages.links.moveDown")} disabled={!canMoveDown} onClick={onMoveDown} />}
          </div>
        )}
        <div className="flex items-center gap-1">
          <ToolButton icon={IconCopy} label={L("duplicate")} title={t("dashboard.pages.links.linkCard.duplicate")} onClick={onDuplicate} />
          <ToolButton icon={IconTrash} label={L("delete")} title={t("dashboard.pages.links.common.delete")} danger onClick={onDelete} />
        </div>
      </div>
    </div>
  );
}
