import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBusinessCard } from "@/lib/api-client";
import CardActions from "@/components/CardActions";
import { IconGlobe, IconMail, IconPhone } from "@/components/icons";

type PageParams = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { username } = await params;
  const card = await getPublicBusinessCard(username);

  if (!card) {
    return { title: "Kartu kontak tidak ditemukan — Jeonme" };
  }

  return { title: `${card.full_name} — Kartu Kontak Jeonme` };
}

// No.95 (Sprint 13): halaman kartu kontak digital, TERPISAH dari halaman
// utama kreator (jeon.id/{username}) -- dituju lewat kode QR khusus
// kartu, bukan halaman link-in-bio biasa.
export default async function BusinessCardPage({ params }: PageParams) {
  const { username } = await params;
  const card = await getPublicBusinessCard(username);

  if (!card) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center bg-primary-subtle/30 px-5 py-10">
      <div className="w-full rounded-2xl border border-border bg-white p-6 text-center shadow-card">
        {card.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.avatar_url} alt={card.full_name} className="mx-auto h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-subtle text-2xl font-bold text-primary">
            {card.full_name.charAt(0).toUpperCase() || "?"}
          </div>
        )}

        <h1 className="mt-3 font-heading text-xl font-bold text-ink">{card.full_name}</h1>
        {(card.job_title || card.company) && (
          <p className="mt-0.5 text-sm text-muted">
            {card.job_title}
            {card.job_title && card.company ? " · " : ""}
            {card.company}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2 text-left">
          {card.phone && (
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink">
              <IconPhone className="h-4 w-4 flex-shrink-0 text-muted" />
              {card.phone}
            </div>
          )}
          {card.whatsapp_number && (
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink">
              <IconPhone className="h-4 w-4 flex-shrink-0 text-muted" />
              WhatsApp: {card.whatsapp_number}
            </div>
          )}
          {card.email && (
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink">
              <IconMail className="h-4 w-4 flex-shrink-0 text-muted" />
              {card.email}
            </div>
          )}
          {card.website && (
            <a
              href={card.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:border-primary hover:text-primary"
            >
              <IconGlobe className="h-4 w-4 flex-shrink-0 text-muted" />
              {card.website}
            </a>
          )}
        </div>

        <CardActions card={card} />
      </div>
    </main>
  );
}
