// IconBadge -- lencana ikon bergaya homepage (permintaan langsung pengguna,
// 1 September 2026: "semua icon yang ada didashboard disesuaikan semua
// dengan tema").
//
// SEBELUMNYA dashboard memakai lingkaran tint ungu pucat
// (`rounded-full bg-jeon-purple/10 text-jeon-purple`) di ~18 tempat --
// lembut tapi tidak nyambung dengan bahasa visual homepage, yang memakai
// KOTAK membulat + garis tebal + isian aksen penuh (lihat kartu fitur
// Features.tsx, ikon FAQ, kartu AISection di landing).
//
// PENTING soal warna garis: `border-[#111111]` sengaja HITAM KONSTAN, bukan
// `border-jeon-ink` yang ikut flip tema. Alasannya, isian aksen
// (lavender/lime/pink/blue) SELALU terang di kedua mode -- kalau garisnya
// ikut jadi terang di dark mode, garis terang di atas isian terang jadi
// nyaris tak terlihat. Homepage memakai pola yang sama persis. Teks/ikon di
// dalamnya juga hitam konstan karena alasan yang sama.
const ACCENT = {
  lavender: "bg-jeon-lavender",
  lime: "bg-jeon-lime",
  pink: "bg-jeon-pink",
  blue: "bg-jeon-blue",
  coral: "bg-jeon-coral",
} as const;

const SIZE = {
  sm: { box: "h-8 w-8 rounded-jsm", icon: "h-4 w-4" },
  md: { box: "h-11 w-11 rounded-jmd", icon: "h-5 w-5" },
  lg: { box: "h-14 w-14 rounded-jmd", icon: "h-6 w-6" },
} as const;

export type IconBadgeAccent = keyof typeof ACCENT;

export default function IconBadge({
  icon: Icon,
  accent = "lavender",
  size = "md",
  className = "",
}: {
  icon: (props: { className?: string }) => React.ReactElement;
  accent?: IconBadgeAccent;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center border-2 border-[#111111] text-[#111111] ${s.box} ${ACCENT[accent]} ${className}`}
    >
      <Icon className={s.icon} />
    </span>
  );
}

// accentForIndex -- untuk grid kartu yang berjejer (kategori Quick Setup,
// hub Monetisasi, hub Pengaturan): homepage memvariasikan warna aksen antar
// kartu supaya tidak terasa datar. Urutannya tetap (bukan acak) supaya
// warna sebuah kartu KONSISTEN tiap render.
const ACCENT_CYCLE: IconBadgeAccent[] = ["lavender", "lime", "pink", "blue"];
export function accentForIndex(i: number): IconBadgeAccent {
  return ACCENT_CYCLE[i % ACCENT_CYCLE.length];
}
