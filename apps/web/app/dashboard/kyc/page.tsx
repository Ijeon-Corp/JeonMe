"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useRef, useState } from "react";
import { ApiError, KycStatus, getKycStatus, submitKyc } from "@/lib/api-client";
import { IconCheck, IconShield, IconUpload } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import { dashRedesignEnabled } from "@/lib/dashboard-flags";
import PageHeader from "@/components/dashboard/page/PageHeader";
import StatusBadge from "@/components/dashboard/data/StatusBadge";

function buildStatusLabel(t: (key: string) => string): Record<KycStatus["status"], string> {
  return {
    unverified: t("dashboard.pages.kyc.status.unverified"),
    pending: t("dashboard.pages.kyc.status.pending"),
    verified: t("dashboard.pages.kyc.status.verified"),
    rejected: t("dashboard.pages.kyc.status.rejected"),
  };
}

// Warna status terpusat di StatusBadge (Phase 8 cleanup).

export default function DashboardKycPage() {
  const { t } = useLocale();
  const STATUS_LABEL = buildStatusLabel(t);
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // v2 (SPEC §17.3, Phase 7, flag "settings"): form jadi STEPPER 4 langkah
  // (Identitas -> Bisnis -> Dokumen -> Review) dengan SATU submitKyc di
  // akhir. Ketiga input file TETAP ter-mount di semua langkah (di-hide via
  // CSS, bukan unmount) supaya ref file tidak hilang saat pindah langkah.
  const settingsV2 = dashRedesignEnabled("settings");
  const [kycStep, setKycStep] = useState(1);
  const [fileNames, setFileNames] = useState({ ktp: "", selfie: "", bank: "" });

  const [fullNameKtp, setFullNameKtp] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [domicileAddress, setDomicileAddress] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [promotionChannels, setPromotionChannels] = useState("");

  const ktpInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const bankProofInputRef = useRef<HTMLInputElement>(null);

  function reload() {
    return getKycStatus().then((s) => {
      setStatus(s);
      setFullNameKtp(s.full_name_ktp);
      setBankAccountName(s.bank_account_name);
      setDomicileAddress(s.domicile_address);
      setBusinessDescription(s.business_description);
      setPromotionChannels(s.promotion_channels);
    });
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.kyc.loadError")))
      .finally(() => setLoading(false));
  }, []);

  function stepValid(step: number): boolean {
    if (step === 1) return Boolean(fullNameKtp.trim() && bankAccountName.trim());
    if (step === 2) return Boolean(domicileAddress.trim() && businessDescription.trim() && promotionChannels.trim());
    if (step === 3)
      return Boolean(ktpInputRef.current?.files?.[0] && selfieInputRef.current?.files?.[0] && bankProofInputRef.current?.files?.[0]);
    return true;
  }

  function handleNext() {
    if (!stepValid(kycStep)) {
      setError(kycStep === 3 ? t("dashboard.pages.kyc.filesRequiredError") : t("dashboard.pages.kyc.allFieldsRequiredError"));
      return;
    }
    setError(null);
    setKycStep((v) => Math.min(v + 1, 4));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (settingsV2 && kycStep < 4) {
      // Enter di langkah awal = lanjut, bukan submit.
      handleNext();
      return;
    }
    const ktpPhoto = ktpInputRef.current?.files?.[0];
    const selfiePhoto = selfieInputRef.current?.files?.[0];
    const bankProof = bankProofInputRef.current?.files?.[0];

    if (!fullNameKtp.trim() || !bankAccountName.trim() || !domicileAddress.trim() || !businessDescription.trim() || !promotionChannels.trim()) {
      setError(t("dashboard.pages.kyc.allFieldsRequiredError"));
      return;
    }
    if (!ktpPhoto || !selfiePhoto || !bankProof) {
      setError(t("dashboard.pages.kyc.filesRequiredError"));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await submitKyc({
        full_name_ktp: fullNameKtp.trim(),
        bank_account_name: bankAccountName.trim(),
        domicile_address: domicileAddress.trim(),
        business_description: businessDescription.trim(),
        promotion_channels: promotionChannels.trim(),
        ktp_photo: ktpPhoto,
        selfie_photo: selfiePhoto,
        bank_proof: bankProof,
      });
      await reload();
      setKycStep(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.kyc.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageSkeleton />;

  const canSubmit = status?.status === "unverified" || status?.status === "rejected";

  return (
    <div className="mx-auto max-w-2xl">
      {settingsV2 ? (
        <PageHeader title={t("dashboard.extraPages.kycVerification")} description={t("dashboard.pages.kyc.intro")} />
      ) : (
        <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.kyc.intro")}</p>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {status && (
        <section className="glass mt-4 rounded-jlg p-5 shadow-card">
          <div className="flex items-center gap-2">
            <IconShield className="h-4 w-4 text-jeon-purple" />
            <StatusBadge status={status.status} label={STATUS_LABEL[status.status]} />
          </div>

          {status.status === "rejected" && status.rejection_reason && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {t("dashboard.pages.kyc.rejectionReasonPrefix")} {status.rejection_reason}
            </p>
          )}

          {status.status === "pending" && (
            <p className="mt-3 text-xs text-app-muted">{t("dashboard.pages.kyc.pendingNote")}</p>
          )}

          {status.status === "verified" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-jeon-purple">
              <IconCheck className="h-3.5 w-3.5" />
              {t("dashboard.pages.kyc.verifiedNote")}
            </p>
          )}
        </section>
      )}

      {canSubmit && (
        <form onSubmit={handleSubmit} className="glass mt-4 flex flex-col gap-3 rounded-jlg p-5 shadow-card">
          <p className="text-xs font-bold uppercase tracking-wider text-app-muted">
            {t("dashboard.pages.kyc.requirementNote")}
          </p>

          {settingsV2 && (
            <ol className="flex items-center gap-1.5" aria-label={t("dashboard.pages.kyc.stepperLabel")}>
              {[1, 2, 3, 4].map((n) => (
                <li key={n} className="flex flex-1 items-center gap-1.5">
                  <span
                    aria-current={kycStep === n ? "step" : undefined}
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      kycStep >= n ? "bg-jeon-purple text-white" : "bg-app-surface-2 text-app-muted"
                    }`}
                  >
                    {n}
                  </span>
                  <span className={`hidden truncate text-[10px] font-semibold sm:block ${kycStep === n ? "text-app-ink" : "text-app-muted"}`}>
                    {t(`dashboard.pages.kyc.step${n}Label`)}
                  </span>
                </li>
              ))}
            </ol>
          )}

          <div className={settingsV2 && kycStep !== 1 ? "hidden" : "contents"}>

          <label className="text-xs font-semibold text-app-ink">
            {t("dashboard.pages.kyc.fullNameLabel")}
            <input
              type="text"
              value={fullNameKtp}
              onChange={(e) => setFullNameKtp(e.target.value)}
              className="mt-1 w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
            />
          </label>

          <label className="text-xs font-semibold text-app-ink">
            {t("dashboard.pages.kyc.bankAccountNameLabel")}
            <input
              type="text"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
            />
          </label>

          </div>

          <div className={settingsV2 && kycStep !== 2 ? "hidden" : "contents"}>
          <label className="text-xs font-semibold text-app-ink">
            {t("dashboard.pages.kyc.domicileAddressLabel")}
            <textarea
              value={domicileAddress}
              onChange={(e) => setDomicileAddress(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
            />
          </label>

          <label className="text-xs font-semibold text-app-ink">
            {t("dashboard.pages.kyc.businessDescriptionLabel")}
            <textarea
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
            />
          </label>

          <label className="text-xs font-semibold text-app-ink">
            {t("dashboard.pages.kyc.promotionChannelsLabel")}
            <input
              type="text"
              value={promotionChannels}
              onChange={(e) => setPromotionChannels(e.target.value)}
              className="mt-1 w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
            />
          </label>

          </div>

          <div className={settingsV2 && kycStep !== 3 ? "hidden" : "contents"}>
          <label className="text-xs font-semibold text-app-ink">
            {t("dashboard.pages.kyc.ktpPhotoLabel")}
            <input ref={ktpInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setFileNames((f) => ({ ...f, ktp: e.target.files?.[0]?.name ?? "" }))} className="mt-1 w-full text-xs" />
          </label>

          <label className="text-xs font-semibold text-app-ink">
            {t("dashboard.pages.kyc.selfiePhotoLabel")}
            <input ref={selfieInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setFileNames((f) => ({ ...f, selfie: e.target.files?.[0]?.name ?? "" }))} className="mt-1 w-full text-xs" />
          </label>

          <label className="text-xs font-semibold text-app-ink">
            {t("dashboard.pages.kyc.bankProofLabel")}
            <input ref={bankProofInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setFileNames((f) => ({ ...f, bank: e.target.files?.[0]?.name ?? "" }))} className="mt-1 w-full text-xs" />
          </label>

          </div>

          {settingsV2 && kycStep === 4 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-app-border p-3.5 text-xs">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-app-muted">{t("dashboard.pages.kyc.step4Label")}</p>
              {[
                [t("dashboard.pages.kyc.fullNameLabel"), fullNameKtp],
                [t("dashboard.pages.kyc.bankAccountNameLabel"), bankAccountName],
                [t("dashboard.pages.kyc.domicileAddressLabel"), domicileAddress],
                [t("dashboard.pages.kyc.businessDescriptionLabel"), businessDescription],
                [t("dashboard.pages.kyc.promotionChannelsLabel"), promotionChannels],
                [t("dashboard.pages.kyc.ktpPhotoLabel"), fileNames.ktp],
                [t("dashboard.pages.kyc.selfiePhotoLabel"), fileNames.selfie],
                [t("dashboard.pages.kyc.bankProofLabel"), fileNames.bank],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-app-muted">{label}</span>
                  <span className="min-w-0 truncate text-right font-semibold text-app-ink">{value || "-"}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 flex gap-2">
            {settingsV2 && kycStep > 1 && (
              <button
                type="button"
                onClick={() => { setError(null); setKycStep((v) => v - 1); }}
                className="flex-1 rounded-lg border-2 border-jeon-ink py-2.5 text-sm font-semibold text-app-ink"
              >
                {t("dashboard.pages.kyc.backButton")}
              </button>
            )}
            {settingsV2 && kycStep < 4 ? (
              <button type="button" onClick={handleNext} className="btn-primary flex-1 rounded-lg py-2.5 text-sm font-bold text-white">
                {t("dashboard.pages.kyc.continueButton")}
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                <IconUpload className="h-4 w-4" />
                {submitting ? t("dashboard.pages.kyc.submittingButton") : t("dashboard.pages.kyc.submitButton")}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
