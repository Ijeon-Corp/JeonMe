"use client";

import { useEffect, useState } from "react";
import { AnalyticsSummary, ApiError, exportAnalyticsCSV, getAnalyticsSummary } from "@/lib/api-client";
import { IconChart, IconDownload, IconInbox, IconLink, IconSparkle } from "@/components/icons";
import AnalyticsAssistant from "@/components/AnalyticsAssistant";

const PRESETS = [7, 30, 90];

const DEVICE_LABEL: Record<string, string> = {
  mobile: "Mobile",
  desktop: "Desktop",
  tablet: "Tablet",
  unknown: "Tidak diketahui",
};

export default function DashboardHomePage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [rangeDays, setRangeDays] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustomRange, setUseCustomRange] = useState(false);

  function currentParams() {
    return useCustomRange && customFrom && customTo
      ? { from: customFrom, to: customTo }
      : { range_days: rangeDays };
  }

  function reload() {
    return getAnalyticsSummary(currentParams())
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat ringkasan."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays, useCustomRange]);

  function handleApplyCustomRange() {
    if (!customFrom || !customTo) {
      setError("Isi tanggal mulai dan tanggal akhir.");
      return;
    }
    setError(null);
    setUseCustomRange(true);
    reload();
  }

  function handlePreset(days: number) {
    setUseCustomRange(false);
    setRangeDays(days);
  }

  async function handleExport() {
    setError(null);
    setExporting(true);
    try {
      await exportAnalyticsCSV(currentParams());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengekspor CSV.");
    } finally {
      setExporting(false);
    }
  }

  const maxDaily = summary
    ? Math.max(1, ...summary.daily_series.map((d) => Math.max(d.views, d.clicks)))
    : 1;
  const maxDevice = summary
    ? Math.max(1, ...summary.device_breakdown.map((d) => d.count))
    : 1;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-muted">
            Statistik {summary?.from_date ?? ""} sampai {summary?.to_date ?? ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-bold text-ink hover:border-primary hover:text-primary disabled:opacity-60"
        >
          <IconDownload className="h-3.5 w-3.5" />
          {exporting ? "Mengekspor..." : "Ekspor CSV"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => handlePreset(d)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              !useCustomRange && rangeDays === d
                ? "border-primary bg-primary-subtle text-primary"
                : "border-border text-muted hover:border-primary/50"
            }`}
          >
            {d} hari
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
          <span className="text-xs text-muted">s/d</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={handleApplyCustomRange}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              useCustomRange
                ? "border-primary bg-primary-subtle text-primary"
                : "border-border text-muted hover:border-primary/50"
            }`}
          >
            Terapkan
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <AnalyticsAssistant />

      {loading ? (
        <p className="mt-6 text-sm text-muted">Memuat...</p>
      ) : (
        summary && (
          <>
            <section className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <IconChart className="h-4 w-4 text-primary" />
                  Kunjungan
                </div>
                <p className="mt-2 font-heading text-3xl font-bold text-ink">{summary.total_views}</p>
              </div>
              <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <IconLink className="h-4 w-4 text-accent-dark" />
                  Klik Tautan
                </div>
                <p className="mt-2 font-heading text-3xl font-bold text-ink">{summary.total_clicks}</p>
              </div>
            </section>

            {summary.daily_series.length > 0 && (
              <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
                <h2 className="font-heading text-sm font-bold text-ink">Tren Harian</h2>
                <div className="mt-4 flex items-end gap-1" style={{ height: 80 }}>
                  {summary.daily_series.map((d) => (
                    <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={d.date}>
                      <div
                        className="w-full rounded-t bg-primary transition-all"
                        style={{ height: `${Math.max(4, (d.views / maxDaily) * 60)}px` }}
                      />
                      <div
                        className="w-full rounded-t bg-accent transition-all"
                        style={{ height: `${Math.max(2, (d.clicks / maxDaily) * 20)}px` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-4 text-[11px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary" /> Kunjungan
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-accent" /> Klik
                  </span>
                </div>
              </section>
            )}

            <section className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
                <h2 className="font-heading text-sm font-bold text-ink">Tautan Terpopuler</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {summary.top_links.map((l) => (
                    <li key={l.link_id} className="flex justify-between text-xs">
                      <span className="truncate text-ink">{l.title}</span>
                      <span className="ml-2 flex-shrink-0 font-semibold text-primary">{l.clicks}</span>
                    </li>
                  ))}
                  {summary.top_links.length === 0 && <EmptyRow text="Belum ada data klik." />}
                </ul>
              </div>

              <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
                <h2 className="font-heading text-sm font-bold text-ink">Produk Terlaris</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {summary.top_products.map((p) => (
                    <li key={p.product_id} className="flex justify-between text-xs">
                      <span className="truncate text-ink">{p.name}</span>
                      <span className="ml-2 flex-shrink-0 font-semibold text-secondary-dark">{p.sold_count} terjual</span>
                    </li>
                  ))}
                  {summary.top_products.length === 0 && <EmptyRow text="Belum ada penjualan." />}
                </ul>
              </div>
            </section>

            <section className="mt-4 grid gap-3 sm:grid-cols-2">
              {summary.top_referrers.length > 0 && (
                <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
                  <h2 className="font-heading text-sm font-bold text-ink">Sumber Trafik Utama</h2>
                  <ul className="mt-3 flex flex-col gap-2">
                    {summary.top_referrers.map((r) => (
                      <li key={r.referrer} className="flex justify-between text-xs">
                        <span className="truncate text-ink">{r.referrer}</span>
                        <span className="ml-2 flex-shrink-0 font-semibold text-primary">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.device_breakdown.length > 0 && (
                <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
                  <h2 className="font-heading text-sm font-bold text-ink">Perangkat Pengunjung</h2>
                  <ul className="mt-3 flex flex-col gap-2">
                    {summary.device_breakdown.map((d) => (
                      <li key={d.device_type} className="flex items-center gap-2 text-xs">
                        <span className="w-20 flex-shrink-0 truncate text-ink">
                          {DEVICE_LABEL[d.device_type] ?? d.device_type}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary-subtle/50">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(4, (d.count / maxDevice) * 100)}%` }}
                          />
                        </div>
                        <span className="w-8 flex-shrink-0 text-right font-semibold text-primary">{d.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {summary.total_views === 0 && (
              <section className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-white/60 p-5 text-center">
                <IconSparkle className="h-5 w-5 flex-shrink-0 text-accent" />
                <p className="text-xs text-muted">
                  Belum ada kunjungan. Bagikan tautan halamanmu di bio Instagram/TikTok supaya statistik mulai terisi.
                </p>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <li className="flex items-center justify-center gap-2 py-2 text-center text-xs text-muted">
      <IconInbox className="h-3.5 w-3.5 flex-shrink-0" />
      {text}
    </li>
  );
}
