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
// Galeri tema (permintaan langsung pengguna, tangkapan layar galeri
// "Customizable" Linktree): tambah 6 preset baru bernuansa gradien vivid
// (bloom/blaze/cyber/mint/golden/cosmic) supaya galeri lebih variatif,
// melengkapi 10 preset "Desain 2.0" sebelumnya yang mayoritas latar solid
// atau gradien lembut.
// 5 preset FOTO WALLPAPER (permintaan langsung pengguna: "tema yang
// menggunakan versi gambar... ambil gambar dari internet") -- dusk/marble/
// nightfall/mist/berry, masing-masing foto asli (Picsum Photos/Unsplash,
// lisensi Unsplash bebas dipakai tanpa atribusi) disimpan statis di
// public/wallpapers/*.jpg dengan overlay gelap DIBAKAR langsung ke file
// (bukan CSS terpisah) supaya teks putih avatar/nama/bio selalu terbaca
// apa pun foto aslinya -- lihat catatan lengkap di PAGE_THEMES di bawah.
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
  | "bloom"
  | "blaze"
  | "cyber"
  | "mint"
  | "golden"
  | "cosmic"
  | "dusk"
  | "marble"
  | "nightfall"
  | "mist"
  | "berry"
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
   * previewBg/previewIsDark -- kartu galeri tema ala Linktree (permintaan
   * langsung pengguna): berbeda dari `swatch` (warna solid kecil dipakai di
   * ikon baris accordion), ini string CSS `background` LENGKAP (boleh
   * gradien multi-warna) untuk mengisi seluruh kartu pratinjau portrait di
   * galeri, plus penanda kontras teks supaya huruf sampel "Aa" & pil tombol
   * pratinjau tetap terbaca di atasnya.
   */
  previewBg: string;
  previewIsDark: boolean;
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
  /**
   * nameStyle -- permintaan langsung pengguna (panel "Font", opsi
   * "Alternative title font"): HANYA terisi untuk theme "custom" DAN kalau
   * kreator mengaktifkan font judul terpisah dari font halaman -- dipasang
   * KHUSUS di elemen <h1> nama (lihat PagePreview.tsx), beda dari pageStyle
   * yang berlaku ke seluruh halaman lewat elemen <main>.
   */
  nameStyle?: CSSProperties;
};

export type CustomFontValue =
  | "inter"
  | "playfair"
  | "lora"
  | "montserrat"
  | "roboto-mono"
  | "poppins"
  | "quicksand"
  | "merriweather"
  | "space-grotesk";

// Tipe non-optional berdiri sendiri (bukan langsung CustomThemeConfig["buttonRounded"]
// dkk, yang optional) supaya bisa dipakai sebagai key Record<...> di bawah
// tanpa "undefined" ikut masuk union-nya.
export type CustomButtonRounded = "none" | "sm" | "md" | "full";
export type CustomButtonShadowLevel = "none" | "soft" | "strong" | "hard";

