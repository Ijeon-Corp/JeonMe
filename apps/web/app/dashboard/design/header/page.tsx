"use client";

import Image from "next/image";

import PageSkeleton from "@/components/Skeleton";
import { useState } from "react";
import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import { ApiError, EMPTY_PROFILE_EXTRAS, MyPage, updateMyPageProfileExtras, uploadAvatar } from "@/lib/api-client";
import ProfileExtrasEditor from "@/components/dashboard/page/ProfileExtrasEditor";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

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
// Revisi 20 Agustus 2026 (permintaan langsung pengguna): "saya mau
// tambahkan jadi total 15 layout yang berbeda ambil referensi dari web
// serupa dan buat unik dan sesuai dengan kategorinya" -- 7 opsi baru
// ditambah (split/ticket/headline/ribbon/duo/masthead/portrait), lihat
// catatan lengkap tiap varian di renderBioHeader (PagePreview.tsx).
//
// Modul Pilihan Bahasa (29 Agustus 2026): label & description SEBELUMNYA
// ditulis langsung di array ini -- dipindah ke dictionaries.ts
// (dashboard.pages.designHeader.layouts.<value>.{label,description}),
// diambil lewat t() pakai `value` sebagai bagian key dinamis. Array ini
// sekarang cuma daftar value (kode, BUKAN teks tampilan) supaya urutan
// render tetap terjaga.
const LAYOUT_VALUES: MyPage["layout_variant"][] = [
  "centered",
  "banner",
  "card",
  "spotlight",
  "cover",
  "minimal",
  "hero",
  "polaroid",
  "split",
  "ticket",
  "headline",
  "ribbon",
  "duo",
  "masthead",
  "portrait",
  "profile",
  "billboard",
];

export default function DesignHeaderPage() {
  const { t } = useLocale();
  const { page, setPage, links, products, loading, error, setError, handlePageSettingChange } = useDesignData();
  useErrorToast(error);
  const [avatarUploading, setAvatarUploading] = useState(false);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !page) return;

    setAvatarUploading(true);
    try {
      const { avatar_url } = await uploadAvatar(file);
      // Updater, BUKAN { ...page } -- perbaikan 24 September 2026 (audit
      // kualitas kode). `page` di sini snapshot dari SEBELUM await, padahal
      // input Nama & Bio di halaman yang sama TIDAK dikunci selama unggahan
      // (konversi WebP foto besar bisa beberapa detik). Kreator yang
      // mengetik nama/bio baru sambil menunggu melihat ketikannya kembali
      // ke nilai lama begitu unggahan selesai.
      setPage((prev) => (prev ? { ...prev, avatar_url } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.designHeader.uploadError"));
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
      title={t("dashboard.pages.designHeader.title")}
      description={t("dashboard.pages.designHeader.description")}
    >

      <section className="glass mt-4 flex flex-col gap-4 rounded-jlg p-5 shadow-card">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.pages.designHeader.photoLabel")}</label>
          <div className="flex items-center gap-3">
            {page.avatar_url ? (
              // Ukuran TETAP 48px (h-12 w-12).
              <Image src={page.avatar_url} alt={page.username} width={48} height={48} className="h-12 w-12 rounded-full object-cover ring-2 ring-white" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-jeon-purple/10 font-display text-base font-bold text-jeon-purple">
                {page.username.slice(0, 1).toUpperCase()}
              </div>
            )}
            <label className="cursor-pointer rounded-lg border-2 border-jeon-ink bg-app-surface px-3 py-1.5 text-xs font-semibold text-app-ink transition-colors hover:border-jeon-purple hover:text-jeon-purple">
              {avatarUploading ? t("dashboard.pages.designHeader.uploading") : t("dashboard.pages.designHeader.changePhoto")}
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
          <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.pages.designHeader.displayNameLabel")}</label>
          <input
            type="text"
            maxLength={100}
            placeholder={page.username}
            value={page.display_name}
            onChange={(e) => setPage({ ...page, display_name: e.target.value })}
            onBlur={(e) => handlePageSettingChange({ display_name: e.target.value })}
            className="w-full rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-app-muted">{t("dashboard.pages.designHeader.displayNameHelp").replace("{username}", page.username)}</p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.pages.designHeader.bioLabel")}</label>
          <textarea
            maxLength={160}
            value={page.bio}
            onChange={(e) => setPage({ ...page, bio: e.target.value })}
            onBlur={(e) => handlePageSettingChange({ bio: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
          />
        </div>
      </section>

      <section className="glass mt-4 flex flex-col gap-3 rounded-jlg p-5 shadow-card">
        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.designHeader.layoutLabel")}</label>
          <p className="text-[11px] text-app-muted">{t("dashboard.pages.designHeader.layoutHelp")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LAYOUT_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setPage({ ...page, layout_variant: value });
                handlePageSettingChange({ layout_variant: value });
              }}
              className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors ${
                page.layout_variant === value ? "border-jeon-purple bg-app-surface-2" : "border-app-border bg-app-surface hover:border-jeon-purple/50"
              }`}
            >
              <span className="text-xs font-bold text-app-ink">{t(`dashboard.pages.designHeader.layouts.${value}.label`)}</span>
              <span className="text-[10px] leading-snug text-app-muted">{t(`dashboard.pages.designHeader.layouts.${value}.description`)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Chip & statistik layout "Profil" (24 Sept 2026) -- cuma relevan
          saat layout itu dipilih, jadi disembunyikan di layout lain. */}
      {page.layout_variant === "profile" && (
        <section className="glass mt-4 rounded-jlg p-5 shadow-card">
          <ProfileExtrasEditor
            value={page.profile_extras ?? EMPTY_PROFILE_EXTRAS}
            onSave={async (next) => {
              const res = await updateMyPageProfileExtras(next);
              setPage((prev) => (prev ? { ...prev, profile_extras: res.profile_extras } : prev));
            }}
          />
        </section>
      )}
    </DesignPageShell>
  );
}
