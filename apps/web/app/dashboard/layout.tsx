"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import QRCodeModal from "@/components/QRCodeModal";
import {
  Workspace,
  clearToken,
  getActiveWorkspaceOwnerId,
  getMyPage,
  listWorkspaces,
  logout as apiLogout,
  setActiveWorkspaceOwnerId,
} from "@/lib/api-client";
import {
  IconBell,
  IconBook,
  IconBox,
  IconCalendar,
  IconChart,
  IconClock,
  IconClose,
  IconCopy,
  IconExternal,
  IconGift,
  IconGlobe,
  IconHeart,
  IconInbox,
  IconLink,
  IconLogout,
  IconMenu,
  IconPhone,
  IconQrCode,
  IconSettings,
  IconShield,
  IconSparkle,
  IconStar,
  IconTag,
  IconUsers,
  IconWallet,
} from "@/components/icons";

type NavLeaf = { href: string; label: string; icon: typeof IconChart };
type NavEntry = ({ type: "link" } & NavLeaf) | { type: "group"; label: string; items: NavLeaf[] };

// "Halaman Saya" mengelompokkan Tautan/Produk/Desain jadi satu bagian --
// ketiganya sama-sama menentukan apa yang tampil di halaman publik kreator
// dan berbagi satu panel pratinjau langsung (lihat LivePreviewPanel).
// "Produk & Monetisasi" baru ditambahkan mulai No.67 (voucher) -- sengaja
// tidak dibuat kosong sejak redesain IA (No.97), baru muncul begitu ada
// fitur nyata pertama yang mengisinya.
const NAV_ITEMS: NavEntry[] = [
  { type: "link", href: "/dashboard", label: "Ringkasan", icon: IconChart },
  {
    type: "group",
    label: "Halaman Saya",
    items: [
      { href: "/dashboard/links", label: "Tautan", icon: IconLink },
      { href: "/dashboard/products", label: "Produk", icon: IconBox },
      { href: "/dashboard/design", label: "Desain", icon: IconSparkle },
      { href: "/dashboard/custom-domain", label: "Domain Kustom", icon: IconGlobe },
      { href: "/dashboard/pages", label: "Halaman Tambahan", icon: IconGlobe },
    ],
  },
  {
    type: "group",
    label: "Produk & Monetisasi",
    items: [
      { href: "/dashboard/vouchers", label: "Voucher", icon: IconTag },
      { href: "/dashboard/bundles", label: "Bundel", icon: IconGift },
      { href: "/dashboard/donation", label: "Dukungan", icon: IconHeart },
      { href: "/dashboard/affiliates", label: "Afiliasi", icon: IconUsers },
      { href: "/dashboard/loyalty", label: "Loyalitas", icon: IconStar },
      { href: "/dashboard/events", label: "Event", icon: IconCalendar },
      { href: "/dashboard/courses", label: "Kelas & Kursus", icon: IconBook },
      { href: "/dashboard/bookings", label: "Booking Konsultasi", icon: IconClock },
    ],
  },
  {
    type: "group",
    label: "Audiens & Pemasaran",
    items: [
      { href: "/dashboard/audience", label: "Audiens", icon: IconInbox },
      { href: "/dashboard/social-proof", label: "Social Proof", icon: IconBell },
      { href: "/dashboard/business-card", label: "Kartu Kontak", icon: IconPhone },
    ],
  },
  { type: "link", href: "/dashboard/balance", label: "Saldo & Penarikan", icon: IconWallet },
  { type: "link", href: "/dashboard/kyc", label: "Verifikasi KYC", icon: IconShield },
  { type: "link", href: "/dashboard/team", label: "Tim & Kolaborator", icon: IconUsers },
  { type: "link", href: "/dashboard/settings", label: "Pengaturan", icon: IconSettings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeOwnerId, setActiveOwnerIdState] = useState<string | null>(() => getActiveWorkspaceOwnerId());

  useEffect(() => {
    getMyPage()
      .then((p) => setUsername(p.username))
      .catch(() => {
        // Chip tautan publik cuma kemudahan tambahan -- kalau gagal dimuat,
        // diamkan saja, jangan ganggu dashboard dengan pesan error.
      });

    // No.87: pemilih ruang kerja hanya tampil kalau pengguna ini punya lebih
    // dari satu ruang kerja (dirinya sendiri + minimal satu kolaborasi aktif).
    listWorkspaces()
      .then(setWorkspaces)
      .catch(() => {
        // Sama seperti di atas -- gagal dimuat diamkan saja.
      });
  }, []);

  function handleWorkspaceChange(ownerId: string) {
    const isSelf = workspaces.find((w) => w.owner_user_id === ownerId)?.is_self;
    setActiveWorkspaceOwnerId(isSelf ? null : ownerId);
    // Reload penuh -- cara paling sederhana & aman supaya SEMUA halaman
    // dashboard yang sedang terbuka mengambil ulang datanya sesuai ruang
    // kerja baru, tanpa perlu menyambungkan event "ganti ruang kerja" ke
    // tiap halaman satu per satu.
    window.location.reload();
  }

  function handleCopyLink() {
    if (!username) return;
    navigator.clipboard.writeText(`https://jeonme.com/${username}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      // Tetap lanjut hapus token lokal walau request revoke ke server gagal
      // (mis. token sudah kedaluwarsa) -- pengguna tetap harus bisa keluar.
    } finally {
      clearToken();
      router.push("/login");
    }
  }

  const sidebarContent = (
    <>
      <div>
        <Link href="/dashboard" className="font-heading text-xl font-extrabold text-gradient">
          Jeonme
        </Link>

        {workspaces.length > 1 && (
          <div className="mt-4">
            <label className="px-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
              Kelola sebagai
            </label>
            <select
              value={activeOwnerId ?? workspaces.find((w) => w.is_self)?.owner_user_id ?? ""}
              onChange={(e) => {
                setActiveOwnerIdState(e.target.value);
                handleWorkspaceChange(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-2 text-xs font-semibold text-ink focus:border-primary focus:outline-none"
            >
              {workspaces.map((w) => (
                <option key={w.owner_user_id} value={w.owner_user_id}>
                  {w.is_self ? "Akun saya" : `@${w.owner_username}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="mt-8 flex flex-col gap-1 text-sm">
          {NAV_ITEMS.map((item) => {
            if (item.type === "link") {
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
            }

            return (
              <div key={item.label} className="mt-3 first:mt-0">
                <p className="px-3.5 text-[11px] font-bold uppercase tracking-wider text-muted/70">{item.label}</p>
                <div className="mt-1 flex flex-col gap-1">
                  {item.items.map((sub) => {
                    const active = pathname === sub.href;
                    const Icon = sub.icon;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 font-semibold transition-colors ${
                          active
                            ? "bg-primary text-white shadow-card"
                            : "text-muted hover:bg-primary-subtle hover:text-primary"
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3">
        {username && (
          <div className="rounded-xl border border-border bg-primary-subtle/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Halaman publikmu</p>
            <p className="mt-1 truncate text-xs font-semibold text-ink">jeonme.com/{username}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-white py-1.5 text-[11px] font-semibold text-ink hover:border-primary hover:text-primary"
              >
                <IconCopy className="h-3 w-3" />
                {copied ? "Tersalin!" : "Salin"}
              </button>
              <a
                href={`https://jeonme.com/${username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-ink/5 py-1.5 text-[11px] font-semibold text-ink hover:bg-ink/10"
              >
                <IconExternal className="h-3 w-3" />
                Lihat
              </a>
            </div>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-white py-1.5 text-[11px] font-semibold text-ink hover:border-primary hover:text-primary"
            >
              <IconQrCode className="h-3 w-3" />
              Kode QR
            </button>
          </div>
        )}

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
    <AuthGuard>
      <div className="flex min-h-screen bg-primary-subtle/30">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-screen w-64 flex-col justify-between border-r border-border bg-white p-5 md:flex">
          {sidebarContent}
        </aside>

        {/* Top bar + drawer mobile */}
        <div className="flex flex-1 flex-col md:contents">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white/90 px-4 py-3 backdrop-blur md:hidden">
            <Link href="/dashboard" className="font-heading text-lg font-extrabold text-gradient">
              Jeonme
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

      {qrOpen && username && (
        <QRCodeModal url={`https://jeonme.com/${username}`} username={username} onClose={() => setQrOpen(false)} />
      )}
    </AuthGuard>
  );
}
