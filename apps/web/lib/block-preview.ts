import type { LinkItem } from "@/lib/api-client";
import { PRODUK_LAYOUT_OPTIONS, type ProdukBlockLayout } from "@/components/dashboard/page/ProdukBlockEditor";
import { GALLERY_DISPLAY_OPTIONS, normalizeGalleryDisplay } from "@/lib/gallery-display";

// Diekstrak APA ADANYA dari app/dashboard/links/page.tsx (18 September
// 2026) supaya dipakai bersama ProdukPageEditor.tsx (Toko) -- permintaan
// langsung pengguna: "buat tiap blok yang ada di page store itu disamakan
// seperti di links". page.tsx App Router TIDAK boleh mengekspor nilai
// runtime selain field halaman yang dikenal Next.js (cek tipe .next/types
// menolaknya), jadi helper murni ini dipindah ke lib.

// maxGalleryImages -- SAMA PERSIS dengan batas backend (links.go), murni
// utk UI (sembunyikan tombol "Tambah" begitu penuh) -- backend tetap jadi
// sumber kebenaran validasinya.
export const maxGalleryImages = 9;

// maxNestedGalleryImages -- SAMA PERSIS batas backend (links.go), murni utk
// UI (sembunyikan tombol "Tambah" begitu penuh) -- lihat catatan lengkap di
// maxNestedGalleryImages, links.go.
export const maxNestedGalleryImages = 4;

// buildBlockTypeLabel -- dipindah dari app/dashboard/links/page.tsx (19
// September 2026) supaya dipakai bersama ProdukPageEditor.tsx (Toko) juga
// -- dibutuhkan sbg fallback label baris daftar DASHBOARD begitu judul
// blok dikosongkan (lihat handleSelectContentTile: blok baru non-link/
// video/maps/catalog SEKARANG mulai TANPA judul, permintaan langsung
// pengguna "judul blok juga itu optional untuk bisa ditampilkan"). FUNGSI
// (bukan konstanta modul) supaya labelnya ikut berganti bahasa.
export function buildBlockTypeLabel(t: (key: string) => string): Record<string, string> {
  return {
    video: t("dashboard.pages.links.blockTypes.video"),
    contact_form: t("dashboard.pages.links.blockTypes.contactForm"),
    faq: t("dashboard.pages.links.blockTypes.faq"),
    maps: t("dashboard.pages.links.blockTypes.maps"),
    text: t("dashboard.pages.links.blockTypes.text"),
    accordion: t("dashboard.pages.links.blockTypes.accordion"),
    gallery: t("dashboard.pages.links.blockTypes.gallery"),
    audio: t("dashboard.pages.links.blockTypes.audio"),
    file: t("dashboard.pages.links.blockTypes.file"),
    project_showcase: t("dashboard.pages.links.blockTypes.projectShowcase"),
    catalog: t("dashboard.pages.links.blockTypes.catalog"),
    button: t("dashboard.pages.links.blockTypes.button"),
    image: t("dashboard.pages.links.blockTypes.image"),
    video_image: t("dashboard.pages.links.blockTypes.videoImage"),
    image_slider: t("dashboard.pages.links.blockTypes.imageSlider"),
    list: t("dashboard.pages.links.blockTypes.list"),
    countdown: t("dashboard.pages.links.blockTypes.countdown"),
    produk: t("dashboard.pages.links.blockTypes.produk"),
    embed_link: t("dashboard.pages.links.blockTypes.embedLink"),
    embed: t("dashboard.pages.links.blockTypes.embed"),
  };
}

// stripHtmlToText -- redesain "Konsisten & Ringkas" (14 September 2026,
// Opsi A): blok "text"/"accordion" menyimpan RAW HTML (RichTextEditor,
// TipTap) di block_data.text -- baris ringkasan accordion butuh cuplikan
// TEKS POLOS, bukan markup mentah. Regex sederhana cukup di sini (cuma utk
// PRATINJAU pendek, bukan rendering sungguhan, jadi tidak perlu parser
// HTML penuh).
export function stripHtmlToText(html: string, maxLength = 60): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

