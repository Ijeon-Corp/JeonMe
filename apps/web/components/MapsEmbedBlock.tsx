// Permintaan langsung pengguna (referensi tangkapan layar fitur "Maps"
// Linktree): blok lokasi -- bisa ditampilkan sebagai peta Google Maps
// tertanam (iframe) ATAU sebagai tautan biasa yang langsung membuka Google
// Maps di tab baru, tergantung pilihan "Link behavior" kreator. Koordinat
// (embedLat/embedLng) SUDAH diresolusi sekali di backend saat blok dibuat/
// disunting (lihat resolveMapsEmbedCoords, links.go) -- komponen ini murni
// merender, TIDAK melakukan permintaan jaringan apa pun sendiri.
import { IconMapPin } from "@/components/icons";

export default function MapsEmbedBlock({
  title,
  url,
  embed,
  embedLat,
  embedLng,
  cardClassName,
  titleClassName,
  linkClassName,
}: {
  title: string;
  url: string;
  embed: boolean;
  embedLat?: number;
  embedLng?: number;
  cardClassName: string;
  titleClassName: string;
  linkClassName: string;
}) {
  if (embed && typeof embedLat === "number" && typeof embedLng === "number") {
    // Trik resmi Google (sebelum Embed API berbayar ada, TERBUKTI masih
    // berfungsi lewat verifikasi langsung): query "q=<lat>,<lng>" + parameter
    // "output=embed" menghasilkan iframe peta interaktif TANPA API key.
    const embedSrc = `https://www.google.com/maps?q=${embedLat},${embedLng}&z=16&output=embed`;
    return (
      <div className={cardClassName}>
        {title && <p className={`mb-2 truncate text-sm font-semibold ${titleClassName}`}>{title}</p>}
        <div className="aspect-video w-full overflow-hidden rounded-xl">
          <iframe src={embedSrc} title={title || "Lokasi"} className="h-full w-full" loading="lazy" />
        </div>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName}
    >
      <IconMapPin className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{title || "Lokasi"}</span>
    </a>
  );
}
