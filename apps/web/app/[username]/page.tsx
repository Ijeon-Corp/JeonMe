import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/api-client";
import PageAnalytics from "@/components/PageAnalytics";
import PagePreview from "@/components/PagePreview";

type PageParams = { params: Promise<{ username: string }> };

// REQ-F-206: meta tag Open Graph supaya link halaman kreator tampil bagus
// saat dibagikan di WhatsApp/Instagram/X, dst.
export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { username } = await params;
  const page = await getPublicPage(username);

  if (!page) {
    return { title: "Halaman tidak ditemukan — Jeonme" };
  }

  const title = `@${page.username} — Jeonme`;
  const description = page.bio || `Lihat semua tautan dan produk @${page.username} di Jeonme.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://jeonme.com/${page.username}`,
      siteName: "Jeonme",
      images: page.avatar_url ? [{ url: page.avatar_url }] : undefined,
      type: "profile",
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: page.avatar_url ? [page.avatar_url] : undefined,
    },
  };
}

// REQ-F-201: halaman ini harus dapat diakses tanpa login dan termuat cepat.
// Menggunakan Server Component + fetch dengan revalidate agar mendapat
// manfaat caching Next.js (ISR) sekaligus data yang cukup segar.
//
// Next.js 16: route params sekarang berupa Promise dan wajib di-await
// (breaking change sejak Next.js 15, lihat nextjs.org/docs/app/guides/upgrading/version-16).
export default async function CreatorPage({ params }: PageParams) {
  const { username } = await params;
  const page = await getPublicPage(username);

  if (!page) {
    notFound();
  }

  return (
    <>
      <PageAnalytics username={page.username} />
      <PagePreview
        data={{
          id: page.id,
          username: page.username,
          bio: page.bio,
          avatarUrl: page.avatar_url,
          theme: page.theme,
          links: page.links,
          products: page.products.map((p) => ({
            id: p.id,
            name: p.name,
            price_idr: p.price_idr,
            cover_image_url: p.cover_image_url,
            effectivePriceIdr: p.effective_price_idr,
            isFlashSaleActive: p.is_flash_sale_active,
          })),
        }}
        interactive
      />
    </>
  );
}
