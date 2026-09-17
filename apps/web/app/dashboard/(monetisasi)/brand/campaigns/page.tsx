"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/locale-context";
import PageHeader from "@/components/dashboard/page/PageHeader";
import EmptyState from "@/components/EmptyState";
import PageSkeleton from "@/components/Skeleton";
import StatusBadge, { type StatusTone } from "@/components/dashboard/data/StatusBadge";
import { IconBriefcase, IconChevronRight } from "@/components/icons";
import { ApiError, BrandApplicationStatus, BrandCampaign, BrandCampaignKind, listBrandCampaigns } from "@/lib/api-client";
import { sanitizeRichTextHtml } from "@/lib/sanitize-rich-text";
import { useErrorToast } from "@/lib/use-error-toast";

// Halaman "Jelajahi Campaign" -- permintaan langsung pengguna, 16 September
// 2026: "buat 1 page khusus yang mempromosikan campaign jadi misal isinya
// khusus campaign campaign beserta deskripsinya". Ditanya lewat
// AskUserQuestion: akses TETAP di dalam dashboard (bukan halaman publik
// tanpa login), dan berbentuk daftar + halaman detail per campaign (bukan
// cuma satu daftar panjang) -- lihat page detail di campaigns/[id]/page.tsx.
//
// SENGAJA tidak menggantikan tab "Peluang" di /dashboard/brand (list
// kompak yang sudah ada, dengan form lamar inline) -- halaman ini murni
// TAMBAHAN, tampilan lebih lega/promosional (brief lengkap tidak
// terpotong, kartu lebih besar) yang link ke halaman detail per campaign.
// Data & endpoint SAMA PERSIS (listBrandCampaigns) supaya tidak ada dua
// sumber kebenaran -- kartu di sini murni tampilan, aksi "Lamar" tetap di
// halaman detail.
const STATUS_TONE: Record<BrandApplicationStatus, StatusTone> = {
  applied: "info",
  accepted: "success",
  rejected: "danger",
  completed: "neutral",
};

export default function DiscoverCampaignsPage() {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [campaigns, setCampaigns] = useState<BrandCampaign[]>([]);
  const [kind, setKind] = useState<BrandCampaignKind | "">("");

  useEffect(() => {
    listBrandCampaigns("")
      .then(setCampaigns)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.brand.errorGeneric")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (kind === "") return;
    listBrandCampaigns(kind).then(setCampaigns).catch(() => {});
  }, [kind]);

  const statusLabel = (s: BrandApplicationStatus) =>
    ({
      applied: t("dashboard.pages.brand.statusApplied"),
      accepted: t("dashboard.pages.brand.statusAccepted"),
      rejected: t("dashboard.pages.brand.statusRejected"),
      completed: t("dashboard.pages.brand.statusCompleted"),
    })[s];
  const kindLabel = (k: BrandCampaignKind) => (k === "sponsored_link" ? t("dashboard.pages.brand.kindSponsoredLink") : t("dashboard.pages.brand.kindBrandDeal"));
  const feeLabel = (fee: number) => (fee > 0 ? `${t("dashboard.pages.brand.fee")} Rp ${fee.toLocaleString("id-ID")}` : t("dashboard.pages.brand.feeFree"));
  const slotsLabel = (c: BrandCampaign) => t("dashboard.pages.brand.slots").replace("{accepted}", String(c.accepted_count)).replace("{slots}", String(c.slots));

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={[{ label: t("dashboard.pages.brand.discover.backToBrand"), href: "/dashboard/brand" }, { label: t("dashboard.pages.brand.discover.backToList") }]}
        title={t("dashboard.pages.brand.discover.title")}
        description={t("dashboard.pages.brand.discover.subtitle")}
      />

      <div className="flex flex-wrap gap-1.5">
        {([["", t("dashboard.pages.brand.kindAll")], ["sponsored_link", t("dashboard.pages.brand.kindSponsoredLink")], ["brand_deal", t("dashboard.pages.brand.kindBrandDeal")]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold ${kind === k ? "border-jeon-ink bg-jeon-lavender text-[#111111]" : "border-app-border text-app-muted hover:text-app-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {campaigns.map((c) => (
          <Link
            key={c.id}
            href={`/dashboard/brand/campaigns/${c.id}`}
            className="glass flex flex-col gap-2.5 rounded-jmd border-2 border-transparent p-5 shadow-card transition-colors hover:border-jeon-purple"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-jeon-lavender px-2 py-0.5 text-[10px] font-bold text-[#111111]">{kindLabel(c.kind)}</span>
              {c.category && <span className="rounded-full border border-app-border px-2 py-0.5 text-[10px] font-semibold text-app-muted">{c.category}</span>}
              {c.my_application_status && (
                <StatusBadge status={c.my_application_status} tone={STATUS_TONE[c.my_application_status]} label={statusLabel(c.my_application_status)} className="text-[10px]" />
              )}
            </div>
            <p className="text-base font-bold text-app-ink">{c.title}</p>
            <p className="text-xs text-app-muted">
              {t("dashboard.pages.brand.byBrand").replace("{username}", c.brand_username)} &middot; {feeLabel(c.fee_idr)} &middot; {slotsLabel(c)}
            </p>
            {/* brief = HTML rich text sejak 18 September 2026 (brief lama
                plain text tetap benar lewat whitespace-pre-line) -- pola
                sanitize + jeon-rich-text-content sama seperti blok "text"
                di PagePreview.tsx. */}
            {c.brief && (
              <div
                className="jeon-rich-text-content line-clamp-3 whitespace-pre-line text-xs text-app-ink"
                dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(c.brief) }}
              />
            )}
            <span className="mt-auto flex items-center gap-0.5 pt-1 text-xs font-bold text-jeon-purple">
              {t("dashboard.pages.brand.discover.viewDetail")}
              <IconChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
        {campaigns.length === 0 && (
          <div className="sm:col-span-2">
            <EmptyState icon={IconBriefcase} text={t("dashboard.pages.brand.emptyOpportunities")} />
          </div>
        )}
      </div>
    </div>
  );
}
