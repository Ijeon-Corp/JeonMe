"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/lib/locale-context";
import { dashRedesignEnabled } from "@/lib/dashboard-flags";
import PageHeader from "@/components/dashboard/page/PageHeader";
import {
  ApiError,
  DashboardProduct,
  DashboardVoucher,
  createVoucher,
  deleteVoucher,
  listProducts,
  listVouchers,
  updateVoucher,
} from "@/lib/api-client";
import { IconTag,
  IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";
import { confirmDelete } from "@/lib/confirm";

type Mode = "single" | "bulk";

export default function DashboardVouchersPage() {
  const { t } = useLocale();
  // v2 (SPEC §15.4, Phase 6, flag "marketing"): manager header + chips
  // filter kedaluwarsa -- voucher expired tidak lagi memenuhi list utama.
  // nowTs diambil SAAT FETCH (bukan render; aturan react-hooks impure).
  const marketingV2 = dashRedesignEnabled("marketing");
  const [expFilter, setExpFilter] = useState<"all" | "active" | "expired">(marketingV2 ? "active" : "all");
  const [nowTs, setNowTs] = useState(0);
  const [vouchers, setVouchers] = useState<DashboardVoucher[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<Mode>("single");
  const [code, setCode] = useState("");
  const [batchLabel, setBatchLabel] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [maxDiscountIDR, setMaxDiscountIDR] = useState("");
  const [minPurchaseIDR, setMinPurchaseIDR] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([listVouchers(), listProducts()])
      .then(([v, p]) => {
        setNowTs(Date.now());
        setVouchers(v);
        setProducts(p);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.vouchers.errors.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setCode("");
    setBatchLabel("");
    setQuantity("10");
    setDiscountType("percentage");
    setDiscountValue("");
    setMaxDiscountIDR("");
    setMinPurchaseIDR("");
    setMaxUses("");
    setExpiresAt("");
    setProductIds([]);
    setMode("single");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(discountValue);
    if (!value || value <= 0) {
      setError(t("dashboard.pages.vouchers.errors.discountValueRequired"));
      return;
    }
    if (mode === "bulk" && !batchLabel.trim()) {
      setError(t("dashboard.pages.vouchers.errors.batchLabelRequired"));
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await createVoucher({
        code: mode === "single" ? code.trim() || undefined : undefined,
        batch_label: batchLabel.trim() || undefined,
        quantity: mode === "bulk" ? Number(quantity) || 1 : 1,
        discount_type: discountType,
        discount_value: value,
        max_discount_idr: maxDiscountIDR ? Number(maxDiscountIDR) : undefined,
        min_purchase_idr: minPurchaseIDR ? Number(minPurchaseIDR) : undefined,
        max_uses: mode === "single" && maxUses ? Number(maxUses) : undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        product_ids: productIds.length > 0 ? productIds : undefined,
      });
      const refreshed = await listVouchers();
      setVouchers(refreshed);
      resetForm();
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.vouchers.errors.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(voucher: DashboardVoucher) {
    const nextActive = !voucher.is_active;
    setVouchers((prev) => prev.map((v) => (v.id === voucher.id ? { ...v, is_active: nextActive } : v)));
    try {
      await updateVoucher(voucher.id, { is_active: nextActive });
    } catch (err) {
      setVouchers((prev) => prev.map((v) => (v.id === voucher.id ? { ...v, is_active: voucher.is_active } : v)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.vouchers.errors.updateFailed"));
    }
  }

  async function handleDelete(voucher: DashboardVoucher) {
    if (!(await confirmDelete(t("dashboard.pages.vouchers.confirmDeleteText").replace("{code}", voucher.code)))) return;
    const previous = vouchers;
    setVouchers((prev) => prev.filter((v) => v.id !== voucher.id));
    setBusyId(voucher.id);
    try {
      await deleteVoucher(voucher.id);
    } catch (err) {
      setVouchers(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.vouchers.errors.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  const isExpired = (v: DashboardVoucher) => Boolean(v.expires_at && nowTs > 0 && new Date(v.expires_at).getTime() < nowTs);

  const grouped = useMemo(() => {
    const singles: DashboardVoucher[] = [];
    const batches = new Map<string, DashboardVoucher[]>();
    const source =
      expFilter === "all" ? vouchers : vouchers.filter((v) => (expFilter === "expired" ? isExpired(v) : !isExpired(v)));
    for (const v of source) {
      if (v.batch_label) {
        const list = batches.get(v.batch_label) ?? [];
        list.push(v);
        batches.set(v.batch_label, list);
      } else {
        singles.push(v);
      }
    }
    return { singles, batches };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vouchers, expFilter, nowTs]);

  function productNames(ids: string[]) {
    if (ids.length === 0) return t("dashboard.pages.vouchers.allProducts");
    return ids
      .map((id) => products.find((p) => p.id === id)?.name ?? id)
      .join(", ");
  }

  function discountLabel(v: DashboardVoucher) {
    return v.discount_type === "percentage" ? `${v.discount_value}%` : `Rp ${v.discount_value.toLocaleString("id-ID")}`;
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      {marketingV2 ? (
        <PageHeader
          title={t("dashboard.extraPages.vouchers")}
          description={t("dashboard.pages.vouchers.subtitle")}
          primaryAction={{ label: t("dashboard.pages.vouchers.createButton"), onClick: () => setAdding(true), icon: <IconPlus className="h-4 w-4" /> }}
        />
      ) : (
        <p className="mt-1 text-sm text-app-muted">
          {t("dashboard.pages.vouchers.subtitle")}
        </p>
      )}

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {(!marketingV2 || adding) && (
      <div className="glass mt-6 rounded-jlg p-5 shadow-card">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm font-bold text-jeon-purple hover:underline"
          >
            <IconPlus className="h-4 w-4" />
            {t("dashboard.pages.vouchers.createButton")}
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`flex-1 rounded-lg border py-2 text-xs font-bold transition-colors ${
                  mode === "single" ? "border-jeon-purple bg-jeon-purple/10 text-jeon-purple" : "border-app-border text-app-muted"
                }`}
              >
                {t("dashboard.pages.vouchers.modeSingle")}
              </button>
              <button
                type="button"
                onClick={() => setMode("bulk")}
                className={`flex-1 rounded-lg border py-2 text-xs font-bold transition-colors ${
                  mode === "bulk" ? "border-jeon-purple bg-jeon-purple/10 text-jeon-purple" : "border-app-border text-app-muted"
                }`}
              >
                {t("dashboard.pages.vouchers.modeBulk")}
              </button>
            </div>

            {mode === "single" ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.vouchers.codeLabel")}</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={t("dashboard.pages.vouchers.codePlaceholder")}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm uppercase focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.vouchers.batchLabelLabel")}</label>
                  <input
                    type="text"
                    required
                    value={batchLabel}
                    onChange={(e) => setBatchLabel(e.target.value)}
                    placeholder={t("dashboard.pages.vouchers.batchLabelPlaceholder")}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.vouchers.quantityLabel")}</label>
                  <input
                    type="number"
                    required
                    min={2}
                    max={200}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.vouchers.discountTypeLabel")}</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                >
                  <option value="percentage">{t("dashboard.pages.vouchers.discountTypePercentage")}</option>
                  <option value="fixed">{t("dashboard.pages.vouchers.discountTypeFixed")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-ink">
                  {discountType === "percentage" ? t("dashboard.pages.vouchers.discountValuePercent") : t("dashboard.pages.vouchers.discountValueFixed")}
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={discountType === "percentage" ? 100 : undefined}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {discountType === "percentage" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.vouchers.maxDiscountLabel")}</label>
                  <input
                    type="number"
                    min={1}
                    value={maxDiscountIDR}
                    onChange={(e) => setMaxDiscountIDR(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.vouchers.minPurchaseLabel")}</label>
                <input
                  type="number"
                  min={0}
                  value={minPurchaseIDR}
                  onChange={(e) => setMinPurchaseIDR(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </div>
              {mode === "single" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.vouchers.maxUsesLabel")}</label>
                  <input
                    type="number"
                    min={1}
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    placeholder={t("dashboard.pages.vouchers.maxUsesPlaceholder")}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.vouchers.expiresLabel")}</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-app-ink">
                {t("dashboard.pages.vouchers.applicableProductsLabel")}
              </label>
              <div className="flex flex-col gap-1.5 rounded-lg border border-app-border p-3">
                {products.length === 0 && <p className="text-xs text-app-muted">{t("dashboard.pages.vouchers.noProducts")}</p>}
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs text-app-ink">
                    <input
                      type="checkbox"
                      checked={productIds.includes(p.id)}
                      onChange={(e) =>
                        setProductIds((prev) =>
                          e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                        )
                      }
                      className="h-3.5 w-3.5 accent-jeon-purple"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  resetForm();
                }}
                className="flex-1 rounded-lg border border-app-border py-2 text-xs font-bold text-app-muted hover:border-ink/30"
              >
                {t("dashboard.pages.vouchers.cancel")}
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? t("dashboard.pages.vouchers.creating") : t("dashboard.pages.vouchers.createButton")}
              </button>
            </div>
          </form>
        )}
      </div>
      )}

      {marketingV2 && (
        <div className="mt-6 flex flex-wrap items-center gap-1.5" role="group" aria-label={t("dashboard.pages.vouchers.expiryFilterLabel")}>
          {([
            { key: "active" as const, label: t("dashboard.pages.vouchers.filterActive") },
            { key: "expired" as const, label: t("dashboard.pages.vouchers.filterExpired") },
            { key: "all" as const, label: t("dashboard.pages.vouchers.filterAll") },
          ]).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setExpFilter(f.key)}
              aria-pressed={expFilter === f.key}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                expFilter === f.key
                  ? "border-jeon-purple bg-jeon-purple/10 text-jeon-purple"
                  : "border-app-border text-app-muted hover:border-jeon-purple/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className={`${marketingV2 ? "mt-3" : "mt-6"} flex flex-col gap-3`}>
        {grouped.singles.map((v) => (
          <VoucherRow
            key={v.id}
            voucher={v}
            subtitle={productNames(v.product_ids)}
            discountLabel={discountLabel(v)}
            busy={busyId === v.id}
            onToggle={() => handleToggleActive(v)}
            onDelete={() => handleDelete(v)}
          />
        ))}

        {Array.from(grouped.batches.entries()).map(([label, list]) => {
          const usedTotal = list.reduce((sum, v) => sum + v.used_count, 0);
          return (
            <div key={label} className="glass rounded-jmd p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-app-ink">{label}</p>
                <p className="text-xs font-semibold text-app-muted">
                  {usedTotal}/{list.length} {t("dashboard.pages.vouchers.codesUsedLabel")} &middot; {discountLabel(list[0])}
                </p>
              </div>
              <p className="mt-1 text-xs text-app-muted">{productNames(list[0].product_ids)}</p>
              <div className="mt-3 flex flex-col gap-2">
                {list.map((v) => (
                  <VoucherRow
                    key={v.id}
                    voucher={v}
                    compact
                    busy={busyId === v.id}
                    onToggle={() => handleToggleActive(v)}
                    onDelete={() => handleDelete(v)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {vouchers.length === 0 && (
          <EmptyState
            icon={IconTag}
            accent="lime"
            title={t("dashboard.pages.vouchers.emptyTitle")}
            text={t("dashboard.pages.vouchers.emptyVouchers")}
            ctaLabel={t("dashboard.pages.vouchers.createButton")}
            onCtaClick={() => setAdding(true)}
          />
        )}
      </div>
    </div>
  );
}

function VoucherRow({
  voucher,
  subtitle,
  discountLabel,
  compact,
  busy,
  onToggle,
  onDelete,
}: {
  voucher: DashboardVoucher;
  subtitle?: string;
  discountLabel?: string;
  compact?: boolean;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        compact ? "border-app-border/60 bg-jeon-purple/5" : "border-app-border bg-app-surface shadow-card"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-mono text-sm font-bold text-app-ink">{voucher.code}</p>
          {discountLabel && <span className="text-xs font-bold text-jeon-purple">{discountLabel}</span>}
        </div>
        {subtitle && <p className="truncate text-xs text-app-muted">{subtitle}</p>}
        <p className="text-[11px] text-app-muted">
          {voucher.used_count}
          {voucher.max_uses ? `/${voucher.max_uses}` : ""} {t("dashboard.pages.vouchers.usedLabel")}
          {voucher.expires_at ? ` · ${t("dashboard.pages.vouchers.validUntilLabel")} ${new Date(voucher.expires_at).toLocaleDateString("id-ID")}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Toggle checked={voucher.is_active} onChange={onToggle} label={t("dashboard.pages.vouchers.activateAria").replace("{code}", voucher.code)} />
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          title={t("dashboard.pages.vouchers.deleteTitle")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          <IconTrash className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
