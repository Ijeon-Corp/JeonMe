"use client";

import Image from "next/image";

import { useState } from "react";
import dynamic from "next/dynamic";
import { IconCheck, IconPlus, IconShoppingBag, IconX } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import type { DashboardProduct } from "@/lib/api-client";
import BlockPanelHeader from "@/components/dashboard/page/BlockPanelHeader";
import Toggle from "@/components/Toggle";

// CreateProductForm -- lihat catatan lengkap di komponen itu sendiri: blok
// "produk" memakai form BUAT PRODUK BARU yang SAMA PERSIS dengan menu
// Produk dashboard, dibungkus modal overlay baru di sini.
const CreateProductForm = dynamic(() => import("@/components/dashboard/products/CreateProductForm"));

// getBlockProductIds -- permintaan langsung pengguna, 12 September 2026
// ("bisa di atur per blok misal berisi 2 produk"): blok "produk" SEKARANG
// menyimpan `product_ids` (array, banyak produk sekaligus) alih-alih
// `product_id` tunggal -- fallback baca field lama di sini supaya blok
// yang sudah ada di staging (dibuat sebelum perubahan ini) tidak tiba-tiba
// kosong. Field lama TIDAK PERNAH ditulis lagi mulai sekarang (SELALU
// `product_ids`, cuma dibaca untuk kompatibilitas mundur).
//
// Diekstrak dari BuilderLeftPanel.tsx (12 September 2026, "full parity"
// mode Simple vs Builder) supaya ProdukBlockEditor bisa dipakai bersama
// dari dashboard/links/page.tsx JUGA -- signature diubah dari
// `(node: BuilderTreeNode)` jadi `(blockData)` langsung, satu-satunya field
// `node` yang sebenarnya dipakai, supaya tidak terikat tipe BuilderTreeNode
// yang cuma ada di jalur kode Builder.
export function getBlockProductIds(blockData: Record<string, unknown> | undefined): string[] {
  const ids = blockData?.product_ids as string[] | undefined;
  if (Array.isArray(ids)) return ids;
  const single = blockData?.product_id as string | undefined;
  return single ? [single] : [];
}

// ProdukBlockLayout -- 4 opsi tata letak blok "produk" (permintaan langsung
// pengguna 11 September 2026, dikonfirmasi via AskUserQuestion: "2 variasi
// Kartu + 2 variasi Baris") -- lihat fungsi render masing-masing di
// PagePreview.tsx (renderSingleProductCard/renderProductCardSmall/
// renderProductRowWithImage/renderProductListRow).
export type ProdukBlockLayout = "card_large" | "card_small" | "row_with_image" | "row_no_image";

export const PRODUK_LAYOUT_OPTIONS: { value: ProdukBlockLayout; labelKey: string }[] = [
  { value: "card_large", labelKey: "produkLayoutCardLarge" },
  { value: "card_small", labelKey: "produkLayoutCardSmall" },
  { value: "row_with_image", labelKey: "produkLayoutRowWithImage" },
  { value: "row_no_image", labelKey: "produkLayoutRowNoImage" },
];

