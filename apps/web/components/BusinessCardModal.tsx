"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import DigitalBusinessCard, { type BusinessCardData } from "@/components/DigitalBusinessCard";
import { renderBusinessCardPNG } from "@/lib/business-card-png";
import { IconClose, IconCopy, IconDownload, IconExternal } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

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
  const { t } = useLocale();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    const qr = qrRef.current;
    if (!qr) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await renderBusinessCardPNG({ card, username, avatarUrl, url, qrDataUrl: qr.toDataURL("image/png") });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6" role="dialog" aria-modal="true" aria-label={t("dashboard.pages.businessCard.cardModalTitle")}>
      <div className="relative w-full max-w-md rounded-jmd border-2 border-jeon-ink bg-app-surface p-5 shadow-brutal">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1.5 text-app-muted hover:bg-jeon-purple/10" aria-label={t("dashboard.components.qrCodeModal.closeAriaLabel")}>
          <IconClose className="h-4 w-4" />
        </button>
        <p className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.businessCard.cardModalTitle")}</p>
        <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.businessCard.cardModalDescription")}</p>

        <div className="mt-4 flex justify-center">
          <DigitalBusinessCard card={card} username={username} avatarUrl={avatarUrl} url={url} />
        </div>
        <div className="hidden" aria-hidden="true">
          <QRCodeCanvas ref={qrRef} value={url} size={512} level="M" marginSize={1} />
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

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
