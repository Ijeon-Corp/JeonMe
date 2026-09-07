"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { Me, clearToken, getMe, logout as apiLogout } from "@/lib/api-client";
import { MessageCircle, ShieldAlert } from "lucide-react";
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
  { href: "/admin/support-chat", label: "Live Chat", icon: MessageCircle },
  { href: "/admin/moderasi", label: "Moderasi Tautan", icon: ShieldAlert },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // me/profileMenuOpen -- permintaan langsung pengguna, 5 September 2026:
  // "buat navbar juga seperti di dashboard jadi di ujung kanan ada profile
  // dan tombol logout ketika di klik profile nya". Pola SAMA PERSIS dengan
  // dashboard/layout.tsx (avatar bulat -> dropdown -> logout), cuma sumber
  // identitasnya getMe() (email/username akun sendiri), bukan getMyPage()
  // (data halaman publik kreator -- tidak relevan utk akun admin).
  const [me, setMe] = useState<Me | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => {
        // Identitas cuma utk tampilan navbar -- gagal dimuat diamkan saja,
        // AdminGuard sendiri yang menegakkan akses sungguhan.
      });
  }, []);

  // isSupportOnly -- permintaan langsung pengguna, 7 September 2026:
  // "butuh role khusus untuk menangani live chat dsb jangan hak akses
  // admin yang full". role='support' cuma boleh melihat menu Live Chat --
  // sisi backend SUDAH menolak (middleware.SupportRequired vs
  // AdminRequired, lihat routes.go), redirect di sini murni supaya
  // pengalamannya tidak "diam-diam 403" kalau nyasar ke rute lain (mis.
  // bookmark lama, atau klik logo yang dulu selalu ke /admin).
  const isSupportOnly = me?.role === "support";
  useEffect(() => {
    if (isSupportOnly && pathname !== "/admin/support-chat") {
      router.replace("/admin/support-chat");
    }
  }, [isSupportOnly, pathname, router]);

  const visibleNavItems = isSupportOnly ? NAV_ITEMS.filter((item) => item.href === "/admin/support-chat") : NAV_ITEMS;

  useEffect(() => {
    if (!profileMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileMenuOpen]);

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

  const identityLabel = me?.username ? `@${me.username}` : me?.email ?? "";
  const avatarInitial = (me?.username || me?.email || "?").slice(0, 1).toUpperCase();

  const sidebarContent = (
    <>
      <div>
        {/* Wordmark redesign Fase 3 (spec §9) -- teks jeon.id huruf kecil
            + chip Admin, menggantikan logo-baru.png lama; pola sidebar
            sama persis dashboard/layout.tsx (ungu-hitam jeon-sidebar,
            item aktif garis ungu kiri). */}
        <Link href={isSupportOnly ? "/admin/support-chat" : "/admin"} className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jeon-logo-new-dark.png" alt="jeon.id" className="h-7 w-auto" />
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">
            {isSupportOnly ? "Support" : "Admin"}
          </span>
        </Link>

        <nav className="mt-8 flex flex-col gap-0.5 text-sm">
          {visibleNavItems.map((item) => {
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

      {/* "Kembali ke Dashboard" & tombol "Keluar" berdiri sendiri SEBELUMNYA
          ada di sini -- dihapus (5 September 2026): admin sekarang direct ke
          /admin begitu login dan TIDAK BISA mengakses /dashboard sama sekali
          (lihat redirect role di dashboard/layout.tsx), jadi tautan "kembali"
          itu cuma akan memantul balik ke /admin lewat redirect tsb -- murni
          membingungkan. Logout pindah ke dropdown profil di top bar (mobile:
          tetap ada di menu drawer lewat sidebarContent yang sama, lihat blok
          identitas mobile di bawah). */}
      <div className="flex flex-col gap-1 border-t border-white/10 pt-3 md:hidden">
        <div className="flex items-center gap-2.5 px-3.5 py-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-jeon-lavender font-display text-xs font-bold text-[#111111]">
            {avatarInitial}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/70">{identityLabel}</span>
        </div>
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

        {/* Top bar + drawer mobile -- SEBELUMNYA pakai "md:contents" (div ini
            "menghilang" jadi kotak layout begitu masuk md:+, anak-anaknya
            langsung jadi flex item app-shell). Itu justru penyebab overflow
            horizontal +169px di tablet: min-w-0 yang dipasang DI SINI ikut
            hilang tak berlaku begitu md:contents aktif, dan <main> jadi flex
            item BARU tanpa min-w-0 sendiri. dashboard/layout.tsx (pola yang
            sudah terbukti benar) TIDAK PERNAH pakai trik ini sama sekali --
            disamakan di sini, div selalu jadi kotak flex sungguhan di semua
            breakpoint. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="nav-glass sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden">
            <Link href={isSupportOnly ? "/admin/support-chat" : "/admin"} className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/jeon-logo-new.png" alt="jeon.id" className="brand-logo-light h-7 w-auto" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/jeon-logo-new-dark.png" alt="jeon.id" className="brand-logo-dark h-7 w-auto" />
              <span className="text-sm font-bold text-app-muted">{isSupportOnly ? "Support" : "Admin"}</span>
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

          {/* Top bar desktop -- SEBELUMNYA tidak ada sama sekali di admin
              (beda dari dashboard/layout.tsx yang selalu punya top bar
              desktop dengan avatar+dropdown). Permintaan langsung pengguna:
              profil di ujung kanan, klik -> dropdown berisi identitas +
              logout, pola SAMA PERSIS dashboard. */}
          <header className="nav-glass sticky top-0 z-20 hidden h-[72px] items-center justify-between gap-3 px-6 md:flex">
            <p className="min-w-0 flex-1 truncate font-display text-base font-bold text-app-ink">
              {NAV_ITEMS.find((item) => item.href === pathname)?.label ?? "Admin"}
            </p>
            {me && (
              <div className="relative flex-shrink-0" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  title={identityLabel}
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  className="flex items-center gap-2 rounded-full border-2 border-jeon-ink bg-app-surface py-1 pl-1 pr-2.5 hover:border-jeon-purple"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-jeon-lavender font-display text-[11px] font-bold text-[#111111]">
                    {avatarInitial}
                  </span>
                  <span className="hidden items-center gap-1 text-[11px] font-semibold text-app-ink lg:flex">
                    {identityLabel}
                    <span className="rounded-full bg-jeon-lavender px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#111111]">
                      {isSupportOnly ? "Support" : "Admin"}
                    </span>
                  </span>
                </button>
                {profileMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-48 overflow-hidden rounded-jmd border-2 border-jeon-ink bg-app-surface py-1.5 shadow-card"
                  >
                    <div className="border-b border-app-border px-4 py-2 text-xs font-semibold text-app-muted">{me.email}</div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        handleLogout();
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-app-surface-2"
                    >
                      <IconLogout className="h-4 w-4" />
                      Keluar
                    </button>
                  </div>
                )}
              </div>
            )}
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