export interface CustomThemeConfig {
  // "Desain 2.0": "gradient" ditambah -- disimpan sebagai string CSS
  // linear-gradient(...) LENGKAP di backgroundValue (backend memperlakukannya
  // sebagai string opaque, sama seperti warna solid/URL gambar sekarang).
  backgroundType: "solid" | "gradient" | "image";
  backgroundValue: string;
  font: CustomFontValue;
  buttonColor: string;
  // buttonStyle -- "Desain 2.0": axis gaya tombol. fill = isi penuh, outline
  // = transparan+border, glass = transparan+blur ala kaca (permintaan
  // langsung pengguna, referensi tangkapan layar panel "Buttons"). "shadow"
  // (nilai lama) sudah dilebur jadi axis independen `buttonShadow` di bawah.
  buttonStyle: "fill" | "outline" | "glass";
  // buttonRounded/buttonShadow/buttonTextColor & pageTextColor/titleFont/
  // titleColor -- permintaan langsung pengguna (referensi tangkapan layar
  // panel "Buttons"/"Fonts"): kontrol lebih lengkap ala Linktree. SEMUA
  // opsional -- halaman TAMBAHAN (No.98/ExtraPage) belum punya UI untuk
  // ini, jadi cukup diabaikan (getPageTheme jatuh balik ke default kalau
  // undefined, lihat di bawah), TIDAK memaksa halaman utama & tambahan
  // sama-sama mengisinya. *Color kosong ("")/undefined & titleFont kosong/
  // undefined berarti "ikuti default tema".
  buttonRounded?: CustomButtonRounded;
  buttonShadow?: CustomButtonShadowLevel;
  buttonTextColor?: string;
  pageTextColor?: string;
  // titleFont kosong/undefined berarti "samakan dengan font halaman"
  // (toggle "Alternative title font", default MATI di referensi).
  titleFont?: CustomFontValue | "";
  titleColor?: string;
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
  { value: "fill", label: "Solid" },
  { value: "glass", label: "Glass" },
  { value: "outline", label: "Outline" },
];

export const CUSTOM_BUTTON_ROUNDED_OPTIONS: { value: CustomButtonRounded; label: string; className: string }[] = [
  { value: "none", label: "Kotak", className: "rounded-none" },
  { value: "sm", label: "Sedikit", className: "rounded-md" },
  { value: "md", label: "Sedang", className: "rounded-xl" },
  { value: "full", label: "Penuh", className: "rounded-full" },
];

