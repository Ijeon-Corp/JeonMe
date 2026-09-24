"use client";

import { useRef, useState } from "react";
import { cardAvatarProxyURL, cardBackgroundProxyURL } from "@/lib/api-client";
import { QRCodeCanvas } from "qrcode.react";
import DigitalBusinessCard, { type BusinessCardData } from "@/components/DigitalBusinessCard";
import { renderBusinessCardPNG } from "@/lib/business-card-png";
import { IconClose, IconCopy, IconDownload, IconExternal } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";
import { useModalA11y } from "@/lib/use-modal-a11y";

// Pengganti QRCodeModal untuk Kartu Kontak (permintaan pengguna 3 September
// 2026): yang tampil kartu nama UTUH bertema Jeonme, bukan QR saja. QR
// tetap ada di dalam kartu, dan QRCodeCanvas tersembunyi hanya untuk
// mengambil data URL saat menyusun PNG.
export default function BusinessCardModal({
  card,
  username,
  avatarUrl,
  url,
  onClose,
}: {
  card: BusinessCardData;
  username: string;
  avatarUrl?: string;
  url: string;
  onClose: () => void;
}) {
  // useModalA11y -- 24 September 2026 (audit aksesibilitas): Escape
  // sebelumnya tidak menutup modal ini, fokus tidak dikurung (lolos ke
  // balik scrim setelah belasan Tab), dan fokus tidak kembali ke pemicu.
  // Komponen ini hanya di-mount saat terbuka, jadi open cukup true --
  // cleanup saat unmount yang mengembalikan fokus. Lihat
  // lib/use-modal-a11y.ts.
  const modalRef = useModalA11y(true, onClose);
  const { t } = useLocale();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // QR diambil dari SVG yang SUDAH TAMPIL di kartu (diserialisasi ke data
  // URL), bukan dari canvas tersembunyi: canvas display:none digambar
  // qrcode.react di useEffect dan di sebagian browser masih kosong saat
  // tombol ditekan (laporan pengguna 3 September 2026: QR hilang di PNG).
  // Canvas tersembunyi cuma cadangan kalau SVG tidak ditemukan.
  // svgToDataUrl -- serialisasi SVG yang tampil di kartu (QR & ikon baris)
  // supaya PNG memakai grafik yang PERSIS sama dengan pratinjau. currentColor
  // dipatok #111111 karena di luar DOM tidak ada warna induk.
  function svgToDataUrl(svg: SVGSVGElement, size: number): string {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(size));
    clone.setAttribute("height", String(size));
    clone.setAttribute("color", "#111111");
    clone.style.color = "#111111";
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  }

  function qrDataUrl(): string | null {
    const svg = cardRef.current?.querySelector<SVGSVGElement>("[data-qr] svg");
    if (svg) return svgToDataUrl(svg, 512);
    const canvas = qrRef.current;
    return canvas ? canvas.toDataURL("image/png") : null;
  }

  function iconDataUrls(): Record<string, string> {
    const out: Record<string, string> = {};
    cardRef.current?.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
      const svg = el.querySelector<SVGSVGElement>("svg");
      const key = el.dataset.icon;
      if (svg && key) out[key] = svgToDataUrl(svg, 96);
    });
    return out;
  }
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  async function handleDownload() {
    const qr = qrDataUrl();
    if (!qr) return;
    setDownloading(true);
    setError(null);
    try {
      // Foto & background lewat proxy API (same-origin + CORS) supaya bisa digambar ke canvas.
      const blob = await renderBusinessCardPNG({
        card,
        username,
        avatarUrl: avatarUrl ? cardAvatarProxyURL(username) : undefined,
        backgroundImageUrl: card.background_image_url ? cardBackgroundProxyURL(username) : undefined,
        url,
        qrDataUrl: qr,
        icons: iconDataUrls(),
      });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `kartu-nama-${username}.png`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      setError(t("dashboard.pages.businessCard.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div ref={modalRef} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6" role="dialog" aria-modal="true" aria-label={t("dashboard.pages.businessCard.cardModalTitle")}>
      <div className="relative w-full max-w-md rounded-jmd border-2 border-jeon-ink bg-app-surface p-5 shadow-brutal">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1.5 text-app-muted hover:bg-jeon-purple/10" aria-label={t("dashboard.components.qrCodeModal.closeAriaLabel")}>
          <IconClose className="h-4 w-4" />
        </button>
        <p className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.businessCard.cardModalTitle")}</p>
        <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.businessCard.cardModalDescription")}</p>

        <div ref={cardRef} className="mt-4 flex justify-center">
          <DigitalBusinessCard card={card} username={username} avatarUrl={avatarUrl} url={url} />
        </div>
        <div className="hidden" aria-hidden="true">
          <QRCodeCanvas ref={qrRef} value={url} size={512} level="M" marginSize={1} />
        </div>


        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={handleDownload} disabled={downloading} className="btn-primary flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold text-white disabled:opacity-60">
            <IconDownload className="h-4 w-4" />
            {downloading ? t("dashboard.pages.businessCard.downloading") : t("dashboard.pages.businessCard.downloadPng")}
          </button>
          <button type="button" onClick={handleCopy} className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-jeon-ink bg-app-surface py-2.5 text-xs font-bold text-app-ink">
            <IconCopy className="h-4 w-4" />
            {copied ? t("dashboard.pages.businessCard.copied") : t("dashboard.pages.businessCard.copyLink")}
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-jeon-ink bg-app-surface py-2.5 text-xs font-bold text-app-ink">
            <IconExternal className="h-4 w-4" />
            {t("dashboard.pages.businessCard.openPage")}
          </a>
        </div>
      </div>
    </div>
  );
}
