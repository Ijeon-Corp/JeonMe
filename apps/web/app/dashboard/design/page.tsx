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
  uploadCustomBackground,
} from "@/lib/api-client";
import { CUSTOM_BUTTON_STYLE_OPTIONS, CUSTOM_FONT_OPTIONS, PAGE_THEMES } from "@/lib/page-themes";
import { IconBadgeCheck, IconCheck, IconChevronRight, IconExternal, IconPaintbrush } from "@/components/icons";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import Toggle from "@/components/Toggle";

// Struktur halaman ini diikutkan PERSIS seperti halaman Design Linktree
// (dikonfirmasi lewat tangkapan layar pengguna): satu baris "Theme" berdiri
// sendiri di atas, lalu label "Customize", lalu baris-baris Header/Wallpaper/
// Buttons/Text -- SEMUA baris berbentuk accordion sebaris (ikon+label+nilai
// saat ini+panah), diklik satu-satu untuk membuka detailnya, bukan satu
// panel gabungan. BEDA PENTING dari versi sebelumnya: di Linktree, baris
// Wallpaper/Buttons/Text SELALU tampil (bukan cuma muncul kalau pilih tema
// "Custom") -- menyentuh salah satunya otomatis "mempromosikan" tema aktif
// jadi Custom di belakang layar (lihat handleCustomize), meniru perilaku
// "override apa pun di atas tema manapun" ala Linktree TANPA perlu kolom
// database baru sama sekali (custom_* sudah ada sejak No.80/Desain 2.0).
//
// Colors & Stickers & Footer milik Linktree TIDAK dibuatkan baris -- Jeonme
// belum punya kustomisasi warna terpisah dari tombol, elemen dekoratif, atau
// kustomisasi footer, dan membuat baris kosong sekadar meniru bentuk tanpa
// fungsi nyata bukan tujuan permintaan ini.
type CustomSection = "theme" | "header" | "latar" | "tombol" | "font";

type PageSettingsPatch = Partial<
  Pick<
    MyPage,
    | "theme"
    | "display_name"
    | "bio"
    | "is_published"
    | "seo_title"
    | "seo_description"
    | "noindex"
    | "custom_background_type"
    | "custom_background_value"
    | "custom_font"
    | "custom_button_color"
    | "custom_button_style"
  >
>;

// "Desain 2.0": gradien disimpan sebagai string CSS linear-gradient(...)
// LENGKAP di custom_background_value (backend memperlakukannya sebagai
// string opaque) -- dua helper ini membangun & mem-parse-ulang string itu
// supaya dashboard bisa menampilkan 2 color picker (awal/akhir) alih-alih
// minta kreator mengetik CSS mentah.
function buildGradient(start: string, end: string): string {
  return `linear-gradient(135deg, ${start} 0%, ${end} 100%)`;
}

