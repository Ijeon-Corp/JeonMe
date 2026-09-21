"use client";

import { useEffect, useState } from "react";
import { ApiError, TrafficSourcesResponse, getAdminTrafficSources } from "@/lib/api-client";
import { useErrorToast } from "@/lib/use-error-toast";

// buildAreaPath -- salinan dari dashboard/page.tsx (kanonis) &
// dashboard/statistik/page.tsx: grafik di repo ini SVG hand-drawn tanpa
// dependency chart (lihat catatan di sana). viewBox 100x40, y dibalik.
// Beda satu-satunya: parameter `max` opsional supaya dua deret (total vs
// bertag UTM) bisa digambar pada SATU skala yang sama.
function buildAreaPath(values: number[], max = Math.max(1, ...values)): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
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

// Panel Admin: Sumber Trafik -- permintaan langsung pengguna, 15 September
// 2026 ("untuk sumber trafic misal seperti dari facebook ig dan lain lain
// apakah itu sudah bisa tercatat atau di tracking untuk admin"). Platform-
// wide (lintas SEMUA kreator) -- lihat catatan lengkap di
// AdminHandler.ListTrafficSources (admin.go) & migrasi 000101 utk kenapa
// data ini sebelumnya tidak pernah tersimpan sama sekali.
export default function AdminTrafficSourcesPage() {
  const [rangeDays, setRangeDays] = useState(30);
  const [data, setData] = useState<TrafficSourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // reload -- setLoading(true) SENGAJA TIDAK dipanggil di sini (aturan
  // react-hooks/set-state-in-effect, CLAUDE.md: setState sinkron dalam
  // effect dilarang) -- pola sama persis dashboard/statistik/page.tsx:
  // `loading` cuma di-set true dari initial state ATAU event handler
  // (onChange dropdown rentang di bawah), bukan otomatis tiap effect jalan.
  function reload() {
    getAdminTrafficSources({ rangeDays })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat sumber trafik."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays]);

  function handleLoadMore() {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    // Respons offset>0 TIDAK membawa daily_series/by_source (kosong), jadi
    // yang diambil dari respons baru cuma sources & has_more -- sisanya
    // (total, grafik) tetap dari respons pertama.
    getAdminTrafficSources({ rangeDays, offset: data.sources.length })
      .then((r) => setData((prev) => (prev ? { ...prev, sources: [...prev.sources, ...r.sources], has_more: r.has_more } : r)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data tambahan."))
      .finally(() => setLoadingMore(false));
  }

  const withUtmPercent = data && data.total_views > 0 ? Math.round((data.views_with_utm / data.total_views) * 100) : 0;

  // Kedua garis dinormalisasi ke SATU skala (max dari total views) supaya
  // garis "bertag UTM" benar-benar terbaca sebagai porsi dari total, bukan
  // dua grafik yang kebetulan ditumpuk dengan skala masing-masing.
  const dailySeries = data?.daily_series ?? [];
  const seriesMax = Math.max(1, ...dailySeries.map((d) => d.views));
  const viewsPath = buildAreaPath(dailySeries.map((d) => d.views), seriesMax);
  const utmPath = buildAreaPath(dailySeries.map((d) => d.views_with_utm), seriesMax);
  const bySource = data?.by_source ?? [];
  const maxSourceViews = Math.max(1, ...bySource.map((s) => s.views));

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-app-ink">Sumber Trafik</h1>
        <select
          value={rangeDays}
          onChange={(e) => {
            setLoading(true);
            setRangeDays(Number(e.target.value));
          }}
          className="rounded-lg border-2 border-jeon-ink bg-app-surface px-3 py-1.5 text-sm font-semibold text-app-ink"
        >
          <option value={7}>7 hari terakhir</option>
          <option value={30}>30 hari terakhir</option>
          <option value={90}>90 hari terakhir</option>
        </select>
      </div>
      {/* break-words -- bug UI/UX ditemukan 21 September 2026 (audit
          menyeluruh): overflow horizontal terkonfirmasi di mobile 390px,
          contoh query string di <code> kedua tidak punya titik potong
          alami & sebelumnya tanpa wrapping sama sekali. */}
      <p className="mt-1 break-words text-xs text-app-muted">
        Breakdown platform-wide dari parameter <code>utm_source</code>/<code>utm_medium</code>/<code>utm_campaign</code> di URL
        pengunjung (mis. <code className="break-all">?utm_source=facebook&amp;utm_medium=social&amp;utm_campaign=promo_course</code>) -- lintas semua
        halaman kreator, bukan cuma satu akun.
      </p>

      {loading && <p className="mt-6 text-sm text-app-muted">Memuat...</p>}

      {!loading && data && (
        <>
          <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-jmd border border-jeon-purple/10 bg-app-surface p-4 shadow-refined">
              <p className="text-xs font-semibold text-app-muted">Total Kunjungan</p>
              <p className="mt-1 font-serifDisplay text-2xl font-semibold text-app-ink">{data.total_views.toLocaleString("id-ID")}</p>
            </div>
            <div className="rounded-jmd border border-jeon-purple/10 bg-app-surface p-4 shadow-refined">
              <p className="text-xs font-semibold text-app-muted">Bawa Tag UTM</p>
              <p className="mt-1 font-serifDisplay text-2xl font-semibold text-jeon-purple">{data.views_with_utm.toLocaleString("id-ID")}</p>
            </div>
            <div className="rounded-jmd border border-jeon-purple/10 bg-app-surface p-4 shadow-refined">
              <p className="text-xs font-semibold text-app-muted">Persentase Bertag</p>
              <p className="mt-1 font-serifDisplay text-2xl font-semibold text-app-ink">{withUtmPercent}%</p>
            </div>
          </section>

          {/* Grafik -- permintaan langsung pengguna, 18 September 2026
              ("buatkan bentuk grafik di page sumber trafik admin"): tren
              per hari (total vs bertag UTM, satu skala) + bar per source.
              SVG hand-drawn, konvensi sama dengan Ringkasan/Statistik
              kreator (tanpa dependency chart). */}
          <section className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
            <div className="rounded-jmd border border-jeon-purple/10 bg-app-surface p-4 shadow-refined lg:col-span-3">
              <p className="text-xs font-semibold text-app-muted">Tren Kunjungan per Hari</p>
              {dailySeries.length > 0 ? (
                <>
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Tren kunjungan per hari" className="mt-3 h-40 w-full">
                    <defs>
                      <linearGradient id="adminTrafficViewsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6043f5" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#6043f5" stopOpacity="0.02" />
                      </linearGradient>
                      <linearGradient id="adminTrafficUtmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d9ff5f" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="#d9ff5f" stopOpacity="0.05" />
                      </linearGradient>
                    </defs>
                    <path d={viewsPath.area} fill="url(#adminTrafficViewsGradient)" />
                    <path d={viewsPath.line} fill="none" stroke="#6043f5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    <path d={utmPath.area} fill="url(#adminTrafficUtmGradient)" />
                    <path d={utmPath.line} fill="none" stroke="#9cc400" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="mt-2 flex justify-between text-[10px] text-app-muted">
                    <span>{dailySeries[0]?.date}</span>
                    <span>{dailySeries[dailySeries.length - 1]?.date}</span>
                  </div>
                  <div className="mt-3 flex gap-4 text-[11px] text-app-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#6043f5]" /> Total kunjungan
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#9cc400]" /> Bawa tag UTM
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-app-muted">Belum ada data di rentang ini.</p>
              )}
            </div>

            <div className="rounded-jmd border border-jeon-purple/10 bg-app-surface p-4 shadow-refined lg:col-span-2">
              <p className="text-xs font-semibold text-app-muted">Kunjungan per Source</p>
              {bySource.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {bySource.map((s) => (
                    <li key={s.utm_source} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-app-ink">{s.utm_source}</span>
                        <span className="flex-shrink-0 tabular-nums text-app-muted">
                          <span className="font-semibold text-app-ink">{s.views.toLocaleString("id-ID")}</span> kunjungan · {s.clicks.toLocaleString("id-ID")} klik
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-jeon-lavender/40">
                        <div className="h-full rounded-full bg-jeon-purple" style={{ width: `${Math.max(3, (s.views / maxSourceViews) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-app-muted">Belum ada trafik bertag UTM di rentang ini.</p>
              )}
            </div>
          </section>

          <div className="mt-6 overflow-x-auto rounded-jmd border border-jeon-purple/10 bg-app-surface shadow-refined">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-app-border text-xs font-semibold uppercase tracking-wide text-app-muted">
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Medium</th>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3 text-right">Kunjungan</th>
                  <th className="px-4 py-3 text-right">Klik</th>
                </tr>
              </thead>
              <tbody>
                {data.sources.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-app-muted">
                      Belum ada trafik bertag UTM di rentang ini.
                    </td>
                  </tr>
                )}
                {data.sources.map((row, i) => (
                  <tr key={`${row.utm_source}-${row.utm_medium}-${row.utm_campaign}-${i}`} className="border-b border-app-border last:border-0">
                    <td className="px-4 py-3 font-semibold text-app-ink">{row.utm_source}</td>
                    <td className="px-4 py-3 text-app-muted">{row.utm_medium || "-"}</td>
                    <td className="px-4 py-3 text-app-muted">{row.utm_campaign || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-app-ink">{row.views.toLocaleString("id-ID")}</td>
                    <td className="px-4 py-3 text-right text-app-muted">{row.clicks.toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.has_more && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="mt-4 rounded-full border-2 border-jeon-ink bg-app-surface px-4 py-2 text-xs font-bold text-app-ink hover:bg-app-surface-2 disabled:opacity-60"
            >
              {loadingMore ? "Memuat..." : "Muat lebih banyak"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
