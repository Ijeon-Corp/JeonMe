"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnalyticsSummary, ApiError, exportAnalyticsCSV, getAnalyticsSummary } from "@/lib/api-client";
import {
  IconBox,
  IconChart,
  IconChevronRight,
  IconDownload,
  IconInbox,
  IconLink,
  IconSparkle,
  IconTrendArrow,
  IconWallet,
} from "@/components/icons";
import AnalyticsAssistant from "@/components/AnalyticsAssistant";

const PRESETS = [7, 30, 90];

const DEVICE_LABEL: Record<string, string> = {
  mobile: "Mobile",
  desktop: "Desktop",
  tablet: "Tablet",
  unknown: "Tidak diketahui",
};

const WEEKDAY_LABEL = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

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

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const positive = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        positive ? "bg-secondary-subtle text-secondary-dark" : "bg-red-50 text-red-600"
      }`}
    >
      <IconTrendArrow className={`h-3 w-3 flex-shrink-0 ${positive ? "" : "rotate-180"}`} />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
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

export default function DashboardHomePage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<AnalyticsSummary | null>(null);
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
    getAnalyticsSummary(currentParams())
      .then((s) => {
        setSummary(s);
        const prevWindow = previousRange(s.from_date, s.to_date);
        getAnalyticsSummary(prevWindow)
          .then(setPrevSummary)
          .catch(() => setPrevSummary(null));
      })
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

  const maxDevice = summary
    ? Math.max(1, ...summary.device_breakdown.map((d) => d.count))
    : 1;

  const viewsPath = summary ? buildAreaPath(summary.daily_series.map((d) => d.views)) : { line: "", area: "" };
  const clicksPath = summary ? buildAreaPath(summary.daily_series.map((d) => d.clicks)) : { line: "", area: "" };
  // revenuePath -- sparkline mini di kartu "Penjualan" (redesain Card-Based
  // Layout) memakai deret 7 hari yang SAMA dengan widget "Pendapatan 7 Hari
  // Terakhir" di bawah (bukan deret baru) -- data yang sudah ada, jujur
  // apa adanya, bukan dipaksa mengikuti rentang tanggal pilihan pengguna
  // di atas (lihat catatan lingkup weekly_revenue di AnalyticsHandler).
  const revenuePath = summary ? buildAreaPath(summary.weekly_revenue.map((d) => d.revenue_idr)) : { line: "", area: "" };

  const weeklyMax = summary ? Math.max(1, ...summary.weekly_revenue.map((d) => d.revenue_idr)) : 1;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted">
          Statistik {summary?.from_date ?? ""} sampai {summary?.to_date ?? ""}.
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || loading}
          className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-2 text-xs font-bold text-ink shadow-card hover:border-primary hover:text-primary disabled:opacity-60"
        >
          <IconDownload className="h-3.5 w-3.5" />
          {exporting ? "Mengekspor..." : "Ekspor CSV"}
        </button>
      </div>

      {/* Menu Cepat -- redesain "Card-Based Layout" (permintaan langsung
          pengguna, referensi tangkapan layar dashboard SQUARE): pintasan
          bento ke 3 area yang paling sering dibuka dari Ringkasan, supaya
          kreator tidak harus balik ke sidebar dulu. Gradien warna beda per
          kartu (primary/accent/secondary) murni dekoratif -- TIDAK menarik
          gambar/tema sungguhan milik kreator (itu tugas panel Pratinjau
          Langsung di halaman masing-masing, di sini cukup penanda visual). */}
      <section className="mt-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted">Menu Cepat</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <QuickAccessCard
            href="/dashboard/links"
            icon={<IconLink className="h-5 w-5" />}
            title="Link Bio"
            description="Kelola tautan & tampilan halaman bio-mu"
            gradient="linear-gradient(135deg, #123328 0%, #1B4D3E 55%, #3E7C59 100%)"
          />
          <QuickAccessCard
            href="/dashboard/products"
            icon={<IconBox className="h-5 w-5" />}
            title="Toko"
            description="Kelola produk & Halaman Toko-mu"
            gradient="linear-gradient(135deg, #A9822F 0%, #C9A24B 55%, #E0C378 100%)"
          />
          <QuickAccessCard
            href="/dashboard/design"
            icon={<IconSparkle className="h-5 w-5" />}
            title="Desain"
            description="Tema, header, tombol, font & stiker"
            gradient="linear-gradient(135deg, #145C52 0%, #1F7A6C 55%, #5FB3A3 100%)"
          />
        </div>
      </section>

      <div className="glass mt-4 flex flex-wrap items-center gap-2 rounded-2xl p-2.5 shadow-card">
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
        {/* Bug ditemukan (5 Agustus 2026, audit responsif): 2 input
            type="date" (lebar render minimum browser tidak bisa menyusut
            banyak) + span "s/d" + tombol Terapkan di SATU baris tanpa
            flex-wrap sendiri -- di layar sempit totalnya melebihi lebar
            layar walau parent-nya sendiri sudah flex-wrap (wrapper ini
            IKUT terhitung sebagai satu item utuh yang tidak pernah pecah
            baris di dalam dirinya sendiri). */}
        <div className="flex flex-wrap items-center gap-1.5">
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
            {/* Kartu ringkasan ala referensi admin template (redesain
                Dashboard, permintaan langsung pengguna) -- 4 kartu dengan
                badge tren dibanding periode SEBELUMNYA (panjang hari sama).
                "Total Users" di referensi diganti "Klik Tautan" -- Jeonme
                tidak melacak pengunjung unik per visitor/session, cuma
                total tayangan, jadi kartu itu jujur dari data yang benar-
                benar ada, bukan tiruan kosong. Mini-sparkline (redesain
                Card-Based Layout, referensi SQUARE) HANYA ditambahkan kalau
                deret harian sungguhan tersedia -- "Pesanan" TIDAK dikasih
                sparkline karena backend belum menghitung deret harian per
                pesanan, jujur apa adanya daripada memalsukan data. */}
            <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                icon={<IconChart className="h-4 w-4 text-primary" />}
                label="Kunjungan"
                value={summary.total_views.toLocaleString("id-ID")}
                pct={prevSummary ? pctChange(summary.total_views, prevSummary.total_views) : null}
                sparkline={viewsPath}
                accentHex="#1B4D3E"
              />
              <StatCard
                icon={<IconLink className="h-4 w-4 text-accent-dark" />}
                label="Klik Tautan"
                value={summary.total_clicks.toLocaleString("id-ID")}
                pct={prevSummary ? pctChange(summary.total_clicks, prevSummary.total_clicks) : null}
                sparkline={clicksPath}
                accentHex="#C9A24B"
              />
              <StatCard
                icon={<IconBox className="h-4 w-4 text-secondary-dark" />}
                label="Pesanan"
                value={summary.total_orders.toLocaleString("id-ID")}
                pct={prevSummary ? pctChange(summary.total_orders, prevSummary.total_orders) : null}
              />
              <StatCard
                icon={<IconWallet className="h-4 w-4 text-primary" />}
                label="Penjualan"
                value={formatRupiah(summary.total_revenue_idr)}
                pct={prevSummary ? pctChange(summary.total_revenue_idr, prevSummary.total_revenue_idr) : null}
                sparkline={revenuePath}
                accentHex="#1F7A6C"
              />
            </section>

            <section className="mt-4 grid gap-3 lg:grid-cols-[1fr_320px]">
              {summary.daily_series.length > 0 && (
                <div className="glass rounded-3xl p-4 shadow-card">
                  <h2 className="font-heading text-sm font-bold text-ink">Tren Kunjungan &amp; Klik</h2>
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-4 h-40 w-full">
                    <defs>
                      <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1B4D3E" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#1B4D3E" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    <path d={viewsPath.area} fill="url(#viewsGradient)" />
                    <path d={viewsPath.line} fill="none" stroke="#1B4D3E" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    <path d={clicksPath.line} fill="none" stroke="#C9A24B" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="mt-2 flex justify-between text-[10px] text-muted">
                    <span>{summary.daily_series[0]?.date}</span>
                    <span>{summary.daily_series[summary.daily_series.length - 1]?.date}</span>
                  </div>
                  <div className="mt-3 flex gap-4 text-[11px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary" /> Kunjungan
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-accent" /> Klik
                    </span>
                  </div>
                </div>
              )}

              {/* Ringkasan Pendapatan Minggu Ini -- widget MANDIRI, selalu 7
                  hari terakhir (lihat catatan lingkup di backend
                  AnalyticsHandler.computeWeeklyRevenue), independen dari
                  filter rentang tanggal di atas. */}
              <div className="glass rounded-3xl p-4 shadow-card">
                <h2 className="font-heading text-sm font-bold text-ink">Pendapatan 7 Hari Terakhir</h2>
                <p className="mt-2 font-heading text-xl font-bold text-ink">{formatRupiah(summary.weekly_revenue_total_idr)}</p>
                <div className="mt-4 flex items-end gap-1.5" style={{ height: 100 }}>
                  {summary.weekly_revenue.map((d) => (
                    <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${formatRupiah(d.revenue_idr)}`}>
                      <div
                        className="w-full rounded-t bg-secondary transition-all"
                        style={{ height: `${Math.max(4, (d.revenue_idr / weeklyMax) * 80)}px` }}
                      />
                      <span className="text-[10px] text-muted">{WEEKDAY_LABEL[new Date(d.date + "T00:00:00Z").getUTCDay()]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="glass rounded-3xl p-4 shadow-card">
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

              <div className="glass rounded-3xl p-4 shadow-card">
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
                <div className="glass rounded-3xl p-4 shadow-card">
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
                <div className="glass rounded-3xl p-4 shadow-card">
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
              <section className="mt-4 flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-white/60 p-5 text-center">
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

function StatCard({
  icon,
  label,
  value,
  pct,
  sparkline,
  accentHex = "#1B4D3E",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  pct: number | null;
  // sparkline/accentHex -- redesain Card-Based Layout (referensi SQUARE):
  // mini grafik area di dasar kartu, pakai path yang SAMA (buildAreaPath)
  // dengan grafik besar "Tren Kunjungan & Klik" -- opsional, kartu tanpa
  // deret harian (mis. Pesanan) tetap tampil rapi tanpa grafik kosong.
  sparkline?: { line: string; area: string };
  accentHex?: string;
}) {
  return (
    <div className="glass rounded-3xl p-4 shadow-card">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="font-heading text-xl font-bold text-ink">{value}</p>
        <TrendBadge pct={pct} />
      </div>
      <p className="mt-1 text-[11px] text-muted">dibanding periode sebelumnya</p>
      {sparkline && sparkline.line && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-10 w-full">
          <path d={sparkline.area} fill={accentHex} fillOpacity="0.14" />
          <path d={sparkline.line} fill="none" stroke={accentHex} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}

// QuickAccessCard -- redesain "Card-Based Layout" (permintaan langsung
// pengguna, referensi tangkapan layar dashboard SQUARE): kartu gradien
// besar dengan ikon+judul+deskripsi+panah, dipakai baris "Menu Cepat" di
// atas halaman ini. Gradien dioper sebagai inline style (bukan kelas
// Tailwind) supaya tiap kartu bisa punya kombinasi warna brand sendiri
// tanpa menambah utility class baru ke tailwind.config.ts.
function QuickAccessCard({
  href,
  icon,
  title,
  description,
  gradient,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}) {
  return (
    <Link
      href={href}
      style={{ background: gradient }}
      className="group relative overflow-hidden rounded-3xl p-5 text-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">{icon}</span>
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/15 transition-transform group-hover:translate-x-0.5">
          <IconChevronRight className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-6 font-heading text-lg font-bold">{title}</p>
      <p className="mt-1 text-xs text-white/80">{description}</p>
    </Link>
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
