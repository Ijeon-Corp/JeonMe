"use client";

import { IconDownload } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

// RangeControl (JEONID-DASHBOARD-REDESIGN-SPEC.md §25 Phase 3
// "standardisasi date range" + §9.3 "gabungkan date range dan export ke
// toolbar analitik"): SATU kontrol rentang untuk Beranda & Analitik --
// preset 7/30/90 + rentang kustom + tombol Export opsional. Sebelumnya
// Beranda & Statistik masing-masing punya markup preset sendiri.
export default function RangeControl({
  presets = [7, 30, 90],
  rangeDays,
  useCustom,
  customFrom,
  customTo,
  onPreset,
  onCustomFrom,
  onCustomTo,
  onApplyCustom,
  onExport,
  exporting = false,
  disabled = false,
}: {
  presets?: number[];
  rangeDays: number;
  useCustom: boolean;
  customFrom: string;
  customTo: string;
  onPreset: (days: number) => void;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
  onApplyCustom: () => void;
  onExport?: () => void;
  exporting?: boolean;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-jmd border-2 border-jeon-ink bg-app-surface p-2.5 shadow-card">
      {presets.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onPreset(d)}
          className={`rounded-full border-2 px-3.5 py-1.5 text-xs font-bold transition-colors ${
            !useCustom && rangeDays === d
              ? "border-[#111111] bg-jeon-lavender text-[#111111]"
              : "border-jeon-ink text-app-ink hover:bg-jeon-lavender/40"
          }`}
        >
          {d} {t("dashboard.pages.home.daysSuffix")}
        </button>
      ))}
      {/* flex-wrap sendiri -- fix overflow input date di layar sempit
          (pelajaran audit responsif 5 Agustus 2026, dipertahankan). */}
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          value={customFrom}
          onChange={(e) => onCustomFrom(e.target.value)}
          className="rounded-lg border border-dash-border bg-dash-surface px-2 py-1.5 text-xs text-dash-ink focus:border-brand-500 focus:outline-none"
        />
        <span className="text-xs text-dash-muted">{t("dashboard.pages.home.dateRangeSeparator")}</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => onCustomTo(e.target.value)}
          className="rounded-lg border border-dash-border bg-dash-surface px-2 py-1.5 text-xs text-dash-ink focus:border-brand-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={onApplyCustom}
          className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold transition-colors ${
            useCustom
              ? "border-[#111111] bg-jeon-lavender text-[#111111]"
              : "border-jeon-ink text-app-ink hover:bg-jeon-lavender/40"
          }`}
        >
          {t("dashboard.pages.home.applyButton")}
        </button>
      </div>
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || disabled}
          className="ml-auto flex items-center gap-1.5 rounded-full border-2 border-jeon-ink bg-app-surface px-3.5 py-1.5 text-xs font-bold text-app-ink hover:border-brand-500 hover:text-brand-600 disabled:opacity-60"
        >
          <IconDownload className="h-3.5 w-3.5" />
          {exporting ? t("dashboard.pages.home.exportingLabel") : t("dashboard.pages.home.exportCsvButton")}
        </button>
      )}
    </div>
  );
}
