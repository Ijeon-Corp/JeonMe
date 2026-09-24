"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";
import { IconClose } from "@/components/icons";
import { useModalA11y } from "@/lib/use-modal-a11y";
import { overlayClass, sheetPanelClass, usePresence } from "@/lib/use-presence";

// PublicSheet -- kerangka pop-up bersama utk blok di HALAMAN PUBLIK
// kreator (permintaan langsung pengguna, 25 September 2026: "blok blok yang
// akan memunculkan pop up perbaiki tampilan nya dan berikan animasi saat
// terbuka dan tertutup"). Menyatukan hal yang sebelumnya diulang (atau
// terlewat) di tiap blok:
// - createPortal ke document.body -- `position: fixed` di dalam kartu blok
//   yang ber-transform saat hover (hover:-translate-y di banyak tema) akan
//   terkurung di kartu itu (temuan lama di GalleryBlock/BuyProductButton).
// - Escape, focus trap, fokus kembali ke pemicu (useModalA11y).
// - Kunci scroll halaman di belakangnya.
// - Animasi buka/tutup (usePresence): bottom sheet naik dari bawah di
//   ponsel, kartu tengah membesar halus di layar lebar.
// Warna SENGAJA tetap (putih + tinta #111, border tebal khas jeon.id), bukan
// token app-*/tema: halaman publik bisa bertema apa pun, termasuk gelap --
// token app-* di luar .app-shell pernah menghasilkan teks terang di atas
// putih (audit kontras 24 September 2026).
export default function PublicSheet({
  open,
  onClose,
  title,
  children,
  maxWidthClass = "sm:max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  const { mounted, visible } = usePresence(open);
  const panelRef = useModalA11y(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-end justify-center sm:items-center sm:p-6">
      <div className={`absolute inset-0 bg-black/55 backdrop-blur-sm ${overlayClass(visible)}`} onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[28px] border-t-2 border-[#111111] bg-white text-[#111111] shadow-2xl sm:rounded-[28px] sm:border-2 ${maxWidthClass} ${sheetPanelClass(visible)}`}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 flex-shrink-0 rounded-full bg-black/15 sm:hidden" aria-hidden />
        <div className="flex flex-shrink-0 items-center gap-3 px-5 pb-3 pt-3 sm:pt-4">
          {title && <p className="min-w-0 flex-1 truncate font-heading text-base font-bold">{title}</p>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="ml-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#111111] bg-white text-[#111111] transition-transform hover:-translate-y-0.5"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">{children}</div>
      </div>
    </div>,
    document.body
  );
}
