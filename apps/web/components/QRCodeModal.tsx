"use client";

import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { IconClose } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import { useModalA11y } from "@/lib/use-modal-a11y";

// No.82 (Sprint 9): kode QR per halaman kreator, untuk materi promosi
// offline (banner event, kemasan produk, dsb). Murni sisi klien -- URL
// halaman publik sudah diketahui (jeon.id/{username}), tidak perlu
// endpoint backend sama sekali.
// title/description -- default TIDAK LAGI ditulis sebagai default
// parameter literal (permintaan susulan pengguna, 29 Agustus 2026:
// terjemahkan seluruh isi dashboard): default value harus lewat t(),
// yang cuma bisa dipanggil di dalam badan komponen (hook), bukan di
// posisi parameter -- lihat resolvedTitle/resolvedDescription di bawah.
export default function QRCodeModal({
  url,
  username,
  onClose,
  title,
  description,
}: {
  url: string;
  username: string;
  onClose: () => void;
  title?: string;
  description?: string;
}) {
  // useModalA11y -- 24 September 2026 (audit aksesibilitas): Escape
  // sebelumnya tidak menutup modal ini, fokus tidak dikurung (lolos ke
  // balik scrim setelah belasan Tab), dan fokus tidak kembali ke pemicu.
  // Komponen ini hanya di-mount saat terbuka, jadi open cukup true --
  // cleanup saat unmount yang mengembalikan fokus. Lihat
  // lib/use-modal-a11y.ts.
  const modalRef = useModalA11y(true, onClose);
  const { t } = useLocale();
  const resolvedTitle = title ?? t("dashboard.components.qrCodeModal.defaultTitle");
  const resolvedDescription = description ?? t("dashboard.components.qrCodeModal.defaultDescription");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Kode QR halaman" className="relative w-full max-w-xs rounded-jmd border-2 border-jeon-ink bg-app-surface p-6 text-center shadow-brutal">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-app-muted hover:bg-jeon-purple/10"
          aria-label={t("dashboard.components.qrCodeModal.closeAriaLabel")}
        >
          <IconClose className="h-4 w-4" />
        </button>

        <p className="font-display text-sm font-bold text-app-ink">{resolvedTitle}</p>
        <p className="mt-1 text-xs text-app-muted">{resolvedDescription}</p>

        <div className="mt-4 flex items-center justify-center">
          <QRCodeCanvas ref={canvasRef} value={url} size={200} level="M" marginSize={2} />
        </div>

        <p className="mt-3 truncate text-xs text-app-muted">{url}</p>

        <button
          type="button"
          onClick={handleDownload}
          className="btn-primary mt-4 w-full rounded-lg py-2.5 text-sm font-bold text-white"
        >
          {t("dashboard.components.qrCodeModal.downloadButton")}
        </button>
      </div>
    </div>
  );
}
