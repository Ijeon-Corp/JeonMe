"use client";

// Permintaan langsung pengguna (referensi tangkapan layar fitur "Maps"
// Linktree, lalu diperjelas: "ketika di klik maka langsung muncul popup
// maps nya ketika pilih embed"): blok lokasi SELALU tampil sebagai baris
// tautan ringkas (ikon pin + judul, sama seperti tautan biasa) -- BUKAN
// peta besar yang langsung tertanam di halaman. Bedanya cuma di
// PERILAKU KLIK: mode "embed" membuka POPUP berisi peta Google Maps
// (pola sama seperti popup footer di PageFooterLinks.tsx), mode "direct
// link" langsung membuka URL asli di tab baru. Koordinat (embedLat/
// embedLng) SUDAH diresolusi sekali di backend saat blok dibuat/disunting
// (lihat resolveMapsEmbedCoords, links.go) -- komponen ini murni
// merender, TIDAK melakukan permintaan jaringan apa pun sendiri.
import { useState } from "react";
import { IconClose, IconMapPin } from "@/components/icons";

export default function MapsEmbedBlock({
  title,
  url,
  embed,
  embedLat,
  embedLng,
  linkClassName,
}: {
  title: string;
  url: string;
  embed: boolean;
  embedLat?: number;
  embedLng?: number;
  linkClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const canEmbed = embed && typeof embedLat === "number" && typeof embedLng === "number";

  if (canEmbed) {
    // Trik resmi Google (sebelum Embed API berbayar ada, TERBUKTI masih
    // berfungsi lewat verifikasi langsung): query "q=<lat>,<lng>" + parameter
    // "output=embed" menghasilkan iframe peta interaktif TANPA API key.
    const embedSrc = `https://www.google.com/maps?q=${embedLat},${embedLng}&z=16&output=embed`;
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={linkClassName}>
          <IconMapPin className="h-5 w-5 flex-shrink-0" />
          <span className="truncate">{title || "Lokasi"}</span>
        </button>

        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
            <div
              className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border p-3">
                <p className="truncate font-heading text-sm font-bold text-ink">{title || "Lokasi"}</p>
                <button type="button" onClick={() => setOpen(false)} className="flex-shrink-0 text-muted hover:text-ink">
                  <IconClose className="h-5 w-5" />
                </button>
              </div>
              <div className="aspect-video w-full">
                <iframe src={embedSrc} title={title || "Lokasi"} className="h-full w-full" loading="lazy" />
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      <IconMapPin className="h-5 w-5 flex-shrink-0" />
      <span className="truncate">{title || "Lokasi"}</span>
    </a>
  );
}
