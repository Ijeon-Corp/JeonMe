"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, MyPage, getMyPage, updateMyPage } from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconChevronRight } from "@/components/icons";
import Toggle from "@/components/Toggle";

// SettingsSeoPage -- permintaan langsung pengguna, 12 Agustus 2026
// (referensi tangkapan layar panel "SEO and discoverability" Linktree):
// "tambahkan ini juga di settings dan seo yang ada di page desain di
// hilangkan" -- PEMINDAHAN, bukan fitur baru: seo_title/seo_description/
// noindex SUDAH ada sepenuhnya di backend (updateMyPage) sejak sebelumnya,
// sebelumnya cuma bisa disunting dari satu section di /dashboard/design
// (dihapus di commit yang sama, lihat catatan di sana). Field "About this
// account" pada referensi SENGAJA TIDAK direplikasi -- itu field terpisah
// di Linktree, tapi di Jeonme `bio` SUDAH merangkap fungsi yang sama
// (tampil di bawah avatar DAN jadi fallback deskripsi SEO, lihat
// placeholder Deskripsi SEO di bawah) -- menambah field baru untuk itu
// cuma duplikasi tanpa kebutuhan baru yang jelas.
//
// Badge "Pro" pada referensi SENGAJA TIDAK direplikasi -- fitur ini
// SUDAH bisa dipakai kreator gratis di Jeonme sebelumnya (tidak ada
// disabled={!page.is_premium} di section SEO lama, beda dari watermark
// yang memang sudah premium-gated), memindahkan lokasinya bukan alasan
// untuk diam-diam mengubahnya jadi fitur berbayar.
export default function SettingsSeoPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState<MyPage | null>(null);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [noindex, setNoindex] = useState(false);

  useEffect(() => {
    getMyPage()
      .then((p) => {
        setPage(p);
        setSeoTitle(p.seo_title);
        setSeoDescription(p.seo_description);
        setNoindex(p.noindex);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengaturan SEO."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateMyPage({ seo_title: seoTitle, seo_description: seoDescription, noindex });
      showToast("Pengaturan SEO berhasil disimpan.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan SEO.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleNoindex() {
    const next = !noindex;
    setNoindex(next);
    try {
      await updateMyPage({ noindex: next });
      showToast(next ? "Halaman disembunyikan dari mesin pencari." : "Halaman kembali terlihat di mesin pencari.");
    } catch (err) {
      setNoindex(!next);
      showToast(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan.", "error");
    }
  }

  if (loading || !page) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/settings" className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-primary">
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        Pengaturan
      </Link>

      <h1 className="mt-3 font-heading text-2xl font-bold text-ink">SEO</h1>
      <p className="mt-1 text-sm text-muted">
        Kontrol judul/deskripsi yang tampil di hasil pencarian & saat dibagikan, plus opsi menyembunyikan halaman dari
        mesin pencari.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="glass mt-6 flex flex-col gap-5 rounded-3xl p-5 shadow-card">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Judul SEO (maks 70 karakter)</label>
          <input
            type="text"
            maxLength={70}
            value={seoTitle}
            placeholder={`@${page.username} — Jeonme`}
            onChange={(e) => setSeoTitle(e.target.value)}
            className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Deskripsi SEO (maks 160 karakter)</label>
          <textarea
            maxLength={160}
            value={seoDescription}
            placeholder={page.bio || `Lihat semua tautan dan produk @${page.username} di Jeonme.`}
            onChange={(e) => setSeoDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <div>
            <p className="text-sm font-bold text-ink">Sembunyikan dari Mesin Pencari</p>
            <p className="mt-0.5 text-xs text-muted">Menambahkan tag noindex supaya halamanmu tidak masuk hasil pencarian.</p>
          </div>
          <Toggle checked={noindex} onChange={handleToggleNoindex} label="Sembunyikan dari mesin pencari" />
        </div>

        <button type="submit" disabled={saving} className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {saving ? "Menyimpan..." : "Simpan"}
        </button>
      </form>
    </div>
  );
}
