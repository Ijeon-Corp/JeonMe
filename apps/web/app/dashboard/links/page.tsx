"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  DashboardProduct,
  LinkItem,
  MyPage,
  createLink,
  deleteLink,
  getMyPage,
  listLinks,
  listProducts,
  reorderLinks,
  updateLink,
} from "@/lib/api-client";
import { IconInbox } from "@/components/icons";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import Toggle from "@/components/Toggle";

export default function DashboardLinksPage() {
  const [page, setPage] = useState<MyPage | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newURL, setNewURL] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyPage(), listLinks(), listProducts()])
      .then(([p, l, prod]) => {
        setPage(p);
        setLinks(l);
        setProducts(prod);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data."))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreateLink(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newURL.trim()) return;
    try {
      const created = await createLink({ title: newTitle, url: newURL });
      setLinks((prev) => [...prev, created]);
      setNewTitle("");
      setNewURL("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat tautan.");
    }
  }

  async function handleToggleActive(link: LinkItem) {
    const nextActive = !link.is_active;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_active: nextActive } : l)));
    try {
      await updateLink(link.id, { is_active: nextActive });
    } catch (err) {
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_active: link.is_active } : l)));
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui tautan.");
    }
  }

  async function handleDelete(id: string) {
    const previous = links;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteLink(id);
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus tautan.");
    }
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = links.findIndex((l) => l.id === dragId);
    const to = links.findIndex((l) => l.id === targetId);
    if (from === -1 || to === -1) return;

    const reordered = [...links];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withPositions = reordered.map((l, idx) => ({ ...l, position: idx }));
    setLinks(withPositions);
    setDragId(null);

    reorderLinks(withPositions.map((l) => ({ id: l.id, position: l.position }))).catch((err) => {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan urutan tautan.");
    });
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div className="max-w-2xl">
        <h1 className="font-heading text-2xl font-bold text-ink">Tautan</h1>
        <p className="mt-1 text-sm text-muted">Seret untuk mengubah urutan. Nonaktifkan tanpa menghapus lewat sakelar.</p>

        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <section className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-card">
          <ul className="flex flex-col gap-2">
            {links.map((link) => (
              <li
                key={link.id}
                draggable
                onDragStart={() => setDragId(link.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(link.id)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  link.is_active ? "border-border bg-white" : "border-border bg-gray-50 opacity-60"
                }`}
              >
                <span className="cursor-grab text-lg leading-none text-muted" aria-hidden>
                  ⠿
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{link.title}</p>
                  <p className="truncate text-xs text-muted">{link.url}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Toggle
                    checked={link.is_active}
                    onChange={() => handleToggleActive(link)}
                    label={`Aktifkan ${link.title}`}
                  />
                  <span className="text-xs font-semibold text-muted">Aktif</span>
                </div>
                <button
                  onClick={() => handleDelete(link.id)}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Hapus
                </button>
              </li>
            ))}
            {links.length === 0 && (
              <li className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
                <IconInbox className="h-4 w-4 flex-shrink-0" />
                Belum ada tautan -- tambahkan yang pertama di bawah ini.
              </li>
            )}
          </ul>

          <form onSubmit={handleCreateLink} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              required
              placeholder="Judul tautan"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <input
              type="url"
              required
              placeholder="https://..."
              value={newURL}
              onChange={(e) => setNewURL(e.target.value)}
              className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button type="submit" className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white">
              Tambah
            </button>
          </form>
        </section>
      </div>

      <LivePreviewPanel page={page} links={links} products={products} />
    </div>
  );
}
