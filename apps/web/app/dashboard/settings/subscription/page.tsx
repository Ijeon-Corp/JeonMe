"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  SubscriptionStatus,
  SubscriptionPayment,
  listSubscriptionPayments,
  cancelSubscription,
  checkoutSubscription,
  getSubscriptionStatus,
} from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconCheck, IconChevronRight, IconRefresh, IconStar } from "@/components/icons";
import StatusBadge from "@/components/dashboard/data/StatusBadge";
import { confirmAction } from "@/lib/confirm";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

// Modul Langganan Premium: menghilangkan watermark halaman publik + latar
// kustom + multi-Toko/halaman tambahan. Harga dari backend
// (monthly_price_idr/yearly_price_idr), TIDAK di-hardcode.
//
// Alur checkout: pilih siklus -> POST /dashboard/subscription/checkout ->
// redirect penuh ke invoice_url (Snap Midtrans) -> Snap redirect balik ke
// halaman ini setelah bayar -> status dimuat ulang (webhook yang
// mengaktifkan langganan biasanya tiba dalam hitungan detik, jadi status
// sesaat setelah kembali bisa masih "pending_card" -- ada tombol muat ulang).
//
// REDESAIN 3 September 2026 (permintaan pengguna: "page subscription
// terlihat masih jelek dan belum mengikuti tema"): halaman mengikuti kartu
// harga landing (Gratis bergaris tebal, Premium ungu bergaris hitam +
// bayangan offset), daftar fitur dibaca dari dict.pricing.* -- SATU sumber
// kebenaran dengan halaman /pricing supaya janji di dashboard tidak pernah
// menyimpang dari yang dijanjikan di landing. Status langganan jadi bagian
// dari kartu Premium (bukan kotak terpisah), dan setiap keadaan
// (menunggu pembayaran / gagal tagih / dibatalkan) punya penjelasan +
// aksi yang jelas.
type Cycle = "monthly" | "yearly";

