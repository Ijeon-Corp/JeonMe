import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPageBySlug } from "@/lib/api-client";
import AnalyticsScripts from "@/components/AnalyticsScripts";
import JsonLd from "@/components/JsonLd";
import CookieConsent from "@/components/CookieConsent";
import PageAnalytics from "@/components/PageAnalytics";
import PagePreview from "@/components/PagePreview";
import PublicPageFrame from "@/components/PublicPageFrame";
import { SITE_URL } from "@/lib/site";
import { creatorSubpageSchema } from "@/lib/structured-data";

type PageParams = {
  params: Promise<{ username: string; slug: string }>;
  searchParams: Promise<{ ref?: string }>;
};

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { username, slug } = await params;
  const page = await getPublicPageBySlug(username, slug);

  if (!page) {
    return { title: "Halaman tidak ditemukan — Jeon.id" };
  }

  const displayName = page.display_name || page.username;
  const title = page.seo_title || `${displayName} — Jeon.id`;
  const description = page.seo_description || page.bio || `Lihat semua tautan ${displayName} di Jeon.id.`;

  return {
    title,
    description,
    // alternates.canonical -- perbaikan SEO (susulan 22 September 2026,
    // lihat catatan lengkap di app/[username]/page.tsx), berlaku sama utk
    // halaman tambahan (Toko/landing/bio ekstra).
    alternates: { canonical: `${SITE_URL}/${username}/${slug}` },
    robots: page.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${username}/${slug}`,
      siteName: "Jeon.id",
      images: page.avatar_url ? [{ url: page.avatar_url }] : undefined,
      type: "profile",
    },
    // twitter -- 24 September 2026 (audit UX pembeli): halaman utama sudah
    // punya, rute ini belum, jadi pratinjau tautan Toko di X jatuh ke
    // default. Isinya disamakan persis dengan app/[username]/page.tsx.
    twitter: {
      card: "summary",
      title,
      description,
      images: page.avatar_url ? [page.avatar_url] : undefined,
    },
  };
}

// No.98 (Sprint 14): halaman bio TAMBAHAN, diakses lewat
// jeon.id/{username}/{slug} -- namespace terpisah dari jeon.id/{username}
// (halaman utama, satu segmen saja). Revisi 28 Agustus 2026 (permintaan
// langsung pengguna): sebelumnya jeon.id/p/{slug} dengan slug unik GLOBAL
// (lihat riwayat file app/p/[slug]/page.tsx, DIHAPUS di revisi ini) --
// slug sekarang cuma unik PER-USER (migrasi 000079), jadi username wajib
// ikut jadi bagian URL supaya dua akun berbeda bisa pakai slug yang sama
// tanpa tabrakan. Memakai ulang PagePreview yang SAMA seperti halaman
// utama -- produk/event/dst yang tampil SAMA persis (monetisasi
// tetap per-akun, bukan per-halaman), hanya bio/avatar/tema/tautan yang
// berbeda per halaman.
export default async function ExtraBioPage({ params, searchParams }: PageParams) {
  const { username, slug } = await params;
  const { ref } = await searchParams;
  const page = await getPublicPageBySlug(username, slug);

  if (!page) {
    notFound();
  }

  return (
    <PublicPageFrame
      theme={page.theme}
      // 7 field terakhir DITAMBAHKAN 24 September 2026 (audit UX pembeli).
      // SEBELUMNYA rute halaman tambahan/Toko ini cuma meneruskan 5 dari 12
      // field customTheme yang diteruskan rute halaman utama, padahal API
      // MENGIRIM keduabelasnya dengan benar -- murni frontend yang membuang.
      // Akibatnya kreator mengatur warna brand-nya, melihatnya benar di
      // editor & di halaman utama, lalu halaman TOKO yang justru dia sebar
      // untuk jualan tampil dengan warna default Jeon: tombol Beli ungu
      // bawaan & judul hitam bawaan, bukan warnanya sendiri. Bertentangan
      // langsung dengan kontrak "fitur paritas penuh" Bio <-> Toko di
      // CLAUDE.md.
      customTheme={{
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
        styleOverride: page.custom_style_override,
      }}
    >
      <JsonLd
        data={creatorSubpageSchema({
          username: page.username,
          displayName: page.display_name || `@${page.username}`,
          slug,
          title: page.seo_title || page.display_name || `@${page.username}`,
          description: page.seo_description || page.bio,
        })}
      />
      <AnalyticsScripts analytics={page.analytics} />
      <CookieConsent hasAnalytics={!!page.analytics?.ga_measurement_id} hasMarketing={!!page.analytics?.fb_pixel_id} />
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
          // 7 field terakhir ditambahkan bersamaan dengan yang di
          // PublicPageFrame di atas -- lihat catatan lengkap di sana. Kedua
          // tempat ini harus sinkron: PublicPageFrame mengatur kerangka
          // halaman (latar/font halaman), PagePreview merender isi blok &
          // tombolnya. Kalau cuma salah satu diperbaiki, tombol/judul tetap
          // memakai warna default.
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
            styleOverride: page.custom_style_override,
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
            iconColor: l.icon_color || undefined,
            isFeatured: l.is_featured,
            thumbnailUrl: l.thumbnail_url || undefined,
            description: l.description || undefined,
            accentColor: l.accent_color || undefined,
            badgeText: l.badge_text || undefined,
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
            soldCount: p.sold_count,
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
                collectTelegram: page.lead_capture.collect_telegram,
                magnetTitle: page.lead_capture.magnet_title,
                hasVoucher: page.lead_capture.has_voucher,
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
          showProfileHeader: page.show_profile_header,
          sitePages: page.site_pages.map((sp) => ({
            name: sp.name,
            slug: sp.slug,
            pageType: sp.page_type,
            isPrimary: sp.is_primary,
          })),
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
            github: page.social_github,
            website: page.social_website,
          },
          layoutVariant: page.layout_variant,
          profileExtras: page.profile_extras,
          builderMode: page.builder_mode,
          utmEnabled: page.analytics?.utm_enabled ?? false,
        }}
        interactive
      />
    </PublicPageFrame>
  );
}
