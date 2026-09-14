import { CatalogItem, EmbeddedCatalogBlock } from "@/lib/api-client";
import { IconBook, IconGrid, IconMapPin, IconPlayCircle, IconShoppingBag, IconTextLines } from "@/components/icons";

// catalog-blocks.ts -- diekstrak dari components/CatalogBlocksEditor.tsx, 6
// September 2026 (permintaan langsung pengguna: "saya mau jika ada blok di
// dalam blok buat workflow nya sama seperti di linktree jadi di klik blok
// nya lalu masuk ke dalam blok nya baru bisa edit isinya" -- lihat
// components/BlockDrilldownEditor.tsx untuk UI drill-down barunya). File ini
// MURNI logika (tipe, konstanta, helper array), TANPA JSX, supaya dipakai
// bersama oleh editor drill-down baru DAN (sementara masih ada di balik flag
// `page_builder`, dashboard-flags.ts) CatalogBlocksEditor.tsx lama -- satu
// sumber kebenaran, bukan disalin dua kali.
//
// maxCatalogDepth/maxCatalogItemBlocks/maxCatalogItems/maxCatalogImagesPerItem
// -- SATU sumber kebenaran ANGKA di sisi frontend, nilai SAMA PERSIS dengan
// batas backend (links.go: maxCatalogDepth, maxCatalogItemBlocks,
// maxCatalogItems, maxCatalogImagesPerItem) -- murni untuk UI (nonaktifkan
// tombol lebih awal), backend tetap satu-satunya penegak validasi
// sesungguhnya. maxCatalogItems/maxCatalogImagesPerItem sebelumnya duplikat
// di dashboard/links/page.tsx -- dipindah ke sini supaya tidak dua tempat.
export const maxCatalogDepth = 5;
export const maxCatalogItemBlocks = 10;
export const maxCatalogItems = 20;
export const maxCatalogImagesPerItem = 6;

export type FaqQA = { question: string; answer: string };

export type EmbeddableTypeOption = {
  type: EmbeddedCatalogBlock["block_type"];
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  premiumOnly?: boolean;
};

// buildEmbeddableTypes -- fungsi (bukan konstanta modul), mengikuti pola
// buildNavItems() di dashboard/layout.tsx: dipanggil ulang tiap render di
// dalam komponen yang sudah punya akses ke t(), supaya label tipe blok ikut
// berganti bahasa.
export function buildEmbeddableTypes(t: (key: string) => string): EmbeddableTypeOption[] {
  return [
    { type: "text", label: t("dashboard.components.catalogBlocksEditor.typeText"), Icon: IconTextLines },
    { type: "faq", label: t("dashboard.components.catalogBlocksEditor.typeFaq"), Icon: IconBook },
    { type: "video", label: t("dashboard.components.catalogBlocksEditor.typeVideo"), Icon: IconPlayCircle },
    { type: "maps", label: t("dashboard.components.catalogBlocksEditor.typeMaps"), Icon: IconMapPin },
    { type: "produk", label: t("dashboard.components.catalogBlocksEditor.typeProduk"), Icon: IconShoppingBag },
    { type: "catalog", label: t("dashboard.components.catalogBlocksEditor.typeCatalog"), Icon: IconGrid, premiumOnly: true },
  ];
}

export function emptyBlockData(type: EmbeddedCatalogBlock["block_type"]): Record<string, unknown> {
  switch (type) {
    case "faq":
      return { items: [{ question: "", answer: "" }] };
    case "produk":
      return { product_ids: [], layout: "card_large" };
    case "catalog":
      return { items: [] };
    default:
      return {};
  }
}

// --- Navigasi path-based (dipakai BlockDrilldownEditor.tsx) ---
//
// Seg -- satu "hop" dari root (block_data blok Katalog teratas) turun ke
// node bersarang. Mencerminkan dua jenis array yang ada di data:
// CatalogItem[] (dilewati lewat {kind:"item"}) dan EmbeddedCatalogBlock[]
// (lewat {kind:"block"}). Keduanya sudah punya id buatan klien
// (crypto.randomUUID(), divalidasi unik oleh backend) jadi aman dipakai
// sebagai kunci pencarian di tiap tingkat.
//
// SENGAJA path-based, BUKAN menyimpan snapshot array di tiap frame
// navigasi -- snapshot adalah sumber bug nyata di editor: frame yang
// didorong ke tumpukan pada waktu T menyimpan salinan array, field DI FRAME
// LAIN autosave (onBlur) pada waktu T+1 mengganti array yang sama di
// server, lalu frame lama menyimpan balik salinan basi miliknya sendiri dan
// diam-diam menimpa perubahan yang lebih baru. Path selalu di-resolve ULANG
// dari `link.block_data` langsung saat render, jadi frame manapun selalu
// melihat data terbaru.
export type CatalogSeg = { kind: "item"; id: string } | { kind: "block"; id: string };

export type CatalogRoot = { items?: CatalogItem[] };

export interface ResolvedCatalogNode {
  item?: CatalogItem;
  block?: EmbeddedCatalogBlock;
}

