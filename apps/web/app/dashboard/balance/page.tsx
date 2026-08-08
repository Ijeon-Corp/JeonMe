"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  Balance,
  FeeBreakdown,
  Payout,
  PayoutMethod,
  createPayout,
  getBalance,
  getFeeBreakdown,
  listPayoutMethods,
  listPayouts,
} from "@/lib/api-client";
import { IconShield, IconWallet } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";

const STATUS_LABEL: Record<Payout["status"], string> = {
  requested: "Diajukan",
  processing: "Diproses",
  completed: "Berhasil",
  failed: "Gagal",
};

export default function DashboardBalancePage() {
  const { showToast } = useToast();

  const [balance, setBalance] = useState<Balance | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [payoutMethodId, setPayoutMethodId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reload() {
    return Promise.all([getBalance(), listPayouts(), getFeeBreakdown(), listPayoutMethods()]).then(([b, p, f, m]) => {
      setBalance(b);
      setPayouts(p);
      setFeeBreakdown(f);
      setPayoutMethods(m);
    });
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat saldo."))
      .finally(() => setLoading(false));
  }, []);

  // Modul Settings §3: hanya metode TERVERIFIKASI yang bisa dipakai
  // menarik dana -- pra-pilih yang is_primary supaya kasus umum (satu
  // metode, sudah utama) tidak perlu klik tambahan. Dihitung langsung
  // (bukan disinkronkan lewat effect+setState) supaya tidak memicu
  // cascading render -- payoutMethodId cuma diisi eksplisit begitu
  // pengguna mengganti pilihan sendiri di dropdown.
  const verifiedMethods = payoutMethods.filter((m) => m.verified);
  const selectedMethodId =
    payoutMethodId || verifiedMethods.find((m) => m.is_primary)?.id || verifiedMethods[0]?.id || "";

  async function handleRequestPayout(e: React.FormEvent) {
    e.preventDefault();
    const amountIDR = Number(amount);
    if (!amountIDR || amountIDR < 50000) {
      setError("Minimum penarikan Rp50.000.");
      return;
    }
    if (!selectedMethodId) {
      setError("Tambahkan & verifikasi metode pembayaran dulu di Pengaturan > Pembayaran & Penarikan.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createPayout({ amount_idr: amountIDR, payout_method_id: selectedMethodId });
      setAmount("");
      await reload();
      showToast("Penarikan diajukan.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal mengajukan penarikan.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-2xl">

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {balance && (
        <section className="mt-6 grid grid-cols-2 gap-3">
          <div className="glass rounded-2xl p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <IconWallet className="h-4 w-4 text-secondary-dark" />
              Saldo Tersedia
            </div>
            <p className="mt-2 font-heading text-2xl font-bold tabular-nums text-secondary-dark sm:text-3xl">
              Rp {balance.available_idr.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="glass rounded-2xl p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <IconWallet className="h-4 w-4 text-ink/50" />
              Saldo Tertahan
            </div>
            <p className="mt-2 font-heading text-2xl font-bold tabular-nums text-ink sm:text-3xl">
              Rp {balance.held_idr.toLocaleString("id-ID")}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Tertahan {balance.holding_period_days} hari sejak pembayaran (anti-fraud)
            </p>
          </div>
        </section>
      )}

      {feeBreakdown && (
        <section className="glass mt-6 rounded-2xl p-5 shadow-card">
          <h2 className="font-heading text-lg font-bold text-ink">Rincian Biaya per Metode Pembayaran</h2>
          <p className="mt-1 text-xs text-muted">
            Estimasi umum potongan platform per kanal (belum termasuk potongan Jeonme sendiri, masih dalam
            evaluasi bisnis) -- rincian nyata di bawah dihitung dari transaksi lunas milikmu.
          </p>

          <div className="mt-3 flex flex-col gap-1.5">
            {feeBreakdown.reference.map((r) => (
              <div key={r.method} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span className="font-semibold text-ink">{r.label}</span>
                <span className="text-muted">{r.fee_description}</span>
              </div>
            ))}
          </div>

          {feeBreakdown.actual.length > 0 && (
            <>
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted">Transaksi Nyata Milikmu</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {feeBreakdown.actual.map((a) => (
                  <div key={a.method} className="flex items-center justify-between rounded-lg bg-primary-subtle/30 px-3 py-2 text-xs">
                    <span className="font-semibold text-ink">
                      {a.label} <span className="font-normal text-muted">({a.transaction_count}x)</span>
                    </span>
                    <span className="font-semibold text-primary">Rp {a.total_fee_idr.toLocaleString("id-ID")}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section className="glass mt-6 rounded-2xl p-5 shadow-card">
        <h2 className="font-heading text-lg font-bold text-ink">Ajukan Penarikan</h2>
        <p className="mt-1 text-xs text-muted">
          Minimum Rp50.000.{" "}
          <Link href="/dashboard/kyc" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            <IconShield className="h-3 w-3" />
            Verifikasi KYC
          </Link>{" "}
          supaya penarikanmu diprioritaskan diproses.
        </p>

        {verifiedMethods.length === 0 ? (
          <p className="mt-3 rounded-lg bg-primary-subtle/50 px-3 py-2 text-xs text-ink">
            Belum ada metode pembayaran terverifikasi.{" "}
            <Link href="/dashboard/settings/payment" className="font-semibold text-primary hover:underline">
              Tambahkan & verifikasi rekening/e-wallet dulu
            </Link>{" "}
            sebelum bisa menarik dana.
          </p>
        ) : (
          <form onSubmit={handleRequestPayout} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="number"
              min={50000}
              placeholder="Jumlah (IDR)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <select
              value={selectedMethodId}
              onChange={(e) => setPayoutMethodId(e.target.value)}
              className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {verifiedMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.provider} {m.account_number_masked} {m.is_primary ? "(Utama)" : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? "Memproses..." : "Ajukan"}
            </button>
          </form>
        )}
      </section>

      <section className="glass mt-6 rounded-2xl p-5 shadow-card">
        <h2 className="font-heading text-lg font-bold text-ink">Riwayat Penarikan</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {payouts.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Rp {p.amount_idr.toLocaleString("id-ID")}</p>
                <p className="text-xs text-muted">{p.destination_account}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  p.status === "completed"
                    ? "bg-secondary-subtle text-secondary-dark"
                    : p.status === "failed"
                      ? "bg-red-50 text-red-600"
                      : "bg-gray-100 text-muted"
                }`}
              >
                {STATUS_LABEL[p.status]}
              </span>
            </li>
          ))}
          {payouts.length === 0 && <EmptyState as="li" text="Belum ada penarikan." />}
        </ul>
      </section>
    </div>
  );
}
