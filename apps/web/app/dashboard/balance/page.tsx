"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  Balance,
  FeeBreakdown,
  EarningsBreakdown,
  Payout,
  PayoutMethod,
  KycStatus,
  createPayout,
  getBalance,
  getFeeBreakdown,
  getEarningsBreakdown,
  getKycStatus,
  listPayoutMethods,
  listPayouts,
} from "@/lib/api-client";
import { IconBadgeCheck, IconCheck, IconClose, IconShield, IconWallet } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import StatCard from "@/components/StatCard";
import { useLocale } from "@/lib/locale-context";
import { dashRedesignEnabled } from "@/lib/dashboard-flags";
import PageHeader from "@/components/dashboard/page/PageHeader";
import StatusBadge from "@/components/dashboard/data/StatusBadge";

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
  // Pendapatan per sumber (benchmark Linktree Earn > Earnings). Rentang
  // dipilih di UI; 0 = sepanjang waktu. Dimuat terpisah dari Promise.all
  // awal supaya ganti rentang tidak memuat ulang saldo/riwayat.
  const [earnings, setEarnings] = useState<EarningsBreakdown | null>(null);
  const [earningsRange, setEarningsRange] = useState(30);
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // v2 (SPEC §17.1, Phase 7, flag "settings"): form payout pindah ke
  // DIALOG terfokus + quick amounts (min/50%/maks) + checklist kesiapan
  // (KYC/metode terverifikasi/saldo min) + rincian biaya collapsible.
  // createPayout & validasi backend TIDAK berubah.
  const settingsV2 = dashRedesignEnabled("settings");
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [kyc, setKyc] = useState<KycStatus | null>(null);
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
    let alive = true;
    getEarningsBreakdown(earningsRange)
      .then((e) => {
        if (alive) setEarnings(e);
      })
      .catch(() => {
        if (alive) setEarnings(null);
      });
    return () => {
      alive = false;
    };
  }, [earningsRange]);

  useEffect(() => {
    getKycStatus()
      .then(setKyc)
      .catch(() => {
        // Checklist kesiapan cuma bantuan -- gagal muat KYC didiamkan.
      });
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
      setPayoutOpen(false);
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
      {settingsV2 && (
        <PageHeader
          title={t("dashboard.nav.balance")}
          primaryAction={{
            label: t("dashboard.pages.balance.withdrawCta"),
            onClick: () => setPayoutOpen(true),
            disabled: verifiedMethods.length === 0 || (balance?.available_idr ?? 0) < 50000,
            icon: <IconWallet className="h-4 w-4" />,
          }}
        />
      )}

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

      {/* Pendapatan per sumber -- benchmark Linktree "Earn > Earnings"
          (permintaan pengguna 3 September 2026): saldo saja tidak menjawab
          "uang ini dari mana". Bar proporsional per sumber, bukan grafik
          library, supaya ringan dan konsisten dengan tabel biaya di bawah. */}
      <section className="glass mt-6 rounded-jlg p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-app-ink">{t("dashboard.pages.balance.earningsHeading")}</h2>
            <p className="mt-0.5 text-xs text-app-muted">{t("dashboard.pages.balance.earningsSub")}</p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("dashboard.pages.balance.earningsHeading")}>
            {([7, 30, 90, 365, 0] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setEarningsRange(d)}
                aria-pressed={earningsRange === d}
                className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
                  earningsRange === d ? "border-jeon-ink bg-jeon-lavender text-[#111111]" : "border-app-border text-app-muted hover:text-app-ink"
                }`}
              >
                {t(d === 0 ? "dashboard.pages.balance.earningsRangeAll" : `dashboard.pages.balance.earningsRange${d}`)}
              </button>
            ))}
          </div>
        </div>
        {earnings && earnings.items.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {earnings.items.map((it) => {
              const pct = earnings.total_idr > 0 ? Math.round((it.total_idr / earnings.total_idr) * 100) : 0;
              return (
                <li key={it.source}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold text-app-ink">{t(`dashboard.pages.balance.earningsSource_${it.source}`)}</span>
                    <span className="tabular-nums text-app-ink">
                      Rp {it.total_idr.toLocaleString("id-ID")}
                      <span className="ml-2 text-xs text-app-muted">{pct}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-jeon-purple/10" aria-hidden="true">
                    <div className="h-full rounded-full bg-jeon-purple" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-app-muted">{t("dashboard.pages.balance.earningsCount").replace("{count}", String(it.count))}</p>
                </li>
              );
            })}
            <li className="flex items-baseline justify-between border-t border-app-border pt-3 text-sm font-bold text-app-ink">
              <span>{t("dashboard.pages.balance.earningsTotal")}</span>
              <span className="tabular-nums">Rp {earnings.total_idr.toLocaleString("id-ID")}</span>
            </li>
          </ul>
        ) : (
          <p className="mt-4 text-sm text-app-muted">{t("dashboard.pages.balance.earningsEmpty")}</p>
        )}
      </section>

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

          {settingsV2 ? (
            <details className="mt-4 group">
              <summary className="cursor-pointer list-none">
                <span className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.balance.processorFeeHeading")}</span>
                <span className="ml-2 text-xs text-app-muted">{t("dashboard.pages.balance.feeToggleHint")}</span>
              </summary>
              <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.balance.processorFeeNote")}</p>
              <div className="mt-3 flex flex-col gap-1.5">
                {feeBreakdown.reference.map((r) => (
                  <div key={r.method} className="flex items-center justify-between rounded-lg border border-app-border px-3 py-2 text-xs">
                    <span className="font-semibold text-app-ink">{r.label}</span>
                    <span className="text-app-muted">{r.fee_description}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <>
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
            </>
          )}
        </section>
      )}

      {settingsV2 && (
        <section className="glass mt-6 rounded-jlg p-5 shadow-card">
          <h2 className="font-display text-lg font-bold text-app-ink">{t("dashboard.pages.balance.readinessHeading")}</h2>
          <ul className="mt-3 flex flex-col gap-2 text-xs">
            {[
              { ok: kyc?.status === "verified", label: t("dashboard.pages.balance.readinessKyc"), href: "/dashboard/kyc" },
              { ok: verifiedMethods.length > 0, label: t("dashboard.pages.balance.readinessMethod"), href: "/dashboard/settings/payment" },
              { ok: (balance?.available_idr ?? 0) >= 50000, label: t("dashboard.pages.balance.readinessMinBalance") },
            ].map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-2 rounded-lg border border-app-border px-3 py-2">
                <span className="flex items-center gap-2 font-semibold text-app-ink">
                  <span
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                      item.ok ? "bg-jeon-purple/10 text-jeon-purple" : "bg-gray-100 text-app-muted"
                    }`}
                  >
                    {item.ok ? <IconCheck className="h-3 w-3" /> : <IconClose className="h-3 w-3" />}
                  </span>
                  {item.label}
                </span>
                {!item.ok && item.href && (
                  <Link href={item.href} className="flex-shrink-0 font-bold text-jeon-purple hover:underline">
                    {t("dashboard.pages.balance.readinessFixLink")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!settingsV2 && (
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
      )}

      <section className="glass mt-6 rounded-jlg p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-app-ink">{t("dashboard.pages.balance.historyHeading")}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {payouts.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-app-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-app-ink">Rp {p.amount_idr.toLocaleString("id-ID")}</p>
                <p className="text-xs text-app-muted">{p.destination_account}</p>
              </div>
              <StatusBadge status={p.status} label={STATUS_LABEL[p.status]} />
            </li>
          ))}
          {payouts.length === 0 && <EmptyState as="li" text={t("dashboard.pages.balance.emptyHistory")} />}
        </ul>
      </section>

      {/* Dialog Tarik Dana (§17.1) -- form payout terfokus + quick amounts.
          Validasi (min 50k, metode terverifikasi) & createPayout identik. */}
      {settingsV2 && payoutOpen && balance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setPayoutOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("dashboard.pages.balance.requestPayoutHeading")}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-jlg border-2 border-jeon-ink bg-app-surface p-5 shadow-brutal"
          >
            <h2 className="font-display text-base font-bold text-app-ink">{t("dashboard.pages.balance.requestPayoutHeading")}</h2>
            <p className="mt-1 text-xs text-app-muted">
              {t("dashboard.pages.balance.dialogAvailable").replace("{amount}", balance.available_idr.toLocaleString("id-ID"))}
            </p>
            <form onSubmit={handleRequestPayout} className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: t("dashboard.pages.balance.quickMin"), value: 50000 },
                  { label: "50%", value: Math.floor(balance.available_idr / 2) },
                  { label: t("dashboard.pages.balance.quickMax"), value: balance.available_idr },
                ].map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setAmount(String(Math.max(q.value, 0)))}
                    className="rounded-full border-2 border-jeon-ink px-3 py-1.5 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={50000}
                placeholder={t("dashboard.pages.balance.amountPlaceholder")}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
              <select
                value={selectedMethodId}
                onChange={(e) => setPayoutMethodId(e.target.value)}
                className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              >
                {verifiedMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.provider} {m.account_number_masked} {m.is_primary ? t("dashboard.pages.balance.primaryLabel") : ""}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPayoutOpen(false)}
                  className="flex-1 rounded-lg border-2 border-jeon-ink py-2.5 text-sm font-semibold text-app-ink"
                >
                  {t("dashboard.pages.balance.dialogCancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex-1 rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {submitting ? t("dashboard.pages.balance.processingButton") : t("dashboard.pages.balance.submitButton")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
