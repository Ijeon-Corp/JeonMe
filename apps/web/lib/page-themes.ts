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
// 5 preset FOTO WALLPAPER TAMBAHAN (permintaan langsung pengguna: "saya mau
// tambahkan 5 lagi pilihan tema menggunakan walpaper") -- amber/valley/
// storm/frost/dew, proses sumber & overlay SAMA PERSIS seperti 5 wallpaper
// pertama (Picsum Photos, overlay gelap dibakar ke file).
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
  | "amber"
  | "valley"
  | "storm"
  | "frost"
  | "dew"
  | "air"
  | "lake"
  | "mineral"
  | "blocks"
  | "haven"
  | "grid"
  | "mesh"
  | "aurora"
  | "prism"
  | "borealis"
  | "orbit"
  | "halo"
  | "lava"
  | "bubble"
  | "canvas"
  | "static"
  | "crystal"
  | "aqua"
  | "nebula"
  | "flux"
  | "sapphire"
  | "opal"
  | "quartz"
  | "glacier"
  | "mirage"
  | "canyon"
  | "highland"
  | "cascade"
  | "tide"
  | "skyline"
  | "custom";

// WALLPAPER_THEME_NAMES -- permintaan langsung pengguna: pisahkan galeri
// tema jadi tab "Warna & Gradien" vs "Wallpaper" di halaman Desain -- daftar
// ini satu-satunya sumber kebenaran untuk pengelompokan itu (dashboard/
// design/theme/page.tsx TIDAK menduplikasi daftar ini).
export const WALLPAPER_THEME_NAMES: Exclude<PageThemeName, "custom">[] = [
  "dusk",
  "marble",
  "nightfall",
  "mist",
  "berry",
  "amber",
  "valley",
  "storm",
  "frost",
  "dew",
  "canyon",
  "highland",
  "cascade",
  "tide",
  "skyline",
];

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
  /**
   * cardRounded -- bug dilaporkan pengguna: "Kelengkungan Sudut" di panel
   * Tombol tidak berfungsi. Akar masalah: PagePreview.tsx menulis
   * `rounded-xl` LANGSUNG di className blok tautan/tombol (bukan lewat
   * theme), lalu MENAMBAHKAN kelas rounded-none/sm/md/full dari
   * buildCustomButtonClass di sebelahnya -- dua kelas `rounded-*` yang
   * bersaing untuk properti CSS yang SAMA dalam satu className, urutan
   * penulisan di JSX TIDAK menentukan siapa menang (itu ditentukan urutan
   * Tailwind menghasilkan aturan CSS-nya, bukan urutan string kelas), jadi
   * `rounded-xl` yang selalu menang apa pun pilihan kreator. Diperbaiki
   * dengan memindahkan kelengkungan sudut ke SATU sumber kebenaran di sini
   * -- opsional, default undefined berarti JSX pakai fallback "rounded-xl"
   * (perilaku lama utuh untuk tema preset), HANYA diisi eksplisit oleh
   * getPageTheme saat styleOverride aktif.
   */
  cardRounded?: string;
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
  // styleOverride -- bug dilaporkan pengguna (migrasi 000035): dulu
  // menyentuh panel Tombol/Font MEMAKSA `theme` jadi "custom", membuang
  // seluruh latar/mood preset yang sudah dipilih. Sekarang field-field di
  // atas (button*/pageTextColor/titleFont/titleColor) HANYA diterapkan
  // kalau flag ini true -- independen dari `theme`, jadi bisa jadi lapisan
  // di ATAS preset apa pun, bukan cuma di atas latar "custom". Latar
  // (backgroundType/backgroundValue/label "Custom") TETAP eksklusif untuk
  // theme === "custom", TIDAK terpengaruh flag ini.
  styleOverride?: boolean;
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
  // Audit kontras menyeluruh (27 Juli 2026, setelah laporan pengguna
  // "masih banyak tema yang font nya bertabrakan"): skrip WCAG mengukur
  // teks bio (opacity translucent, SELALU lebih rendah kontrasnya dari
  // nama karena warnanya tercampur ke arah latar saat dirender) di SEMUA
  // stop gradien -- fuchsia-600 gagal untuk bio (~2.96, ambang 4.5).
  // Digelapkan ke fuchsia-700 + opacity bio dinaikkan 70->80% (masih jelas
  // lebih transparan/sekunder dari nama yang solid, cuma cukup pekat untuk
  // tetap lolos kontras).
  bloom: {
    label: "Bloom",
    page: "bg-gradient-to-br from-fuchsia-700 via-purple-700 to-indigo-600",
    glow: "bg-gradient-to-br from-white/20 via-fuchsia-300/10 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/80",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-fuchsia-200",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/35 hover:text-white",
    swatch: "#A21CAF",
    previewBg: "linear-gradient(135deg, #A21CAF 0%, #7E22CE 50%, #4F46E5 100%)",
    previewIsDark: true,
  },
  blaze: {
    // Bug dilaporkan pengguna (27 Juli 2026): "ketika memilih tema yang
    // warna putih masa font nya tetep putih dan membuat tidak kelihatan" --
    // stop pertama gradien ini semula "orange-500" (terlalu terang untuk
    // teks putih: rasio kontras WCAG ~2.85, di bawah ambang 4.5 minimal),
    // padahal avatar/nama/bio SELALU duduk persis di area stop pertama
    // (sudut kiri-atas). Digelapkan ke "orange-700" (kontras ~5.2, lolos)
    // supaya SELALU terbaca apa pun jumlah tautan kreator -- tema lain yang
    // sejenis (bloom/cyber/cosmic) sudah memakai bobot warna 600-900 sejak
    // awal, blaze yang tertinggal di 500 adalah satu-satunya penyimpangan.
    // Audit lanjutan (27 Juli 2026, laporan "masih banyak"): fix pertama
    // hanya membenahi kontras teks NAMA (opacity 100%), teks BIO (opacity
    // translucent 70%) masih gagal (~2.89) di stop pink-600/purple-700 --
    // kedua stop digelapkan ke -800 + opacity bio dinaikkan 70->85%.
    label: "Blaze",
    page: "bg-gradient-to-br from-orange-800 via-pink-800 to-purple-800",
    glow: "bg-gradient-to-br from-yellow-200/25 via-pink-300/15 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-orange-100",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/35 hover:text-white",
    swatch: "#9A3412",
    previewBg: "linear-gradient(135deg, #9A3412 0%, #9D174D 55%, #6B21A8 100%)",
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
  // Bug dilaporkan pengguna (27 Juli 2026): "ketika memilih tema yang warna
  // putih masa font nya tetep putih dan membuat tidak kelihatan" -- stop
  // pertama gradien ini semula "emerald-400" (SANGAT terang, rasio kontras
  // WCAG cuma ~1.9 untuk teks putih, jauh di bawah ambang 4.5), padahal
  // avatar/nama/bio SELALU duduk persis di area stop pertama. Ketiga stop
  // digelapkan (400/500/600 -> 600/700/800) supaya kontras lolos di
  // sepanjang gradien, BUKAN cuma di titik pertama -- nama tema & watak
  // hijau-teal-cyan-nya TETAP sama, cuma lebih gelap/dalam (mirip "Cosmic"/
  // "Cyber" yang dari awal sudah memakai bobot warna gelap serupa).
  // Audit lanjutan (27 Juli 2026, laporan "masih banyak"): fix pertama
  // (emerald-400 -> emerald-600 dkk) sudah cukup untuk teks NAMA (~3.77,
  // masih di bawah 4.5 -- ternyata BELUM cukup juga), digelapkan lagi
  // seragam ke -800 di ketiga stop supaya nama & bio SAMA-SAMA lolos.
  mint: {
    label: "Mint",
    page: "bg-gradient-to-br from-emerald-800 via-teal-800 to-cyan-800",
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
    swatch: "#115E59",
    previewBg: "linear-gradient(135deg, #065F46 0%, #115E59 50%, #155E75 100%)",
    previewIsDark: true,
  },
  // Audit kontras menyeluruh (27 Juli 2026, laporan "masih banyak tema yang
  // font nya bertabrakan"): teks bio (opacity translucent) marginal (~3.4,
  // ambang 4.5) di stop rose-400 -- opacity dinaikkan 70->90%.
  golden: {
    label: "Golden",
    page: "bg-gradient-to-br from-amber-300 via-orange-400 to-rose-400",
    glow: "bg-gradient-to-br from-white/30 via-amber-100/20 to-transparent",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-ink/90",
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
  // 5 wallpaper TAMBAHAN (permintaan langsung pengguna: "tambahkan 5 lagi
  // pilihan tema menggunakan walpaper") -- proses sumber & overlay SAMA
  // PERSIS seperti dusk/marble/nightfall/mist/berry di atas.
  amber: {
    label: "Amber",
    page: "bg-[url('/wallpapers/kilau.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#92400E",
    previewBg: "url('/wallpapers/kilau.jpg') center/cover",
    previewIsDark: true,
  },
  valley: {
    label: "Valley",
    page: "bg-[url('/wallpapers/lembah.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#A16207",
    previewBg: "url('/wallpapers/lembah.jpg') center/cover",
    previewIsDark: true,
  },
  storm: {
    label: "Storm",
    page: "bg-[url('/wallpapers/badai.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#1F2937",
    previewBg: "url('/wallpapers/badai.jpg') center/cover",
    previewIsDark: true,
  },
  frost: {
    label: "Frost",
    page: "bg-[url('/wallpapers/kelabu.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#475569",
    previewBg: "url('/wallpapers/kelabu.jpg') center/cover",
    previewIsDark: true,
  },
  dew: {
    label: "Dew",
    page: "bg-[url('/wallpapers/embun.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#166534",
    previewBg: "url('/wallpapers/embun.jpg') center/cover",
    previewIsDark: true,
  },
  // 6 preset WARNA SOLID baru (permintaan langsung pengguna, menyertai
  // tangkapan layar galeri tema Linktree asli berisi Air/Lake/Mineral/
  // Blocks/Haven/Grid dkk: "tambahkan warna warna seperti ini bukan hanya
  // gradient saja") -- SENGAJA warna solid/pola CSS, BUKAN gradien/foto,
  // supaya galeri tidak didominasi gradien seperti sebelumnya. Tema gradien
  // lama (rose/ocean/sunrise/dst) TIDAK dihapus (dikonfirmasi ke pengguna --
  // menghapus preset yang mungkin sudah dipilih kreator akan membuat
  // halaman publiknya mendadak balik ke Default tanpa peringatan).
  air: {
    label: "Air",
    page: "bg-[#F4F4F2]",
    glow: "hidden",
    avatarRing: "ring-1 ring-ink/10",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-ink/10 bg-white hover:border-ink/25",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-ink/10 bg-white",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-white text-ink border border-ink/15 font-bold hover:border-ink/40",
    footer: "text-muted/50 hover:text-ink",
    swatch: "#F4F4F2",
    previewBg: "#F4F4F2",
    previewIsDark: false,
  },
  lake: {
    label: "Lake",
    page: "bg-[#0B0F19]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/10 shadow-hero",
    name: "text-white",
    bio: "text-white/60",
    card: "border border-white/10 bg-white/[0.05] hover:bg-white/[0.09]",
    cardTitle: "text-white",
    chevron: "text-white/40",
    productCard: "border border-white/10 bg-white/[0.05]",
    productTitle: "text-white",
    productPrice: "text-white/85",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/30 hover:text-white",
    swatch: "#0B0F19",
    previewBg: "#0B0F19",
    previewIsDark: true,
  },
  // Audit kontras menyeluruh (27 Juli 2026): bio marginal (~3.7) -- opacity
  // dinaikkan 60->70%.
  mineral: {
    label: "Mineral",
    page: "bg-[#F5DDCB]",
    glow: "hidden",
    avatarRing: "ring-1 ring-ink/10",
    name: "text-ink",
    bio: "text-ink/70",
    card: "border border-ink/15 bg-white/60 hover:bg-white/80",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-ink/15 bg-white/60",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-transparent border-2 border-ink/70 text-ink font-bold hover:bg-ink/5",
    footer: "text-ink/40 hover:text-ink",
    swatch: "#F5DDCB",
    previewBg: "#F5DDCB",
    previewIsDark: false,
  },
  // Audit kontras menyeluruh (27 Juli 2026): bio marginal (~3.9) -- opacity
  // dinaikkan 75->85%.
  blocks: {
    label: "Blocks",
    page: "bg-[#7C3AED]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/70 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border-2 border-ink bg-[#F472B6] hover:brightness-105",
    cardTitle: "text-ink",
    chevron: "text-ink/60",
    productCard: "border-2 border-ink bg-[#F472B6]",
    productTitle: "text-ink",
    productPrice: "text-ink/80",
    buyButton: "border-2 border-ink bg-[#F472B6] text-ink font-bold hover:brightness-105",
    footer: "text-white/50 hover:text-white",
    swatch: "#7C3AED",
    previewBg: "#7C3AED",
    previewIsDark: true,
  },
  // Audit kontras menyeluruh (27 Juli 2026): bio marginal (~3.4) -- opacity
  // dinaikkan 60->75%.
  haven: {
    label: "Haven",
    page: "bg-[#D9CBB5]",
    glow: "hidden",
    avatarRing: "ring-1 ring-ink/10",
    name: "text-ink",
    bio: "text-ink/75",
    card: "border border-ink/10 bg-white/70 hover:bg-white/90",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-ink/10 bg-white/70",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-white/80 text-ink font-bold hover:bg-white",
    footer: "text-ink/40 hover:text-ink",
    swatch: "#D9CBB5",
    previewBg: "#D9CBB5",
    previewIsDark: false,
  },
  // "Grid" -- pola garis kotak-kotak ala kertas grafik, dibangun MURNI
  // lewat CSS (dua linear-gradient tipis 1px berulang), BUKAN gambar --
  // tidak perlu aset foto sama sekali untuk pola sesederhana ini.
  grid: {
    // Audit kontras menyeluruh (27 Juli 2026): bio marginal (~3.9) --
    // opacity dinaikkan 60->70%.
    label: "Grid",
    page: "bg-[#ECF87F]",
    glow: "hidden",
    avatarRing: "ring-1 ring-ink/15",
    name: "text-ink",
    bio: "text-ink/70",
    card: "border-2 border-ink bg-white hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/60",
    productCard: "border-2 border-ink bg-white",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "border-2 border-ink bg-white text-ink font-bold hover:bg-ink hover:text-white",
    footer: "text-ink/40 hover:text-ink",
    swatch: "#ECF87F",
    previewBg: "#ECF87F",
    previewIsDark: false,
    pageStyle: {
      backgroundImage:
        "linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)",
      backgroundSize: "28px 28px",
    },
  },
  // Permintaan langsung pengguna: "Mesh Gradient" & "Aurora Gradient" --
  // beberapa gaya latar modern (referensi: Linktree/Figma/Stripe untuk mesh,
  // website AI modern untuk aurora) dibangun MURNI lewat CSS (beberapa
  // radial-gradient bertumpuk), TANPA aset gambar sama sekali -- pola sama
  // seperti "Grid" di atas (pageStyle.backgroundImage).
  mesh: {
    label: "Mesh Gradient",
    page: "bg-white",
    glow: "hidden",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-white/60 bg-white/70 backdrop-blur hover:bg-white/90 hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-white/60 bg-white/70 backdrop-blur",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-ink text-white font-bold hover:bg-ink/90",
    footer: "text-muted/50 hover:text-ink",
    swatch: "#A78BFA",
    previewBg:
      "radial-gradient(at 15% 20%, hsla(280,85%,75%,0.55) 0px, transparent 50%), radial-gradient(at 85% 15%, hsla(340,85%,75%,0.5) 0px, transparent 50%), radial-gradient(at 15% 85%, hsla(195,85%,70%,0.5) 0px, transparent 50%), radial-gradient(at 85% 85%, hsla(45,90%,72%,0.5) 0px, transparent 50%), #FFFFFF",
    previewIsDark: false,
    pageStyle: {
      backgroundImage:
        "radial-gradient(at 15% 20%, hsla(280,85%,75%,0.55) 0px, transparent 50%), radial-gradient(at 85% 15%, hsla(340,85%,75%,0.5) 0px, transparent 50%), radial-gradient(at 15% 85%, hsla(195,85%,70%,0.5) 0px, transparent 50%), radial-gradient(at 85% 85%, hsla(45,90%,72%,0.5) 0px, transparent 50%)",
    },
  },
  aurora: {
    label: "Aurora Gradient",
    page: "bg-[#05070D]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/20 shadow-hero",
    name: "text-white",
    bio: "text-white/65",
    card: "border border-white/10 bg-white/[0.06] backdrop-blur hover:bg-white/[0.1] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/10 bg-white/[0.06] backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/85",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/30 hover:text-white",
    swatch: "#2DD4BF",
    previewBg:
      "radial-gradient(at 25% 25%, hsla(165,85%,55%,0.4) 0px, transparent 55%), radial-gradient(at 75% 30%, hsla(280,80%,60%,0.4) 0px, transparent 55%), radial-gradient(at 50% 80%, hsla(200,85%,55%,0.35) 0px, transparent 60%), #05070D",
    previewIsDark: true,
    pageStyle: {
      backgroundImage:
        "radial-gradient(at 25% 25%, hsla(165,85%,55%,0.4) 0px, transparent 55%), radial-gradient(at 75% 30%, hsla(280,80%,60%,0.4) 0px, transparent 55%), radial-gradient(at 50% 80%, hsla(200,85%,55%,0.35) 0px, transparent 60%)",
    },
  },
  // Klarifikasi pengguna atas permintaan sebelumnya (7 konsep gaya CSS
  // background yang dibagikan): "pertema buat 2" -- ARTINYA 2 VARIAN untuk
  // MASING-MASING dari 7 konsep, bukan "pilih 2 dari 7". Mesh & Aurora di
  // atas adalah varian pertama dari 2 konsep pertama; 12 preset di bawah
  // ini melengkapi varian ke-2 Mesh/Aurora plus 2 varian utuh untuk 5
  // konsep sisanya (Radial/Blob/Grain-Noise/Glassmorphism/Abstract Blur).
  // SEMUA murni CSS (pageStyle.backgroundImage), TANPA aset gambar --
  // pola identik dengan Mesh/Aurora/Grid di atas.
  prism: {
    // Varian ke-2 "Mesh Gradient" -- palet hangat (oranye/pink/kuning/merah)
    // sebagai lawan palet ungu-dingin "mesh" yang sudah ada.
    label: "Prism",
    page: "bg-white",
    glow: "hidden",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-white/60 bg-white/70 backdrop-blur hover:bg-white/90 hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-white/60 bg-white/70 backdrop-blur",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-ink text-white font-bold hover:bg-ink/90",
    footer: "text-muted/50 hover:text-ink",
    swatch: "#FB923C",
    previewBg:
      "radial-gradient(at 15% 20%, hsla(20,90%,65%,0.55) 0px, transparent 50%), radial-gradient(at 85% 15%, hsla(340,85%,65%,0.5) 0px, transparent 50%), radial-gradient(at 15% 85%, hsla(45,95%,60%,0.5) 0px, transparent 50%), radial-gradient(at 85% 85%, hsla(0,85%,60%,0.45) 0px, transparent 55%), #FFFFFF",
    previewIsDark: false,
    pageStyle: {
      backgroundImage:
        "radial-gradient(at 15% 20%, hsla(20,90%,65%,0.55) 0px, transparent 50%), radial-gradient(at 85% 15%, hsla(340,85%,65%,0.5) 0px, transparent 50%), radial-gradient(at 15% 85%, hsla(45,95%,60%,0.5) 0px, transparent 50%), radial-gradient(at 85% 85%, hsla(0,85%,60%,0.45) 0px, transparent 55%)",
    },
  },
  borealis: {
    // Varian ke-2 "Aurora Gradient" -- palet hijau-teal-ungu lebih dingin
    // di atas dasar nyaris hitam, komposisi titik gradien berbeda dari
    // "aurora" yang sudah ada.
    label: "Borealis",
    page: "bg-[#03060B]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/20 shadow-hero",
    name: "text-white",
    bio: "text-white/65",
    card: "border border-white/10 bg-white/[0.06] backdrop-blur hover:bg-white/[0.1] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/10 bg-white/[0.06] backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/85",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/30 hover:text-white",
    swatch: "#34D399",
    previewBg:
      "radial-gradient(at 10% 15%, hsla(150,80%,45%,0.4) 0px, transparent 60%), radial-gradient(at 85% 20%, hsla(260,75%,55%,0.35) 0px, transparent 60%), radial-gradient(at 30% 90%, hsla(190,80%,50%,0.3) 0px, transparent 65%), radial-gradient(at 80% 80%, hsla(120,70%,45%,0.3) 0px, transparent 60%), #03060B",
    previewIsDark: true,
    pageStyle: {
      backgroundImage:
        "radial-gradient(at 10% 15%, hsla(150,80%,45%,0.4) 0px, transparent 60%), radial-gradient(at 85% 20%, hsla(260,75%,55%,0.35) 0px, transparent 60%), radial-gradient(at 30% 90%, hsla(190,80%,50%,0.3) 0px, transparent 65%), radial-gradient(at 80% 80%, hsla(120,70%,45%,0.3) 0px, transparent 60%)",
    },
  },
  orbit: {
    // "Radial Gradient" varian 1 -- deskripsi pengguna: gradien lingkaran
    // dari beberapa titik, versi lebih sederhana dari mesh (cuma 2 lapis,
    // bukan 4+). Palet biru-ungu.
    label: "Orbit",
    page: "bg-white",
    glow: "hidden",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-white/60 bg-white/70 backdrop-blur hover:bg-white/90 hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-white/60 bg-white/70 backdrop-blur",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-ink text-white font-bold hover:bg-ink/90",
    footer: "text-muted/50 hover:text-ink",
    swatch: "#60A5FA",
    previewBg:
      "radial-gradient(circle at 20% 30%, hsla(210,90%,60%,0.45) 0%, transparent 60%), radial-gradient(circle at 80% 70%, hsla(280,80%,65%,0.4) 0%, transparent 60%), #FFFFFF",
    previewIsDark: false,
    pageStyle: {
      backgroundImage:
        "radial-gradient(circle at 20% 30%, hsla(210,90%,60%,0.45) 0%, transparent 60%), radial-gradient(circle at 80% 70%, hsla(280,80%,65%,0.4) 0%, transparent 60%)",
    },
  },
  halo: {
    // "Radial Gradient" varian 2 -- sama sesederhana "orbit" tapi palet
    // hangat (emas/pink).
    label: "Halo",
    page: "bg-white",
    glow: "hidden",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-white/60 bg-white/70 backdrop-blur hover:bg-white/90 hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-white/60 bg-white/70 backdrop-blur",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-ink text-white font-bold hover:bg-ink/90",
    footer: "text-muted/50 hover:text-ink",
    swatch: "#FBBF24",
    previewBg:
      "radial-gradient(circle at 25% 25%, hsla(35,95%,65%,0.5) 0%, transparent 55%), radial-gradient(circle at 75% 75%, hsla(350,85%,65%,0.45) 0%, transparent 55%), #FFFFFF",
    previewIsDark: false,
    pageStyle: {
      backgroundImage:
        "radial-gradient(circle at 25% 25%, hsla(35,95%,65%,0.5) 0%, transparent 55%), radial-gradient(circle at 75% 75%, hsla(350,85%,65%,0.45) 0%, transparent 55%)",
    },
  },
  lava: {
    // "Blob Background" varian 1 -- deskripsi pengguna: bentuk organik
    // (blob) diblur. Disimulasikan lewat radial-gradient elips lembut
    // (falloff transparent jauh lebih lebar dari mesh/orbit supaya terasa
    // "blur", bukan tegas). Palet gelap hangat (lava/magma).
    label: "Lava",
    page: "bg-[#1A0F0A]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/20 shadow-hero",
    name: "text-white",
    bio: "text-white/65",
    card: "border border-white/10 bg-white/[0.06] backdrop-blur hover:bg-white/[0.1] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/10 bg-white/[0.06] backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-orange-200",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/30 hover:text-white",
    swatch: "#F97316",
    previewBg:
      "radial-gradient(ellipse 60% 50% at 25% 30%, hsla(15,90%,55%,0.55) 0%, transparent 70%), radial-gradient(ellipse 55% 45% at 75% 70%, hsla(350,85%,50%,0.5) 0%, transparent 70%), radial-gradient(ellipse 50% 60% at 50% 90%, hsla(30,90%,50%,0.4) 0%, transparent 70%), #1A0F0A",
    previewIsDark: true,
    pageStyle: {
      backgroundImage:
        "radial-gradient(ellipse 60% 50% at 25% 30%, hsla(15,90%,55%,0.55) 0%, transparent 70%), radial-gradient(ellipse 55% 45% at 75% 70%, hsla(350,85%,50%,0.5) 0%, transparent 70%), radial-gradient(ellipse 50% 60% at 50% 90%, hsla(30,90%,50%,0.4) 0%, transparent 70%)",
    },
  },
  bubble: {
    // "Blob Background" varian 2 -- sama teknik blur elips seperti "lava",
    // palet pastel terang.
    label: "Bubble",
    page: "bg-white",
    glow: "hidden",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-white/60 bg-white/70 backdrop-blur hover:bg-white/90 hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-white/60 bg-white/70 backdrop-blur",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-ink text-white font-bold hover:bg-ink/90",
    footer: "text-muted/50 hover:text-ink",
    swatch: "#7DD3FC",
    previewBg:
      "radial-gradient(ellipse 55% 50% at 20% 25%, hsla(200,90%,75%,0.5) 0%, transparent 70%), radial-gradient(ellipse 50% 45% at 80% 30%, hsla(320,85%,78%,0.45) 0%, transparent 70%), radial-gradient(ellipse 60% 55% at 50% 85%, hsla(150,70%,75%,0.4) 0%, transparent 70%), #FFFFFF",
    previewIsDark: false,
    pageStyle: {
      backgroundImage:
        "radial-gradient(ellipse 55% 50% at 20% 25%, hsla(200,90%,75%,0.5) 0%, transparent 70%), radial-gradient(ellipse 50% 45% at 80% 30%, hsla(320,85%,78%,0.45) 0%, transparent 70%), radial-gradient(ellipse 60% 55% at 50% 85%, hsla(150,70%,75%,0.4) 0%, transparent 70%)",
    },
  },
  canvas: {
    // "Grain/Noise Background" varian 1 -- deskripsi pengguna: tekstur
    // noise tipis DI ATAS gradient (referensi Lynk.id). Dibangun lewat SVG
    // feTurbulence sebagai data-URI (layer backgroundImage teratas) +
    // backgroundBlendMode "overlay" supaya noise itu menyatu dengan warna
    // gradient di baliknya, BUKAN lapisan hitam-putih polos di atasnya --
    // TANPA aset gambar (SVG-nya inline, bukan file). previewBg (kartu
    // galeri kecil) sengaja HANYA gradiennya saja tanpa noise -- sama
    // seperti pola "Grid" (No.124) yang preview-nya juga tidak menampilkan
    // pola garis aslinya, cukup representasi warna dasarnya.
    label: "Canvas",
    page: "bg-white",
    glow: "hidden",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-white/60 bg-white/70 backdrop-blur hover:bg-white/90 hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-white/60 bg-white/70 backdrop-blur",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-ink text-white font-bold hover:bg-ink/90",
    footer: "text-muted/50 hover:text-ink",
    swatch: "#FB7185",
    previewBg: "linear-gradient(135deg, #FDBA74 0%, #FB7185 50%, #A78BFA 100%)",
    previewIsDark: false,
    pageStyle: {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\"), linear-gradient(135deg, #FDBA74 0%, #FB7185 50%, #A78BFA 100%)",
      backgroundBlendMode: "overlay",
    },
  },
  static: {
    // "Grain/Noise Background" varian 2 -- teknik SVG noise + overlay blend
    // yang sama seperti "canvas", palet gelap.
    label: "Static",
    page: "bg-[#0B0B0F]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/20 shadow-hero",
    name: "text-white",
    bio: "text-white/65",
    card: "border border-white/10 bg-white/[0.06] backdrop-blur hover:bg-white/[0.1] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/10 bg-white/[0.06] backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/85",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/30 hover:text-white",
    swatch: "#64748B",
    previewBg: "linear-gradient(160deg, #0B0B0F 0%, #1E293B 55%, #0B0B0F 100%)",
    previewIsDark: true,
    pageStyle: {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\"), linear-gradient(160deg, #0B0B0F 0%, #1E293B 55%, #0B0B0F 100%)",
      backgroundBlendMode: "overlay",
    },
  },
  crystal: {
    // "Glassmorphism Background" varian 1 -- deskripsi pengguna: gradient
    // + kartu transparan blur (backdrop-filter: blur()). Bedanya dari
    // tema vivid lain (Bloom/Blaze/Mint) yang JUGA pakai backdrop-blur:
    // kartu di sini pakai backdrop-blur-2xl (40px, jauh lebih tebal dari
    // backdrop-blur default 8px) + border lebih terang supaya efek "kaca"
    // benar-benar menonjol, bukan sekadar semi-transparan.
    // Bug dilaporkan pengguna (27 Juli 2026, ditemukan lewat audit
    // menyeluruh setelah laporan kontras teks): stop "indigo-500" semula
    // pas-pasan lolos utuh (~4.5) tapi teks bio (opacity 75%, warna efektif
    // jadi lebih terang lagi karena tercampur dengan latar) jatuh ke ~3.2 --
    // digelapkan ke indigo-600. Audit lanjutan (laporan "masih banyak"):
    // masih belum cukup untuk bio (~3.13) -- purple/pink ikut digelapkan
    // ke -700 + opacity bio dinaikkan 75->85%.
    label: "Crystal",
    page: "bg-gradient-to-br from-indigo-600 via-purple-700 to-pink-700",
    glow: "bg-gradient-to-br from-white/25 via-fuchsia-200/15 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border border-white/30 bg-white/15 backdrop-blur-2xl hover:bg-white/25 hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/30 bg-white/15 backdrop-blur-2xl",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white/90 text-ink font-bold backdrop-blur hover:bg-white",
    footer: "text-white/40 hover:text-white",
    swatch: "#7E22CE",
    previewBg: "linear-gradient(135deg, #4F46E5 0%, #7E22CE 50%, #BE185D 100%)",
    previewIsDark: true,
  },
  aqua: {
    // "Glassmorphism Background" varian 2 -- teknik kartu kaca yang sama
    // seperti "crystal", palet teal-emerald.
    // Bug dilaporkan pengguna (27 Juli 2026): "ketika memilih tema yang
    // warna putih masa font nya tetep putih dan membuat tidak kelihatan" --
    // stop asli "cyan-400" SANGAT terang (rasio kontras teks putih ~1.8,
    // jauh di bawah ambang 4.5), padahal avatar/nama/bio SELALU duduk di
    // area stop pertama. Digelapkan seluruhnya (400/500/500 -> 700/700/800)
    // supaya kartu kaca TETAP jelas terlihat "kaca" (perlu latar yang
    // cukup kontras dengan kartu putih transparan supaya efek blur-nya
    // kelihatan), sekaligus teks putih tetap terbaca di sepanjang gradien.
    // Audit lanjutan (laporan "masih banyak"): teks bio (opacity 75%) masih
    // marginal (~3.75) -- cyan/teal ikut digelapkan ke -800.
    label: "Aqua",
    page: "bg-gradient-to-br from-cyan-800 via-teal-800 to-emerald-800",
    glow: "bg-gradient-to-br from-white/25 via-cyan-200/15 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/75",
    card: "border border-white/30 bg-white/15 backdrop-blur-2xl hover:bg-white/25 hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/30 bg-white/15 backdrop-blur-2xl",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white/90 text-ink font-bold backdrop-blur hover:bg-white",
    footer: "text-white/40 hover:text-white",
    swatch: "#115E59",
    previewBg: "linear-gradient(135deg, #155E75 0%, #115E59 50%, #065F46 100%)",
    previewIsDark: true,
  },
  nebula: {
    // "Abstract Blur Background" varian 1 -- deskripsi pengguna: beberapa
    // lingkaran warna besar dengan filter: blur(100px+). Disimulasikan
    // lewat radial-gradient LINGKARAN (bukan elips seperti blob) berukuran
    // fix besar (circle 340-400px) dengan falloff transparent 75% -- lebih
    // sedikit titik & lebih besar/tegas dibanding "lava/bubble" supaya
    // terasa seperti "beberapa lingkaran besar", bukan campuran organik.
    // Palet gelap vivid (ungu/biru/pink).
    label: "Nebula",
    page: "bg-[#05040A]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/20 shadow-hero",
    name: "text-white",
    bio: "text-white/65",
    card: "border border-white/10 bg-white/[0.06] backdrop-blur hover:bg-white/[0.1] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/10 bg-white/[0.06] backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/85",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/30 hover:text-white",
    swatch: "#8B5CF6",
    previewBg:
      "radial-gradient(circle 380px at 20% 30%, hsla(265,85%,60%,0.55) 0%, transparent 75%), radial-gradient(circle 340px at 80% 25%, hsla(200,90%,55%,0.45) 0%, transparent 75%), radial-gradient(circle 400px at 55% 85%, hsla(320,85%,55%,0.4) 0%, transparent 75%), #05040A",
    previewIsDark: true,
    pageStyle: {
      backgroundImage:
        "radial-gradient(circle 380px at 20% 30%, hsla(265,85%,60%,0.55) 0%, transparent 75%), radial-gradient(circle 340px at 80% 25%, hsla(200,90%,55%,0.45) 0%, transparent 75%), radial-gradient(circle 400px at 55% 85%, hsla(320,85%,55%,0.4) 0%, transparent 75%)",
    },
  },
  flux: {
    // "Abstract Blur Background" varian 2 -- teknik lingkaran besar yang
    // sama seperti "nebula", palet terang.
    label: "Flux",
    page: "bg-white",
    glow: "hidden",
    avatarRing: "ring-4 ring-white shadow-hero",
    name: "text-ink",
    bio: "text-muted",
    card: "border border-white/60 bg-white/70 backdrop-blur hover:bg-white/90 hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border border-white/60 bg-white/70 backdrop-blur",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "bg-ink text-white font-bold hover:bg-ink/90",
    footer: "text-muted/50 hover:text-ink",
    swatch: "#38BDF8",
    previewBg:
      "radial-gradient(circle 360px at 25% 30%, hsla(200,90%,65%,0.45) 0%, transparent 75%), radial-gradient(circle 340px at 75% 25%, hsla(280,80%,70%,0.4) 0%, transparent 75%), radial-gradient(circle 380px at 50% 85%, hsla(340,85%,70%,0.4) 0%, transparent 75%), #FFFFFF",
    previewIsDark: false,
    pageStyle: {
      backgroundImage:
        "radial-gradient(circle 360px at 25% 30%, hsla(200,90%,65%,0.45) 0%, transparent 75%), radial-gradient(circle 340px at 75% 25%, hsla(280,80%,70%,0.4) 0%, transparent 75%), radial-gradient(circle 380px at 50% 85%, hsla(340,85%,70%,0.4) 0%, transparent 75%)",
    },
  },
  // 5 preset GLASSMORPHISM tambahan (permintaan langsung pengguna: "tambahkan
  // 5 tema glassmorphism") -- melengkapi Crystal/Aqua (No.126) jadi 7 total.
  // Pola SAMA PERSIS: gradien Tailwind vivid (stop 600-700-800/900, BUKAN
  // 400-500 -- pelajaran dari No.127: bobot warna terlalu terang membuat
  // teks putih nyaris tak terlihat di area avatar/nama/bio) + kartu kaca
  // "border border-white/30 bg-white/15 backdrop-blur-2xl".
  // Audit lanjutan (27 Juli 2026, laporan "masih banyak"): kelima preset di
  // bawah ini ditulis SEBELUM audit skrip WCAG selesai -- teks bio (opacity
  // translucent 75%) marginal (~3.5-4.5) di beberapa stop. Semua stop
  // disesuaikan + opacity bio dinaikkan (80-85%) supaya nama & bio SAMA-SAMA
  // lolos ambang 4.5 di setiap stop gradien, bukan cuma stop pertama.
  sapphire: {
    label: "Sapphire",
    page: "bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-700",
    glow: "bg-gradient-to-br from-white/20 via-blue-300/10 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/80",
    card: "border border-white/30 bg-white/15 backdrop-blur-2xl hover:bg-white/25 hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/30 bg-white/15 backdrop-blur-2xl",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white/90 text-ink font-bold backdrop-blur hover:bg-white",
    footer: "text-white/40 hover:text-white",
    swatch: "#1D4ED8",
    previewBg: "linear-gradient(135deg, #1D4ED8 0%, #4338CA 50%, #334155 100%)",
    previewIsDark: true,
  },
  opal: {
    label: "Opal",
    page: "bg-gradient-to-br from-fuchsia-700 via-purple-700 to-sky-700",
    glow: "bg-gradient-to-br from-white/20 via-fuchsia-300/10 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border border-white/30 bg-white/15 backdrop-blur-2xl hover:bg-white/25 hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/30 bg-white/15 backdrop-blur-2xl",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white/90 text-ink font-bold backdrop-blur hover:bg-white",
    footer: "text-white/40 hover:text-white",
    swatch: "#7E22CE",
    previewBg: "linear-gradient(135deg, #A21CAF 0%, #7E22CE 50%, #0369A1 100%)",
    previewIsDark: true,
  },
  quartz: {
    label: "Quartz",
    page: "bg-gradient-to-br from-rose-700 via-amber-800 to-orange-800",
    glow: "bg-gradient-to-br from-white/20 via-rose-300/10 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border border-white/30 bg-white/15 backdrop-blur-2xl hover:bg-white/25 hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/30 bg-white/15 backdrop-blur-2xl",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white/90 text-ink font-bold backdrop-blur hover:bg-white",
    footer: "text-white/40 hover:text-white",
    swatch: "#92400E",
    previewBg: "linear-gradient(135deg, #BE123C 0%, #92400E 50%, #9A3412 100%)",
    previewIsDark: true,
  },
  glacier: {
    label: "Glacier",
    page: "bg-gradient-to-br from-cyan-800 via-sky-700 to-indigo-700",
    glow: "bg-gradient-to-br from-white/20 via-cyan-300/10 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border border-white/30 bg-white/15 backdrop-blur-2xl hover:bg-white/25 hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/30 bg-white/15 backdrop-blur-2xl",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white/90 text-ink font-bold backdrop-blur hover:bg-white",
    footer: "text-white/40 hover:text-white",
    swatch: "#0369A1",
    previewBg: "linear-gradient(135deg, #155E75 0%, #0369A1 50%, #4338CA 100%)",
    previewIsDark: true,
  },
  mirage: {
    label: "Mirage",
    page: "bg-gradient-to-br from-amber-800 via-rose-700 to-purple-700",
    glow: "bg-gradient-to-br from-white/20 via-amber-300/10 to-transparent",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border border-white/30 bg-white/15 backdrop-blur-2xl hover:bg-white/25 hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/30 bg-white/15 backdrop-blur-2xl",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white/90 text-ink font-bold backdrop-blur hover:bg-white",
    footer: "text-white/40 hover:text-white",
    swatch: "#BE123C",
    previewBg: "linear-gradient(135deg, #92400E 0%, #BE123C 50%, #7E22CE 100%)",
    previewIsDark: true,
  },
  // 5 preset FOTO WALLPAPER tambahan (permintaan langsung pengguna:
  // "tambahkan ... 5 tema walpaper lagi") -- proses sumber & overlay SAMA
  // PERSIS seperti 10 wallpaper sebelumnya (Picsum Photos, overlay gelap
  // dua-lapis dibakar ke file: wash seragam ~37-45% + gradien tambahan di
  // 45-55% tinggi atas yang memudar dari ~51-72% ke 0%, kekuatannya
  // disesuaikan PER FOTO berdasarkan seberapa terang area atas foto asli
  // -- ombak/dataran/kota perlu overlay lebih kuat dari resep standar
  // karena langit/buih ombaknya secara alami lebih terang & lebih rata di
  // seluruh area atas, bukan cuma titik terang lokal seperti foto lain).
  canyon: {
    label: "Canyon",
    page: "bg-[url('/wallpapers/ngarai.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#9A3412",
    previewBg: "url('/wallpapers/ngarai.jpg') center/cover",
    previewIsDark: true,
  },
  // Audit kontras menyeluruh (27 Juli 2026): overlay gelap foto ini
  // diperkuat lagi (lihat proses pembuatan file) + opacity bio dinaikkan
  // 75->85% supaya lolos ambang 4.5 di area foto paling terang sekalipun.
  highland: {
    label: "Highland",
    page: "bg-[url('/wallpapers/dataran.jpg')] bg-cover bg-center bg-no-repeat",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/40 hover:text-white",
    swatch: "#3F6212",
    previewBg: "url('/wallpapers/dataran.jpg') center/cover",
    previewIsDark: true,
  },
  cascade: {
    label: "Cascade",
    page: "bg-[url('/wallpapers/terjun.jpg')] bg-cover bg-center bg-no-repeat",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/40 hover:text-white",
    swatch: "#166534",
    previewBg: "url('/wallpapers/terjun.jpg') center/cover",
    previewIsDark: true,
  },
  tide: {
    label: "Tide",
    page: "bg-[url('/wallpapers/ombak.jpg')] bg-cover bg-center bg-no-repeat",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/40 hover:text-white",
    swatch: "#134E4A",
    previewBg: "url('/wallpapers/ombak.jpg') center/cover",
    previewIsDark: true,
  },
  skyline: {
    label: "Skyline",
    page: "bg-[url('/wallpapers/kota.jpg')] bg-cover bg-center bg-no-repeat",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/80 shadow-hero",
    name: "text-white",
    bio: "text-white/85",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/60",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/40 hover:text-white",
    swatch: "#78716C",
    previewBg: "url('/wallpapers/kota.jpg') center/cover",
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
// Kelengkungan sudut (cardRounded) SENGAJA TIDAK dimasukkan ke sini lagi --
// lihat komentar cardRounded di PageTheme, dulu dobel dengan `rounded-xl`
// yang ditulis langsung di JSX & selalu kalah/menang secara tidak
// terduga tergantung urutan Tailwind menghasilkan CSS, bukan urutan kelas.
function buildCustomButtonClass(custom: CustomThemeConfig): string {
  const shadow = BUTTON_SHADOW_CLASS[custom.buttonShadow ?? "soft"] ?? "";
  const base = `${shadow} text-[color:var(--custom-button-text)] font-bold transition-all duration-300`;
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

// getPageTheme -- bug dilaporkan pengguna (migrasi 000035): "kenapa saya
// ubah warna tombol ataupun font malah merubah tema yang sudah saya
// pilih". Akar masalah lama: kustomisasi tombol/font HANYA diterapkan
// kalau theme==="custom", jadi dashboard memaksa ganti `theme` jadi
// "custom" tiap kali panel Tombol/Font disentuh -- otomatis membuang
// SELURUH latar/mood preset yang sudah dipilih (glow/avatarRing/
// productCard/dst ikut jadi milik tema "Custom", bukan preset semula).
//
// Sekarang DUA KONSEP dipisah:
// 1. Latar/mood (`theme`) -- preset (default/midnight/dst) ATAU "custom"
//    (custom_background_type/value) -- TIDAK berubah lewat panel Tombol/Font.
// 2. Lapisan tombol/font (`custom.styleOverride`) -- independen, bisa
//    diterapkan DI ATAS tema apa pun (preset ATAU custom), diaktifkan
//    otomatis oleh dashboard begitu kreator menyentuh panel Tombol/Font
//    (lihat handleStyleOverride di dashboard/design/page.tsx), TANPA
//    menyentuh `theme` sama sekali.
export function getPageTheme(theme: string, custom?: CustomThemeConfig): PageTheme {
  const isCustomBg = theme === "custom";
  const styleOverride = !!custom?.styleOverride;

  if (!isCustomBg && !styleOverride) {
    return PAGE_THEMES[theme as Exclude<PageThemeName, "custom">] ?? PAGE_THEMES.default;
  }

  const base = isCustomBg ? PAGE_THEMES.sunrise : (PAGE_THEMES[theme as Exclude<PageThemeName, "custom">] ?? PAGE_THEMES.default);
  const result: PageTheme = { ...base };
  const pageStyle: Record<string, string | undefined> = { ...(base.pageStyle as Record<string, string | undefined> | undefined) };

  if (isCustomBg && custom) {
    // "gradient" pakai kelas sama seperti "image" -- background-image CSS
    // menerima baik url(...) maupun linear-gradient(...) lewat properti yang
    // sama, jadi tidak perlu kelas Tailwind terpisah.
    const isImageLike = custom.backgroundType === "image" || custom.backgroundType === "gradient";
    result.label = "Custom";
    result.page = isImageLike ? "bg-[image:var(--custom-bg)] bg-cover bg-center bg-no-repeat" : "bg-[color:var(--custom-bg)]";
    pageStyle["--custom-bg"] = custom.backgroundType === "image" ? `url(${custom.backgroundValue})` : custom.backgroundValue;
  }

  if (styleOverride && custom) {
    const fontCssVar = CUSTOM_FONT_OPTIONS.find((f) => f.value === custom.font)?.cssVar ?? "var(--font-body)";
    // titleFont kosong -> undefined -> nameStyle di bawah ikut kosong ->
    // <h1> otomatis mewarisi fontFamily halaman dari <main> (custom.font),
    // sesuai toggle "Alternative title font" yang default MATI di referensi.
    const titleFontCssVar = custom.titleFont
      ? CUSTOM_FONT_OPTIONS.find((f) => f.value === custom.titleFont)?.cssVar
      : undefined;
    const buttonClass = buildCustomButtonClass(custom);
    result.card = buttonClass;
    result.cardTitle = "text-[color:var(--custom-button-text)]";
    result.buyButton = buttonClass;
    result.cardRounded = BUTTON_ROUNDED_CLASS[custom.buttonRounded ?? "full"] ?? "rounded-full";
    // "Fonts" (referensi tangkapan layar): warna judul & warna teks umum
    // independen -- kosong berarti ikuti default tema (preset atau sunrise).
    result.name = custom.titleColor
      ? "text-[color:var(--custom-title-color)]"
      : custom.pageTextColor
        ? "text-[color:var(--custom-page-text-color)]"
        : base.name;
    result.bio = custom.pageTextColor ? "text-[color:var(--custom-page-text-color)]" : base.bio;
    result.swatch = custom.buttonColor;
    pageStyle["--custom-button-bg"] = custom.buttonColor;
    pageStyle["--custom-button-text"] = custom.buttonTextColor || "#FFFFFF";
    if (custom.pageTextColor) pageStyle["--custom-page-text-color"] = custom.pageTextColor;
    if (custom.titleColor) pageStyle["--custom-title-color"] = custom.titleColor;
    pageStyle.fontFamily = fontCssVar;
    result.nameStyle = titleFontCssVar ? ({ fontFamily: titleFontCssVar } as CSSProperties) : undefined;
  }

  result.pageStyle = pageStyle as CSSProperties;
  return result;
}
