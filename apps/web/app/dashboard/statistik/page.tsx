"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import {
  AnalyticsSummary,
  ApiError,
  RecentOrder,
  getAnalyticsSummary,
  listRecentOrders,
} from "@/lib/api-client";
import { IconBox, IconChart, IconInbox, IconLink } from "@/components/icons";
import ShopOverviewPanel from "@/components/ShopOverviewPanel";
import StatCard from "@/components/StatCard";
import { useLocale } from "@/lib/locale-context";

// Modul Statistik (permintaan langsung pengguna: "menu statistik yang
// berisi data jumlah klik dll pada link bio dan produk toko di halaman
// saya... pisahkan dengan tab nama link bio dan toko"). Data SAMA persis
// dengan yang sudah dihitung AnalyticsHandler untuk Ringkasan (/dashboard)
// -- halaman ini TIDAK menduplikasi logika backend, cuma menyusun ulang
// metrik yang sama jadi 2 tab terpisah supaya kreator bisa fokus ke satu
// sisi (Link Bio ATAU Toko) tanpa harus menyisir satu halaman panjang yang
// mencampur keduanya.
const PRESETS = [7, 30, 90];

function buildDeviceLabel(t: (key: string) => string): Record<string, string> {
  return {
    mobile: "Mobile",
    desktop: "Desktop",
    tablet: "Tablet",
    unknown: t("dashboard.pages.statistik.deviceUnknown"),
  };
}

// buildAreaPath -- grafik area SVG polos, sama seperti di dashboard/page.tsx
// (Ringkasan). Tidak diekstrak ke lib bersama karena cuma dipakai 2 tempat
// dan sederhana (murni fungsi tampilan, tanpa state).
function buildAreaPath(values: number[]): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? 100 / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = values.length > 1 ? i * stepX : 50;
    const y = 40 - (v / max) * 38 - 1;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(2)},40 L${points[0][0].toFixed(2)},40 Z`;
  return { line, area };
}

export default function StatistikPage() {
  const { t } = useLocale();
  const DEVICE_LABEL = buildDeviceLabel(t);
  const [tab, setTab] = useState<"link-bio" | "toko">("link-bio");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);

  useEffect(() => {
    Promise.all([getAnalyticsSummary({ range_days: rangeDays }), listRecentOrders()])
      .then(([s, orders]) => {
        setSummary(s);
        setRecentOrders(orders);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.statistik.loadError")))
      .finally(() => setLoading(false));
  }, [rangeDays]);

  const viewsPath = summary ? buildAreaPath(summary.daily_series.map((d) => d.views)) : { line: "", area: "" };
  const clicksPath = summary ? buildAreaPath(summary.daily_series.map((d) => d.clicks)) : { line: "", area: "" };
  const maxDevice = summary ? Math.max(1, ...summary.device_breakdown.map((d) => d.count)) : 1;

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-app-muted">{t("dashboard.pages.statistik.intro")}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 border-b border-app-border">
          <button
            type="button"
            onClick={() => setTab("link-bio")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "link-bio" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
            }`}
          >
            <IconLink className="h-4 w-4" />
            {t("dashboard.pages.statistik.tabLinkBio")}
          </button>
          <button
            type="button"
            onClick={() => setTab("toko")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "toko" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
            }`}
          >
            <IconBox className="h-4 w-4" />
            {t("dashboard.pages.statistik.tabShop")}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRangeDays(d)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                rangeDays === d
                  ? "border-jeon-purple bg-jeon-purple/10 text-jeon-purple"
                  : "border-app-border text-app-muted hover:border-jeon-purple/50"
              }`}
            >
              {d} {t("dashboard.pages.statistik.days")}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading || !summary ? (
        <PageSkeleton />
      ) : tab === "link-bio" ? (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3">
            <StatCard tone="blue" icon={<IconChart className="h-4 w-4" />} label={t("dashboard.pages.statistik.pageViews")} value={summary.total_views.toLocaleString("id-ID")} sub="" />
            <StatCard tone="yellow" icon={<IconLink className="h-4 w-4" />} label={t("dashboard.pages.statistik.linkClicks")} value={summary.total_clicks.toLocaleString("id-ID")} sub="" />
          </section>

          {summary.daily_series.length > 0 && (
            <div className="glass mt-3 rounded-jlg p-4 shadow-card">
              <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.statistik.trendHeading")}</h2>
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-4 h-40 w-full">
                <defs>
                  <linearGradient id="statViewsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7657ff" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#7657ff" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={viewsPath.area} fill="url(#statViewsGradient)" />
                <path d={viewsPath.line} fill="none" stroke="#7657ff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <path d={clicksPath.line} fill="none" stroke="#ff6448" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="mt-2 flex justify-between text-[10px] text-app-muted">
                <span>{summary.daily_series[0]?.date}</span>
                <span>{summary.daily_series[summary.daily_series.length - 1]?.date}</span>
              </div>
              <div className="mt-3 flex gap-4 text-[11px] text-app-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-jeon-purple" /> {t("dashboard.pages.statistik.legendViews")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-jeon-coral" /> {t("dashboard.pages.statistik.legendClicks")}
                </span>
              </div>
            </div>
          )}

          <section className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="glass rounded-jlg p-4 shadow-card">
              <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.statistik.topLinksHeading")}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {summary.top_links.map((l) => (
                  <li key={l.link_id} className="flex justify-between text-xs">
                    <span className="truncate text-app-ink">{l.title}</span>
                    <span className="ml-2 flex-shrink-0 font-semibold text-jeon-purple">
                      {l.clicks} {t("dashboard.pages.statistik.clicksSuffix")}
                    </span>
                  </li>
                ))}
                {summary.top_links.length === 0 && <EmptyRow text={t("dashboard.pages.statistik.emptyClicks")} />}
              </ul>
            </div>

            {summary.device_breakdown.length > 0 && (
              <div className="glass rounded-jlg p-4 shadow-card">
                <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.statistik.deviceHeading")}</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {summary.device_breakdown.map((d) => (
                    <li key={d.device_type} className="flex items-center gap-2 text-xs">
                      <span className="w-20 flex-shrink-0 truncate text-app-ink">{DEVICE_LABEL[d.device_type] ?? d.device_type}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-jeon-purple/5">
                        <div className="h-full rounded-full bg-jeon-purple" style={{ width: `${Math.max(4, (d.count / maxDevice) * 100)}%` }} />
                      </div>
                      <span className="w-8 flex-shrink-0 text-right font-semibold text-jeon-purple">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="mt-4">
          <ShopOverviewPanel summary={summary} recentOrders={recentOrders} />
        </div>
      )}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <li className="flex items-center justify-center gap-2 py-2 text-center text-xs text-app-muted">
      <IconInbox className="h-3.5 w-3.5 flex-shrink-0" />
      {text}
    </li>
  );
}
