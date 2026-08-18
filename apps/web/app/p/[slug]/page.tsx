import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPageBySlug } from "@/lib/api-client";
import AnalyticsScripts from "@/components/AnalyticsScripts";
import PageAnalytics from "@/components/PageAnalytics";
import PagePreview from "@/components/PagePreview";
import PublicPageFrame from "@/components/PublicPageFrame";

type PageParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
};

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicPageBySlug(slug);

  if (!page) {
    return { title: "Halaman tidak ditemukan — Jeon.id" };
  }

  const displayName = page.display_name || page.username;
  const title = page.seo_title || `${displayName} — Jeon.id`;
  const description = page.seo_description || page.bio || `Lihat semua tautan ${displayName} di Jeon.id.`;

  return {
    title,
    description,
    robots: page.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      siteName: "Jeon.id",
      images: page.avatar_url ? [{ url: page.avatar_url }] : undefined,
      type: "profile",
    },
  };
}

// No.98 (Sprint 14): halaman bio TAMBAHAN, diakses lewat jeon.id/p/{slug}
// -- namespace terpisah dari jeon.id/{username} (halaman utama). Memakai
// ulang PagePreview yang SAMA seperti halaman utama -- produk/event/booking/
// dst yang tampil SAMA persis (monetisasi tetap per-akun, bukan per-halaman),
// hanya bio/avatar/tema/tautan yang berbeda per halaman.
export default async function ExtraBioPage({ params, searchParams }: PageParams) {
  const { slug } = await params;
  const { ref } = await searchParams;
  const page = await getPublicPageBySlug(slug);

  if (!page) {
    notFound();
  }

  return (
    <PublicPageFrame
      theme={page.theme}
      customTheme={{
        backgroundType: page.custom_background_type,
        backgroundValue: page.custom_background_value,
        font: page.custom_font,
        buttonColor: page.custom_button_color,
        buttonStyle: page.custom_button_style,
      }}
    >
      <AnalyticsScripts analytics={page.analytics} />
      <PageAnalytics username={page.username} slug={slug} />
      <PagePreview
        rootClassName="min-h-screen sm:min-h-0"
        data={{
          id: page.id,
          username: page.username,
          displayName: page.display_name,
          pageSlug: slug,
          pageType: page.page_type,
          bio: page.bio,
          avatarUrl: page.avatar_url,
          theme: page.theme,
          isVerified: page.is_verified,
          isPremium: page.is_premium,
          hideWatermark: page.hide_watermark,
          loyaltyActive: page.loyalty_active,
          stickers: page.stickers,
          customTheme: {
            backgroundType: page.custom_background_type,
            backgroundValue: page.custom_background_value,
            font: page.custom_font,
            buttonColor: page.custom_button_color,
            buttonStyle: page.custom_button_style,
          },
          links: page.links.map((l) => ({
            id: l.id,
            title: l.title,
            url: l.url,
            lockType: l.lock_type || undefined,
            lockMinAge: l.lock_min_age,
            blockType: l.block_type,
            blockData: l.block_data,
            customIconUrl: l.custom_icon_url || undefined,
            iconKey: l.icon_key || undefined,
            isFeatured: l.is_featured,
            thumbnailUrl: l.thumbnail_url || undefined,
          })),
          events: page.events.map((e) => ({
            productId: e.product_id,
            name: e.name,
            description: e.description,
            effectivePriceIdr: e.effective_price_idr,
            startsAt: e.starts_at,
            endsAt: e.ends_at,
            timezone: e.timezone,
            location: e.location,
            isOnline: e.is_online,
            spotsLeft: e.spots_left,
          })),
          bookings: page.bookings.map((b) => ({
            productId: b.product_id,
            name: b.name,
            description: b.description,
            priceIdr: b.price_idr,
            durationMinutes: b.duration_minutes,
            availableSlotCount: b.available_slot_count,
          })),
          products: page.products.map((p) => ({
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
            isCourse: p.is_course,
            chapterCount: p.chapter_count,
            isExternalLink: p.is_external_link,
            externalUrl: p.external_url,
            category: p.category,
          })),
          // instagramFeed/tiktokFeed -- Modul Koneksi Sosial (migrasi
          // 000069, permintaan langsung pengguna: "saya mau jeonme ini
          // bisa connect ke akun kita contoh nya instagram tiktok").
          instagramFeed: page.instagram_feed
            ? {
                platform: page.instagram_feed.platform,
                username: page.instagram_feed.username,
                items: page.instagram_feed.items.map((i) => ({ id: i.id, thumbnailUrl: i.thumbnail_url, url: i.url, caption: i.caption })),
              }
            : undefined,
          tiktokFeed: page.tiktok_feed
            ? {
                platform: page.tiktok_feed.platform,
                username: page.tiktok_feed.username,
                items: page.tiktok_feed.items.map((i) => ({ id: i.id, thumbnailUrl: i.thumbnail_url, url: i.url, caption: i.caption })),
              }
            : undefined,
          donation: page.donation
            ? {
                productId: page.donation.product_id,
                title: page.donation.title,
                minAmountIdr: page.donation.min_amount_idr,
                goalTitle: page.donation.goal_title,
                goalAmountIdr: page.donation.goal_amount_idr,
                goalRaisedIdr: page.donation.goal_raised_idr,
                wishlist: page.donation.wishlist.map((w) => ({
                  id: w.id,
                  name: w.name,
                  priceIdr: w.price_idr,
                  link: w.link,
                  raisedIdr: w.raised_idr,
                })),
              }
            : undefined,
          leadCapture: page.lead_capture
            ? {
                title: page.lead_capture.title,
                collectEmail: page.lead_capture.collect_email,
                collectWhatsapp: page.lead_capture.collect_whatsapp,
              }
            : undefined,
          socialProof: page.social_proof
            ? {
                displaySeconds: page.social_proof.display_seconds,
                intervalSeconds: page.social_proof.interval_seconds,
                recent: page.social_proof.recent,
              }
            : undefined,
          referralCode: ref,
          shopPaused: page.shop_paused,
          shopPausedMessage: page.shop_paused_message,
          social: {
            instagram: page.social_instagram,
            tiktok: page.social_tiktok,
            facebook: page.social_facebook,
            whatsapp: page.social_whatsapp,
            youtube: page.social_youtube,
            x: page.social_x,
            linkedin: page.social_linkedin,
            telegram: page.social_telegram,
            email: page.social_email,
          },
          layoutVariant: page.layout_variant,
          utmEnabled: page.analytics?.utm_enabled ?? false,
        }}
        interactive
      />
    </PublicPageFrame>
  );
}
