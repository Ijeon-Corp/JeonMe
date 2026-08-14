"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";

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
// (navigasi ke home lalu scroll ke section).
const navLinks = [
  { href: "/features", label: "Fitur" },
  { href: "/#templates", label: "Template" },
  { href: "/#monetization", label: "Monetisasi" },
  { href: "/pricing", label: "Harga" },
  { href: "/#testimonials", label: "Testimoni" },
  { href: "/#faq", label: "FAQ" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`nav-glass fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "shadow-sm" : ""
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" aria-label="Jeonme home">
            <Logo />
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="cursor-pointer rounded-lg px-3.5 py-2 text-sm font-semibold text-muted transition-all duration-150 hover:bg-primary-subtle hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="hidden cursor-pointer text-sm font-bold text-primary transition-colors hover:text-primary-dark sm:block"
            >
              Masuk
            </Link>
            <Link
              href="/dashboard"
              className="btn-primary cursor-pointer rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm"
            >
              Mulai Gratis
            </Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink lg:hidden"
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
                  className="cursor-pointer rounded-lg px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-primary-subtle"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="cursor-pointer px-3.5 py-2.5 text-sm font-bold text-primary"
              >
                Masuk
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
