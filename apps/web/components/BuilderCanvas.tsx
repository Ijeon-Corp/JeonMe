"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DashboardProduct, LinkItem, MyPage } from "@/lib/api-client";
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
export type BuilderDeviceWidth = keyof typeof BUILDER_DEVICE_WIDTHS;

export default function BuilderCanvas({
  page,
  links,
  products,
  pageType,
  pageSlug,
}: {
  page: MyPage | null;
  links: LinkItem[];
  products: DashboardProduct[];
  pageType?: "bio" | "landing";
  pageSlug?: string;
}) {
  const { t } = useLocale();
  const [device, setDevice] = useState<BuilderDeviceWidth>("desktop");
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const deviceWidthPx = BUILDER_DEVICE_WIDTHS[device];
    const observer = new ResizeObserver((entries) => {
      const available = entries[0]?.contentRect.width ?? deviceWidthPx;
      // Sisakan sedikit ruang (32px) supaya bingkai kanvas tidak mepet ke
      // tepi kontainer scroll saat zoom=1 (perangkat "mobile" pas persis
      // dengan panel sempit).
      setZoom(Math.min(1, Math.max(0.2, (available - 32) / deviceWidthPx)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [device]);

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
            <div className="overflow-hidden rounded-jmd border-2 border-jeon-ink bg-app-surface shadow-card">
              <PagePreview
                interactive={false}
                rootClassName="min-h-[640px]"
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
