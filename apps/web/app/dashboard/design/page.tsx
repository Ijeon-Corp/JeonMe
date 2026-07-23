"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  DashboardProduct,
  LinkItem,
  MyPage,
  THEME_PRESETS,
  getMyPage,
  listLinks,
  listProducts,
  updateMyPage,
  uploadAvatar,
} from "@/lib/api-client";
import { PAGE_THEMES } from "@/lib/page-themes";
import { IconExternal } from "@/components/icons";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import Toggle from "@/components/Toggle";

export default function DashboardDesignPage() {
  const [page, setPage] = useState<MyPage | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div className="max-w-2xl">
        <h1 className="font-heading text-2xl font-bold text-ink">Desain</h1>
        <p className="mt-1 text-sm text-muted">Foto profil, bio, tema, dan status terbit halaman publikmu.</p>

        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

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

              <div className="flex items-center gap-2">
                <Toggle
                  checked={page.is_published}
                  onChange={() => handlePageSettingChange({ is_published: !page.is_published })}
                  label="Terbitkan halaman publik"
                />
                <span className="text-sm font-semibold text-ink">Terbitkan halaman publik</span>
              </div>
            </div>
          </section>
        )}
      </div>

      <LivePreviewPanel page={page} links={links} products={products} />
    </div>
  );
}
