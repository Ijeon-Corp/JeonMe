"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/locale-context";
import { dashRedesignEnabled } from "@/lib/dashboard-flags";
import PageHeader from "@/components/dashboard/page/PageHeader";
import {
  ApiError,
  DashboardProduct,
  MyAffiliate,
  AffiliateProgram,
  listAffiliatePrograms,
  listMyAffiliates,
  listProducts,
  removeAffiliateCommission,
  revokeAffiliate,
  upsertAffiliate,
} from "@/lib/api-client";
import { IconUsers,
  IconCopy, IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import { confirmDelete } from "@/lib/confirm";

export default function DashboardAffiliatesPage() {
  const { t } = useLocale();
  // v2 (SPEC §15.6, Phase 6, flag "marketing"): dua perspektif dipisah TAB
  // (Program Saya | Afiliasi yang Saya Ikuti) menggantikan dua daftar
  // panjang bertumpuk tanpa hierarchy. Data/mutasi tak berubah.
  const marketingV2 = dashRedesignEnabled("marketing");
  const [affTab, setAffTab] = useState<"program" | "joined">("program");
  const [affiliates, setAffiliates] = useState<MyAffiliate[]>([]);
  const [programs, setPrograms] = useState<AffiliateProgram[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [productId, setProductId] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("10");

  function loadAll() {
    return Promise.all([listMyAffiliates(), listAffiliatePrograms(), listProducts()]).then(
      ([a, p, prod]) => {
        setAffiliates(a);
        setPrograms(p);
        setProducts(prod);
      }
    );
  }

  useEffect(() => {
    loadAll()
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.affiliates.errors.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  function handleCopy(url: string, code: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1800);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const percent = Number(commissionPercent);
    if (!email.trim() || !productId || !percent || percent <= 0 || percent > 100) {
      setError(t("dashboard.pages.affiliates.errors.formInvalid"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await upsertAffiliate({ affiliate_email: email.trim(), product_id: productId, commission_percent: percent });
      await loadAll();
      setEmail("");
      setProductId("");
      setCommissionPercent("10");
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.affiliates.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(affiliateId: string, email: string) {
    if (
      !(await confirmDelete(t("dashboard.pages.affiliates.confirmRevokeText").replace("{email}", email), {
        confirmButtonText: t("dashboard.pages.affiliates.confirmRevokeButton"),
      }))
    )
      return;
    try {
      await revokeAffiliate(affiliateId);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.affiliates.errors.revokeFailed"));
    }
  }

  async function handleRemoveCommission(affiliateId: string, productId: string) {
    try {
      await removeAffiliateCommission(affiliateId, productId);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.affiliates.errors.removeCommissionFailed"));
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      {marketingV2 ? (
        <>
          <PageHeader
            title={t("dashboard.extraPages.affiliates")}
            description={t("dashboard.pages.affiliates.subtitle")}
            primaryAction={{ label: t("dashboard.pages.affiliates.inviteButton"), onClick: () => { setAffTab("program"); setAdding(true); }, icon: <IconPlus className="h-4 w-4" /> }}
          />
          <div className="mb-5 flex items-center gap-1 border-b border-app-border pb-px">
            {([
              { key: "program" as const, label: t("dashboard.pages.affiliates.tabProgram") },
              { key: "joined" as const, label: t("dashboard.pages.affiliates.myAffiliationsHeading") },
            ]).map((tb) => (
              <button
                key={tb.key}
                type="button"
                role="tab"
                aria-selected={affTab === tb.key}
                onClick={() => setAffTab(tb.key)}
                className={`relative whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition-colors ${
                  affTab === tb.key ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"
                }`}
              >
                {tb.label}
                {affTab === tb.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-jeon-purple" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-app-muted">
          {t("dashboard.pages.affiliates.subtitle")}
        </p>
      )}

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {(!marketingV2 || affTab === "program") && (
      <>
      <div className="glass mt-6 rounded-jlg p-5 shadow-card">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm font-bold text-jeon-purple hover:underline"
          >
            <IconPlus className="h-4 w-4" />
            {t("dashboard.pages.affiliates.inviteButton")}
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.affiliates.emailLabel")}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("dashboard.pages.affiliates.emailPlaceholder")}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
              <p className="mt-1 text-[11px] text-app-muted">{t("dashboard.pages.affiliates.emailHint")}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.affiliates.productLabel")}</label>
              <select
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              >
                <option value="">{t("dashboard.pages.affiliates.productPlaceholder")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Rp {p.price_idr.toLocaleString("id-ID")})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.affiliates.commissionLabel")}</label>
              <input
                type="number"
                required
                min={0.01}
                max={100}
                step={0.01}
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(e.target.value)}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="flex-1 rounded-lg border border-app-border py-2 text-xs font-bold text-app-muted hover:border-ink/30"
              >
                {t("dashboard.pages.affiliates.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {saving ? t("dashboard.pages.affiliates.saving") : t("dashboard.pages.affiliates.save")}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {affiliates.map((a) => (
          <div key={a.id} className="glass rounded-jmd p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-app-ink">{a.affiliate_email}</p>
              <button
                type="button"
                onClick={() => handleRevoke(a.id, a.affiliate_email)}
                title={t("dashboard.pages.affiliates.revokeTitle")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-jeon-purple/10 px-3 py-1.5">
              <p className="min-w-0 flex-1 truncate text-xs text-app-ink">
                {a.referral_base_url}?ref={a.referral_code}
              </p>
              <button
                type="button"
                onClick={() => handleCopy(`${a.referral_base_url}?ref=${a.referral_code}`, a.referral_code)}
                className="flex flex-shrink-0 items-center gap-1 rounded-md border-2 border-jeon-ink bg-app-surface px-2 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple"
              >
                <IconCopy className="h-3 w-3" />
                {copiedCode === a.referral_code ? t("dashboard.pages.affiliates.copied") : t("dashboard.pages.affiliates.copy")}
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              {a.commissions.map((c) => (
                <div key={c.product_id} className="flex items-center justify-between text-xs">
                  <span className="text-app-ink">{c.product_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-jeon-purple">{c.commission_percent}%</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCommission(a.id, c.product_id)}
                      title={t("dashboard.pages.affiliates.removeCommissionTitle")}
                      className="text-app-muted hover:text-red-600"
                    >
                      <IconTrash className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              {a.commissions.length === 0 && <p className="text-xs text-app-muted">{t("dashboard.pages.affiliates.noCommissions")}</p>}
            </div>
          </div>
        ))}

        {affiliates.length === 0 && (
          <EmptyState
            icon={IconUsers}
            accent="lavender"
            title={t("dashboard.pages.affiliates.emptyTitle")}
            text={t("dashboard.pages.affiliates.emptyAffiliates")}
            ctaLabel={t("dashboard.pages.affiliates.inviteButton")}
            onCtaClick={() => setAdding(true)}
          />
        )}
      </div>
      </>
      )}

      {(!marketingV2 || affTab === "joined") && (
      <>
      {!marketingV2 && (
        <>
          <h2 className="mt-10 font-display text-lg font-bold text-app-ink">{t("dashboard.pages.affiliates.myAffiliationsHeading")}</h2>
          <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.affiliates.myAffiliationsSubtitle")}</p>
        </>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {programs.map((p) => (
          <div key={p.id} className="glass rounded-jmd p-4 shadow-card">
            <p className="text-sm font-bold text-app-ink">@{p.creator_username}</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-jeon-purple/10 px-3 py-1.5">
              <p className="min-w-0 flex-1 truncate text-xs text-app-ink">{p.referral_url}</p>
              <button
                type="button"
                onClick={() => handleCopy(p.referral_url, p.referral_code)}
                className="flex flex-shrink-0 items-center gap-1 rounded-md border-2 border-jeon-ink bg-app-surface px-2 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple"
              >
                <IconCopy className="h-3 w-3" />
                {copiedCode === p.referral_code ? t("dashboard.pages.affiliates.copied") : t("dashboard.pages.affiliates.copy")}
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              {p.commissions.map((c) => (
                <div key={c.product_id} className="flex items-center justify-between text-xs">
                  <span className="text-app-ink">{c.product_name}</span>
                  <span className="font-bold text-jeon-purple">{c.commission_percent}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {programs.length === 0 && <EmptyState text={t("dashboard.pages.affiliates.emptyPrograms")} />}
      </div>
      </>
      )}
    </div>
  );
}
