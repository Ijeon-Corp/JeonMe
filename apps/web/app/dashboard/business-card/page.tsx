"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, BusinessCard, getBusinessCard, getMyPage, upsertBusinessCard } from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import QRCodeModal from "@/components/QRCodeModal";
import { IconQrCode } from "@/components/icons";
import { SITE_URL } from "@/lib/site";
import { useLocale } from "@/lib/locale-context";

const EMPTY: BusinessCard = {
  is_active: false,
  full_name: "",
  job_title: "",
  company: "",
  phone: "",
  whatsapp_number: "",
  email: "",
  website: "",
  collect_contact_back: false,
};

export default function DashboardBusinessCardPage() {
  const { t } = useLocale();
  const [card, setCard] = useState<BusinessCard>(EMPTY);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    Promise.all([getBusinessCard(), getMyPage()])
      .then(([c, p]) => {
        setCard(c);
        setUsername(p.username);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.businessCard.loadError")))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (card.is_active && !card.full_name.trim()) {
      setError(t("dashboard.pages.businessCard.nameRequiredError"));
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await upsertBusinessCard(card);
      const refreshed = await getBusinessCard();
      setCard(refreshed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.businessCard.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSkeleton />;

  const cardURL = username ? `${SITE_URL}/card/${username}` : "";

  return (
    <div className="mx-auto max-w-lg">
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.businessCard.intro")}</p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("dashboard.pages.businessCard.savedMessage")}</p>}

      {card.is_active && username && (
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-app-border bg-app-surface py-2.5 text-sm font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
        >
          <IconQrCode className="h-4 w-4" />
          {t("dashboard.pages.businessCard.viewQrButton")}
        </button>
      )}

      <form onSubmit={handleSave} className="glass mt-4 flex flex-col gap-4 rounded-3xl p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-app-ink">{t("dashboard.pages.businessCard.activateHeading")}</p>
            <p className="text-xs text-app-muted">
              {t("dashboard.pages.businessCard.activateDescPrefix")}jeon.id/card/{username}
              {t("dashboard.pages.businessCard.activateDescSuffix")}
            </p>
          </div>
          <Toggle
            checked={card.is_active}
            onChange={() => setCard({ ...card, is_active: !card.is_active })}
            label={t("dashboard.pages.businessCard.activateToggleLabel")}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.fullNameLabel")}</label>
          <input
            type="text"
            value={card.full_name}
            onChange={(e) => setCard({ ...card, full_name: e.target.value })}
            maxLength={200}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.jobTitleLabel")}</label>
            <input
              type="text"
              value={card.job_title}
              onChange={(e) => setCard({ ...card, job_title: e.target.value })}
              maxLength={200}
              className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.companyLabel")}</label>
            <input
              type="text"
              value={card.company}
              onChange={(e) => setCard({ ...card, company: e.target.value })}
              maxLength={200}
              className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.phoneLabel")}</label>
            <input
              type="text"
              value={card.phone}
              onChange={(e) => setCard({ ...card, phone: e.target.value })}
              maxLength={30}
              className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.whatsappLabel")}</label>
            <input
              type="text"
              value={card.whatsapp_number}
              onChange={(e) => setCard({ ...card, whatsapp_number: e.target.value })}
              maxLength={30}
              className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.emailLabel")}</label>
          <input
            type="email"
            value={card.email}
            onChange={(e) => setCard({ ...card, email: e.target.value })}
            maxLength={255}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.websiteLabel")}</label>
          <input
            type="text"
            value={card.website}
            onChange={(e) => setCard({ ...card, website: e.target.value })}
            placeholder="https://..."
            maxLength={500}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-app-border px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-app-ink">{t("dashboard.pages.businessCard.collectBackHeading")}</p>
            <p className="text-xs text-app-muted">{t("dashboard.pages.businessCard.collectBackDesc")}</p>
          </div>
          <Toggle
            checked={card.collect_contact_back}
            onChange={() => setCard({ ...card, collect_contact_back: !card.collect_contact_back })}
            label={t("dashboard.pages.businessCard.collectBackToggleLabel")}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? t("dashboard.pages.businessCard.savingButton") : t("dashboard.pages.businessCard.saveButton")}
        </button>
      </form>

      {qrOpen && username && (
        <QRCodeModal
          url={cardURL}
          username={`card-${username}`}
          onClose={() => setQrOpen(false)}
          title={t("dashboard.pages.businessCard.qrModalTitle")}
          description={t("dashboard.pages.businessCard.qrModalDescription")}
        />
      )}
    </div>
  );
}
