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
import { IconMapPin } from "@/components/icons";
import PublicSheet from "@/components/PublicSheet";

export default function MapsEmbedBlock({
  title,
  url,
  embed,
  embedLat,
  embedLng,
  linkClassName,
  icon,
}: {
  title: string;
  url: string;
  embed: boolean;
  embedLat?: number;
  embedLng?: number;
  linkClassName: string;
  // icon -- permintaan langsung pengguna, 14 Agustus 2026: ikon kustom/galeri
  // yang dipilih dari dashboard (lihat resolveBlockIcon di PagePreview.tsx),
  // fallback ke IconMapPin bawaan kalau belum dipilih apa pun.
  icon?: React.ReactNode;
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
          <span className="absolute left-2 top-1/2 flex h-9 w-9 flex-shrink-0 -translate-y-1/2 items-center justify-center">
            {icon ?? <IconMapPin className="h-6 w-6" />}
          </span>
          <span className="w-full truncate px-8 text-center">{title || "Lokasi"}</span>
        </button>

        {/* Pop-up peta -- kerangka PublicSheet (animasi, portal, Escape,
            focus trap, kunci scroll; 25 September 2026). SEBELUMNYA div
            fixed polos tanpa portal/Escape, teks memakai token app-* yang
            terbalik di mode gelap. Tombol "Buka di Google Maps" ditambahkan
            supaya pengunjung bisa langsung navigasi dari aplikasi peta. */}
        <PublicSheet open={open} onClose={() => setOpen(false)} title={title || "Lokasi"}>
          <div className="overflow-hidden rounded-2xl border-2 border-[#111111]">
            <div className="aspect-[4/3] w-full sm:aspect-video">
              <iframe src={embedSrc} title={title || "Lokasi"} className="h-full w-full" loading="lazy" />
            </div>
          </div>
          <a
            href={url || `https://www.google.com/maps?q=${embedLat},${embedLng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border-2 border-[#111111] bg-[#d7ff60] px-4 py-3 text-sm font-bold text-[#111111] shadow-[3px_3px_0_#111111] transition-transform hover:-translate-y-0.5"
          >
            <IconMapPin className="h-4 w-4" />
            Buka di Google Maps
          </a>
        </PublicSheet>
      </>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      <span className="absolute left-2 top-1/2 flex h-9 w-9 flex-shrink-0 -translate-y-1/2 items-center justify-center">
        {icon ?? <IconMapPin className="h-6 w-6" />}
      </span>
      <span className="w-full truncate px-8 text-center">{title || "Lokasi"}</span>
    </a>
  );
}
