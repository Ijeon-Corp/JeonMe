"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, getSocialProofSettings, upsertSocialProofSettings } from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import { useLocale } from "@/lib/locale-context";

const DISPLAY_OPTIONS = [5, 10, 15];
const INTERVAL_OPTIONS = [10, 15, 30, 45, 60];

export default function DashboardSocialProofPage() {
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

      <form onSubmit={handleSave} className="glass mt-6 flex flex-col gap-4 rounded-3xl p-5 shadow-card">
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
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
