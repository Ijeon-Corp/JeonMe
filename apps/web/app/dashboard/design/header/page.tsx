"use client";

import PageSkeleton from "@/components/Skeleton";
import { useState } from "react";
import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import { ApiError, MyPage, uploadAvatar } from "@/lib/api-client";

// LAYOUT_OPTIONS -- permintaan langsung pengguna, 13 Agustus 2026: "buat
// saja yang penting semua kebutuhan terpenuhi untuk membuat new layout
// tersebut" (susulan "tambahkan model baru hero dan featured link") --
// layout_variant SEBELUMNYA cuma bisa diisi lewat Quick Setup (tidak ada
// UI manual sama sekali untuk mengubahnya di luar itu), jadi "Hero" (yang
// justru butuh foto profil diisi dulu supaya kelihatan efeknya) tidak
// mungkin dipakai kreator tanpa pemilih manual di sini. Diletakkan di
// halaman Header (bukan section terpisah) karena layout_variant murni
// soal susunan avatar/nama/bio -- persis isi panel ini. Pratinjau visual
// PER PILIHAN sengaja tidak dibuat -- LivePreviewPanel di kanan (lihat
// DesignPageShell) sudah otomatis menampilkan hasil sungguhan begitu
// dipilih, tidak perlu mockup statis ganda.
const LAYOUT_OPTIONS: { value: MyPage["layout_variant"]; label: string; description: string }[] = [
  { value: "centered", label: "Centered", description: "Avatar besar di tengah -- gaya klasik, bawaan." },
  { value: "banner", label: "Banner", description: "Avatar kecil rata kiri, sebaris dengan nama." },
  { value: "card", label: "Card", description: "Identitas dibungkus kartu, avatar menonjol di tepi atas." },
  { value: "spotlight", label: "Spotlight", description: "Avatar besar, nama di dalam badge bulat." },
  { value: "cover", label: "Cover", description: "Pita warna di atas ala foto sampul." },
  { value: "minimal", label: "Minimal", description: "Avatar kecil sebaris nama, konten jadi fokus." },
  { value: "hero", label: "Hero", description: "Foto profil tampil besar edge-to-edge sebagai latar. Isi Foto Profil dulu supaya efeknya terlihat." },
  { value: "polaroid", label: "Polaroid", description: "Avatar kotak dibingkai putih & dimiringkan ala foto polaroid." },
];

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

      <section className="glass mt-4 flex flex-col gap-4 rounded-3xl p-5 shadow-card">
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

      <section className="glass mt-4 flex flex-col gap-3 rounded-3xl p-5 shadow-card">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink">Layout</label>
          <p className="text-[11px] text-muted">Susunan avatar, nama, dan bio di bagian atas halaman publikmu.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setPage({ ...page, layout_variant: opt.value });
                handlePageSettingChange({ layout_variant: opt.value });
              }}
              className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors ${
                page.layout_variant === opt.value ? "border-primary bg-primary-subtle" : "border-border bg-white hover:border-primary/50"
              }`}
            >
              <span className="text-xs font-bold text-ink">{opt.label}</span>
              <span className="text-[10px] leading-snug text-muted">{opt.description}</span>
            </button>
          ))}
        </div>
      </section>
    </DesignPageShell>
  );
}
