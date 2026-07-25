// Definisi visual 5 preset tema (REQ-F-204) + 1 mode "custom" (No.80,
// Sprint 9). Sebelumnya page.theme tersimpan di database dan bisa dipilih
// dari dashboard, tapi TIDAK PERNAH diterapkan di halaman publik -- kreator
// memilih tema, tidak ada yang berubah. Ini satu-satunya sumber kebenaran
// untuk tampilan tiap tema, dipakai baik oleh halaman publik maupun
// pratinjau di dashboard.
import type { CSSProperties } from "react";

// "Desain 2.0": preset diperluas dari 5 jadi 10 (rose/ocean/lavender/noir/
// peach baru) supaya galeri template lebih variatif ala Linktree/Lynk.id --
// palet warnanya SENGAJA lepas dari identitas brand Jeonme sendiri (primary/
// secondary/accent) karena halaman ini milik KREATOR, bukan marketing Jeonme.
export type PageThemeName =
  | "default"
  | "midnight"
  | "sunrise"
  | "forest"
  | "minimal"
  | "rose"
  | "ocean"
  | "lavender"
  | "noir"
  | "peach"
  | "custom";

export type PageTheme = {
  label: string;
  /** Kelas Tailwind untuk pembungkus halaman penuh (background). */
  page: string;
  /** Warna dasar untuk cahaya ambient di belakang avatar. */
  glow: string;
  avatarRing: string;
  name: string;
  bio: string;
  card: string;
  cardTitle: string;
  chevron: string;
  productCard: string;
  productTitle: string;
  productPrice: string;
  buyButton: string;
  footer: string;
  /** Warna solid untuk swatch pratinjau di dashboard (bukan kelas Tailwind). */
  swatch: string;
  /**
   * No.80: HANYA terisi untuk theme "custom" -- style inline dipasang di
   * elemen pembungkus <main> (lihat PagePreview.tsx), berisi custom
   * property CSS (--custom-bg, --custom-button-bg) yang lantas dirujuk oleh
   * kelas Tailwind arbitrary-value di atas (page/buyButton). Pendekatan ini
   * sengaja dipilih supaya warna/gambar latar & warna tombol yang truly
   * dinamis (hex bebas, URL gambar bebas) TIDAK perlu meneruskan prop style
   * baru ke setiap komponen tombol (BuyProductButton/LeadCaptureForm/dst)
   * -- custom property CSS mewarisi ke seluruh turunan DOM secara alami.
   */
  pageStyle?: CSSProperties;
};

export interface CustomThemeConfig {
  // "Desain 2.0": "gradient" ditambah -- disimpan sebagai string CSS
  // linear-gradient(...) LENGKAP di backgroundValue (backend memperlakukannya
  // sebagai string opaque, sama seperti warna solid/URL gambar sekarang).
  backgroundType: "solid" | "gradient" | "image";
  backgroundValue: string;
  font:
    | "inter"
    | "playfair"
    | "lora"
    | "montserrat"
    | "roboto-mono"
    | "poppins"
    | "quicksand"
    | "merriweather"
    | "space-grotesk";
  buttonColor: string;
  // buttonStyle -- "Desain 2.0": axis baru terpisah dari warna tombol.
  // fill = isi penuh (perilaku lama), outline = transparan+border, shadow =
  // isi penuh + bayangan warna di bawahnya.
  buttonStyle: "fill" | "outline" | "shadow";
}

// "Desain 2.0": diperluas dari 5 jadi 9 pilihan (Poppins/Quicksand/
// Merriweather/Space Grotesk baru) -- lihat catatan lingkup di layout.tsx.
export const CUSTOM_FONT_OPTIONS: { value: CustomThemeConfig["font"]; label: string; cssVar: string }[] = [
  { value: "inter", label: "Inter (Default)", cssVar: "var(--font-body)" },
  { value: "playfair", label: "Playfair Display (Serif Elegan)", cssVar: "var(--font-custom-playfair)" },
  { value: "lora", label: "Lora (Serif Nyaman Dibaca)", cssVar: "var(--font-custom-lora)" },
  { value: "montserrat", label: "Montserrat (Sans Modern)", cssVar: "var(--font-custom-montserrat)" },
  { value: "roboto-mono", label: "Roboto Mono (Monospace)", cssVar: "var(--font-custom-roboto-mono)" },
  { value: "poppins", label: "Poppins (Sans Bulat)", cssVar: "var(--font-custom-poppins)" },
  { value: "quicksand", label: "Quicksand (Playful)", cssVar: "var(--font-custom-quicksand)" },
  { value: "merriweather", label: "Merriweather (Serif Klasik)", cssVar: "var(--font-custom-merriweather)" },
  { value: "space-grotesk", label: "Space Grotesk (Geometris Modern)", cssVar: "var(--font-custom-space-grotesk)" },
];