function parseGradient(value: string): { start: string; end: string } {
  const hexCodes = value.match(/#[0-9a-fA-F]{6}/g);
  return { start: hexCodes?.[0] ?? "#667EEA", end: hexCodes?.[1] ?? "#764BA2" };
}

// AccordionRow -- satu pola baris dipakai untuk KELIMA baris (Theme/Header/
// Latar/Tombol/Font) supaya visualnya konsisten persis seperti referensi:
// ikon kotak membulat di kiri, label+nilai saat ini, panah di kanan yang
// berputar 90° saat terbuka, detail muncul di bawah dengan latar sedikit
// berbeda.
function AccordionRow({
  icon,
  label,
  value,
  expanded,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-sm font-semibold text-ink">{label}</p>
            {value && <p className="text-xs text-muted">{value}</p>}
          </div>
        </div>
        <IconChevronRight className={`h-4 w-4 flex-shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && children && (
        <div className="flex flex-col gap-3 border-t border-border bg-primary-subtle/20 p-4">{children}</div>
      )}
    </div>
  );
}

export default function DashboardDesignPage() {
  const [page, setPage] = useState<MyPage | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [gradientStart, setGradientStart] = useState("#667EEA");
  const [gradientEnd, setGradientEnd] = useState("#764BA2");
  const [expandedSection, setExpandedSection] = useState<CustomSection | null>(null);

  function toggleSection(section: CustomSection) {
    setExpandedSection((prev) => (prev === section ? null : section));
  }

  useEffect(() => {
    Promise.all([getMyPage(), listLinks(), listProducts()])
      .then(([p, l, prod]) => {
        setPage(p);
        setLinks(l);
        setProducts(prod);
        if (p.custom_background_type === "gradient") {
          const { start, end } = parseGradient(p.custom_background_value);
          setGradientStart(start);
          setGradientEnd(end);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data."))
      .finally(() => setLoading(false));
  }, []);

  async function handlePageSettingChange(patch: PageSettingsPatch) {
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

  // handleCustomize -- dipakai KHUSUS oleh baris Wallpaper/Buttons/Text.
  // Menyentuh salah satu kontrol di baris ini otomatis mempromosikan tema
  // aktif jadi "custom" (meniru "override di atas tema manapun" ala
  // Linktree), APAPUN preset yang sedang aktif sebelumnya.
  function handleCustomize(patch: Omit<PageSettingsPatch, "theme">) {
    return handlePageSettingChange({ ...patch, theme: "custom" });
  }

  function handleGradientChange(start: string, end: string) {
    setGradientStart(start);
    setGradientEnd(end);
    handleCustomize({ custom_background_type: "gradient", custom_background_value: buildGradient(start, end) });
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

  // handleBackgroundUpload -- bug dilaporkan pengguna ("tidak bisa
  // mengupload gambar"): opsi latar "Gambar" sebelumnya cuma kolom URL
  // polos, kreator harus sudah punya foto ter-hosting di tempat lain.
  // Sekarang unggah file sungguhan lewat uploadCustomBackground (backend
  // otomatis set custom_background_type="image" + value=URL sekaligus).
  async function handleBackgroundUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !page) return;

    setBackgroundUploading(true);
    setError(null);
    try {
      const { custom_background_value } = await uploadCustomBackground(file);
      setPage({ ...page, custom_background_type: "image", custom_background_value });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah gambar latar.");
    } finally {
      setBackgroundUploading(false);
    }
  }

  if (loading || !page) return <p className="text-sm text-muted">Memuat...</p>;

  const presetMeta = PAGE_THEMES[page.theme as keyof typeof PAGE_THEMES] as (typeof PAGE_THEMES)[keyof typeof PAGE_THEMES] | undefined;
  const themeSwatch = page.theme === "custom" ? page.custom_button_color : (presetMeta?.swatch ?? "#1B4D3E");
  const themeLabel = page.theme === "custom" ? "Custom" : (presetMeta?.label ?? "Default");
  const backgroundSwatch =
    page.custom_background_type === "gradient"
      ? buildGradient(gradientStart, gradientEnd)
      : page.custom_background_type === "image"
        ? `url(${page.custom_background_value}) center/cover`
        : page.custom_background_value;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div className="max-w-2xl">
        <h1 className="font-heading text-2xl font-bold text-ink">Desain</h1>
        <p className="mt-1 text-sm text-muted">Foto profil, bio, tema, dan status terbit halaman publikmu.</p>

        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

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

          {/* No.88 (Sprint 10): progres badge terverifikasi -- sinyal
              kepercayaan gratis, otomatis dari data yang sudah ada, tanpa
              proses review manual. */}
          <div
            className={`mt-4 rounded-xl border p-3.5 ${
              page.verification.is_verified ? "border-primary/30 bg-primary-subtle/40" : "border-border bg-gray-50"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <IconBadgeCheck className={`h-4 w-4 ${page.verification.is_verified ? "text-primary" : "text-muted"}`} />
              <span className="text-xs font-bold text-ink">
                {page.verification.is_verified ? "Badge Terverifikasi Aktif" : "Badge Terverifikasi"}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1 text-[11px]">
              <li className={`flex items-center gap-1.5 ${page.verification.email_verified ? "text-secondary-dark" : "text-muted"}`}>
                {page.verification.email_verified ? <IconCheck className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted" />}
                Email terverifikasi
              </li>
              <li className={`flex items-center gap-1.5 ${page.verification.profile_complete ? "text-secondary-dark" : "text-muted"}`}>
                {page.verification.profile_complete ? <IconCheck className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted" />}
                Profil lengkap (foto + bio terisi)
              </li>
              <li className={`flex items-center gap-1.5 ${page.verification.has_paid_order ? "text-secondary-dark" : "text-muted"}`}>
                {page.verification.has_paid_order ? <IconCheck className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted" />}
                Minimal 1 transaksi sukses
              </li>
            </ul>
          </div>

          <div className="mt-5 flex flex-col gap-4">
            {/* Theme -- berdiri sendiri di atas, persis posisi di Linktree. */}
            <AccordionRow
              icon={<span className="h-8 w-8 flex-shrink-0 rounded-lg ring-1 ring-black/5" style={{ backgroundColor: themeSwatch }} aria-hidden />}
              label="Tema"
              value={themeLabel}
              expanded={expandedSection === "theme"}
              onToggle={() => toggleSection("theme")}
            >
              <p className="text-xs text-muted">Pilih salah satu template siap pakai, atau lanjut sesuaikan sendiri di bawah (otomatis jadi Custom).</p>
              {/* Kartu galeri portrait ala Linktree: sampel huruf "Aa" di kiri
                  atas + pil warna tombol di bawah, bukan sekadar swatch kotak
                  kecil seperti sebelumnya. */}
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                <button type="button" onClick={() => handlePageSettingChange({ theme: "custom" })} className="group flex flex-col items-center gap-1.5">
                  <div
                    className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-black/5 transition-transform group-hover:scale-[1.02] ${
                      page.theme === "custom" ? "ring-2 ring-primary ring-offset-2" : ""
                    }`}
                  >
                    <IconPaintbrush className="h-7 w-7 text-muted" />
                    {page.theme === "custom" && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                        <IconCheck className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] font-semibold ${page.theme === "custom" ? "text-primary" : "text-ink"}`}>Custom</span>
                </button>
                {THEME_PRESETS.map((theme) => {
                  const meta = PAGE_THEMES[theme];
                  const active = page.theme === theme;
                  return (
                    <button key={theme} type="button" onClick={() => handlePageSettingChange({ theme })} className="group flex flex-col items-center gap-1.5">
                      <div
                        className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl ring-1 ring-black/5 transition-transform group-hover:scale-[1.02] ${
                          active ? "ring-2 ring-primary ring-offset-2" : ""
                        }`}
                        style={{ background: meta.previewBg }}
                      >
                        <span
                          className={`absolute left-2.5 top-2 font-heading text-xl font-bold ${meta.previewIsDark ? "text-white" : "text-ink"}`}
                          aria-hidden
                        >
                          Aa
                        </span>
                        <span
                          className="absolute inset-x-2.5 bottom-2.5 h-6 rounded-full ring-1 ring-black/10"
                          style={{ backgroundColor: meta.swatch }}
                          aria-hidden
                        />
                        {active && (
                          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                            <IconCheck className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <span className={`text-[11px] font-semibold ${active ? "text-primary" : "text-ink"}`}>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </AccordionRow>

            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-muted">Sesuaikan</p>

            {/* Header -- foto profil & bio. */}
            <AccordionRow
              icon={
                page.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={page.avatar_url} alt={page.username} className="h-8 w-8 flex-shrink-0 rounded-lg object-cover ring-1 ring-black/5" />
                ) : (
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-subtle font-heading text-sm font-bold text-primary">
                    {page.username.slice(0, 1).toUpperCase()}
                  </span>
                )
              }
              label="Header"
              expanded={expandedSection === "header"}
              onToggle={() => toggleSection("header")}
            >
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
            </AccordionRow>

            {/* Wallpaper -- SELALU tampil (tidak digating theme==="custom"),
                menyesuaikan otomatis promosi ke Custom lewat handleCustomize. */}
            <AccordionRow
              icon={<span className="h-8 w-8 flex-shrink-0 rounded-lg ring-1 ring-black/5" style={{ background: backgroundSwatch }} aria-hidden />}
              label="Latar"
              value={
                page.custom_background_type === "solid" ? "Warna Solid" : page.custom_background_type === "gradient" ? "Gradien" : "Gambar"
              }
              expanded={expandedSection === "latar"}
              onToggle={() => toggleSection("latar")}
            >
              <div className="flex gap-2">
                {(["solid", "gradient", "image"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      type === "gradient" ? handleGradientChange(gradientStart, gradientEnd) : handleCustomize({ custom_background_type: type })
                    }
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
                      page.custom_background_type === type ? "border-primary bg-white text-primary" : "border-border text-muted"
                    }`}
                  >
                    {type === "solid" ? "Warna Solid" : type === "gradient" ? "Gradien" : "Gambar"}
                  </button>
                ))}
              </div>

              {page.custom_background_type === "solid" && (
                <input
                  type="color"
                  value={page.custom_background_value}
                  onChange={(e) => setPage({ ...page, custom_background_value: e.target.value })}
                  onBlur={(e) => handleCustomize({ custom_background_value: e.target.value })}
                  className="h-9 w-full rounded-lg border border-border"
                />
              )}

              {page.custom_background_type === "gradient" && (
                <div>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={gradientStart}
                      onChange={(e) => handleGradientChange(e.target.value, gradientEnd)}
                      className="h-9 w-full rounded-lg border border-border"
                    />
                    <input
                      type="color"
                      value={gradientEnd}
                      onChange={(e) => handleGradientChange(gradientStart, e.target.value)}
                      className="h-9 w-full rounded-lg border border-border"
                    />
                  </div>
                  <div className="mt-2 h-9 w-full rounded-lg ring-1 ring-black/5" style={{ background: buildGradient(gradientStart, gradientEnd) }} aria-hidden />
                </div>
              )}

              {page.custom_background_type === "image" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    {page.custom_background_value && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={page.custom_background_value}
                        alt="Latar"
                        className="h-14 w-14 flex-shrink-0 rounded-lg object-cover ring-1 ring-black/5"
                      />
                    )}
                    <label className="flex-1 cursor-pointer rounded-lg border border-border bg-white px-3 py-2 text-center text-xs font-semibold text-ink transition-colors hover:border-primary hover:text-primary">
                      {backgroundUploading ? "Mengunggah..." : "Unggah Gambar dari Perangkat"}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={handleBackgroundUpload}
                        disabled={backgroundUploading}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-muted">Atau tempel URL gambar yang sudah ada:</p>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={page.custom_background_value}
                    onChange={(e) => setPage({ ...page, custom_background_value: e.target.value })}
                    onBlur={(e) => handleCustomize({ custom_background_value: e.target.value })}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              )}
            </AccordionRow>

            {/* Buttons -- SELALU tampil. */}
            <AccordionRow
              icon={<span className="h-8 w-8 flex-shrink-0 rounded-lg ring-1 ring-black/5" style={{ backgroundColor: page.custom_button_color }} aria-hidden />}
              label="Tombol"
              value={CUSTOM_BUTTON_STYLE_OPTIONS.find((o) => o.value === page.custom_button_style)?.label}
              expanded={expandedSection === "tombol"}
              onToggle={() => toggleSection("tombol")}
            >
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink">Warna Tombol</label>
                <input
                  type="color"
                  value={page.custom_button_color}
                  onChange={(e) => setPage({ ...page, custom_button_color: e.target.value })}
                  onBlur={(e) => handleCustomize({ custom_button_color: e.target.value })}
                  className="h-9 w-full rounded-lg border border-border"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink">Gaya Tombol</label>
                <div className="flex gap-2">
                  {CUSTOM_BUTTON_STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleCustomize({ custom_button_style: opt.value })}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
                        page.custom_button_style === opt.value ? "border-primary bg-white text-primary" : "border-border text-muted"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </AccordionRow>

            {/* Text -- SELALU tampil. */}
            <AccordionRow
              icon={
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ink/5 font-heading text-sm font-bold text-ink" aria-hidden>
                  Aa
                </span>
              }
              label="Font"
              value={CUSTOM_FONT_OPTIONS.find((f) => f.value === page.custom_font)?.label}
              expanded={expandedSection === "font"}
              onToggle={() => toggleSection("font")}
            >
              <select
                value={page.custom_font}
                onChange={(e) => handleCustomize({ custom_font: e.target.value as MyPage["custom_font"] })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {CUSTOM_FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </AccordionRow>

            <div className="flex items-center gap-2">
              <Toggle checked={page.is_published} onChange={() => handlePageSettingChange({ is_published: !page.is_published })} label="Terbitkan halaman publik" />
              <span className="text-sm font-semibold text-ink">Terbitkan halaman publik</span>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
          <h2 className="font-heading text-lg font-bold text-ink">SEO</h2>
          <p className="mt-1 text-xs text-muted">
            Kontrol judul/deskripsi yang tampil di hasil pencarian & saat dibagikan, plus opsi menyembunyikan halaman dari mesin pencari.
          </p>

          <div className="mt-4 flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Judul SEO (maks 70 karakter)</label>
              <input
                type="text"
                maxLength={70}
                value={page.seo_title}
                placeholder={`@${page.username} — Jeonme`}
                onChange={(e) => setPage({ ...page, seo_title: e.target.value })}
                onBlur={(e) => handlePageSettingChange({ seo_title: e.target.value })}
                className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Deskripsi SEO (maks 160 karakter)</label>
              <textarea
                maxLength={160}
                value={page.seo_description}
                placeholder={page.bio || `Lihat semua tautan dan produk @${page.username} di Jeonme.`}
                onChange={(e) => setPage({ ...page, seo_description: e.target.value })}
                onBlur={(e) => handlePageSettingChange({ seo_description: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex items-center gap-2">
              <Toggle checked={page.noindex} onChange={() => handlePageSettingChange({ noindex: !page.noindex })} label="Sembunyikan dari mesin pencari" />
              <span className="text-sm font-semibold text-ink">Sembunyikan dari mesin pencari (noindex)</span>
            </div>
          </div>
        </section>
      </div>

      <LivePreviewPanel page={page} links={links} products={products} />
    </div>
  );
}
