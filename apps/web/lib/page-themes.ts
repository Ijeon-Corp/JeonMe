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
  | "sphere"
  | "chrome"
  | "cube"
  | "relief"
  | "facet"
  | "flow"
  | "pulse"
  | "drift"
  | "brew"
  | "lagoon"
  | "dune"
  | "sakura"
  | "nova"
  | "maple"
  | "electric"
  | "surge"
  | "downtown"
  | "polaris"
  | "atmos"
  | "ember"
  | "xmas"
  | "pride"
  | "retro"
  | "kraft"
  | "monsoon"
  | "custom";

// WALLPAPER_THEME_NAMES -- permintaan langsung pengguna: pisahkan galeri
// tema jadi tab "Warna & Gradien" vs "Wallpaper" di halaman Desain -- daftar
// ini satu-satunya sumber kebenaran untuk pengelompokan itu (dashboard/
// design/theme/page.tsx TIDAK menduplikasi daftar ini).
// 6 preset FOTO WALLPAPER TAMBAHAN (permintaan langsung pengguna, 13
// Agustus 2026: "saya masih ingin perbanyakk tema dan layout di quick
// setup lebih banyak terutama background menggunakan wallpaper... download
// saja asset gratis yang tersedia di internet") -- brew/lagoon/dune/
// sakura/nova/maple, foto Pexels (lisensi Pexels, bebas dipakai tanpa
// atribusi), proses SAMA PERSIS (crop portrait 1080x1920 + overlay gelap
// dibakar ke file) seperti 15 wallpaper sebelumnya.
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
  "brew",
  "lagoon",
  "dune",
  "sakura",
  "nova",
  "maple",
];

// VIDEO_THEME_NAMES -- permintaan langsung pengguna, 13 Agustus 2026: "juga
// background yang bergerak seperti menggunakan mov atau gif" -- BEDA dari
// THREE_D_THEME_NAMES punya "Live Wallpaper" (flow/pulse/drift, animasi CSS
// murni): ini video loop SUNGGUHAN (file .mp4, self-hosted di
// public/videos/, sumber Mixkit -- lisensi Mixkit, bebas dipakai tanpa
// atribusi), dirender lewat elemen <video autoPlay loop muted playsInline>
// SUNGGUHAN (lihat PageTheme.videoSrc & renderBioHeader/PagePreview.tsx),
// bukan sekadar kelas CSS di `page`. Tab galeri SENDIRI ("Video", lihat
// design/theme/page.tsx) -- terpisah dari tab "3D/Live" supaya kreator
// paham ini video sungguhan (ukuran file lebih besar, butuh koneksi lebih
// stabil), bukan animasi CSS ringan.
export const VIDEO_THEME_NAMES: Exclude<PageThemeName, "custom">[] = [
  "electric",
  "surge",
  "downtown",
  "polaris",
  "atmos",
  "ember",
];

