"use client";

import PageSkeleton from "@/components/Skeleton";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/locale-context";
import PageHeader from "@/components/dashboard/page/PageHeader";
import StatusBadge, { type StatusTone } from "@/components/dashboard/data/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { IconBriefcase, IconPlus } from "@/components/icons";
import {
  ApiError,
  BrandApplicationStatus,
  BrandCampaign,
  BrandCampaignApplication,
  BrandCampaignKind,
  BrandMyApplication,
  applyBrandCampaign,
  createBrandCampaign,
  decideBrandApplication,
  listBrandCampaignApplications,
  listBrandCampaigns,
  listMyBrandApplications,
  listMyBrandCampaigns,
  publishSponsoredLink,
  updateBrandCampaignStatus,
} from "@/lib/api-client";

// Marketplace Brand <-> Kreator (benchmark Linktree "Earn > Sponsored Links"
// & "Brand Deals", 3 September 2026). Tiga tampilan lewat ?view= -- pola
// yang sama dengan Audiens (useSearchParams butuh Suspense, dok Next):
//   opportunities : kreator menjelajah & melamar campaign brand lain
//   applications  : lamaran saya + publikasi tautan bersponsor
//   campaigns     : saya sebagai BRAND -- pasang campaign, putuskan lamaran
// Cakupan MVP: fee informatif, pembayaran di luar platform (lihat catatan
// migrasi 000085) -- ada catatan eksplisit di tampilan brand.
type BrandView = "opportunities" | "applications" | "campaigns";
const VIEWS: BrandView[] = ["opportunities", "applications", "campaigns"];

const STATUS_TONE: Record<BrandApplicationStatus, StatusTone> = {
  applied: "info",
  accepted: "success",
  rejected: "danger",
  completed: "neutral",
};

const INPUT = "mt-1 w-full rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none";

export default function DashboardBrandPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BrandPageInner />
    </Suspense>
  );
}