export const CUSTOM_BUTTON_SHADOW_OPTIONS: { value: CustomButtonShadowLevel; label: string }[] = [
  { value: "none", label: "Tanpa" },
  { value: "soft", label: "Lembut" },
  { value: "strong", label: "Kuat" },
  { value: "hard", label: "Tegas" },
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
    previewBg: "linear-gradient(160deg, #EAF3EF 0%, #FFFFFF 100%)",
    previewIsDark: false,
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
    previewBg: "radial-gradient(120% 120% at 30% 15%, #1c332c 0%, #0A1512 60%)",
    previewIsDark: true,
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
    previewBg: "linear-gradient(160deg, #FCE8CE 0%, #FBF6E8 55%, #FFFFFF 100%)",
    previewIsDark: false,
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
    previewBg: "linear-gradient(160deg, #123328 0%, #1B4D3E 50%, #123328 100%)",
    previewIsDark: true,
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
    previewBg: "#FFFFFF",
    previewIsDark: false,
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
    previewBg: "linear-gradient(160deg, #FFF1F2 0%, #FFFFFF 100%)",
    previewIsDark: false,
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
    previewBg: "linear-gradient(160deg, #F0F9FF 0%, #FFFFFF 100%)",
    previewIsDark: false,
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
    previewBg: "linear-gradient(160deg, #F5F3FF 0%, #FFFFFF 100%)",
    previewIsDark: false,
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
    previewBg: "radial-gradient(120% 120% at 70% 15%, #241d0a 0%, #0B0B0B 60%)",
    previewIsDark: true,
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
    previewBg: "linear-gradient(160deg, #FFF7ED 0%, #FFFBEB 55%, #FFFFFF 100%)",
    previewIsDark: false,
  },
  // 6 preset baru (permintaan langsung pengguna: "tambahkan tema seperti
  // gradient dan sejenisnya") -- latar gradien VIVID multi-warna, beda dari
  // 10 preset di atas yang mayoritas solid gelap atau gradien lembut/pastel.
  bloom: {
    label: "Bloom",
    page: "bg-gradient-to-br from-fuchsia-600 via-purple-700 to-indigo-800",
    glow: "bg-gradient-to-br from-white/20 via-fuchsia-300/10 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/70",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-fuchsia-200",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/35 hover:text-white",
    swatch: "#C026D3",
    previewBg: "linear-gradient(135deg, #C026D3 0%, #7E22CE 50%, #3730A3 100%)",
    previewIsDark: true,
  },
  blaze: {
    label: "Blaze",
    page: "bg-gradient-to-br from-orange-500 via-pink-600 to-purple-700",
    glow: "bg-gradient-to-br from-yellow-200/25 via-pink-300/15 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/70",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-orange-100",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/35 hover:text-white",
    swatch: "#F97316",
    previewBg: "linear-gradient(135deg, #F97316 0%, #DB2777 55%, #7E22CE 100%)",
    previewIsDark: true,
  },
  cyber: {
    label: "Cyber",
    page: "bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950",
    glow: "bg-gradient-to-br from-cyan-400/30 via-blue-500/15 to-transparent",
    avatarRing: "ring-4 ring-cyan-300/40 shadow-[0_0_70px_-12px_rgba(34,211,238,0.5)]",
    name: "text-white",
    bio: "text-white/60",
    card: "border border-cyan-400/20 bg-white/[0.05] backdrop-blur hover:bg-white/[0.09] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-cyan-300/60",
    productCard: "border border-cyan-400/20 bg-white/[0.05] backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-cyan-300",
    buyButton: "bg-cyan-400 text-[#0f172a] font-bold hover:brightness-105",
    footer: "text-white/30 hover:text-cyan-300",
    swatch: "#22D3EE",
    previewBg:
      "radial-gradient(120% 120% at 30% 10%, rgba(34,211,238,0.35) 0%, transparent 45%), linear-gradient(160deg, #0f172a 0%, #1e1b4b 55%, #2e1065 100%)",
    previewIsDark: true,
  },
  mint: {
    label: "Mint",
    page: "bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600",
    glow: "bg-gradient-to-br from-white/25 via-emerald-200/15 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/75",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-emerald-100",
    buyButton: "bg-white text-teal-700 font-bold hover:brightness-95",
    footer: "text-white/35 hover:text-white",
    swatch: "#14B8A6",
    previewBg: "linear-gradient(135deg, #34D399 0%, #14B8A6 50%, #0891B2 100%)",
    previewIsDark: true,
  },
  golden: {
    label: "Golden",
    page: "bg-gradient-to-br from-amber-300 via-orange-400 to-rose-400",
    glow: "bg-gradient-to-br from-white/30 via-amber-100/20 to-transparent",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-ink/70",
    card: "border border-white/40 bg-white/70 backdrop-blur hover:bg-white/80 hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-white/40 bg-white/70 backdrop-blur",
    productTitle: "text-ink",
    productPrice: "text-orange-700",
    buyButton: "bg-ink text-white font-bold hover:bg-ink/90",
    footer: "text-ink/40 hover:text-ink",
    swatch: "#FB923C",
    previewBg: "linear-gradient(135deg, #FCD34D 0%, #FB923C 50%, #FB7185 100%)",
    previewIsDark: false,
  },
  cosmic: {
    label: "Cosmic",
    page: "bg-gradient-to-b from-[#0B0B1E] via-[#1B1140] to-[#0B0B1E]",
    glow: "bg-gradient-to-br from-violet-500/30 via-fuchsia-500/15 to-transparent",
    avatarRing: "ring-4 ring-violet-300/40 shadow-[0_0_70px_-12px_rgba(167,139,250,0.5)]",
    name: "text-white",
    bio: "text-white/60",
    card: "border border-violet-400/20 bg-white/[0.05] backdrop-blur hover:bg-white/[0.09] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-violet-300/60",
    productCard: "border border-violet-400/20 bg-white/[0.05] backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-violet-300",
    buyButton: "bg-violet-400 text-[#0B0B1E] font-bold hover:brightness-105",
    footer: "text-white/30 hover:text-violet-300",
    swatch: "#A78BFA",
    previewBg: "linear-gradient(160deg, #0B0B1E 0%, #1B1140 50%, #0B0B1E 100%)",
    previewIsDark: true,
  },
  // 5 preset FOTO WALLPAPER (permintaan langsung pengguna) -- foto asli
  // (bukan gradien/warna solid) disimpan statis di public/wallpapers/*.jpg,
  // OVERLAY GELAP SUDAH DIBAKAR LANGSUNG ke tiap file (bukan lewat CSS
  // terpisah) supaya teks putih avatar/nama/bio SELALU kontras tinggi di
  // bagian atas halaman, apa pun foto aslinya -- lihat skrip pembuatannya
  // di riwayat kerja (Picsum Photos, lisensi Unsplash bebas dipakai tanpa
  // atribusi). previewBg dashboard memakai foto yang SAMA (bukan swatch
  // warna polos) supaya galeri tema menampilkan pratinjau foto sungguhan.
  dusk: {
    label: "Dusk",
    page: "bg-[url('/wallpapers/senja.jpg')] bg-cover bg-center bg-no-repeat",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/75",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/40 hover:text-white",
    swatch: "#4B5563",
    previewBg: "url('/wallpapers/senja.jpg') center/cover",
    previewIsDark: true,
  },
  marble: {
    label: "Marble",
    page: "bg-[url('/wallpapers/akuarel.jpg')] bg-cover bg-center bg-no-repeat",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/75",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/40 hover:text-white",
    swatch: "#1E3A8A",
    previewBg: "url('/wallpapers/akuarel.jpg') center/cover",
    previewIsDark: true,
  },
  nightfall: {
    label: "Nightfall",
    page: "bg-[url('/wallpapers/malam.jpg')] bg-cover bg-center bg-no-repeat",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/75",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/40 hover:text-white",
    swatch: "#7C3AED",
    previewBg: "url('/wallpapers/malam.jpg') center/cover",
    previewIsDark: true,
  },
  mist: {
    label: "Mist",
    page: "bg-[url('/wallpapers/kabut.jpg')] bg-cover bg-center bg-no-repeat",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/75",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/40 hover:text-white",
    swatch: "#4B5D3A",
    previewBg: "url('/wallpapers/kabut.jpg') center/cover",
    previewIsDark: true,
  },
  berry: {
    label: "Berry",
    page: "bg-[url('/wallpapers/segar.jpg')] bg-cover bg-center bg-no-repeat",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/75",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/40 hover:text-white",
    swatch: "#DC2626",
    previewBg: "url('/wallpapers/segar.jpg') center/cover",
    previewIsDark: true,
  },
};

