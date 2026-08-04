"use client";

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

// Modul Statistik (permintaan langsung pengguna: "menu statistik yang
// berisi data jumlah klik dll pada link bio dan produk toko di halaman
// saya... pisahkan dengan tab nama link bio dan toko"). Data SAMA persis
// dengan yang sudah dihitung AnalyticsHandler untuk Ringkasan (/dashboard)
// -- halaman ini TIDAK menduplikasi logika backend, cuma menyusun ulang
// metrik yang sama jadi 2 tab terpisah supaya kreator bisa fokus ke satu
// sisi (Link Bio ATAU Toko) tanpa harus menyisir satu halaman panjang yang
// mencampur keduanya.
const PRESETS = [7, 30, 90];

const DEVICE_LABEL: Record<string, string> = {
  mobile: "Mobile",
  desktop: "Desktop",
  tablet: "Tablet",
  unknown: "Tidak diketahui",
};

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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat statistik."))
      .finally(() => setLoading(false));
  }, [rangeDays]);

  const viewsPath = summary ? buildAreaPath(summary.daily_series.map((d) => d.views)) : { line: "", area: "" };
  const clicksPath = summary ? buildAreaPath(summary.daily_series.map((d) => d.clicks)) : { line: "", area: "" };
  const maxDevice = summary ? Math.max(1, ...summary.device_breakdown.map((d) => d.count)) : 1;

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-muted">Jumlah klik tautan dan performa penjualan produkmu.</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("link-bio")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "link-bio" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <IconLink className="h-4 w-4" />
            Link Bio
          </button>
          <button
            type="button"
            onClick={() => setTab("toko")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "toko" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <IconBox className="h-4 w-4" />
            Toko
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
                  ? "border-primary bg-primary-subtle text-primary"
                  : "border-border text-muted hover:border-primary/50"
              }`}
            >
              {d} hari
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading || !summary ? (
        <p className="mt-6 text-sm text-muted">Memuat...</p>
      ) : tab === "link-bio" ? (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3">
            <StatCard icon={<IconChart className="h-4 w-4 text-primary" />} label="Kunjungan Halaman" value={summary.total_views.toLocaleString("id-ID")} />
            <StatCard icon={<IconLink className="h-4 w-4 text-accent-dark" />} label="Klik Tautan" value={summary.total_clicks.toLocaleString("id-ID")} />
          </section>

          {summary.daily_series.length > 0 && (
            <div className="mt-3 rounded-2xl border border-border bg-white p-4 shadow-card">
              <h2 className="font-heading text-sm font-bold text-ink">Tren Kunjungan &amp; Klik</h2>
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-4 h-40 w-full">
                <defs>
                  <linearGradient id="statViewsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1B4D3E" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#1B4D3E" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={viewsPath.area} fill="url(#statViewsGradient)" />
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

          <section className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
              <h2 className="font-heading text-sm font-bold text-ink">Tautan Terpopuler</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {summary.top_links.map((l) => (
                  <li key={l.link_id} className="flex justify-between text-xs">
                    <span className="truncate text-ink">{l.title}</span>
                    <span className="ml-2 flex-shrink-0 font-semibold text-primary">{l.clicks} klik</span>
                  </li>
                ))}
                {summary.top_links.length === 0 && <EmptyRow text="Belum ada data klik." />}
              </ul>
            </div>

            {summary.device_breakdown.length > 0 && (
              <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
                <h2 className="font-heading text-sm font-bold text-ink">Perangkat Pengunjung</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {summary.device_breakdown.map((d) => (
                    <li key={d.device_type} className="flex items-center gap-2 text-xs">
                      <span className="w-20 flex-shrink-0 truncate text-ink">{DEVICE_LABEL[d.device_type] ?? d.device_type}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary-subtle/50">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (d.count / maxDevice) * 100)}%` }} />
                      </div>
                      <span className="w-8 flex-shrink-0 text-right font-semibold text-primary">{d.count}</span>
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        {icon}
        {label}
      </div>
      <p className="mt-2 font-heading text-xl font-bold text-ink">{value}</p>
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
