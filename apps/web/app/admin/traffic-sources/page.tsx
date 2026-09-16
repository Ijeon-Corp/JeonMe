"use client";

import { useEffect, useState } from "react";
import { ApiError, TrafficSourcesResponse, getAdminTrafficSources } from "@/lib/api-client";
import { useErrorToast } from "@/lib/use-error-toast";

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
    getAdminTrafficSources({ rangeDays, offset: data.sources.length })
      .then((r) => setData((prev) => (prev ? { ...r, sources: [...prev.sources, ...r.sources] } : r)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data tambahan."))
      .finally(() => setLoadingMore(false));
  }

  const withUtmPercent = data && data.total_views > 0 ? Math.round((data.views_with_utm / data.total_views) * 100) : 0;

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
      <p className="mt-1 text-xs text-app-muted">
        Breakdown platform-wide dari parameter <code>utm_source</code>/<code>utm_medium</code>/<code>utm_campaign</code> di URL
        pengunjung (mis. <code>?utm_source=facebook&amp;utm_medium=social&amp;utm_campaign=promo_course</code>) -- lintas semua
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
