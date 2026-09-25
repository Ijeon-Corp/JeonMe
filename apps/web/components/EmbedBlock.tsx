// EmbedBlock -- Canvas Page Builder Fase 3 (kategori OTHERS, iframe
// GENERIK dgn whitelist provider, permintaan langsung pengguna 8
// September 2026, provider dikonfirmasi via AskUserQuestion: Google
// Forms/Calendly/Spotify -- BEDA dari "embed_link" Fase 2 yang cuma kartu
// link manual TANPA iframe). Pola PERSIS VideoEmbedBlock.tsx: `toEmbedIframeSrc`
// pakai exact-equality hostname check (BUKAN substring) + transform
// per-provider ke URL embed resmi, rebuild dari komponen yang diketahui
// (bukan trust URL mentah) -- fallback teks kalau host tidak dikenal atau
// URL tidak valid, TIDAK PERNAH render iframe dari src sembarangan.
interface EmbedResult {
  src: string;
  host: string;
}

function toEmbedIframeSrc(raw: string): EmbedResult | null {
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
    return { src: u.toString(), host };
  }
  if (host === "calendly.com") {
    // Widget inline Calendly = iframe src PERSIS URL profil/event apa
    // adanya, tanpa prefix "/embed" (dikonfirmasi dari dokumentasi resmi
    // Calendly -- beda dari Spotify/YouTube yang butuh rewrite path).
    return { src: u.toString(), host };
  }
  if (host === "open.spotify.com") {
    // Spotify -- open.spotify.com/track/ID -> open.spotify.com/embed/track/ID
    // (sisipkan "/embed" setelah domain, sebelum tipe resource).
    const src = u.pathname.startsWith("/embed/") ? u.toString() : `https://open.spotify.com/embed${u.pathname}${u.search}`;
    return { src, host };
  }
  return null;
}

// EMBED_HEIGHT_CLASS -- audit UX menyeluruh (14 September 2026): SEBELUMNYA
// ketiga provider dipaksa `aspect-video` (16:9), pola disalin apa adanya
// dari VideoEmbedBlock.tsx (lihat catatan atas file ini) -- tidak satu pun
// dari 3 provider ini SEBENARNYA berbentuk video 16:9. Widget Spotify resmi
// tinggi tetap (152px utk kartu compact single-track, TIDAK proporsional
// dgn lebar), Google Forms/Calendly jauh lebih tinggi dari lebar (form/
// scheduler, bukan video) -- hasilnya banyak ruang kosong janggal (Spotify)
// atau konten terpotong (Forms/Calendly). Tinggi tetap per-provider
// (BUKAN aspect-ratio) sesuai rekomendasi resmi masing-masing, dgn overflow
// auto jaga-jaga kalau kontennya lebih panjang dari perkiraan.
const EMBED_HEIGHT_CLASS: Record<string, string> = {
  "open.spotify.com": "h-[152px]",
  "docs.google.com": "h-[640px]",
  "calendly.com": "h-[640px]",
};

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
  const result = toEmbedIframeSrc(embedUrl);

  return (
    <div className={cardClassName}>
      {title && (
        <p data-block-title className={`mb-2 flex items-center gap-1.5 truncate text-sm font-semibold ${titleClassName}`}>
          {icon}
          <span className="truncate">{title}</span>
        </p>
      )}
      {result ? (
        <div className={`w-full overflow-auto rounded-xl ${EMBED_HEIGHT_CLASS[result.host] ?? "aspect-video"}`}>
          <iframe src={result.src} title={title || "Embed"} className="h-full w-full" loading="lazy" />
        </div>
      ) : (
        // Netral, bukan gaya-error -- lihat catatan lengkap di AudioPlayerBlock.tsx.
        <p className={`text-xs opacity-50 ${titleClassName}`}>Embed tidak dapat ditampilkan.</p>
      )}
    </div>
  );
}
