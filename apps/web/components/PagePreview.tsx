import { CustomThemeConfig, PageTheme, getPageTheme } from "@/lib/page-themes";
import BookSlotButton from "@/components/BookSlotButton";
import BuyProductButton from "@/components/BuyProductButton";
import ContactFormBlock from "@/components/ContactFormBlock";
import FaqBlock, { FaqItem } from "@/components/FaqBlock";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import LoyaltyPointsWidget from "@/components/LoyaltyPointsWidget";
import LockedLinkButton from "@/components/LockedLinkButton";
import MapsEmbedBlock from "@/components/MapsEmbedBlock";
import SocialProofToast from "@/components/SocialProofToast";
import TrackedLink from "@/components/TrackedLink";
import VideoEmbedBlock from "@/components/VideoEmbedBlock";
import PageFooterLinks from "@/components/PageFooterLinks";
import ShareButton from "@/components/ShareButton";
import StickerIcon from "@/components/StickerIcon";
import { PageStickerData, RecentPurchase } from "@/lib/api-client";
import { IconBadgeCheck, IconBox, IconCalendar, IconChevronRight, IconHeart, IconMail } from "@/components/icons";
import { detectLinkIcon } from "@/lib/link-icons";

export interface PagePreviewLink {
  id: string;
  title: string;
  url: string;
  lockType?: "age" | "code" | "subscribe";
  lockMinAge?: number | null;
  // No.77 (Sprint 9): blok konten baru -- 'link' (default) tetap tautan
  // biasa, tipe lain punya rendering & interaksi sendiri sepenuhnya.
  // No.99 (Sprint 14): heading/text/image/button -- blok builder landing page.
  blockType?: "link" | "video" | "contact_form" | "faq" | "heading" | "text" | "image" | "button" | "maps";
  blockData?: Record<string, unknown>;
  // customIconUrl -- permintaan langsung pengguna: gambar kustom per
  // tautan, MENGGANTIKAN ikon platform yang terdeteksi otomatis dari URL
  // (lihat lib/link-icons.ts). Kosong berarti tetap pakai deteksi otomatis.
  customIconUrl?: string;
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
  // displayName -- permintaan langsung pengguna: nama tampilan bebas (mis.
  // "PIKO"), terpisah dari username. Kosong berarti kreator belum pernah
  // mengisi -- heading jatuh balik ke username TANPA "@" (lihat render di
  // bawah), bukan dipaksa isi.
  displayName?: string;
  // No.98 (Sprint 14): diisi kalau ini halaman bio TAMBAHAN (bukan halaman
  // utama) -- membuat tracking klik/kunjungan lewat slug, bukan username
  // (lihat catatan di PageAnalytics/TrackedLink/LockedLinkButton).
  pageSlug?: string;
  // pageType -- No.99 (Sprint 14): "landing" merender blok penuh-lebar
  // (heading/text/image/button/dst) TANPA avatar/produk/monetisasi, beda
  // dari layout bio biasa. Modul Halaman Produk: "produk" merender showcase
  // katalog Toko saja (avatar/nama/bio + grid produk), TANPA
  // tautan/donasi/lead-capture/event/booking/loyalty. Default "bio" kalau
  // tidak diisi.
  pageType?: "bio" | "landing" | "produk";
  bio: string;
  avatarUrl: string;
  theme: string;
  // No.88 (Sprint 10): badge terverifikasi -- dihitung backend dari email
  // terverifikasi + profil lengkap + minimal 1 transaksi sukses.
  isVerified?: boolean;
  // isPremium -- Modul Langganan Premium: kreator Premium tidak menampilkan
  // watermark "Buat halaman gratis di Jeonme" di bawah halaman publiknya.
  isPremium?: boolean;
  // hideWatermark -- Modul Langganan Premium (permintaan langsung pengguna,
  // 8 Agustus 2026): toggle yang bisa diatur SENDIRI oleh kreator Premium
  // untuk sembunyikan watermark. Watermark tampil kalau BUKAN Premium ATAU
  // togglenya mati -- lihat kondisi render pil watermark di bawah.
  hideWatermark?: boolean;
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
  // Modul Toko (Fase E5): true kalau kreator menjeda tokonya dari tab Shop
  // Settings -- tombol beli disembunyikan & pesannya ditampilkan sebagai
  // banner. Backend TETAP menolak checkout walau field ini dilewati/diubah
  // di klien (lihat checkout.go Create).
  shopPaused?: boolean;
  shopPausedMessage?: string;
  // stickers -- Modul Desain: stiker dekoratif INTERAKTIF (posisi & ukuran
  // sendiri per stiker, diatur lewat StickerCanvasEditor di dashboard).
  // Array kosong/undefined = tidak ada.
  stickers?: PageStickerData[];
}

