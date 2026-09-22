import { createElement } from "react";
import {
  IconAppleMusic,
  IconApplePodcasts,
  IconDiscord,
  IconFacebook,
  IconGithub,
  IconGoogleMaps,
  IconInstagram,
  IconLink,
  IconLinkedin,
  IconMail,
  IconShopee,
  IconSpotify,
  IconTelegram,
  IconTiktok,
  IconTwitch,
  IconWhatsapp,
  IconX,
  IconYoutube,
} from "@/components/icons";
import {
  siAppstore,
  siBandcamp,
  siBehance,
  siBukalapak,
  siBuymeacoffee,
  siCalendly,
  siDribbble,
  siDropbox,
  siEtsy,
  siGoogledrive,
  siGoogleplay,
  siKakaotalk,
  siKofi,
  siLine,
  siMedium,
  siNotion,
  siPatreon,
  siPaypal,
  siPinterest,
  siReddit,
  siSnapchat,
  siSoundcloud,
  siSubstack,
  siThreads,
  siTumblr,
  siVimeo,
  type SimpleIcon,
} from "simple-icons";

export type LinkIconComponent = typeof IconLink;

// simpleIconComponent -- susulan 22 September 2026 (permintaan langsung
// pengguna, screenshot daftar tautan: "bukankah lebih bagus kalo
// menyediakan tipe lain untuk icon blok blok ini" -- terlalu banyak baris
// jatuh ke ikon rantai generik). SEBELUM ini, SATU-SATUNYA cara menambah
// platform baru ke detectLinkIcon adalah menggambar tangan komponen SVG
// baru di components/icons.tsx (Simple Icons disalin manual satu per
// satu, lihat catatan IconGithub) -- lambat & satu-satunya alasan
// detectLinkIcon cuma mengenali 16 platform setelah berbulan-bulan.
// simple-icons (npm, CC0-1.0, ~3.460 logo brand asli) membuat penambahan
// SISANYA murni satu baris pola (regex + `path`), TANPA perlu
// menggambar apa pun -- fungsi generik ini yang mengubah data mentah
// `SimpleIcon.path` jadi komponen yang bentuknya identik dgn IconXxx
// hand-drawn (props {className} sama persis), supaya PATTERNS di bawah
// tidak perlu tahu bedanya. 16 platform LAMA SENGAJA tidak diikutkan ke
// sini -- beberapa (Instagram/Apple Music/Apple Podcasts) pakai gradient
// multi-warna yang tidak bisa direpresentasikan satu `hex` tunggal, jadi
// tetap hand-drawn; mengubahnya cuma menambah risiko tanpa manfaat nyata.
// createElement (BUKAN JSX) -- file ini ".ts" polos (data/logika murni,
// tidak pernah butuh JSX sebelum fungsi ini), mengubahnya ke ".tsx" cuma
// demi satu fungsi kecil ini tidak sepadan dengan risiko menyentuh semua
// pemakai import (`@/lib/link-icons`, 5 file).
function simpleIconComponent(icon: SimpleIcon): LinkIconComponent {
  return function SimpleIconGlyph({ className }: { className?: string }) {
    return createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor", className, "aria-hidden": true }, createElement("path", { d: icon.path }));
  };
}

