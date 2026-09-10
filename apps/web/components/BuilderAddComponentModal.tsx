"use client";

import { useState } from "react";
import {
  IconBook,
  IconBox,
  IconCamera,
  IconClock,
  IconClose,
  IconColumns,
  IconDivider,
  IconExternal,
  IconIframe,
  IconLink,
  IconListCard,
  IconMapPin,
  IconPhotoLibrary,
  IconPlayCircle,
  IconSearch,
  IconShoppingBag,
  IconSlideshow,
  IconTextLines,
  IconVideoImage,
} from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import type { EmbeddedBuilderBlock } from "@/lib/api-client";

// BuilderAddComponentModal -- Canvas Page Builder (migrasi 000096,
// permintaan langsung pengguna 7 September 2026, dua screenshot Lynk.id):
// modal "Tambah Komponen" bergaya kartu berkategori, referensi langsung
// screenshot Lynk.id yang ditunjukkan pengguna (GENERAL/MEDIA/INFORMATION/
// CONVERSION/OTHERS). Mengikuti pola visual AddLinkModal.tsx (kartu 4
// kolom + baris berdeskripsi) TAPI struktur data sendiri -- kategori &
// 17 tipe komponen di sini SAMA SEKALI beda konsep dari tile platform/
// blok konten AddLinkModal (link-in-bio biasa), jadi tidak reuse
// ContentTile/PlatformQuickAdd punya links/page.tsx.
//
// Fase 1 (dikonfirmasi user: "Bertahap 3 fase"): HANYA kategori GENERAL
// terisi (Text/Button/Divider/Column/Section) -- 4 kategori lain TAMPIL
// dengan status "segera hadir" supaya kerangka 5-kategori sudah ada sejak
// awal walau isinya menyusul Fase 2/3 (lihat peta jalan di plan).

export type BuilderComponentCategory = "general" | "media" | "information" | "conversion" | "others";

// AddableBlockType -- union block_type yang bisa dipilih lewat modal ini,
// LEBIH LUAS dari EmbeddedBuilderBlock["block_type"] (anak tertanam
// Section/Column) -- "maps" ROOT-ONLY di Fase 3 (lihat catatan lengkap di
// plan), jadi tile-nya perlu tipe ini, disaring dari daftar via prop
// `nested` kalau target tambahnya bukan root.
export type AddableBlockType = EmbeddedBuilderBlock["block_type"] | "maps";

export interface BuilderComponentTile {
  type: AddableBlockType;
  label: string;
  description: string;
  Icon: (p: { className?: string }) => React.ReactElement;
}

function buildBuilderComponentCategories(
  t: (key: string) => string
): { key: BuilderComponentCategory; label: string; tiles: BuilderComponentTile[] }[] {
  return [
    {
      key: "general",
      label: t("dashboard.components.builderAddComponentModal.categoryGeneral"),
      tiles: [
        { type: "text", label: t("dashboard.components.builderAddComponentModal.typeText"), description: t("dashboard.components.builderAddComponentModal.typeTextDesc"), Icon: IconTextLines },
        { type: "button", label: t("dashboard.components.builderAddComponentModal.typeButton"), description: t("dashboard.components.builderAddComponentModal.typeButtonDesc"), Icon: IconExternal },
        { type: "divider", label: t("dashboard.components.builderAddComponentModal.typeDivider"), description: t("dashboard.components.builderAddComponentModal.typeDividerDesc"), Icon: IconDivider },
        { type: "column", label: t("dashboard.components.builderAddComponentModal.typeColumn"), description: t("dashboard.components.builderAddComponentModal.typeColumnDesc"), Icon: IconColumns },
        { type: "section", label: t("dashboard.components.builderAddComponentModal.typeSection"), description: t("dashboard.components.builderAddComponentModal.typeSectionDesc"), Icon: IconBox },
      ],
    },
    {
      // Fase 2: 4 tipe MEDIA. Fase 3 (permintaan langsung pengguna 8
      // September 2026): +Image Slider (alias validasi/upload "gallery",
      // render carousel geser -- lihat ImageSliderBlock.tsx).
      key: "media",
      label: t("dashboard.components.builderAddComponentModal.categoryMedia"),
      tiles: [
        { type: "image", label: t("dashboard.components.builderAddComponentModal.typeImage"), description: t("dashboard.components.builderAddComponentModal.typeImageDesc"), Icon: IconCamera },
        { type: "gallery", label: t("dashboard.components.builderAddComponentModal.typeImageGrid"), description: t("dashboard.components.builderAddComponentModal.typeImageGridDesc"), Icon: IconPhotoLibrary },
        { type: "video", label: t("dashboard.components.builderAddComponentModal.typeVideo"), description: t("dashboard.components.builderAddComponentModal.typeVideoDesc"), Icon: IconPlayCircle },
        { type: "video_image", label: t("dashboard.components.builderAddComponentModal.typeVideoImage"), description: t("dashboard.components.builderAddComponentModal.typeVideoImageDesc"), Icon: IconVideoImage },
        { type: "image_slider", label: t("dashboard.components.builderAddComponentModal.typeImageSlider"), description: t("dashboard.components.builderAddComponentModal.typeImageSliderDesc"), Icon: IconSlideshow },
      ],
    },
    {
      // Fase 3: "Card/List/Testimony" dari peta jalan awal jadi SATU
      // block_type fleksibel "list" (dikonfirmasi via AskUserQuestion),
      // di samping FAQ yang sudah ada sejak Fase 2.
      key: "information",
      label: t("dashboard.components.builderAddComponentModal.categoryInformation"),
      tiles: [
        { type: "faq", label: t("dashboard.components.builderAddComponentModal.typeFaq"), description: t("dashboard.components.builderAddComponentModal.typeFaqDesc"), Icon: IconBook },
        { type: "list", label: t("dashboard.components.builderAddComponentModal.typeList"), description: t("dashboard.components.builderAddComponentModal.typeListDesc"), Icon: IconListCard },
      ],
    },
    {
      // Fase 3: Countdown -- satu-satunya tipe CONVERSION, kategori ini
      // kosong total sejak Fase 1.
      key: "conversion",
      label: t("dashboard.components.builderAddComponentModal.categoryConversion"),
      tiles: [
        { type: "countdown", label: t("dashboard.components.builderAddComponentModal.typeCountdown"), description: t("dashboard.components.builderAddComponentModal.typeCountdownDesc"), Icon: IconClock },
        // "produk" -- permintaan langsung pengguna 10 September 2026
        // ("harusnya ada blok produk"): tampilkan SATU produk kreator di
        // lokasi bebas dalam layout, beda dari grid produk otomatis
        // Halaman Toko.
        { type: "produk", label: t("dashboard.components.builderAddComponentModal.typeProduk"), description: t("dashboard.components.builderAddComponentModal.typeProdukDesc"), Icon: IconShoppingBag },
      ],
    },
    {
      // Fase 3: +Embed generik (iframe+whitelist provider) & Maps
      // (promosi block_type lama, ROOT-ONLY -- lihat catatan lengkap di
      // plan & allowedBuilderEmbeddedBlockTypes, links.go).
      key: "others",
      label: t("dashboard.components.builderAddComponentModal.categoryOthers"),
      tiles: [
        { type: "embed_link", label: t("dashboard.components.builderAddComponentModal.typeEmbedLink"), description: t("dashboard.components.builderAddComponentModal.typeEmbedLinkDesc"), Icon: IconLink },
        { type: "embed", label: t("dashboard.components.builderAddComponentModal.typeEmbed"), description: t("dashboard.components.builderAddComponentModal.typeEmbedDesc"), Icon: IconIframe },
        { type: "maps", label: t("dashboard.components.builderAddComponentModal.typeMaps"), description: t("dashboard.components.builderAddComponentModal.typeMapsDesc"), Icon: IconMapPin },
      ],
    },
  ];
}

