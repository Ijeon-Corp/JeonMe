// Definisi visual 5 preset tema (REQ-F-204). Sebelumnya page.theme tersimpan
// di database dan bisa dipilih dari dashboard, tapi TIDAK PERNAH diterapkan
// di halaman publik -- kreator memilih tema, tidak ada yang berubah. Ini
// satu-satunya sumber kebenaran untuk tampilan tiap tema, dipakai baik oleh
// halaman publik maupun pratinjau di dashboard.
export type PageThemeName = "default" | "midnight" | "sunrise" | "forest" | "minimal";

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
};

export const PAGE_THEMES: Record<PageThemeName, PageTheme> = {
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
};

export function getPageTheme(theme: string): PageTheme {
  return PAGE_THEMES[theme as PageThemeName] ?? PAGE_THEMES.default;
}
