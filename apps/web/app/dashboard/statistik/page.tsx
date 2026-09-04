"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import {
  AnalyticsSummary,
  ApiError,
  RecentOrder,
  exportAnalyticsCSV,
  getAnalyticsSummary,
  listRecentOrders,
} from "@/lib/api-client";
import { IconBox, IconChart, IconInbox, IconLink, IconWallet } from "@/components/icons";
import ShopOverviewPanel from "@/components/ShopOverviewPanel";
import StatCard from "@/components/StatCard";
import { useLocale } from "@/lib/locale-context";
import { dashRedesignEnabled } from "@/lib/dashboard-flags";
import PageHeader from "@/components/dashboard/page/PageHeader";
import SectionCard from "@/components/dashboard/page/SectionCard";
import KpiCard from "@/components/dashboard/data/KpiCard";
import RangeControl from "@/components/dashboard/data/RangeControl";
import { KpiSkeleton, ChartSkeleton } from "@/components/dashboard/feedback/Skeletons";
import { useErrorToast } from "@/lib/use-error-toast";

// Modul Statistik. v2 (JEONID-DASHBOARD-REDESIGN-SPEC.md §16, Phase 3, flag
// "home" -- Beranda & Analitik satu fase §25): tab Overview BARU (KPI
// views/klik/CTR/pendapatan + tren + top konten + sumber trafik + perangkat
// -- panel Referral & Perangkat PINDAHAN dari Beranda §9.3), rentang
// kustom + Export CSV di toolbar (standarisasi RangeControl), pembanding
// periode ekuivalen sebelumnya (§16.5). Data tetap AnalyticsHandler yang
// sama; nol logika backend baru. Legacy utuh di cabang else.
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

