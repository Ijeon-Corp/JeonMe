"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GripVertical } from "lucide-react";
import { DashboardProduct, LinkItem, MyPage, PageStickerData } from "@/lib/api-client";
import { toPreviewData } from "@/lib/page-preview-data";

// BuilderCanvas -- Canvas Page Builder (migrasi 000096, permintaan langsung
// pengguna 7 September 2026, dua screenshot Lynk.id): FORK dari
// LivePreviewPanel.tsx, BUKAN modifikasi -- panel itu dipakai APA ADANYA
// oleh 3 halaman lain (Tautan/Produk/Desain) dengan kontrak fixed
// 280x580px/zoom:0.72/tanpa toggle perangkat yang sudah disetel lewat
// beberapa permintaan pengguna eksplisit sebelumnya. Kanvas builder
// sebaliknya SENGAJA besar (referensi Lynk.id: kanvas penuh di sisi kanan,
// bukan mockup kecil) dengan toggle lebar desktop/tablet/mobile.
//
// Trik `zoom` CSS yang sama dipertahankan (BUKAN transform:scale, alasan
// sama persis LivePreviewPanel: zoom ikut alur layout normal jadi tinggi
// otomatis mengikuti), tapi faktornya DINAMIS lewat ResizeObserver (ukur
// lebar panel yang benar-benar tersedia), bukan konstanta 0.72 tetap --
// supaya PagePreview versi PENUH selalu pas dengan lebar "perangkat" yang
// dipilih TANPA overflow horizontal, di lebar layar berapa pun panel ini
// diletakkan.
const PagePreview = dynamic(() => import("@/components/PagePreview"));

export const BUILDER_DEVICE_WIDTHS = { desktop: 1280, tablet: 768, mobile: 390 } as const;
// BUILDER_DEVICE_HEIGHTS -- permintaan langsung pengguna 9 September 2026
// ("batasi ukuran tampilan di builder supaya kalau banyak link tidak
// semakin panjang ke bawah"): SEBELUMNYA bingkai "perangkat" ini tidak
// pernah dibatasi tingginya sama sekali (cuma rootClassName="min-h-[640px]"
// di PagePreview, itu MINIMUM bukan MAKSIMUM) -- makin banyak blok, bingkai
// makin tinggi tanpa batas, bikin panel kanvas ikut membesar terus ke
// bawah. Nilai per perangkat MENIRU resolusi layar sungguhan (tablet
// 768x1024 = iPad potret, mobile 390x844 = iPhone 12/13/14, desktop
// 1280x800 = viewport laptop umum) -- begitu konten lebih panjang dari
// ini, scroll terjadi DI DALAM bingkai (lihat overflow-y-auto di bawah),
// persis seperti membuka halaman sungguhan di perangkat sungguhan.
const BUILDER_DEVICE_HEIGHTS = { desktop: 800, tablet: 1024, mobile: 844 } as const;
export type BuilderDeviceWidth = keyof typeof BUILDER_DEVICE_WIDTHS;

