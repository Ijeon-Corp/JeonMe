"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DashboardProduct, LinkItem, MyPage, PageStickerData } from "@/lib/api-client";
import { toPreviewData } from "@/lib/page-preview-data";
import { useLocale } from "@/lib/locale-context";

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
  selectedNodeId,
  onSelectNode,
  editableStickers,
  onStickersChange,
}: {
  page: MyPage | null;
  links: LinkItem[];
  products: DashboardProduct[];
  pageType?: "bio" | "landing" | "produk";
  pageSlug?: string;
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
  onSelectNode?: (nodeId: string) => void;
  // editableStickers/onStickersChange -- Bagian 2 (design langsung di
  // builder): diteruskan APA ADANYA ke PagePreview, yang sudah punya
  // seluruh logic drag/resize (StickerOverlay) -- aktif hanya saat
  // sub-tab desain "Stiker" dipilih di induk.
  editableStickers?: boolean;
  onStickersChange?: (stickers: PageStickerData[]) => void;
}) {
  const { t } = useLocale();
  const [device, setDevice] = useState<BuilderDeviceWidth>("desktop");
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

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
    if (el) onSelectNode(el.getAttribute("data-builder-node-id")!);
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="mb-3 flex flex-shrink-0 items-center justify-center gap-1.5">
        {(Object.keys(BUILDER_DEVICE_WIDTHS) as BuilderDeviceWidth[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setDevice(key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              device === key ? "bg-jeon-sidebar text-white" : "bg-gray-100 text-app-muted hover:bg-gray-200"
            }`}
          >
            {t(`dashboard.pages.linksBuilder.device.${key}`)}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="min-h-0 min-w-0 flex-1 overflow-auto rounded-jmd border-2 border-jeon-ink bg-gray-100 p-4">
        {page && (
          <div className="mx-auto [-ms-overflow-style:none] [scrollbar-width:none]" style={{ width: BUILDER_DEVICE_WIDTHS[device], zoom }}>
            <div
              className="overflow-y-auto overflow-x-hidden rounded-jmd border-2 border-jeon-ink bg-app-surface shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ height: BUILDER_DEVICE_HEIGHTS[device] }}
              onClick={handleCanvasClick}
            >
              <PagePreview
                interactive={false}
                rootClassName="min-h-full"
                selectedNodeId={selectedNodeId}
                editableStickers={editableStickers}
                onStickersChange={onStickersChange}
                data={{
                  ...toPreviewData({ ...page, is_verified: page.verification.is_verified }, links, products),
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
