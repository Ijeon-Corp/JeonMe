"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminSummary, ApiError, getAdminSummary } from "@/lib/api-client";
import { IconChart, IconFlag, IconUsers, IconWallet } from "@/components/icons";

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
      <h1 className="font-heading text-2xl font-bold text-ink">Ringkasan Admin</h1>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {summary && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                <IconUsers className="h-4 w-4 text-primary" />
                Total Pengguna
              </div>
              <p className="mt-2 font-heading text-2xl font-bold text-ink">{summary.total_users}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                <IconChart className="h-4 w-4 text-primary" />
                Baru (7 hari)
              </div>
              <p className="mt-2 font-heading text-2xl font-bold text-ink">{summary.new_users_7_days}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                <IconChart className="h-4 w-4 text-secondary-dark" />
                Total Transaksi Lunas
              </div>
              <p className="mt-2 font-heading text-2xl font-bold text-ink">{summary.total_orders}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                <IconWallet className="h-4 w-4 text-secondary-dark" />
                Total Pendapatan
              </div>
              <p className="mt-2 font-heading text-2xl font-bold text-secondary-dark">
                Rp {summary.total_revenue_idr.toLocaleString("id-ID")}
              </p>
            </div>

            <Link
              href="/admin/reports"
              className="rounded-2xl border border-border bg-white p-5 shadow-card transition-colors hover:border-red-200"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                <IconFlag className="h-4 w-4 text-red-600" />
                Laporan Tertunda
              </div>
              <p className="mt-2 font-heading text-2xl font-bold text-red-600">{summary.pending_reports}</p>
            </Link>

            <Link
              href="/admin/payouts"
              className="rounded-2xl border border-border bg-white p-5 shadow-card transition-colors hover:border-accent/40"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                <IconWallet className="h-4 w-4 text-accent-dark" />
                Penarikan Tertunda
              </div>
              <p className="mt-2 font-heading text-2xl font-bold text-accent-dark">{summary.pending_payouts}</p>
            </Link>
          </section>

          {(summary.pending_reports > 0 || summary.pending_payouts > 0) && (
            <p className="mt-4 text-xs text-muted">
              Ada hal yang perlu ditinjau -- klik kartu &quot;Laporan Tertunda&quot; atau &quot;Penarikan Tertunda&quot; di atas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