const BUTTON_ROUNDED_CLASS: Record<CustomButtonRounded, string> = {
  none: "rounded-none",
  sm: "rounded-md",
  md: "rounded-xl",
  full: "rounded-full",
};

const BUTTON_SHADOW_CLASS: Record<CustomButtonShadowLevel, string> = {
  none: "",
  soft: "shadow-md",
  strong: "shadow-xl",
  hard: "shadow-[4px_4px_0_0_rgba(0,0,0,0.25)]",
};

// buildCustomButtonClass -- permintaan langsung pengguna (referensi
// tangkapan layar panel "Buttons"): gaya/kelengkungan/bayangan tombol tiga
// axis INDEPENDEN. Warna latar selalu lewat --custom-button-bg (sudah ada
// sejak No.80), warna teks lewat --custom-button-text (baru) -- keduanya
// custom property CSS, bukan literal di kelas, supaya hex bebas dari
// kreator tidak perlu daftar kelas Tailwind statis. Dipakai BERSAMA untuk
// kartu tautan (card/cardTitle) MAUPUN tombol Beli/Dukung/dst (buyButton) --
// meniru Linktree yang memperlakukan semua tombol di halaman sebagai satu
// gaya visual seragam, bukan cuma tombol sekunder seperti sebelumnya.
function buildCustomButtonClass(custom: CustomThemeConfig): string {
  const rounded = BUTTON_ROUNDED_CLASS[custom.buttonRounded ?? "full"] ?? "rounded-full";
  const shadow = BUTTON_SHADOW_CLASS[custom.buttonShadow ?? "soft"] ?? "";
  const base = `${rounded} ${shadow} text-[color:var(--custom-button-text)] font-bold transition-all duration-300`;
  switch (custom.buttonStyle) {
    case "outline":
      return `${base} bg-transparent border-2 border-[color:var(--custom-button-bg)]`;
    case "glass":
      return `${base} bg-[color:var(--custom-button-bg)]/20 backdrop-blur border border-[color:var(--custom-button-bg)]/30 hover:bg-[color:var(--custom-button-bg)]/30`;
    case "fill":
    default:
      return `${base} bg-[color:var(--custom-button-bg)] hover:brightness-105`;
  }
}

