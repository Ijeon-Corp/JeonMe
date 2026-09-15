import type { PagePreviewData, PreviewSourcePage, PreviewSourceLink, PreviewSourceProduct } from "@/components/PagePreview";

// Dipindahkan keluar dari PagePreview.tsx (30 Agustus 2026): fungsi ini murni
// transformasi data (tidak butuh apa pun dari ~20 komponen blok publik yang
// diimpor PagePreview.tsx), tapi sebelumnya diimpor statis oleh
// LivePreviewPanel.tsx bersama komponen PagePreview itu sendiri -- import
// bernama (toPreviewData) memaksa seluruh modul PagePreview.tsx (3000+
// baris) ikut ke bundle sinkron dashboard, membatalkan manfaat men-dynamic-
// import komponen PagePreview via next/dynamic. Modul terpisah ini
// memisahkan keduanya: LivePreviewPanel.tsx impor toPreviewData dari sini
// (ringan, sinkron) dan PagePreview lewat next/dynamic (berat, lazy).
export function toPreviewData(
  page: PreviewSourcePage,
  links: PreviewSourceLink[],
  products: PreviewSourceProduct[],
  // includeInactiveProducts -- bug ditemukan lewat laporan langsung
  // pengguna, 11 September 2026 ("hasil create new product lewat builder
  // tidak ada gambar yang tampil di builder nya"): produk Digital BARU
  // (beda dari Payment Link/Link Eksternal) TIDAK auto-aktif begitu dibuat
  // -- filter `is_active` di bawah (dibutuhkan supaya halaman PUBLIK tidak
  // pernah menampilkan produk draft) membuat blok "produk" yang baru saja
  // memilih produk digital itu jatuh ke placeholder kosong di kanvas
  // Builder, padahal kreator sedang melihat PRATINJAU MILIKNYA SENDIRI
  // (BuilderCanvas.tsx, `interactive={false}`, tidak pernah dilihat
  // pengunjung sungguhan) -- SEHARUSNYA tetap terlihat apa pun status
  // aktifnya, sama seperti field draft lain di rute Builder. Default false
  // (perilaku lama, WAJIB untuk rute publik `[username]`/`[username]/[slug]`).
  includeInactiveProducts = false
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
    showProfileHeader: page.show_profile_header ?? true,
    stickers: page.stickers,
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
    builderMode: page.builder_mode,
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
        iconKey: l.icon_key || undefined,
        iconColor: l.icon_color || undefined,
        isFeatured: l.is_featured,
        thumbnailUrl: l.thumbnail_url || undefined,
        description: l.description || undefined,
      })),
    products: products
      .filter((p) => p.is_active || includeInactiveProducts)
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
        isExternalLink: p.product_kind === "external_link",
        externalUrl: p.external_url,
        category: p.category,
        // show_sold_count menggerbang tampil di publik (lihat
        // PagePreviewProduct.soldCount) -- pratinjau live harus mencerminkan
        // itu, BUKAN selalu tampilkan sold_count mentah (yang di dashboard
        // memang selalu ada, dipakai kolom "Terjual" di tabel Kelola).
        soldCount: p.show_sold_count ? p.sold_count : undefined,
      })),
  };
}
