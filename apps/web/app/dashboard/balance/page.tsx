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
import { useLocale } from "@/lib/locale-context";

function buildStatusLabel(t: (key: string) => string): Record<Payout["status"], string> {
  return {
    requested: t("dashboard.pages.balance.status.requested"),
    processing: t("dashboard.pages.balance.status.processing"),
    completed: t("dashboard.pages.balance.status.completed"),
    failed: t("dashboard.pages.balance.status.failed"),
  };
}

export default function DashboardBalancePage() {
  const { showToast } = useToast();
  const { t } = useLocale();
  const STATUS_LABEL = buildStatusLabel(t);

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
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.balance.loadError")))
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
      setError(t("dashboard.pages.balance.minAmountError"));
      return;
    }
    if (!selectedMethodId) {
      setError(t("dashboard.pages.balance.noVerifiedMethodError"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createPayout({ amount_idr: amountIDR, payout_method_id: selectedMethodId });
      setAmount("");
      await reload();
      showToast(t("dashboard.pages.balance.payoutRequestedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.balance.payoutRequestErrorToast"), "error");
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
            label={t("dashboard.pages.balance.availableBalance")}
            value={`Rp ${balance.available_idr.toLocaleString("id-ID")}`}
            sub=""
          />
          <StatCard
            tone="lilac"
            icon={<IconWallet className="h-4 w-4" />}
            label={t("dashboard.pages.balance.heldBalance")}
            value={`Rp ${balance.held_idr.toLocaleString("id-ID")}`}
            sub={t("dashboard.pages.balance.heldBalanceSub").replace("{days}", String(balance.holding_period_days))}
          />
        </section>
      )}

      {feeBreakdown && (
        <section className="glass mt-6 rounded-jlg p-5 shadow-card">
          {/* Keputusan bisnis resmi (permintaan langsung pengguna, 9
              Agustus 2026, hasil benchmark kompetitor): Jeonme 0% komisi
              transaksi -- diferensiasi eksplisit dari Linktree/Beacons/
              Lynk.id yang semua memotong komisi. Baris "Transaksi Nyata
              Milikmu" (breakdown platform_fee_idr sungguhan per kanal)
              DIHAPUS dari sini -- sejak PlatformFeePercent=0.0 nilainya
              SELALU Rp0 untuk order baru, jadi breakdown per-kanal cuma
              jadi tabel nol yang tidak berguna. Pernyataan tunggal di
              bawah ini menggantikannya, lebih jujur & tidak berulang. */}
          <div className="flex items-start gap-3 rounded-jmd bg-jeon-purple/10 px-4 py-3.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-jeon-purple text-white">
              <IconBadgeCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold text-jeon-purple">{t("dashboard.pages.balance.zeroFeeTitle")}</p>
              <p className="mt-0.5 text-xs text-jeon-purple/80">{t("dashboard.pages.balance.zeroFeeDesc")}</p>
            </div>
          </div>

          <h2 className="mt-5 font-display text-lg font-bold text-app-ink">{t("dashboard.pages.balance.processorFeeHeading")}</h2>
          <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.balance.processorFeeNote")}</p>

          <div className="mt-3 flex flex-col gap-1.5">
            {feeBreakdown.reference.map((r) => (
              <div key={r.method} className="flex items-center justify-between rounded-lg border border-app-border px-3 py-2 text-xs">
                <span className="font-semibold text-app-ink">{r.label}</span>
                <span className="text-app-muted">{r.fee_description}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="glass mt-6 rounded-jlg p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-app-ink">{t("dashboard.pages.balance.requestPayoutHeading")}</h2>
        <p className="mt-1 text-xs text-app-muted">
          {t("dashboard.pages.balance.minimumPrefix")}{" "}
          <Link href="/dashboard/kyc" className="inline-flex items-center gap-1 font-semibold text-jeon-purple hover:underline">
            <IconShield className="h-3 w-3" />
            {t("dashboard.pages.balance.kycLinkText")}
          </Link>{" "}
          {t("dashboard.pages.balance.prioritizedSuffix")}
        </p>

        {verifiedMethods.length === 0 ? (
          <p className="mt-3 rounded-lg bg-jeon-purple/5 px-3 py-2 text-xs text-app-ink">
            {t("dashboard.pages.balance.noMethodPrefix")}{" "}
            <Link href="/dashboard/settings/payment" className="font-semibold text-jeon-purple hover:underline">
              {t("dashboard.pages.balance.noMethodLinkText")}
            </Link>{" "}
            {t("dashboard.pages.balance.noMethodSuffix")}
          </p>
        ) : (
          <form onSubmit={handleRequestPayout} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="number"
              min={50000}
              placeholder={t("dashboard.pages.balance.amountPlaceholder")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
            />
            <select
              value={selectedMethodId}
              onChange={(e) => setPayoutMethodId(e.target.value)}
              className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
            >
              {verifiedMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.provider} {m.account_number_masked} {m.is_primary ? t("dashboard.pages.balance.primaryLabel") : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? t("dashboard.pages.balance.processingButton") : t("dashboard.pages.balance.submitButton")}
            </button>
          </form>
        )}
      </section>

      <section className="glass mt-6 rounded-jlg p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-app-ink">{t("dashboard.pages.balance.historyHeading")}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {payouts.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-app-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-app-ink">Rp {p.amount_idr.toLocaleString("id-ID")}</p>
                <p className="text-xs text-app-muted">{p.destination_account}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  p.status === "completed"
                    ? "bg-jeon-purple/10 text-jeon-purple"
                    : p.status === "failed"
                      ? "bg-red-50 text-red-600"
                      : "bg-gray-100 text-app-muted"
                }`}
              >
                {STATUS_LABEL[p.status]}
              </span>
            </li>
          ))}
          {payouts.length === 0 && <EmptyState as="li" text={t("dashboard.pages.balance.emptyHistory")} />}
        </ul>
      </section>
    </div>
  );
}
