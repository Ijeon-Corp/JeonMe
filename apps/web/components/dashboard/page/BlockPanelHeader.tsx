import { IconBox } from "@/components/icons";
import type { LucideIcon } from "lucide-react";

// BlockPanelHeader -- redesain panel edit blok (permintaan langsung
// pengguna 13 September 2026, "saya mau redesign ui dan ux setiap blok
// mengikuti benchmark seperti di linktree" -- draf disetujui via Artifact
// sebelum implementasi). Header ikon+nama tipe+subjudul di atas panel
// edit blok, supaya jelas blok APA yang sedang diedit tanpa perlu lihat
// tree di sebelah kiri. Komponen presentasional MURNI (tidak tahu soal
// BuilderTreeNode/TYPE_ICON/TYPE_LABEL_KEY) supaya dipakai bersama dari
// BuilderLeftPanel.tsx (Canvas Builder) MAUPUN ProdukBlockEditor.tsx
// (dipakai dari Mode Simple juga, yang tidak punya BuilderTreeNode sama
// sekali) -- pemanggil masing-masing yang menghitung icon/title/subtitle.
// Diterapkan BERTAHAP mulai dari blok tersering dipakai (Tombol/Video/
// FAQ/Produk) -- tipe lain menyusul di putaran berikutnya.
export default function BlockPanelHeader({
  icon: Icon = IconBox,
  title,
  subtitle,
}: {
  icon?: LucideIcon | ((p: { className?: string }) => React.ReactElement);
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-1 flex items-center gap-2.5 border-b border-app-border pb-2.5">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-jeon-lavender text-[#111111]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-app-ink">{title}</p>
        {/* title={subtitle} -- gap ditemukan lewat audit ROUND 2 (13
            September 2026): subtitle statis (typeXDesc) bisa berupa
            kalimat penuh yang kepotong `truncate` tanpa cara APA PUN utk
            membaca sisanya (tidak ada tooltip, tidak ada mode "lihat
            selengkapnya") -- baik utk mouse (hover) maupun pembaca
            layar/perangkat bantu (title attribute diumumkan sbg
            deskripsi tambahan). */}
        {subtitle && (
          <p title={subtitle} className="truncate text-[10.5px] text-app-muted">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
