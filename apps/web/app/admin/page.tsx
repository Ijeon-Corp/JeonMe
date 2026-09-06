"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminSummary, ApiError, getAdminSummary } from "@/lib/api-client";
import { IconChart, IconFlag, IconShield, IconUsers, IconWallet } from "@/components/icons";
import { MessageCircle } from "lucide-react";
import StatCard from "@/components/StatCard";
import { useErrorToast } from "@/lib/use-error-toast";

export default function AdminSummaryPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat ringkasan."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-app-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-app-ink">Ringkasan Admin</h1>


      {summary && (
        <>
          {/* Redesain "Playful Creator": 4 metrik netral pakai StatCard bento
              yang sama dipakai Ringkasan kreator. 2 kartu "tertunda" di
              bawah SENGAJA TIDAK ikut jadi StatCard -- warna merah/amber di
              situ SEMANTIK (perlu ditinjau admin), bukan aksen dekoratif,
              dan keduanya harus tetap <Link> yang bisa diklik. */}
          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
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
              className="flex items-center gap-3 rounded-jmd border border-jeon-purple/10 bg-app-surface p-5 shadow-refined transition-all hover:-translate-y-0.5 hover:border-red-200"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <IconFlag className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-app-muted">Laporan Tertunda</span>
                <span className="block font-serifDisplay text-2xl font-semibold text-red-600">{summary.pending_reports}</span>
              </span>
            </Link>

            <Link
              href="/admin/payouts"
              className="flex items-center gap-3 rounded-jmd border border-jeon-purple/10 bg-app-surface p-5 shadow-refined transition-all hover:-translate-y-0.5 hover:border-jeon-warning/40"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-lime text-[#111111]">
                <IconWallet className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-app-muted">Penarikan Tertunda</span>
                <span className="block font-serifDisplay text-2xl font-semibold text-jeon-warning">{summary.pending_payouts}</span>
              </span>
            </Link>

            {/* KYC Tertunda -- audit fitur admin (5 September 2026):
                SEBELUMNYA backlog KYC tidak tampil sama sekali di sini
                walau punya halaman review sendiri, beda dari
                laporan/penarikan yang sudah tampil. */}
            <Link
              href="/admin/kyc"
              className="flex items-center gap-3 rounded-jmd border border-jeon-purple/10 bg-app-surface p-5 shadow-refined transition-all hover:-translate-y-0.5 hover:border-jeon-purple/40"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-jeon-lavender/40 text-jeon-purple">
                <IconShield className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-app-muted">KYC Tertunda</span>
                <span className="block font-serifDisplay text-2xl font-semibold text-jeon-purple">{summary.pending_kyc}</span>
              </span>
            </Link>

            {/* Live Chat Tertunda -- fitur Live Chat (7 September 2026),
                pola sama KYC Tertunda di atas: tanpa ini backlog chat baru
                tidak tampil sama sekali kecuali admin sengaja buka
                /admin/support-chat. */}
            <Link
              href="/admin/support-chat"
              className="flex items-center gap-3 rounded-jmd border border-jeon-purple/10 bg-app-surface p-5 shadow-refined transition-all hover:-translate-y-0.5 hover:border-jeon-purple/40"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-jeon-lavender/40 text-jeon-purple">
                <MessageCircle className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-app-muted">Live Chat Tertunda</span>
                <span className="block font-serifDisplay text-2xl font-semibold text-jeon-purple">{summary.pending_support_chats}</span>
              </span>
            </Link>
          </section>

          {(summary.pending_reports > 0 || summary.pending_payouts > 0 || summary.pending_kyc > 0 || summary.pending_support_chats > 0) && (
            <p className="mt-4 text-xs text-app-muted">
              Ada hal yang perlu ditinjau -- klik kartu &quot;Laporan Tertunda&quot;, &quot;Penarikan Tertunda&quot;, &quot;KYC Tertunda&quot;, atau &quot;Live Chat Tertunda&quot; di atas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
