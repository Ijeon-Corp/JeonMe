"use client";

import { Skeleton } from "@/components/Skeleton";
import { IconTrendArrow } from "@/components/icons";

// KpiCard (JEONID-DASHBOARD-REDESIGN-SPEC.md §8.3, Phase 3) -- pengganti
// StatCard untuk halaman hasil redesign: tone alias membingungkan
// (blue/yellow/lilac/pink yang semua dirender identik) diganti `semantic`
// eksplisit. Brand card maksimal SATU per grup KPI (aturan §8.3). StatCard
// lama tetap dipakai halaman legacy sampai fasenya.
export type KpiSemantic = "neutral" | "brand" | "success" | "warning" | "info";

const ICON_BADGE: Record<KpiSemantic, string> = {
  neutral: "bg-brand-soft text-brand-600",
  brand: "bg-white/15 text-white",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

export default function KpiCard({
  label,
  value,
  icon,
  trend,
  comparison,
  sparkline,
  semantic = "neutral",
  loading = false,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  // Persentase vs periode pembanding; null/undefined = tanpa badge tren.
  trend?: number | null;
  // Teks pembanding kecil di bawah nilai (mis. "vs periode sebelumnya").
  comparison?: string;
  sparkline?: { line: string; area: string };
  semantic?: KpiSemantic;
  loading?: boolean;
}) {
  const isBrand = semantic === "brand";
  if (loading) {
    return (
      <div className="rounded-2xl border border-dash-border bg-dash-surface p-4" aria-hidden="true">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="mt-3 h-7 w-24" />
        <Skeleton className="mt-2 h-3 w-16" />
      </div>
    );
  }
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-dash-card ${
        isBrand
          ? "border-transparent bg-gradient-to-br from-brand-700 to-brand-500 text-white"
          : "border-dash-border bg-dash-surface"
      }`}
    >
      {/* lime dot momentum (§3.2) hanya di kartu brand */}
      {isBrand && <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-lime to-transparent" aria-hidden="true" />}
      <div className={`flex items-center gap-2 text-xs font-semibold ${isBrand ? "text-white/70" : "text-dash-muted"}`}>
        {icon && <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${ICON_BADGE[semantic]}`}>{icon}</span>}
        {label}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <p className={`font-display text-2xl font-extrabold tracking-tight tabular-nums ${isBrand ? "text-white" : "text-dash-ink"}`}>{value}</p>
        {trend !== undefined && trend !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              isBrand
                ? "bg-white/15 text-brand-lavender"
                : trend >= 0
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger"
            }`}
          >
            <IconTrendArrow className={`h-3 w-3 flex-shrink-0 ${trend >= 0 ? "" : "rotate-180"}`} />
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      {comparison && <p className={`mt-1 text-[11px] ${isBrand ? "text-white/55" : "text-dash-muted"}`}>{comparison}</p>}
      {sparkline && sparkline.line && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" role="presentation" className="mt-2 h-10 w-full">
          <path d={sparkline.area} fill={isBrand ? "#ffffff" : "#6043f5"} fillOpacity={isBrand ? 0.18 : 0.14} />
          <path d={sparkline.line} fill="none" stroke={isBrand ? "#ffffff" : "#6043f5"} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
