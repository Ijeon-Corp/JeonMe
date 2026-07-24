import { getPageTheme } from "@/lib/page-themes";
import BuyProductButton from "@/components/BuyProductButton";
import TrackedLink from "@/components/TrackedLink";
import ReportButton from "@/components/ReportButton";
import { IconBox, IconChevronRight, IconHeart } from "@/components/icons";

export interface PagePreviewLink {
  id: string;
  title: string;
  url: string;
}

export interface PagePreviewProduct {
  id: string;
  name: string;
  price_idr: number;
  cover_image_url?: string;
  effectivePriceIdr?: number;
  isFlashSaleActive?: boolean;
  pwywEnabled?: boolean;
  pwywMinPriceIdr?: number;
  isBundle?: boolean;
  bundleOriginalPriceIdr?: number;
}

export interface PagePreviewDonation {
  productId: string;
  title: string;
  minAmountIdr: number;
}

export interface PagePreviewData {
  id?: string;
  username: string;
  bio: string;
  avatarUrl: string;
  theme: string;
  links: PagePreviewLink[];
  products: PagePreviewProduct[];
  donation?: PagePreviewDonation;
}

interface PreviewSourcePage {
  username: string;
  bio: string;
  avatar_url: string;
  theme: string;
}

interface PreviewSourceLink {
  id: string;
  title: string;
  url: string;
  is_active: boolean;
}

interface PreviewSourceProduct {
  id: string;
  name: string;
  price_idr: number;
  cover_image_url: string;
  is_active: boolean;
  effective_price_idr?: number;
  is_flash_sale_active?: boolean;
  pwyw_enabled?: boolean;
  pwyw_min_price_idr?: number | null;
  is_bundle?: boolean;
  bundle_original_price_idr?: number | null;
}

// Dipakai bersama oleh semua halaman dashboard "Halaman Saya" (Tautan/Produk/Desain)
// supaya cara membangun data pratinjau dari state mentah tidak terduplikasi.
export function toPreviewData(
  page: PreviewSourcePage,
  links: PreviewSourceLink[],
  products: PreviewSourceProduct[]
): PagePreviewData {
  return {
    username: page.username,
    bio: page.bio,
    avatarUrl: page.avatar_url,
    theme: page.theme,
    links: links.filter((l) => l.is_active),
    products: products
      .filter((p) => p.is_active)
      .map((p) => ({
        id: p.id,
        name: p.name,
        price_idr: p.price_idr,
        cover_image_url: p.cover_image_url,
        effectivePriceIdr: p.effective_price_idr,
        isFlashSaleActive: p.is_flash_sale_active,
        pwywEnabled: p.pwyw_enabled,
        pwywMinPriceIdr: p.pwyw_min_price_idr ?? undefined,
        isBundle: p.is_bundle,
        bundleOriginalPriceIdr: p.bundle_original_price_idr ?? undefined,
      })),
  };
}

