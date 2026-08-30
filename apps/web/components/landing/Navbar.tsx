"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { getToken } from "@/lib/api-client";
import { useLocale } from "@/lib/locale-context";

// Navbar marketing -- Redesign "Modern Playful Creator Platform"
// (DESIGN-JEONID-REDESIGN.md §11.1, Fase 2): sticky ~80px desktop, wordmark
// jeon.id kiri, CTA pil ungu ber-outline ink. Perilaku LAMA yang
// dipertahankan (REDESIGN-AUDIT.md): solid saat discroll (permintaan
// eksplisit pengguna 29 Agustus 2026), toggle dark/light + bahasa, link
// /features & /pricing sebagai halaman terpisah (SEO), CTA daftar menuju
// /register (bug lama yang pernah diperbaiki -- JANGAN kembali ke
// /dashboard).
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // loggedIn -- spec §11.1: CTA utama "Mulai gratis" ATAU "Buka dashboard"
  // sesuai auth state. Dibaca SETELAH mount (bukan di initializer) karena
  // token ada di localStorage yang tidak tersedia saat SSR -- pola sama
  // AuthGuard.tsx, render pertama server & klien identik (CTA daftar).
  const [loggedIn, setLoggedIn] = useState(false);
  const { t } = useLocale();

  const navLinks = [
    { href: "/features", label: t("nav.features") },
    { href: "/#templates", label: t("nav.templates") },
    { href: "/#monetization", label: t("nav.monetization") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/#testimonials", label: t("nav.testimonials") },
    { href: "/#faq", label: t("nav.faq") },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- baca localStorage browser-only setelah mount, pola AuthGuard.tsx
    setLoggedIn(!!getToken());
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const ctaHref = loggedIn ? "/dashboard" : "/register";
  const ctaLabel = loggedIn ? t("nav.openDashboard") : t("nav.register");

  return (
    <nav
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-jeon-border bg-jeon-paper/95 backdrop-blur-sm" : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="flex h-[68px] items-center justify-between md:h-20">
          <Link href="/" aria-label="jeon.id home" className="cursor-pointer">
            <Logo />
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="cursor-pointer rounded-jsm px-3.5 py-2 text-sm font-semibold text-jeon-muted transition-all duration-150 hover:bg-jeon-surface-2 hover:text-jeon-ink"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden items-center gap-2 sm:flex">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            {!loggedIn && (
              <Link
                href="/login"
                className="hidden cursor-pointer text-sm font-bold text-jeon-ink underline-offset-4 transition-colors hover:text-jeon-purple hover:underline sm:block"
              >
                {t("nav.login")}
              </Link>
            )}
            <Link
              href={ctaHref}
              className="cursor-pointer rounded-jmd border-2 border-jeon-ink bg-jeon-purple px-5 py-2.5 text-sm font-bold text-white shadow-[3px_3px_0_var(--jeon-ink)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
            >
              {ctaLabel}
            </Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-jsm text-jeon-ink lg:hidden"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="rounded-b-jlg border-x border-b border-jeon-border bg-jeon-surface pb-4 lg:hidden">
            <div className="flex flex-col gap-1 pt-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="cursor-pointer rounded-jsm px-3.5 py-2.5 text-sm font-semibold text-jeon-ink hover:bg-jeon-surface-2"
                >
                  {link.label}
                </Link>
              ))}
              {!loggedIn && (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="cursor-pointer px-3.5 py-2.5 text-sm font-bold text-jeon-purple"
                >
                  {t("nav.login")}
                </Link>
              )}
              <div className="mt-2 flex items-center gap-2 px-3.5 sm:hidden">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
