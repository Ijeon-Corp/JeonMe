"use client";

import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { IconGlobe, IconInstagram, IconLinkedin, IconMail, IconMapPin, IconPhone, IconTiktok, IconWhatsapp } from "@/components/icons";

// Kartu Nama Digital -- benchmark Linktree "Tools > Business Cards"
// (permintaan pengguna, 3 September 2026): "yang tampil bukan hanya QR
// code-nya saja tapi semua data yang dibutuhkan business card ditampilkan
// dengan bentuk tema card Jeonme". SATU komponen dipakai di tiga tempat --
// modal dashboard, halaman publik /card/{username}, dan (lewat komposer
// canvas di lib/business-card-png.ts) file PNG yang diunduh -- supaya
// kartu yang dilihat kreator, yang di-scan pengunjung, dan yang dicetak
// benar-benar sama.
//
// Warna SENGAJA literal (putih, #111111, aksen hex), bukan token yang ikut
// dark mode: kartu nama adalah artefak -- harus tampak sama di layar
// terang, gelap, dan di atas kertas.
export type BusinessCardTheme = "lavender" | "lime" | "pink" | "blue" | "ink";

export const CARD_THEMES: Record<BusinessCardTheme, { hex: string; text: string; band: string; chip: string }> = {
  lavender: { hex: "#d9ceff", text: "#111111", band: "bg-jeon-lavender", chip: "bg-jeon-lavender" },
  lime: { hex: "#d7ff60", text: "#111111", band: "bg-jeon-lime", chip: "bg-jeon-lime" },
  pink: { hex: "#ffafd0", text: "#111111", band: "bg-jeon-pink", chip: "bg-jeon-pink" },
  blue: { hex: "#8ad5ff", text: "#111111", band: "bg-jeon-blue", chip: "bg-jeon-blue" },
  ink: { hex: "#111111", text: "#ffffff", band: "bg-[#111111]", chip: "bg-white" },
};

export interface BusinessCardData {
  full_name: string;
  job_title: string;
  company: string;
  phone: string;
  whatsapp_number: string;
  email: string;
  website: string;
  tagline: string;
  address: string;
  instagram: string;
  tiktok: string;
  linkedin: string;
  card_theme: BusinessCardTheme | string;
  // background_image_url -- permintaan langsung pengguna, 7 September
  // 2026: "di business card / contact card bisa atur background nya".
  // Kosong berarti tetap pakai card_theme (5 preset warna pita atas),
  // TIDAK ada perubahan visual dari sebelumnya. Kalau diisi, gambar
  // menjadi background SELURUH kartu (pita atas + badan), badan kartu
  // dapat panel putih tembus pandang supaya teks tetap terbaca.
  background_image_url?: string;
}

export function themeOf(raw: string | undefined): BusinessCardTheme {
  return (raw && raw in CARD_THEMES ? raw : "lavender") as BusinessCardTheme;
}

export function waLink(number: string) {
  const digits = number.replace(/\D/g, "").replace(/^0/, "62");
  return `https://wa.me/${digits}`;
}

export function linkedinLink(v: string) {
  return /linkedin\.com/i.test(v) ? (v.startsWith("http") ? v : `https://${v}`) : `https://www.linkedin.com/in/${v}`;
}