export default function SettingsSubscriptionPage() {
  const { t, dict } = useLocale();
  const { showToast } = useToast();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [cycle, setCycle] = useState<Cycle>("yearly");
  const [checkingOut, setCheckingOut] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);

  function reload() {
    return getSubscriptionStatus().then(setStatus);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.settingsSubscription.loadError")));
    // Riwayat tagihan: pendukung -- gagal memuat tidak menghalangi halaman.
    listSubscriptionPayments().then(setPayments).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya perlu jalan sekali saat mount, `t` tidak boleh memicu reload berulang.
  }, []);

  async function handleCheckout() {
    setCheckingOut(true);
    try {
      const res = await checkoutSubscription(cycle);
      window.location.href = res.invoice_url;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsSubscription.checkoutError"), "error");
      setCheckingOut(false);
    }
  }

  async function handleCancel() {
    if (
      !(await confirmAction(t("dashboard.pages.settingsSubscription.cancelConfirmText"), {
        confirmButtonText: t("dashboard.pages.settingsSubscription.cancelConfirmButton"),
      }))
    ) {
      return;
    }
    setCanceling(true);
    try {
      await cancelSubscription();
      await reload();
      showToast(t("dashboard.pages.settingsSubscription.cancelSuccess"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsSubscription.cancelError"), "error");
    } finally {
      setCanceling(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await reload();
    } catch {
      showToast(t("dashboard.pages.settingsSubscription.loadError"), "error");
    } finally {
      setRefreshing(false);
    }
  }

  if (status === null) {
    return <PageSkeleton />;
  }

  const k = (key: string) => t(`dashboard.pages.settingsSubscription.${key}`);
  const pending = status.status === "pending_card" && !status.is_premium;
  const pastDue = status.status === "past_due";
  const canceled = status.status === "canceled";
  const isLive = status.status === "pending_card" || status.status === "active" || status.status === "past_due";
  const periodEndLabel = status.current_period_end
    ? new Date(status.current_period_end).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const planLabel = status.plan === "yearly" ? k("yearly") : k("monthly");
  const yearlySavingPct =
    status.monthly_price_idr > 0 ? Math.max(0, Math.round((1 - status.yearly_price_idr / (status.monthly_price_idr * 12)) * 100)) : 0;
  const price = cycle === "yearly" ? status.yearly_price_idr : status.monthly_price_idr;
  const priceSuffix = cycle === "yearly" ? k("perYear") : k("perMonth");
  const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

  let statusMessage: string;
  if (canceled) {
    statusMessage = k("statusCanceled").replace("{date}", periodEndLabel ?? k("endOfPaidPeriod"));
  } else if (pastDue) {
    statusMessage = k("statusPastDue");
  } else if (periodEndLabel) {
    statusMessage = k("statusRenewsOn").replace("{date}", periodEndLabel);
  } else {
    statusMessage = k("statusActive");
  }

  const freeItems = (dict.pricing?.free?.items ?? []) as string[];
  const premiumItems = (dict.pricing?.premium?.items ?? []) as string[];
  const faq = [
    { q: k("faq1q"), a: k("faq1a") },
    { q: k("faq2q"), a: k("faq2a") },
    { q: k("faq3q"), a: k("faq3a") },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Breadcrumb hanya di layar sempit -- di lebar, sub-nav Pengaturan
          di kiri sudah menunjukkan posisi. */}
      <Link href="/dashboard/settings" className="flex items-center gap-1 text-xs font-semibold text-app-muted hover:text-jeon-purple lg:hidden">
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        {k("breadcrumb")}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-app-ink">{k("title")}</h1>
          <p className="mt-1 max-w-xl text-sm text-app-muted">{k("subtitle")}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-bold ${
            status.is_premium ? "border-[#111111] bg-jeon-lime text-[#111111]" : "border-jeon-ink bg-app-surface text-app-ink"
          }`}
        >
          <IconStar className="h-3.5 w-3.5" />
          {status.is_premium ? k("chipPremium").replace("{plan}", planLabel) : k("chipFree")}
        </span>
      </div>


      {/* Keadaan yang butuh perhatian, di atas kartu supaya tidak terlewat. */}
      {/* Tombol aksi di banner ini DITAMBAHKAN 24 September 2026 (audit
          cross-check tipe API). Sebelumnya status past_due adalah BUNTU
          TOTAL: is_premium dihitung dari EXISTS(active OR canceled-belum-
          lewat) yang TIDAK memasukkan past_due, jadi halaman jatuh ke
          tampilan non-pelanggan -- di mana tombol "Berlangganan" justru
          di-disable oleh isLive (yang memasukkan past_due), sementara tombol
          "Batalkan" cuma dirender di cabang is_premium yang tidak pernah
          tercapai. Kreator yang penagihannya gagal tidak bisa membayar ulang
          DAN tidak bisa berhenti. Padahal backend sudah menerima keduanya
          untuk past_due (lihat SubscriptionHandler.Cancel). */}
      {pastDue && (
        <div role="alert" className="mt-5 rounded-jmd border-2 border-jeon-ink bg-jeon-coral px-4 py-3 text-sm text-[#111111]">
          <p className="font-bold">{k("pastDueTitle")}</p>
          <p className="mt-0.5 text-xs">{k("statusPastDue")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkingOut}
              className="rounded-jmd border-2 border-[#111111] bg-white px-4 py-2 font-display text-sm font-bold text-[#111111] disabled:opacity-60"
            >
              {checkingOut ? k("preparingPayment") : k("pastDueRetryButton")}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={canceling}
              className="rounded-jmd border-2 border-[#111111]/40 px-4 py-2 text-xs font-semibold text-[#111111] hover:border-[#111111] disabled:opacity-60"
            >
              {canceling ? k("canceling") : k("cancelSubscriptionButton")}
            </button>
          </div>
        </div>
      )}
      {pending && (
        <div role="status" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-jmd border-2 border-jeon-ink bg-jeon-lavender px-4 py-3 text-sm text-[#111111]">
          <div>
            <p className="font-bold">{k("pendingTitle")}</p>
            <p className="mt-0.5 text-xs">{k("paymentProcessing")}</p>
          </div>
          <button type="button" onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-1.5 rounded-lg border-2 border-[#111111] bg-white px-3 py-1.5 text-xs font-bold text-[#111111] disabled:opacity-60">
            <IconRefresh className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? k("refreshing") : k("refreshStatus")}
          </button>
        </div>
      )}

      {/* Dua kartu paket -- kosakata kartu harga landing. */}
      <div className="mt-6 grid items-start gap-5 md:grid-cols-2">
        <section className="rounded-jlg border-2 border-jeon-ink bg-app-surface p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-app-ink">{dict.pricing?.free?.name ?? "Gratis"}</h2>
            {!status.is_premium && <span className="rounded-full border border-jeon-ink px-2 py-0.5 text-[10px] font-bold text-app-ink">{k("yourPlan")}</span>}
          </div>
          <p className="mt-1 text-sm text-app-muted">{dict.pricing?.free?.tagline}</p>
          <p className="mt-4 font-display text-3xl font-extrabold text-app-ink">
            Rp0<span className="ml-1 text-sm font-medium text-app-muted">{k("perMonth")}</span>
          </p>
          <ul className="mt-5 space-y-2.5">
            {freeItems.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-app-ink">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-jeon-ink"><IconCheck className="h-2.5 w-2.5" /></span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="relative rounded-jlg border-2 border-[#111111] bg-jeon-purple p-6 text-white shadow-brutal">
          {status.is_premium ? (
            <span className="absolute -top-3 right-6 rounded-full border-2 border-[#111111] bg-jeon-lime px-3 py-1 text-[11px] font-bold text-[#111111]">{k("yourPlan")}</span>
          ) : (
            yearlySavingPct > 0 && (
              <span className="absolute -top-3 right-6 rounded-full border-2 border-[#111111] bg-jeon-lime px-3 py-1 text-[11px] font-bold text-[#111111]">
                {k("saveBadgePct").replace("{pct}", String(yearlySavingPct))}
              </span>
            )
          )}
          <h2 className="font-display text-lg font-bold">{dict.pricing?.premium?.name ?? "Premium"}</h2>
          <p className="mt-1 text-sm text-white/75">{dict.pricing?.premium?.tagline}</p>

          {status.is_premium ? (
            <div className="mt-4 rounded-jmd border-2 border-[#111111] bg-white/10 p-4">
              <p className="font-display text-2xl font-extrabold">
                {fmt(status.amount_idr || (status.plan === "yearly" ? status.yearly_price_idr : status.monthly_price_idr))}
                <span className="ml-1 text-sm font-medium text-white/75">{status.plan === "yearly" ? k("perYear") : k("perMonth")}</span>
              </p>
              <p className={`mt-2 text-xs ${canceled || pastDue ? "font-semibold text-jeon-lime" : "text-white/80"}`}>{statusMessage}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {canceled ? (
                  <button type="button" onClick={handleCheckout} disabled={checkingOut} className="rounded-jmd border-2 border-[#111111] bg-white px-4 py-2 font-display text-sm font-bold text-[#111111] disabled:opacity-60">
                    {checkingOut ? k("preparingPayment") : k("reactivateButton")}
                  </button>
                ) : (
                  <button type="button" onClick={handleCancel} disabled={canceling} className="rounded-jmd border-2 border-white/40 px-4 py-2 text-xs font-semibold text-white/85 hover:border-white disabled:opacity-60">
                    {canceling ? k("canceling") : k("cancelSubscriptionButton")}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="mt-4 inline-flex rounded-full border-2 border-[#111111] bg-white/10 p-1" role="radiogroup" aria-label={k("cycleLabel")}>
                {(["monthly", "yearly"] as Cycle[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={cycle === c}
                    onClick={() => setCycle(c)}
                    className={`rounded-full px-3.5 py-1 text-xs font-bold transition-colors ${cycle === c ? "bg-white text-[#111111]" : "text-white/80 hover:text-white"}`}
                  >
                    {c === "yearly" ? k("yearly") : k("monthly")}
                  </button>
                ))}
              </div>
              <p className="mt-3 font-display text-3xl font-extrabold">
                {fmt(price)}
                <span className="ml-1 text-sm font-medium text-white/75">{priceSuffix}</span>
              </p>
              {cycle === "yearly" && status.monthly_price_idr > 0 && (
                <p className="mt-0.5 text-xs text-white/70">{k("yearlyEquiv").replace("{monthly}", fmt(Math.round(status.yearly_price_idr / 12)))}</p>
              )}
              <button
                type="button"
                onClick={handleCheckout}
                disabled={checkingOut || isLive}
                className="mt-5 block w-full rounded-jmd border-2 border-[#111111] bg-white px-5 py-3 text-center font-display text-sm font-bold text-[#111111] shadow-btn transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
              >
                {checkingOut ? k("preparingPayment") : k("subscribeButton")}
              </button>
              <p className="mt-2 text-center text-[11px] text-white/65">{k("cancelAnytime")}</p>
            </>
          )}

          <ul className="mt-5 space-y-2.5">
            {premiumItems.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-jeon-lime text-jeon-lime"><IconCheck className="h-2.5 w-2.5" /></span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-8 rounded-jlg border border-jeon-ink bg-app-surface p-5">
        <h2 className="font-display text-base font-bold text-app-ink">{k("faqHeading")}</h2>
        <dl className="mt-3 divide-y divide-app-border">
          {faq.map((f) => (
            <div key={f.q} className="py-3 first:pt-0 last:pb-0">
              <dt className="text-sm font-semibold text-app-ink">{f.q}</dt>
              <dd className="mt-1 text-xs text-app-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Riwayat tagihan -- benchmark Linktree "More > Billing". Tampil juga
          untuk akun yang sudah kembali Gratis (riwayat tetap milik mereka). */}
      {(status.is_premium || payments.length > 0) && (
        <section className="mt-6 rounded-jlg border border-jeon-ink bg-app-surface p-5">
          <h2 className="font-display text-base font-bold text-app-ink">{k("billingHeading")}</h2>
          <p className="mt-0.5 text-xs text-app-muted">{k("billingSub")}</p>
          {payments.length === 0 ? (
            <p className="mt-4 text-sm text-app-muted">{k("billingEmpty")}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-jeon-ink text-app-muted">
                    <th className="py-2 pr-3 font-semibold">{k("billingColDate")}</th>
                    <th className="py-2 pr-3 font-semibold">{k("billingColDesc")}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{k("billingColAmount")}</th>
                    <th className="py-2 font-semibold">{k("billingColStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const when = new Date(p.paid_at ?? p.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
                    const plan = p.plan === "yearly" ? k("yearly") : k("monthly");
                    const desc = (p.kind === "enrollment" ? k("billingEnrollment") : k("billingCycle")).replace("{plan}", plan);
                    const until = p.period_end ? k("billingPeriodUntil").replace("{date}", new Date(p.period_end).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })) : "";
                    return (
                      <tr key={p.id} className="border-b border-app-border last:border-0">
                        <td className="whitespace-nowrap py-2.5 pr-3 text-app-ink">{when}</td>
                        <td className="py-2.5 pr-3 text-app-ink">
                          {desc}
                          {until && <span className="ml-1 text-app-muted">· {until}</span>}
                          <span className="mt-0.5 block text-[10px] text-app-muted">{p.order_id}</span>
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-app-ink">{fmt(p.amount_idr)}</td>
                        <td className="py-2.5">
                          <StatusBadge status={p.status} tone={p.status === "paid" ? "success" : "danger"} label={p.status === "paid" ? k("billingPaid") : k("billingFailed")} className="text-[10px]" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <p className="mt-4 text-[11px] text-app-muted">{k("billingNote")}</p>
    </div>
  );
}
