"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  SubscriptionStatus,
  cancelSubscription,
  checkoutSubscription,
  getSubscriptionStatus,
} from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconCheck, IconChevronRight, IconStar } from "@/components/icons";
import { confirmAction } from "@/lib/confirm";
import { useLocale } from "@/lib/locale-context";

// Modul Langganan Premium: menghilangkan watermark halaman publik + latar
// kustom (theme="custom"). Harga BELUM keputusan bisnis final (placeholder,
// lihat monthly_price_idr/yearly_price_idr dari backend -- TIDAK di-hardcode
// di sini) -- kreator memilih siklus "Bulanan + Tahunan (diskon)" tapi belum
// menyebut angka pastinya.
//
// Alur checkout: pilih siklus -> POST /dashboard/subscription/checkout ->
// redirect penuh (bukan popup) ke invoice_url (halaman Snap Midtrans
// ter-hosting) -> Snap redirect balik ke halaman ini (FinishRedirectURL)
// setelah bayar -> reload status (webhook backend yang MENGAKTIFKAN
// langganan biasanya tiba dalam hitungan detik, jadi status sesaat setelah
// redirect balik bisa saja masih "pending_card" -- lihat catatan di bawah).
export default function SettingsSubscriptionPage() {
  const { t } = useLocale();
  const { showToast } = useToast();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<"monthly" | "yearly" | null>(null);
  const [canceling, setCanceling] = useState(false);

  function reload() {
    return getSubscriptionStatus().then(setStatus);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.settingsSubscription.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya perlu jalan sekali saat mount, `t` tidak boleh memicu reload berulang.
  }, []);

  async function handleCheckout(plan: "monthly" | "yearly") {
    setCheckingOut(plan);
    try {
      const res = await checkoutSubscription(plan);
      window.location.href = res.invoice_url;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsSubscription.checkoutError"), "error");
      setCheckingOut(null);
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

  if (status === null) {
    return <PageSkeleton />;
  }

  const isLive = status.status === "pending_card" || status.status === "active" || status.status === "past_due";
  const periodEndLabel = status.current_period_end
    ? new Date(status.current_period_end).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const planLabel = status.plan === "yearly" ? t("dashboard.pages.settingsSubscription.yearly") : t("dashboard.pages.settingsSubscription.monthly");

  let statusMessage: string;
  if (status.status === "canceled") {
    statusMessage = t("dashboard.pages.settingsSubscription.statusCanceled").replace(
      "{date}",
      periodEndLabel ?? t("dashboard.pages.settingsSubscription.endOfPaidPeriod")
    );
  } else if (status.status === "past_due") {
    statusMessage = t("dashboard.pages.settingsSubscription.statusPastDue");
  } else if (periodEndLabel) {
    statusMessage = t("dashboard.pages.settingsSubscription.statusRenewsOn").replace("{date}", periodEndLabel);
  } else {
    statusMessage = t("dashboard.pages.settingsSubscription.statusActive");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-1 text-xs font-semibold text-app-muted hover:text-jeon-purple"
      >
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        {t("dashboard.pages.settingsSubscription.breadcrumb")}
      </Link>

      <h1 className="mt-3 flex items-center gap-2 font-heading text-2xl font-bold text-app-ink">
        <IconStar className="h-6 w-6 text-jeon-purple" />
        {t("dashboard.pages.settingsSubscription.title")}
      </h1>
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.settingsSubscription.subtitle")}</p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {status.is_premium ? (
        <section className="mt-6 rounded-3xl border border-app-border bg-app-surface-2 p-5">
          <div className="flex items-center gap-2">
            <IconStar className="h-5 w-5 text-jeon-warning" />
            <h2 className="font-heading text-sm font-bold text-app-ink">
              {t("dashboard.pages.settingsSubscription.youArePremium").replace("{plan}", planLabel)}
            </h2>
          </div>
          <p className="mt-2 text-xs text-app-muted">{statusMessage}</p>
          {status.status !== "canceled" && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={canceling}
              className="mt-3 rounded-lg border border-app-border bg-app-surface px-4 py-2 text-xs font-semibold text-red-600 hover:border-red-300 disabled:opacity-60"
            >
              {canceling ? t("dashboard.pages.settingsSubscription.canceling") : t("dashboard.pages.settingsSubscription.cancelSubscriptionButton")}
            </button>
          )}
        </section>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PricingCard
            label={t("dashboard.pages.settingsSubscription.monthly")}
            priceIDR={status.monthly_price_idr}
            priceSuffix={t("dashboard.pages.settingsSubscription.perMonth")}
            onSubscribe={() => handleCheckout("monthly")}
            busy={checkingOut === "monthly"}
            disabled={checkingOut !== null || isLive}
            t={t}
          />
          <PricingCard
            label={t("dashboard.pages.settingsSubscription.yearly")}
            priceIDR={status.yearly_price_idr}
            priceSuffix={t("dashboard.pages.settingsSubscription.perYear")}
            badge={t("dashboard.pages.settingsSubscription.saveBadge")}
            highlight
            onSubscribe={() => handleCheckout("yearly")}
            busy={checkingOut === "yearly"}
            disabled={checkingOut !== null || isLive}
            t={t}
          />
        </div>
      )}

      {!status.is_premium && isLive && (
        <p className="mt-3 rounded-lg bg-jeon-purple/10/40 px-3 py-2 text-xs text-app-muted">
          {t("dashboard.pages.settingsSubscription.paymentProcessing")}
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-2 text-sm text-app-ink">
        <BenefitRow text={t("dashboard.pages.settingsSubscription.benefitWatermark")} />
        <BenefitRow text={t("dashboard.pages.settingsSubscription.benefitCustomBackground")} />
      </ul>

      <p className="mt-4 text-[11px] text-app-muted">{t("dashboard.pages.settingsSubscription.billingNote")}</p>
    </div>
  );
}

function BenefitRow({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-jeon-purple/10 text-jeon-purple">
        <IconCheck className="h-3 w-3" />
      </span>
      {text}
    </li>
  );
}

function PricingCard({
  label,
  priceIDR,
  priceSuffix,
  badge,
  highlight,
  onSubscribe,
  busy,
  disabled,
  t,
}: {
  label: string;
  priceIDR: number;
  priceSuffix: string;
  badge?: string;
  highlight?: boolean;
  onSubscribe: () => void;
  busy: boolean;
  disabled: boolean;
  t: (key: string) => string;
}) {
  return (
    <div
      className={`relative rounded-2xl border p-5 ${
        highlight ? "border-jeon-purple bg-jeon-purple/10/30" : "border-app-border bg-app-surface"
      }`}
    >
      {badge && (
        <span className="absolute -top-2.5 right-4 rounded-full bg-jeon-purple px-2.5 py-0.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
      <p className="text-sm font-bold text-app-ink">{label}</p>
      <p className="mt-1.5">
        <span className="font-heading text-2xl font-bold text-app-ink">Rp {priceIDR.toLocaleString("id-ID")}</span>
        <span className="text-xs text-app-muted">{priceSuffix}</span>
      </p>
      <button
        type="button"
        onClick={onSubscribe}
        disabled={disabled}
        className="mt-4 w-full rounded-xl bg-jeon-purple px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? t("dashboard.pages.settingsSubscription.preparingPayment") : t("dashboard.pages.settingsSubscription.subscribeButton")}
      </button>
    </div>
  );
}
