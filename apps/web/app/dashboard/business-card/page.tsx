"use client";

import Image from "next/image";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import {
  ApiError,
  BusinessCard,
  deleteBusinessCardBackground,
  getBusinessCard,
  getMyPage,
  upsertBusinessCard,
  uploadBusinessCardBackground,
} from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import BusinessCardModal from "@/components/BusinessCardModal";
import DigitalBusinessCard, { CARD_THEMES, type BusinessCardTheme } from "@/components/DigitalBusinessCard";
import { IconQrCode, IconX } from "@/components/icons";
import { SITE_URL } from "@/lib/site";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

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
  card_theme: "lavender",
  tagline: "",
  address: "",
  instagram: "",
  tiktok: "",
  linkedin: "",
  background_image_url: "",
};

export default function DashboardBusinessCardPage() {
  const { t } = useLocale();
  const [card, setCard] = useState<BusinessCard>(EMPTY);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [saved, setSaved] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  useEffect(() => {
    Promise.all([getBusinessCard(), getMyPage()])
      .then(([c, p]) => {
        setCard({ ...EMPTY, ...c });
        setUsername(p.username);
        setAvatarUrl(p.avatar_url ?? "");
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

  // handleUploadBackground/handleRemoveBackground -- permintaan langsung
  // pengguna, 7 September 2026: "di business card / contact card bisa
  // atur background nya". Update lokal langsung dari respons unggah (bukan
  // getBusinessCard() ulang) -- pola sama seperti upload gambar lain di
  // dashboard ini.
  async function handleUploadBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingBg(true);
    setError(null);
    try {
      const { background_image_url } = await uploadBusinessCardBackground(file);
      setCard((prev) => ({ ...prev, background_image_url }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.businessCard.backgroundUploadError"));
    } finally {
      setUploadingBg(false);
    }
  }

  async function handleRemoveBackground() {
    setError(null);
    try {
      await deleteBusinessCardBackground();
      setCard((prev) => ({ ...prev, background_image_url: "" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.businessCard.backgroundRemoveError"));
    }
  }

  if (loading) return <PageSkeleton />;

  const cardURL = username ? `${SITE_URL}/card/${username}` : "";

  return (
    // Layout dua kolom (permintaan pengguna 3 September 2026: "card preview
    // di sebelah kanan, tempat edit datanya di tengah"): form di kolom
    // utama, pratinjau kartu di kolom kanan yang sticky supaya tetap terlihat
    // saat form digulir. Di layar sempit pratinjau tampil DI ATAS form
    // (order-first) -- tetap terlihat tanpa harus menggulir ke bawah.
    <div className="mx-auto flex max-w-5xl flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
      <div className="min-w-0">
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.businessCard.intro")}</p>

      {saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("dashboard.pages.businessCard.savedMessage")}</p>}



      <form onSubmit={handleSave} className="glass mt-4 flex flex-col gap-4 rounded-jlg p-5 shadow-card">
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

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.taglineLabel")}</label>
          <input
            type="text"
            value={card.tagline}
            onChange={(e) => setCard({ ...card, tagline: e.target.value })}
            placeholder={t("dashboard.pages.businessCard.taglinePlaceholder")}
            maxLength={200}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.addressLabel")}</label>
          <input
            type="text"
            value={card.address}
            onChange={(e) => setCard({ ...card, address: e.target.value })}
            placeholder={t("dashboard.pages.businessCard.addressPlaceholder")}
            maxLength={300}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {([["instagram", "instagramLabel"], ["tiktok", "tiktokLabel"], ["linkedin", "linkedinLabel"]] as const).map(([key, labelKey]) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t(`dashboard.pages.businessCard.${labelKey}`)}</label>
              <input
                type="text"
                value={card[key]}
                onChange={(e) => setCard({ ...card, [key]: e.target.value })}
                placeholder={t("dashboard.pages.businessCard.handlePlaceholder")}
                maxLength={key === "linkedin" ? 200 : 100}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.themeLabel")}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("dashboard.pages.businessCard.themeLabel")}>
            {(Object.keys(CARD_THEMES) as BusinessCardTheme[]).map((key) => {
              const active = card.card_theme === key;
              const label = t(`dashboard.pages.businessCard.theme${key.charAt(0).toUpperCase()}${key.slice(1)}`);
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCard({ ...card, card_theme: key })}
                  className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-bold transition-colors ${active ? "border-jeon-ink bg-jeon-lavender text-[#111111]" : "border-app-border text-app-muted hover:text-app-ink"}`}
                >
                  <span className="h-4 w-4 rounded-full border-2 border-[#111111]" style={{ backgroundColor: CARD_THEMES[key].hex }} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-app-ink">{t("dashboard.pages.businessCard.backgroundLabel")}</p>
          <p className="mb-2 text-[11px] text-app-muted">{t("dashboard.pages.businessCard.backgroundHint")}</p>
          <div className="flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
            {card.background_image_url ? (
              // Ukuran TETAP 96x56 (w-24 h-14) -- pratinjau latar kartu nama.
              // Sengaja BUKAN rasio gambar aslinya: object-cover memang
              // memotongnya ke kotak pratinjau ini, sama seperti sebelumnya.
              <Image src={card.background_image_url} alt="" width={96} height={56} className="h-14 w-24 flex-shrink-0 rounded-md object-cover ring-1 ring-black/5" />
            ) : (
              <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-app-border text-[10px] text-app-muted">
                {t("dashboard.pages.links.common.noneYet")}
              </div>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <label className="w-fit cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                {uploadingBg ? t("dashboard.pages.businessCard.backgroundUploading") : card.background_image_url ? t("dashboard.pages.businessCard.backgroundChange") : t("dashboard.pages.businessCard.backgroundUpload")}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={handleUploadBackground}
                  disabled={uploadingBg}
                  className="hidden"
                />
              </label>
              {card.background_image_url && (
                <button
                  type="button"
                  onClick={handleRemoveBackground}
                  title={t("dashboard.pages.businessCard.backgroundRemove")}
                  className="flex-shrink-0 rounded-md p-1.5 text-red-600 hover:bg-red-50"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
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

      </div>

      {username && (
        <aside className="order-first lg:order-none lg:sticky lg:top-24">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-app-muted">{t("dashboard.pages.businessCard.previewHeading")}</p>
          <div className="flex justify-center lg:justify-start">
            <DigitalBusinessCard card={card} username={username} avatarUrl={avatarUrl} url={cardURL} />
          </div>
          {card.is_active && (
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="mt-4 flex w-full max-w-sm items-center justify-center gap-1.5 rounded-lg border-2 border-jeon-ink bg-app-surface py-2.5 text-sm font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
            >
              <IconQrCode className="h-4 w-4" />
              {t("dashboard.pages.businessCard.viewCardButton")}
            </button>
          )}
        </aside>
      )}

      {qrOpen && username && (
        <BusinessCardModal card={card} username={username} avatarUrl={avatarUrl} url={cardURL} onClose={() => setQrOpen(false)} />
      )}
    </div>
  );
}
