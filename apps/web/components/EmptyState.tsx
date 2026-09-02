import { IconInbox } from "@/components/icons";

// Kotak "belum ada data" dipakai berulang persis sama di ~15 titik dashboard
// (Tautan/Produk/Voucher/Bundel/Course/dst) -- satu komponen bersama supaya
// tampilannya konsisten dan perubahan gaya cukup di satu tempat.
//
// REDESAIN 1 September 2026 (permintaan langsung pengguna: "page yang isinya
// sedikit ... layout nya dirubah dan dibuat lebih bagus lagi sesuaikan dengan
// tema homepage nya"). Masalah yang diperbaiki: pada halaman list yang masih
// kosong (mis. Courses di tangkapan layar pengguna), SATU-SATUNYA isi halaman
// adalah kotak putus-putus besar berisi satu baris teks abu -- terasa kosong
// dan datar, dan tombol aksinya jauh di atas, terpisah dari tempat mata
// berhenti.
//
// Tiga perubahan:
// 1. Bahasa visual homepage: border tebal + `shadow-brutal` + lencana ikon
//    beraksen (lavender/lime) + judul `font-display` -- kosakata yang sama
//    dipakai kartu Features/Pricing/AISection di landing.
// 2. `title` opsional: judul tegas di atas kalimat penjelas, jadi kotaknya
//    punya hierarki, bukan satu baris teks mengambang.
// 3. CTA di DALAM kotak: aksi utama diletakkan tepat di titik pandang, tidak
//    lagi cuma menyuruh "klik tombol di atas".
//
// Token warna sengaja pakai `jeon-ink`/`jeon-surface`/`jeon-muted` (variabel
// CSS yang FLIP di dark mode) -- BUKAN `#111111` hardcoded seperti sebagian
// komponen landing, supaya border tebalnya jadi terang di dark mode, bukan
// kotak hitam di atas latar gelap. `shadow-brutal` juga sudah punya varian
// gelapnya sendiri (globals.css).
//
// Semua prop lama (`text`/`as`/`bordered`/`className`/`icon`/`ctaLabel`/
// `onCtaClick`) DIPERTAHANKAN apa adanya -- 15 pemanggil lama tidak perlu
// diubah dan tetap tampil benar tanpa `title`.
export default function EmptyState({
  text,
  title,
  as = "div",
  bordered = true,
  className = "",
  icon: Icon = IconInbox,
  ctaLabel,
  onCtaClick,
  accent = "lavender",
}: {
  text: React.ReactNode;
  // title -- judul singkat di atas `text`. Opsional supaya pemanggil lama
  // (yang cuma mengirim satu kalimat) tetap tampil rapi tanpa judul kosong.
  title?: string;
  as?: "div" | "li";
  bordered?: boolean;
  className?: string;
  icon?: (props: { className?: string }) => React.ReactElement;
  ctaLabel?: string;
  onCtaClick?: () => void;
  // accent -- warna lencana ikon, mengikuti palet aksen homepage. Dipakai
  // hemat supaya tiap halaman tetap terasa satu keluarga.
  accent?: "lavender" | "lime" | "pink";
}) {
  const Tag = as;
  const accentClass = {
    lavender: "bg-jeon-lavender",
    lime: "bg-jeon-lime",
    pink: "bg-jeon-pink",
  }[accent];

  return (
    <Tag
      className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${
        // Bordered: kartu bergaya homepage (border tebal + bayangan offset).
        // Tidak pakai class .glass -- shorthand `border` miliknya akan menang
        // atas utility border di cascade (lihat catatan lama), jadi latar &
        // border ditulis eksplisit di sini.
        bordered ? "rounded-jlg border-2 border-jeon-ink bg-jeon-surface shadow-brutal" : ""
      } ${className}`}
    >
      {/* Lencana ikon: kotak beraksen bergaris tebal, pola sama dengan kartu
          fitur homepage (bukan lingkaran pucat seperti versi sebelumnya).
          Garis HITAM KONSTAN (bukan border-jeon-ink yang flip) -- isian aksen
          selalu terang di kedua mode, jadi garis yang ikut terang di dark mode
          akan nyaris hilang. Lihat catatan lengkap di components/IconBadge.tsx. */}
      <span
        className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-jmd border-2 border-[#111111] text-[#111111] ${accentClass}`}
      >
        <Icon className="h-6 w-6" />
      </span>

      {title && <p className="font-display text-lg font-extrabold tracking-tight text-jeon-ink">{title}</p>}
      <span className={`max-w-sm text-sm leading-relaxed text-jeon-muted ${title ? "" : "mt-0.5"}`}>{text}</span>

      {ctaLabel && onCtaClick && (
        <button
          type="button"
          onClick={onCtaClick}
          className="btn-primary mt-2 rounded-jmd border-2 border-jeon-ink px-5 py-2.5 text-sm font-bold text-white"
        >
          {ctaLabel}
        </button>
      )}
    </Tag>
  );
}
