"use client";

import Image from "next/image";

import { useState } from "react";
import { ApiError, MyPage, PageLayoutVariant } from "@/lib/api-client";
import {
  CUSTOM_BUTTON_ROUNDED_OPTIONS,
  CUSTOM_BUTTON_SHADOW_OPTIONS,
  CUSTOM_BUTTON_STYLE_OPTIONS,
  CUSTOM_FONT_OPTIONS,
} from "@/lib/page-themes";
import { IconChevronRight } from "@/components/icons";
import Toggle from "@/components/Toggle";
import ThemeGallery from "@/components/ThemeGallery";
import { SOCIAL_PLATFORMS, SocialPlatformKey } from "@/lib/social-links";
import { useLocale } from "@/lib/locale-context";

// design-sections.tsx -- Tema/Header/Tombol/Font, diekstrak dari
// ProdukPageEditor.tsx (permintaan langsung pengguna 9 September 2026,
// "design langsung di builder juga"): SEBELUMNYA 4 fungsi ini cuma dipakai
// ProdukPageEditor.tsx (Toko), TIDAK PERNAH diekspor/dipakai ulang di mana
// pun -- badan JSX/logic APA ADANYA, cuma dipindah lokasi + digeneralisasi
// supaya bisa dipakai ULANG oleh rute Canvas Page Builder juga (Toko DAN
// Builder, TIDAK Bio -- lihat catatan cakupan lengkap di plan). Bio
// (app/dashboard/design/*) SENGAJA tidak disentuh sama sekali -- tetap
// jalur kode independennya sendiri seperti sebelumnya.
//
// DesignSectionPage -- bentuk MINIMAL yang benar-benar dibaca ke-4 fungsi
// ini, BUKAN diturunkan dari MyPage/ExtraPageDetail langsung (keduanya
// punya field yang TIDAK dipunyai satu sama lain, mis. MyPage.username vs
// ExtraPageDetail.slug/name) -- interface bebas berdiri sendiri ini dibaca
// dari SUPERSET manapun (MyPage & ExtraPageDetail keduanya strukturnya
// lebih besar dari ini, jadi keduanya otomatis cocok tanpa cast utk PROP
// `page` -- assignment SEARAH itu aman). `name`/`slug` OPSIONAL (cuma ada
// di ExtraPageDetail, dipakai sekadar teks alt/inisial avatar kosong) --
// pemanggil dari halaman utama (Bio via rute Builder) boleh tidak
// mengisinya, HeaderSection sudah fallback ke display_name.
export interface DesignSectionPage {
  avatar_url: string;
  display_name: string;
  bio: string;
  theme: string;
  custom_background_type: "solid" | "gradient" | "image";
  custom_background_value: string;
  custom_button_color: string;
  custom_button_style: "fill" | "outline" | "glass";
  custom_button_rounded: "none" | "sm" | "md" | "full";
  custom_button_shadow: "none" | "soft" | "strong" | "hard";
  custom_font: MyPage["custom_font"];
  custom_page_text_color: string;
  custom_title_font: "" | MyPage["custom_font"];
  custom_title_color: string;
  custom_style_override: boolean;
  layout_variant: PageLayoutVariant;
  social_instagram: string;
  social_tiktok: string;
  social_facebook: string;
  social_whatsapp: string;
  social_youtube: string;
  social_x: string;
  social_linkedin: string;
  social_telegram: string;
  social_email: string;
  name?: string;
  slug?: string;
}

// DesignSectionPatch -- bentuk payload onPatch/onLocalChange, SATU sumber
// kebenaran field yang bisa disentuh ke-4 panel ini (Partial supaya tiap
// pemanggil onPatch/onLocalChange cukup kirim field yang benar-benar
// berubah, pola SAMA PERSIS updateMyPage/updateExtraPage yang sudah ada).
export type DesignSectionPatch = Partial<DesignSectionPage>;

