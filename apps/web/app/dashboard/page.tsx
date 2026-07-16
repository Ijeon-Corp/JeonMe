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
import { IconChart, IconInbox, IconLink, IconSparkle } from "@/components/icons";

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
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Ringkasan</h1>
      <p className="mt-1 text-sm text-muted">Statistik {summary?.range_days ?? 30} hari terakhir.</p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {summary && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3">
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
                {summary.top_links.length === 0 && (
                  <EmptyRow text="Belum ada data klik." />
                )}
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
                {summary.top_products.length === 0 && (
                  <EmptyRow text="Belum ada penjualan." />
                )}
              </ul>
            </div>
          </section>

          {summary.top_referrers.length > 0 && (
            <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
              <h2 className="font-heading text-sm font-bold text-ink">Sumber Trafik Utama</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {summary.top_referrers.map((r) => (
                  <li key={r.referrer} className="flex justify-between text-xs">
                    <span className="truncate text-ink">{r.referrer}</span>
                    <span className="ml-2 flex-shrink-0 font-semibold text-primary">{r.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {summary.total_views === 0 && (
            <section className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border bg-white/60 p-5">
              <IconSparkle className="h-5 w-5 flex-shrink-0 text-accent" />
              <p className="text-xs text-muted">
                Belum ada kunjungan. Bagikan tautan halamanmu di bio Instagram/TikTok supaya statistik mulai terisi.
              </p>
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

function EmptyRow({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2 text-xs text-muted">
      <IconInbox className="h-3.5 w-3.5 flex-shrink-0" />
      {text}
    </li>
  );
}
