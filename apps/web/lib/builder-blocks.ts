import type { EmbeddedBuilderBlock } from "@/lib/api-client";

// builder-blocks.ts -- Canvas Page Builder (migrasi 000096, permintaan
// langsung pengguna 7 September 2026, dua screenshot Lynk.id): mode edit
// KEDUA bergaya kanvas Section/Column freeform, hidup berdampingan dengan
// editor daftar vertikal sederhana yang sudah ada. File ini generalisasi
// PERSIS pola navigasi path-based di lib/catalog-blocks.ts (resolveAt/
// updateAt, diekstrak dari CatalogBlocksEditor 6 September 2026) ke bentuk
// kontainer freeform Section/Column -- MURNI logika (tipe, konstanta,
// helper), TANPA JSX, dikonsumsi BuilderCanvas.tsx & BuilderLeftPanel.tsx.
//
// Beda bentuk dari catalog: catalog berselang-seling DUA tipe array
// (CatalogItem[] lewat {kind:"item"}, EmbeddedCatalogBlock[] lewat
// {kind:"block"}). Section/Column cuma satu tipe node (EmbeddedBuilderBlock,
// SAMA PERSIS bentuk EmbeddedCatalogBlock tapi allowlist block_type beda,
// lihat api-client.ts) PLUS satu tipe kontainer tanpa id (BuilderColumn --
// entri columns[] Column, cuma widthPercent+children, bukan node
// ber-block_type sendiri) -- makanya BuilderSeg py 2 varian: {kind:"child"}
// (by id, ke EmbeddedBuilderBlock) dan {kind:"column"} (by index, ke
// BuilderColumn).
//
// Modul ini beroperasi pada SATU root: block_data milik SATU baris `links`
// root bertipe "section" ({children}) atau "column" ({columns}) --
// PERSIS bentuk yang divalidasi validateBuilderChildren/case "column"
// (links.go). Root-level (baris `links` itu sendiri -- reorder/create/
// delete blok teratas) TETAP lewat endpoint links yang sudah ada
// (reorderLinks/createBlock/deleteLink), TIDAK lewat modul ini -- modul
// ini cuma untuk navigasi & edit KONTEN DI DALAM satu Section/Column.

// maxBuilderDepth/maxBuilderContainerChildren/minBuilderColumns/
// maxBuilderColumns -- SATU sumber kebenaran ANGKA di sisi frontend,
// nilai SAMA PERSIS batas backend (links.go) -- murni utk UI (nonaktifkan
// tombol lebih awal), backend tetap satu-satunya penegak validasi
// sesungguhnya.
export const maxBuilderDepth = 4;
export const maxBuilderContainerChildren = 30;
export const minBuilderColumns = 2;
export const maxBuilderColumns = 4;

export interface BuilderColumn {
  widthPercent?: number;
  children?: EmbeddedBuilderBlock[];
}

// BuilderRoot -- block_data SATU baris `links` root. Cuma satu dari dua
// field yang benar-benar terisi tergantung block_type baris itu (Section
// -> children, Column -> columns) -- keduanya opsional di sini murni
// supaya satu tipe dipakai untuk keduanya.
export type BuilderRoot = { children?: EmbeddedBuilderBlock[]; columns?: BuilderColumn[] };

// BuilderSeg -- satu "hop" turun dari root ke node bersarang.
// {kind:"child"} melangkah ke satu entri children[] (dipakai children
// Section MAUPUN children milik SATU kolom). {kind:"column"} melangkah
// ke satu entri columns[] (dipakai root Column atau Column yang tertanam)
// -- kalau path belum berakhir di situ, HARUS diikuti {kind:"child"} lagi
// (kolom sendiri bukan node ber-id, cuma wadah widthPercent+children).
export type BuilderSeg = { kind: "child"; id: string } | { kind: "column"; index: number };

function childrenOf(block: EmbeddedBuilderBlock): EmbeddedBuilderBlock[] {
  return (block.block_data?.children as EmbeddedBuilderBlock[] | undefined) ?? [];
}

function columnsOf(block: EmbeddedBuilderBlock): BuilderColumn[] {
  return (block.block_data?.columns as BuilderColumn[] | undefined) ?? [];
}

// resolveAt -- lihat catatan lengkap di catalog-blocks.ts: SENGAJA
// path-based, BUKAN menyimpan snapshot array di tiap frame navigasi --
// snapshot adalah sumber bug nyata (autosave onBlur di frame lain bisa
// menimpa balik data basi). Path yang berakhir di segmen {kind:"column"}
// TIDAK resolve ke node apa pun (kolom bukan node ber-id) -- pemanggil
// yang butuh isi kolom itu pakai getChildrenAt.
export function resolveAt(root: BuilderRoot, path: BuilderSeg[]): EmbeddedBuilderBlock | undefined {
  if (path.length === 0) return undefined;
  let childPool: EmbeddedBuilderBlock[] = root.children ?? [];
  let columnPool: BuilderColumn[] = root.columns ?? [];
  let node: EmbeddedBuilderBlock | undefined;

  for (const seg of path) {
    if (seg.kind === "child") {
      const found = childPool.find((c) => c.id === seg.id);
      if (!found) return undefined;
      node = found;
      childPool = childrenOf(found);
      columnPool = columnsOf(found);
    } else {
      const col = columnPool[seg.index];
      if (!col) return undefined;
      node = undefined;
      childPool = col.children ?? [];
      columnPool = [];
    }
  }
  return node;
}

