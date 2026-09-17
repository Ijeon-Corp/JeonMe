import type { LinkItem } from "@/lib/api-client";
import { PRODUK_LAYOUT_OPTIONS, type ProdukBlockLayout } from "@/components/dashboard/page/ProdukBlockEditor";

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
      return `${count}/${maxGalleryImages} ${t("dashboard.pages.links.galleryPanel.photoCountSuffix")}`;
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
// jadi ketika blok di klik data nya keluar dan bisa diedit"). "link" &
// tipe tanpa isi (blockPreviewFor null) sengaja TIDAK expandable, tidak
// ada apa pun yang bisa dibuka utk keduanya.
export function isBlockExpandable(link: LinkItem, t: (key: string) => string): boolean {
  return link.block_type !== "link" && blockPreviewFor(link, t) !== null;
}
