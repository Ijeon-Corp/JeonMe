import { IconInbox } from "@/components/icons";

// Kotak "belum ada data" dipakai berulang persis sama di ~14 halaman
// dashboard (Tautan/Produk/Voucher/Bundel/dst) -- sebelumnya tiap halaman
// menulis ulang markup yang sama (ikon+teks sebaris rata KIRI). Permintaan
// langsung pengguna: konten di ruang yang masih kosong dibuat rata TENGAH.
// Diekstrak jadi satu komponen bersama supaya tampilannya konsisten di
// semua halaman, dan perubahan gaya ke depannya cukup satu tempat.
export default function EmptyState({
  text,
  as = "div",
  bordered = true,
  className = "",
}: {
  text: React.ReactNode;
  as?: "div" | "li";
  bordered?: boolean;
  className?: string;
}) {
  const Tag = as;
  return (
    <Tag
      className={`flex flex-col items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted ${
        bordered ? "rounded-2xl border border-dashed border-border bg-white/60" : ""
      } ${className}`}
    >
      <IconInbox className="h-5 w-5 flex-shrink-0" />
      <span>{text}</span>
    </Tag>
  );
}
