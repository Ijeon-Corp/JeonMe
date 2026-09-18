import type { BuilderSeg, EmbeddedBuilderBlock, LinkItem } from "@/lib/api-client";

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

// BuilderSeg -- didefinisikan di api-client.ts (BUKAN di sini) supaya
// bisa dipakai fungsi upload gambar builder (uploadGalleryImage/
// uploadBuilderMediaImage, Fase 2) TANPA import melingkar -- api-client.ts
// tidak pernah mengimpor dari file lib/ lain (arah dependency di repo ini
// selalu sebaliknya), jadi tipe bersama ini harus tinggal di sana.
// Diekspor ulang di sini (re-export) supaya kode yang SUDAH mengimpor
// BuilderSeg dari modul ini tidak perlu berubah.
//
// Cermin PERSIS builderPathSeg (Go, links.go): satu "hop" turun dari root
// ke node bersarang. {kind:"child"} melangkah ke satu entri children[]
// (dipakai children Section MAUPUN children milik SATU kolom).
// {kind:"column"} melangkah ke satu entri columns[] (dipakai root Column
// atau Column yang tertanam) -- kalau path belum berakhir di situ, HARUS
// diikuti {kind:"child"} lagi (kolom sendiri bukan node ber-id, cuma
// wadah widthPercent+children).
export type { BuilderSeg };

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

// BuilderSelection/BuilderTreeNode/buildTree/findNodeByPath/selectionOf --
// dipindah dari components/BuilderLeftPanel.tsx (permintaan langsung
// pengguna 9 September 2026, "klik blok di kanvas juga, bukan cuma di
// tree kiri"): supaya BuilderCanvas.tsx (klik DOM) & BuilderLeftPanel.tsx
// (klik tree) & rute builder (state seleksi dinaikkan ke sana) semua
// mengacu SATU bentuk pohon & SATU bentuk seleksi, badan fungsi APA
// ADANYA cuma dipindah lokasi + diekspor.
export interface BuilderSelection {
  rootId: string;
  path: BuilderSeg[];
  kind: "block" | "column-slot";
  blockType?: string;
}

export interface BuilderTreeNode {
  id: string;
  rootId: string;
  path: BuilderSeg[];
  kind: "block" | "column-slot";
  title: string;
  blockType?: string;
  url?: string;
  description?: string;
  blockData?: Record<string, unknown>;
  // isActive -- HANYA root (baris `links` punya kolom is_active; blok
  // bersarang murni JSON tanpa status sendiri). Perbaikan Builder 18
  // September 2026: sebelumnya TIDAK ADA cara menonaktifkan blok di
  // Builder selain menghapusnya -- sekarang ada di menu ⋮ baris root.
  isActive?: boolean;
  children: BuilderTreeNode[];
}

// BuilderNodePatch -- patch draft SATU node (root maupun bersarang) yang
// dipahami handleUpdateNode (app/builder/[pageId]/page.tsx). Diekstrak jadi
// tipe bersama (18 September 2026) karena sebelumnya bentuk objek ini
// disalin literal di 4 tanda tangan berbeda; `isActive` hanya berlaku utk
// root (diabaikan utk node bersarang, lihat catatan BuilderTreeNode.isActive).
export interface BuilderNodePatch {
  title?: string;
  url?: string;
  description?: string;
  blockData?: Record<string, unknown>;
  isActive?: boolean;
}

function buildChildNodes(rootId: string, parentPath: BuilderSeg[], children: EmbeddedBuilderBlock[]): BuilderTreeNode[] {
  return children.map((child) =>
    buildBlockNode(rootId, [...parentPath, { kind: "child", id: child.id }], child.id, child.block_type, child.title, child.url, child.description, child.block_data)
  );
}

function buildBlockNode(
  rootId: string,
  path: BuilderSeg[],
  id: string,
  blockType: string,
  title: string,
  url: string | undefined,
  description: string | undefined,
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
  return { id, rootId, path, kind: "block", title, blockType, url, description, blockData: data, children };
}

export function buildTree(links: LinkItem[]): BuilderTreeNode[] {
  return links.map((link) => ({
    ...buildBlockNode(link.id, [], link.id, link.block_type, link.title, link.url, link.description, link.block_data),
    isActive: link.is_active,
  }));
}

// findNodeByPath -- pencarian rekursif SATU node persis (rootId+path),
// dipakai baik utk resolve node terpilih MAUPUN resolve node induk saat
// drag-end (lihat siblingsOf, BuilderLeftPanel.tsx).
export function findNodeByPath(nodes: BuilderTreeNode[], rootId: string, path: BuilderSeg[]): BuilderTreeNode | null {
  for (const n of nodes) {
    if (n.rootId === rootId && JSON.stringify(n.path) === JSON.stringify(path)) return n;
    const found = findNodeByPath(n.children, rootId, path);
    if (found) return found;
  }
  return null;
}

export function selectionOf(node: BuilderTreeNode): BuilderSelection {
  return { rootId: node.rootId, path: node.path, kind: node.kind, blockType: node.blockType };
}

// findSelectionByNodeId -- resolve id blok DOM (data-builder-node-id, lihat
// PagePreview.tsx) jadi BuilderSelection, dipakai BuilderCanvas.tsx saat
// pengguna klik LANGSUNG di kanvas (bukan di tree kiri) -- telusuri pohon
// yang sama dipakai tree kiri supaya kedua jalur seleksi selalu konsisten.
export function findSelectionByNodeId(tree: BuilderTreeNode[], nodeId: string): BuilderSelection | null {
  for (const n of tree) {
    if (n.id === nodeId) return selectionOf(n);
    const found = findSelectionByNodeId(n.children, nodeId);
    if (found) return found;
  }
  return null;
}
