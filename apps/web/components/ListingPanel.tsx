"use client";

import { useState } from "react";
import { ApiError, DashboardProduct, reorderProducts, updateProduct } from "@/lib/api-client";
import { IconBox, IconGripVertical, IconStar } from "@/components/icons";

// Modul Toko (Fase E2, tab Listing): urutan tampil (drag-and-drop, pola
// SAMA seperti dashboard/links/page.tsx handleDrop) & unggulan. Controlled
// oleh parent (products/page.tsx) -- products/setProducts sudah jadi
// sumber kebenaran untuk tab Manage Items juga, dipakai ulang di sini
// supaya kedua tab selalu sinkron tanpa fetch ganda.
export default function ListingPanel({
  products,
  setProducts,
  onError,
}: {
  products: DashboardProduct[];
  setProducts: (updater: (prev: DashboardProduct[]) => DashboardProduct[]) => void;
  onError: (message: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);

  // sorted -- urutan TAMPIL (unggulan dulu, lalu position ASC), SAMA
  // seperti backend (List query, GetPublicPage) -- daftar di tab ini harus
  // mencerminkan persis apa yang pengunjung lihat di halaman publik.
  const sorted = [...products].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    return a.position - b.position;
  });

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = sorted.findIndex((p) => p.id === dragId);
    const to = sorted.findIndex((p) => p.id === targetId);
    if (from === -1 || to === -1) return;

    const reordered = [...sorted];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withPositions = reordered.map((p, idx) => ({ id: p.id, position: idx }));
    setDragId(null);

    setProducts((prev) =>
      prev.map((p) => {
        const found = withPositions.find((w) => w.id === p.id);
        return found ? { ...p, position: found.position } : p;
      })
    );

    reorderProducts(withPositions).catch((err) => {
      onError(err instanceof ApiError ? err.message : "Gagal menyimpan urutan produk.");
    });
  }

  async function handleToggleFeatured(product: DashboardProduct) {
    const next = !product.is_featured;
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_featured: next } : p)));
    try {
      await updateProduct(product.id, { is_featured: next });
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_featured: product.is_featured } : p)));
      onError(err instanceof ApiError ? err.message : "Gagal memperbarui status unggulan.");
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-muted">
        Seret untuk mengatur urutan tampil di halaman publik. Produk unggulan selalu tampil paling atas.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {sorted.map((p) => (
          <div
            key={p.id}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(p.id)}
            className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-card"
          >
            <span className="cursor-grab text-muted" title="Seret untuk mengatur urutan">
              <IconGripVertical className="h-4 w-4" />
            </span>
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-subtle">
              {p.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.cover_image_url} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <IconBox className="h-4 w-4 text-primary/40" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
              {p.category && <p className="text-[11px] text-muted">{p.category}</p>}
            </div>
            <button
              type="button"
              onClick={() => handleToggleFeatured(p)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                p.is_featured ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border text-muted hover:border-primary"
              }`}
            >
              <IconStar className="h-3.5 w-3.5" />
              {p.is_featured ? "Unggulan" : "Jadikan Unggulan"}
            </button>
          </div>
        ))}
        {sorted.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">Belum ada produk.</p>}
      </div>
    </div>
  );
}