export default function DigitalBusinessCard({
  card,
  username,
  avatarUrl,
  url,
  className = "",
}: {
  card: BusinessCardData;
  username: string;
  avatarUrl?: string;
  url: string;
  className?: string;
}) {
  const theme = CARD_THEMES[themeOf(card.card_theme)];
  const initial = (card.full_name || username).charAt(0).toUpperCase() || "?";
  const displayUrl = url.replace(/^https?:\/\//, "");
  const rowBadge = `flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] ${theme.chip} ${theme.chip === "bg-white" ? "text-[#111111]" : "text-[#111111]"}`;
  const row = "flex items-center gap-3 text-sm text-[#111111]";
  const link = "min-w-0 truncate hover:underline";

  const socials: { key: string; href: string; label: string; icon: React.ReactNode }[] = [];
  if (card.instagram) socials.push({ key: "instagram", href: `https://instagram.com/${card.instagram}`, label: `@${card.instagram}`, icon: <IconInstagram className="h-3.5 w-3.5" /> });
  if (card.tiktok) socials.push({ key: "tiktok", href: `https://www.tiktok.com/@${card.tiktok}`, label: `@${card.tiktok}`, icon: <IconTiktok className="h-3.5 w-3.5" /> });
  if (card.linkedin) socials.push({ key: "linkedin", href: linkedinLink(card.linkedin), label: card.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, ""), icon: <IconLinkedin className="h-3.5 w-3.5" /> });

  const hasBackground = Boolean(card.background_image_url);

  return (
    <div
      className={`w-full max-w-sm overflow-hidden rounded-jxl border-2 border-[#111111] bg-white bg-cover bg-center text-[#111111] shadow-brutal ${className}`}
      style={hasBackground ? { backgroundImage: `url(${card.background_image_url})` } : undefined}
    >
      {/* Pita aksen + avatar yang "menggantung" di tepi pita -- pola kartu
          Hero landing (avatar berlingkar hitam di atas kartu bergaris tebal).
          Background kustom (kalau ada) menggantikan warna pita polos --
          dibiarkan transparan di sini supaya gambar wrapper di atas
          tampil utuh sampai ke tepi atas kartu. */}
      <div className={`relative h-24 ${hasBackground ? "" : theme.band}`}>
        <span className="absolute right-4 top-3 rounded-full border-2 border-[#111111] bg-white px-2 py-0.5 font-display text-[10px] font-extrabold tracking-wide text-[#111111]">
          jeon.id
        </span>
        <div className="absolute -bottom-10 left-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-[#111111] bg-white font-display text-2xl font-extrabold text-[#111111]">
          {avatarUrl ? (
            // Ukuran TETAP 80px -- lingkaran avatar kartu ini h-20 w-20.
            // CATATAN: avatarUrl di sini bisa berupa URL googleusercontent
            // MENTAH untuk akun yang daftar lewat Google dan belum pernah ganti
            // foto (oauth_google.go menyimpan profile.Picture apa adanya) --
            // host itu sudah didaftarkan di images.remotePatterns, lihat
            // catatannya di next.config.js.
            <Image src={avatarUrl} alt={card.full_name} width={80} height={80} className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </div>
      </div>

      <div className={`px-6 pb-6 pt-12 ${hasBackground ? "bg-white/85 backdrop-blur-[2px]" : ""}`}>
        <h2 className="font-display text-2xl font-extrabold leading-tight" style={{ textWrap: "balance" }}>
          {card.full_name || username}
        </h2>
        {(card.job_title || card.company) && (
          <p className="mt-0.5 text-sm font-semibold text-[#111111]/70">
            {card.job_title}
            {card.job_title && card.company ? " · " : ""}
            {card.company}
          </p>
        )}
        {card.tagline && <p className="mt-2 text-sm text-[#111111]/75">{card.tagline}</p>}

        <ul className="mt-4 flex flex-col gap-2">
          {card.phone && (
            <li className={row}>
              <span data-icon="phone" className={rowBadge}><IconPhone className="h-4 w-4" /></span>
              <a href={`tel:${card.phone.replace(/\s/g, "")}`} className={link}>{card.phone}</a>
            </li>
          )}
          {card.whatsapp_number && (
            <li className={row}>
              <span data-icon="whatsapp" className={rowBadge}><IconWhatsapp className="h-4 w-4" /></span>
              <a href={waLink(card.whatsapp_number)} target="_blank" rel="noopener noreferrer" className={link}>{card.whatsapp_number}</a>
            </li>
          )}
          {card.email && (
            <li className={row}>
              <span data-icon="email" className={rowBadge}><IconMail className="h-4 w-4" /></span>
              <a href={`mailto:${card.email}`} className={link}>{card.email}</a>
            </li>
          )}
          {card.website && (
            <li className={row}>
              <span data-icon="website" className={rowBadge}><IconGlobe className="h-4 w-4" /></span>
              <a href={card.website} target="_blank" rel="noopener noreferrer" className={link}>{card.website.replace(/^https?:\/\//, "")}</a>
            </li>
          )}
          {card.address && (
            <li className={row}>
              <span data-icon="address" className={rowBadge}><IconMapPin className="h-4 w-4" /></span>
              <a href={`https://maps.google.com/?q=${encodeURIComponent(card.address)}`} target="_blank" rel="noopener noreferrer" className="min-w-0 hover:underline">{card.address}</a>
            </li>
          )}
        </ul>

        {socials.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {socials.map((s) => (
              <a key={s.key} data-icon={s.key} href={s.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-full border-2 border-[#111111] bg-white px-2.5 py-1 text-[11px] font-bold text-[#111111] hover:bg-[#111111] hover:text-white">
                {s.icon}
                {s.label}
              </a>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center gap-4 border-t-2 border-dashed border-[#111111]/20 pt-4">
          {/* data-qr: penanda untuk komposer PNG (ikon baris juga SVG,
              jadi "svg pertama" bukan QR). */}
          <div data-qr className="flex-shrink-0 rounded-jsm border-2 border-[#111111] bg-white p-1.5">
            <QRCodeSVG value={url} size={84} level="M" marginSize={0} fgColor="#111111" bgColor="#ffffff" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold">Scan untuk simpan kontak</p>
            <p className="mt-0.5 break-all text-[11px] text-[#111111]/60">{displayUrl}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