interface PreviewSourcePage {
  username: string;
  display_name?: string;
  bio: string;
  avatar_url: string;
  theme: string;
  stickers?: PageStickerData[];
  custom_background_type?: CustomThemeConfig["backgroundType"];
  custom_background_value?: string;
  custom_font?: CustomThemeConfig["font"];
  custom_button_color?: string;
  custom_button_style?: CustomThemeConfig["buttonStyle"];
  custom_button_rounded?: CustomThemeConfig["buttonRounded"];
  custom_button_shadow?: CustomThemeConfig["buttonShadow"];
  custom_button_text_color?: string;
  custom_page_text_color?: string;
  custom_title_font?: CustomThemeConfig["titleFont"];
  custom_title_color?: string;
  custom_style_override?: boolean;
  is_verified?: boolean;
  is_premium?: boolean;
  hide_watermark?: boolean;
}

interface PreviewSourceLink {
  id: string;
  title: string;
  url: string;
  is_active: boolean;
  lock_type?: "" | "age" | "code" | "subscribe";
  lock_min_age?: number | null;
  block_type?: "link" | "video" | "contact_form" | "faq" | "heading" | "text" | "image" | "button" | "maps";
  block_data?: Record<string, unknown>;
  custom_icon_url?: string;
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
    displayName: page.display_name,
    bio: page.bio,
    avatarUrl: page.avatar_url,
    theme: page.theme,
    isVerified: page.is_verified ?? false,
    isPremium: page.is_premium ?? false,
    hideWatermark: page.hide_watermark ?? true,
    stickers: page.stickers,
    customTheme:
      page.custom_background_type && page.custom_background_value && page.custom_font && page.custom_button_color
        ? {
            backgroundType: page.custom_background_type,
            backgroundValue: page.custom_background_value,
            font: page.custom_font,
            buttonColor: page.custom_button_color,
            buttonStyle: page.custom_button_style ?? "fill",
            buttonRounded: page.custom_button_rounded ?? "full",
            buttonShadow: page.custom_button_shadow ?? "soft",
            buttonTextColor: page.custom_button_text_color ?? "",
            pageTextColor: page.custom_page_text_color ?? "",
            titleFont: page.custom_title_font ?? "",
            titleColor: page.custom_title_color ?? "",
            styleOverride: page.custom_style_override ?? false,
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
        customIconUrl: l.custom_icon_url || undefined,
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

// renderLinkOrBlock -- dipulas jadi fungsi berdiri sendiri (Modul Halaman
// Toko, 7 Agustus 2026) supaya bisa dipakai ulang oleh ProdukPagePreview di
// bawah, bukan cuma layout bio biasa -- sebelumnya JSX ini inline di dalam
// satu `.map()` di komponen default, sekarang jadi satu sumber kebenaran
// untuk cara SEMUA tipe halaman merender tautan/blok konten (link/video/
// faq/contact_form/maps/text -- persis tipe yang bisa ditambahkan lewat
// dashboard/links).
// StickerOverlay -- Modul Desain (koreksi langsung pengguna, 8 Agustus
// 2026): stiker dekoratif INTERAKTIF -- posisi & ukuran sendiri per stiker
// (diatur lewat StickerCanvasEditor di dashboard), TERSEBAR di seluruh
// kanvas halaman (bukan lagi satu badge tetap di pojok avatar). Murni
// visual di sini (tidak interaktif/tidak diklik -- interaksi drag/resize
// HANYA ada di StickerCanvasEditor saat mengedit, bukan di preview/halaman
// publik). x/y persen relatif terhadap elemen pembungkus (harus `relative`)
// -- lihat rumus posisi yang SAMA di StickerCanvasEditor. Dipakai bersama
// oleh layout bio biasa & ProdukPagePreview -- Landing (No.99, tanpa
// avatar/header sama sekali) SENGAJA tidak memakainya.
function StickerOverlay({ stickers }: { stickers?: PageStickerData[] }) {
  if (!stickers || stickers.length === 0) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {stickers.map((s) => (
        <div
          key={s.id}
          style={{ left: `${s.x}%`, top: `${s.y}%`, transform: `translate(-50%, -50%) scale(${s.scale})` }}
          className="absolute h-14 w-14 text-ink drop-shadow"
        >
          <StickerIcon type={s.type} className="h-full w-full" />
        </div>
      ))}
    </div>
  );
}

function renderLinkOrBlock(
  link: PagePreviewLink,
  theme: PageTheme,
  data: Pick<PagePreviewData, "username" | "pageSlug">,
  interactive: boolean
) {
  // No.77: blok konten baru dirender sepenuhnya terpisah dari tautan
  // biasa -- tidak ada gerbang kunci/tracking klik untuk tipe ini (di
  // luar cakupan yang diminta).
  if (link.blockType === "video") {
    return (
      <VideoEmbedBlock
        key={link.id}
        title={link.title}
        videoUrl={(link.blockData?.video_url as string) ?? ""}
        cardClassName={`w-full rounded-xl p-2.5 ${theme.productCard}`}
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
        cardClassName={`w-full rounded-xl p-2.5 ${theme.productCard}`}
        titleClassName={theme.productTitle}
        itemTitleClassName={theme.cardTitle}
        itemBodyClassName={theme.bio}
      />
    );
  }
  if (link.blockType === "maps") {
    return (
      <MapsEmbedBlock
        key={link.id}
        title={link.title}
        url={link.url}
        embed={Boolean(link.blockData?.embed)}
        embedLat={link.blockData?.embed_lat as number | undefined}
        embedLng={link.blockData?.embed_lng as number | undefined}
        linkClassName={`group relative flex w-full items-center justify-center gap-2 ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
      />
    );
  }
  if (link.blockType === "text") {
    // Benchmark Lynk.id: blok Teks -- paragraf polos, TANPA judul tampil
    // publik (judulnya cuma label internal dashboard) dan TANPA tautan/
    // klik apa pun.
    return (
      <div key={link.id} className={`w-full rounded-xl p-3 text-center ${theme.productCard}`}>
        <p className={`whitespace-pre-wrap text-xs leading-relaxed ${theme.bio}`}>
          {(link.blockData?.text as string) ?? ""}
        </p>
      </div>
    );
  }
  if (link.blockType === "contact_form") {
    return interactive ? (
      <ContactFormBlock
        key={link.id}
        linkId={link.id}
        title={link.title}
        cardClassName={`w-full rounded-xl p-2.5 ${theme.productCard}`}
        titleClassName={theme.productTitle}
        inputClassName="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
        buttonClassName={theme.buyButton}
      />
    ) : (
      <div key={link.id} className={`w-full rounded-xl p-2.5 text-center ${theme.productCard}`}>
        <p className={`text-xs font-semibold ${theme.productTitle}`}>{link.title}</p>
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

  // Tautan biasa (block_type default "link") -- gaya ala Linktree: judul
  // SELALU rata tengah di dalam tombol, ikon platform (kalau ada)
  // mengambang di kiri absolut supaya tidak menggeser judul dari titik
  // tengah tombol.
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
        className={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
      />
    ) : (
      <button
        key={link.id}
        type="button"
        disabled
        title="Pratinjau -- tombol ini tidak aktif"
        className={`relative flex w-full cursor-not-allowed items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold opacity-80 ${theme.card} ${theme.cardTitle}`}
      >
        <span className="w-full break-words text-center">🔒 {link.title}</span>
      </button>
    )
  ) : interactive ? (
    (() => {
      const { Icon: LinkPlatformIcon, iconColorClass } = detectLinkIcon(link.url);
      return (
        <TrackedLink
          key={link.id}
          username={data.username}
          pageSlug={data.pageSlug}
          linkId={link.id}
          href={link.url}
          className={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
        >
          <span className="absolute left-2 top-1/2 flex h-9 w-9 flex-shrink-0 -translate-y-1/2 items-center justify-center">
            {link.customIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.customIconUrl} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              <LinkPlatformIcon className={`h-7 w-7 ${iconColorClass}`} />
            )}
          </span>
          <span className="w-full break-words px-8 text-center">{link.title}</span>
        </TrackedLink>
      );
    })()
  ) : (
    (() => {
      const { Icon: LinkPlatformIcon, iconColorClass } = detectLinkIcon(link.url);
      return (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`group relative flex w-full items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
        >
          <span className="absolute left-2 top-1/2 flex h-9 w-9 flex-shrink-0 -translate-y-1/2 items-center justify-center">
            {link.customIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.customIconUrl} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              <LinkPlatformIcon className={`h-7 w-7 ${iconColorClass}`} />
            )}
          </span>
          <span className="w-full break-words px-8 text-center">{link.title}</span>
        </a>
      );
    })()
  );
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
  // Modul Toko (Fase E5): toko dijeda -- semua tombol beli/daftar/booking
  // dinonaktifkan di frontend juga (bukan cuma backend), supaya pengunjung
  // tidak membuka form checkout yang pasti ditolak.
  const canBuy = interactive && !data.shopPaused;

  // No.99 (Sprint 14): halaman landing dirender TERPISAH -- blok penuh-lebar
  // saja (heading/text/image/button/dst), TANPA avatar/bio-header/produk/
  // monetisasi, beda dari layout bio biasa di bawah.
  if (data.pageType === "landing") {
    // Landing page (No.99) tidak punya produk/monetisasi sama sekali --
    // shop_paused tidak relevan di sini, tetap pakai `interactive` biasa.
    return <LandingPagePreview data={data} interactive={interactive} rootClassName={rootClassName} theme={theme} />;
  }

  // Modul Halaman Produk: showcase katalog Toko saja -- TANPA
  // tautan/donasi/lead-capture/event/booking/loyalty, beda dari layout bio
  // biasa & dari layout landing (blok manual) di atas.
  if (data.pageType === "produk") {
    return <ProdukPagePreview data={data} rootClassName={rootClassName} theme={theme} canBuy={canBuy} interactive={interactive} />;
  }

  return (
    <main className={`relative ${rootClassName} ${theme.page}`} style={theme.pageStyle}>
      <StickerOverlay stickers={data.stickers} />
      {interactive && data.socialProof && (
        <SocialProofToast
          recent={data.socialProof.recent}
          displaySeconds={data.socialProof.displaySeconds}
          intervalSeconds={data.socialProof.intervalSeconds}
        />
      )}
      {/* Topbar: cuma tombol share kanan -- logo Jeonme di pojok kiri
          DIHILANGKAN (permintaan langsung pengguna), branding Jeonme cukup
          lewat pil "Buat halaman gratis di Jeonme" di bagian bawah. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-end p-4">
        <ShareButton title={`@${data.username} — Jeonme`} url={data.pageSlug ? `https://jeonme.com/p/${data.pageSlug}` : `https://jeonme.com/${data.username}`} />
      </div>
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center px-6 py-14">
        <div className="relative flex flex-col items-center">
          {theme.glow !== "hidden" && (
            <div
              aria-hidden
              className={`absolute -top-10 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full blur-3xl ${theme.glow}`}
            />
          )}

          <div className="relative">
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
          </div>

          <div className="relative mt-5 text-center">
            <h1
              className={`flex items-center justify-center gap-1.5 font-heading text-base font-bold ${theme.name}`}
              style={theme.nameStyle}
            >
              {data.displayName || data.username}
              {data.isVerified && (
                <span title="Kreator terverifikasi">
                  <IconBadgeCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                </span>
              )}
            </h1>
            {data.bio && <p className={`mt-2 max-w-xs text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          </div>
        </div>

        {data.shopPaused && (
          <div className={`mt-6 w-full rounded-xl p-2.5 text-center text-xs font-semibold ${theme.productCard} ${theme.bio}`}>
            {data.shopPausedMessage || "Toko sedang dijeda sementara oleh pemiliknya."}
          </div>
        )}

        {data.links.length > 0 && (
          <div className="mt-8 flex w-full flex-col gap-2.5">
            {data.links.map((link) => renderLinkOrBlock(link, theme, data, interactive))}
          </div>
        )}

        {data.leadCapture && (
          <div className={`mt-8 flex w-full flex-col items-center gap-2 rounded-xl p-2.5 text-center ${theme.productCard}`}>
            <IconMail className={`h-5 w-5 ${theme.chevron}`} />
            <p className={`text-xs font-semibold ${theme.productTitle}`}>{data.leadCapture.title}</p>
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
          <div className={`mt-8 w-full rounded-xl p-3 text-left ${theme.productCard}`}>
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
                  <div key={event.productId} className={`flex flex-col gap-1.5 rounded-xl p-2.5 ${theme.productCard}`}>
                    <div className="flex items-center gap-2">
                      <IconCalendar className={`h-3.5 w-3.5 flex-shrink-0 ${theme.chevron}`} />
                      <p className={`text-xs font-semibold ${theme.productTitle}`}>{event.name}</p>
                    </div>
                    <p className={`text-[11px] ${theme.bio}`}>
                      {startsLabel} ({event.timezone}) &middot; {event.isOnline ? "Online" : event.location || "Offline"}
                    </p>
                    {event.description && <p className={`text-[11px] ${theme.bio}`}>{event.description}</p>}
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-bold ${theme.productTitle}`}>
                        Rp {event.effectivePriceIdr.toLocaleString("id-ID")}
                      </p>
                      {event.spotsLeft !== null && (
                        <p className={`text-[11px] ${theme.bio}`}>
                          {soldOut ? "Kuota penuh" : `${event.spotsLeft} slot tersisa`}
                        </p>
                      )}
                    </div>
                    {canBuy ? (
                      <BuyProductButton
                        productId={event.productId}
                        buttonClassName={theme.buyButton}
                        openLabel={soldOut ? "Kuota Penuh" : "Daftar"}
                        submitLabel="Bayar & Daftar"
                        referralCode={data.referralCode}
                        username={data.username}
                        pageSlug={data.pageSlug}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled
                        title={data.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
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
                <div key={booking.productId} className={`flex flex-col gap-1.5 rounded-xl p-2.5 ${theme.productCard}`}>
                  <div className="flex items-center gap-2">
                    <IconCalendar className={`h-3.5 w-3.5 flex-shrink-0 ${theme.chevron}`} />
                    <p className={`text-xs font-semibold ${theme.productTitle}`}>{booking.name}</p>
                  </div>
                  <p className={`text-[11px] ${theme.bio}`}>
                    {booking.durationMinutes} menit &middot; {booking.availableSlotCount} slot tersedia
                  </p>
                  {booking.description && <p className={`text-[11px] ${theme.bio}`}>{booking.description}</p>}
                  <p className={`text-xs font-bold ${theme.productTitle}`}>
                    Rp {booking.priceIdr.toLocaleString("id-ID")}
                  </p>
                  {canBuy ? (
                    <BookSlotButton productId={booking.productId} buttonClassName={theme.buyButton} />
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={data.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
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
          <div className={`mt-8 flex w-full flex-col items-center gap-2 rounded-xl p-2.5 text-center ${theme.productCard}`}>
            <IconHeart className={`h-5 w-5 ${theme.chevron}`} />
            <p className={`text-xs font-semibold ${theme.productTitle}`}>{data.donation.title}</p>
            <p className={`text-xs ${theme.bio}`}>
              Mulai dari Rp {data.donation.minAmountIdr.toLocaleString("id-ID")}
            </p>
            {canBuy ? (
              <div className="w-full">
                <BuyProductButton
                  productId={data.donation.productId}
                  buttonClassName={theme.buyButton}
                  pwywMinPriceIdr={data.donation.minAmountIdr}
                  hideVoucher
                  openLabel="Dukung"
                  submitLabel="Kirim Dukungan"
                  username={data.username}
                  pageSlug={data.pageSlug}
                />
              </div>
            ) : (
              <button
                type="button"
                disabled
                title={data.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
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
                <div key={product.id} className={`flex flex-col rounded-xl p-2.5 ${theme.productCard}`}>
                  <div className={`mb-2 flex aspect-square items-center justify-center rounded-xl ${theme.card}`}>
                    {product.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.cover_image_url}
                        alt={product.name}
                        className="h-full w-full rounded-xl object-cover"
                      />
                    ) : (
                      <IconBox className={`h-6 w-6 ${theme.chevron}`} />
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
                  {canBuy ? (
                    <BuyProductButton
                      productId={product.id}
                      buttonClassName={theme.buyButton}
                      pwywMinPriceIdr={product.pwywEnabled ? product.pwywMinPriceIdr : undefined}
                      referralCode={data.referralCode}
                      username={data.username}
                      pageSlug={data.pageSlug}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={data.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
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
          {/* Modul Langganan Premium (permintaan langsung pengguna, 8
              Agustus 2026): kreator gratis SELALU tampil watermark ini,
              apa pun nilai hideWatermark -- kreator Premium bisa
              menyembunyikannya sendiri lewat toggle di Desain/Halaman Toko
              (lihat isPremiumUser backend & PagePreviewData.hideWatermark). */}
          {(!data.isPremium || !data.hideWatermark) && (
            <a
              href="https://jeonme.com/register"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-ink shadow-card transition-transform hover:scale-105"
            >
              Buat halaman gratis di Jeonme
            </a>
          )}
          {/* Footer SELALU tampil, termasuk di pratinjau dashboard
              (interactive=false) -- permintaan langsung pengguna: "tampilkan
              seluruh footer privacy dll", sebelumnya sengaja disembunyikan
              di pratinjau. Item "Laporkan" sudah aman tanpa pageId (fallback
              pesan "tidak tersedia", lihat PageFooterLinks). */}
          <PageFooterLinks
            pageId={data.id}
            username={data.username}
            bio={data.bio}
            isVerified={data.isVerified}
            footerClassName={theme.footer}
          />
        </div>
      </div>
    </main>
  );
}

