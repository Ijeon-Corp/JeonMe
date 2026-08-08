"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconCheck,
  IconCopy,
  IconFacebook,
  IconInstagram,
  IconShare,
  IconTelegram,
  IconWhatsapp,
  IconX,
} from "@/components/icons";

type ShareAction =
  | { kind: "link"; build: (title: string, url: string) => string }
  | { kind: "copy"; hint: string };

// PLATFORMS -- "Share All Platform" (permintaan langsung pengguna, 8
// Agustus 2026): sebelumnya tombol ini cuma memicu Web Share API bawaan
// browser (navigator.share) -- praktis di HP, tapi TIDAK didukung sebagian
// besar browser desktop (Chrome/Firefox desktop, dst), jadi ikon platform
// yang bisa dibagikan tidak pernah benar-benar terlihat di sana. Sekarang
// dropdown SENDIRI dengan ikon platform spesifik yang SELALU tampil, tidak
// bergantung dukungan browser. Warna badge disamakan persis dengan
// SUGGESTED_PLATFORMS di dashboard/links/page.tsx supaya konsisten satu
// aplikasi. Instagram TIDAK punya web share intent resmi untuk tautan+teks
// sembarang (beda dari WhatsApp/Telegram/X/Facebook) -- aksinya salin link
// + petunjuk singkat, bukan window.open ke URL yang tidak ada.
const PLATFORMS: { key: string; label: string; Icon: (p: { className?: string }) => React.ReactElement; badgeClass: string; action: ShareAction }[] = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    Icon: IconWhatsapp,
    badgeClass: "bg-[#25D366] text-white",
    action: { kind: "link", build: (title, url) => `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
  },
  {
    key: "instagram",
    label: "Instagram",
    Icon: IconInstagram,
    badgeClass: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white",
    action: { kind: "copy", hint: "Link disalin -- buka Instagram untuk membagikan (bio/story/DM)." },
  },
  {
    key: "x",
    label: "X (Twitter)",
    Icon: IconX,
    badgeClass: "bg-black text-white",
    action: { kind: "link", build: (title, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
  },
  {
    key: "facebook",
    label: "Facebook",
    Icon: IconFacebook,
    badgeClass: "bg-[#1877F2] text-white",
    action: { kind: "link", build: (_title, url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  },
  {
    key: "telegram",
    label: "Telegram",
    Icon: IconTelegram,
    badgeClass: "bg-[#26A5E4] text-white",
    action: { kind: "link", build: (title, url) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
  },
];

export default function ShareButton({ title, url, className = "" }: { title: string; url: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function copyLink() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
  }

  async function handlePlatformClick(action: ShareAction) {
    if (action.kind === "link") {
      window.open(action.build(title, url), "_blank", "noopener,noreferrer,width=600,height=520");
      setOpen(false);
      return;
    }
    await copyLink();
    setStatusMessage(action.hint);
    setOpen(false);
    setTimeout(() => setStatusMessage(null), 3000);
  }

  async function handleCopyLink() {
    await copyLink();
    setStatusMessage("Link disalin ke clipboard.");
    setOpen(false);
    setTimeout(() => setStatusMessage(null), 2200);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Bagikan halaman ini"
        aria-label="Bagikan halaman ini"
        aria-expanded={open}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/80 text-ink shadow-card backdrop-blur transition-transform hover:scale-105"
      >
        <IconShare className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-border bg-white p-1.5 text-left shadow-hero">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePlatformClick(p.action)}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
            >
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${p.badgeClass}`}>
                <p.Icon className="h-4 w-4" />
              </span>
              {p.label}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink">
              <IconCopy className="h-4 w-4" />
            </span>
            Salin Link
          </button>
        </div>
      )}

      {statusMessage && (
        <div className="absolute right-0 top-12 z-20 flex w-56 items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-semibold text-ink shadow-hero">
          <IconCheck className="h-4 w-4 flex-shrink-0 text-secondary-dark" />
          {statusMessage}
        </div>
      )}
    </div>
  );
}
