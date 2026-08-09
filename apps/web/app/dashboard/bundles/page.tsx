"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import {
  ApiError,
  DashboardBundle,
  DashboardProduct,
  createBundle,
  deleteProduct,
  listBundles,
  listProducts,
  updateProduct,
} from "@/lib/api-client";
import { IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";
import { confirmDelete } from "@/lib/confirm";

export default function DashboardBundlesPage() {
  const [bundles, setBundles] = useState<DashboardBundle[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [priceIDR, setPriceIDR] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([listBundles(), listProducts()])
      .then(([b, p]) => {
        setBundles(b);
        setProducts(p);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat bundel."))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setName("");
    setPriceIDR("");
    setProductIds([]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      setError("Nama bundel wajib diisi dan harga minimal Rp1.000.");
      return;
    }
    if (productIds.length < 2) {
      setError("Pilih minimal 2 produk untuk dijadikan bundel.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await createBundle({ name, price_idr: price, product_ids: productIds });
      const refreshed = await listBundles();
      setBundles(refreshed);
      resetForm();
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat bundel.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(bundle: DashboardBundle) {
    const nextActive = !bundle.is_active;
    setBundles((prev) => prev.map((b) => (b.id === bundle.id ? { ...b, is_active: nextActive } : b)));
    try {
      await updateProduct(bundle.id, { is_active: nextActive });
    } catch (err) {
      setBundles((prev) => prev.map((b) => (b.id === bundle.id ? { ...b, is_active: bundle.is_active } : b)));
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status bundel.");
    }
  }

  async function handleDelete(bundle: DashboardBundle) {
    if (!(await confirmDelete(`Hapus bundel "${bundle.name}"? Aksi ini tidak bisa dibatalkan.`))) return;
    const previous = bundles;
    setBundles((prev) => prev.filter((b) => b.id !== bundle.id));
    setBusyId(bundle.id);
    try {
      await deleteProduct(bundle.id);
    } catch (err) {
      setBundles(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus bundel.");
    } finally {
      setBusyId(null);
    }
  }

  const eligibleProducts = products.filter((p) => p.is_active);

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mt-1 text-sm text-muted">
        Gabungkan beberapa produk aktif jadi satu paket dengan harga lebih murah dari jumlah aslinya.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="glass mt-6 rounded-3xl p-5 shadow-card">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            <IconPlus className="h-4 w-4" />
            Buat Bundel
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Nama Bundel</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Paket Lengkap"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Harga Bundel (Rp)</label>
              <input
                type="number"
                required
                min={1000}
                value={priceIDR}
                onChange={(e) => setPriceIDR(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Pilih minimal 2 produk aktif</label>
              <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                {eligibleProducts.length === 0 && (
                  <p className="text-xs text-muted">Belum ada produk aktif -- aktifkan produk dulu di halaman Produk.</p>
                )}
                {eligibleProducts.map((p) => (
                  <label key={p.id} className="flex items-center justify-between gap-2 text-xs text-ink">
                    <span className="flex items-center gap-2">
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
                    </span>
                    <span className="text-muted">Rp {p.price_idr.toLocaleString("id-ID")}</span>
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
                {creating ? "Membuat..." : "Buat Bundel"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {bundles.map((b) => (
          <div key={b.id} className="glass rounded-2xl p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink">{b.name}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted line-through">Rp {b.original_total_idr.toLocaleString("id-ID")}</span>
                <span className="text-sm font-bold text-secondary-dark">Rp {b.price_idr.toLocaleString("id-ID")}</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted">{b.item_names.join(", ")}</p>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Toggle checked={b.is_active} onChange={() => handleToggleActive(b)} label={`Aktifkan ${b.name}`} />
                <span className="text-xs font-semibold text-muted">Aktif</span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(b)}
                disabled={busyId === b.id}
                title="Hapus bundel"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {bundles.length === 0 && <EmptyState text='Belum ada bundel -- klik "Buat Bundel" di atas untuk membuat yang pertama.' />}
      </div>
    </div>
  );
}
