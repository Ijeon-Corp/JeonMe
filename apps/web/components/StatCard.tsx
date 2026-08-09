import { IconTrendArrow } from "@/components/icons";

// Kartu statistik bento warna-warni (redesain "Playful Creator", 9 Agustus
// 2026) -- DIEKSTRAK dari dashboard/page.tsx (Ringkasan) supaya halaman lain
// yang juga punya baris statistik (statistik/page.tsx, dst.) memakai
// komponen & palet "pop" yang SAMA, bukan menduplikasi StatCard lokalnya
// sendiri per halaman.
export const STAT_TONES = {
  brand: { card: "bg-primary text-white", icon: "bg-white/20 text-white", label: "text-white/75", value: "text-white", sub: "text-white/60" },
  blue: { card: "bg-pop-blue-tint text-ink", icon: "bg-white/70 text-pop-blue", label: "text-ink/70", value: "text-ink", sub: "text-muted" },
  yellow: { card: "bg-pop-yellow-tint text-ink", icon: "bg-white/70 text-accent-dark", label: "text-ink/70", value: "text-ink", sub: "text-muted" },
  lilac: { card: "bg-pop-lilac-tint text-ink", icon: "bg-white/70 text-pop-lilac", label: "text-ink/70", value: "text-ink", sub: "text-muted" },
  pink: { card: "bg-pop-pink-tint text-ink", icon: "bg-white/70 text-pop-pink", label: "text-ink/70", value: "text-ink", sub: "text-muted" },
} as const;

export function TrendBadge({ pct, onDark = false }: { pct: number | null; onDark?: boolean }) {
  if (pct === null) return null;
  const positive = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        onDark ? "bg-white/20 text-white" : positive ? "bg-secondary-subtle text-secondary-dark" : "bg-red-50 text-red-600"
      }`}
    >
      <IconTrendArrow className={`h-3 w-3 flex-shrink-0 ${positive ? "" : "rotate-180"}`} />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function StatCard({
  icon,
  label,
  value,
  pct,
  sub,
  sparkline,
  accentHex = "#1B4D3E",
  tone = "blue",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  // pct -- opsional: kartu tanpa pembanding periode sebelumnya (mis. angka
  // sesaat, bukan rentang tanggal) cukup kirim null/undefined & badge tren
  // tidak dirender, tanpa layout kosong ganjil.
  pct?: number | null;
  // sub -- teks bantuan di bawah angka, default "dibanding periode
  // sebelumnya" (konteks paling umum) tapi bisa dioper kosong/lain.
  sub?: string;
  sparkline?: { line: string; area: string };
  accentHex?: string;
  tone?: keyof typeof STAT_TONES;
}) {
  const t = STAT_TONES[tone];
  return (
    <div className={`rounded-3xl p-4 shadow-card ${t.card}`}>
      <div className={`flex items-center gap-2 text-xs font-semibold ${t.label}`}>
        <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl ${t.icon}`}>{icon}</span>
        {label}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <p className={`font-heading text-xl font-bold tabular-nums ${t.value}`}>{value}</p>
        {pct !== undefined && <TrendBadge pct={pct} onDark={tone === "brand"} />}
      </div>
      {sub !== "" && <p className={`mt-1 text-[11px] ${t.sub}`}>{sub ?? "dibanding periode sebelumnya"}</p>}
      {sparkline && sparkline.line && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-10 w-full">
          <path d={sparkline.area} fill={accentHex} fillOpacity={tone === "brand" ? 0.18 : 0.16} />
          <path d={sparkline.line} fill="none" stroke={accentHex} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