function BrandPageInner() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const rawView = searchParams.get("view") ?? "opportunities";
  const view: BrandView = (VIEWS as string[]).includes(rawView) ? (rawView as BrandView) : "opportunities";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<BrandCampaign[]>([]);
  const [applications, setApplications] = useState<BrandMyApplication[]>([]);
  const [mine, setMine] = useState<BrandCampaign[]>([]);
  const [kind, setKind] = useState<BrandCampaignKind | "">("");

  const [pitchFor, setPitchFor] = useState<string | null>(null);
  const [pitch, setPitch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ kind: "sponsored_link" as BrandCampaignKind, title: "", brief: "", url: "", category: "", fee_idr: "", slots: "1" });
  const [saving, setSaving] = useState(false);
  const [openApps, setOpenApps] = useState<Record<string, BrandCampaignApplication[] | undefined>>({});

  // Muat awal: tiga daftar sekaligus. setState di dalam .then (pola yang
  // lolos react-hooks/set-state-in-effect di repo ini).
  useEffect(() => {
    Promise.all([listBrandCampaigns(""), listMyBrandApplications(), listMyBrandCampaigns()])
      .then(([c, a, m]) => {
        setCampaigns(c);
        setApplications(a);
        setMine(m);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.brand.errorGeneric")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ganti filter jenis: hanya daftar peluang yang dimuat ulang.
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
  const fail = (err: unknown) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.brand.errorGeneric"));

  async function handleKind(k: BrandCampaignKind | "") {
    setKind(k);
    if (k === "") listBrandCampaigns("").then(setCampaigns).catch(() => {});
  }

  async function handleApply(campaignId: string) {
    setBusyId(campaignId);
    setError(null);
    try {
      const res = await applyBrandCampaign(campaignId, pitch);
      setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, my_application_status: res.status, my_application_id: res.id, applied_count: c.applied_count + 1 } : c)));
      setPitchFor(null);
      setPitch("");
      listMyBrandApplications().then(setApplications).catch(() => {});
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublish(appId: string) {
    setBusyId(appId);
    setError(null);
    try {
      const res = await publishSponsoredLink(appId);
      setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, link_id: res.link_id } : a)));
      showToast(t("dashboard.pages.brand.linkLive"));
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createBrandCampaign({
        kind: form.kind,
        title: form.title,
        brief: form.brief,
        url: form.url,
        category: form.category,
        fee_idr: Number(form.fee_idr) || 0,
        slots: Number(form.slots) || 1,
      });
      setCreating(false);
      setForm({ kind: "sponsored_link", title: "", brief: "", url: "", category: "", fee_idr: "", slots: "1" });
      showToast(t("dashboard.pages.brand.created"));
      listMyBrandCampaigns().then(setMine).catch(() => {});
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(c: BrandCampaign) {
    const next = c.status === "open" ? "closed" : "open";
    setBusyId(c.id);
    try {
      await updateBrandCampaignStatus(c.id, next);
      setMine((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleApps(campaignId: string) {
    if (openApps[campaignId]) {
      setOpenApps((prev) => ({ ...prev, [campaignId]: undefined }));
      return;
    }
    try {
      const apps = await listBrandCampaignApplications(campaignId);
      setOpenApps((prev) => ({ ...prev, [campaignId]: apps }));
    } catch (err) {
      fail(err);
    }
  }

  async function handleDecide(campaignId: string, appId: string, status: "accepted" | "rejected" | "completed") {
    setBusyId(appId);
    try {
      await decideBrandApplication(campaignId, appId, status);
      setOpenApps((prev) => ({ ...prev, [campaignId]: (prev[campaignId] ?? []).map((a) => (a.id === appId ? { ...a, status } : a)) }));
      if (status === "accepted") setMine((prev) => prev.map((c) => (c.id === campaignId ? { ...c, accepted_count: c.accepted_count + 1 } : c)));
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <PageSkeleton />;

  const tabs: { key: BrandView; label: string }[] = [
    { key: "opportunities", label: t("dashboard.pages.brand.tabOpportunities") },
    { key: "applications", label: t("dashboard.pages.brand.tabApplications") },
    { key: "campaigns", label: t("dashboard.pages.brand.tabCampaigns") },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("dashboard.extraPages.brand")}
        description={t("dashboard.pages.brand.subtitle")}
        primaryAction={{
          label: t("dashboard.pages.brand.createCampaign"),
          onClick: () => {
            router.replace("/dashboard/brand?view=campaigns");
            setCreating(true);
          },
          icon: <IconPlus className="h-4 w-4" />,
        }}
      />

      <div className="mb-5 flex items-center gap-1 overflow-x-auto" role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={view === tb.key}
            onClick={() => router.replace(`/dashboard/brand?view=${tb.key}`)}
            className={`relative whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition-colors ${view === tb.key ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"}`}
          >
            {tb.label}
            {view === tb.key && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-jeon-purple" aria-hidden="true" />}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {view === "opportunities" && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {([["", t("dashboard.pages.brand.kindAll")], ["sponsored_link", t("dashboard.pages.brand.kindSponsoredLink")], ["brand_deal", t("dashboard.pages.brand.kindBrandDeal")]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => handleKind(k)}
                aria-pressed={kind === k}
                className={`rounded-full border px-3 py-1 text-[11px] font-bold ${kind === k ? "border-jeon-ink bg-jeon-lavender text-[#111111]" : "border-app-border text-app-muted hover:text-app-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {campaigns.map((c) => (
              <div key={c.id} className="glass rounded-jmd p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-app-ink">{c.title}</p>
                      <span className="rounded-full bg-jeon-lavender px-2 py-0.5 text-[10px] font-bold text-[#111111]">{kindLabel(c.kind)}</span>
                      {c.category && <span className="rounded-full border border-app-border px-2 py-0.5 text-[10px] font-semibold text-app-muted">{c.category}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-app-muted">
                      {t("dashboard.pages.brand.byBrand").replace("{username}", c.brand_username)} &middot; {feeLabel(c.fee_idr)} &middot; {slotsLabel(c)}
                    </p>
                    {c.brief && <p className="mt-2 whitespace-pre-line text-xs text-app-ink">{c.brief}</p>}
                  </div>
                  {c.my_application_status ? (
                    <StatusBadge status={c.my_application_status} tone={STATUS_TONE[c.my_application_status]} label={statusLabel(c.my_application_status)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPitchFor(c.id);
                        setPitch("");
                      }}
                      className="btn-primary flex-shrink-0 rounded-lg px-4 py-2 text-xs font-bold text-white"
                    >
                      {t("dashboard.pages.brand.apply")}
                    </button>
                  )}
                </div>
                {pitchFor === c.id && (
                  <div className="mt-3 border-t border-app-border pt-3">
                    <label className="block text-xs font-semibold text-app-ink">
                      {t("dashboard.pages.brand.pitchLabel")}
                      <textarea value={pitch} onChange={(e) => setPitch(e.target.value)} rows={3} maxLength={2000} placeholder={t("dashboard.pages.brand.pitchPlaceholder")} className={INPUT} />
                    </label>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => handleApply(c.id)} disabled={busyId === c.id} className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
                        {busyId === c.id ? t("dashboard.pages.brand.applying") : t("dashboard.pages.brand.sendApplication")}
                      </button>
                      <button type="button" onClick={() => setPitchFor(null)} className="rounded-lg border border-app-border px-4 py-2 text-xs font-semibold text-app-ink">
                        {t("dashboard.pages.brand.cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {campaigns.length === 0 && <EmptyState icon={IconBriefcase} text={t("dashboard.pages.brand.emptyOpportunities")} />}
          </div>
        </>
      )}

      {view === "applications" && (
        <div className="flex flex-col gap-3">
          {applications.map((a) => (
            <div key={a.id} className="glass rounded-jmd p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-app-ink">{a.campaign.title}</p>
                    <span className="rounded-full bg-jeon-lavender px-2 py-0.5 text-[10px] font-bold text-[#111111]">{kindLabel(a.campaign.kind)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-app-muted">
                    {t("dashboard.pages.brand.byBrand").replace("{username}", a.campaign.brand_username)} &middot; {feeLabel(a.campaign.fee_idr)} &middot; {new Date(a.created_at).toLocaleDateString("id-ID")}
                  </p>
                </div>
                <StatusBadge status={a.status} tone={STATUS_TONE[a.status]} label={statusLabel(a.status)} />
              </div>
              {a.status === "accepted" && a.campaign.kind === "sponsored_link" && (
                <div className="mt-3 border-t border-app-border pt-3">
                  {a.link_id ? (
                    <p className="text-xs font-semibold text-app-ink">{t("dashboard.pages.brand.linkLive")}</p>
                  ) : (
                    <>
                      <p className="text-xs text-app-muted">{t("dashboard.pages.brand.publishHint")}</p>
                      <button type="button" onClick={() => handlePublish(a.id)} disabled={busyId === a.id} className="btn-primary mt-2 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
                        {busyId === a.id ? t("dashboard.pages.brand.publishing") : t("dashboard.pages.brand.publishLink")}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {applications.length === 0 && <EmptyState icon={IconBriefcase} text={t("dashboard.pages.brand.emptyApplications")} />}
        </div>
      )}

      {view === "campaigns" && (
        <>
          <p className="rounded-lg bg-pop-yellow/40 px-3 py-2 text-xs text-app-ink">{t("dashboard.pages.brand.feeNote")}</p>
          {creating && (
            <form onSubmit={handleCreate} className="glass mt-4 flex flex-col gap-3 rounded-jmd p-4 shadow-card">
              <p className="text-sm font-bold text-app-ink">{t("dashboard.pages.brand.createTitle")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-app-ink">
                  {t("dashboard.pages.brand.fieldKind")}
                  <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as BrandCampaignKind })} className={INPUT}>
                    <option value="sponsored_link">{t("dashboard.pages.brand.kindSponsoredLink")}</option>
                    <option value="brand_deal">{t("dashboard.pages.brand.kindBrandDeal")}</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-app-ink">
                  {t("dashboard.pages.brand.fieldTitle")}
                  <input required minLength={3} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={INPUT} />
                </label>
              </div>
              <label className="text-xs font-semibold text-app-ink">
                {t("dashboard.pages.brand.fieldBrief")}
                <textarea rows={3} maxLength={3000} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} placeholder={t("dashboard.pages.brand.fieldBriefPlaceholder")} className={INPUT} />
              </label>
              <label className="text-xs font-semibold text-app-ink">
                {t("dashboard.pages.brand.fieldUrl")}
                <input type="url" required={form.kind === "sponsored_link"} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" className={INPUT} />
                <span className="mt-1 block text-[11px] font-normal text-app-muted">{t("dashboard.pages.brand.fieldUrlHint")}</span>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold text-app-ink">
                  {t("dashboard.pages.brand.fieldCategory")}
                  <input maxLength={60} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={INPUT} />
                </label>
                <label className="text-xs font-semibold text-app-ink">
                  {t("dashboard.pages.brand.fieldFee")}
                  <input type="number" min={0} step={1000} value={form.fee_idr} onChange={(e) => setForm({ ...form, fee_idr: e.target.value })} className={INPUT} />
                </label>
                <label className="text-xs font-semibold text-app-ink">
                  {t("dashboard.pages.brand.fieldSlots")}
                  <input type="number" min={1} max={100} value={form.slots} onChange={(e) => setForm({ ...form, slots: e.target.value })} className={INPUT} />
                </label>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
                  {saving ? t("dashboard.pages.brand.saving") : t("dashboard.pages.brand.save")}
                </button>
                <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-app-border px-4 py-2 text-xs font-semibold text-app-ink">
                  {t("dashboard.pages.brand.cancel")}
                </button>
              </div>
            </form>
          )}
          <div className="mt-4 flex flex-col gap-3">
            {mine.map((c) => (
              <div key={c.id} className="glass rounded-jmd p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-app-ink">{c.title}</p>
                      <span className="rounded-full bg-jeon-lavender px-2 py-0.5 text-[10px] font-bold text-[#111111]">{kindLabel(c.kind)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.status === "open" ? "bg-jeon-lime text-[#111111]" : "border border-app-border text-app-muted"}`}>{c.status === "open" ? t("dashboard.pages.brand.campaignOpen") : t("dashboard.pages.brand.campaignClosed")}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-app-muted">
                      {feeLabel(c.fee_idr)} &middot; {slotsLabel(c)}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button type="button" onClick={() => toggleApps(c.id)} className="rounded-lg border border-app-border px-3 py-1.5 text-[11px] font-semibold text-app-ink hover:border-jeon-purple">
                      {openApps[c.id] ? t("dashboard.pages.brand.hideApplications") : t("dashboard.pages.brand.viewApplications").replace("{count}", String(c.applied_count))}
                    </button>
                    <button type="button" onClick={() => handleToggleStatus(c)} disabled={busyId === c.id} className="rounded-lg border border-app-border px-3 py-1.5 text-[11px] font-semibold text-app-ink hover:border-jeon-purple disabled:opacity-60">
                      {c.status === "open" ? t("dashboard.pages.brand.close") : t("dashboard.pages.brand.reopen")}
                    </button>
                  </div>
                </div>
                {openApps[c.id] && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-app-border pt-3">
                    {(openApps[c.id] ?? []).map((a) => (
                      <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-app-surface-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-bold text-app-ink">@{a.creator_username}</p>
                            <StatusBadge status={a.status} tone={STATUS_TONE[a.status]} label={statusLabel(a.status)} className="text-[10px]" />
                            {c.kind === "sponsored_link" && (a.status === "accepted" || a.status === "completed") && (
                              <span className="text-[10px] text-app-muted">{a.link_id ? t("dashboard.pages.brand.linkPublished") : t("dashboard.pages.brand.linkPending")}</span>
                            )}
                          </div>
                          {a.pitch && <p className="mt-1 whitespace-pre-line text-xs text-app-ink">{a.pitch}</p>}
                        </div>
                        <div className="flex flex-shrink-0 gap-1.5">
                          {a.status === "applied" && (
                            <>
                              <button type="button" onClick={() => handleDecide(c.id, a.id, "accepted")} disabled={busyId === a.id} className="btn-primary rounded-md px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-60">
                                {t("dashboard.pages.brand.accept")}
                              </button>
                              <button type="button" onClick={() => handleDecide(c.id, a.id, "rejected")} disabled={busyId === a.id} className="rounded-md border border-app-border px-2.5 py-1 text-[11px] font-semibold text-app-ink disabled:opacity-60">
                                {t("dashboard.pages.brand.reject")}
                              </button>
                            </>
                          )}
                          {a.status === "accepted" && (
                            <button type="button" onClick={() => handleDecide(c.id, a.id, "completed")} disabled={busyId === a.id} className="rounded-md border border-app-border px-2.5 py-1 text-[11px] font-semibold text-app-ink disabled:opacity-60">
                              {t("dashboard.pages.brand.complete")}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {(openApps[c.id] ?? []).length === 0 && <p className="text-xs text-app-muted">{t("dashboard.pages.brand.noApplications")}</p>}
                  </div>
                )}
              </div>
            ))}
            {mine.length === 0 && !creating && (
              <EmptyState icon={IconBriefcase} text={t("dashboard.pages.brand.emptyCampaigns")} ctaLabel={t("dashboard.pages.brand.createCampaign")} onCtaClick={() => setCreating(true)} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
