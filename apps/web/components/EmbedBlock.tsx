// EmbedBlock -- Canvas Page Builder Fase 3 (kategori OTHERS, iframe
// GENERIK dgn whitelist provider, permintaan langsung pengguna 8
// September 2026, provider dikonfirmasi via AskUserQuestion: Google
// Forms/Calendly/Spotify -- BEDA dari "embed_link" Fase 2 yang cuma kartu
// link manual TANPA iframe). Pola PERSIS VideoEmbedBlock.tsx: `toEmbedIframeSrc`
// pakai exact-equality hostname check (BUKAN substring) + transform
// per-provider ke URL embed resmi, rebuild dari komponen yang diketahui
// (bukan trust URL mentah) -- fallback teks kalau host tidak dikenal atau
// URL tidak valid, TIDAK PERNAH render iframe dari src sembarangan.
function toEmbedIframeSrc(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();

  if (host === "docs.google.com") {
    // Google Forms -- format embed resmi Google: "?embedded=true" di URL
    // form (docs.google.com/forms/d/e/FORM_ID/viewform), ditambahkan
    // kalau belum ada.
    if (!u.pathname.includes("/forms/")) return null;
    u.searchParams.set("embedded", "true");
    return u.toString();
  }
  if (host === "calendly.com") {
    // Widget inline Calendly = iframe src PERSIS URL profil/event apa
    // adanya, tanpa prefix "/embed" (dikonfirmasi dari dokumentasi resmi
    // Calendly -- beda dari Spotify/YouTube yang butuh rewrite path).
    return u.toString();
  }
  if (host === "open.spotify.com") {
    // Spotify -- open.spotify.com/track/ID -> open.spotify.com/embed/track/ID
    // (sisipkan "/embed" setelah domain, sebelum tipe resource).
    if (u.pathname.startsWith("/embed/")) return u.toString();
    return `https://open.spotify.com/embed${u.pathname}${u.search}`;
  }
  return null;
}

export default function EmbedBlock({
  title,
  embedUrl,
  cardClassName,
  titleClassName,
  icon,
}: {
  title: string;
  embedUrl: string;
  cardClassName: string;
  titleClassName: string;
  icon?: React.ReactNode;
}) {
  const src = toEmbedIframeSrc(embedUrl);

  return (
    <div className={cardClassName}>
      {title && (
        <p className={`mb-2 flex items-center gap-1.5 truncate text-sm font-semibold ${titleClassName}`}>
          {icon}
          <span className="truncate">{title}</span>
        </p>
      )}
      {src ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl">
          <iframe src={src} title={title || "Embed"} className="h-full w-full" loading="lazy" />
        </div>
      ) : (
        <p className="text-xs text-red-500">Embed tidak dapat ditampilkan.</p>
      )}
    </div>
  );
}
