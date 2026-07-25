import {
  IconFacebook,
  IconInstagram,
  IconLink,
  IconLinkedin,
  IconMail,
  IconSpotify,
  IconTelegram,
  IconTiktok,
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
// badgeClass -- permintaan langsung pengguna (tangkapan layar dashboard
// Links Linktree sungguhan): badge lingkaran berwarna BRAND asli per
// platform (hijau WhatsApp, gradien Instagram, dst), bukan monokrom
// mengikuti warna tema seperti sebelumnya -- supaya sama persis dengan
// referensi. Warna diambil dari warna brand resmi masing-masing platform.
const PATTERNS: { test: RegExp; Icon: LinkIconComponent; label: string; badgeClass: string }[] = [
  { test: /(^mailto:)/i, Icon: IconMail, label: "Email", badgeClass: "bg-slate-600 text-white" },
  { test: /(youtube\.com|youtu\.be)/i, Icon: IconYoutube, label: "YouTube", badgeClass: "bg-[#FF0000] text-white" },
  { test: /tiktok\.com/i, Icon: IconTiktok, label: "TikTok", badgeClass: "bg-black text-white" },
  {
    test: /instagram\.com/i,
    Icon: IconInstagram,
    label: "Instagram",
    badgeClass: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white",
  },
  { test: /(wa\.me|api\.whatsapp\.com|whatsapp\.com)/i, Icon: IconWhatsapp, label: "WhatsApp", badgeClass: "bg-[#25D366] text-white" },
  { test: /(t\.me|telegram\.me|telegram\.org)/i, Icon: IconTelegram, label: "Telegram", badgeClass: "bg-[#26A5E4] text-white" },
  { test: /(twitter\.com|x\.com)/i, Icon: IconX, label: "X (Twitter)", badgeClass: "bg-black text-white" },
  { test: /facebook\.com|fb\.com/i, Icon: IconFacebook, label: "Facebook", badgeClass: "bg-[#1877F2] text-white" },
  { test: /spotify\.com/i, Icon: IconSpotify, label: "Spotify", badgeClass: "bg-[#1DB954] text-white" },
  { test: /linkedin\.com/i, Icon: IconLinkedin, label: "LinkedIn", badgeClass: "bg-[#0A66C2] text-white" },
];

const FALLBACK_BADGE_CLASS = "bg-primary-subtle text-primary";

export function detectLinkIcon(url: string): { Icon: LinkIconComponent; label: string; badgeClass: string } {
  for (const { test, Icon, label, badgeClass } of PATTERNS) {
    if (test.test(url)) {
      return { Icon, label, badgeClass };
    }
  }
  return { Icon: IconLink, label: "Tautan", badgeClass: FALLBACK_BADGE_CLASS };
}
