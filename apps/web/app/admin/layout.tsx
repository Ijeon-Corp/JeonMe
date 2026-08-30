"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { clearToken, logout as apiLogout } from "@/lib/api-client";
import { ShieldAlert } from "lucide-react";
import {
  IconChart,
  IconClose,
  IconFlag,
  IconLogout,
  IconMenu,
  IconShield,
  IconUsers,
  IconWallet,
} from "@/components/icons";

const NAV_ITEMS = [
  { href: "/admin", label: "Ringkasan", icon: IconChart },
  { href: "/admin/users", label: "Pengguna", icon: IconUsers },
  { href: "/admin/reports", label: "Laporan", icon: IconFlag },
  { href: "/admin/payouts", label: "Penarikan", icon: IconWallet },
  { href: "/admin/kyc", label: "Review KYC", icon: IconShield },
  { href: "/admin/moderasi", label: "Moderasi Tautan", icon: ShieldAlert },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      // Tetap lanjut hapus token lokal walau request revoke ke server gagal.
    } finally {
      clearToken();
      router.push("/login");
    }
  }

  const sidebarContent = (
    <>
      <div>
        {/* Wordmark redesign Fase 3 (spec §9) -- teks jeon.id huruf kecil
            + chip Admin, menggantikan logo-baru.png lama; pola sidebar
            sama persis dashboard/layout.tsx (ungu-hitam jeon-sidebar,
            item aktif garis ungu kiri). */}
        <Link href="/admin" className="flex items-baseline gap-1.5 font-display text-lg font-extrabold tracking-tight text-white">
          <span className="text-jeon-lime" aria-hidden="true">✦</span>jeon.id
          <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">Admin</span>
        </Link>

        <nav className="mt-8 flex flex-col gap-0.5 text-sm">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2.5 font-semibold transition-all ${
                  active
                    ? "border-jeon-purple bg-jeon-purple/25 text-white"
                    : "border-transparent text-white/55 hover:bg-white/5 hover:text-white/85"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          onClick={() => setMobileOpen(false)}
          className="rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white/55 hover:bg-white/5 hover:text-white/85"
        >
          &larr; Kembali ke Dashboard
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-red-300 hover:bg-white/5"
        >
          <IconLogout className="h-[18px] w-[18px]" />
          Keluar
        </button>
      </div>
    </>
  );

  return (
    <AdminGuard>
      {/* bg-mesh + sidebar "glass" -- sama seperti dashboard/layout.tsx,
          lihat catatan panjang di sana soal overflow-hidden terpisah
          supaya tidak mematikan sticky. */}
      <div className="bg-mesh pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
      <div className="app-shell flex min-h-screen">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-screen w-[var(--dashboard-sidebar)] flex-col justify-between bg-jeon-sidebar p-5 shadow-refined-lg md:flex">
          {sidebarContent}
        </aside>

        {/* Top bar + drawer mobile */}
        <div className="flex flex-1 flex-col md:contents">
          <header className="nav-glass sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden">
            <Link href="/admin" className="flex items-baseline gap-1 font-display text-lg font-extrabold tracking-tight text-app-ink">
              <span className="text-jeon-purple" aria-hidden="true">✦</span>jeon.id
              <span className="ml-1 text-sm font-bold text-app-muted">Admin</span>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-app-ink hover:bg-app-surface-2"
              aria-label="Buka menu"
            >
              <IconMenu className="h-5 w-5" />
            </button>
          </header>

          {mobileOpen && (
            <div className="fixed inset-0 z-40 md:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
              <aside className="absolute left-0 top-0 flex h-full w-72 flex-col justify-between bg-jeon-sidebar p-5 shadow-hero">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="absolute right-4 top-4 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label="Tutup menu"
                >
                  <IconClose className="h-5 w-5" />
                </button>
                {sidebarContent}
              </aside>
            </div>
          )}

          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}
