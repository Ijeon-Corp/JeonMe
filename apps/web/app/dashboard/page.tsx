"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AnalyticsSummary,
  ApiError,
  RecentOrder,
  exportAnalyticsCSV,
  getAnalyticsSummary,
  getMyPage,
  listRecentOrders,
} from "@/lib/api-client";
import { SITE_URL } from "@/lib/site";
import {
  IconBox,
  IconChart,
  IconChevronRight,
  IconClose,
  IconExternal,
  IconInbox,
  IconLink,
  IconSparkle,
  IconWallet,
} from "@/components/icons";
import AnalyticsAssistant from "@/components/AnalyticsAssistant";
import { useLocale } from "@/lib/locale-context";
import PageHeader from "@/components/dashboard/page/PageHeader";
import SectionCard from "@/components/dashboard/page/SectionCard";
import KpiCard from "@/components/dashboard/data/KpiCard";
import RangeControl from "@/components/dashboard/data/RangeControl";
import StatusBadge from "@/components/dashboard/data/StatusBadge";
import { KpiSkeleton, ChartSkeleton } from "@/components/dashboard/feedback/Skeletons";

function formatRupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

// previousRange -- rentang SEBELUM `from` dengan panjang hari yang SAMA
// persis, dipakai badge tren kartu ringkasan (redesain Dashboard ala
// referensi admin template: "kunjungan naik/turun X% dibanding periode
// sebelumnya", bukan angka absolut tanpa konteks pembanding).
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


// buildAreaPath -- grafik area SVG polos (tanpa dependency chart baru,
// konsisten dengan mini-bar-chart genggam yang sudah ada sebelumnya di
// halaman ini). Skala titik ke viewBox 0..100 (lebar) & 0..40 (tinggi,
// dibalik supaya nilai besar di atas).
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

// Beranda -- Phase 3 redesign (JEONID-DASHBOARD-REDESIGN-SPEC.md §9).
// LENGKAP & stabil di production sejak v0.37.0/v0.38.0, flag "home"
// dihapus dari file ini 8 September 2026 (LegacyHomePage +
// QuickAccessCard ikut dihapus, sudah tidak dipakai lagi).