export const CUSTOM_BUTTON_STYLE_OPTIONS: { value: CustomThemeConfig["buttonStyle"]; label: string }[] = [
  { value: "fill", label: "Isi Penuh" },
  { value: "outline", label: "Outline" },
  { value: "shadow", label: "Bayangan" },
];

// "custom" SENGAJA tidak masuk daftar ini -- dibangun secara dinamis oleh
// getPageTheme() dari CustomThemeConfig, bukan preset statis.
export const PAGE_THEMES: Record<Exclude<PageThemeName, "custom">, PageTheme> = {
  default: {
    label: "Default",
    page: "bg-primary-subtle bg-mesh",
    glow: "bg-gradient-to-br from-accent/50 via-secondary/30 to-primary/20",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-border bg-white/95 shadow-card hover:shadow-card-hover hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-muted",
    productCard: "border border-border bg-white shadow-card",
    productTitle: "text-ink",
    productPrice: "text-secondary-dark",
    buyButton: "btn-primary text-white",
    footer: "text-muted/70 hover:text-primary",
    swatch: "#1B4D3E",
  },
  midnight: {
    label: "Midnight",
    page: "bg-[#0A1512]",
    glow: "bg-gradient-to-br from-accent/40 via-secondary/25 to-transparent",
    avatarRing: "ring-4 ring-accent/40 shadow-[0_0_70px_-12px_rgba(201,162,75,0.55)]",
    name: "text-white",
    bio: "text-white/55",
    card: "border border-white/10 bg-white/[0.06] backdrop-blur hover:bg-white/[0.1] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/40",
    productCard: "border border-white/10 bg-white/[0.06] backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-accent",
    buyButton: "bg-accent text-ink font-bold hover:brightness-110",
    footer: "text-white/30 hover:text-accent",
    swatch: "#0A1512",
  },
  sunrise: {
    label: "Sunrise",
    page: "bg-gradient-to-b from-[#FCE8CE] via-[#FBF6E8] to-white",
    glow: "bg-gradient-to-br from-accent/60 via-orange-200/50 to-secondary/20",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-accent/25 bg-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-accent-dark",
    productCard: "border border-accent/25 bg-white shadow-card",
    productTitle: "text-ink",
    productPrice: "text-accent-dark",
    buyButton: "bg-gradient-to-r from-accent to-accent-dark text-white font-bold hover:brightness-105",
    footer: "text-muted/60 hover:text-accent-dark",
    swatch: "#E0C378",
  },
  forest: {
    label: "Forest",
    page: "bg-gradient-to-b from-primary-dark via-primary to-primary-dark",
    glow: "bg-gradient-to-br from-secondary-light/50 via-accent/25 to-transparent",
    avatarRing: "ring-4 ring-white/85 shadow-hero",
    name: "text-white",
    bio: "text-white/65",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-accent-light",
    buyButton: "bg-accent text-primary-dark font-bold hover:brightness-105",
    footer: "text-white/35 hover:text-accent-light",
    swatch: "#123328",
  },
  minimal: {
    label: "Minimal",
    page: "bg-white",
    glow: "hidden",
    avatarRing: "ring-1 ring-border",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-ink/15 bg-white hover:border-ink/40",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-ink/15 bg-white",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-ink text-white hover:bg-ink/90",
    footer: "text-muted/50 hover:text-ink",
    swatch: "#1C2B25",
  },
  // "Desain 2.0": 5 preset baru di bawah ini SENGAJA pakai palet warna
  // Tailwind standar (rose/sky/violet/amber/stone) yang LEPAS dari identitas
  // brand Jeonme (primary/secondary/accent) -- halaman ini milik KREATOR.
  rose: {
    label: "Rose",
    page: "bg-gradient-to-b from-rose-50 via-white to-white",
    glow: "bg-gradient-to-br from-rose-300/50 via-pink-200/40 to-transparent",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-rose-200 bg-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-rose-400",
    productCard: "border border-rose-200 bg-white shadow-card",
    productTitle: "text-ink",
    productPrice: "text-rose-500",
    buyButton: "bg-rose-500 text-white font-bold hover:brightness-105",
    footer: "text-muted/60 hover:text-rose-500",
    swatch: "#F43F5E",
  },
  ocean: {
    label: "Ocean",
    page: "bg-gradient-to-b from-sky-50 via-white to-white",
    glow: "bg-gradient-to-br from-sky-300/50 via-blue-200/40 to-transparent",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-sky-200 bg-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-sky-500",
    productCard: "border border-sky-200 bg-white shadow-card",
    productTitle: "text-ink",
    productPrice: "text-blue-600",
    buyButton: "bg-blue-600 text-white font-bold hover:brightness-105",
    footer: "text-muted/60 hover:text-blue-600",
    swatch: "#2563EB",
  },
  lavender: {
    label: "Lavender",
    page: "bg-gradient-to-b from-violet-50 via-white to-white",
    glow: "bg-gradient-to-br from-violet-300/50 via-purple-200/40 to-transparent",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-violet-200 bg-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-violet-400",
    productCard: "border border-violet-200 bg-white shadow-card",
    productTitle: "text-ink",
    productPrice: "text-violet-600",
    buyButton: "bg-violet-500 text-white font-bold hover:brightness-105",
    footer: "text-muted/60 hover:text-violet-500",
    swatch: "#8B5CF6",
  },
  noir: {
    label: "Noir",
    page: "bg-[#0B0B0B]",
    glow: "bg-gradient-to-br from-amber-400/25 via-yellow-600/15 to-transparent",
    avatarRing: "ring-4 ring-amber-400/40 shadow-[0_0_70px_-12px_rgba(212,175,55,0.5)]",
    name: "text-white",
    bio: "text-white/55",
    card: "border border-amber-400/20 bg-white/[0.05] backdrop-blur hover:bg-white/[0.09] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-amber-400/70",
    productCard: "border border-amber-400/20 bg-white/[0.05] backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-amber-400",
    buyButton: "bg-amber-400 text-[#0B0B0B] font-bold hover:brightness-105",
    footer: "text-white/30 hover:text-amber-400",
    swatch: "#D4AF37",
  },
  peach: {
    label: "Peach",
    page: "bg-gradient-to-b from-orange-50 via-amber-50 to-white",
    glow: "bg-gradient-to-br from-orange-200/50 via-amber-100/40 to-transparent",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-orange-200 bg-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-orange-400",
    productCard: "border border-orange-200 bg-white shadow-card",
    productTitle: "text-ink",
    productPrice: "text-orange-500",
    buyButton: "bg-orange-400 text-white font-bold hover:brightness-105",
    footer: "text-muted/60 hover:text-orange-500",
    swatch: "#FB923C",
  },
};

