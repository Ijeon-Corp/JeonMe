import { IconInbox } from "@/components/icons";

// Kotak "belum ada data" dipakai berulang persis sama di ~14 halaman
// dashboard (Tautan/Produk/Voucher/Bundel/dst) -- sebelumnya tiap halaman
// menulis ulang markup yang sama (ikon+teks sebaris rata KIRI). Permintaan
// langsung pengguna: konten di ruang yang masih kosong dibuat rata TENGAH.
// Diekstrak jadi satu komponen bersama supaya tampilannya konsisten di
// semua halaman, dan perubahan gaya ke depannya cukup satu tempat.
//
// Redesain premium (permintaan langsung pengguna, "design dashboard ini
// terlalu biasa"): ikon polos kecil diganti lencana bulat besar warna
// brand -- SATU tempat ini otomatis mengangkat tampilan ke-28 pemakaian
// tanpa menyentuh satu pun dari 14 file pemanggilnya. `icon`/`ctaLabel`/
// `onCtaClick` OPSIONAL (default tetap IconInbox, tanpa tombol) --
// SEBAGIAN BESAR pemanggil yang ada sudah punya tombol aksi sendiri di
// atas (teks "klik X di atas"), jadi CTA baru di sini TIDAK dipaksakan
// ke pemanggil lama, cuma tersedia untuk dipakai selektif ke depannya.
export default function EmptyState({
  text,
  as = "div",
  bordered = true,
  className = "",
  icon: Icon = IconInbox,
  ctaLabel,
  onCtaClick,
}: {
  text: React.ReactNode;
  as?: "div" | "li";
  bordered?: boolean;
  className?: string;
  icon?: (props: { className?: string }) => React.ReactElement;
  ctaLabel?: string;
  onCtaClick?: () => void;
}) {
  const Tag = as;
  return (
    <Tag
      className={`flex flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted ${
        // Bug dihindari: TIDAK pakai class .glass di sini -- shorthand
        // `border` milik .glass (solid) akan menang atas utility
        // `border-dashed` Tailwind pada cascade (.glass didefinisikan
        // SETELAH @tailwind utilities di globals.css, jadi menang kalau
        // digabung). Efek kaca ditiru manual (bg+blur saja, TANPA
        // shorthand border) supaya `border-dashed` tetap dashed sungguhan.
        bordered ? "rounded-3xl border border-dashed border-border bg-white/65 backdrop-blur-lg" : ""
      } ${className}`}
    >
      <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span>{text}</span>
      {ctaLabel && onCtaClick && (
        <button
          type="button"
          onClick={onCtaClick}
          className="btn-primary mt-1 rounded-full px-4 py-2 text-xs font-bold text-white"
        >
          {ctaLabel}
        </button>
      )}
    </Tag>
  );
}
