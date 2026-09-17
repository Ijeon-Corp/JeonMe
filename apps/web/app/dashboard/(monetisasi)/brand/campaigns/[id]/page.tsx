"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "@/lib/locale-context";
import PageHeader from "@/components/dashboard/page/PageHeader";
import EmptyState from "@/components/EmptyState";
import PageSkeleton from "@/components/Skeleton";
import StatusBadge, { type StatusTone } from "@/components/dashboard/data/StatusBadge";
import { IconBriefcase } from "@/components/icons";
import { ApiError, BrandApplicationStatus, BrandCampaign, applyBrandCampaign, listBrandCampaigns } from "@/lib/api-client";
import { sanitizeRichTextHtml } from "@/lib/sanitize-rich-text";
import { useErrorToast } from "@/lib/use-error-toast";

// Halaman detail satu campaign -- pasangan campaigns/page.tsx (lihat catatan
// lengkap di sana). TIDAK ada endpoint GET satu-campaign tersendiri di
// backend (sengaja, lihat brand.go) -- listBrandCampaigns("") SUDAH
// mengembalikan semua campaign TERBUKA milik brand LAIN (persis cakupan
// yang relevan buat kreator menjelajah & melamar), jadi halaman ini cukup
// memuat daftar yang sama lalu mencari id-nya di klien -- tanpa endpoint
// baru, tanpa migrasi, tanpa risiko tambahan. Konsekuensi yang disadari:
// campaign yang SUDAH ditutup brand (atau campaign milik akun sendiri,
// yang memang sengaja dikecualikan dari daftar ini) akan tampil sebagai
// "tidak ditemukan" di sini -- itu wajar karena satu-satunya jalan masuk ke
// halaman ini (kartu di halaman Jelajahi Campaign) juga hanya menampilkan
// campaign yang masih terbuka.
const STATUS_TONE: Record<BrandApplicationStatus, StatusTone> = {
  applied: "info",
  accepted: "success",
  rejected: "danger",
  completed: "neutral",
};

const INPUT = "mt-1 w-full rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none";

export default function CampaignDetailPage() {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [campaign, setCampaign] = useState<BrandCampaign | null | undefined>(undefined);
  const [pitch, setPitch] = useState("");
  const [showPitchForm, setShowPitchForm] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    listBrandCampaigns("")
      .then((list) => setCampaign(list.find((c) => c.id === params.id) ?? null))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t("dashboard.pages.brand.errorGeneric"));
        setCampaign(null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const statusLabel = (s: BrandApplicationStatus) =>
    ({
      applied: t("dashboard.pages.brand.statusApplied"),
      accepted: t("dashboard.pages.brand.statusAccepted"),
      rejected: t("dashboard.pages.brand.statusRejected"),
      completed: t("dashboard.pages.brand.statusCompleted"),
    })[s];
  const kindLabel = (k: BrandCampaign["kind"]) => (k === "sponsored_link" ? t("dashboard.pages.brand.kindSponsoredLink") : t("dashboard.pages.brand.kindBrandDeal"));
  const feeLabel = (fee: number) => (fee > 0 ? `${t("dashboard.pages.brand.fee")} Rp ${fee.toLocaleString("id-ID")}` : t("dashboard.pages.brand.feeFree"));
  const slotsLabel = (c: BrandCampaign) => t("dashboard.pages.brand.slots").replace("{accepted}", String(c.accepted_count)).replace("{slots}", String(c.slots));

  async function handleApply() {
    if (!campaign) return;
    setApplying(true);
    setError(null);
    try {
      const res = await applyBrandCampaign(campaign.id, pitch);
      setCampaign((prev) => (prev ? { ...prev, my_application_status: res.status, my_application_id: res.id, applied_count: prev.applied_count + 1 } : prev));
      setShowPitchForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.brand.errorGeneric"));
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <PageSkeleton />;

  const breadcrumb = [
    { label: t("dashboard.pages.brand.discover.backToBrand"), href: "/dashboard/brand" },
    { label: t("dashboard.pages.brand.discover.backToList"), href: "/dashboard/brand/campaigns" },
    { label: campaign ? campaign.title : t("dashboard.pages.brand.discover.notFoundTitle") },
  ];

  if (!campaign) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader breadcrumb={breadcrumb} title={t("dashboard.pages.brand.discover.notFoundTitle")} />
        <EmptyState
          icon={IconBriefcase}
          text={t("dashboard.pages.brand.discover.notFoundText")}
          ctaLabel={t("dashboard.pages.brand.discover.backToListButton")}
          onCtaClick={() => router.push("/dashboard/brand/campaigns")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader breadcrumb={breadcrumb} title={campaign.title} />

      <div className="glass rounded-jmd p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-jeon-lavender px-2 py-0.5 text-[10px] font-bold text-[#111111]">{kindLabel(campaign.kind)}</span>
          {campaign.category && <span className="rounded-full border border-app-border px-2 py-0.5 text-[10px] font-semibold text-app-muted">{campaign.category}</span>}
          {campaign.my_application_status && (
            <StatusBadge status={campaign.my_application_status} tone={STATUS_TONE[campaign.my_application_status]} label={statusLabel(campaign.my_application_status)} className="text-[10px]" />
          )}
        </div>
        <p className="mt-2 text-sm text-app-muted">
          {t("dashboard.pages.brand.byBrand").replace("{username}", campaign.brand_username)} &middot; {feeLabel(campaign.fee_idr)} &middot; {slotsLabel(campaign)}
        </p>

        {campaign.brief && (
          <div className="mt-4 border-t border-app-border pt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-app-muted">{t("dashboard.pages.brand.discover.aboutTitle")}</p>
            {/* brief = HTML rich text sejak 18 September 2026 (brief lama
                plain text tetap benar lewat whitespace-pre-line) -- pola
                sanitize + jeon-rich-text-content sama seperti blok "text"
                di PagePreview.tsx. */}
            <div
              className="jeon-rich-text-content mt-1.5 whitespace-pre-line text-sm leading-relaxed text-app-ink"
              dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(campaign.brief) }}
            />
          </div>
        )}

        <div className="mt-5 border-t border-app-border pt-4">
          {campaign.my_application_status ? (
            <p className="text-xs text-app-muted">
              {t("dashboard.pages.brand.applied")} &middot; {statusLabel(campaign.my_application_status)}
            </p>
          ) : !showPitchForm ? (
            <button type="button" onClick={() => setShowPitchForm(true)} className="btn-primary rounded-lg px-5 py-2.5 text-sm font-bold text-white">
              {t("dashboard.pages.brand.apply")}
            </button>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-app-ink">
                {t("dashboard.pages.brand.pitchLabel")}
                <textarea value={pitch} onChange={(e) => setPitch(e.target.value)} rows={3} maxLength={2000} placeholder={t("dashboard.pages.brand.pitchPlaceholder")} className={INPUT} />
              </label>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={handleApply} disabled={applying} className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
                  {applying ? t("dashboard.pages.brand.applying") : t("dashboard.pages.brand.sendApplication")}
                </button>
                <button type="button" onClick={() => setShowPitchForm(false)} className="rounded-lg border border-app-border px-4 py-2 text-xs font-semibold text-app-ink">
                  {t("dashboard.pages.brand.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
