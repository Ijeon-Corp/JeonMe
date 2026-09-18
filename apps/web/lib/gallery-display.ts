import type { LucideIcon } from "lucide-react";
import { CircleDot, GalleryHorizontal, LayoutDashboard, LayoutGrid, LayoutTemplate, Layers } from "lucide-react";

// Tampilan blok "gallery" -- SATU sumber kebenaran utk nilai
// block_data.display yang dipahami frontend (render publik GalleryBlock.tsx,
// pemilih di panel galeri Links/Toko/Builder, baris ringkasan blok).
// Backend memvalidasi himpunan yang SAMA di validateBlockDataAtDepth
// (links.go) -- kalau menambah nilai di sini, tambahkan di sana juga.
//
// Riwayat: "grid" (17 Agustus 2026, blok galeri pertama) & "stack" (18
// September 2026, kartu tumpukan -> popup + keterangan) sudah ada lebih
// dulu; "carousel"/"collage"/"masonry"/"circles" ditambahkan 18 September
// 2026 atas permintaan langsung pengguna: "tambahkan beberapa bentuk
// display lagi untuk image grid".
export const GALLERY_DISPLAYS = ["grid", "stack", "carousel", "collage", "masonry", "circles"] as const;
export type GalleryDisplay = (typeof GALLERY_DISPLAYS)[number];

// normalizeGalleryDisplay -- block_data datang dari JSONB bebas; nilai tak
// dikenal/kosong (blok lama tanpa field ini) SELALU jatuh ke "grid" supaya
// blok lama tampil persis seperti sebelumnya.
export function normalizeGalleryDisplay(raw: unknown): GalleryDisplay {
  return typeof raw === "string" && (GALLERY_DISPLAYS as readonly string[]).includes(raw) ? (raw as GalleryDisplay) : "grid";
}

// labelKey/hintKey relatif terhadap namespace i18n
// `dashboard.pages.links.galleryPanel.*` (dipakai bersama tiga editor).
export const GALLERY_DISPLAY_OPTIONS: { value: GalleryDisplay; labelKey: string; hintKey: string; Icon: LucideIcon }[] = [
  { value: "grid", labelKey: "displayGrid", hintKey: "displayGridHint", Icon: LayoutGrid },
  { value: "stack", labelKey: "displayStack", hintKey: "displayStackHint", Icon: Layers },
  { value: "carousel", labelKey: "displayCarousel", hintKey: "displayCarouselHint", Icon: GalleryHorizontal },
  { value: "collage", labelKey: "displayCollage", hintKey: "displayCollageHint", Icon: LayoutTemplate },
  { value: "masonry", labelKey: "displayMasonry", hintKey: "displayMasonryHint", Icon: LayoutDashboard },
  { value: "circles", labelKey: "displayCircles", hintKey: "displayCirclesHint", Icon: CircleDot },
];
