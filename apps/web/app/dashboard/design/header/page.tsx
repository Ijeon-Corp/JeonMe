"use client";

import PageSkeleton from "@/components/Skeleton";
import { useState } from "react";
import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import { ApiError, uploadAvatar } from "@/lib/api-client";

export default function DesignHeaderPage() {
  const { page, setPage, links, products, loading, error, setError, handlePageSettingChange } = useDesignData();
  const [avatarUploading, setAvatarUploading] = useState(false);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
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

  if (loading || !page) return <PageSkeleton />;

  return (
    <DesignPageShell
      page={page}
      links={links}
      products={products}
      backHref="/dashboard/design"
      title="Header"
      description="Foto profil, nama tampilan, dan bio yang muncul di bagian atas halaman publikmu."
    >
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="glass mt-4 flex flex-col gap-4 rounded-2xl p-5 shadow-card">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Foto Profil</label>
          <div className="flex items-center gap-3">
            {page.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.avatar_url} alt={page.username} className="h-12 w-12 rounded-full object-cover ring-2 ring-white" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle font-heading text-base font-bold text-primary">
                {page.username.slice(0, 1).toUpperCase()}
              </div>
            )}
            <label className="cursor-pointer rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-primary hover:text-primary">
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
          <label className="mb-1.5 block text-xs font-semibold text-ink">Nama Tampilan</label>
          <input
            type="text"
            maxLength={100}
            placeholder={page.username}
            value={page.display_name}
            onChange={(e) => setPage({ ...page, display_name: e.target.value })}
            onBlur={(e) => handlePageSettingChange({ display_name: e.target.value })}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-muted">Tampil sebagai judul profil di halaman publik. Kosongkan untuk memakai username ({page.username}).</p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Bio (maks 160 karakter)</label>
          <textarea
            maxLength={160}
            value={page.bio}
            onChange={(e) => setPage({ ...page, bio: e.target.value })}
            onBlur={(e) => handlePageSettingChange({ bio: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </section>
    </DesignPageShell>
  );
}
