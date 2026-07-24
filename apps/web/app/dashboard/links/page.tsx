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

  // No.78 (Sprint 9): penjadwalan tautan -- pola sama persis seperti
  // penjadwalan flash sale produk (No.68).
  const [scheduleEditId, setScheduleEditId] = useState<string | null>(null);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

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

  function openScheduleForm(link: LinkItem) {
    setScheduleEditId(link.id);
    setScheduleStart(link.starts_at ? link.starts_at.slice(0, 16) : "");
    setScheduleEnd(link.ends_at ? link.ends_at.slice(0, 16) : "");
  }

  async function handleSaveSchedule(link: LinkItem) {
    if (!scheduleStart || !scheduleEnd) {
      setError("Waktu mulai dan berakhir jadwal wajib diisi.");
      return;
    }
    const startsAt = new Date(scheduleStart).toISOString();
    const endsAt = new Date(scheduleEnd).toISOString();
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError("Waktu berakhir jadwal harus setelah waktu mulai.");
      return;
    }
    setError(null);
    setSavingSchedule(true);
    try {
      await updateLink(link.id, { starts_at: startsAt, ends_at: endsAt });
      const refreshed = await listLinks();
      setLinks(refreshed);
      setScheduleEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menjadwalkan tautan.");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleClearSchedule(link: LinkItem) {
    setError(null);
    try {
      await updateLink(link.id, { clear_schedule: true });
      const refreshed = await listLinks();
      setLinks(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membatalkan jadwal.");
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
                className={`flex flex-col gap-2 rounded-xl border px-4 py-3 transition-colors ${
                  link.is_active ? "border-border bg-white" : "border-border bg-gray-50 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
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
                </div>

                {scheduleEditId === link.id ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                    <div className="flex gap-1.5">
                      <input
                        type="datetime-local"
                        value={scheduleStart}
                        onChange={(e) => setScheduleStart(e.target.value)}
                        className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                      />
                      <input
                        type="datetime-local"
                        value={scheduleEnd}
                        onChange={(e) => setScheduleEnd(e.target.value)}
                        className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setScheduleEditId(null)}
                        className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={savingSchedule}
                        onClick={() => handleSaveSchedule(link)}
                        className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        {savingSchedule ? "Menyimpan..." : "Simpan"}
                      </button>
                    </div>
                  </div>
                ) : link.starts_at && link.ends_at ? (
                  <div className="flex items-center justify-between rounded-lg bg-accent-subtle px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-accent-dark">
                      Terjadwal {new Date(link.starts_at).toLocaleString("id-ID")} s/d{" "}
                      {new Date(link.ends_at).toLocaleString("id-ID")}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleClearSchedule(link)}
                      className="text-[11px] font-bold text-red-600 hover:underline"
                    >
                      Batalkan
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openScheduleForm(link)}
                    className="self-start text-[11px] font-bold text-primary hover:underline"
                  >
                    Jadwalkan tampil/sembunyi
                  </button>
                )}
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
