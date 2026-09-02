"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  PayoutMethod,
  PayoutSchedule,
  createPayoutMethod,
  deletePayoutMethod,
  getPayoutSchedule,
  listPayoutMethods,
  requestPayoutMethodVerification,
  setPayoutMethodPrimary,
  updatePayoutSchedule,
  verifyPayoutMethod,
} from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconChevronRight, IconTrash } from "@/components/icons";
import { confirmDelete } from "@/lib/confirm";
import { useLocale } from "@/lib/locale-context";

// Modul Settings §3 (Payment / Payout). Rekening baru WAJIB verifikasi
// (kode OTP) sebelum bisa jadi utama -- lihat PayoutMethodHandler backend.
export default function SettingsPaymentPage() {
  const { t } = useLocale();
  const { showToast } = useToast();

  const [methods, setMethods] = useState<PayoutMethod[] | null>(null);
  const [schedule, setSchedule] = useState<PayoutSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<"bank_transfer" | "ewallet">("bank_transfer");
  const [provider, setProvider] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [creating, setCreating] = useState(false);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);

  const [frequency, setFrequency] = useState<PayoutSchedule["frequency"]>("manual");
  const [minThreshold, setMinThreshold] = useState("0");
  const [savingSchedule, setSavingSchedule] = useState(false);

  function reload() {
    return Promise.all([listPayoutMethods(), getPayoutSchedule()]).then(([m, s]) => {
      setMethods(m);
      setSchedule(s);
      setFrequency(s.frequency);
      setMinThreshold(String(s.min_threshold_idr));
    });
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.settingsPayment.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya perlu jalan sekali saat mount, `t` tidak boleh memicu reload berulang.
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!provider.trim() || !accountNumber.trim() || !accountName.trim()) {
      setError(t("dashboard.pages.settingsPayment.allFieldsRequired"));
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await createPayoutMethod({ type, provider, account_number: accountNumber, account_name: accountName });
      setProvider("");
      setAccountNumber("");
      setAccountName("");
      setAdding(false);
      await reload();
      showToast(t("dashboard.pages.settingsPayment.addSuccess"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsPayment.addError"), "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleStartVerify(id: string) {
    try {
      const res = await requestPayoutMethodVerification(id);
      setVerifyingId(id);
      setVerifyCode(res.dev_otp ?? "");
      showToast(
        res.dev_otp
          ? t("dashboard.pages.settingsPayment.devOtpToast").replace("{otp}", res.dev_otp)
          : t("dashboard.pages.settingsPayment.verifyCodeSent")
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsPayment.requestVerifyError"), "error");
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyingId) return;
    setVerifyBusy(true);
    try {
      await verifyPayoutMethod(verifyingId, verifyCode);
      setVerifyingId(null);
      setVerifyCode("");
      await reload();
      showToast(t("dashboard.pages.settingsPayment.verifySuccess"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsPayment.verifyError"), "error");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleSetPrimary(id: string) {
    if (!methods) return;
    const previous = methods;
    setMethods(methods.map((m) => ({ ...m, is_primary: m.id === id })));
    try {
      await setPayoutMethodPrimary(id);
      showToast(t("dashboard.pages.settingsPayment.setPrimarySuccess"));
    } catch (err) {
      setMethods(previous);
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsPayment.setPrimaryError"), "error");
    }
  }

  async function handleDelete(id: string) {
    if (!methods) return;
    if (!(await confirmDelete(t("dashboard.pages.settingsPayment.deleteConfirmText")))) return;
    const previous = methods;
    setMethods(methods.filter((m) => m.id !== id));
    try {
      await deletePayoutMethod(id);
      showToast(t("dashboard.pages.settingsPayment.deleteSuccess"));
    } catch (err) {
      setMethods(previous);
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsPayment.deleteError"), "error");
    }
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSavingSchedule(true);
    try {
      await updatePayoutSchedule({ frequency, min_threshold_idr: Number(minThreshold) || 0 });
      showToast(t("dashboard.pages.settingsPayment.scheduleSaveSuccess"));
      setSchedule({ frequency, min_threshold_idr: Number(minThreshold) || 0 });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsPayment.scheduleSaveError"), "error");
    } finally {
      setSavingSchedule(false);
    }
  }

  if (methods === null || schedule === null) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-1 text-xs font-semibold text-app-muted hover:text-jeon-purple"
      >
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        {t("dashboard.pages.settingsPayment.breadcrumb")}
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold text-app-ink">{t("dashboard.pages.settingsPayment.title")}</h1>
      <p className="mt-1 text-sm text-app-muted">
        {t("dashboard.pages.settingsPayment.subtitlePrefix")}{" "}
        <Link href="/dashboard/balance" className="font-semibold text-jeon-purple hover:underline">
          {t("dashboard.pages.settingsPayment.balanceLinkLabel")}
        </Link>
        .
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="mt-6 rounded-jlg border-2 border-jeon-ink bg-app-surface p-5">
        <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.settingsPayment.methodsTitle")}</h2>

        <div className="mt-3 flex flex-col gap-2">
          {methods.map((m) => (
            <div key={m.id} className="rounded-xl border border-app-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-app-ink">
                    {m.provider} {m.account_number_masked}
                  </p>
                  <p className="text-xs text-app-muted">{m.account_name}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {m.is_primary && (
                    <span className="rounded-full border-2 border-[#111111] bg-jeon-lavender px-2 py-0.5 text-[10px] font-bold text-[#111111]">
                      {t("dashboard.pages.settingsPayment.primaryBadge")}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      m.verified ? "border-2 border-[#111111] bg-jeon-lavender text-[#111111]" : "bg-gray-100 text-app-muted"
                    }`}
                  >
                    {m.verified ? t("dashboard.pages.settingsPayment.verifiedBadge") : t("dashboard.pages.settingsPayment.unverifiedBadge")}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                    title={t("dashboard.pages.settingsPayment.deleteTitle")}
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                {!m.verified && verifyingId !== m.id && (
                  <button
                    type="button"
                    onClick={() => handleStartVerify(m.id)}
                    className="rounded-lg border-2 border-jeon-ink px-3 py-1.5 text-[11px] font-semibold text-jeon-purple hover:border-jeon-purple"
                  >
                    {t("dashboard.pages.settingsPayment.verifyButton")}
                  </button>
                )}
                {m.verified && !m.is_primary && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(m.id)}
                    className="rounded-lg border-2 border-jeon-ink px-3 py-1.5 text-[11px] font-semibold text-app-ink hover:border-jeon-purple"
                  >
                    {t("dashboard.pages.settingsPayment.makePrimaryButton")}
                  </button>
                )}
              </div>

              {verifyingId === m.id && (
                <form onSubmit={handleVerify} className="mt-2 flex gap-2 rounded-lg bg-jeon-purple/5 p-2.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder={t("dashboard.pages.settingsPayment.sixDigitCodePlaceholder")}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    className="flex-1 rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={verifyBusy}
                    className="rounded-md btn-primary px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                  >
                    {verifyBusy ? "..." : t("dashboard.pages.settingsPayment.confirmButton")}
                  </button>
                </form>
              )}
            </div>
          ))}
          {methods.length === 0 && <p className="text-xs text-app-muted">{t("dashboard.pages.settingsPayment.noMethods")}</p>}
        </div>

        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 rounded-xl border border-dashed border-app-border px-4 py-2.5 text-sm font-semibold text-jeon-purple hover:border-jeon-purple"
          >
            {t("dashboard.pages.settingsPayment.addMethodButton")}
          </button>
        ) : (
          <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-2 rounded-xl border border-app-border p-3">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "bank_transfer" | "ewallet")}
              className="rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            >
              <option value="bank_transfer">{t("dashboard.pages.settingsPayment.bankTransferOption")}</option>
              <option value="ewallet">{t("dashboard.pages.settingsPayment.ewalletOption")}</option>
            </select>
            <input
              type="text"
              required
              placeholder={t("dashboard.pages.settingsPayment.providerPlaceholder")}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            />
            <input
              type="text"
              required
              placeholder={t("dashboard.pages.settingsPayment.accountNumberPlaceholder")}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            />
            <input
              type="text"
              required
              placeholder={t("dashboard.pages.settingsPayment.accountNamePlaceholder")}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg btn-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? t("dashboard.pages.settingsPayment.saving") : t("dashboard.pages.settingsPayment.save")}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-lg border-2 border-jeon-ink px-4 py-2 text-xs font-semibold text-app-ink"
              >
                {t("dashboard.pages.settingsPayment.cancel")}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-jlg border-2 border-jeon-ink bg-app-surface p-5">
        <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.settingsPayment.autoWithdrawTitle")}</h2>
        <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.settingsPayment.autoWithdrawDescription")}</p>
        {/* Bug ditemukan (5 Agustus 2026, audit responsif): baris ini jadi
            flex-row mulai sm: (640px), tapi <select> (lebar minimalnya
            ditentukan opsi terpanjang "Manual (tidak otomatis)") tidak
            pernah diberi min-w-0 -- di lebar tablet, total select+input+
            tombol melebihi lebar layar & memaksa SELURUH halaman melebar. */}
        <form onSubmit={handleSaveSchedule} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as PayoutSchedule["frequency"])}
            className="min-w-0 rounded-lg border border-app-border px-3 py-2.5 text-sm focus:border-jeon-purple focus:outline-none"
          >
            <option value="manual">{t("dashboard.pages.settingsPayment.frequencyManual")}</option>
            <option value="weekly">{t("dashboard.pages.settingsPayment.frequencyWeekly")}</option>
            <option value="monthly">{t("dashboard.pages.settingsPayment.frequencyMonthly")}</option>
          </select>
          <input
            type="number"
            min={0}
            placeholder={t("dashboard.pages.settingsPayment.minThresholdPlaceholder")}
            value={minThreshold}
            onChange={(e) => setMinThreshold(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none"
          />
          <button
            type="submit"
            disabled={savingSchedule}
            className="flex-shrink-0 rounded-xl btn-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {savingSchedule ? t("dashboard.pages.settingsPayment.saving") : t("dashboard.pages.settingsPayment.save")}
          </button>
        </form>
      </section>
    </div>
  );
}
