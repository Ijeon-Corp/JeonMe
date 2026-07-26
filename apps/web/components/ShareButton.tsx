"use client";

import { useState } from "react";
import { IconCheck, IconShare } from "@/components/icons";

// Tombol "share ke semua platform" ala Linktree (permintaan langsung
// pengguna, tangkapan layar halaman publik) -- memakai Web Share API
// bawaan browser (navigator.share) yang membuka lembar berbagi NATIF milik
// perangkat pengunjung, berisi SEMUA aplikasi yang terpasang & bisa
// menerima bagikan (WhatsApp/Telegram/Messages/Mail/dll) -- ini yang
// membuatnya benar-benar "ke semua platform" tanpa perlu membuat daftar
// tombol per-platform sendiri (yang sulit dijaga lengkap & akurat). Kalau
// browser tidak mendukung (kebanyakan desktop selain Safari/Edge terbaru),
// fallback SALIN TAUTAN ke clipboard -- tetap ada hasil nyata, bukan diam
// tanpa aksi.
export default function ShareButton({ title, url, className = "" }: { title: string; url: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Pengguna membatalkan lembar berbagi -- bukan error, diamkan saja.
      }
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      title="Bagikan halaman ini"
      aria-label="Bagikan halaman ini"
      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/80 text-ink shadow-card backdrop-blur transition-transform hover:scale-105 ${className}`}
    >
      {copied ? <IconCheck className="h-4 w-4 text-secondary-dark" /> : <IconShare className="h-4 w-4" />}
    </button>
  );
}
