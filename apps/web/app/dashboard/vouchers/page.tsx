"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useMemo, useState } from "react";
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
import { IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";
import { confirmDelete } from "@/lib/confirm";

type Mode = "single" | "bulk";

export default function DashboardVouchersPage() {
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
        setVouchers(v);
        setProducts(p);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat voucher."))
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
      setError("Nilai diskon wajib diisi.");
      return;
    }
    if (mode === "bulk" && !batchLabel.trim()) {
      setError("Nama batch wajib diisi untuk generate kode massal.");
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
      setError(err instanceof ApiError ? err.message : "Gagal membuat voucher.");
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
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui voucher.");
    }
  }

  async function handleDelete(voucher: DashboardVoucher) {
    if (!(await confirmDelete(`Hapus kode voucher "${voucher.code}"? Aksi ini tidak bisa dibatalkan.`))) return;
    const previous = vouchers;
    setVouchers((prev) => prev.filter((v) => v.id !== voucher.id));
    setBusyId(voucher.id);
    try {
      await deleteVoucher(voucher.id);
    } catch (err) {
      setVouchers(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus voucher.");
    } finally {
      setBusyId(null);
    }
  }

  const grouped = useMemo(() => {
    const singles: DashboardVoucher[] = [];
    const batches = new Map<string, DashboardVoucher[]>();
    for (const v of vouchers) {
      if (v.batch_label) {
        const list = batches.get(v.batch_label) ?? [];
        list.push(v);
        batches.set(v.batch_label, list);
      } else {
        singles.push(v);
      }
    }
    return { singles, batches };
  }, [vouchers]);

  function productNames(ids: string[]) {
    if (ids.length === 0) return "Semua produk";
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
      <p className="mt-1 text-sm text-muted">
        Buat kode diskon untuk produkmu -- kode tunggal (dipakai berkali-kali) atau generate banyak kode sekali pakai
        untuk afiliasi/influencer.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="glass mt-6 rounded-2xl p-5 shadow-card">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            <IconPlus className="h-4 w-4" />
            Buat Voucher
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`flex-1 rounded-lg border py-2 text-xs font-bold transition-colors ${
                  mode === "single" ? "border-primary bg-primary-subtle text-primary" : "border-border text-muted"
                }`}
              >
                Kode Tunggal
              </button>
              <button
                type="button"
                onClick={() => setMode("bulk")}
                className={`flex-1 rounded-lg border py-2 text-xs font-bold transition-colors ${
                  mode === "bulk" ? "border-primary bg-primary-subtle text-primary" : "border-border text-muted"
                }`}
              >
                Generate Massal
              </button>
            </div>

            {mode === "single" ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Kode (kosongkan untuk acak)</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="DISKON10"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm uppercase focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Nama Batch</label>
                  <input
                    type="text"
                    required
                    value={batchLabel}
                    onChange={(e) => setBatchLabel(e.target.value)}
                    placeholder="Afiliasi Oktober"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Jumlah Kode (maks 200)</label>
                  <input
                    type="number"
                    required
                    min={2}
                    max={200}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Tipe Diskon</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="percentage">Persentase (%)</option>
                  <option value="fixed">Nominal (Rp)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">
                  Nilai Diskon {discountType === "percentage" ? "(%)" : "(Rp)"}
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={discountType === "percentage" ? 100 : undefined}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {discountType === "percentage" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Maks. Diskon (Rp, opsional)</label>
                  <input
                    type="number"
                    min={1}
                    value={maxDiscountIDR}
                    onChange={(e) => setMaxDiscountIDR(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Min. Pembelian (Rp, opsional)</label>
                <input
                  type="number"
                  min={0}
                  value={minPurchaseIDR}
                  onChange={(e) => setMinPurchaseIDR(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {mode === "single" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Batas Pemakaian (opsional)</label>
                  <input
                    type="number"
                    min={1}
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    placeholder="Tak terbatas"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Kedaluwarsa (opsional)</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">
                Berlaku untuk produk (kosongkan = semua produk)
              </label>
              <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                {products.length === 0 && <p className="text-xs text-muted">Belum ada produk.</p>}
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      checked={productIds.includes(p.id)}
                      onChange={(e) =>
                        setProductIds((prev) =>
                          e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                        )
                      }
                      className="h-3.5 w-3.5 accent-primary"
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
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:border-ink/30"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? "Membuat..." : "Buat Voucher"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
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
            <div key={label} className="glass rounded-2xl p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-ink">{label}</p>
                <p className="text-xs font-semibold text-muted">
                  {usedTotal}/{list.length} kode terpakai &middot; {discountLabel(list[0])}
                </p>
              </div>
              <p className="mt-1 text-xs text-muted">{productNames(list[0].product_ids)}</p>
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

        {vouchers.length === 0 && <EmptyState text='Belum ada voucher -- klik "Buat Voucher" di atas untuk membuat yang pertama.' />}
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
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        compact ? "border-border/60 bg-primary-subtle/20" : "border-border bg-white shadow-card"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-mono text-sm font-bold text-ink">{voucher.code}</p>
          {discountLabel && <span className="text-xs font-bold text-secondary-dark">{discountLabel}</span>}
        </div>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        <p className="text-[11px] text-muted">
          {voucher.used_count}
          {voucher.max_uses ? `/${voucher.max_uses}` : ""} dipakai
          {voucher.expires_at ? ` · berlaku sampai ${new Date(voucher.expires_at).toLocaleDateString("id-ID")}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Toggle checked={voucher.is_active} onChange={onToggle} label={`Aktifkan ${voucher.code}`} />
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          title="Hapus voucher"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          <IconTrash className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