// THREE_D_THEME_NAMES -- permintaan langsung pengguna: "buatkan beberapa
// tema 3d tambahkan di tab baru saja disamping tema walpaper" -- tab
// GALERI ketiga di halaman Desain (dashboard/design/theme/page.tsx),
// persis di sebelah tab "Wallpaper". Sama seperti WALLPAPER_THEME_NAMES,
// daftar ini SATU-SATUNYA sumber kebenaran pengelompokan tab -- semuanya
// MURNI CSS (gradient/box-shadow/pattern), TANPA aset gambar/model 3D
// sungguhan (tidak ada rendering WebGL/Three.js di proyek ini) --
// "3D" di sini berarti ILUSI kedalaman lewat teknik CSS (bola mengkilap,
// logam metalik, kubus isometrik, kartu timbul ala neumorphism, permukaan
// bersegi), konsisten dengan preset CSS-murni lain (grid/mesh/aurora/dst).
//
// Permintaan susulan: "tambahkan live walpaper di tab 3d dan ubah nama
// tab nya jadi 3d/live" -- tab tetap SATU (tidak dipecah tab keempat),
// cuma labelnya diubah "3D/Live" (lihat design/theme/page.tsx) supaya
// mencakup 3 preset baru (flow/pulse/drift) yang latarnya BERGERAK
// (CSS @keyframes, lihat globals.css) -- beda dari 5 preset "3D" murni
// statis di atas. Otomatis dihentikan oleh prefers-reduced-motion
// (sudah ada secara global di globals.css, tidak perlu penanganan khusus
// di sini).
export const THREE_D_THEME_NAMES: Exclude<PageThemeName, "custom">[] = [
  "sphere",
  "chrome",
  "cube",
  "relief",
  "facet",
  "flow",
  "pulse",
  "drift",
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
  /**
   * videoSrc/posterSrc -- HANYA terisi untuk preset "Video" (lihat
   * VIDEO_THEME_NAMES). `page` untuk preset ini tetap kelas warna dasar
   * gelap polos (fallback kalau video gagal/lambat dimuat) -- video
   * sungguhan dirender sebagai elemen <video> TERPISAH oleh
   * renderBioHeader (PagePreview.tsx), bukan lewat className seperti
   * gambar/gradien lain, karena <video> bukan sesuatu yang bisa jadi
   * background-image CSS. posterSrc dipasang di atribut `poster` <video>
   * (potongan gambar diam supaya tidak ada kedipan/hitam kosong sebelum
   * video sungguhan siap diputar).
   */
  videoSrc?: string;
  posterSrc?: string;
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

// STICKER_SHAPES + StickerIcon (render SVG) sekarang di
// components/StickerIcon.tsx -- dipindah dari sini karena butuh JSX
// (page-themes.ts sengaja data murni, bukan .tsx).

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
//
// pageStyle.fontFamily -- permintaan langsung pengguna (27 Juli 2026):
// "warna font dan tipe font juga ikut disesuaikan berdasarkan tema yang
// dipilih jadi bukan background nya saja yang berubah". SEBELUM ini, semua
// 56 preset memakai font body default (--font-body/Inter) apa pun temanya --
// hanya warna latar/kartu/tombol yang berbeda per tema, tipografi tidak ikut
// bagian dari "mood" tema. Tiap preset sekarang membawa fontFamily sendiri
// (salah satu dari 9 pilihan CUSTOM_FONT_OPTIONS -- var CSS-nya sudah
// dimuat GLOBAL lewat next/font di layout.tsx, jadi aman dipakai preset
// mana pun tanpa font tambahan perlu di-load), dikurasi per suasana tema
// (mis. tema gelap elegan seperti Midnight/Noir/Golden -> Playfair Display
// serif; tema teknologi/futuristik seperti Cyber/Grid -> Roboto Mono; tema
// vivid playful seperti Bloom/Blocks -> Poppins; dst). Diterapkan lewat
// pageStyle (SAMA seperti backgroundImage tema CSS-gradien di atas) karena
// pageStyle SUDAH dipasang unconditional di elemen <main> (lihat
// PagePreview.tsx) untuk SEMUA tema, preset maupun custom -- tidak perlu
// ubah logika getPageTheme() sama sekali untuk jalur preset biasa. Kalau
// kreator mengaktifkan custom_style_override (panel Font), custom.font
// tetap MENANG menimpa nilai ini (lihat pageStyle.fontFamily = fontCssVar
// di getPageTheme()) -- pilihan manual kreator selalu didahulukan. Font
// judul (elemen <h1>, kelas "font-heading") SENGAJA TIDAK ikut berubah di
// sini -- itu tetap sumbu terpisah ("Alternative title font", default MATI)
// yang sudah ada sejak No.98, konsisten dengan bagaimana panel Font
// membedakan "font halaman" vs "font judul" sebagai dua pengaturan berbeda.
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
    pageStyle: { fontFamily: "var(--font-body)" },
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
    pageStyle: { fontFamily: "var(--font-custom-playfair)" },
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
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
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
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
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
    pageStyle: { fontFamily: "var(--font-body)" },
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
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
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
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
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
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
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
    pageStyle: { fontFamily: "var(--font-custom-playfair)" },
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
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
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
    pageStyle: { fontFamily: "var(--font-custom-poppins)" },
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
    pageStyle: { fontFamily: "var(--font-custom-space-grotesk)" },
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
    pageStyle: { fontFamily: "var(--font-custom-roboto-mono)" },
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
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
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
    pageStyle: { fontFamily: "var(--font-custom-playfair)" },
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
    pageStyle: { fontFamily: "var(--font-custom-space-grotesk)" },
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
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
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
    pageStyle: { fontFamily: "var(--font-custom-playfair)" },
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
    pageStyle: { fontFamily: "var(--font-custom-playfair)" },
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
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
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
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
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
    pageStyle: { fontFamily: "var(--font-custom-playfair)" },
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
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
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
    pageStyle: { fontFamily: "var(--font-custom-space-grotesk)" },
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
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
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
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
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
    pageStyle: { fontFamily: "var(--font-body)" },
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
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
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
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
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
    pageStyle: { fontFamily: "var(--font-custom-poppins)" },
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
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
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
      fontFamily: "var(--font-custom-roboto-mono)",
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
      fontFamily: "var(--font-custom-montserrat)",
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
      fontFamily: "var(--font-custom-space-grotesk)",
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
      fontFamily: "var(--font-custom-montserrat)",
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
      fontFamily: "var(--font-custom-space-grotesk)",
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
      fontFamily: "var(--font-custom-montserrat)",
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
      fontFamily: "var(--font-custom-quicksand)",
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
      fontFamily: "var(--font-custom-space-grotesk)",
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
      fontFamily: "var(--font-custom-quicksand)",
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
      fontFamily: "var(--font-custom-lora)",
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
      fontFamily: "var(--font-custom-roboto-mono)",
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
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
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
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
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
      fontFamily: "var(--font-custom-space-grotesk)",
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
      fontFamily: "var(--font-custom-montserrat)",
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
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
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
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
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
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
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
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
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
    pageStyle: { fontFamily: "var(--font-custom-space-grotesk)" },
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
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
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
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
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
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
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
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
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
    pageStyle: { fontFamily: "var(--font-custom-space-grotesk)" },
  },
  // 5 preset "3D" (permintaan langsung pengguna: "buatkan beberapa tema 3d
  // tambahkan di tab baru saja disamping tema walpaper") -- lihat catatan
  // lingkup lengkap di THREE_D_THEME_NAMES: murni CSS, TANPA aset gambar/
  // render 3D sungguhan. Titik terang/highlight SENGAJA diposisikan di
  // pojok jauh dari kolom tengah-atas (tempat avatar/nama/bio selalu duduk)
  // -- pelajaran dari audit kontras menyeluruh sebelumnya (27 Juli 2026)
  // atas tema gradien vivid lain: stop terlalu terang tepat di area teks
  // membuat teks putih nyaris tak terbaca.
  sphere: {
    // Bola 3D mengkilap -- radial-gradient highlight terang di pojok
    // kiri-atas (BUKAN tengah, lihat catatan di atas) meniru cahaya
    // memantul di permukaan bola, meredup cepat ke dasar biru tua gelap.
    label: "Sphere",
    page: "bg-[#0a1024]",
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
    swatch: "#1c3f8f",
    previewBg:
      "radial-gradient(circle at 22% 18%, #ffffff 0%, #a5c8ff 10%, #4f83e8 32%, #1c3f8f 58%, #0a1024 85%)",
    previewIsDark: true,
    pageStyle: {
      fontFamily: "var(--font-custom-montserrat)",
      backgroundImage:
        "radial-gradient(circle 260px at 8% 6%, rgba(200,225,255,0.55) 0%, rgba(79,131,232,0.22) 40%, transparent 70%)",
    },
  },
  chrome: {
    // Logam chrome/gunmetal disikat -- pita diagonal berselang gelap-ke-
    // abu-abu SEDANG (bukan terang/putih) supaya teks putih tetap terbaca
    // di pita mana pun yang kebetulan jatuh di belakang avatar/nama/bio.
    label: "Chrome",
    page: "bg-[#1c1e22]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/70 shadow-hero",
    name: "text-white",
    bio: "text-white/70",
    card: "border border-white/15 bg-white/[0.07] backdrop-blur hover:bg-white/[0.12] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/55",
    productCard: "border border-white/15 bg-white/[0.07] backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-white/90",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/35 hover:text-white",
    swatch: "#4a4e56",
    previewBg:
      "linear-gradient(105deg, #16181c 0%, #3d4148 20%, #1c1e22 35%, #4a4e56 55%, #202226 75%, #34363c 100%)",
    previewIsDark: true,
    pageStyle: {
      fontFamily: "var(--font-custom-roboto-mono)",
      backgroundImage:
        "linear-gradient(105deg, #16181c 0%, #3d4148 20%, #1c1e22 35%, #4a4e56 55%, #202226 75%, #34363c 100%)",
    },
  },
  // Kubus isometrik -- pola CSS murni (enam linear-gradient repetitif
  // bertumpuk pada sudut 30/150/60 derajat) membentuk ilusi susunan kubus
  // 3D, garis SANGAT tipis (opacity 0.05-0.06) di atas latar terang --
  // teks tetap text-ink (bukan putih) seperti preset "Grid"/"Air" yang
  // sudah terbukti aman kontras, pola cuma dekorasi tipis di atasnya.
  cube: {
    label: "Cube",
    page: "bg-[#EDEEF2]",
    glow: "hidden",
    avatarRing: "ring-1 ring-ink/10",
    name: "text-ink",
    bio: "text-muted",
    card: "border-2 border-ink bg-white hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/60",
    productCard: "border-2 border-ink bg-white",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton: "border-2 border-ink bg-white text-ink font-bold hover:bg-ink hover:text-white",
    footer: "text-ink/40 hover:text-ink",
    swatch: "#EDEEF2",
    previewBg: "#EDEEF2",
    previewIsDark: false,
    pageStyle: {
      fontFamily: "var(--font-custom-montserrat)",
      backgroundImage:
        "linear-gradient(30deg, rgba(28,43,37,0.06) 12%, transparent 12.5%, transparent 87%, rgba(28,43,37,0.06) 87.5%, rgba(28,43,37,0.06)), linear-gradient(150deg, rgba(28,43,37,0.06) 12%, transparent 12.5%, transparent 87%, rgba(28,43,37,0.06) 87.5%, rgba(28,43,37,0.06)), linear-gradient(30deg, rgba(28,43,37,0.06) 12%, transparent 12.5%, transparent 87%, rgba(28,43,37,0.06) 87.5%, rgba(28,43,37,0.06)), linear-gradient(150deg, rgba(28,43,37,0.06) 12%, transparent 12.5%, transparent 87%, rgba(28,43,37,0.06) 87.5%, rgba(28,43,37,0.06)), linear-gradient(60deg, rgba(28,43,37,0.05) 25%, transparent 25.5%, transparent 75%, rgba(28,43,37,0.05) 75%, rgba(28,43,37,0.05)), linear-gradient(60deg, rgba(28,43,37,0.05) 25%, transparent 25.5%, transparent 75%, rgba(28,43,37,0.05) 75%, rgba(28,43,37,0.05))",
      backgroundSize: "80px 140px",
      backgroundPosition: "0 0, 0 0, 40px 70px, 40px 70px, 0 0, 40px 70px",
    },
  },
  // Neumorphism/"soft UI" -- kartu terlihat TIMBUL/EMBOSS dari latar lewat
  // box-shadow berlapis (cahaya terang kiri-atas + bayangan gelap kanan-
  // bawah, keduanya warna SAMA seperti latar, bukan hitam solid) -- teknik
  // "3D" yang berbeda dari 4 preset lain (bukan gradient/pola, tapi
  // bayangan kartu itu sendiri). Latar & warna teks ink/muted sama seperti
  // preset light lain yang sudah aman kontras (Air/Haven).
  relief: {
    label: "Relief",
    page: "bg-[#E4E9F0]",
    glow: "hidden",
    avatarRing: "ring-1 ring-ink/10",
    name: "text-ink",
    bio: "text-muted",
    card: "border-0 bg-[#E4E9F0] shadow-[6px_6px_14px_rgba(163,177,198,0.55),-6px_-6px_14px_rgba(255,255,255,0.85)] hover:shadow-[8px_8px_18px_rgba(163,177,198,0.55),-8px_-8px_18px_rgba(255,255,255,0.85)] hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/40",
    productCard: "border-0 bg-[#E4E9F0] shadow-[6px_6px_14px_rgba(163,177,198,0.55),-6px_-6px_14px_rgba(255,255,255,0.85)]",
    productTitle: "text-ink",
    productPrice: "text-ink/70",
    buyButton:
      "bg-[#E4E9F0] text-ink font-bold shadow-[4px_4px_10px_rgba(163,177,198,0.55),-4px_-4px_10px_rgba(255,255,255,0.85)] hover:shadow-[6px_6px_14px_rgba(163,177,198,0.55),-6px_-6px_14px_rgba(255,255,255,0.85)]",
    footer: "text-ink/40 hover:text-ink",
    swatch: "#E4E9F0",
    previewBg: "#E4E9F0",
    previewIsDark: false,
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
  },
  // Permukaan bersegi (low-poly/faceted) -- pita diagonal warna keras
  // (hard-edge, tanpa transisi halus) mensimulasikan bidang-bidang datar
  // sebuah render 3D low-poly/permata terpotong. Semua warna SENGAJA
  // tetap gelap (indigo/ungu tua 800-950) supaya teks putih aman di pita
  // mana pun, tidak seperti gradient halus di tema lain yang perlu diaudit
  // per-stop -- di sini setiap pita sendiri sudah gelap merata.
  facet: {
    label: "Facet",
    page: "bg-[#0d0d14]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/70 shadow-hero",
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
    swatch: "#4c1d95",
    previewBg:
      "linear-gradient(120deg, #1e1b4b 0%, #1e1b4b 20%, #312e81 20%, #312e81 38%, #4c1d95 38%, #4c1d95 55%, #1e3a8a 55%, #1e3a8a 72%, #581c87 72%, #581c87 88%, #0d0d14 88%, #0d0d14 100%)",
    previewIsDark: true,
    pageStyle: {
      fontFamily: "var(--font-custom-space-grotesk)",
      backgroundImage:
        "linear-gradient(120deg, #1e1b4b 0%, #1e1b4b 20%, #312e81 20%, #312e81 38%, #4c1d95 38%, #4c1d95 55%, #1e3a8a 55%, #1e3a8a 72%, #581c87 72%, #581c87 88%, #0d0d14 88%, #0d0d14 100%)",
    },
  },
  // 3 preset "Live Wallpaper" (permintaan susulan: "tambahkan live walpaper
  // di tab 3d dan ubah nama tab nya jadi 3d/live") -- BEDA dari 5 preset
  // "3D" di atas: latar BERGERAK lewat CSS @keyframes (lihat globals.css
  // ".theme-live-*"), bukan gambar statis diam. Kelas animasinya ditaruh
  // di `page` (digabung className biasa, sama seperti kelas Tailwind lain)
  // -- TIDAK ada properti PageTheme baru yang perlu ditambahkan, murni
  // menumpangi mekanisme yang sudah ada. Warna/posisi highlight dipilih
  // dengan pelajaran sama seperti preset 3D: dasar gelap konsisten +
  // titik terang di pojok (bukan tengah-atas tempat avatar/nama/bio duduk)
  // supaya teks putih tetap terbaca SEPANJANG animasi, bukan cuma di satu
  // frame.
  flow: {
    label: "Flow",
    page: "theme-live-flow",
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
    swatch: "#3730a3",
    previewBg: "linear-gradient(120deg, #075985, #3730a3, #6b21a8, #075985)",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-space-grotesk)" },
  },
  pulse: {
    label: "Pulse",
    page: "theme-live-pulse",
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
    swatch: "#8b5cf6",
    previewBg: "radial-gradient(circle at 15% 12%, rgba(139,92,246,0.5) 0%, transparent 55%), #0a0a14",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
  },
  drift: {
    label: "Drift",
    page: "theme-live-drift",
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
    swatch: "#060a18",
    previewBg: "#060a18",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-roboto-mono)" },
  },
  // 6 preset FOTO WALLPAPER TAMBAHAN -- lihat catatan lengkap di
  // WALLPAPER_THEME_NAMES di atas file ini.
  brew: {
    label: "Brew",
    page: "bg-[url('/wallpapers/cafe.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#8B5E34",
    previewBg: "url('/wallpapers/cafe.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-merriweather)" },
  },
  lagoon: {
    label: "Lagoon",
    page: "bg-[url('/wallpapers/beach.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#14B8A6",
    previewBg: "url('/wallpapers/beach.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
  },
  dune: {
    label: "Dune",
    page: "bg-[url('/wallpapers/desert.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#C2703D",
    previewBg: "url('/wallpapers/desert.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-playfair)" },
  },
  sakura: {
    label: "Sakura",
    page: "bg-[url('/wallpapers/blossom.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#E8A0B4",
    previewBg: "url('/wallpapers/blossom.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
  },
  nova: {
    label: "Nova",
    page: "bg-[url('/wallpapers/stars.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#1E3A5F",
    previewBg: "url('/wallpapers/stars.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-space-grotesk)" },
  },
  maple: {
    label: "Maple",
    page: "bg-[url('/wallpapers/autumn.jpg')] bg-cover bg-center bg-no-repeat",
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
    swatch: "#B45309",
    previewBg: "url('/wallpapers/autumn.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-poppins)" },
  },
  // 6 preset VIDEO (permintaan langsung pengguna, 13 Agustus 2026: "juga
  // background yang bergerak seperti menggunakan mov atau gif") -- lihat
  // catatan lengkap di VIDEO_THEME_NAMES di atas file ini soal kenapa ini
  // <video> sungguhan, bukan animasi CSS seperti flow/pulse/drift. `page`
  // di sini HANYA warna dasar gelap polos (fallback sebelum video siap
  // atau kalau videonya gagal dimuat) -- overlay gelap TIDAK dibakar ke
  // video (beda dari wallpaper foto) karena scrim-nya diterapkan hidup
  // lewat CSS langsung di atas elemen <video> (lihat renderBioHeader),
  // supaya kontras teks terjamin apa pun kecerahan klip videonya (klip
  // "atmos"/awan misalnya aslinya terang).
  electric: {
    label: "Electric",
    page: "bg-[#05070D]",
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
    swatch: "#22D3EE",
    previewBg: "url('/videos/neon-poster.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-space-grotesk)" },
    videoSrc: "/videos/neon.mp4",
    posterSrc: "/videos/neon-poster.jpg",
  },
  surge: {
    label: "Surge",
    page: "bg-[#031B2E]",
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
    swatch: "#0EA5E9",
    previewBg: "url('/videos/ocean-poster.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-quicksand)" },
    videoSrc: "/videos/ocean.mp4",
    posterSrc: "/videos/ocean-poster.jpg",
  },
  downtown: {
    label: "Downtown",
    page: "bg-[#0A0E14]",
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
    swatch: "#0F172A",
    previewBg: "url('/videos/citynight-poster.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-montserrat)" },
    videoSrc: "/videos/citynight.mp4",
    posterSrc: "/videos/citynight-poster.jpg",
  },
  polaris: {
    label: "Polaris",
    page: "bg-[#050A0B]",
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
    swatch: "#34D399",
    previewBg: "url('/videos/aurora-poster.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-lora)" },
    videoSrc: "/videos/aurora.mp4",
    posterSrc: "/videos/aurora-poster.jpg",
  },
  atmos: {
    label: "Atmos",
    page: "bg-[#0B1622]",
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
    swatch: "#7DD3FC",
    previewBg: "url('/videos/clouds-poster.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-body)" },
    videoSrc: "/videos/clouds.mp4",
    posterSrc: "/videos/clouds-poster.jpg",
  },
  ember: {
    label: "Ember",
    page: "bg-[#180B04]",
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
    swatch: "#F97316",
    previewBg: "url('/videos/fireplace-poster.jpg') center/cover",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-merriweather)" },
    videoSrc: "/videos/fireplace.mp4",
    posterSrc: "/videos/fireplace-poster.jpg",
  },
  // 5 preset baru (hasil analisa galeri tema kompetitor, 16 Agustus 2026 --
  // pengguna: "saya mau baca dan lihat semua gambar yang ada di folder
  // theme dan lakukan analisa" lalu "iya buatkan" atas rekomendasi 5 tema
  // yang worth ditambahkan): xmas/pride/retro/kraft/monsoon mengisi mood
  // yang belum ada satupun preset-nya sebelumnya (musiman, perayaan,
  // terminal/retro-tech, tekstur kertas kraft, malam hujan). SEMUA murni
  // CSS (gradient/radial-gradient/conic-gradient/noise SVG, teknik yang
  // sama seperti canvas/static/cyber/cosmic di atas) -- TIDAK menambah
  // aset gambar baru, konsisten dengan mayoritas 85 preset lain di file
  // ini yang bukan foto wallpaper/video sungguhan.
  xmas: {
    // Referensi: mockup galeri kompetitor "xmas.C56RcPlE.png" -- latar
    // hijau tua + border ilustrasi Natal (lonceng/holly/ornamen). Border
    // ilustrasi sungguhan tidak direplikasi (butuh aset gambar), diganti
    // radial-gradient merah+emas lembut di belakang avatar (glow) supaya
    // tetap terasa "lampu Natal" tanpa aset baru.
    label: "Xmas",
    page: "bg-gradient-to-b from-[#052e1c] via-[#0b3d24] to-[#052e1c]",
    glow: "bg-gradient-to-br from-red-500/30 via-amber-300/25 to-transparent",
    avatarRing: "ring-4 ring-amber-300/50 shadow-[0_0_70px_-12px_rgba(217,119,6,0.5)]",
    name: "text-white",
    bio: "text-white/80",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-amber-300",
    buyButton: "bg-amber-300 text-[#052e1c] font-bold hover:brightness-105",
    footer: "text-white/30 hover:text-amber-300",
    swatch: "#0F3D2E",
    previewBg:
      "radial-gradient(120% 120% at 25% 10%, rgba(248,113,113,0.28) 0%, transparent 45%), radial-gradient(90% 90% at 80% 85%, rgba(252,211,77,0.22) 0%, transparent 50%), linear-gradient(160deg, #052e1c 0%, #0b3d24 55%, #052e1c 100%)",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-playfair)" },
  },
  pride: {
    // Referensi: mockup galeri kompetitor "pride.BpG7t3VB.png" -- latar
    // biru royal + lengkungan pelangi di bawah. Pelangi PENUH di seluruh
    // `page` sengaja dihindari (halaman kreator bisa sangat panjang --
    // pelangi akan jatuh persis di area footer pada halaman panjang,
    // gagal kontras untuk teks footer yang tidak punya kartu/latar
    // sendiri). Sebagai gantinya pelangi ditaruh di `glow` (blob blur
    // TETAP di dekat avatar atas, posisi selalu sama, lihat PagePreview.tsx)
    // via conic-gradient, dan di `previewBg` (kartu galeri kecil, statis,
    // tidak ada masalah scroll) -- keduanya aman, `page` tetap biru solid
    // supaya SELURUH teks di halaman (termasuk footer) tetap kontras
    // tinggi apa pun panjang halamannya.
    label: "Pride",
    page: "bg-gradient-to-b from-blue-900 via-indigo-900 to-blue-950",
    glow: "bg-[conic-gradient(from_180deg_at_50%_50%,#f43f5e,#f97316,#eab308,#22c55e,#38bdf8,#8b5cf6,#f43f5e)] opacity-50",
    avatarRing: "ring-4 ring-white/85 shadow-hero",
    name: "text-white",
    bio: "text-white/80",
    card: "border border-white/15 bg-white/10 backdrop-blur hover:bg-white/[0.16] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/50",
    productCard: "border border-white/15 bg-white/10 backdrop-blur",
    productTitle: "text-white",
    productPrice: "text-amber-200",
    buyButton: "bg-white text-ink font-bold hover:brightness-95",
    footer: "text-white/35 hover:text-white",
    swatch: "#4F46E5",
    previewBg:
      "linear-gradient(180deg, #1e3a8a 0%, #1e40af 55%, #ef4444 78%, #f97316 83%, #eab308 88%, #22c55e 93%, #3b82f6 97%, #8b5cf6 100%)",
    previewIsDark: true,
    pageStyle: { fontFamily: "var(--font-custom-poppins)" },
  },
  retro: {
    // Referensi: mockup galeri kompetitor "retro.tmNX0151.png" -- latar
    // krem, font monospace, tombol kotak bergaris hitam (gaya terminal/
    // komputer lawas). Satu-satunya preset di seluruh file ini yang
    // menyetel `cardRounded` langsung (biasanya field itu HANYA diisi
    // getPageTheme() untuk override custom -- di sini dipakai langsung
    // di preset karena sudut kotak tegas justru CIRI KHAS tema ini, bukan
    // sekadar pilihan lain dari rounded-xl default).
    label: "Retro",
    page: "bg-[#F3EFE0]",
    glow: "hidden",
    avatarRing: "ring-2 ring-ink",
    name: "text-ink",
    bio: "text-ink/70",
    card: "border-2 border-dashed border-ink/40 bg-transparent hover:bg-ink/5 hover:-translate-y-0.5",
    cardTitle: "text-ink",
    chevron: "text-ink/50",
    productCard: "border-2 border-dashed border-ink/40 bg-transparent",
    productTitle: "text-ink",
    productPrice: "text-ink/80",
    buyButton: "bg-ink text-white font-bold hover:bg-ink/90",
    footer: "text-ink/40 hover:text-ink",
    swatch: "#0A0A0A",
    previewBg: "#F3EFE0",
    previewIsDark: false,
    pageStyle: { fontFamily: "var(--font-custom-roboto-mono)" },
    cardRounded: "rounded-none",
  },
  kraft: {
    // Referensi: mockup galeri kompetitor "desert.DXvdLGal.png" -- tekstur
    // kertas kraft/craft-paper polos + tombol putih bergaris putus-putus
    // (kesan hand-drawn). SENGAJA dinamai "kraft", bukan "desert" -- Jeonme
    // sudah punya wallpaper FOTO bernama "desert.jpg" (lanskap gurun
    // sungguhan), beda total secara visual dari tekstur kertas polos ini,
    // jadi nama berbeda supaya tidak membingungkan di galeri. Teknik noise
    // SVG feTurbulence sama persis dengan canvas/static di atas, hanya
    // warna dasarnya diganti tan kraft-paper + font serif hangat.
    label: "Kraft",
    page: "bg-[#D8C3A0]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/90 shadow-hero",
    name: "text-[#3E2C1C]",
    bio: "text-[#3E2C1C]/70",
    card: "border-2 border-dashed border-[#3E2C1C]/30 bg-white/85 hover:bg-white hover:-translate-y-0.5",
    cardTitle: "text-[#3E2C1C]",
    chevron: "text-[#3E2C1C]/50",
    productCard: "border-2 border-dashed border-[#3E2C1C]/30 bg-white/85",
    productTitle: "text-[#3E2C1C]",
    productPrice: "text-[#8B5E34]",
    buyButton: "bg-[#3E2C1C] text-[#F3E9D8] font-bold hover:bg-[#3E2C1C]/90",
    footer: "text-[#3E2C1C]/40 hover:text-[#3E2C1C]",
    swatch: "#3E2C1C",
    previewBg: "linear-gradient(160deg, #E4D3AE 0%, #D8C3A0 100%)",
    previewIsDark: false,
    pageStyle: {
      fontFamily: "var(--font-custom-lora)",
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\"), linear-gradient(160deg, #E4D3AE 0%, #D8C3A0 100%)",
      backgroundBlendMode: "overlay",
    },
  },
  monsoon: {
    // Referensi: mockup galeri kompetitor "rainy-night.fNTxc-2o.png" --
    // foto jendela berembun hujan + lampu bokeh + tombol kaca buram
    // (glassmorphism). Direplikasi murni CSS (bukan foto sungguhan):
    // repeating-linear-gradient tipis diagonal = garis hujan, beberapa
    // radial-gradient blur = lampu bokeh, di atas gradient biru-teal
    // gelap. Dinamai "monsoon" (bukan "rainy-night" -- SATU-SATUNYA nama
    // preset di seluruh file ini yang berupa frasa dua kata, semua 85
    // preset lain nama tunggal) supaya konsisten dengan konvensi penamaan
    // yang ada, sekaligus relevan buat konteks Indonesia (musim hujan).
    label: "Monsoon",
    page: "bg-[#0B1620]",
    glow: "hidden",
    avatarRing: "ring-4 ring-white/70 shadow-[0_0_60px_-10px_rgba(125,211,252,0.45)]",
    name: "text-white",
    bio: "text-white/75",
    card: "border border-white/20 bg-white/[0.08] backdrop-blur-xl hover:bg-white/[0.14] hover:-translate-y-0.5",
    cardTitle: "text-white",
    chevron: "text-white/55",
    productCard: "border border-white/20 bg-white/[0.08] backdrop-blur-xl",
    productTitle: "text-white",
    productPrice: "text-sky-200",
    buyButton: "border border-white/30 bg-white/15 text-white font-bold backdrop-blur-xl hover:bg-white/25",
    footer: "text-white/35 hover:text-white",
    swatch: "#0EA5E9",
    previewBg:
      "radial-gradient(18% 12% at 20% 25%, rgba(186,230,253,0.55) 0%, transparent 70%), radial-gradient(14% 10% at 75% 15%, rgba(186,230,253,0.4) 0%, transparent 70%), radial-gradient(20% 14% at 60% 45%, rgba(125,211,252,0.3) 0%, transparent 70%), linear-gradient(180deg, #0B1620 0%, #142838 60%, #0B1620 100%)",
    previewIsDark: true,
    pageStyle: {
      fontFamily: "var(--font-custom-lora)",
      backgroundImage:
        "repeating-linear-gradient(115deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 14px), radial-gradient(18% 12% at 20% 25%, rgba(186,230,253,0.5) 0%, transparent 70%), radial-gradient(14% 10% at 75% 15%, rgba(186,230,253,0.35) 0%, transparent 70%), radial-gradient(20% 14% at 60% 45%, rgba(125,211,252,0.25) 0%, transparent 70%), radial-gradient(16% 10% at 40% 70%, rgba(186,230,253,0.3) 0%, transparent 70%), linear-gradient(180deg, #0B1620 0%, #142838 55%, #0B1620 100%)",
    },
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