// LandingPagePreview -- No.99 (Sprint 14): halaman landing, penuh-lebar,
// blok saja (heading/text/image/button + video/faq/contact_form yang sudah
// ada dari No.77). TIDAK ada avatar/bio-header/produk/monetisasi -- landing
// page difokuskan buat satu tujuan/kampanye tertentu, bukan mini-toko.
// TANPA "Create with AI" (keputusan eksplisit pengguna): semua blok dibuat
// manual lewat dashboard, bukan digenerate model bahasa.
function LandingPagePreview({
  data,
  interactive,
  rootClassName,
  theme,
}: {
  data: PagePreviewData;
  interactive: boolean;
  rootClassName: string;
  theme: PageTheme;
}) {
  return (
    <main className={`relative ${rootClassName} ${theme.page}`} style={theme.pageStyle}>
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-end p-4">
        <ShareButton title={`@${data.username} — Jeonme`} url={data.pageSlug ? `https://jeonme.com/p/${data.pageSlug}` : `https://jeonme.com/${data.username}`} />
      </div>
      <div className="mx-auto flex min-h-full max-w-xl flex-col items-center gap-5 px-6 py-14">
        {data.links.map((block) => {
          switch (block.blockType) {
            case "heading":
              return (
                <h1 key={block.id} className={`text-center font-heading text-xl font-bold ${theme.name}`}>
                  {(block.blockData?.text as string) ?? ""}
                </h1>
              );
            case "text":
              return (
                <p key={block.id} className={`max-w-lg text-center text-xs leading-relaxed ${theme.bio}`}>
                  {(block.blockData?.text as string) ?? ""}
                </p>
              );
            case "image":
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={block.id}
                  src={(block.blockData?.image_url as string) ?? ""}
                  alt={(block.blockData?.caption as string) || block.title}
                  className="w-full rounded-xl object-cover"
                />
              );
            case "button":
              return interactive ? (
                <TrackedLink
                  key={block.id}
                  username={data.username}
                  pageSlug={data.pageSlug}
                  linkId={block.id}
                  href={block.url}
                  className={`flex w-full max-w-sm items-center justify-center ${theme.cardRounded ?? "rounded-xl"} px-4 py-2.5 text-center text-xs font-bold transition-all duration-300 ${theme.buyButton}`}
                >
                  {block.title}
                </TrackedLink>
              ) : (
                <button
                  key={block.id}
                  type="button"
                  disabled
                  title="Pratinjau -- tombol ini tidak aktif"
                  className={`w-full max-w-sm cursor-not-allowed ${theme.cardRounded ?? "rounded-xl"} px-4 py-2.5 text-center text-xs font-bold opacity-80 ${theme.buyButton}`}
                >
                  {block.title}
                </button>
              );
            case "video":
              return (
                <VideoEmbedBlock
                  key={block.id}
                  title={block.title}
                  videoUrl={(block.blockData?.video_url as string) ?? ""}
                  cardClassName={`w-full rounded-xl p-2.5 ${theme.productCard}`}
                  titleClassName={theme.productTitle}
                />
              );
            case "faq":
              return (
                <FaqBlock
                  key={block.id}
                  title={block.title}
                  items={(block.blockData?.items as FaqItem[]) ?? []}
                  cardClassName={`w-full rounded-xl p-2.5 ${theme.productCard}`}
                  titleClassName={theme.productTitle}
                  itemTitleClassName={theme.cardTitle}
                  itemBodyClassName={theme.bio}
                />
              );
            case "maps":
              return (
                <MapsEmbedBlock
                  key={block.id}
                  title={block.title}
                  url={block.url}
                  embed={Boolean(block.blockData?.embed)}
                  embedLat={block.blockData?.embed_lat as number | undefined}
                  embedLng={block.blockData?.embed_lng as number | undefined}
                  linkClassName={`group relative flex w-full items-center justify-center gap-2 ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
                />
              );
            case "contact_form":
              return interactive ? (
                <ContactFormBlock
                  key={block.id}
                  linkId={block.id}
                  title={block.title}
                  cardClassName={`w-full rounded-xl p-2.5 ${theme.productCard}`}
                  titleClassName={theme.productTitle}
                  inputClassName="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                  buttonClassName={theme.buyButton}
                />
              ) : (
                <div key={block.id} className={`w-full rounded-xl p-2.5 text-center ${theme.productCard}`}>
                  <p className={`text-xs font-semibold ${theme.productTitle}`}>{block.title}</p>
                </div>
              );
            default:
              return interactive ? (
                <TrackedLink
                  key={block.id}
                  username={data.username}
                  pageSlug={data.pageSlug}
                  linkId={block.id}
                  href={block.url}
                  className={`flex w-full items-center justify-between gap-3 ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold transition-all duration-300 ${theme.card} ${theme.cardTitle}`}
                >
                  <span className="truncate">{block.title}</span>
                  <IconChevronRight className={`h-4 w-4 flex-shrink-0 ${theme.chevron}`} />
                </TrackedLink>
              ) : (
                <div
                  key={block.id}
                  className={`flex w-full items-center justify-between gap-3 ${theme.cardRounded ?? "rounded-xl"} px-4 py-3.5 text-[11px] font-semibold opacity-80 ${theme.card} ${theme.cardTitle}`}
                >
                  <span className="truncate">{block.title}</span>
                </div>
              );
          }
        })}

        <div className="mt-6 flex flex-col items-center gap-3">
          {(!data.isPremium || !data.hideWatermark) && (
            <a
              href="https://jeonme.com/register"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-ink shadow-card transition-transform hover:scale-105"
            >
              Buat halaman gratis di Jeonme
            </a>
          )}
          {/* Footer SELALU tampil, termasuk di pratinjau dashboard
              (interactive=false) -- permintaan langsung pengguna: "tampilkan
              seluruh footer privacy dll", sebelumnya sengaja disembunyikan
              di pratinjau. Item "Laporkan" sudah aman tanpa pageId (fallback
              pesan "tidak tersedia", lihat PageFooterLinks). */}
          <PageFooterLinks
            pageId={data.id}
            username={data.username}
            bio={data.bio}
            isVerified={data.isVerified}
            footerClassName={theme.footer}
          />
        </div>
      </div>
    </main>
  );
}

// ProdukPagePreview -- Modul Halaman Produk: kreator gratis dapat 1 halaman
// tipe ini, Premium sampai 5 (pool TERPISAH dari bio/landing, lihat
// freeProdukPageLimit/premiumProdukPageLimit di page.go). Showcase katalog
// Toko yang SAMA dengan halaman utama (produk per-akun, bukan per-halaman --
// lihat catatan lingkup di CreatePage), header avatar+nama+bio + (Modul
// Halaman Toko, 7 Agustus 2026) blok/tautan sendiri (link/video/faq/
// contact_form/maps/text -- lihat renderLinkOrBlock) TETAP TANPA donasi/
// lead-capture/event/booking/loyalty, yang account-wide (satu per akun,
// bukan per-halaman) jadi tidak bisa diduplikasi per halaman tambahan.
function ProdukPagePreview({
  data,
  rootClassName,
  theme,
  canBuy,
  interactive,
}: {
  data: PagePreviewData;
  rootClassName: string;
  theme: PageTheme;
  canBuy: boolean;
  interactive: boolean;
}) {
  return (
    <main className={`relative ${rootClassName} ${theme.page}`} style={theme.pageStyle}>
      <StickerOverlay stickers={data.stickers} />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-end p-4">
        <ShareButton title={`@${data.username} — Jeonme`} url={data.pageSlug ? `https://jeonme.com/p/${data.pageSlug}` : `https://jeonme.com/${data.username}`} />
      </div>
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center px-6 py-14">
        <div className="relative flex flex-col items-center">
          {theme.glow !== "hidden" && (
            <div
              aria-hidden
              className={`absolute -top-10 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full blur-3xl ${theme.glow}`}
            />
          )}

          <div className="relative">
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
          </div>

          <div className="relative mt-5 text-center">
            <h1
              className={`flex items-center justify-center gap-1.5 font-heading text-base font-bold ${theme.name}`}
              style={theme.nameStyle}
            >
              {data.displayName || data.username}
              {data.isVerified && (
                <span title="Kreator terverifikasi">
                  <IconBadgeCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                </span>
              )}
            </h1>
            {data.bio && <p className={`mt-2 max-w-xs text-xs leading-relaxed ${theme.bio}`}>{data.bio}</p>}
          </div>
        </div>

        {data.shopPaused && (
          <div className={`mt-6 w-full rounded-xl p-2.5 text-center text-xs font-semibold ${theme.productCard} ${theme.bio}`}>
            {data.shopPausedMessage || "Toko sedang dijeda sementara oleh pemiliknya."}
          </div>
        )}

        {data.links.length > 0 && (
          <div className="mt-8 flex w-full flex-col gap-2.5">
            {data.links.map((link) => renderLinkOrBlock(link, theme, data, interactive))}
          </div>
        )}

        {data.products.length > 0 ? (
          <div className="mt-8 w-full">
            <div className="grid w-full grid-cols-2 gap-3">
              {data.products.map((product) => (
                <div key={product.id} className={`flex flex-col rounded-xl p-2.5 ${theme.productCard}`}>
                  <div className={`mb-2 flex aspect-square items-center justify-center rounded-xl ${theme.card}`}>
                    {product.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.cover_image_url}
                        alt={product.name}
                        className="h-full w-full rounded-xl object-cover"
                      />
                    ) : (
                      <IconBox className={`h-6 w-6 ${theme.chevron}`} />
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
                  {canBuy ? (
                    <BuyProductButton
                      productId={product.id}
                      buttonClassName={theme.buyButton}
                      pwywMinPriceIdr={product.pwywEnabled ? product.pwywMinPriceIdr : undefined}
                      referralCode={data.referralCode}
                      username={data.username}
                      pageSlug={data.pageSlug}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={data.shopPaused ? "Toko sedang dijeda" : "Pratinjau -- tombol ini tidak aktif"}
                      className={`mt-2.5 w-full cursor-not-allowed rounded-lg py-1.5 text-xs opacity-80 ${theme.buyButton}`}
                    >
                      Beli
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className={`mt-8 text-center text-xs ${theme.bio}`}>Belum ada produk untuk ditampilkan.</p>
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          {(!data.isPremium || !data.hideWatermark) && (
            <a
              href="https://jeonme.com/register"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-ink shadow-card transition-transform hover:scale-105"
            >
              Buat halaman gratis di Jeonme
            </a>
          )}
          <PageFooterLinks
            pageId={data.id}
            username={data.username}
            bio={data.bio}
            isVerified={data.isVerified}
            footerClassName={theme.footer}
          />
        </div>
      </div>
    </main>
  );
}
