"use client";

import { useEffect, useState } from "react";
import { AdminSummary, ApiError, getAdminSummary } from "@/lib/api-client";

export default function AdminSummaryPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat ringkasan."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-ink">Ringkasan Admin</h1>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {summary && (
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-white p-5">
            <p className="text-xs font-semibold text-muted">Total Pengguna</p>
            <p className="mt-1 font-heading text-2xl font-bold text-ink">{summary.total_users}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5">
            <p className="text-xs font-semibold text-muted">Baru (7 hari)</p>
            <p className="mt-1 font-heading text-2xl font-bold text-ink">{summary.new_users_7_days}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5">
            <p className="text-xs font-semibold text-muted">Laporan Tertunda</p>
            <p className="mt-1 font-heading text-2xl font-bold text-red-600">{summary.pending_reports}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5">
            <p className="text-xs font-semibold text-muted">Total Transaksi Lunas</p>
            <p className="mt-1 font-heading text-2xl font-bold text-ink">{summary.total_orders}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5">
            <p className="text-xs font-semibold text-muted">Total Pendapatan</p>
            <p className="mt-1 font-heading text-2xl font-bold text-secondary-dark">
              Rp {summary.total_revenue_idr.toLocaleString("id-ID")}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
