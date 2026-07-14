"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AnalyticsSummary,
  ApiError,
  clearToken,
  deleteAccount,
  getAnalyticsSummary,
} from "@/lib/api-client";

export default function DashboardHomePage() {
  const router = useRouter();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getAnalyticsSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat ringkasan."))
      .finally(() => setLoading(false));
  }, []);

  async function handleDeleteAccount() {
    if (
      !window.confirm(
        "Yakin hapus akun? Halaman & produkmu akan dinonaktifkan dan datamu dianonimkan. Aksi ini tidak bisa dibatalkan."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount();
      clearToken();
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus akun.");
      setDeleting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  const maxDaily = summary
    ? Math.max(1, ...summary.daily_series.map((d) => Math.max(d.views, d.clicks)))
    : 1;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Ringkasan</h1>
      <p className="mt-1 text-sm text-muted">Statistik {summary?.range_days ?? 30} hari terakhir.</p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {summary && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-white p-5">
              <p className="text-xs font-semibold text-muted">Kunjungan</p>
              <p className="mt-1 font-heading text-2xl font-bold text-ink">{summary.total_views}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-5">
              <p className="text-xs font-semibold text-muted">Klik Tautan</p>
              <p className="mt-1 font-heading text-2xl font-bold text-ink">{summary.total_clicks}</p>
            </div>
          </section>

          {summary.daily_series.length > 0 && (
            <section className="mt-4 rounded-2xl border border-border bg-white p-5">
              <h2 className="font-heading text-sm font-bold text-ink">Tren Harian</h2>
              <div className="mt-3 flex items-end gap-1" style={{ height: 80 }}>
                {summary.daily_series.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={d.date}>
                    <div
                      className="w-full rounded-t bg-primary"
                      style={{ height: `${Math.max(4, (d.views / maxDaily) * 60)}px` }}
                    />
                    <div
                      className="w-full rounded-t bg-accent"
                      style={{ height: `${Math.max(2, (d.clicks / maxDaily) * 20)}px` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-4 text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-primary" /> Kunjungan
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-accent" /> Klik
                </span>
              </div>
            </section>
          )}

          <section className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-white p-5">
              <h2 className="font-heading text-sm font-bold text-ink">Tautan Terpopuler</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {summary.top_links.map((l) => (
                  <li key={l.link_id} className="flex justify-between text-xs">
                    <span className="truncate text-ink">{l.title}</span>
                    <span className="ml-2 flex-shrink-0 font-semibold text-primary">{l.clicks}</span>
                  </li>
                ))}
                {summary.top_links.length === 0 && <p className="text-xs text-muted">Belum ada data.</p>}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-white p-5">
              <h2 className="font-heading text-sm font-bold text-ink">Produk Terlaris</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {summary.top_products.map((p) => (
                  <li key={p.product_id} className="flex justify-between text-xs">
                    <span className="truncate text-ink">{p.name}</span>
                    <span className="ml-2 flex-shrink-0 font-semibold text-secondary-dark">{p.sold_count} terjual</span>
                  </li>
                ))}
                {summary.top_products.length === 0 && <p className="text-xs text-muted">Belum ada penjualan.</p>}
              </ul>
            </div>
          </section>

          {summary.top_referrers.length > 0 && (
            <section className="mt-4 rounded-2xl border border-border bg-white p-5">
              <h2 className="font-heading text-sm font-bold text-ink">Sumber Trafik Utama</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {summary.top_referrers.map((r) => (
                  <li key={r.referrer} className="flex justify-between text-xs">
                    <span className="truncate text-ink">{r.referrer}</span>
                    <span className="ml-2 flex-shrink-0 font-semibold text-primary">{r.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">
        <h2 className="font-heading text-sm font-bold text-red-700">Zona Berbahaya</h2>
        <p className="mt-1 text-xs text-red-700/80">
          Menghapus akun akan menonaktifkan halaman & produkmu dan menganonimkan data pribadimu.
          Riwayat transaksi tetap disimpan untuk keperluan pembukuan.
        </p>
        <button
          type="button"
          onClick={handleDeleteAccount}
          disabled={deleting}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {deleting ? "Menghapus..." : "Hapus Akun"}
        </button>
      </section>
    </div>
  );
}
