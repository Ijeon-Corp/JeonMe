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
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-bold text-app-ink">Ringkasan Admin</h1>


      {summary && (
        <>
          {/* Redesain "Playful Creator": 4 metrik netral pakai StatCard bento
              yang sama dipakai Ringkasan kreator. 4 kartu "tertunda" di
              bawah SENGAJA TIDAK ikut jadi StatCard -- warna merah/amber/
              ungu di situ SEMANTIK (perlu ditinjau admin), bukan aksen
              dekoratif, dan keempatnya harus tetap <Link> yang bisa
              diklik -- TAPI "chrome"-nya (border tebal border-jeon-ink,
              shadow-card, radius, padding, bentuk badge ikon) disamakan
              PERSIS dengan StatCard di atasnya (audit UI/UX admin, 17
              September 2026: sebelumnya pakai border tipis+shadow-refined
              yang beda gaya sama sekali dari StatCard, terlihat seperti 2
              sistem desain berbeda ditumpuk di satu grid). 8 kartu total
              sekarang grid-cols-4 rapi 2 baris genap (sebelumnya
              grid-cols-3 menyisakan lubang kosong 1 kolom di baris
              terakhir). */}
          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              className="flex items-center gap-3 rounded-jmd border-2 border-jeon-ink bg-app-surface p-4 shadow-card transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-coral text-[#111111]">
                <IconFlag className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-app-ink/65">Laporan Tertunda</span>
                <span className="block font-display text-2xl font-extrabold tracking-tight tabular-nums text-red-600">{summary.pending_reports}</span>
              </span>
            </Link>

            <Link
              href="/admin/payouts"
              className="flex items-center gap-3 rounded-jmd border-2 border-jeon-ink bg-app-surface p-4 shadow-card transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-lime text-[#111111]">
                <IconWallet className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-app-ink/65">Penarikan Tertunda</span>
                <span className="block font-display text-2xl font-extrabold tracking-tight tabular-nums text-jeon-warning">{summary.pending_payouts}</span>
              </span>
            </Link>

            {/* KYC Tertunda -- audit fitur admin (5 September 2026):
                SEBELUMNYA backlog KYC tidak tampil sama sekali di sini
                walau punya halaman review sendiri, beda dari
                laporan/penarikan yang sudah tampil. */}
            <Link
              href="/admin/kyc"
              className="flex items-center gap-3 rounded-jmd border-2 border-jeon-ink bg-app-surface p-4 shadow-card transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                <IconShield className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-app-ink/65">KYC Tertunda</span>
                <span className="block font-display text-2xl font-extrabold tracking-tight tabular-nums text-jeon-purple">{summary.pending_kyc}</span>
              </span>
            </Link>

            {/* Live Chat Tertunda -- fitur Live Chat (7 September 2026),
                pola sama KYC Tertunda di atas: tanpa ini backlog chat baru
                tidak tampil sama sekali kecuali admin sengaja buka
                /admin/support-chat. */}
            <Link
              href="/admin/support-chat"
              className="flex items-center gap-3 rounded-jmd border-2 border-jeon-ink bg-app-surface p-4 shadow-card transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                <MessageCircle className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-app-ink/65">Live Chat Tertunda</span>
                <span className="block font-display text-2xl font-extrabold tracking-tight tabular-nums text-jeon-purple">{summary.pending_support_chats}</span>
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
