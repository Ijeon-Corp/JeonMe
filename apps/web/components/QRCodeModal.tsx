"use client";

import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { IconClose } from "@/components/icons";

// No.82 (Sprint 9): kode QR per halaman kreator, untuk materi promosi
// offline (banner event, kemasan produk, dsb). Murni sisi klien -- URL
// halaman publik sudah diketahui (jeonme.com/{username}), tidak perlu
// endpoint backend sama sekali.
export default function QRCodeModal({
  url,
  username,
  onClose,
  title = "Kode QR Halamanmu",
  description = "Cetak di banner, stiker kemasan, atau materi promosi offline lainnya.",
}: {
  url: string;
  username: string;
  onClose: () => void;
  title?: string;
  description?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `qr-jeonme-${username}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="relative w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-hero">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-primary-subtle"
          aria-label="Tutup"
        >
          <IconClose className="h-4 w-4" />
        </button>

        <p className="font-heading text-sm font-bold text-ink">{title}</p>
        <p className="mt-1 text-xs text-muted">{description}</p>

        <div className="mt-4 flex items-center justify-center">
          <QRCodeCanvas ref={canvasRef} value={url} size={200} level="M" marginSize={2} />
        </div>

        <p className="mt-3 truncate text-xs text-muted">{url}</p>

        <button
          type="button"
          onClick={handleDownload}
          className="btn-primary mt-4 w-full rounded-lg py-2.5 text-sm font-bold text-white"
        >
          Unduh PNG
        </button>
      </div>
    </div>
  );
}
