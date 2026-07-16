"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  DashboardProduct,
  createProduct,
  deleteProduct,
  getProductDownloadURL,
  listProducts,
  updateProduct,
  uploadProductFile,
} from "@/lib/api-client";
import { IconBox, IconInbox } from "@/components/icons";

export default function DashboardProductsPage() {
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [priceIDR, setPriceIDR] = useState("");

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    listProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat produk."))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      setError("Nama produk wajib diisi dan harga minimal Rp1.000.");
      return;
    }
    setError(null);
    try {
      const created = await createProduct({ name, price_idr: price });
      setProducts((prev) => [
        ...prev,
        { id: created.id, name, description: "", price_idr: price, is_active: false, has_file: false },
      ]);
      setName("");
      setPriceIDR("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat produk.");
    }
  }

  async function handleUpload(product: DashboardProduct, file: File) {
    setError(null);
    setBusyId(product.id);
    try {
      await uploadProductFile(product.id, file);
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, has_file: true } : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah file.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActive(product: DashboardProduct) {
    if (!product.has_file && !product.is_active) {
      setError("Unggah file dulu sebelum mengaktifkan produk.");
      return;
    }
    const nextActive = !product.is_active;
    setError(null);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: nextActive } : p)));
    try {
      await updateProduct(product.id, { is_active: nextActive });
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: product.is_active } : p)));
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status produk.");
    }
  }

  async function handleDelete(id: string) {
    const previous = products;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    try {
      await deleteProduct(id);
    } catch (err) {
      setProducts(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus produk.");
    }
  }

  async function handleGetDownloadLink(id: string) {
    setError(null);
    try {
      const { download_url } = await getProductDownloadURL(id);
      window.open(download_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat tautan unduhan.");
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Produk</h1>
      <p className="mt-1 text-sm text-muted">
        Unggah file (pdf/zip/epub/mp4/mp3/mov/gambar, maks 100MB) sebelum mengaktifkan produk.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-card">
        <ul className="flex flex-col gap-2">
          {products.map((p) => (
            <li key={p.id} className="rounded-xl border border-border px-4 py-3 transition-colors hover:border-primary/30">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                    <IconBox className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                    <p className="text-xs text-muted">Rp {p.price_idr.toLocaleString("id-ID")}</p>
                  </div>
                </div>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    p.is_active ? "bg-secondary-subtle text-secondary-dark" : "bg-gray-100 text-muted"
                  }`}
                >
                  {p.is_active ? "Aktif" : "Belum aktif"}
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 font-semibold text-muted">
                  <input
                    type="checkbox"
                    checked={p.is_active}
                    onChange={() => handleToggleActive(p)}
                    className="h-4 w-4"
                  />
                  Aktif
                </label>

                <input
                  ref={(el) => {
                    fileInputRefs.current[p.id] = el;
                  }}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(p, file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => fileInputRefs.current[p.id]?.click()}
                  className="font-semibold text-primary hover:underline disabled:opacity-50"
                >
                  {busyId === p.id ? "Mengunggah..." : p.has_file ? "Ganti file" : "Unggah file"}
                </button>

                {p.has_file && (
                  <button
                    type="button"
                    onClick={() => handleGetDownloadLink(p.id)}
                    className="font-semibold text-secondary-dark hover:underline"
                  >
                    Lihat file
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  className="font-semibold text-red-600 hover:underline"
                >
                  Hapus
                </button>
              </div>
            </li>
          ))}
          {products.length === 0 && (
            <li className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
              <IconInbox className="h-4 w-4 flex-shrink-0" />
              Belum ada produk -- buat yang pertama di bawah ini.
            </li>
          )}
        </ul>

        <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Nama produk"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="number"
            placeholder="Harga (IDR)"
            min={1000}
            value={priceIDR}
            onChange={(e) => setPriceIDR(e.target.value)}
            className="w-40 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button type="submit" className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white">
            Buat
          </button>
        </form>
      </section>
    </div>
  );
}
