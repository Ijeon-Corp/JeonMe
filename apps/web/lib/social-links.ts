import {
  IconFacebook,
  IconInstagram,
  IconLinkedin,
  IconMail,
  IconTelegram,
  IconTiktok,
  IconWhatsapp,
  IconX,
  IconYoutube,
} from "@/components/icons";

// Kontak sosial di profil/Link Bio -- permintaan langsung pengguna, 11
// Agustus 2026: baris ikon (Instagram/TikTok/Facebook/WhatsApp/dll) di
// bawah bio halaman publik, TERPISAH dari daftar Tautan biasa. Dipakai
// BERSAMA oleh editor (dashboard/links/page.tsx, ProdukPageEditor.tsx
// lewat parity yang sama) dan render publik (PagePreview.tsx) supaya
// daftar platform, ikon, warna brand, dan cara membangun href/normalisasi
// nilai SELALU satu sumber kebenaran -- tidak didefinisikan ulang di
// masing-masing tempat.
//
// key HARUS sama persis dengan sufiks field `social_<key>` di
// PublicPage/MyPage (lib/api-client.ts) & kolom `social_<key>` di DB.
export const SOCIAL_PLATFORMS = [
  {
    key: "instagram",
    label: "Instagram",
    Icon: IconInstagram,
    placeholder: "username",
    badgeClass: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white",
    buildHref: (value: string) => normalizeHandle(value, "https://instagram.com/"),
  },
  {
    key: "tiktok",
    label: "TikTok",
    Icon: IconTiktok,
    placeholder: "username",
    badgeClass: "bg-black text-white",
    buildHref: (value: string) => normalizeHandle(value, "https://tiktok.com/@"),
  },
  {
    key: "facebook",
    label: "Facebook",
    Icon: IconFacebook,
    placeholder: "username atau nama halaman",
    badgeClass: "bg-[#1877F2] text-white",
    buildHref: (value: string) => normalizeHandle(value, "https://facebook.com/"),
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    Icon: IconWhatsapp,
    placeholder: "62812xxxxxxxx",
    badgeClass: "bg-[#25D366] text-white",
    buildHref: (value: string) => {
      const trimmed = value.trim();
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      const digits = trimmed.replace(/[^0-9]/g, "");
      return `https://wa.me/${digits}`;
    },
  },
  {
    key: "youtube",
    label: "YouTube",
    Icon: IconYoutube,
    placeholder: "@namachannel",
    badgeClass: "bg-[#FF0000] text-white",
    buildHref: (value: string) => normalizeHandle(value, "https://youtube.com/@"),
  },
  {
    key: "x",
    label: "X (Twitter)",
    Icon: IconX,
    placeholder: "username",
    badgeClass: "bg-black text-white",
    buildHref: (value: string) => normalizeHandle(value, "https://x.com/"),
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    Icon: IconLinkedin,
    placeholder: "username",
    badgeClass: "bg-[#0A66C2] text-white",
    buildHref: (value: string) => normalizeHandle(value, "https://linkedin.com/in/"),
  },
  {
    key: "telegram",
    label: "Telegram",
    Icon: IconTelegram,
    placeholder: "username",
    badgeClass: "bg-[#26A5E4] text-white",
    buildHref: (value: string) => normalizeHandle(value, "https://t.me/"),
  },
  {
    key: "email",
    label: "Email",
    Icon: IconMail,
    placeholder: "nama@email.com",
    badgeClass: "bg-slate-600 text-white",
    buildHref: (value: string) => {
      const trimmed = value.trim();
      if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("mailto:")) return trimmed;
      return `mailto:${trimmed}`;
    },
  },
] as const;

export type SocialPlatformKey = (typeof SOCIAL_PLATFORMS)[number]["key"];

// normalizeHandle -- nilai boleh diisi handle SAJA ("username", atau
// "@username") ATAU URL lengkap ("https://instagram.com/username") --
// kalau sudah berupa URL dipakai apa adanya, kalau cuma handle awalan "@"
// dibuang lalu ditempel ke urlPrefix platform terkait.
function normalizeHandle(value: string, urlPrefix: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return urlPrefix + trimmed.replace(/^@/, "");
}

// buildFilledSocialLinks -- helper dipakai render publik (PagePreview) &
// mana pun yang cuma perlu daftar platform yang SUDAH diisi kreator (value
// kosong = platform itu tidak dirender ikonnya sama sekali).
export function buildFilledSocialLinks(
  social: Partial<Record<SocialPlatformKey, string>>
): { key: SocialPlatformKey; label: string; Icon: (typeof SOCIAL_PLATFORMS)[number]["Icon"]; badgeClass: string; href: string }[] {
  return SOCIAL_PLATFORMS.filter((p) => social[p.key]?.trim()).map((p) => ({
    key: p.key,
    label: p.label,
    Icon: p.Icon,
    badgeClass: p.badgeClass,
    href: p.buildHref(social[p.key]!.trim()),
  }));
}
