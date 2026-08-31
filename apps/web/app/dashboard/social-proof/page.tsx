"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, getSocialProofSettings, upsertSocialProofSettings } from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import { useLocale } from "@/lib/locale-context";
import { dashRedesignEnabled } from "@/lib/dashboard-flags";
import PageHeader from "@/components/dashboard/page/PageHeader";
import SectionCard from "@/components/dashboard/page/SectionCard";
import { SettingsPageSkeleton } from "@/components/dashboard/feedback/Skeletons";
import { IconBell, IconCheck, IconClock, IconTarget } from "@/components/icons";

const DISPLAY_OPTIONS = [5, 10, 15];
const INTERVAL_OPTIONS = [10, 15, 30, 45, 60];

// Halaman Social Proof -- PROOF-OF-PATTERN redesign dashboard
// (JEONID-DASHBOARD-REDESIGN-SPEC.md §32: dimigrasikan pertama karena scope
// kecil & risiko rendah). Perubahan PRESENTASI SAJA: state, validasi, dan
// panggilan API (getSocialProofSettings/upsertSocialProofSettings) identik
// dengan legacy. Settings template §7.4 + §15.8: grup visibility/placement/
// timing + PRATINJAU VISUAL toast (sebelumnya 4 toggle/select tanpa konteks
// visual). Legacy dipertahankan di bawah flag (§25 Rollback: OFF lewat env
// NEXT_PUBLIC_DASH_REDESIGN_OFF="marketing" mengembalikan UI lama).
export default function DashboardSocialProofPage() {
  return dashRedesignEnabled("marketing") ? <RedesignedSocialProofPage /> : <LegacySocialProofPage />;
}

