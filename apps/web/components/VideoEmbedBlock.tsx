// No.77 (Sprint 9): blok video embed (YouTube/TikTok). Server Component murni
// (tidak butuh interaktivitas apa pun) -- konversi URL asli ke URL embed
// dilakukan sekali di sini, bukan client-side.
function toEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    if (id) return `https://www.youtube.com/embed/${id}`;
    const shorts = u.pathname.match(/\/shorts\/([^/]+)/);
    if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
    return null;
  }
  if (host === "tiktok.com") {
    const match = u.pathname.match(/\/video\/(\d+)/);
    return match ? `https://www.tiktok.com/embed/v2/${match[1]}` : null;
  }
  return null;
}

export default function VideoEmbedBlock({
  title,
  videoUrl,
  cardClassName,
  titleClassName,
}: {
  title: string;
  videoUrl: string;
  cardClassName: string;
  titleClassName: string;
}) {
  const embedUrl = toEmbedUrl(videoUrl);

  return (
    <div className={cardClassName}>
      {title && <p className={`mb-2 truncate text-sm font-semibold ${titleClassName}`}>{title}</p>}
      {embedUrl ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl">
          <iframe
            src={embedUrl}
            title={title || "Video"}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <p className="text-xs text-red-500">Video tidak dapat ditampilkan.</p>
      )}
    </div>
  );
}