// ProdukBlockEditor -- editor blok "produk" (permintaan langsung pengguna
// 10 September 2026, "harusnya ada blok produk isinya sama seperti mengisi
// di menu product... ada 3 pilihan"): pilih SATU/BANYAK produk existing
// dari daftar milik kreator, ATAU buat produk baru langsung lewat
// `CreateProductForm` (SAMA PERSIS alur menu Produk dashboard) dibungkus
// modal overlay baru (panel builder/daftar tautan terlalu sempit utk form
// penuh inline, pola styling sama `ManageProductModal.tsx`). Produk baru
// langsung terpilih (onProductCreated dipanggil PLUS ditambahkan ke
// product_ids via pemanggil) supaya kreator tidak perlu klik pilih lagi.
//
// String i18n di bawah SENGAJA TETAP memakai namespace
// "dashboard.pages.linksBuilder.produkXxx" walau komponen ini sekarang
// dipakai bersama dari dashboard/links/page.tsx (mode Simple) juga -- t()
// cuma lookup dictionary global, tidak terikat rute, jadi tidak perlu
// duplikasi string i18n baru hanya karena berpindah lokasi pemakaian.
export function ProdukBlockEditor({
  blockData,
  products,
  onToggleProduct,
  onProductCreated,
  onLayoutChange,
  onShowCategoryFilterChange,
}: {
  blockData: Record<string, unknown> | undefined;
  products: DashboardProduct[];
  onToggleProduct: (productId: string) => void;
  onProductCreated: (product: DashboardProduct) => void;
  onLayoutChange: (layout: ProdukBlockLayout) => void;
  // onShowCategoryFilterChange -- block_data.show_category_filter (chip
  // kategori utk pengunjung, lihat ProdukCategoryFilter.tsx); pola sama
  // onLayoutChange, tiap pemanggil mem-patch block_data-nya sendiri.
  onShowCategoryFilterChange: (show: boolean) => void;
}) {
  const { t } = useLocale();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // categories -- sama seperti dashboard/products/page.tsx: daftar kategori
  // UNIK dari produk yang sudah ada, dioper ke CreateProductForm supaya
  // field kategorinya jadi dropdown begitu kreator sudah pernah punya
  // kategori (lihat CategoryField di CreateProductForm.tsx).
  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort();
  const selectedIds = getBlockProductIds(blockData);
  const selectedProducts = selectedIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is DashboardProduct => !!p);
  const layout = (blockData?.layout as ProdukBlockLayout | undefined) ?? "card_large";
  // picking -- permintaan langsung pengguna, 11 September 2026 ("ketika
  // sudah pilih satu produk ya tampil 1 saja di blok nya"): daftar PENUH
  // (+ "Buat Produk Baru") SEBELUMNYA selalu tampil apa pun status
  // pilihan, memaksa kreator scroll ulang tiap kali membuka blok yang
  // sudah terisi -- panel HANYA menampilkan ringkasan produk terpilih
  // begitu sudah ada, daftar penuh cuma muncul lagi kalau kreator sengaja
  // klik "+ Tambah Produk" (atau belum pernah memilih apa pun). Susulan 12
  // September 2026 ("bisa di atur per blok misal berisi 2 produk"): daftar
  // SEKARANG multi-select (klik toggle, BUKAN auto-close begitu satu
  // diklik) -- kreator klik "Selesai" sendiri begitu selesai memilih
  // semuanya, supaya tidak perlu buka-tutup panel berkali-kali untuk tiap
  // produk.
  const [picking, setPicking] = useState(selectedIds.length === 0);
  // pickerCategory -- filter kategori di daftar pilih-produk (permintaan
  // langsung pengguna, 18 September 2026: "tambah filtering by kategori
  // jika menggunakan blok produk", sisi kreator). Murni state lokal, pola
  // sama dropdown kategori di dashboard/products/page.tsx.
  const [pickerCategory, setPickerCategory] = useState("");
  const pickerProducts = pickerCategory ? products.filter((p) => p.category === pickerCategory) : products;
  const showCategoryFilter = blockData?.show_category_filter === true;

  if (selectedProducts.length > 0 && !picking) {
    return (
      <div className="flex flex-col gap-3">
        <BlockPanelHeader
          icon={IconShoppingBag}
          title={t("dashboard.components.builderAddComponentModal.typeProduk")}
          subtitle={t("dashboard.pages.linksBuilder.produkSelectedSubtitle").replace("{n}", String(selectedProducts.length))}
        />
        <div className="flex flex-col gap-1.5">
          {selectedProducts.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border-2 border-jeon-purple bg-jeon-lavender/40 p-1.5">
              {p.cover_image_url ? (
                // Ukuran TETAP 32px (h-8 w-8 flex-shrink-0).
                <Image src={p.cover_image_url} alt="" width={32} height={32} className="h-8 w-8 flex-shrink-0 rounded-md object-cover" />
              ) : (
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-jeon-lavender/50">
                  <IconShoppingBag className="h-4 w-4 text-jeon-purple" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-app-ink">{p.name}</span>
                <span className="block text-[11px] text-app-muted">Rp {p.effective_price_idr.toLocaleString("id-ID")}</span>
              </span>
              <button
                type="button"
                onClick={() => onToggleProduct(p.id)}
                aria-label={t("dashboard.pages.linksBuilder.produkRemoveProduct").replace("{name}", p.name)}
                className="flex-shrink-0 text-app-muted hover:text-red-600"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
        >
          <IconPlus className="h-3.5 w-3.5" />
          {t("dashboard.pages.linksBuilder.produkAddMore")}
        </button>

        {/* Tata Letak -- 4 opsi, berlaku untuk SEMUA produk di blok ini
            (dikonfirmasi via AskUserQuestion: "2 variasi Kartu + 2 variasi
            Baris"). 2+ produk otomatis tersusun grid 2 kolom (lihat
            renderBuilderNode/renderLinkOrBlock, PagePreview.tsx) -- TIDAK
            ada pengaturan jumlah kolom terpisah (dikonfirmasi via
            AskUserQuestion). */}
        <div className="flex flex-col gap-1.5 rounded-xl bg-app-surface-2 p-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-app-muted">{t("dashboard.pages.linksBuilder.produkLayoutTitle")}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PRODUK_LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onLayoutChange(opt.value)}
                className={`rounded-lg border-2 px-2 py-1.5 text-[11px] font-bold ${
                  layout === opt.value ? "border-jeon-purple bg-jeon-lavender/40 text-jeon-purple" : "border-app-border bg-app-surface text-app-muted"
                }`}
              >
                {t(`dashboard.pages.linksBuilder.${opt.labelKey}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Filter kategori utk pengunjung -- block_data.show_category_filter,
            dirender ProdukCategoryFilter.tsx di halaman publik (chip hanya
            muncul kalau produk terpilih punya 2+ kategori, lihat hint). */}
        <div className="flex flex-col gap-1.5 rounded-xl bg-app-surface-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-app-muted">{t("dashboard.pages.linksBuilder.produkCategoryFilterTitle")}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-app-ink">{t("dashboard.pages.linksBuilder.produkCategoryFilterToggle")}</p>
            </div>
            <Toggle checked={showCategoryFilter} onChange={() => onShowCategoryFilterChange(!showCategoryFilter)} label={t("dashboard.pages.linksBuilder.produkCategoryFilterToggle")} />
          </div>
          <p className="text-[11px] text-app-muted">{t("dashboard.pages.linksBuilder.produkCategoryFilterHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <BlockPanelHeader
        icon={IconShoppingBag}
        title={t("dashboard.components.builderAddComponentModal.typeProduk")}
        subtitle={t("dashboard.components.builderAddComponentModal.typeProdukDesc")}
      />
      <p className="text-[11px] font-semibold text-app-muted">{t("dashboard.pages.linksBuilder.produkSelectExisting")}</p>
      {categories.length > 0 && (
        <select
          value={pickerCategory}
          onChange={(e) => setPickerCategory(e.target.value)}
          aria-label={t("dashboard.pages.linksBuilder.produkPickerFilterLabel")}
          className="rounded-lg border border-app-border bg-app-surface px-2.5 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
        >
          <option value="">{t("dashboard.pages.products.allCategories")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      {products.length === 0 ? (
        <p className="text-xs text-app-muted">{t("dashboard.pages.linksBuilder.produkNoProducts")}</p>
      ) : (
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {pickerProducts.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggleProduct(p.id)}
                className={`flex items-center gap-2 rounded-lg border-2 p-1.5 text-left ${
                  isSelected ? "border-jeon-purple bg-jeon-lavender/40" : "border-app-border hover:border-jeon-purple"
                }`}
              >
                {p.cover_image_url ? (
                  // Ukuran TETAP 32px (h-8 w-8 flex-shrink-0).
                  <Image src={p.cover_image_url} alt="" width={32} height={32} className="h-8 w-8 flex-shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-jeon-lavender/50">
                    <IconShoppingBag className="h-4 w-4 text-jeon-purple" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-app-ink">{p.name}</span>
                  <span className="block text-[11px] text-app-muted">Rp {p.effective_price_idr.toLocaleString("id-ID")}</span>
                </span>
                {isSelected && <IconCheck className="h-4 w-4 flex-shrink-0 text-jeon-purple" />}
              </button>
            );
          })}
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
      <button
        type="button"
        onClick={() => setPicking(false)}
        disabled={selectedIds.length === 0}
        className="text-center text-[11px] font-semibold text-app-muted underline disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("dashboard.pages.linksBuilder.produkDone")}
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
              categories={categories}
              onCreated={(product) => {
                setCreating(false);
                setPicking(false);
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
