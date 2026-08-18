"use client";

import PageSkeleton from "@/components/Skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDesignData } from "@/lib/useDesignData";
import { CUSTOM_BUTTON_STYLE_OPTIONS, CUSTOM_FONT_OPTIONS, PAGE_THEMES } from "@/lib/page-themes";
import { IconBadgeCheck, IconCheck, IconChevronRight, IconExternal, IconLock, IconSparkle } from "@/components/icons";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import Toggle from "@/components/Toggle";
import { SITE_URL } from "@/lib/site";

// Struktur halaman ini diikutkan tangkapan layar halaman Design Linktree:
// satu baris "Theme" berdiri sendiri di atas, lalu label "Customize", lalu
// baris-baris Header/Buttons/Text.
//
// Permintaan langsung pengguna (27 Juli 2026): SEBELUMNYA baris-baris ini
// berbentuk accordion yang expand di tempat -- sekarang tiap baris jadi
// TAUTAN ke halaman tersendiri (/dashboard/design/theme, /header, /tombol,
// /font), berbagi data & fungsi simpan lewat hook useDesignData supaya
// tidak terduplikasi 4x. Baris "Latar" (Wallpaper) DIHAPUS SEPENUHNYA
// (permintaan langsung pengguna) -- kreator yang SEBELUMNYA sudah mengatur
// latar kustom (gradien/gambar) lewat menu ini tetap tampil apa adanya di
// halaman publik (kolom custom_background_type/value di database TIDAK
// dihapus, cuma UI untuk menyuntingnya yang hilang), tapi tidak ada lagi
// cara baru mengubahnya dari dashboard.
//
// Section "SEO" (Judul/Deskripsi SEO + noindex) DIPINDAH ke
// /dashboard/settings/seo (permintaan langsung pengguna, 12 Agustus
// 2026, referensi tangkapan layar panel "SEO and discoverability"
// Linktree -- fitur itu memang tergolong pengaturan akun di sana, bukan
// bagian desain visual). Kolom seo_title/seo_description/noindex di
// database TIDAK berubah, cuma UI-nya pindah rute -- lihat catatan
// lengkap di halaman baru itu.
export default function DashboardDesignPage() {
  const router = useRouter();
  const { page, links, products, loading, error, handlePageSettingChange } = useDesignData();

  if (loading || !page) return <PageSkeleton />;

  const presetMeta = PAGE_THEMES[page.theme as keyof typeof PAGE_THEMES] as (typeof PAGE_THEMES)[keyof typeof PAGE_THEMES] | undefined;
  const themeSwatch = page.theme === "custom" ? page.custom_button_color : (presetMeta?.swatch ?? "#1B4D3E");
  const themeLabel = page.theme === "custom" ? "Custom" : (presetMeta?.label ?? "Default");
  const buttonStyleLabel = CUSTOM_BUTTON_STYLE_OPTIONS.find((o) => o.value === page.custom_button_style)?.label;
  const fontLabel = CUSTOM_FONT_OPTIONS.find((f) => f.value === page.custom_font)?.label;

  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div className="max-w-2xl">
        <p className="mt-1 text-sm text-muted">Foto profil, bio, tema, dan status terbit halaman publikmu.</p>

        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <section className="glass mt-6 rounded-3xl p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-bold text-ink">Pengaturan Halaman</h2>
            <a
              href={`${SITE_URL}/${page.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <IconExternal className="h-3.5 w-3.5" />
              jeon.id/{page.username}
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

          <div className="mt-5 flex flex-col gap-3">
            <Link href="/dashboard/design/theme" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 hover:border-primary/40">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 flex-shrink-0 rounded-lg ring-1 ring-black/5" style={{ backgroundColor: themeSwatch }} aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-ink">Tema</p>
                  <p className="text-xs text-muted">{themeLabel}</p>
                </div>
              </div>
              <IconChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
            </Link>

            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-muted">Sesuaikan</p>

            <Link href="/dashboard/design/header" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 hover:border-primary/40">
              <div className="flex items-center gap-3">
                {page.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={page.avatar_url} alt={page.username} className="h-8 w-8 flex-shrink-0 rounded-lg object-cover ring-1 ring-black/5" />
                ) : (
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-subtle font-heading text-sm font-bold text-primary">
                    {page.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <p className="text-sm font-semibold text-ink">Header</p>
              </div>
              <IconChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
            </Link>

            <Link href="/dashboard/design/tombol" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 hover:border-primary/40">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 flex-shrink-0 rounded-lg ring-1 ring-black/5" style={{ backgroundColor: page.custom_button_color }} aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-ink">Tombol</p>
                  {buttonStyleLabel && <p className="text-xs text-muted">{buttonStyleLabel}</p>}
                </div>
              </div>
              <IconChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
            </Link>

            <Link href="/dashboard/design/font" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 hover:border-primary/40">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-pop-blue-tint font-heading text-sm font-bold text-pop-blue" aria-hidden>
                  Aa
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">Font</p>
                  {fontLabel && <p className="text-xs text-muted">{fontLabel}</p>}
                </div>
              </div>
              <IconChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
            </Link>

            <Link href="/dashboard/design/sticker" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 hover:border-primary/40">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-pop-pink-tint text-pop-pink" aria-hidden>
                  <IconSparkle className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">Stiker</p>
                  <p className="text-xs text-muted">
                    {page.stickers.length === 0 ? "Tidak ada" : `${page.stickers.length} stiker terpasang`}
                  </p>
                </div>
              </div>
              <IconChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
            </Link>

            {/* Modul Langganan Premium (permintaan langsung pengguna, 8
                Agustus 2026): "versi gratis diberi watermark, versi
                berbayar bisa menghilangkan watermark, ada toggle" -- kreator
                gratis SELALU tampil watermark (toggle dikunci, klik
                mengarahkan ke halaman upgrade), kreator Premium bebas
                menyalakan/mematikan sendiri. Gerbang sungguhan tetap di
                backend (finishPublicPageResponse, page.go) -- ini murni UI. */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3">
              <button
                type="button"
                onClick={() =>
                  page.is_premium
                    ? handlePageSettingChange({ hide_watermark: !page.hide_watermark })
                    : router.push("/dashboard/settings/subscription")
                }
                className="flex min-w-0 items-center gap-3 text-left"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ink/5 text-primary" aria-hidden>
                  {page.is_premium ? <IconSparkle className="h-4 w-4" /> : <IconLock className="h-4 w-4 text-muted" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Sembunyikan Watermark</p>
                  <p className="truncate text-xs text-muted">
                    {page.is_premium ? "Hilangkan pil “Buat halaman gratis di Jeonme” di footer" : "Khusus kreator Premium -- upgrade dulu"}
                  </p>
                </div>
              </button>
              <Toggle
                checked={page.is_premium && page.hide_watermark}
                disabled={!page.is_premium}
                onChange={() => handlePageSettingChange({ hide_watermark: !page.hide_watermark })}
                label="Sembunyikan watermark"
              />
            </div>

            <div className="flex items-center gap-2">
              <Toggle checked={page.is_published} onChange={() => handlePageSettingChange({ is_published: !page.is_published })} label="Terbitkan halaman publik" />
              <span className="text-sm font-semibold text-ink">Terbitkan halaman publik</span>
            </div>
          </div>
        </section>
      </div>

      <LivePreviewPanel page={page} links={links} products={products} />
    </div>
  );
}