// getLayoutOptions -- pindah dari ProdukPageEditor.tsx APA ADANYA (dipakai
// HANYA oleh HeaderSection, satu-satunya pemanggil sebelum & sesudah
// pemindahan ini).
function getLayoutOptions(t: (key: string) => string): { value: PageLayoutVariant; label: string; description: string }[] {
  return [
    { value: "centered", label: "Centered", description: t("dashboard.components.produkPageEditor.layoutOptions.centered") },
    { value: "banner", label: "Banner", description: t("dashboard.components.produkPageEditor.layoutOptions.banner") },
    { value: "card", label: "Card", description: t("dashboard.components.produkPageEditor.layoutOptions.card") },
    { value: "spotlight", label: "Spotlight", description: t("dashboard.components.produkPageEditor.layoutOptions.spotlight") },
    { value: "cover", label: "Cover", description: t("dashboard.components.produkPageEditor.layoutOptions.cover") },
    { value: "minimal", label: "Minimal", description: t("dashboard.components.produkPageEditor.layoutOptions.minimal") },
    { value: "hero", label: "Hero", description: t("dashboard.components.produkPageEditor.layoutOptions.hero") },
    { value: "polaroid", label: "Polaroid", description: t("dashboard.components.produkPageEditor.layoutOptions.polaroid") },
    { value: "split", label: "Split", description: t("dashboard.components.produkPageEditor.layoutOptions.split") },
    { value: "ticket", label: "Ticket", description: t("dashboard.components.produkPageEditor.layoutOptions.ticket") },
    { value: "headline", label: "Headline", description: t("dashboard.components.produkPageEditor.layoutOptions.headline") },
    { value: "ribbon", label: "Ribbon", description: t("dashboard.components.produkPageEditor.layoutOptions.ribbon") },
    { value: "duo", label: "Duo", description: t("dashboard.components.produkPageEditor.layoutOptions.duo") },
    { value: "masthead", label: "Masthead", description: t("dashboard.components.produkPageEditor.layoutOptions.masthead") },
    { value: "portrait", label: "Portrait", description: t("dashboard.components.produkPageEditor.layoutOptions.portrait") },
  ];
}

// ---------- Tema ----------

