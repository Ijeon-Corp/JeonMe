"use client";

import { useEffect, useState } from "react";
import { ApiError, Balance, Payout, createPayout, getBalance, listPayouts } from "@/lib/api-client";
import { IconInbox, IconWallet } from "@/components/icons";

const STATUS_LABEL: Record<Payout["status"], string> = {
  requested: "Diajukan",
  processing: "Diproses",
  completed: "Berhasil",
  failed: "Gagal",
};

export default function DashboardBalancePage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reload() {
    return Promise.all([getBalance(), listPayouts()]).then(([b, p]) => {
      setBalance(b);
      setPayouts(p);
    });
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat saldo."))
      .finally(() => setLoading(false));
  }, []);

  async function handleRequestPayout(e: React.FormEvent) {
    e.preventDefault();
    const amountIDR = Number(amount);
    if (!amountIDR || amountIDR < 50000) {
      setError("Minimum penarikan Rp50.000.");
      return;
    }
    if (!destination.trim()) {
      setError("Isi rekening/e-wallet tujuan.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createPayout({ amount_idr: amountIDR, destination_account: destination });
      setAmount("");
      setDestination("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengajukan penarikan.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Saldo & Penarikan</h1>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {balance && (
        <section className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <IconWallet className="h-4 w-4 text-secondary-dark" />
              Saldo Tersedia
            </div>
            <p className="mt-2 font-heading text-2xl font-bold text-secondary-dark sm:text-3xl">
              Rp {balance.available_idr.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <IconWallet className="h-4 w-4 text-ink/50" />
              Saldo Tertahan
            </div>
            <p className="mt-2 font-heading text-2xl font-bold text-ink sm:text-3xl">
              Rp {balance.held_idr.toLocaleString("id-ID")}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Tertahan {balance.holding_period_days} hari sejak pembayaran (anti-fraud)
            </p>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-card">
        <h2 className="font-heading text-lg font-bold text-ink">Ajukan Penarikan</h2>
        <p className="mt-1 text-xs text-muted">
          Minimum Rp50.000. Rekening/e-wallet tujuan belum melalui proses verifikasi -- pastikan
          nomor yang kamu masukkan benar.
        </p>
        <form onSubmit={handleRequestPayout} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="number"
            min={50000}
            placeholder="Jumlah (IDR)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-40 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="text"
            placeholder="mis. BCA 1234567890"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? "Memproses..." : "Ajukan"}
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-card">
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
          {payouts.length === 0 && (
            <li className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
              <IconInbox className="h-4 w-4 flex-shrink-0" />
              Belum ada penarikan.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
