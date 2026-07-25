import { CustomThemeConfig, getPageTheme } from "@/lib/page-themes";
import BookSlotButton from "@/components/BookSlotButton";
import BuyProductButton from "@/components/BuyProductButton";
import ContactFormBlock from "@/components/ContactFormBlock";
import FaqBlock, { FaqItem } from "@/components/FaqBlock";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import LoyaltyPointsWidget from "@/components/LoyaltyPointsWidget";
import LockedLinkButton from "@/components/LockedLinkButton";
import SocialProofToast from "@/components/SocialProofToast";
import TrackedLink from "@/components/TrackedLink";
import VideoEmbedBlock from "@/components/VideoEmbedBlock";
import ReportButton from "@/components/ReportButton";
import { RecentPurchase } from "@/lib/api-client";
import { IconBadgeCheck, IconBox, IconCalendar, IconChevronRight, IconHeart, IconMail } from "@/components/icons";

export interface PagePreviewLink {
  id: string;
  title: string;
  url: string;
  lockType?: "age" | "code" | "subscribe";
  lockMinAge?: number | null;
  // No.77 (Sprint 9): blok konten baru -- 'link' (default) tetap tautan
  // biasa, tipe lain punya rendering & interaksi sendiri sepenuhnya.
  blockType?: "link" | "video" | "contact_form" | "faq";
  blockData?: Record<string, unknown>;
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
  // No.91 (Sprint 11): kursus tampil di grid Produk yang sama, cukup
  // ditandai jumlah bab-nya.
  isCourse?: boolean;
  chapterCount?: number;
}

export interface PagePreviewDonation {
  productId: string;
  title: string;
  minAmountIdr: number;
}

// No.90 (Sprint 11): blok event.
export interface PagePreviewEvent {
  productId: string;
  name: string;
  description: string;
  effectivePriceIdr: number;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string;
  isOnline: boolean;
  spotsLeft: number | null;
}

// No.92 (Sprint 11): blok booking konsultasi.
export interface PagePreviewBooking {
  productId: string;
  name: string;
  description: string;
  priceIdr: number;
  durationMinutes: number;
  availableSlotCount: number;
}

export interface PagePreviewLeadCapture {
  title: string;
  collectEmail: boolean;
  collectWhatsapp: boolean;
}

export interface PagePreviewSocialProof {
  displaySeconds: number;
  intervalSeconds: number;
  recent: RecentPurchase[];
}

export interface PagePreviewData {
  id?: string;
  username: string;
  // No.98 (Sprint 14): diisi kalau ini halaman bio TAMBAHAN (bukan halaman
  // utama) -- membuat tracking klik/kunjungan lewat slug, bukan username
  // (lihat catatan di PageAnalytics/TrackedLink/LockedLinkButton).
  pageSlug?: string;
  bio: string;
  avatarUrl: string;
  theme: string;
  // No.88 (Sprint 10): badge terverifikasi -- dihitung backend dari email
  // terverifikasi + profil lengkap + minimal 1 transaksi sukses.
  isVerified?: boolean;
  links: PagePreviewLink[];
  products: PagePreviewProduct[];
  events?: PagePreviewEvent[];
  bookings?: PagePreviewBooking[];
  // No.94 (Sprint 13): cuma penanda ada/tidaknya program poin -- saldo
  // poin pengunjung dicek terpisah lewat LoyaltyPointsWidget (butuh email).
  loyaltyActive?: boolean;
  donation?: PagePreviewDonation;
  leadCapture?: PagePreviewLeadCapture;
  socialProof?: PagePreviewSocialProof;
  // No.72: kode ?ref= dari URL halaman publik -- diteruskan ke tombol Beli
  // tiap produk supaya checkout bisa mengaitkan order ke afiliator.
  referralCode?: string;
  // No.80 (Sprint 9): hanya dipakai kalau theme === "custom".
  customTheme?: CustomThemeConfig;
}

interface PreviewSourcePage {
  username: string;
  bio: string;
  avatar_url: string;
  theme: string;
  custom_background_type?: CustomThemeConfig["backgroundType"];
  custom_background_value?: string;
  custom_font?: CustomThemeConfig["font"];
  custom_button_color?: string;
  is_verified?: boolean;
}