export default function BuilderAddComponentModal({
  onClose,
  onSelect,
  nested,
}: {
  onClose: () => void;
  onSelect: (type: AddableBlockType) => void;
  // nested -- Fase 3 (permintaan langsung pengguna 8 September 2026):
  // true kalau target tambah adalah DI DALAM Section/Column (bukan root).
  // "maps" ROOT-ONLY di Fase 3 (lihat catatan lengkap di plan &
  // allowedBuilderEmbeddedBlockTypes, links.go) -- disaring dari daftar
  // tile supaya kreator tidak memilih tipe yang backend akan tolak.
  nested?: boolean;
}) {
  const { t } = useLocale();
  const [category, setCategory] = useState<BuilderComponentCategory>("general");
  const [search, setSearch] = useState("");
  const categories = buildBuilderComponentCategories(t).map((c) => ({
    ...c,
    tiles: nested ? c.tiles.filter((tile) => tile.type !== "maps") : c.tiles,
  }));
  const searchLower = search.trim().toLowerCase();

  const visibleTiles = searchLower
    ? categories.flatMap((c) => c.tiles).filter((tile) => tile.label.toLowerCase().includes(searchLower))
    : (categories.find((c) => c.key === category)?.tiles ?? []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-jlg border-2 border-jeon-ink bg-app-surface shadow-brutal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-app-border px-5 py-4">
          <h2 className="font-display text-lg font-bold text-app-ink">{t("dashboard.components.builderAddComponentModal.title")}</h2>
          <button type="button" onClick={onClose} className="text-app-muted hover:text-app-ink">
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-shrink-0 border-b border-app-border px-5 py-3">
          <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5">
            <IconSearch className="h-4 w-4 flex-shrink-0 text-app-muted" />
            <input
              type="text"
              autoFocus
              placeholder={t("dashboard.components.builderAddComponentModal.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!searchLower && (
            <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategory(cat.key)}
                  className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    category === cat.key ? "bg-jeon-sidebar text-white" : "bg-gray-100 text-app-muted hover:bg-gray-200"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          {visibleTiles.length === 0 ? (
            <p className="py-8 text-center text-sm text-app-muted">{t("dashboard.components.builderAddComponentModal.comingSoon")}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {visibleTiles.map((tile) => (
                <button
                  key={tile.type}
                  type="button"
                  onClick={() => onSelect(tile.type)}
                  aria-label={tile.label}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-app-surface-2"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-jmd border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                    <tile.Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-app-ink">{tile.label}</p>
                    <p className="truncate text-xs text-app-muted">{tile.description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