// resolveAt -- jalan-jalan `path` (WAJIB panjang >= 1, lihat getCatalogItems
// utk path=[] alias root) dari `root`. Mengembalikan undefined kalau ada
// satu hop saja yang tidak ketemu (item/blok sudah dihapus, atau rollback
// simpan gagal) -- pemanggil (BlockDrilldownEditor) bertanggung jawab
// menampilkan "item ini sudah tidak ada" & memangkas tumpukan, BUKAN
// meng-crash.
export function resolveAt(root: CatalogRoot, path: CatalogSeg[]): ResolvedCatalogNode | undefined {
  if (path.length === 0) return undefined;
  let items = root.items ?? [];
  let blocks: EmbeddedCatalogBlock[] = [];
  let node: ResolvedCatalogNode | undefined;

  for (const seg of path) {
    if (seg.kind === "item") {
      const item = items.find((it) => it.id === seg.id);
      if (!item) return undefined;
      node = { item };
      blocks = item.blocks ?? [];
    } else {
      const block = blocks.find((b) => b.id === seg.id);
      if (!block) return undefined;
      node = { block };
      items = (block.block_data?.items as CatalogItem[] | undefined) ?? [];
    }
  }
  return node;
}

// updateAt -- immutable: menyalin setiap array di sepanjang `path`, lalu
// mengembalikan SELURUH `root` baru dengan node di ujung path digantikan
// hasil `updater(node)`. Kontrak ini SAMA PERSIS dengan yang sudah ada di
// CatalogBlocksEditor.tsx lama ("onChange mengganti array milik levelnya
// sendiri, menggelembung ke atas sampai ke saveCatalogItems") -- cuma
// diekspresikan sebagai satu path-walk, bukan rantai closure onChange
// bersarang. Pemanggil di links/page.tsx tetap memanggil
// saveCatalogItems(link, newRoot.items) seperti sekarang -- tidak ada
// perubahan kontrak jaringan sama sekali.
export function updateAt(
  root: CatalogRoot,
  path: CatalogSeg[],
  updater: (node: CatalogItem | EmbeddedCatalogBlock) => CatalogItem | EmbeddedCatalogBlock
): CatalogRoot {
  if (path.length === 0) throw new Error("updateAt: path tidak boleh kosong (lihat setCatalogItems utk root)");

  function walkItems(items: CatalogItem[], segs: CatalogSeg[]): CatalogItem[] {
    const [seg, ...rest] = segs;
    if (seg.kind !== "item") throw new Error("updateAt: path tidak valid (harapkan segmen item)");
    return items.map((it) => {
      if (it.id !== seg.id) return it;
      if (rest.length === 0) return updater(it) as CatalogItem;
      return { ...it, blocks: walkBlocks(it.blocks ?? [], rest) };
    });
  }

  function walkBlocks(blocks: EmbeddedCatalogBlock[], segs: CatalogSeg[]): EmbeddedCatalogBlock[] {
    const [seg, ...rest] = segs;
    if (seg.kind !== "block") throw new Error("updateAt: path tidak valid (harapkan segmen block)");
    return blocks.map((b) => {
      if (b.id !== seg.id) return b;
      if (rest.length === 0) return updater(b) as EmbeddedCatalogBlock;
      const nestedItems = (b.block_data?.items as CatalogItem[] | undefined) ?? [];
      return { ...b, block_data: { ...b.block_data, items: walkItems(nestedItems, rest) } };
    });
  }

  return { ...root, items: walkItems(root.items ?? [], path) };
}

// getCatalogItems/setCatalogItems -- baca/ganti daftar CatalogItem[] yang
// sedang "dilihat" di frame `catalogItems` mana pun: path=[] berarti daftar
// item PALING ATAS (root.items langsung), path yang berakhir di
// {kind:"block"} berarti `items[]` milik blok tertanam bertipe "catalog" itu
// (katalog di dalam katalog, rekursif).
export function getCatalogItems(root: CatalogRoot, path: CatalogSeg[]): CatalogItem[] {
  if (path.length === 0) return root.items ?? [];
  const resolved = resolveAt(root, path);
  return (resolved?.block?.block_data?.items as CatalogItem[] | undefined) ?? [];
}

export function setCatalogItems(root: CatalogRoot, path: CatalogSeg[], items: CatalogItem[]): CatalogRoot {
  if (path.length === 0) return { ...root, items };
  return updateAt(root, path, (node) => {
    const block = node as EmbeddedCatalogBlock;
    return { ...block, block_data: { ...block.block_data, items } };
  });
}

// getBlocks/setBlocks -- baca/ganti `blocks[]` (blok tertanam) milik SATU
// item katalog. `itemPath` WAJIB berakhir di {kind:"item"}.
export function getBlocks(root: CatalogRoot, itemPath: CatalogSeg[]): EmbeddedCatalogBlock[] {
  return resolveAt(root, itemPath)?.item?.blocks ?? [];
}

export function setBlocks(root: CatalogRoot, itemPath: CatalogSeg[], blocks: EmbeddedCatalogBlock[]): CatalogRoot {
  return updateAt(root, itemPath, (node) => ({ ...(node as CatalogItem), blocks }));
}
