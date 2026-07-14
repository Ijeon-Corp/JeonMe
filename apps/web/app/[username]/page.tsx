import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/api-client";
import BuyProductButton from "@/components/BuyProductButton";
import PageAnalytics from "@/components/PageAnalytics";
import TrackedLink from "@/components/TrackedLink";
import ReportButton from "@/components/ReportButton";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center gap-6 px-6 py-12">
      <PageAnalytics username={page.username} />
      {page.avatar_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.avatar_url}
          alt={page.username}
          className="h-24 w-24 rounded-full object-cover"
        />
      )}
      <div className="text-center">
        <h1 className="text-xl font-semibold">@{page.username}</h1>
        {page.bio && <p className="mt-1 text-gray-600">{page.bio}</p>}
      </div>

      <div className="flex w-full flex-col gap-3">
        {page.links.map((link) => (
          <TrackedLink
            key={link.id}
            username={page.username}
            linkId={link.id}
            href={link.url}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-center font-medium hover:bg-gray-50"
          >
            {link.title}
          </TrackedLink>
        ))}
      </div>

      {page.products.length > 0 && (
        <div className="grid w-full grid-cols-2 gap-3">
          {page.products.map((product) => (
            <div
              key={product.id}
              className="rounded-lg border border-gray-200 p-3 text-sm"
            >
              <p className="font-medium">{product.name}</p>
              <p className="text-gray-500">
                Rp {product.price_idr.toLocaleString("id-ID")}
              </p>
              <BuyProductButton productId={product.id} />
            </div>
          ))}
        </div>
      )}

      <ReportButton pageId={page.id} />
    </main>
  );
}