export function TemaSection({
  page,
  isPremium,
  onPatch,
  onError,
  // onUploadBackground -- BEDA endpoint upload latar Toko (uploadExtraPageBackground,
  // butuh page.id) vs halaman utama (uploadCustomBackground, tanpa id, implisit dari
  // token auth) -- disuntikkan pemanggil (ProdukPageEditor.tsx / rute Builder)
  // supaya komponen ini sendiri TIDAK perlu tahu jalur endpoint mana yang benar.
  onUploadBackground,
}: {
  page: DesignSectionPage;
  isPremium: boolean;
  onPatch: (patch: DesignSectionPatch) => void;
  onError: (msg: string | null) => void;
  // onUploadBackground -- SEKARANG mengembalikan URL hasil unggah (BUKAN
  // Promise<void>). Bug ditemukan lewat audit (13 September 2026):
  // sebelumnya `onPatch({})` dipanggil tanpa argumen apa pun sesudah
  // upload -- no-op TOTAL di arsitektur draft (TIDAK ADA field yang
  // berubah utk memicu re-render pratinjau), padahal gambar SUDAH
  // berhasil diunggah ke server. Kreator melihat kanvas/pratinjau TIDAK
  // BERUBAH SAMA SEKALI sampai reload halaman penuh, tanpa error apa pun.
  onUploadBackground: (file: File) => Promise<string>;
}) {
  const { t } = useLocale();
  const [bgUploading, setBgUploading] = useState(false);

  async function handleBackgroundUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBgUploading(true);
    try {
      const custom_background_value = await onUploadBackground(file);
      // custom_background_type -- backend SUDAH memaksanya jadi "image"
      // sekaligus saat upload (lihat catatan uploadCustomBackground,
      // api-client.ts) -- draft lokal HARUS ikut, kalau tidak toggle
      // solid/gradient/gambar di UI ini akan salah tampil dari draft
      // walau server sudah benar.
      onPatch({ custom_background_type: "image", custom_background_value });
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadBackground"));
    } finally {
      setBgUploading(false);
    }
  }

  return (
    <section className="glass rounded-jmd p-5 shadow-card">
      {/* ThemeGallery -- permintaan langsung pengguna 9 September 2026
          ("supaya tema tidak tampil langsung banyak banget", "tampilkan
          tema berdasarkan kategori"): SEBELUMNYA grid datar 123 tema
          sekaligus (disalin apa adanya dari kode lama, tanpa preview
          video/live-wallpaper yang benar utk tipe tema itu) -- diganti
          pakai galeri BERTAB yang SAMA PERSIS dipakai Bio
          (dashboard/design/theme/page.tsx) & Quick Setup, bukan reimplementasi
          ketiga. Otomatis mewarisi preview video/live-wallpaper yang benar,
          bukan cuma perbaikan kategori.
      */}
      <ThemeGallery
        value={page.theme}
        onChange={(theme) => onPatch({ theme, custom_style_override: false })}
        customTile={{
          isPremium,
          onSelect: () => onPatch({ theme: "custom", custom_style_override: false }),
          onLocked: () => onError(t("dashboard.components.produkPageEditor.tema.customPremiumOnly")),
        }}
      />

      {page.theme === "custom" && isPremium && (
        <div className="mt-5 flex flex-col gap-3 border-t border-app-border pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-app-muted">{t("dashboard.components.produkPageEditor.tema.customBackground")}</p>
          <div className="flex gap-2">
            {(["solid", "gradient", "image"] as const).map((bgType) => (
              <button
                key={bgType}
                type="button"
                onClick={() => onPatch({ custom_background_type: bgType })}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold capitalize ${
                  page.custom_background_type === bgType ? "border-jeon-purple bg-app-surface text-jeon-purple" : "border-app-border text-app-muted"
                }`}
              >
                {bgType === "solid"
                  ? t("dashboard.components.produkPageEditor.tema.backgroundColor")
                  : bgType === "gradient"
                  ? t("dashboard.components.produkPageEditor.tema.backgroundGradient")
                  : t("dashboard.components.produkPageEditor.tema.backgroundImage")}
              </button>
            ))}
          </div>
          {page.custom_background_type === "image" ? (
            <label className="cursor-pointer self-start rounded-lg border-2 border-jeon-ink bg-app-surface px-3 py-1.5 text-xs font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
              {bgUploading ? t("dashboard.components.produkPageEditor.tema.uploading") : t("dashboard.components.produkPageEditor.tema.uploadBackground")}
              <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleBackgroundUpload} disabled={bgUploading} className="hidden" />
            </label>
          ) : (
            <input
              type={page.custom_background_type === "solid" ? "color" : "text"}
              value={page.custom_background_value || (page.custom_background_type === "solid" ? "#1B4D3E" : "")}
              onChange={(e) => onPatch({ custom_background_value: e.target.value })}
              placeholder={page.custom_background_type === "gradient" ? "linear-gradient(...)" : undefined}
              className="h-9 w-full rounded-lg border border-app-border px-3 text-sm"
            />
          )}
        </div>
      )}
    </section>
  );
}

// ---------- Header ----------

export function HeaderSection({
  page,
  onLocalChange,
  onPatch,
  onError,
  // onUploadAvatar -- lihat catatan lengkap di onUploadBackground (TemaSection).
  onUploadAvatar,
}: {
  page: DesignSectionPage;
  onLocalChange: (patch: DesignSectionPatch) => void;
  onPatch: (patch: DesignSectionPatch) => void;
  onError: (msg: string | null) => void;
  onUploadAvatar: (file: File) => Promise<{ avatar_url: string }>;
}) {
  const { t } = useLocale();
  const LAYOUT_OPTIONS = getLayoutOptions(t);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Kontak sosial -- permintaan langsung pengguna, 11 Agustus 2026, paritas
  // penuh dengan halaman utama (dashboard/links/page.tsx): platform yang
  // sama, panel kolaps yang sama, disimpan lewat onPatch yang SAMA dengan
  // field lain di section ini.
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialDraft, setSocialDraft] = useState<Partial<Record<SocialPlatformKey, string>>>({});

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarUploading(true);
    try {
      const { avatar_url } = await onUploadAvatar(file);
      onLocalChange({ avatar_url });
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadAvatar"));
    } finally {
      setAvatarUploading(false);
    }
  }

  function openSocialPanel() {
    setSocialDraft({
      instagram: page.social_instagram,
      tiktok: page.social_tiktok,
      facebook: page.social_facebook,
      whatsapp: page.social_whatsapp,
      youtube: page.social_youtube,
      x: page.social_x,
      linkedin: page.social_linkedin,
      telegram: page.social_telegram,
      email: page.social_email,
    });
    setSocialOpen(true);
  }

  function saveSocial() {
    // onPatch di induk sudah melakukan optimistic update + try/catch +
    // setError sendiri (pola sama seperti onBlur Nama/Bio di bawah) --
    // tidak diulang di sini supaya tidak ada dua sumber update yang saling
    // tabrakan.
    onPatch({
      social_instagram: (socialDraft.instagram ?? "").trim(),
      social_tiktok: (socialDraft.tiktok ?? "").trim(),
      social_facebook: (socialDraft.facebook ?? "").trim(),
      social_whatsapp: (socialDraft.whatsapp ?? "").trim(),
      social_youtube: (socialDraft.youtube ?? "").trim(),
      social_x: (socialDraft.x ?? "").trim(),
      social_linkedin: (socialDraft.linkedin ?? "").trim(),
      social_telegram: (socialDraft.telegram ?? "").trim(),
      social_email: (socialDraft.email ?? "").trim(),
    });
    setSocialOpen(false);
  }

  return (
    <section className="glass flex flex-col gap-4 rounded-jmd p-5 shadow-card">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.header.avatarLabel")}</label>
        <div className="flex items-center gap-3">
          {page.avatar_url ? (
            // Ukuran TETAP 48px (h-12 w-12). avatar_url bisa berupa URL
            // googleusercontent mentah untuk akun daftar-lewat-Google -- host
            // itu sudah didaftarkan di images.remotePatterns (next.config.js).
            <Image src={page.avatar_url} alt={page.name ?? page.display_name} width={48} height={48} className="h-12 w-12 rounded-full object-cover ring-2 ring-white" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-jeon-purple/10 font-display text-base font-bold text-jeon-purple">
              {(page.slug ?? page.display_name).slice(0, 1).toUpperCase()}
            </div>
          )}
          <label className="cursor-pointer rounded-lg border-2 border-jeon-ink bg-app-surface px-3 py-1.5 text-xs font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
            {avatarUploading ? t("dashboard.components.produkPageEditor.header.uploading") : t("dashboard.components.produkPageEditor.header.changePhoto")}
            <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleAvatarChange} disabled={avatarUploading} className="hidden" />
          </label>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.header.displayNameLabel")}</label>
        <input
          type="text"
          maxLength={100}
          value={page.display_name}
          onChange={(e) => onLocalChange({ display_name: e.target.value })}
          onBlur={(e) => onPatch({ display_name: e.target.value })}
          className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.header.bioLabel")}</label>
        <textarea
          maxLength={160}
          rows={3}
          value={page.bio}
          onChange={(e) => onLocalChange({ bio: e.target.value })}
          onBlur={(e) => onPatch({ bio: e.target.value })}
          className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
        />
      </div>

      {/* Layout -- paritas penuh dengan halaman utama (dashboard/design/
          header/page.tsx), lihat catatan lengkap di sana soal kenapa
          pemilih manual ini perlu ada. */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.header.layoutLabel")}</label>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onLocalChange({ layout_variant: opt.value });
                onPatch({ layout_variant: opt.value });
              }}
              className={`flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-colors ${
                page.layout_variant === opt.value ? "border-jeon-purple bg-jeon-purple/10" : "border-app-border bg-app-surface hover:border-jeon-purple/50"
              }`}
            >
              <span className="text-[11px] font-bold text-app-ink">{opt.label}</span>
              <span className="text-[9px] leading-snug text-app-muted">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Kontak Sosial -- permintaan langsung pengguna, 11 Agustus 2026,
          paritas penuh dengan halaman utama (lihat catatan lengkap di
          dashboard/links/page.tsx). */}
      <div className="rounded-xl border border-app-border">
        <button
          type="button"
          onClick={() => (socialOpen ? setSocialOpen(false) : openSocialPanel())}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-app-ink"
        >
          {t("dashboard.components.produkPageEditor.header.socialContact")}
          <IconChevronRight className={`h-3.5 w-3.5 text-app-muted transition-transform ${socialOpen ? "rotate-90" : ""}`} />
        </button>
        {socialOpen && (
          <div className="border-t border-app-border p-3">
            <div className="grid grid-cols-1 gap-2">
              {SOCIAL_PLATFORMS.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${p.badgeClass}`}>
                    <p.Icon className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    value={socialDraft[p.key] ?? ""}
                    onChange={(e) => setSocialDraft((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    placeholder={`${p.label} · ${p.placeholder}`}
                    aria-label={p.label}
                    className="w-full min-w-0 rounded-lg border border-app-border px-2.5 py-2 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-app-muted">{t("dashboard.components.produkPageEditor.header.socialHint")}</p>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={saveSocial} className="rounded-lg btn-primary px-4 py-2 text-xs font-bold text-white">
                {t("dashboard.components.produkPageEditor.header.save")}
              </button>
              <button type="button" onClick={() => setSocialOpen(false)} className="text-xs font-semibold text-app-muted hover:text-app-ink">
                {t("dashboard.components.produkPageEditor.header.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- Tombol ----------

export function TombolSection({
  page,
  onLocalChange,
  onStyleOverride,
}: {
  page: DesignSectionPage;
  onLocalChange: (patch: DesignSectionPatch) => void;
  onStyleOverride: (patch: Omit<DesignSectionPatch, "theme" | "custom_style_override">) => void;
}) {
  const { t } = useLocale();
  return (
    <section className="glass flex flex-col gap-4 rounded-jmd p-5 shadow-card">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.tombol.buttonColor")}</label>
        <input
          type="color"
          value={page.custom_button_color}
          onChange={(e) => onLocalChange({ custom_button_color: e.target.value })}
          onBlur={(e) => onStyleOverride({ custom_button_color: e.target.value })}
          className="h-9 w-full rounded-lg border border-app-border"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.tombol.buttonStyle")}</label>
        <div className="flex gap-2">
          {CUSTOM_BUTTON_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStyleOverride({ custom_button_style: opt.value })}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
                page.custom_button_style === opt.value ? "border-jeon-purple bg-app-surface text-jeon-purple" : "border-app-border text-app-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.tombol.cornerRadius")}</label>
        <div className="flex gap-2">
          {CUSTOM_BUTTON_ROUNDED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStyleOverride({ custom_button_rounded: opt.value })}
              title={opt.label}
              className={`flex h-9 flex-1 items-center justify-center border py-1.5 ${opt.className} ${
                page.custom_button_rounded === opt.value ? "border-jeon-purple bg-app-surface" : "border-app-border"
              }`}
            >
              <span className={`block h-3 w-6 border-2 border-ink/60 ${opt.className}`} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.tombol.buttonShadow")}</label>
        <div className="flex gap-2">
          {CUSTOM_BUTTON_SHADOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStyleOverride({ custom_button_shadow: opt.value })}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
                page.custom_button_shadow === opt.value ? "border-jeon-purple bg-app-surface text-jeon-purple" : "border-app-border text-app-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Font ----------

export function FontSection({
  page,
  onLocalChange,
  onStyleOverride,
}: {
  page: DesignSectionPage;
  onLocalChange: (patch: DesignSectionPatch) => void;
  onStyleOverride: (patch: Omit<DesignSectionPatch, "theme" | "custom_style_override">) => void;
}) {
  const { t } = useLocale();
  return (
    <section className="glass flex flex-col gap-4 rounded-jmd p-5 shadow-card">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.font.pageFont")}</label>
        <select
          value={page.custom_font}
          onChange={(e) => onStyleOverride({ custom_font: e.target.value as MyPage["custom_font"] })}
          className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
        >
          {CUSTOM_FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.font.pageTextColor")}</label>
        <input
          type="color"
          value={page.custom_page_text_color || "#FFFFFF"}
          onChange={(e) => onLocalChange({ custom_page_text_color: e.target.value })}
          onBlur={(e) => onStyleOverride({ custom_page_text_color: e.target.value })}
          className="h-9 w-full rounded-lg border border-app-border"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.font.separateTitleFont")}</p>
          <p className="text-[11px] text-app-muted">{t("dashboard.components.produkPageEditor.font.separateTitleFontHint")}</p>
        </div>
        <Toggle
          checked={!!page.custom_title_font}
          onChange={() => onStyleOverride({ custom_title_font: page.custom_title_font ? "" : page.custom_font })}
          label={t("dashboard.components.produkPageEditor.font.separateTitleFont")}
        />
      </div>

      {page.custom_title_font && (
        <select
          value={page.custom_title_font}
          onChange={(e) => onStyleOverride({ custom_title_font: e.target.value as MyPage["custom_font"] })}
          className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
        >
          {CUSTOM_FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.font.titleColor")}</label>
        <input
          type="color"
          value={page.custom_title_color || "#FFFFFF"}
          onChange={(e) => onLocalChange({ custom_title_color: e.target.value })}
          onBlur={(e) => onStyleOverride({ custom_title_color: e.target.value })}
          className="h-9 w-full rounded-lg border border-app-border"
        />
      </div>
    </section>
  );
}

