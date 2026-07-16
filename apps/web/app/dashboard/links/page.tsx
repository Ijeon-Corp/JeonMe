"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  DashboardProduct,
  LinkItem,
  MyPage,
  THEME_PRESETS,
  createLink,
  deleteLink,
  getMyPage,
  listLinks,
  listProducts,
  reorderLinks,
  updateLink,
  updateMyPage,
  uploadAvatar,
} from "@/lib/api-client";
import { PAGE_THEMES } from "@/lib/page-themes";
import { IconExternal, IconInbox } from "@/components/icons";
import PagePreview from "@/components/PagePreview";
import PhoneFrame from "@/components/PhoneFrame";

export default function DashboardLinksPage() {
  const [page, setPage] = useState<MyPage | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newURL, setNewURL] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

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
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div className="max-w-2xl">
        <h1 className="font-heading text-2xl font-bold text-ink">Tautan & Halaman</h1>
        {error && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {page && (
          <section className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-bold text-ink">Pengaturan Halaman</h2>
              <a
                href={`https://jeonme.com/${page.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <IconExternal className="h-3.5 w-3.5" />
                jeonme.com/{page.username}
              </a>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${page.is_published ? "bg-secondary" : "bg-muted"}`} />
              <span className={`text-xs font-semibold ${page.is_published ? "text-secondary-dark" : "text-muted"}`}>
                {page.is_published ? "Sudah terbit" : "Belum terbit"}
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-5">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">Foto Profil</label>
                <div className="flex items-center gap-4">
                  {page.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={page.avatar_url}
                      alt={page.username}
                      className="h-16 w-16 rounded-full object-cover ring-2 ring-primary-subtle"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle font-heading text-lg font-bold text-primary">
                      {page.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <label className="cursor-pointer rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary">
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
                <label className="mb-1.5 block text-sm font-semibold text-ink">Bio (maks 160 karakter)</label>
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
                <label className="mb-1.5 block text-sm font-semibold text-ink">Tema Halaman</label>
                <div className="flex flex-wrap gap-2.5">
                  {THEME_PRESETS.map((theme) => {
                    const meta = PAGE_THEMES[theme];
                    const active = page.theme === theme;
                    return (
                      <button
                        key={theme}
                        type="button"
                        onClick={() => handlePageSettingChange({ theme })}
                        className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-xs font-semibold transition-all ${
                          active
                            ? "border-primary bg-primary-subtle text-primary shadow-card"
                            : "border-border text-muted hover:border-primary/50 hover:text-ink"
                        }`}
                      >
                        <span
                          className="h-5 w-5 flex-shrink-0 rounded-full ring-2 ring-white shadow-sm"
                          style={{ backgroundColor: meta.swatch }}
                          aria-hidden
                        />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={page.is_published}
                  onChange={(e) => handlePageSettingChange({ is_published: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                Terbitkan halaman publik
              </label>
            </div>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-card">
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
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <input
                    type="checkbox"
                    checked={link.is_active}
                    onChange={() => handleToggleActive(link)}
                    className="h-4 w-4 accent-primary"
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

      <div className="mt-8 lg:sticky lg:top-6 lg:mt-0">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Pratinjau Langsung</p>
          {page && (
            <a
              href={`https://jeonme.com/${page.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <IconExternal className="h-3.5 w-3.5" />
              Buka
            </a>
          )}
        </div>
        {page && (
          <PhoneFrame>
            <PagePreview
              interactive={false}
              rootClassName="min-h-full"
              data={{
                username: page.username,
                bio: page.bio,
                avatarUrl: page.avatar_url,
                theme: page.theme,
                links: links.filter((l) => l.is_active),
                products: products
                  .filter((p) => p.is_active)
                  .map((p) => ({ id: p.id, name: p.name, price_idr: p.price_idr, cover_image_url: p.cover_image_url })),
              }}
            />
          </PhoneFrame>
        )}
        <p className="mt-3 text-center text-[11px] text-muted">
          Menampilkan tautan &amp; produk yang aktif, persis seperti yang dilihat pengunjung.
        </p>
      </div>
    </div>
  );
}