// detectLinkIcon -- deteksi platform dari URL tautan, MURNI kosmetik sisi
// klien (tidak ada validasi/pembatasan seperti isValidVideoEmbedURL di
// backend links.go, cuma menentukan ikon apa yang ditampilkan). Sengaja
// tidak menyimpan hasil deteksi ke database -- dihitung ulang tiap render
// dari kolom `url` yang sudah ada, jadi berlaku RETROAKTIF untuk tautan
// lama tanpa migrasi data apa pun.
//
// badgeClass -- dipakai oleh dashboard/links/page.tsx (daftar tautan
// kreator, badge lingkaran berwarna BRAND asli per platform, TIDAK diubah
// oleh permintaan ini -- konteks berbeda, daftar manajemen bukan tampilan
// pengunjung).
//
// iconColorClass -- permintaan langsung pengguna: di halaman publik/
// pratinjau, ikon platform ditampilkan TANPA badge lingkaran, cuma ikonnya
// saja diwarnai warna brand (bukan putih polos di atas lingkaran berwarna).
// CATATAN JUJUR: TikTok & X pakai warna brand hitam -- kontras bisa kurang
// kalau kartu tautan kebetulan gelap (mis. tema Midnight/Noir), karena
// warna brand resminya memang dirancang di atas badge terang, bukan
// langsung di atas kartu. Belum ada penanganan otomatis per-tema untuk ini.
const PATTERNS: { test: RegExp; Icon: LinkIconComponent; label: string; badgeClass: string; iconColorClass: string }[] = [
  { test: /(^mailto:)/i, Icon: IconMail, label: "Email", badgeClass: "bg-slate-600 text-white", iconColorClass: "text-slate-600" },
  {
    test: /(youtube\.com|youtu\.be)/i,
    Icon: IconYoutube,
    label: "YouTube",
    badgeClass: "bg-[#FF0000] text-white",
    iconColorClass: "text-[#FF0000]",
  },
  { test: /tiktok\.com/i, Icon: IconTiktok, label: "TikTok", badgeClass: "bg-black text-white", iconColorClass: "text-black" },
  {
    test: /instagram\.com/i,
    Icon: IconInstagram,
    label: "Instagram",
    badgeClass: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white",
    iconColorClass: "text-[#D62976]",
  },
  {
    test: /(wa\.me|api\.whatsapp\.com|whatsapp\.com)/i,
    Icon: IconWhatsapp,
    label: "WhatsApp",
    badgeClass: "bg-[#25D366] text-white",
    iconColorClass: "text-[#25D366]",
  },
  {
    test: /(t\.me|telegram\.me|telegram\.org)/i,
    Icon: IconTelegram,
    label: "Telegram",
    badgeClass: "bg-[#26A5E4] text-white",
    iconColorClass: "text-[#26A5E4]",
  },
  { test: /(twitter\.com|x\.com)/i, Icon: IconX, label: "X (Twitter)", badgeClass: "bg-black text-white", iconColorClass: "text-black" },
  {
    test: /facebook\.com|fb\.com/i,
    Icon: IconFacebook,
    label: "Facebook",
    badgeClass: "bg-[#1877F2] text-white",
    iconColorClass: "text-[#1877F2]",
  },
  { test: /spotify\.com/i, Icon: IconSpotify, label: "Spotify", badgeClass: "bg-[#1DB954] text-white", iconColorClass: "text-[#1DB954]" },
  {
    test: /linkedin\.com/i,
    Icon: IconLinkedin,
    label: "LinkedIn",
    badgeClass: "bg-[#0A66C2] text-white",
    iconColorClass: "text-[#0A66C2]",
  },
  // Susulan 20 Agustus 2026 (bareng penggantian ikon sosmed) -- platform
  // ini sudah lama direferensikan di tempat lain (PLATFORM_URL,
  // quick-setup-templates.ts) tapi belum pernah dikenali detectLinkIcon,
  // selalu jatuh ke IconLink generik.
  {
    test: /discord\.(gg|com)/i,
    Icon: IconDiscord,
    label: "Discord",
    badgeClass: "bg-[#5865F2] text-white",
    iconColorClass: "text-[#5865F2]",
  },
  { test: /twitch\.tv/i, Icon: IconTwitch, label: "Twitch", badgeClass: "bg-[#9146FF] text-white", iconColorClass: "text-[#9146FF]" },
  { test: /shopee\.co\.id|shopee\.com/i, Icon: IconShopee, label: "Shopee", badgeClass: "bg-[#EE4D2D] text-white", iconColorClass: "text-[#EE4D2D]" },
  {
    test: /music\.apple\.com/i,
    Icon: IconAppleMusic,
    label: "Apple Music",
    badgeClass: "bg-gradient-to-br from-[#FA5B93] to-[#FA233B] text-white",
    iconColorClass: "text-[#FA233B]",
  },
  {
    test: /podcasts\.apple\.com/i,
    Icon: IconApplePodcasts,
    label: "Apple Podcasts",
    badgeClass: "bg-gradient-to-br from-[#B247F2] to-[#7C4CE8] text-white",
    iconColorClass: "text-[#9433EB]",
  },
  {
    test: /(maps\.google\.|goo\.gl\/maps)/i,
    Icon: IconGoogleMaps,
    label: "Google Maps",
    badgeClass: "bg-[#4285F4] text-white",
    iconColorClass: "text-[#4285F4]",
  },
  // Susulan 24 Agustus 2026 (bareng platform sosial GitHub baru,
  // lib/social-links.ts) -- sama alasannya dengan Discord/Twitch/dst di
  // atas, tautan biasa ke github.com (bukan cuma baris ikon sosial)
  // sebelumnya selalu jatuh ke IconLink generik.
  { test: /github\.com/i, Icon: IconGithub, label: "GitHub", badgeClass: "bg-[#181717] text-white", iconColorClass: "text-[#181717]" },

  // Susulan 22 September 2026 (lihat catatan panjang simpleIconComponent
  // di atas) -- 25 platform baru sekaligus, dulu semuanya jatuh ke ikon
  // rantai generik karena menggambar tangan tiap logo terlalu lambat.
  // Hex diambil LANGSUNG dari `icon.hex` tiap paket (SATU sumber
  // kebenaran, disalin literal ke sini -- BUKAN interpolasi `${icon.hex}`,
  // Tailwind JIT butuh string utuh statis supaya kelasnya benar-benar
  // ikut ter-generate, lihat CLAUDE.md soal kelas Tailwind yang diam-diam
  // no-op). 3 warna brand terang (Snapchat/Buy Me a Coffee/KakaoTalk,
  // kuning) SENGAJA pakai teks gelap, bukan `text-white` seperti yang
  // lain -- kontrasnya gagal total di atas kuning terang.
  { test: /threads\.net/i, Icon: simpleIconComponent(siThreads), label: "Threads", badgeClass: "bg-[#000000] text-white", iconColorClass: "text-[#000000]" },
  { test: /(pinterest\.com|pin\.it)/i, Icon: simpleIconComponent(siPinterest), label: "Pinterest", badgeClass: "bg-[#BD081C] text-white", iconColorClass: "text-[#BD081C]" },
  { test: /snapchat\.com/i, Icon: simpleIconComponent(siSnapchat), label: "Snapchat", badgeClass: "bg-[#FFFC00] text-black", iconColorClass: "text-[#FFFC00]" },
  { test: /behance\.net/i, Icon: simpleIconComponent(siBehance), label: "Behance", badgeClass: "bg-[#1769FF] text-white", iconColorClass: "text-[#1769FF]" },
  { test: /dribbble\.com/i, Icon: simpleIconComponent(siDribbble), label: "Dribbble", badgeClass: "bg-[#EA4C89] text-white", iconColorClass: "text-[#EA4C89]" },
  { test: /medium\.com/i, Icon: simpleIconComponent(siMedium), label: "Medium", badgeClass: "bg-[#000000] text-white", iconColorClass: "text-[#000000]" },
  { test: /substack\.com/i, Icon: simpleIconComponent(siSubstack), label: "Substack", badgeClass: "bg-[#FF6719] text-white", iconColorClass: "text-[#FF6719]" },
  { test: /ko-fi\.com/i, Icon: simpleIconComponent(siKofi), label: "Ko-fi", badgeClass: "bg-[#FF6433] text-white", iconColorClass: "text-[#FF6433]" },
  { test: /patreon\.com/i, Icon: simpleIconComponent(siPatreon), label: "Patreon", badgeClass: "bg-[#000000] text-white", iconColorClass: "text-[#000000]" },
  { test: /buymeacoffee\.com/i, Icon: simpleIconComponent(siBuymeacoffee), label: "Buy Me a Coffee", badgeClass: "bg-[#FFDD00] text-black", iconColorClass: "text-[#FFDD00]" },
  { test: /paypal\.(com|me)/i, Icon: simpleIconComponent(siPaypal), label: "PayPal", badgeClass: "bg-[#002991] text-white", iconColorClass: "text-[#002991]" },
  { test: /reddit\.com/i, Icon: simpleIconComponent(siReddit), label: "Reddit", badgeClass: "bg-[#FF4500] text-white", iconColorClass: "text-[#FF4500]" },
  { test: /tumblr\.com/i, Icon: simpleIconComponent(siTumblr), label: "Tumblr", badgeClass: "bg-[#36465D] text-white", iconColorClass: "text-[#36465D]" },
  { test: /vimeo\.com/i, Icon: simpleIconComponent(siVimeo), label: "Vimeo", badgeClass: "bg-[#1AB7EA] text-white", iconColorClass: "text-[#1AB7EA]" },
  { test: /soundcloud\.com/i, Icon: simpleIconComponent(siSoundcloud), label: "SoundCloud", badgeClass: "bg-[#FF5500] text-white", iconColorClass: "text-[#FF5500]" },
  { test: /bandcamp\.com/i, Icon: simpleIconComponent(siBandcamp), label: "Bandcamp", badgeClass: "bg-[#408294] text-white", iconColorClass: "text-[#408294]" },
  { test: /notion\.(so|site)/i, Icon: simpleIconComponent(siNotion), label: "Notion", badgeClass: "bg-[#000000] text-white", iconColorClass: "text-[#000000]" },
  { test: /calendly\.com/i, Icon: simpleIconComponent(siCalendly), label: "Calendly", badgeClass: "bg-[#006BFF] text-white", iconColorClass: "text-[#006BFF]" },
  { test: /drive\.google\.com/i, Icon: simpleIconComponent(siGoogledrive), label: "Google Drive", badgeClass: "bg-[#4285F4] text-white", iconColorClass: "text-[#4285F4]" },
  { test: /dropbox\.com/i, Icon: simpleIconComponent(siDropbox), label: "Dropbox", badgeClass: "bg-[#0061FF] text-white", iconColorClass: "text-[#0061FF]" },
  { test: /(line\.me|lin\.ee)/i, Icon: simpleIconComponent(siLine), label: "LINE", badgeClass: "bg-[#00C300] text-white", iconColorClass: "text-[#00C300]" },
  { test: /kakao\.com/i, Icon: simpleIconComponent(siKakaotalk), label: "KakaoTalk", badgeClass: "bg-[#FFCD00] text-black", iconColorClass: "text-[#FFCD00]" },
  { test: /play\.google\.com/i, Icon: simpleIconComponent(siGoogleplay), label: "Google Play", badgeClass: "bg-[#414141] text-white", iconColorClass: "text-[#414141]" },
  { test: /apps\.apple\.com/i, Icon: simpleIconComponent(siAppstore), label: "App Store", badgeClass: "bg-[#0D96F6] text-white", iconColorClass: "text-[#0D96F6]" },
  { test: /etsy\.com/i, Icon: simpleIconComponent(siEtsy), label: "Etsy", badgeClass: "bg-[#F16521] text-white", iconColorClass: "text-[#F16521]" },
  { test: /bukalapak\.com/i, Icon: simpleIconComponent(siBukalapak), label: "Bukalapak", badgeClass: "bg-[#E31E52] text-white", iconColorClass: "text-[#E31E52]" },
];

const FALLBACK_BADGE_CLASS = "bg-primary-subtle text-primary";
const FALLBACK_ICON_COLOR_CLASS = "text-primary";

// isFallback -- true kalau URL tidak cocok platform mana pun (ikon rantai
// generik). Dipakai baris blok dashboard (redesain 18 September 2026) utk
// memilih kulit tile: platform terdeteksi = warna mereknya, generik = tile
// putih bergaris (referensi gambar pengguna), BUKAN badgeClass fallback.
export function detectLinkIcon(
  url: string
): { Icon: LinkIconComponent; label: string; badgeClass: string; iconColorClass: string; isFallback: boolean } {
  for (const { test, Icon, label, badgeClass, iconColorClass } of PATTERNS) {
    if (test.test(url)) {
      return { Icon, label, badgeClass, iconColorClass, isFallback: false };
    }
  }
  return { Icon: IconLink, label: "Tautan", badgeClass: FALLBACK_BADGE_CLASS, iconColorClass: FALLBACK_ICON_COLOR_CLASS, isFallback: true };
}
