import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/api-client";
import { getPageTheme } from "@/lib/page-themes";
import BuyProductButton from "@/components/BuyProductButton";
import PageAnalytics from "@/components/PageAnalytics";
import TrackedLink from "@/components/TrackedLink";
import ReportButton from "@/components/ReportButton";
import { IconBox, IconChevronRight } from "@/components/icons";

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

  // REQ-F-204: page.theme tersimpan & bisa dipilih dari dashboard, tapi
  // sebelumnya tidak pernah diterapkan di sini -- kreator memilih tema,
  // tidak ada yang berubah di halaman publik. getPageTheme() sekarang jadi
  // satu-satunya jalur render yang benar-benar menghormati pilihan itu.
  const theme = getPageTheme(page.theme);

  return (
    <main className={`relative min-h-screen ${theme.page}`}>
      <PageAnalytics username={page.username} />

      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-14">
        <div className="relative flex flex-col items-center">
          {theme.glow !== "hidden" && (
            <div
              aria-hidden
              className={`absolute -top-10 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full blur-3xl ${theme.glow}`}
            />
          )}

          {page.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.avatar_url}
              alt={page.username}
              className={`relative h-24 w-24 rounded-full object-cover ${theme.avatarRing}`}
            />
          ) : (
            <div
              className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-white/20 font-heading text-2xl font-bold ${theme.name} ${theme.avatarRing}`}
            >
              {page.username.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="relative mt-5 text-center">
            <h1 className={`font-heading text-xl font-bold ${theme.name}`}>@{page.username}</h1>
            {page.bio && <p className={`mt-2 max-w-xs text-sm leading-relaxed ${theme.bio}`}>{page.bio}</p>}
          </div>
        </div>

        {page.links.length > 0 && (
          <div className="mt-8 flex w-full flex-col gap-3">
            {page.links.map((link) => (
              <TrackedLink
                key={link.id}
                username={page.username}
                linkId={link.id}
                href={link.url}
                className={`group flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
              >
                <span className="truncate">{link.title}</span>
                <IconChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${theme.chevron}`} />
              </TrackedLink>
            ))}
          </div>
        )}

        {page.products.length > 0 && (
          <div className="mt-8 w-full">
            <p className={`mb-3 text-xs font-bold uppercase tracking-wider ${theme.bio}`}>Produk</p>
            <div className="grid w-full grid-cols-2 gap-3">
              {page.products.map((product) => (
                <div key={product.id} className={`flex flex-col rounded-2xl p-3.5 ${theme.productCard}`}>
                  <div className={`mb-2.5 flex aspect-square items-center justify-center rounded-xl ${theme.card}`}>
                    {product.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.cover_image_url}
                        alt={product.name}
                        className="h-full w-full rounded-xl object-cover"
                      />
                    ) : (
                      <IconBox className={`h-7 w-7 ${theme.chevron}`} />
                    )}
                  </div>
                  <p className={`truncate text-xs font-semibold ${theme.productTitle}`}>{product.name}</p>
                  <p className={`text-xs font-bold ${theme.productPrice}`}>
                    Rp {product.price_idr.toLocaleString("id-ID")}
                  </p>
                  <BuyProductButton productId={product.id} buttonClassName={theme.buyButton} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          <ReportButton pageId={page.id} className={theme.footer} />
          <a
            href="https://jeonme.com"
            className={`font-heading text-xs font-semibold tracking-wide transition-colors ${theme.footer}`}
          >
            Dibuat dengan Jeonme
          </a>
        </div>
      </div>
    </main>
  );
}