function EmptyRow({ text }: { text: string }) {
  return (
    <li className="flex items-center justify-center gap-2 py-2 text-center text-xs text-app-muted">
      <IconInbox className="h-3.5 w-3.5 flex-shrink-0" />
      {text}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Beranda v2 (spec §9) -- Overview template §7.1. Perubahan dari legacy
// (§9.3): 3 QuickAccessCard gradien DIHAPUS (aksi pindah ke PageHeader),
// rentang tanggal + export digabung satu toolbar (RangeControl), Analytics
// Assistant jadi kartu collapsible di BAWAH data utama, panel Referral &
// Perangkat pindah ke Analitik detail (§16.3), pendapatan mingguan diberi
// label eksplisit "selalu 7 hari terakhir". KPI: Views/Klik/CTR/Pendapatan
// (§9.2.4; Pesanan pindah ke Aktivitas Terbaru). SetupHealthBanner tidak
// diduplikasi -- OnboardingBanner global di layout sudah memenuhi §9.2.2.
// Data & mutasi = API existing (getMyPage/getAnalyticsSummary/
// exportAnalyticsCSV) + listRecentOrders (read yang sudah ada, dipakai
// statistik) -- nol kontrak baru.
// ---------------------------------------------------------------------------
const RECO_SNOOZE_KEY = "jeonme-home-reco-snooze";

export default function DashboardHomePage() {
  const { t, dict } = useLocale();
  const weekdayLabel = dict.dashboard.pages.home.weekdayLabels;
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<AnalyticsSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [rangeDays, setRangeDays] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustomRange, setUseCustomRange] = useState(false);

  const [creator, setCreator] = useState<{ name: string; username: string; published: boolean; avatarUrl: string } | null>(null);
  const [greetingKey, setGreetingKey] = useState("greetingFallback");
  const [shareCopied, setShareCopied] = useState(false);
  const [recoDismissed, setRecoDismissed] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    getMyPage()
      .then((p) =>
        setCreator({ name: p.display_name || p.username, username: p.username, published: p.is_published, avatarUrl: p.avatar_url })
      )
      .catch(() => {});
    // Aktivitas terbaru: soft-fail -- gagal muat = section disembunyikan,
    // bukan merusak seluruh Beranda (§9.4 "panel error lokal").
    listRecentOrders()
      .then(setRecentOrders)
      .catch(() => setRecentOrders(null));
    const h = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreetingKey(h < 11 ? "greetingMorning" : h < 15 ? "greetingAfternoon" : h < 19 ? "greetingEvening" : "greetingNight");
    // Snooze rekomendasi (§9.2.9 dismiss/snooze) -- per-hari via
    // localStorage; dibaca di effect (SSR-aman), gagal baca = tampil.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecoDismissed(localStorage.getItem(RECO_SNOOZE_KEY) === new Date().toISOString().slice(0, 10));
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecoDismissed(false);
    }
  }, []);

  function handleShareCopy() {
    if (!creator) return;
    navigator.clipboard.writeText(`${SITE_URL}/${creator.username}`).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    });
  }

  function handleRecoDismiss() {
    setRecoDismissed(true);
    try {
      localStorage.setItem(RECO_SNOOZE_KEY, new Date().toISOString().slice(0, 10));
    } catch {
      // kenyamanan tambahan; gagal simpan diamkan.
    }
  }

  function currentParams() {
    return useCustomRange && customFrom && customTo ? { from: customFrom, to: customTo } : { range_days: rangeDays };
  }

  function reload() {
    getAnalyticsSummary(currentParams())
      .then((s) => {
        setSummary(s);
        const prevWindow = previousRange(s.from_date, s.to_date);
        getAnalyticsSummary(prevWindow)
          .then(setPrevSummary)
          .catch(() => setPrevSummary(null));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.home.errorLoadSummary")))
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
  const revenuePath = summary ? buildAreaPath(summary.weekly_revenue.map((d) => d.revenue_idr)) : { line: "", area: "" };
  const weeklyMaxV2 = summary ? Math.max(1, ...summary.weekly_revenue.map((d) => d.revenue_idr)) : 1;

  const ctr = summary && summary.total_views > 0 ? (summary.total_clicks / summary.total_views) * 100 : 0;
  const prevCtr = prevSummary && prevSummary.total_views > 0 ? (prevSummary.total_clicks / prevSummary.total_views) * 100 : 0;

  // Rekomendasi kontekstual tunggal (§9.2.9/§9.4): tanpa trafik -> bagikan;
  // ada trafik tanpa penjualan -> buat produk; selain itu -> lihat analitik.
  const reco =
    summary === null
      ? null
      : summary.total_views === 0
        ? { title: t("dashboard.pages.home.recoShareTitle"), desc: t("dashboard.pages.home.recoShareDesc"), cta: t("dashboard.pages.home.recoShareCta"), onClick: handleShareCopy, href: undefined as string | undefined }
        : summary.total_orders === 0
          ? { title: t("dashboard.pages.home.recoProductTitle"), desc: t("dashboard.pages.home.recoProductDesc"), cta: t("dashboard.pages.home.recoProductCta"), onClick: undefined, href: "/dashboard/products?tab=items" }
          : { title: t("dashboard.pages.home.recoAnalyticsTitle"), desc: t("dashboard.pages.home.recoAnalyticsDesc"), cta: t("dashboard.pages.home.recoAnalyticsCta"), onClick: undefined, href: "/dashboard/statistik" };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${t(`dashboard.pages.home.${greetingKey}`)}${creator ? `, ${creator.name}` : ""} 👋`}
        description={t("dashboard.pages.home.headerDesc")}
        status={
          creator ? (
            <StatusBadge
              status={creator.published ? "live" : "draft"}
              label={creator.published ? t("dashboard.statusLive") : t("dashboard.statusDraft")}
            />
          ) : undefined
        }
        primaryAction={{ label: t("dashboard.pages.home.ctaAddBlock"), href: "/dashboard/links", icon: <IconLink className="h-4 w-4" /> }}
        secondaryActions={[
          { label: t("dashboard.pages.home.ctaCreateProduct"), href: "/dashboard/products?tab=items", icon: <IconBox className="h-4 w-4" /> },
        ]}
      />

      <RangeControl
        rangeDays={rangeDays}
        useCustom={useCustomRange}
        customFrom={customFrom}
        customTo={customTo}
        onPreset={(d) => {
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

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {loading && (
        <div className="mt-4 flex flex-col gap-4">
          <KpiSkeleton count={4} />
          <ChartSkeleton />
        </div>
      )}

      {/* §9.4: kegagalan analytics = error LOKAL -- section analitik (KPI/
          tren/top konten/reko) digerbang `summary`, sisanya (kartu halaman,
          aktivitas, assistant) tetap tampil di bawah. */}
      {!loading && summary && (
          <>
            {/* KPI §9.2.4: Views / Klik / CTR / Pendapatan (brand tunggal). */}
            <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                icon={<IconChart className="h-4 w-4" />}
                label={t("dashboard.pages.home.statLabelViews")}
                value={summary.total_views.toLocaleString("id-ID")}
                trend={prevSummary ? pctChange(summary.total_views, prevSummary.total_views) : null}
                comparison={t("dashboard.components.statCard.defaultSub")}
                sparkline={viewsPath}
              />
              <KpiCard
                icon={<IconLink className="h-4 w-4" />}
                label={t("dashboard.pages.home.statLabelClicks")}
                value={summary.total_clicks.toLocaleString("id-ID")}
                trend={prevSummary ? pctChange(summary.total_clicks, prevSummary.total_clicks) : null}
                comparison={t("dashboard.components.statCard.defaultSub")}
                sparkline={clicksPath}
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
                sparkline={revenuePath}
              />
            </section>

            {/* Rekomendasi tunggal §9.2.9 -- DIPINDAH ke atas, tepat setelah
                angka KPI (permintaan pengguna 3 September 2026, temuan
                audit: "Beranda menumpuk 4 kotak Belum ada data" untuk akun
                baru). SEBELUMNYA render di paling bawah, setelah Tautan
                Terpopuler/Produk Terlaris/Aktivitas Terbaru yang bertiga
                kosong berturut-turut untuk akun tanpa trafik -- satu-
                satunya arahan jelas ("Bagikan halamanmu") baru terlihat
                setelah menggulir lewat tiga kotak "belum ada apa-apa".
                Sekarang urutannya: angka -> SATU langkah berikutnya yang
                jelas -> baru detail pendukung (grafik/daftar, yang boleh
                tetap kosong -- sudah dijelaskan konteksnya lewat kartu ini). */}
            {reco && !recoDismissed && (
              <section className="mt-4">
                <SectionCard
                  variant="highlighted"
                  icon={<IconSparkle className="h-4 w-4" />}
                  title={reco.title}
                  description={reco.desc}
                  action={
                    <button
                      type="button"
                      onClick={handleRecoDismiss}
                      aria-label={t("dashboard.pages.home.recoDismiss")}
                      title={t("dashboard.pages.home.recoDismiss")}
                      className="rounded-lg p-1.5 text-dash-muted hover:bg-dash-surface hover:text-dash-ink"
                    >
                      <IconClose className="h-4 w-4" />
                    </button>
                  }
                >
                  {reco.href ? (
                    <Link href={reco.href} className="btn-primary inline-block rounded-xl px-4 py-2 text-xs font-bold text-white">
                      {reco.cta}
                    </Link>
                  ) : (
                    <button type="button" onClick={reco.onClick} className="btn-primary rounded-xl px-4 py-2 text-xs font-bold text-white">
                      {shareCopied ? t("dashboard.linkCopied") : reco.cta}
                    </button>
                  )}
                </SectionCard>
              </section>
            )}

            {/* Performance panel §9.2.5 + pendapatan mingguan berlabel jelas. */}
            <section className="mt-4 grid gap-3 lg:grid-cols-[1fr_320px]">
              <SectionCard title={t("dashboard.pages.home.chartTrendHeading")}>
                {summary.daily_series.length > 0 && summary.total_views + summary.total_clicks > 0 ? (
                  <>
                    <svg
                      viewBox="0 0 100 40"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={t("dashboard.pages.home.chartTrendHeading")}
                      className="h-40 w-full"
                    >
                      <defs>
                        <linearGradient id="viewsGradientV2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6043f5" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#6043f5" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <path d={viewsPath.area} fill="url(#viewsGradientV2)" />
                      <path d={viewsPath.line} fill="none" stroke="#6043f5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                      <path d={clicksPath.line} fill="none" stroke="#d9ff5f" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                    </svg>
                    <div className="mt-2 flex justify-between text-[10px] text-dash-muted">
                      <span>{summary.daily_series[0]?.date}</span>
                      <span>{summary.daily_series[summary.daily_series.length - 1]?.date}</span>
                    </div>
                    <div className="mt-3 flex gap-4 text-[11px] text-dash-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-brand-500" /> {t("dashboard.pages.home.statLabelViews")}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-brand-lime" /> {t("dashboard.pages.home.legendClicks")}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                    <IconSparkle className="h-5 w-5 text-warning" />
                    <p className="max-w-xs text-xs text-dash-muted">{t("dashboard.pages.home.emptyViewsMessage")}</p>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title={t("dashboard.pages.home.weeklyRevenueHeading")}
                description={t("dashboard.pages.home.weeklyRevenueNote")}
              >
                <p className="font-display text-xl font-bold tabular-nums text-dash-ink">{formatRupiah(summary.weekly_revenue_total_idr)}</p>
                <div className="mt-4 flex items-end gap-1.5" style={{ height: 100 }}>
                  {summary.weekly_revenue.map((d) => (
                    <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${formatRupiah(d.revenue_idr)}`}>
                      <div
                        className="w-full rounded-t bg-brand-500 transition-all"
                        style={{ height: `${Math.max(4, (d.revenue_idr / weeklyMaxV2) * 80)}px` }}
                      />
                      <span className="text-[10px] text-dash-muted">{weekdayLabel[new Date(d.date + "T00:00:00Z").getUTCDay()]}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </section>
          </>
      )}

      {/* Live page summary §9.2.6 -- kartu ringkas (avatar + status +
          CTA edit/buka), bukan thumbnail PagePreview penuh (berat; §29).
          TIDAK bergantung summary -- tetap tampil saat analytics gagal. */}
      {!loading && (
          <>
            {creator && (
              <section className="mt-4">
                <SectionCard
                  variant="subtle"
                  title={t("dashboard.pages.home.livePageHeading")}
                  action={
                    <div className="flex items-center gap-2">
                      <a
                        href={`${SITE_URL}/${creator.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-xl border-2 border-jeon-ink bg-app-surface px-3 py-1.5 text-xs font-bold text-app-ink hover:border-brand-500 hover:text-brand-600"
                      >
                        <IconExternal className="h-3.5 w-3.5" /> {t("dashboard.pages.home.openPageCta")}
                      </a>
                      <Link
                        href="/dashboard/links"
                        className="btn-primary rounded-xl px-3 py-1.5 text-xs font-bold text-white"
                      >
                        {t("dashboard.pages.home.editPageCta")}
                      </Link>
                    </div>
                  }
                >
                  <div className="flex items-center gap-3">
                    {creator.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={creator.avatarUrl} alt={creator.name} className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-lavender font-display text-sm font-bold text-[#111111]">
                        {creator.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-dash-ink">{creator.name}</p>
                      <p className="flex items-center gap-2 text-xs text-dash-muted">
                        jeon.id/{creator.username}
                        <StatusBadge
                          status={creator.published ? "live" : "draft"}
                          label={creator.published ? t("dashboard.statusLive") : t("dashboard.statusDraft")}
                        />
                      </p>
                    </div>
                  </div>
                </SectionCard>
              </section>
            )}

            {/* Top content §9.2.7 (butuh summary) */}
            {summary && (
            <section className="mt-4 grid gap-3 sm:grid-cols-2">
              <SectionCard title={t("dashboard.pages.home.topLinksHeading")}>
                <ul className="flex flex-col gap-2">
                  {summary.top_links.map((l) => (
                    <li key={l.link_id} className="flex justify-between text-xs">
                      <span className="truncate text-dash-ink">{l.title}</span>
                      <span className="ml-2 flex-shrink-0 font-semibold text-brand-600">{l.clicks}</span>
                    </li>
                  ))}
                  {summary.top_links.length === 0 && <EmptyRow text={t("dashboard.pages.home.emptyTopLinks")} />}
                </ul>
              </SectionCard>
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
            )}

            {/* Aktivitas terbaru §9.2.8 -- dari listRecentOrders (feed
                aktivitas lain belum ada API-nya; tidak dikarang). Gagal
                muat -> section tidak tampil (error lokal). */}
            {recentOrders !== null && (
              <section className="mt-4">
                <SectionCard title={t("dashboard.pages.home.recentActivityHeading")}>
                  <ul className="flex flex-col gap-1.5">
                    {recentOrders.slice(0, 5).map((o) => (
                      <li key={o.order_id} className="flex items-center justify-between gap-2 rounded-xl border border-dash-border px-3 py-2 text-xs">
                        <span className="min-w-0 truncate text-dash-ink">{o.product_name}</span>
                        <span className="flex flex-shrink-0 items-center gap-2">
                          <span className="font-semibold tabular-nums text-dash-ink">{formatRupiah(o.amount_idr)}</span>
                          <StatusBadge
                            status={o.status}
                            label={t(`dashboard.components.transactionPanel.statusLabels.${o.status}`)}
                          />
                        </span>
                      </li>
                    ))}
                    {recentOrders.length === 0 && <EmptyRow text={t("dashboard.pages.home.recentActivityEmpty")} />}
                  </ul>
                </SectionCard>
              </section>
            )}

            <section className="mt-4">
              <SectionCard variant="subtle">
                <button
                  type="button"
                  onClick={() => setAssistantOpen((v) => !v)}
                  aria-expanded={assistantOpen}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-bold text-dash-ink">
                    <IconSparkle className="h-4 w-4 text-brand-600" />
                    {t("dashboard.pages.home.assistantToggle")}
                  </span>
                  <IconChevronRight className={`h-4 w-4 text-dash-muted transition-transform ${assistantOpen ? "rotate-90" : ""}`} />
                </button>
                {assistantOpen && (
                  <div className="mt-3">
                    <AnalyticsAssistant />
                  </div>
                )}
              </SectionCard>
            </section>
          </>
      )}
    </div>
  );
}
