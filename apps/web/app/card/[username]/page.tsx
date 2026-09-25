import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBusinessCard } from "@/lib/api-client";
import CardActions from "@/components/CardActions";
import DigitalBusinessCard from "@/components/DigitalBusinessCard";
import { SITE_URL } from "@/lib/site";

type PageParams = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { username } = await params;
  const card = await getPublicBusinessCard(username);

  if (!card) {
    return { title: "Kartu kontak tidak ditemukan | Jeon.id" };
  }

  return { title: `${card.full_name} | Kartu Kontak Jeon.id` };
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center bg-jeon-surface-2 px-5 py-10">
      {/* Kartu yang SAMA dengan yang dilihat kreator di dashboard & yang
          diunduh sebagai PNG -- lihat catatan di DigitalBusinessCard.tsx. */}
      <DigitalBusinessCard card={card} username={card.username} avatarUrl={card.avatar_url} url={`${SITE_URL}/card/${card.username}`} />
      <div className="w-full max-w-sm">
        <CardActions card={card} />
      </div>
    </main>
  );
}
