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
import { IconBadgeCheck, IconShield, IconWallet } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import StatCard from "@/components/StatCard";

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
          <StatCard
            tone="brand"
            icon={<IconWallet className="h-4 w-4" />}
            label="Saldo Tersedia"
            value={`Rp ${balance.available_idr.toLocaleString("id-ID")}`}
            sub=""
          />
          <StatCard
            tone="lilac"
            icon={<IconWallet className="h-4 w-4" />}
            label="Saldo Tertahan"
            value={`Rp ${balance.held_idr.toLocaleString("id-ID")}`}
            sub={`Tertahan ${balance.holding_period_days} hari sejak pembayaran (anti-fraud)`}
          />
        </section>
      )}

      {feeBreakdown && (
        <section className="glass mt-6 rounded-3xl p-5 shadow-card">
          {/* Keputusan bisnis resmi (permintaan langsung pengguna, 9
              Agustus 2026, hasil benchmark kompetitor): Jeonme 0% komisi
              transaksi -- diferensiasi eksplisit dari Linktree/Beacons/
              Lynk.id yang semua memotong komisi. Baris "Transaksi Nyata
              Milikmu" (breakdown platform_fee_idr sungguhan per kanal)
              DIHAPUS dari sini -- sejak PlatformFeePercent=0.0 nilainya
              SELALU Rp0 untuk order baru, jadi breakdown per-kanal cuma
              jadi tabel nol yang tidak berguna. Pernyataan tunggal di
              bawah ini menggantikannya, lebih jujur & tidak berulang. */}
          <div className="flex items-start gap-3 rounded-2xl bg-secondary-subtle px-4 py-3.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-secondary text-white">
              <IconBadgeCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold text-secondary-dark">Jeon.id 0% komisi transaksi</p>
              <p className="mt-0.5 text-xs text-secondary-dark/80">
                Kamu terima 100% dari harga jual produkmu -- Jeon.id tidak memotong apa pun dari penjualan.
                Satu-satunya potongan adalah biaya prosesor pembayaran (Midtrans) di bawah ini, diteruskan apa adanya.
              </p>
            </div>
          </div>

          <h2 className="mt-5 font-heading text-lg font-bold text-ink">Estimasi Biaya Prosesor per Metode</h2>
          <p className="mt-1 text-xs text-muted">Ditentukan Midtrans, di luar kendali Jeon.id -- bukan komisi platform.</p>

          <div className="mt-3 flex flex-col gap-1.5">
            {feeBreakdown.reference.map((r) => (
              <div key={r.method} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span className="font-semibold text-ink">{r.label}</span>
                <span className="text-muted">{r.fee_description}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="glass mt-6 rounded-3xl p-5 shadow-card">
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

      <section className="glass mt-6 rounded-3xl p-5 shadow-card">
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