function RedesignedSocialProofPage() {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [showOnProductPage, setShowOnProductPage] = useState(true);
  const [showOnCheckout, setShowOnCheckout] = useState(true);
  const [displaySeconds, setDisplaySeconds] = useState(5);
  const [intervalSeconds, setIntervalSeconds] = useState(15);

  useEffect(() => {
    getSocialProofSettings()
      .then((s) => {
        setEnabled(s.is_active);
        setShowOnProductPage(s.show_on_product_page);
        setShowOnCheckout(s.show_on_checkout);
        setDisplaySeconds(s.display_seconds);
        setIntervalSeconds(s.interval_seconds);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.socialProof.loadError")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await upsertSocialProofSettings({
        is_active: enabled,
        show_on_product_page: showOnProductPage,
        show_on_checkout: showOnCheckout,
        display_seconds: displaySeconds,
        interval_seconds: intervalSeconds,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.socialProof.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[720px]">
        <SettingsPageSkeleton />
      </div>
    );
  }

  const selectCls =
    "w-full rounded-xl border border-dash-border bg-dash-surface px-3 py-2 text-sm text-dash-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title={t("dashboard.nav.socialProof")}
        description={t("dashboard.pages.socialProof.intro")}
      />

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mb-4 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm font-semibold text-success">
          {t("dashboard.pages.socialProof.savedMessage")}
        </p>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {/* Pratinjau visual (§15.8) -- meniru markup SocialProofToast publik
            (lingkaran centang + email tersamar + nama produk) supaya kreator
            paham APA yang diatur sebelum menyentuh toggle. Meredup saat
            nonaktif. aria-hidden: murni ilustratif. */}
        <SectionCard
          variant="subtle"
          icon={<IconBell className="h-4 w-4" />}
          title={t("dashboard.pages.socialProof.previewHeading")}
          description={t("dashboard.pages.socialProof.previewDesc")}
        >
          <div className={enabled ? "" : "opacity-45"} aria-hidden="true">
            <div className="flex max-w-xs items-center gap-2.5 rounded-jmd border border-dash-border bg-dash-surface px-4 py-3 shadow-dash-raised">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <IconCheck className="h-4 w-4" />
              </span>
              <p className="text-xs text-dash-ink">
                <span className="font-bold">{t("dashboard.pages.socialProof.previewSampleEmail")}</span>{" "}
                {t("dashboard.pages.socialProof.previewSampleAction")}{" "}
                <span className="font-bold">{t("dashboard.pages.socialProof.previewSampleProduct")}</span>
              </p>
            </div>
          </div>
          {!enabled && (
            <p className="mt-2.5 text-xs text-dash-muted">{t("dashboard.pages.socialProof.previewInactiveNote")}</p>
          )}
        </SectionCard>

        <SectionCard
          title={t("dashboard.pages.socialProof.activateHeading")}
          description={t("dashboard.pages.socialProof.activateDesc")}
          action={
            <Toggle
              checked={enabled}
              onChange={() => setEnabled((v) => !v)}
              label={t("dashboard.pages.socialProof.activateToggleLabel")}
            />
          }
        />

        <SectionCard
          icon={<IconTarget className="h-4 w-4" />}
          title={t("dashboard.pages.socialProof.placementHeading")}
          description={t("dashboard.pages.socialProof.placementDesc")}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-dash-ink">{t("dashboard.pages.socialProof.showOnProductLabel")}</p>
              <Toggle
                checked={showOnProductPage}
                onChange={() => setShowOnProductPage((v) => !v)}
                label={t("dashboard.pages.socialProof.showOnProductToggleLabel")}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-dash-border pt-3">
              <p className="text-sm font-semibold text-dash-ink">{t("dashboard.pages.socialProof.showOnCheckoutLabel")}</p>
              <Toggle
                checked={showOnCheckout}
                onChange={() => setShowOnCheckout((v) => !v)}
                label={t("dashboard.pages.socialProof.showOnCheckoutToggleLabel")}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={<IconClock className="h-4 w-4" />}
          title={t("dashboard.pages.socialProof.timingHeading")}
          description={t("dashboard.pages.socialProof.timingDesc")}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sp-display" className="mb-1 block text-xs font-semibold text-dash-ink">
                {t("dashboard.pages.socialProof.displayDurationLabel")}
              </label>
              <select
                id="sp-display"
                value={displaySeconds}
                onChange={(e) => setDisplaySeconds(Number(e.target.value))}
                className={selectCls}
              >
                {DISPLAY_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v} {t("dashboard.pages.socialProof.secondsUnit")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sp-interval" className="mb-1 block text-xs font-semibold text-dash-ink">
                {t("dashboard.pages.socialProof.intervalLabel")}
              </label>
              <select
                id="sp-interval"
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                className={selectCls}
              >
                {INTERVAL_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v} {t("dashboard.pages.socialProof.secondsUnit")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? t("dashboard.pages.socialProof.savingButton") : t("dashboard.pages.socialProof.saveButton")}
        </button>
      </form>
    </div>
  );
}

// Legacy (pra-redesign) -- DIPERTAHANKAN utuh untuk jalur rollback flag;
// hapus hanya setelah dua rilis stabil (§25 Rollback).
function LegacySocialProofPage() {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [showOnProductPage, setShowOnProductPage] = useState(true);
  const [showOnCheckout, setShowOnCheckout] = useState(true);
  const [displaySeconds, setDisplaySeconds] = useState(5);
  const [intervalSeconds, setIntervalSeconds] = useState(15);

  useEffect(() => {
    getSocialProofSettings()
      .then((s) => {
        setEnabled(s.is_active);
        setShowOnProductPage(s.show_on_product_page);
        setShowOnCheckout(s.show_on_checkout);
        setDisplaySeconds(s.display_seconds);
        setIntervalSeconds(s.interval_seconds);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.socialProof.loadError")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await upsertSocialProofSettings({
        is_active: enabled,
        show_on_product_page: showOnProductPage,
        show_on_checkout: showOnCheckout,
        display_seconds: displaySeconds,
        interval_seconds: intervalSeconds,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.socialProof.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-lg">
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.socialProof.intro")}</p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("dashboard.pages.socialProof.savedMessage")}</p>}

      <form onSubmit={handleSave} className="glass mt-6 flex flex-col gap-4 rounded-jlg p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-app-ink">{t("dashboard.pages.socialProof.activateHeading")}</p>
            <p className="text-xs text-app-muted">{t("dashboard.pages.socialProof.activateDesc")}</p>
          </div>
          <Toggle checked={enabled} onChange={() => setEnabled((v) => !v)} label={t("dashboard.pages.socialProof.activateToggleLabel")} />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-app-ink">{t("dashboard.pages.socialProof.showOnProductLabel")}</p>
          <Toggle checked={showOnProductPage} onChange={() => setShowOnProductPage((v) => !v)} label={t("dashboard.pages.socialProof.showOnProductToggleLabel")} />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-app-ink">{t("dashboard.pages.socialProof.showOnCheckoutLabel")}</p>
          <Toggle checked={showOnCheckout} onChange={() => setShowOnCheckout((v) => !v)} label={t("dashboard.pages.socialProof.showOnCheckoutToggleLabel")} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.socialProof.displayDurationLabel")}</label>
          <select
            value={displaySeconds}
            onChange={(e) => setDisplaySeconds(Number(e.target.value))}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          >
            {DISPLAY_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v} {t("dashboard.pages.socialProof.secondsUnit")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.socialProof.intervalLabel")}</label>
          <select
            value={intervalSeconds}
            onChange={(e) => setIntervalSeconds(Number(e.target.value))}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          >
            {INTERVAL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v} {t("dashboard.pages.socialProof.secondsUnit")}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? t("dashboard.pages.socialProof.savingButton") : t("dashboard.pages.socialProof.saveButton")}
        </button>
      </form>
    </div>
  );
}