interface PreviewSourceLink {
  id: string;
  title: string;
  url: string;
  is_active: boolean;
  lock_type?: "" | "age" | "code" | "subscribe";
  lock_min_age?: number | null;
  block_type?: "link" | "video" | "contact_form" | "faq";
  block_data?: Record<string, unknown>;
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
    isVerified: page.is_verified ?? false,
    customTheme:
      page.custom_background_type && page.custom_background_value && page.custom_font && page.custom_button_color
        ? {
            backgroundType: page.custom_background_type,
            backgroundValue: page.custom_background_value,
            font: page.custom_font,
            buttonColor: page.custom_button_color,
          }
        : undefined,
    links: links
      .filter((l) => l.is_active)
      .map((l) => ({
        id: l.id,
        title: l.title,
        url: l.url,
        lockType: l.lock_type || undefined,
        lockMinAge: l.lock_min_age,
        blockType: l.block_type,
        blockData: l.block_data,
      })),
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
  const theme = getPageTheme(data.theme, data.customTheme);

  return (
    <main className={`relative ${rootClassName} ${theme.page}`} style={theme.pageStyle}>
      {interactive && data.socialProof && (
        <SocialProofToast
          recent={data.socialProof.recent}
          displaySeconds={data.socialProof.displaySeconds}
          intervalSeconds={data.socialProof.intervalSeconds}
        />
      )}
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
            <h1 className={`flex items-center justify-center gap-1.5 font-heading text-xl font-bold ${theme.name}`}>
              @{data.username}
              {data.isVerified && (
                <span title="Kreator terverifikasi">
                  <IconBadgeCheck className="h-[18px] w-[18px] flex-shrink-0 text-primary" />
                </span>
              )}
            </h1>
            {data.bio && <p className={`mt-2 max-w-xs text-sm leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          </div>
        </div>

        {data.links.length > 0 && (
          <div className="mt-8 flex w-full flex-col gap-3">
            {data.links.map((link) => {
              // No.77: blok konten baru dirender sepenuhnya terpisah dari
              // tautan biasa -- tidak ada gerbang kunci/tracking klik untuk
              // tipe ini (di luar cakupan yang diminta).
              if (link.blockType === "video") {
                return (
                  <VideoEmbedBlock
                    key={link.id}
                    title={link.title}
                    videoUrl={(link.blockData?.video_url as string) ?? ""}
                    cardClassName={`w-full rounded-2xl p-3.5 ${theme.productCard}`}
                    titleClassName={theme.productTitle}
                  />
                );
              }
              if (link.blockType === "faq") {
                return (
                  <FaqBlock
                    key={link.id}
                    title={link.title}
                    items={(link.blockData?.items as FaqItem[]) ?? []}
                    cardClassName={`w-full rounded-2xl p-3.5 ${theme.productCard}`}
                    titleClassName={theme.productTitle}
                    itemTitleClassName={theme.cardTitle}
                    itemBodyClassName={theme.bio}
                  />
                );
              }
              if (link.blockType === "contact_form") {
                return interactive ? (
                  <ContactFormBlock
                    key={link.id}
                    linkId={link.id}
                    title={link.title}
                    cardClassName={`w-full rounded-2xl p-3.5 ${theme.productCard}`}
                    titleClassName={theme.productTitle}
                    inputClassName="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                    buttonClassName={theme.buyButton}
                  />
                ) : (
                  <div key={link.id} className={`w-full rounded-2xl p-3.5 text-center ${theme.productCard}`}>
                    <p className={`text-sm font-semibold ${theme.productTitle}`}>{link.title}</p>
                    <button
                      type="button"
                      disabled
                      title="Pratinjau -- tombol ini tidak aktif"
                      className={`mt-2 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
                    >
                      Kirim Pesan
                    </button>
                  </div>
                );
              }

              return link.lockType ? (
                interactive ? (
                  <LockedLinkButton
                    key={link.id}
                    username={data.username}
                    pageSlug={data.pageSlug}
                    linkId={link.id}
                    title={link.title}
                    lockType={link.lockType}
                    lockMinAge={link.lockMinAge ?? null}
                    className={`group flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
                  />
                ) : (
                  <button
                    key={link.id}
                    type="button"
                    disabled
                    title="Pratinjau -- tombol ini tidak aktif"
                    className={`flex w-full cursor-not-allowed items-center justify-between gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold opacity-80 ${theme.card} ${theme.cardTitle}`}
                  >
                    <span className="truncate">🔒 {link.title}</span>
                  </button>
                )
              ) : interactive ? (
                <TrackedLink
                  key={link.id}
                  username={data.username}
                  pageSlug={data.pageSlug}
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
              );
            })}
          </div>
        )}

        {data.leadCapture && (
          <div className={`mt-8 flex w-full flex-col items-center gap-2 rounded-2xl p-4 text-center ${theme.productCard}`}>
            <IconMail className={`h-6 w-6 ${theme.chevron}`} />
            <p className={`text-sm font-semibold ${theme.productTitle}`}>{data.leadCapture.title}</p>
            {interactive ? (
              <LeadCaptureForm
                username={data.username}
                collectEmail={data.leadCapture.collectEmail}
                collectWhatsapp={data.leadCapture.collectWhatsapp}
                inputClassName="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                buttonClassName={theme.buyButton}
              />
            ) : (
              <button
                type="button"
                disabled
                title="Pratinjau -- tombol ini tidak aktif"
                className={`mt-1 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
              >
                Daftar
              </button>
            )}
          </div>
        )}

