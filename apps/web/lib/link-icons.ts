import {
  IconAppleMusic,
  IconApplePodcasts,
  IconDiscord,
  IconFacebook,
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

export type LinkIconComponent = typeof IconLink;

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
];

const FALLBACK_BADGE_CLASS = "bg-primary-subtle text-primary";
const FALLBACK_ICON_COLOR_CLASS = "text-primary";

export function detectLinkIcon(
  url: string
): { Icon: LinkIconComponent; label: string; badgeClass: string; iconColorClass: string } {
  for (const { test, Icon, label, badgeClass, iconColorClass } of PATTERNS) {
    if (test.test(url)) {
      return { Icon, label, badgeClass, iconColorClass };
    }
  }
  return { Icon: IconLink, label: "Tautan", badgeClass: FALLBACK_BADGE_CLASS, iconColorClass: FALLBACK_ICON_COLOR_CLASS };
}