// Tampilan halaman publik kreator -- dipakai di DUA tempat: halaman publik
// sungguhan (app/[username]/page.tsx, interactive=true, tautan bisa
// diklik & dilacak, tombol Beli memicu checkout sungguhan) dan pratinjau
// live di dashboard (interactive=false, supaya kreator yang sedang
// bereksperimen dengan tautan/produk/tema tidak sengaja memicu checkout
// sungguhan atau mengotori statistik klik miliknya sendiri).
export default function PagePreview({
  data,
  interactive = true,
  rootClassName = "min-h-screen",
}: {
  data: PagePreviewData;
  interactive?: boolean;
  rootClassName?: string;
}) {
  const theme = getPageTheme(data.theme);

  return (
    <main className={`relative ${rootClassName} ${theme.page}`}>
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center px-6 py-14">
        <div className="relative flex flex-col items-center">
          {theme.glow !== "hidden" && (
            <div
              aria-hidden
              className={`absolute -top-10 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full blur-3xl ${theme.glow}`}
            />
          )}

          {data.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.avatarUrl}
              alt={data.username}
              className={`relative h-24 w-24 rounded-full object-cover ${theme.avatarRing}`}
            />
          ) : (
            <div
              className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-white/20 font-heading text-2xl font-bold ${theme.name} ${theme.avatarRing}`}
            >
              {data.username.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="relative mt-5 text-center">
            <h1 className={`font-heading text-xl font-bold ${theme.name}`}>@{data.username}</h1>
            {data.bio && <p className={`mt-2 max-w-xs text-sm leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          </div>
        </div>

        {data.links.length > 0 && (
          <div className="mt-8 flex w-full flex-col gap-3">
            {data.links.map((link) =>
              interactive ? (
                <TrackedLink
                  key={link.id}
                  username={data.username}
                  linkId={link.id}
                  href={link.url}
                  className={`group flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
                >
                  <span className="truncate">{link.title}</span>
                  <IconChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${theme.chevron}`} />
                </TrackedLink>
              ) : (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
                >
                  <span className="truncate">{link.title}</span>
                  <IconChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${theme.chevron}`} />
                </a>
              )
            )}
          </div>
        )}

        {data.donation && (
          <div className={`mt-8 flex w-full flex-col items-center gap-2 rounded-2xl p-4 text-center ${theme.productCard}`}>
            <IconHeart className={`h-6 w-6 ${theme.chevron}`} />
            <p className={`text-sm font-semibold ${theme.productTitle}`}>{data.donation.title}</p>
            <p className={`text-xs ${theme.bio}`}>
              Mulai dari Rp {data.donation.minAmountIdr.toLocaleString("id-ID")}
            </p>
            {interactive ? (
              <div className="w-full">
                <BuyProductButton
                  productId={data.donation.productId}
                  buttonClassName={theme.buyButton}
                  pwywMinPriceIdr={data.donation.minAmountIdr}
                  hideVoucher
                  openLabel="Dukung"
                  submitLabel="Kirim Dukungan"
                />
              </div>
            ) : (
              <button
                type="button"
                disabled
                title="Pratinjau -- tombol ini tidak aktif"
                className={`mt-1 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
              >
                Dukung
              </button>
            )}
          </div>
        )}

        {data.products.length > 0 && (
          <div className="mt-8 w-full">
            <p className={`mb-3 text-xs font-bold uppercase tracking-wider ${theme.bio}`}>Produk</p>
            <div className="grid w-full grid-cols-2 gap-3">
              {data.products.map((product) => (
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
                  {product.pwywEnabled ? (
                    <p className={`text-xs font-bold ${theme.productPrice}`}>
                      Mulai dari Rp {(product.pwywMinPriceIdr ?? 0).toLocaleString("id-ID")}
                    </p>
                  ) : product.isBundle && product.bundleOriginalPriceIdr !== undefined ? (
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[10px] line-through opacity-60 ${theme.productPrice}`}>
                        Rp {product.bundleOriginalPriceIdr.toLocaleString("id-ID")}
                      </p>
                      <p className={`text-xs font-bold ${theme.productPrice}`}>
                        Rp {product.price_idr.toLocaleString("id-ID")}
                      </p>
                    </div>
                  ) : product.isFlashSaleActive && product.effectivePriceIdr !== undefined ? (
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[10px] line-through opacity-60 ${theme.productPrice}`}>
                        Rp {product.price_idr.toLocaleString("id-ID")}
                      </p>
                      <p className={`text-xs font-bold ${theme.productPrice}`}>
                        Rp {product.effectivePriceIdr.toLocaleString("id-ID")}
                      </p>
                    </div>
                  ) : (
                    <p className={`text-xs font-bold ${theme.productPrice}`}>
                      Rp {product.price_idr.toLocaleString("id-ID")}
                    </p>
                  )}
                  {interactive ? (
                    <BuyProductButton
                      productId={product.id}
                      buttonClassName={theme.buyButton}
                      pwywMinPriceIdr={product.pwywEnabled ? product.pwywMinPriceIdr : undefined}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Pratinjau -- tombol ini tidak aktif"
                      className={`mt-2.5 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
                    >
                      Beli
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          {interactive && data.id && <ReportButton pageId={data.id} className={theme.footer} />}
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
