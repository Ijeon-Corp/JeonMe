"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { clearToken, logout as apiLogout } from "@/lib/api-client";
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
        <Link href="/admin" className="flex items-center gap-2 font-heading text-xl font-extrabold text-gradient">
          <IconShield className="h-5 w-5 text-primary" />
          Jeonme Admin
        </Link>

        <nav className="mt-8 flex flex-col gap-1 text-sm">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 font-semibold transition-colors ${
                  active
                    ? "bg-primary text-white shadow-card"
                    : "text-muted hover:bg-primary-subtle hover:text-primary"
                }`}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
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
          className="rounded-xl px-3.5 py-2.5 text-sm font-semibold text-muted hover:bg-primary-subtle hover:text-primary"
        >
          &larr; Kembali ke Dashboard
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          <IconLogout className="h-[18px] w-[18px]" />
          Keluar
        </button>
      </div>
    </>
  );

  return (
    <AdminGuard>
      <div className="flex min-h-screen bg-primary-subtle/30">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-screen w-64 flex-col justify-between border-r border-border bg-white p-5 md:flex">
          {sidebarContent}
        </aside>

        {/* Top bar + drawer mobile */}
        <div className="flex flex-1 flex-col md:contents">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white/90 px-4 py-3 backdrop-blur md:hidden">
            <Link href="/admin" className="flex items-center gap-1.5 font-heading text-lg font-extrabold text-gradient">
              <IconShield className="h-4 w-4 text-primary" />
              Jeonme Admin
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-ink hover:bg-primary-subtle"
              aria-label="Buka menu"
            >
              <IconMenu className="h-5 w-5" />
            </button>
          </header>

          {mobileOpen && (
            <div className="fixed inset-0 z-40 md:hidden">
              <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
              <aside className="absolute left-0 top-0 flex h-full w-72 flex-col justify-between bg-white p-5 shadow-hero">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-primary-subtle"
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
