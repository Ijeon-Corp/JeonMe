"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconBox, IconChart, IconChevronRight, IconClose, IconCopy, IconExternal, IconGrid, IconLink, IconPlus, IconShoppingBag, IconSparkle } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { copyText } from "@/lib/copy-text";
import { useLocale } from "@/lib/locale-context";
import { useModalA11y } from "@/lib/use-modal-a11y";
import { overlayClass, sheetPanelClass, usePresence } from "@/lib/use-presence";
import { SITE_URL } from "@/lib/site";

// MobileBottomNav -- navigasi bawah dashboard di layar < md. Permintaan
// langsung pengguna, 25 September 2026: "buatkan bottom menu untuk mobile
// yang berisi menu menu penting yang akan paling sering digunakan".
//
// SEBELUMNYA (bottom nav v2, spec §6.3): Beranda | Halaman | Jualan |
// Analitik | Menu -- slot "Menu" cuma membuka drawer yang SAMA dengan
// tombol ☰ di header mobile (dobel), sementara aksi yang paling sering
// dilakukan kreator (menambah blok/produk, membuka & membagikan halaman)
// butuh 2-3 ketukan. Sekarang slot itu diganti tombol tengah "Buat" (pola
// FAB tengah ala aplikasi kreator) yang membuka sheet aksi cepat; drawer
// menu lengkap tetap lewat ☰ di header.
//
// Tombol "Tambah Blok"/"Tambah Produk" menavigasi dgn parameter nonce
// (?add=<ts> / ?new=<ts>) -- halaman tujuan membuka form-nya sendiri saat
// nilai parameter BERUBAH (lihat links/page.tsx & products/page.tsx), jadi
// mengetuk lagi saat sudah di halaman yang sama tetap membuka form.
type NavItem = { key: string; href: string; icon: typeof IconChart; match: (p: string) => boolean };

const NAV_LEFT: NavItem[] = [
  { key: "bottomHome", href: "/dashboard", icon: IconGrid, match: (p) => p === "/dashboard" },
  {
    key: "bottomPage",
    href: "/dashboard/links",
    icon: IconLink,
    match: (p) => p === "/dashboard/links" || p.startsWith("/dashboard/design") || p === "/dashboard/settings/seo",
  },
];

const NAV_RIGHT: NavItem[] = [
  {
    key: "bottomSales",
    href: "/dashboard/products",
    icon: IconShoppingBag,
    match: (p) => ["/dashboard/products", "/dashboard/courses", "/dashboard/events", "/dashboard/donation"].some((b) => p === b || p.startsWith(`${b}/`)),
  },
  { key: "bottomAnalytics", href: "/dashboard/statistik", icon: IconChart, match: (p) => p === "/dashboard/statistik" },
];

export default function MobileBottomNav({ pathname, username }: { pathname: string; username: string | null }) {
  const { t } = useLocale();
  const router = useRouter();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { mounted, visible } = usePresence(sheetOpen);
  const closeSheet = () => setSheetOpen(false);
  const sheetRef = useModalA11y(sheetOpen, closeSheet);

  const publicUrl = username ? `${SITE_URL}/${username}` : "";

  function go(href: string) {
    setSheetOpen(false);
    router.push(href);
  }

  function renderItem(item: NavItem) {
    const Icon = item.icon;
    const active = item.match(pathname);
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-semibold transition-colors ${
          active ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"
        }`}
      >
        {/* Indikator aktif berbentuk pil di belakang ikon (bukan cuma warna
            teks) -- lebih mudah dikenali sekilas di layar kecil. */}
        <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-jeon-lavender/70" : ""}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span>{t(`dashboard.nav.${item.key}`)}</span>
      </Link>
    );
  }

  const actions: { key: string; icon: typeof IconChart; accent: string; onClick: () => void; disabled?: boolean; external?: boolean }[] = [
    { key: "addBlock", icon: IconPlus, accent: "bg-jeon-lime", onClick: () => go(`/dashboard/links?add=${Date.now()}`) },
    { key: "addProduct", icon: IconBox, accent: "bg-jeon-pink", onClick: () => go(`/dashboard/products?tab=items&new=${Date.now()}`) },
    {
      key: "viewPage",
      icon: IconExternal,
      accent: "bg-jeon-blue",
      external: true,
      disabled: !publicUrl,
      onClick: () => {
        setSheetOpen(false);
        window.open(publicUrl, "_blank", "noopener,noreferrer");
      },
    },
    {
      key: "copyLink",
      icon: IconCopy,
      accent: "bg-jeon-lavender",
      disabled: !publicUrl,
      onClick: () => {
        copyText(publicUrl).then((ok) => {
          if (ok) showToast(t("dashboard.nav.quickCreate.copied"), "success");
        });
        setSheetOpen(false);
      },
    },
    { key: "quickSetup", icon: IconSparkle, accent: "bg-jeon-orange/80", onClick: () => go("/dashboard/quick-setup") },
  ];

  return (
    <>
      <nav
        aria-label={t("dashboard.nav.overview")}
        className="nav-glass fixed inset-x-0 bottom-0 z-30 flex items-end justify-around border-t border-app-border pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV_LEFT.map(renderItem)}
        <div className="flex flex-1 flex-col items-center pb-1.5">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            aria-label={t("dashboard.nav.quickCreate.title")}
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#111111] bg-jeon-lime text-[#111111] shadow-brutal transition-transform active:scale-95"
          >
            <IconPlus className={`h-6 w-6 transition-transform duration-200 ${sheetOpen ? "rotate-45" : ""}`} />
          </button>
          <span className="mt-0.5 text-[10px] font-semibold text-app-ink">{t("dashboard.nav.bottomCreate")}</span>
        </div>
        {NAV_RIGHT.map(renderItem)}
      </nav>

      {mounted && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] ${overlayClass(visible)}`} onClick={closeSheet} aria-hidden />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("dashboard.nav.quickCreate.title")}
            className={`absolute inset-x-0 bottom-0 rounded-t-[28px] border-t-2 border-[#111111] bg-app-surface px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-hero ${sheetPanelClass(visible)}`}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-app-border" aria-hidden />
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-base font-bold text-app-ink">{t("dashboard.nav.quickCreate.title")}</p>
              <button type="button" onClick={closeSheet} aria-label={t("dashboard.nav.quickCreate.close")} className="rounded-full p-1.5 text-app-muted hover:bg-app-surface-2 hover:text-app-ink">
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {actions.map((a) => {
                const Icon = a.icon;
                return (
                  <li key={a.key}>
                    <button
                      type="button"
                      onClick={a.onClick}
                      disabled={a.disabled}
                      className="flex w-full items-center gap-3 rounded-2xl border-2 border-app-border bg-app-surface p-3 text-left transition-colors hover:border-jeon-purple disabled:opacity-50"
                    >
                      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border-2 border-[#111111] text-[#111111] ${a.accent}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-app-ink">{t(`dashboard.nav.quickCreate.${a.key}`)}</span>
                        <span className="block truncate text-[11px] text-app-muted">
                          {a.key === "copyLink" && publicUrl ? publicUrl.replace(/^https:\/\//, "") : t(`dashboard.nav.quickCreate.${a.key}Desc`)}
                        </span>
                      </span>
                      {a.external ? <IconExternal className="h-4 w-4 flex-shrink-0 text-app-muted" /> : <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