// blockPreviewFor -- redesain "Konsisten & Ringkas" (14 September 2026,
// permintaan langsung pengguna "saya masih kurang suka ui dan ux dari mode
// simple ini di tiap blok nya", Opsi A dari 3 usulan lewat artifact yang
// disetujui pengguna). SEMUA blok punya baris ringkasan satu baris di
// bawah judul, dipakai skimming cepat TANPA perlu membuka accordion-nya.
// Sengaja reuse key i18n yang SUDAH ADA dari redesain panel blok Builder
// (produkSelectedSubtitle, faqCountSubtitle/EmptySubtitle, dst -- t()
// tidak terikat rute) alih-alih menduplikasi string yang identik.
export function blockPreviewFor(link: LinkItem, t: (key: string) => string): string | null {
  const bd = link.block_data as Record<string, unknown> | undefined;
  switch (link.block_type) {
    case "produk": {
      const count = ((bd?.product_ids as string[] | undefined) ?? []).length;
      const layout = (bd?.layout as ProdukBlockLayout | undefined) ?? "card_large";
      const layoutOpt = PRODUK_LAYOUT_OPTIONS.find((o) => o.value === layout);
      const layoutLabel = layoutOpt ? t(`dashboard.pages.linksBuilder.${layoutOpt.labelKey}`) : "";
      if (count === 0) return t("dashboard.pages.linksBuilder.produkSelectedSubtitle").replace("{n}", "0");
      return `${t("dashboard.pages.linksBuilder.produkSelectedSubtitle").replace("{n}", String(count))} · ${layoutLabel}`;
    }
    case "gallery":
    case "image_slider": {
      const count = ((bd?.images as string[] | undefined) ?? []).length;
      const base = `${count}/${maxGalleryImages} ${t("dashboard.pages.links.galleryPanel.photoCountSuffix")}`;
      // Nama tampilan ikut ditampilkan kalau bukan bawaan ("3/9 foto ·
      // Kolase") -- 6 tampilan sejak 18 September 2026, lihat
      // lib/gallery-display.ts; blok lama/grid tampil persis seperti dulu.
      const display = normalizeGalleryDisplay(bd?.display);
      const option = link.block_type === "gallery" && display !== "grid" ? GALLERY_DISPLAY_OPTIONS.find((o) => o.value === display) : undefined;
      return option ? `${base} · ${t(`dashboard.pages.links.galleryPanel.${option.labelKey}`)}` : base;
    }
    case "faq": {
      const count = ((bd?.items as unknown[] | undefined) ?? []).length;
      return count === 0
        ? t("dashboard.pages.linksBuilder.faqEmptySubtitle")
        : t("dashboard.pages.linksBuilder.faqCountSubtitle").replace("{n}", String(count));
    }
    case "catalog": {
      const count = ((bd?.items as unknown[] | undefined) ?? []).length;
      return count === 0
        ? t("dashboard.pages.linksBuilder.catalogItemsEmptySubtitle")
        : t("dashboard.pages.linksBuilder.catalogItemsCountSubtitle").replace("{n}", String(count));
    }
    case "list": {
      const count = ((bd?.items as unknown[] | undefined) ?? []).length;
      return count === 0
        ? t("dashboard.pages.linksBuilder.listEmptySubtitle")
        : t("dashboard.pages.linksBuilder.listCountSubtitle").replace("{n}", String(count));
    }
    case "audio":
      return (bd?.audio_url as string) ? t("dashboard.pages.links.audioPanel.hasAudio") : t("dashboard.pages.links.audioPanel.noAudio");
    case "file":
      return (bd?.file_url as string)
        ? t("dashboard.pages.links.filePanel.hasFile").replace("{name}", (bd?.file_name as string) ?? t("dashboard.pages.links.filePanel.fallbackFileName"))
        : t("dashboard.pages.links.filePanel.noFile");
    case "text":
    case "accordion": {
      const html = (bd?.text as string) ?? "";
      const text = html ? stripHtmlToText(html) : "";
      return text || t("dashboard.pages.links.linkCard.contentPreviewEmpty");
    }
    case "video":
      return (bd?.video_url as string) || t("dashboard.pages.links.linkCard.contentPreviewEmpty");
    case "video_image":
      return (bd?.video_url as string) || t("dashboard.pages.links.linkCard.contentPreviewEmpty");
    case "maps":
    case "button":
    case "embed_link":
    case "project_showcase":
      return link.url || t("dashboard.pages.links.linkCard.contentPreviewEmpty");
    case "embed":
      return (bd?.embed_url as string) || t("dashboard.pages.links.linkCard.contentPreviewEmpty");
    case "countdown": {
      const targetAt = bd?.target_at as string | undefined;
      if (!targetAt) return t("dashboard.pages.links.linkCard.contentPreviewEmpty");
      try {
        return new Date(targetAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
      } catch {
        return t("dashboard.pages.links.linkCard.contentPreviewEmpty");
      }
    }
    case "image":
      return (bd?.image_url as string) ? t("dashboard.pages.links.common.hasImage") : t("dashboard.pages.links.common.noneYet");
    default:
      return null;
  }
}

// isBlockExpandable -- SATU sumber kebenaran dipakai bareng oleh cursor,
// aria-expanded, dan onClick baris header blok (permintaan langsung
// pengguna, 17 September 2026: "tanda panah > harusnya di blok nya langsung
// jadi ketika blok di klik data nya keluar dan bisa diedit"). Tipe tanpa
// isi (blockPreviewFor null) sengaja TIDAK expandable, tidak ada apa pun
// yang bisa dibuka. "link" SEBELUMNYA juga dikecualikan (URL & deskripsi
// selalu tampil inline di bawah header) -- sejak redesain baris blok 18
// September 2026 (referensi gambar dari pengguna: kartu putih, ikon besar,
// judul + "n klik · domain", hanya menu ⋮ di kanan) URL & deskripsi
// tautan ikut dilipat & baru tampil saat baris dibuka, jadi "link" kini
// expandable juga.
export function isBlockExpandable(link: LinkItem, t: (key: string) => string): boolean {
  return link.block_type === "link" || blockPreviewFor(link, t) !== null;
}

// linkHostname -- subjudul baris tautan di dashboard (redesain 18 September
// 2026) menampilkan DOMAIN saja ("maps.app.goo.gl"), bukan URL penuh --
// URL penuh tetap bisa dilihat/diedit setelah baris dibuka. null kalau URL
// tidak bisa di-parse (mis. mailto:/tel: atau URL relatif) -- pemanggil
// lalu tidak menampilkan apa pun, bukan string "null"/kosong.
export function linkHostname(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

// showsClickCount -- chip "📊 n" SEBELUMNYA tampil utk SEMUA tipe blok,
// termasuk Teks/FAQ/Galeri yang tidak pernah diklik (angka nol yang tidak
// bermakna, temuan audit baris blok 18 September 2026). Sekarang jumlah
// klik hanya ditampilkan utk tipe yang memang punya tautan (link/button)
// atau blok apa pun yang SUDAH punya klik tercatat.
export function showsClickCount(link: LinkItem): boolean {
  return link.block_type === "link" || link.block_type === "button" || link.click_count > 0;
}

// BLOCK_TILE_CLASS -- tile ikon 48px baris blok dashboard (Links & Toko),
// redesain 18 September 2026 mengikuti referensi gambar pengguna: kotak
// putih bergaris tipis dengan glyph ikon di tengah. Bayangan ditulis
// sebagai nilai arbitrer (bukan `shadow-sm`) karena skala boxShadow di
// tailwind.config sudah dikustomisasi -- lihat catatan "kelas yang
// diam-diam no-op" di CLAUDE.md.
export const BLOCK_TILE_CLASS =
  "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-app-border bg-app-surface text-app-ink shadow-[0_1px_2px_rgba(17,17,17,0.06)]";

// blockTitleMode -- tipe blok yang menampilkan JUDUL terpisah dari isinya
// (gaya judul per blok, 25 September 2026). Harus cocok dgn renderer yang
// memberi [data-block-title] (PagePreview.tsx & komponen *Block.tsx):
// "full" = judul di atas/bawah konten (posisi & perataan berlaku),
// "inline" = judul sejajar tombol putar/unduh. Tipe lain (tautan, tombol,
// heading, teks, pembatas, peta, katalog, akordeon, produk) memakai judul
// sebagai label/isi utamanya sendiri, jadi tidak diberi pengaturan ini.
const FULL_TITLE_BLOCKS = new Set(["video", "faq", "contact_form", "countdown", "embed", "gallery", "image_slider", "list", "project_showcase", "embed_link", "image", "video_image"]);
const INLINE_TITLE_BLOCKS = new Set(["audio", "file"]);
export function blockTitleMode(blockType: string | undefined): "full" | "inline" | undefined {
  if (!blockType) return undefined;
  if (FULL_TITLE_BLOCKS.has(blockType)) return "full";
  if (INLINE_TITLE_BLOCKS.has(blockType)) return "inline";
  return undefined;
}
