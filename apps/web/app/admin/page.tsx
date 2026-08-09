"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminSummary, ApiError, getAdminSummary } from "@/lib/api-client";
import { IconChart, IconFlag, IconUsers, IconWallet } from "@/components/icons";
import StatCard from "@/components/StatCard";

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
          {/* Redesain "Playful Creator": 4 metrik netral pakai StatCard bento
              yang sama dipakai Ringkasan kreator. 2 kartu "tertunda" di
              bawah SENGAJA TIDAK ikut jadi StatCard -- warna merah/amber di
              situ SEMANTIK (perlu ditinjau admin), bukan aksen dekoratif,
              dan keduanya harus tetap <Link> yang bisa diklik. */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard tone="blue" icon={<IconUsers className="h-4 w-4" />} label="Total Pengguna" value={String(summary.total_users)} sub="" />
            <StatCard tone="yellow" icon={<IconChart className="h-4 w-4" />} label="Baru (7 hari)" value={String(summary.new_users_7_days)} sub="" />
            <StatCard tone="lilac" icon={<IconChart className="h-4 w-4" />} label="Total Transaksi Lunas" value={String(summary.total_orders)} sub="" />
            <StatCard
              tone="brand"
              icon={<IconWallet className="h-4 w-4" />}
              label="Total Pendapatan"
              value={`Rp ${summary.total_revenue_idr.toLocaleString("id-ID")}`}
              sub=""
            />

            <Link
              href="/admin/reports"
              className="flex items-center gap-3 rounded-3xl border border-border bg-white p-5 shadow-card transition-colors hover:border-red-200"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <IconFlag className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-muted">Laporan Tertunda</span>
                <span className="block font-heading text-2xl font-bold text-red-600">{summary.pending_reports}</span>
              </span>
            </Link>

            <Link
              href="/admin/payouts"
              className="flex items-center gap-3 rounded-3xl border border-border bg-white p-5 shadow-card transition-colors hover:border-accent/40"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-pop-yellow-tint text-accent-dark">
                <IconWallet className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-muted">Penarikan Tertunda</span>
                <span className="block font-heading text-2xl font-bold text-accent-dark">{summary.pending_payouts}</span>
              </span>
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
