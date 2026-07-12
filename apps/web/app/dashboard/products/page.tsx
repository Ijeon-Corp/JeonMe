"use client";

import { useEffect, useState } from "react";
import { ApiError, DashboardProduct, createProduct, listProducts } from "@/lib/api-client";

export default function DashboardProductsPage() {
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [priceIDR, setPriceIDR] = useState("");

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
      setProducts((prev) => [...prev, { id: created.id, name, price_idr: price, is_active: false }]);
      setName("");
      setPriceIDR("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat produk.");
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Produk</h1>
      <p className="mt-1 text-sm text-muted">
        Unggah file &amp; aktivasi produk otomatis belum tersedia (menunggu integrasi object storage
        di Sprint 2) — produk baru dibuat non-aktif.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="mt-6 rounded-2xl border border-border bg-white p-5">
        <ul className="flex flex-col gap-2">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">{p.name}</p>
                <p className="text-xs text-muted">Rp {p.price_idr.toLocaleString("id-ID")}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  p.is_active ? "bg-secondary-subtle text-secondary-dark" : "bg-gray-100 text-muted"
                }`}
              >
                {p.is_active ? "Aktif" : "Belum aktif"}
              </span>
            </li>
          ))}
          {products.length === 0 && <p className="text-sm text-muted">Belum ada produk.</p>}
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
