import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/api-client";
import PageAnalytics from "@/components/PageAnalytics";
import PagePreview from "@/components/PagePreview";

type PageParams = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ ref?: string }>;
};

// REQ-F-206: meta tag Open Graph supaya link halaman kreator tampil bagus
// saat dibagikan di WhatsApp/Instagram/X, dst.
export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { username } = await params;
  const page = await getPublicPage(username);

  if (!page) {
    return { title: "Halaman tidak ditemukan — Jeonme" };
  }

  // No.83 (Sprint 9): judul/deskripsi manual kreator MENGGANTIKAN default
  // kalau diisi -- melengkapi OG tags (No.32) yang sudah ada dengan kontrol
  // eksplisit, bukan cuma turunan otomatis dari username/bio.
  // displayName (permintaan langsung pengguna) dipakai di fallback kalau
  // sudah diisi -- supaya judul tab/preview media sosial konsisten dengan
  // heading yang tampil di halaman (mis. "PIKO" bukan "@username").
  const displayName = page.display_name || `@${page.username}`;
  const title = page.seo_title || `${displayName} — Jeonme`;
  const description = page.seo_description || page.bio || `Lihat semua tautan dan produk ${displayName} di Jeonme.`;

  return {
    title,
    description,
    robots: page.noindex ? { index: false, follow: false } : undefined,
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
export default async function CreatorPage({ params, searchParams }: PageParams) {
  const { username } = await params;
  const { ref } = await searchParams;
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
          displayName: page.display_name,
          bio: page.bio,
          avatarUrl: page.avatar_url,
          theme: page.theme,
          isVerified: page.is_verified,
          loyaltyActive: page.loyalty_active,
          customTheme: {
            backgroundType: page.custom_background_type,
            backgroundValue: page.custom_background_value,
            font: page.custom_font,
            buttonColor: page.custom_button_color,
            buttonStyle: page.custom_button_style,
            buttonRounded: page.custom_button_rounded,
            buttonShadow: page.custom_button_shadow,
            buttonTextColor: page.custom_button_text_color,
            pageTextColor: page.custom_page_text_color,
            titleFont: page.custom_title_font,
            titleColor: page.custom_title_color,
          },
          links: page.links.map((l) => ({
            id: l.id,
            title: l.title,
            url: l.url,
            lockType: l.lock_type || undefined,
            lockMinAge: l.lock_min_age,
            blockType: l.block_type,
            blockData: l.block_data,
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
        }}
        interactive
      />
    </>
  );
}