function previousRange(fromISO: string, toISO: string): { from: string; to: string } {
  const from = new Date(fromISO + "T00:00:00Z");
  const to = new Date(toISO + "T00:00:00Z");
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const prevTo = new Date(from.getTime() - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (spanDays - 1) * 86_400_000);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function formatRupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function StatistikPage() {
  return dashRedesignEnabled("home") ? <RedesignedStatistikPage /> : <LegacyStatistikPage />;
}

function RedesignedStatistikPage() {
  const { t } = useLocale();
  const DEVICE_LABEL = buildDeviceLabel(t);
  const [tab, setTab] = useState<"overview" | "link-bio" | "toko">("overview");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<AnalyticsSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [rangeDays, setRangeDays] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustomRange, setUseCustomRange] = useState(false);

  function currentParams() {
    return useCustomRange && customFrom && customTo ? { from: customFrom, to: customTo } : { range_days: rangeDays };
  }

  // setLoading(true) TIDAK dipanggil di sini (reload dipanggil dari effect;
  // setState sinkron dalam effect dilarang react-hooks v7) -- loading di-set
  // di event handler (klik preset/Terapkan) & initial state.
  function reload() {
    Promise.all([getAnalyticsSummary(currentParams()), listRecentOrders()])
      .then(([s, orders]) => {
        setSummary(s);
        setRecentOrders(orders);
        getAnalyticsSummary(previousRange(s.from_date, s.to_date))
          .then(setPrevSummary)
          .catch(() => setPrevSummary(null));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.statistik.loadError")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays, useCustomRange]);

  function handleApplyCustomRange() {
    if (!customFrom || !customTo) {
      setError(t("dashboard.pages.home.errorFillDateRange"));
      return;
    }
    setError(null);
    setLoading(true);
    setUseCustomRange(true);
    reload();
  }

  async function handleExport() {
    setError(null);
    setExporting(true);
    try {
      await exportAnalyticsCSV(currentParams());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.home.errorExportCsv"));
    } finally {
      setExporting(false);
    }
  }

  const viewsPath = summary ? buildAreaPath(summary.daily_series.map((d) => d.views)) : { line: "", area: "" };
  const clicksPath = summary ? buildAreaPath(summary.daily_series.map((d) => d.clicks)) : { line: "", area: "" };
  const maxDevice = summary ? Math.max(1, ...summary.device_breakdown.map((d) => d.count)) : 1;
  const ctr = summary && summary.total_views > 0 ? (summary.total_clicks / summary.total_views) * 100 : 0;
  const prevCtr = prevSummary && prevSummary.total_views > 0 ? (prevSummary.total_clicks / prevSummary.total_views) * 100 : 0;

  const TABS = [
    { key: "overview" as const, label: t("dashboard.pages.statistik.tabOverview"), icon: IconChart },
    { key: "link-bio" as const, label: t("dashboard.pages.statistik.tabLinkBio"), icon: IconLink },
    { key: "toko" as const, label: t("dashboard.pages.statistik.tabShop"), icon: IconBox },
  ];

  const trendChart = summary && summary.daily_series.length > 0 && (
    <SectionCard title={t("dashboard.pages.statistik.trendHeading")}>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        role="img"
        aria-label={t("dashboard.pages.statistik.trendHeading")}
        className="h-40 w-full"
      >
        <defs>
          <linearGradient id="statViewsGradientV2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6043f5" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6043f5" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={viewsPath.area} fill="url(#statViewsGradientV2)" />
        <path d={viewsPath.line} fill="none" stroke="#6043f5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={clicksPath.line} fill="none" stroke="#d9ff5f" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-dash-muted">
        <span>{summary.daily_series[0]?.date}</span>
        <span>{summary.daily_series[summary.daily_series.length - 1]?.date}</span>
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-dash-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand-500" /> {t("dashboard.pages.statistik.legendViews")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand-lime" /> {t("dashboard.pages.statistik.legendClicks")}
        </span>
      </div>
    </SectionCard>
  );

  const topLinksCard = summary && (
    <SectionCard title={t("dashboard.pages.statistik.topLinksHeading")}>
      <ul className="flex flex-col gap-2">
        {summary.top_links.map((l) => (
          <li key={l.link_id} className="flex justify-between text-xs">
            <span className="truncate text-dash-ink">{l.title}</span>
            <span className="ml-2 flex-shrink-0 font-semibold text-brand-600">
              {l.clicks} {t("dashboard.pages.statistik.clicksSuffix")}
            </span>
          </li>
        ))}
        {summary.top_links.length === 0 && <EmptyRow text={t("dashboard.pages.statistik.emptyClicks")} />}
      </ul>
    </SectionCard>
  );

  const referrerCard = summary && summary.top_referrers.length > 0 && (
    <SectionCard title={t("dashboard.pages.home.topReferrersHeading")}>
      <ul className="flex flex-col gap-2">
        {summary.top_referrers.map((r) => (
          <li key={r.referrer} className="flex justify-between text-xs">
            <span className="truncate text-dash-ink">{r.referrer}</span>
            <span className="ml-2 flex-shrink-0 font-semibold text-brand-600">{r.count}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );

  const deviceCard = summary && summary.device_breakdown.length > 0 && (
    <SectionCard title={t("dashboard.pages.statistik.deviceHeading")}>
      <ul className="flex flex-col gap-2">
        {summary.device_breakdown.map((d) => (
          <li key={d.device_type} className="flex items-center gap-2 text-xs">
            <span className="w-20 flex-shrink-0 truncate text-dash-ink">{DEVICE_LABEL[d.device_type] ?? d.device_type}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-soft">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, (d.count / maxDevice) * 100)}%` }} />
            </div>
            <span className="w-8 flex-shrink-0 text-right font-semibold text-brand-600">{d.count}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("dashboard.nav.analytics")} description={t("dashboard.pages.statistik.intro")} />

      <RangeControl
        presets={PRESETS}
        rangeDays={rangeDays}
        useCustom={useCustomRange}
        customFrom={customFrom}
        customTo={customTo}
        onPreset={(d) => {
          setLoading(true);
          setUseCustomRange(false);
          setRangeDays(d);
        }}
        onCustomFrom={setCustomFrom}
        onCustomTo={setCustomTo}
        onApplyCustom={handleApplyCustomRange}
        onExport={handleExport}
        exporting={exporting}
        disabled={loading}
      />

      <div className="mt-4 flex gap-2 overflow-x-auto border-b border-dash-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              role="tab"
              aria-selected={tab === tb.key}
              className={`flex flex-shrink-0 items-center gap-1.5 border-b-[3px] px-3 py-2 text-sm font-semibold ${
                tab === tb.key ? "border-brand-500 text-brand-600" : "border-transparent text-dash-muted hover:text-dash-ink"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tb.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {loading || !summary ? (
        <div className="mt-4 flex flex-col gap-4">
          <KpiSkeleton count={4} />
          <ChartSkeleton />
        </div>
      ) : tab === "overview" ? (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              icon={<IconChart className="h-4 w-4" />}
              label={t("dashboard.pages.home.statLabelViews")}
              value={summary.total_views.toLocaleString("id-ID")}
              trend={prevSummary ? pctChange(summary.total_views, prevSummary.total_views) : null}
              comparison={t("dashboard.components.statCard.defaultSub")}
            />
            <KpiCard
              icon={<IconLink className="h-4 w-4" />}
              label={t("dashboard.pages.home.statLabelClicks")}
              value={summary.total_clicks.toLocaleString("id-ID")}
              trend={prevSummary ? pctChange(summary.total_clicks, prevSummary.total_clicks) : null}
              comparison={t("dashboard.components.statCard.defaultSub")}
            />
            <KpiCard
              semantic="info"
              icon={<IconChart className="h-4 w-4" />}
              label={t("dashboard.pages.home.statLabelCtr")}
              value={`${ctr.toFixed(1)}%`}
              trend={prevSummary ? pctChange(ctr, prevCtr) : null}
              comparison={t("dashboard.components.statCard.defaultSub")}
            />
            <KpiCard
              semantic="brand"
              icon={<IconWallet className="h-4 w-4" />}
              label={t("dashboard.pages.home.statLabelRevenue")}
              value={formatRupiah(summary.total_revenue_idr)}
              trend={prevSummary ? pctChange(summary.total_revenue_idr, prevSummary.total_revenue_idr) : null}
              comparison={t("dashboard.components.statCard.defaultSub")}
            />
          </section>
          <div className="mt-3">{trendChart}</div>
          <section className="mt-3 grid gap-3 sm:grid-cols-2">
            {topLinksCard}
            <SectionCard title={t("dashboard.pages.home.topProductsHeading")}>
              <ul className="flex flex-col gap-2">
                {summary.top_products.map((p) => (
                  <li key={p.product_id} className="flex justify-between text-xs">
                    <span className="truncate text-dash-ink">{p.name}</span>
                    <span className="ml-2 flex-shrink-0 font-semibold text-brand-600">
                      {p.sold_count} {t("dashboard.pages.home.soldSuffix")}
                    </span>
                  </li>
                ))}
                {summary.top_products.length === 0 && <EmptyRow text={t("dashboard.pages.home.emptyTopProducts")} />}
              </ul>
            </SectionCard>
          </section>
          <section className="mt-3 grid gap-3 sm:grid-cols-2">
            {referrerCard}
            {deviceCard}
          </section>
        </>
      ) : tab === "link-bio" ? (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3">
            <KpiCard
              icon={<IconChart className="h-4 w-4" />}
              label={t("dashboard.pages.statistik.pageViews")}
              value={summary.total_views.toLocaleString("id-ID")}
            />
            <KpiCard
              icon={<IconLink className="h-4 w-4" />}
              label={t("dashboard.pages.statistik.linkClicks")}
              value={summary.total_clicks.toLocaleString("id-ID")}
            />
          </section>
          <div className="mt-3">{trendChart}</div>
          <section className="mt-3 grid gap-3 sm:grid-cols-2">
            {topLinksCard}
            {referrerCard}
          </section>
          <section className="mt-3 grid gap-3 sm:grid-cols-2">{deviceCard}</section>
        </>
      ) : (
        <div className="mt-4">
          <ShopOverviewPanel summary={summary} recentOrders={recentOrders} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy (pra-redesign) -- dipertahankan utuh untuk jalur rollback flag.
// ---------------------------------------------------------------------------
function LegacyStatistikPage() {
  const { t } = useLocale();
  const DEVICE_LABEL = buildDeviceLabel(t);
  const [tab, setTab] = useState<"link-bio" | "toko">("link-bio");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays]);

  const viewsPath = summary ? buildAreaPath(summary.daily_series.map((d) => d.views)) : { line: "", area: "" };
  const clicksPath = summary ? buildAreaPath(summary.daily_series.map((d) => d.clicks)) : { line: "", area: "" };
  const maxDevice = summary ? Math.max(1, ...summary.device_breakdown.map((d) => d.count)) : 1;

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-app-muted">{t("dashboard.pages.statistik.intro")}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("link-bio")}
            className={`flex items-center gap-1.5 border-b-[3px] px-3 py-2 text-sm font-semibold ${
              tab === "link-bio" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
            }`}
          >
            <IconLink className="h-4 w-4" />
            {t("dashboard.pages.statistik.tabLinkBio")}
          </button>
          <button
            type="button"
            onClick={() => setTab("toko")}
            className={`flex items-center gap-1.5 border-b-[3px] px-3 py-2 text-sm font-semibold ${
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
                  ? "border-jeon-purple border-2 border-[#111111] bg-jeon-lavender text-[#111111]"
                  : "border-app-border text-app-muted hover:border-jeon-purple/50"
              }`}
            >
              {d} {t("dashboard.pages.statistik.days")}
            </button>
          ))}
        </div>
      </div>


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
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={t("dashboard.pages.statistik.trendHeading")} className="mt-4 h-40 w-full">
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