export default function BuilderCanvas({
  page,
  links,
  products,
  pageType,
  pageSlug,
  device,
  selectedNodeId,
  onSelectNode,
  editableStickers,
  onStickersChange,
  onReorderRoot,
}: {
  page: MyPage | null;
  links: LinkItem[];
  products: DashboardProduct[];
  pageType?: "bio" | "landing" | "produk";
  pageSlug?: string;
  // device -- redesain total (permintaan langsung pengguna 10 September
  // 2026, referensi "LYNK"): toggle perangkat DIPINDAH ke topbar rute
  // Builder (app/builder/[pageId]/page.tsx), sebelumnya baris tombol
  // berdiri sendiri di ATAS kanvas ini dengan state lokal `useState`
  // sendiri -- SEKARANG murni dikendalikan induk lewat prop supaya topbar
  // (di luar komponen ini) bisa menampilkannya di TENGAH, persis referensi.
  device: BuilderDeviceWidth;
  // selectedNodeId/onSelectNode -- permintaan langsung pengguna 9
  // September 2026 ("klik blok di kanvas juga, bukan cuma di tree kiri"):
  // sebelumnya kanvas ini 100% non-interactive, nol prop terkait seleksi --
  // renderBuilderNode/PagePreview.tsx SUDAH menandai tiap blok dengan
  // data-builder-node-id sejak Fase 1 tapi tidak pernah ada yang membaca
  // klik terhadapnya sampai sekarang. SATU listener delegasi di wrapper
  // kanvas (bukan listener per-blok) supaya tidak perlu menembus banyak
  // lapis komponen presentasional (VideoEmbedBlock/FaqBlock/dst) dengan
  // onClick masing-masing.
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string | null) => void;
  // editableStickers/onStickersChange -- Bagian 2 (design langsung di
  // builder): diteruskan APA ADANYA ke PagePreview, yang sudah punya
  // seluruh logic drag/resize (StickerOverlay) -- aktif hanya saat
  // sub-tab desain "Stiker" dipilih di induk.
  editableStickers?: boolean;
  onStickersChange?: (stickers: PageStickerData[]) => void;
  // onReorderRoot -- uxd-1 (audit UI/UX 21 September 2026, "drag-reorder
  // di kanvas"): SEBELUMNYA satu-satunya cara mengurutkan ulang blok
  // ROOT adalah drag di tree kiri (BuilderLeftPanel, dnd-kit) -- kanvas
  // ini 100% baca-saja soal urutan. Handle "⠿" di sini dipasang lewat
  // OVERLAY terpisah (lihat rootRects/RootDragOverlay di bawah), BUKAN
  // dengan menambah useSortable() di dalam PagePreview: PagePreview
  // dipakai apa adanya oleh banyak pemanggil lain & merender subtree
  // blok secara OPAK dari sudut pandang komponen ini (tidak ada titik
  // pas utk memasang hook dnd-kit per baris tanpa membedah render root-
  // levelnya) -- overlay yang mengukur posisi lewat getBoundingClientRect
  // jauh lebih aman drpd membedah PagePreview yang dipakai banyak
  // halaman lain. Direct-DOM (bukan dnd-kit) supaya tidak perlu
  // mendaftarkan setiap baris ke SortableContext, cukup baca
  // data-builder-node-id yang SUDAH ada. Reorder BERSARANG (di dalam
  // Section/Column) tetap hanya lewat tree kiri -- sama seperti tree
  // sendiri yang belum dukung drag lintas kontainer (Fase 1).
  onReorderRoot?: (orderedIds: string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const rootIds = links.map((l) => l.id);
  const rootIdsKey = rootIds.join(",");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const deviceWidthPx = BUILDER_DEVICE_WIDTHS[device];
    const deviceHeightPx = BUILDER_DEVICE_HEIGHTS[device];
    const observer = new ResizeObserver((entries) => {
      const availableWidth = entries[0]?.contentRect.width ?? deviceWidthPx;
      const availableHeight = entries[0]?.contentRect.height ?? deviceHeightPx;
      // fit BOTH lebar & tinggi (pola sama object-fit:"contain"), BUKAN
      // cuma lebar seperti sebelumnya -- bug ditemukan lewat feedback
      // pengguna atas screenshot referensi Lynk.id (9 September 2026,
      // "preview tampilan nya masih terlalu panjang kebawah"): zoom
      // berbasis LEBAR saja bisa balik jadi 1 (Tablet/Mobile pas persis
      // lebar panel) padahal TINGGI perangkat (1024/844px) tetap jauh
      // melebihi tinggi panel yang benar-benar tersedia, memaksa panel
      // abu-abu di luar ikut scroll vertikal cuma utk melihat seluruh
      // bingkai -- dua scrollbar bertumpuk (luar + dalam bingkai) terasa
      // berantakan. Dengan `contain`, seluruh bingkai SELALU pas terlihat
      // penuh di dalam panel tanpa perlu scroll luar sama sekali; scroll
      // DI DALAM bingkai (lihat overflow-y-auto) tetap jalan begitu
      // konten lebih panjang dari tinggi logis perangkat.
      const zoomByWidth = (availableWidth - 32) / deviceWidthPx;
      const zoomByHeight = (availableHeight - 32) / deviceHeightPx;
      setZoom(Math.min(1, Math.max(0.2, Math.min(zoomByWidth, zoomByHeight))));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [device]);

  // handleCanvasClick -- SATU listener delegasi di wrapper kanvas (bukan
  // per-blok, lihat catatan lengkap di prop onSelectNode di atas): cari
  // elemen berdata data-builder-node-id TERDEKAT dari target klik (naik
  // lewat DOM ancestor, `closest`) -- ini otomatis benar untuk blok
  // bersarang di dalam Section/Column (klik anak di dalamnya TIDAK
  // ketemu data-builder-node-id milik anak itu sendiri dulu sebelum milik
  // Section pembungkusnya, karena anak lebih dekat ke target klik).
  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSelectNode) return;
    const el = (e.target as HTMLElement).closest("[data-builder-node-id]");
    // Klik area kosong kanvas (tidak kena blok mana pun) -- bug ditemukan
    // lewat audit (13 September 2026): SEBELUMNYA tidak terjadi apa-apa
    // sama sekali di sini, padahal baris yang sama di tree kiri BISA
    // dilepas seleksinya dgn klik ulang -- kanvas jadi satu-satunya
    // tempat yang tidak konsisten. `null` melepas seleksi.
    onSelectNode(el ? el.getAttribute("data-builder-node-id")! : null);
  }

  // Scroll kanvas ke blok terpilih -- bug ditemukan lewat audit (13
  // September 2026): SEBELUMNYA memilih baris di tree kiri mengubah
  // `selectedNodeId` (ring ungu muncul di kanvas) tapi kanvas TIDAK
  // pernah ikut menggulir ke posisinya -- di halaman panjang, blok yang
  // baru dipilih bisa berada jauh di luar area kanvas yang sedang
  // terlihat, terasa seperti klik tree tidak berpengaruh sama sekali.
  // Arah SEBALIKNYA (klik di kanvas -> scroll tree kiri) diperbaiki
  // terpisah di BuilderLeftPanel.tsx. `block: "nearest"` -- tidak
  // memaksa blok yang SUDAH terlihat (mis. baru saja diklik langsung di
  // kanvas) melompat ke tengah, cuma menggulir kalau memang di luar
  // pandangan.
  useEffect(() => {
    if (!selectedNodeId) return;
    const el = containerRef.current?.querySelector(`[data-builder-node-id="${selectedNodeId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedNodeId]);

  // rootRects -- posisi tiap blok ROOT (relatif thd `containerRef`, sudah
  // termasuk faktor zoom karena dihitung dari getBoundingClientRect,
  // bukan offsetTop/Left mentah) dipakai utk menaruh handle "⠿" & garis
  // indikator drop TEPAT di atas tiap blok tanpa harus tahu struktur
  // DOM internal PagePreview -- lihat catatan lengkap di prop
  // onReorderRoot soal kenapa pendekatan overlay dipilih.
  const [rootRects, setRootRects] = useState<{ id: string; top: number; left: number; width: number; height: number }[]>([]);
  const dragStateRef = useRef<{ draggedId: string; rects: typeof rootRects } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // rootIdsRef/onReorderRootRef/reorderEnabled -- bug ditemukan lewat
  // Playwright live (BUKAN tsc/lint, keduanya bersih): "Maximum update
  // depth exceeded". `rootIds` adalah array BARU tiap render (`.map()`
  // di atas) & `onReorderRoot` juga referensi BARU tiap render (fungsi
  // polos di app/builder/[pageId]/page.tsx, bukan useCallback) -- keduanya
  // dipakai sbg dependency useCallback, jadi `recomputeRootRects` juga
  // ganti identitas tiap render, memicu useLayoutEffect di bawah lagi,
  // yang manggil setRootRects lagi, memicu render lagi... loop tanpa
  // akhir. Pola "latest ref" (diisi ULANG tiap render, BUKAN di useEffect,
  // supaya sudah pasti terbaru sebelum efek apa pun jalan) memutus
  // rantai ini -- recomputeRootRects sekarang identitasnya STABIL
  // selamanya ([] deps), baca nilai terbaru lewat ref.
  const rootIdsRef = useRef(rootIds);
  const onReorderRootRef = useRef(onReorderRoot);
  // react-hooks/refs (ESLint v7) melarang menulis ref LANGSUNG di badan
  // render -- diisi ulang di useLayoutEffect TANPA dependency array
  // (jalan tiap commit, urutan SEBELUM useLayoutEffect recompute di
  // bawah karena dideklarasikan lebih dulu) supaya tetap "selalu
  // terbaru" tanpa melanggar aturan itu.
  useLayoutEffect(() => {
    rootIdsRef.current = rootIds;
    onReorderRootRef.current = onReorderRoot;
  });
  const reorderEnabled = !!onReorderRoot;
  const lastRectsKeyRef = useRef("");

  const recomputeRootRects = useCallback(() => {
    const container = containerRef.current;
    if (!container || !onReorderRootRef.current) return;
    const containerRect = container.getBoundingClientRect();
    // Root = elemen data-builder-node-id yang TIDAK punya ancestor
    // data-builder-node-id lain -- blok bersarang (di dalam Section/
    // Column) otomatis tersaring keluar tanpa perlu tahu bentuk tree-nya.
    const allNodeEls = Array.from(container.querySelectorAll<HTMLElement>("[data-builder-node-id]"));
    const byId = new Map<string, HTMLElement>();
    for (const el of allNodeEls) {
      if (el.parentElement?.closest("[data-builder-node-id]")) continue;
      const id = el.getAttribute("data-builder-node-id");
      if (id) byId.set(id, el);
    }
    const next = rootIdsRef.current.flatMap((id) => {
      const el = byId.get(id);
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [
        {
          id,
          // Math.round -- getBoundingClientRect bisa berbeda sub-piksel
          // antar panggilan meski TIDAK ADA perubahan visual sungguhan
          // (akumulasi floating point) -- tanpa pembulatan, perbandingan
          // `key` di bawah (utk mencegah setState percuma) tidak pernah
          // sama persis, bikin MutationObserver terus memicu render baru.
          top: Math.round(r.top - containerRect.top - container.clientTop + container.scrollTop),
          left: Math.round(r.left - containerRect.left - container.clientLeft + container.scrollLeft),
          width: Math.round(r.width),
          height: Math.round(r.height),
        },
      ];
    });
    const key = JSON.stringify(next);
    if (key === lastRectsKeyRef.current) return;
    lastRectsKeyRef.current = key;
    setRootRects(next);
  }, []);

  useLayoutEffect(() => {
    recomputeRootRects();
  }, [recomputeRootRects, page, device, zoom, rootIdsKey]);

  useEffect(() => {
    if (!reorderEnabled) return;
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;
    const scheduleRecompute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recomputeRootRects);
    };
    const observer = new MutationObserver(scheduleRecompute);
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [recomputeRootRects, reorderEnabled]);

  function handleDragHandlePointerDown(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = { draggedId: id, rects: rootRects };
    setDraggingId(id);
    setDragOverIndex(rootIds.indexOf(id));
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleDragHandlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const state = dragStateRef.current;
    const container = containerRef.current;
    if (!state || !container) return;
    const containerRect = container.getBoundingClientRect();
    const pointerY = e.clientY - containerRect.top - container.clientTop + container.scrollTop;
    const others = state.rects.filter((r) => r.id !== state.draggedId);
    let idx = others.length;
    for (let i = 0; i < others.length; i++) {
      if (pointerY < others[i].top + others[i].height / 2) {
        idx = i;
        break;
      }
    }
    setDragOverIndex(idx);
  }

  function finishDrag() {
    const state = dragStateRef.current;
    if (state && dragOverIndex !== null && onReorderRoot) {
      const without = rootIds.filter((id) => id !== state.draggedId);
      without.splice(dragOverIndex, 0, state.draggedId);
      if (without.join(",") !== rootIdsKey) onReorderRoot(without);
    }
    dragStateRef.current = null;
    setDraggingId(null);
    setDragOverIndex(null);
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div ref={containerRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto rounded-jmd border-2 border-jeon-ink bg-gray-100 p-4">
        {onReorderRoot && rootRects.length > 1 && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {rootRects.map((r) => (
              <button
                key={r.id}
                type="button"
                title="Geser untuk urutkan ulang"
                aria-label="Geser untuk urutkan ulang blok"
                className={`pointer-events-auto absolute flex h-6 w-6 cursor-grab items-center justify-center rounded-md border bg-app-surface text-app-muted shadow-sm transition-colors hover:border-jeon-purple hover:text-jeon-purple active:cursor-grabbing ${
                  draggingId === r.id ? "z-20 border-jeon-purple text-jeon-purple opacity-100" : "border-app-border opacity-70"
                }`}
                style={{ top: r.top + 6, left: r.left + 6 }}
                onPointerDown={(e) => handleDragHandlePointerDown(e, r.id)}
                onPointerMove={handleDragHandlePointerMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
              >
                <GripVertical className="h-3.5 w-3.5" aria-hidden />
              </button>
            ))}
            {draggingId &&
              dragOverIndex !== null &&
              (() => {
                const others = rootRects.filter((r) => r.id !== draggingId);
                const width = rootRects[0]?.width ?? 0;
                const left = rootRects[0]?.left ?? 0;
                const top =
                  others.length === 0
                    ? (rootRects.find((r) => r.id === draggingId)?.top ?? 0)
                    : dragOverIndex >= others.length
                      ? others[others.length - 1].top + others[others.length - 1].height + 4
                      : others[dragOverIndex].top - 4;
                return <div className="absolute h-1 rounded-full bg-jeon-purple" style={{ top, left, width }} />;
              })()}
          </div>
        )}
        {page && (
          <div className="mx-auto [-ms-overflow-style:none] [scrollbar-width:none]" style={{ width: BUILDER_DEVICE_WIDTHS[device], zoom }}>
            {/* Scrollbar bingkai SENGAJA terlihat lagi (18 September 2026):
                sebelumnya disembunyikan total, sehingga konten di bawah
                lipatan bingkai tidak terlihat bisa digulir -- kreator
                mengira halamannya terpotong. `scrollbar-thin` (arbitrary
                property) supaya tetap tipis, tidak mengganggu tampilan
                "perangkat". */}
            <div
              className="overflow-y-auto overflow-x-hidden rounded-jmd border-2 border-jeon-ink bg-app-surface shadow-card [scrollbar-width:thin]"
              style={{ height: BUILDER_DEVICE_HEIGHTS[device] }}
              onClick={handleCanvasClick}
            >
              <PagePreview
                interactive={false}
                rootClassName="min-h-full"
                selectedNodeId={selectedNodeId}
                // isBuilderCanvas -- SATU-SATUNYA pemanggil PagePreview yang
                // boleh true (lihat catatan lengkap di prop yang sama pada
                // PagePreview.tsx): klik pada baris blok di sini memang
                // harus MEMILIH node (onClick={handleCanvasClick} di atas),
                // bukan membuka takeover Katalog penuh layar.
                isBuilderCanvas
                editableStickers={editableStickers}
                onStickersChange={onStickersChange}
                data={{
                  // includeInactiveProducts -- lihat catatan lengkap di
                  // toPreviewData (page-preview-data.ts): kanvas ini SELALU
                  // pratinjau MILIK KREATOR SENDIRI (interactive=false, tidak
                  // pernah dilihat pengunjung sungguhan), jadi blok "produk"
                  // yang baru memilih produk digital yang belum diaktifkan
                  // tetap harus terlihat, bukan jatuh ke placeholder kosong.
                  ...toPreviewData({ ...page, is_verified: page.verification.is_verified }, links, products, true, true),
                  pageType,
                  pageSlug,
                  builderMode: "builder",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