export function getPageTheme(theme: string, custom?: CustomThemeConfig): PageTheme {
  if (theme === "custom" && custom) {
    const fontCssVar = CUSTOM_FONT_OPTIONS.find((f) => f.value === custom.font)?.cssVar ?? "var(--font-body)";
    // titleFont kosong -> undefined -> nameStyle di bawah ikut kosong ->
    // <h1> otomatis mewarisi fontFamily halaman dari <main> (custom.font),
    // sesuai toggle "Alternative title font" yang default MATI di referensi.
    const titleFontCssVar = custom.titleFont
      ? CUSTOM_FONT_OPTIONS.find((f) => f.value === custom.titleFont)?.cssVar
      : undefined;
    const base = PAGE_THEMES.sunrise;
    // "gradient" pakai kelas sama seperti "image" -- background-image CSS
    // menerima baik url(...) maupun linear-gradient(...) lewat properti yang
    // sama, jadi tidak perlu kelas Tailwind terpisah.
    const isImageLike = custom.backgroundType === "image" || custom.backgroundType === "gradient";
    const buttonClass = buildCustomButtonClass(custom);
    return {
      ...base,
      label: "Custom",
      page: isImageLike ? "bg-[image:var(--custom-bg)] bg-cover bg-center bg-no-repeat" : "bg-[color:var(--custom-bg)]",
      card: buttonClass,
      cardTitle: "text-[color:var(--custom-button-text)]",
      buyButton: buttonClass,
      // "Fonts" (referensi tangkapan layar): warna judul & warna teks umum
      // independen -- kosong berarti ikuti default tema sunrise di bawahnya.
      name: custom.titleColor
        ? "text-[color:var(--custom-title-color)]"
        : custom.pageTextColor
          ? "text-[color:var(--custom-page-text-color)]"
          : base.name,
      bio: custom.pageTextColor ? "text-[color:var(--custom-page-text-color)]" : base.bio,
      swatch: custom.buttonColor,
      pageStyle: {
        // Nilai kustom properti CSS (bukan nama properti standar) --
        // TypeScript tidak tahu nama "--custom-bg", jadi perlu type assertion.
        // Gradient SUDAH berupa string CSS linear-gradient(...) lengkap dari
        // dashboard, dipakai langsung tanpa dibungkus url() (beda dari "image").
        ["--custom-bg" as string]: custom.backgroundType === "image" ? `url(${custom.backgroundValue})` : custom.backgroundValue,
        ["--custom-button-bg" as string]: custom.buttonColor,
        ["--custom-button-text" as string]: custom.buttonTextColor || "#FFFFFF",
        ...(custom.pageTextColor ? { ["--custom-page-text-color" as string]: custom.pageTextColor } : {}),
        ...(custom.titleColor ? { ["--custom-title-color" as string]: custom.titleColor } : {}),
        fontFamily: fontCssVar,
      } as CSSProperties,
      nameStyle: titleFontCssVar ? ({ fontFamily: titleFontCssVar } as CSSProperties) : undefined,
    };
  }
  return PAGE_THEMES[theme as Exclude<PageThemeName, "custom">] ?? PAGE_THEMES.default;
}
