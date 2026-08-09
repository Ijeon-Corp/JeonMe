import { IconTrendArrow } from "@/components/icons";

// Kartu statistik -- redesain "Premium Refined" (permintaan langsung
// pengguna, 9 Agustus 2026, menggantikan arah "Playful Creator" 9 Agustus
// pagi): rainbow bento (biru/kuning/lilac/pink) DIGANTI satu pernyataan
// warna percaya diri (hijau tua ber-gradasi + garis emas tipis) untuk
// metrik utama ("brand"), kartu lain jadi netral (putih + garis rambut
// hijau + bayangan berlapis) -- bukan warna-warni. Nama tone LAMA
// (blue/yellow/lilac/pink) SENGAJA dipertahankan sebagai key (SEMUANYA
// sekarang menghasilkan gaya netral yang SAMA) supaya ~16 titik pemanggil
// StatCard di seluruh app (Ringkasan/Statistik/Saldo/ShopOverviewPanel/
// admin) TIDAK perlu diubah satu-satu -- cukup ubah definisi di sini.
const NEUTRAL_TONE = {
  card: "bg-white text-ink border border-primary/10 shadow-refined",
  icon: "bg-primary-subtle text-primary",
  label: "text-ink/65",
  value: "text-ink",
  sub: "text-muted",
};

export const STAT_TONES = {
  brand: {
    card: "bg-gradient-to-br from-primary-dark to-primary text-white shadow-refined-lg",
    icon: "bg-white/15 text-white",
    label: "text-white/70",
    value: "text-white",
    sub: "text-white/55",
  },
  blue: NEUTRAL_TONE,
  yellow: NEUTRAL_TONE,
  lilac: NEUTRAL_TONE,
  pink: NEUTRAL_TONE,
} as const;

export function TrendBadge({ pct, onDark = false }: { pct: number | null; onDark?: boolean }) {
  if (pct === null) return null;
  const positive = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        onDark ? "bg-white/15 text-accent-light" : positive ? "bg-secondary-subtle text-secondary-dark" : "bg-red-50 text-red-600"
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
  const isBrand = tone === "brand";
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 transition-transform duration-200 hover:-translate-y-0.5 ${t.card}`}>
      {/* Garis emas tipis -- SATU-satunya penanda "kartu utama", dipakai
          hemat (cuma tone brand), bukan aturan dekoratif di semua kartu. */}
      {isBrand && <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent to-transparent" aria-hidden="true" />}
      <div className={`flex items-center gap-2 text-xs font-semibold ${t.label}`}>
        <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${t.icon}`}>{icon}</span>
        {label}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <p className={`font-serifDisplay text-xl font-semibold tabular-nums ${t.value}`}>{value}</p>
        {pct !== undefined && <TrendBadge pct={pct} onDark={isBrand} />}
      </div>
      {sub !== "" && <p className={`mt-1 text-[11px] ${t.sub}`}>{sub ?? "dibanding periode sebelumnya"}</p>}
      {sparkline && sparkline.line && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-10 w-full">
          <path d={sparkline.area} fill={accentHex} fillOpacity={isBrand ? 0.18 : 0.16} />
          <path d={sparkline.line} fill="none" stroke={accentHex} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
