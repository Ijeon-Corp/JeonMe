"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  LinkItem,
  MyPage,
  THEME_PRESETS,
  createLink,
  deleteLink,
  getMyPage,
  listLinks,
  reorderLinks,
  updateLink,
  updateMyPage,
  uploadAvatar,
} from "@/lib/api-client";

export default function DashboardLinksPage() {
  const [page, setPage] = useState<MyPage | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newURL, setNewURL] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    Promise.all([getMyPage(), listLinks()])
      .then(([p, l]) => {
        setPage(p);
        setLinks(l);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data."))
      .finally(() => setLoading(false));
  }, []);

  async function handlePageSettingChange(patch: Partial<Pick<MyPage, "theme" | "bio" | "is_published">>) {
    if (!page) return;
    const previous = page;
    setPage({ ...page, ...patch });
    try {
      await updateMyPage(patch);
    } catch (err) {
      setPage(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan halaman.");
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // supaya pilih file yang sama lagi tetap memicu onChange
    if (!file || !page) return;

    setAvatarUploading(true);
    try {
      const { avatar_url } = await uploadAvatar(file);
      setPage({ ...page, avatar_url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah foto profil.");
    } finally {
      setAvatarUploading(false);
    }
  }

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
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Tautan & Halaman</h1>
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {page && (
        <section className="mt-6 rounded-2xl border border-border bg-white p-5">
          <h2 className="font-heading text-lg font-bold text-ink">Pengaturan Halaman</h2>
          <p className="text-sm text-muted">
            jeonme.com/{page.username} —{" "}
            <span className={page.is_published ? "font-semibold text-secondary-dark" : "font-semibold text-muted"}>
              {page.is_published ? "Sudah terbit" : "Belum terbit"}
            </span>
          </p>

          <div className="mt-4 flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink">Foto Profil</label>
              <div className="flex items-center gap-4">
                {page.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={page.avatar_url}
                    alt={page.username}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle text-xs text-muted">
                    Belum ada
                  </div>
                )}
                <label className="cursor-pointer rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-ink hover:border-primary hover:text-primary">
                  {avatarUploading ? "Mengunggah..." : "Ganti Foto"}
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={handleAvatarChange}
                    disabled={avatarUploading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-ink">Bio (maks 160 karakter)</label>
              <textarea
                maxLength={160}
                value={page.bio}
                onChange={(e) => setPage({ ...page, bio: e.target.value })}
                onBlur={(e) => handlePageSettingChange({ bio: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-ink">Tema</label>
              <div className="flex flex-wrap gap-2">
                {THEME_PRESETS.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => handlePageSettingChange({ theme })}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                      page.theme === theme
                        ? "border-primary bg-primary text-white"
                        : "border-border text-muted hover:border-primary hover:text-primary"
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={page.is_published}
                onChange={(e) => handlePageSettingChange({ is_published: e.target.checked })}
                className="h-4 w-4"
              />
              Terbitkan halaman publik
            </label>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-heading text-lg font-bold text-ink">Tautan</h2>
        <p className="mb-4 text-sm text-muted">Seret untuk mengubah urutan. Nonaktifkan tanpa menghapus lewat sakelar.</p>

        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li
              key={link.id}
              draggable
              onDragStart={() => setDragId(link.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(link.id)}
              className={`flex items-center gap-3 rounded-xl border border-border px-4 py-3 ${
                link.is_active ? "bg-white" : "bg-gray-50 opacity-60"
              }`}
            >
              <span className="cursor-grab text-muted" aria-hidden>
                ⠿
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{link.title}</p>
                <p className="truncate text-xs text-muted">{link.url}</p>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={link.is_active}
                  onChange={() => handleToggleActive(link)}
                  className="h-4 w-4"
                />
                Aktif
              </label>
              <button
                onClick={() => handleDelete(link.id)}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                Hapus
              </button>
            </li>
          ))}
          {links.length === 0 && <p className="text-sm text-muted">Belum ada tautan.</p>}
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
  );
}