// updateAt -- immutable, kontrak SAMA PERSIS catalog-blocks.ts: menyalin
// tiap array di sepanjang `path`, mengembalikan SELURUH root baru dengan
// node/kolom di ujung path digantikan hasil `updater(...)`. `updater`
// menerima EmbeddedBuilderBlock kalau path berakhir {kind:"child"}, atau
// BuilderColumn kalau berakhir {kind:"column"} -- pemanggil membedakan
// lewat keberadaan field `block_type` (BuilderColumn tidak punya).
export function updateAt(
  root: BuilderRoot,
  path: BuilderSeg[],
  updater: (node: EmbeddedBuilderBlock | BuilderColumn) => EmbeddedBuilderBlock | BuilderColumn
): BuilderRoot {
  if (path.length === 0) throw new Error("updateAt: path tidak boleh kosong");

  function walkChildren(children: EmbeddedBuilderBlock[], segs: BuilderSeg[]): EmbeddedBuilderBlock[] {
    const [seg, ...rest] = segs;
    if (seg.kind !== "child") throw new Error("updateAt: path tidak valid (harapkan segmen child)");
    return children.map((c) => {
      if (c.id !== seg.id) return c;
      if (rest.length === 0) return updater(c) as EmbeddedBuilderBlock;
      return walkInto(c, rest);
    });
  }

  function walkColumns(columns: BuilderColumn[], segs: BuilderSeg[]): BuilderColumn[] {
    const [seg, ...rest] = segs;
    if (seg.kind !== "column") throw new Error("updateAt: path tidak valid (harapkan segmen column)");
    return columns.map((col, i) => {
      if (i !== seg.index) return col;
      if (rest.length === 0) return updater(col) as BuilderColumn;
      return { ...col, children: walkChildren(col.children ?? [], rest) };
    });
  }

  function walkInto(node: EmbeddedBuilderBlock, segs: BuilderSeg[]): EmbeddedBuilderBlock {
    if (segs[0].kind === "child") {
      return { ...node, block_data: { ...node.block_data, children: walkChildren(childrenOf(node), segs) } };
    }
    return { ...node, block_data: { ...node.block_data, columns: walkColumns(columnsOf(node), segs) } };
  }

  if (path[0].kind === "child") return { ...root, children: walkChildren(root.children ?? [], path) };
  return { ...root, columns: walkColumns(root.columns ?? [], path) };
}

// getChildrenAt/setChildrenAt -- baca/ganti children[] yang sedang
// "dilihat" di kanvas pada `path`: path=[] berarti children PALING ATAS
// milik root itu sendiri, path berakhir {kind:"child"} berarti children
// Section tertanam di node itu, path berakhir {kind:"column"} berarti
// children milik SATU kolom itu.
export function getChildrenAt(root: BuilderRoot, path: BuilderSeg[]): EmbeddedBuilderBlock[] {
  if (path.length === 0) return root.children ?? [];
  const last = path[path.length - 1];
  if (last.kind === "column") {
    const parentPath = path.slice(0, -1);
    const parentNode = parentPath.length === 0 ? undefined : resolveAt(root, parentPath);
    const columnPool = parentPath.length === 0 ? (root.columns ?? []) : parentNode ? columnsOf(parentNode) : [];
    return columnPool[last.index]?.children ?? [];
  }
  const node = resolveAt(root, path);
  return node ? childrenOf(node) : [];
}

export function setChildrenAt(root: BuilderRoot, path: BuilderSeg[], children: EmbeddedBuilderBlock[]): BuilderRoot {
  if (path.length === 0) return { ...root, children };
  return updateAt(root, path, (node) => {
    if ("block_type" in node) {
      return { ...node, block_data: { ...node.block_data, children } };
    }
    return { ...node, children };
  });
}

// getColumnsAt/setColumnsAt -- baca/ganti columns[] milik SATU node
// Column (path berakhir {kind:"child"} menunjuk node Column itu, atau
// path=[] kalau root ITU SENDIRI adalah block_data Column).
export function getColumnsAt(root: BuilderRoot, path: BuilderSeg[]): BuilderColumn[] {
  if (path.length === 0) return root.columns ?? [];
  const node = resolveAt(root, path);
  return node ? columnsOf(node) : [];
}

export function setColumnsAt(root: BuilderRoot, path: BuilderSeg[], columns: BuilderColumn[]): BuilderRoot {
  if (path.length === 0) return { ...root, columns };
  return updateAt(root, path, (node) => {
    const block = node as EmbeddedBuilderBlock;
    return { ...block, block_data: { ...block.block_data, columns } };
  });
}

// emptyBuilderBlockData/newBuilderBlock -- shell kosong dulu, diisi
// belakangan lewat klik-utk-edit di kanvas (pola sama gallery/audio/file
// & catalog) -- "column" SENGAJA dibuatkan minBuilderColumns (2) kolom
// kosong bawaan supaya kanvas langsung punya slot drop yang jelas,
// tipe lain (text/button/divider/section) mulai benar-benar kosong.
export function emptyBuilderBlockData(type: EmbeddedBuilderBlock["block_type"]): Record<string, unknown> {
  if (type === "column") {
    return { columns: Array.from({ length: minBuilderColumns }, () => ({ children: [] })) };
  }
  return {};
}

export function newBuilderBlock(type: EmbeddedBuilderBlock["block_type"], title = ""): EmbeddedBuilderBlock {
  return {
    id: crypto.randomUUID(),
    block_type: type,
    title,
    block_data: emptyBuilderBlockData(type),
  };
}