// buildCustomButtonClass -- "Desain 2.0": axis gaya tombol terpisah dari
// warna. Warna SELALU lewat custom property CSS --custom-button-bg (sudah
// ada sejak No.80), gaya tombol menentukan bagaimana warna itu dipakai.
function buildCustomButtonClass(style: CustomThemeConfig["buttonStyle"]): string {
  switch (style) {
    case "outline":
      return "bg-transparent border-2 border-[color:var(--custom-button-bg)] text-[color:var(--custom-button-bg)] font-bold hover:bg-[color:var(--custom-button-bg)]/10";
    case "shadow":
      return "bg-[color:var(--custom-button-bg)] text-white font-bold shadow-[0_8px_24px_-4px_var(--custom-button-bg)] hover:brightness-105";
    case "fill":
    default:
      return "bg-[color:var(--custom-button-bg)] text-white font-bold hover:brightness-105";
  }
}

export function getPageTheme(theme: string, custom?: CustomThemeConfig): PageTheme {
  if (theme === "custom" && custom) {
    const fontCssVar = CUSTOM_FONT_OPTIONS.find((f) => f.value === custom.font)?.cssVar ?? "var(--font-body)";
    const base = PAGE_THEMES.sunrise;
    // "gradient" pakai kelas sama seperti "image" -- background-image CSS
    // menerima baik url(...) maupun linear-gradient(...) lewat properti yang
    // sama, jadi tidak perlu kelas Tailwind terpisah.
    const isImageLike = custom.backgroundType === "image" || custom.backgroundType === "gradient";
    return {
      ...base,
      label: "Custom",
      page: isImageLike ? "bg-[image:var(--custom-bg)] bg-cover bg-center bg-no-repeat" : "bg-[color:var(--custom-bg)]",
      buyButton: buildCustomButtonClass(custom.buttonStyle ?? "fill"),
      swatch: custom.buttonColor,
      pageStyle: {
        // Nilai kustom properti CSS (bukan nama properti standar) --
        // TypeScript tidak tahu nama "--custom-bg", jadi perlu type assertion.
        // Gradient SUDAH berupa string CSS linear-gradient(...) lengkap dari
        // dashboard, dipakai langsung tanpa dibungkus url() (beda dari "image").
        ["--custom-bg" as string]: custom.backgroundType === "image" ? `url(${custom.backgroundValue})` : custom.backgroundValue,
        ["--custom-button-bg" as string]: custom.buttonColor,
        fontFamily: fontCssVar,
      } as CSSProperties,
    };
  }
  return PAGE_THEMES[theme as Exclude<PageThemeName, "custom">] ?? PAGE_THEMES.default;
}