        {data.loyaltyActive && interactive && (
          <div className={`mt-8 w-full rounded-2xl p-4 text-left ${theme.productCard}`}>
            <LoyaltyPointsWidget
              username={data.username}
              cardClassName=""
              titleClassName={theme.productTitle}
              buttonClassName={theme.buyButton}
            />
          </div>
        )}

        {data.events && data.events.length > 0 && (
          <div className="mt-8 w-full">
            <p className={`mb-3 text-xs font-bold uppercase tracking-wider ${theme.bio}`}>Event</p>
            <div className="flex w-full flex-col gap-3">
              {data.events.map((event) => {
                const startsLabel = new Intl.DateTimeFormat("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: event.timezone,
                }).format(new Date(event.startsAt));
                const soldOut = event.spotsLeft !== null && event.spotsLeft <= 0;
                return (
                  <div key={event.productId} className={`flex flex-col gap-2 rounded-2xl p-4 ${theme.productCard}`}>
                    <div className="flex items-center gap-2">
                      <IconCalendar className={`h-4 w-4 flex-shrink-0 ${theme.chevron}`} />
                      <p className={`text-sm font-semibold ${theme.productTitle}`}>{event.name}</p>
                    </div>
                    <p className={`text-xs ${theme.bio}`}>
                      {startsLabel} ({event.timezone}) &middot; {event.isOnline ? "Online" : event.location || "Offline"}
                    </p>
                    {event.description && <p className={`text-xs ${theme.bio}`}>{event.description}</p>}
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-bold ${theme.productTitle}`}>
                        Rp {event.effectivePriceIdr.toLocaleString("id-ID")}
                      </p>
                      {event.spotsLeft !== null && (
                        <p className={`text-[11px] ${theme.bio}`}>
                          {soldOut ? "Kuota penuh" : `${event.spotsLeft} slot tersisa`}
                        </p>
                      )}
                    </div>
                    {interactive ? (
                      <BuyProductButton
                        productId={event.productId}
                        buttonClassName={theme.buyButton}
                        openLabel={soldOut ? "Kuota Penuh" : "Daftar"}
                        submitLabel="Bayar & Daftar"
                        referralCode={data.referralCode}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="Pratinjau -- tombol ini tidak aktif"
                        className={`w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
                      >
                        Daftar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {data.bookings && data.bookings.length > 0 && (
          <div className="mt-8 w-full">
            <p className={`mb-3 text-xs font-bold uppercase tracking-wider ${theme.bio}`}>Booking Konsultasi</p>
            <div className="flex w-full flex-col gap-3">
              {data.bookings.map((booking) => (
                <div key={booking.productId} className={`flex flex-col gap-2 rounded-2xl p-4 ${theme.productCard}`}>
                  <div className="flex items-center gap-2">
                    <IconCalendar className={`h-4 w-4 flex-shrink-0 ${theme.chevron}`} />
                    <p className={`text-sm font-semibold ${theme.productTitle}`}>{booking.name}</p>
                  </div>
                  <p className={`text-xs ${theme.bio}`}>
                    {booking.durationMinutes} menit &middot; {booking.availableSlotCount} slot tersedia
                  </p>
                  {booking.description && <p className={`text-xs ${theme.bio}`}>{booking.description}</p>}
                  <p className={`text-sm font-bold ${theme.productTitle}`}>
                    Rp {booking.priceIdr.toLocaleString("id-ID")}
                  </p>
                  {interactive ? (
                    <BookSlotButton productId={booking.productId} buttonClassName={theme.buyButton} />
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Pratinjau -- tombol ini tidak aktif"
                      className={`w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
                    >
                      Pilih Jadwal
                    </button>
                  )}
                </div>
              ))}
            </div>
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
                  {product.isCourse && (
                    <p className={`text-[10px] opacity-70 ${theme.productPrice}`}>{product.chapterCount ?? 0} Bab</p>
                  )}
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
                      referralCode={data.referralCode}
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
