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
const PATTERNS: { test: RegExp; Icon: LinkIconComponent; label: string }[] = [
  { test: /(^mailto:)/i, Icon: IconMail, label: "Email" },
  { test: /(youtube\.com|youtu\.be)/i, Icon: IconYoutube, label: "YouTube" },
  { test: /tiktok\.com/i, Icon: IconTiktok, label: "TikTok" },
  { test: /instagram\.com/i, Icon: IconInstagram, label: "Instagram" },
  { test: /(wa\.me|api\.whatsapp\.com|whatsapp\.com)/i, Icon: IconWhatsapp, label: "WhatsApp" },
  { test: /(t\.me|telegram\.me|telegram\.org)/i, Icon: IconTelegram, label: "Telegram" },
  { test: /(twitter\.com|x\.com)/i, Icon: IconX, label: "X (Twitter)" },
  { test: /facebook\.com|fb\.com/i, Icon: IconFacebook, label: "Facebook" },
  { test: /spotify\.com/i, Icon: IconSpotify, label: "Spotify" },
  { test: /linkedin\.com/i, Icon: IconLinkedin, label: "LinkedIn" },
];

export function detectLinkIcon(url: string): { Icon: LinkIconComponent; label: string } {
  for (const { test, Icon, label } of PATTERNS) {
    if (test.test(url)) {
      return { Icon, label };
    }
  }
  return { Icon: IconLink, label: "Tautan" };
}
