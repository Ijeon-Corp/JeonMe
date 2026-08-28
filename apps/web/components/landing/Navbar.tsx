"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/locale-context";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLocale();

  // Perbaikan SEO (temuan audit, 15 Agustus 2026): "Fitur" & "Harga"
  // sekarang menuju halaman TERPISAH (/features, /pricing) yang bisa
  // diindeks & dibagikan langsung -- sebelumnya cuma anchor scroll
  // (#features/#pricing) dalam SATU halaman /, jadi tidak pernah dapat URL
  // & meta description sendiri di hasil pencarian. Sisanya (Template/
  // Monetisasi/Testimoni/FAQ) tetap anchor ke section homepage, TAPI diberi
  // prefiks "/" ("/#templates", dst) -- Navbar ini dipakai ulang di halaman
  // /features & /pricing juga, anchor polos ("#templates") di sana akan
  // diam-diam tidak melakukan apa pun karena section-nya tidak ada di
  // halaman itu; dengan prefiks "/" link tetap benar dari halaman mana pun
  // (navigasi ke home lalu scroll ke section). label pakai t() -- dihitung
  // ulang tiap render (bukan array module-level lagi) supaya ikut berganti
  // saat locale berubah.
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
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      // Permintaan langsung pengguna, 29 Agustus 2026: "buat navbar
      // warnanya solid jangan transparan ketika scroll" -- nav-glass
      // (rgba putih 78% + blur) SEBELUMNYA dipakai TERUS, scrolled cuma
      // menambah shadow. Sekarang begitu discroll, latar diganti solid
      // (bg-app-surface utuh, tanpa blur, ikut tema aktif) -- di paling
      // atas halaman (belum discroll) tetap kaca transparan seperti
      // sebelumnya.
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-app-border bg-app-surface shadow-sm" : "nav-glass"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" aria-label="Jeon.id home">
            <Logo />
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="cursor-pointer rounded-lg px-3.5 py-2 text-sm font-semibold text-app-muted transition-all duration-150 hover:bg-primary-subtle hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Bug link ditemukan langsung pengguna, 23 Agustus 2026:
              "diklik masih salah link nya" -- SEBELUMNYA "Masuk"/"Mulai
              Gratis" DUA-DUANYA menuju /dashboard, yang untuk pengunjung
              belum login akhirnya redirect client-side ke /login (lihat
              app/dashboard/layout.tsx) -- artinya SETIAP klik "Mulai
              Gratis" di seluruh homepage (di sini, Hero.tsx, FinalCTA.tsx)
              malah mendarat di form LOGIN, bukan form DAFTAR, untuk
              pengunjung baru yang belum py akun. Diperbaiki ke tujuan
              langsung yang benar. */}
          <div className="flex items-center gap-2">
            {/* Toggle dark/light + pilihan bahasa -- permintaan langsung
                pengguna, 29 Agustus 2026: "buatkan mode dark mode dan
                light mode dan juga pilihan bahasa en/id di navbar".
                Disembunyikan di layar sempit (sm:flex) supaya navbar
                mobile tidak sesak -- tetap ada di menu mobile yang
                terbuka lewat hamburger di bawah. */}
            <div className="hidden items-center gap-2 sm:flex">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <Link
              href="/login"
              className="hidden cursor-pointer text-sm font-bold text-primary transition-colors hover:text-primary-dark sm:block"
            >
              {t("nav.login")}
            </Link>
            <Link
              href="/register"
              className="btn-primary cursor-pointer rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm"
            >
              {t("nav.register")}
            </Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-app-ink lg:hidden"
              aria-label="Toggle menu"
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
          <div className="pb-4 lg:hidden">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="cursor-pointer rounded-lg px-3.5 py-2.5 text-sm font-semibold text-app-ink hover:bg-primary-subtle"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="cursor-pointer px-3.5 py-2.5 text-sm font-bold text-primary"
              >
                {t("nav.login")}
              </Link>
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
