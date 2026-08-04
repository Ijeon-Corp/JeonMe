import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPageBySlug } from "@/lib/api-client";
import PageAnalytics from "@/components/PageAnalytics";
import PagePreview from "@/components/PagePreview";

type PageParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
};

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicPageBySlug(slug);

  if (!page) {
    return { title: "Halaman tidak ditemukan — Jeonme" };
  }

  const displayName = page.display_name || page.username;
  const title = page.seo_title || `${displayName} — Jeonme`;
  const description = page.seo_description || page.bio || `Lihat semua tautan ${displayName} di Jeonme.`;

  return {
    title,
    description,
    robots: page.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      siteName: "Jeonme",
      images: page.avatar_url ? [{ url: page.avatar_url }] : undefined,
      type: "profile",
    },
  };
}

// No.98 (Sprint 14): halaman bio TAMBAHAN, diakses lewat jeonme.com/p/{slug}
// -- namespace terpisah dari jeonme.com/{username} (halaman utama). Memakai
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
    <>
      <PageAnalytics username={page.username} slug={slug} />
      <PagePreview
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
          loyaltyActive: page.loyalty_active,
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
          })),
          donation: page.donation
            ? {
                productId: page.donation.product_id,
                title: page.donation.title,
                minAmountIdr: page.donation.min_amount_idr,
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
        }}
        interactive
      />
    </>
  );
}
