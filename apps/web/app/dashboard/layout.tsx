"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { ToastProvider } from "@/components/Toast";
import TwoFactorPrompt from "@/components/TwoFactorPrompt";
import AccountDeletionBanner from "@/components/AccountDeletionBanner";
import OnboardingBanner from "@/components/OnboardingBanner";
import NotificationBell from "@/components/NotificationBell";
import GlobalSearch from "@/components/GlobalSearch";
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
  IconChevronRight,
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
  IconPlayCircle,
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
  { type: "link", href: "/dashboard/tutorial", label: "Tutorial", icon: IconPlayCircle },
  {
    type: "group",
    label: "Halaman Saya",
    items: [
      { href: "/dashboard/links", label: "Link Bio", icon: IconLink },
      { href: "/dashboard/products", label: "Toko", icon: IconBox },
      { href: "/dashboard/statistik", label: "Statistik", icon: IconChart },
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

// currentPageLabel -- judul top bar desktop (di bawah) mengikuti label item
// nav yang sedang aktif, termasuk yang berada di dalam grup collapsible.
function currentPageLabel(pathname: string): string {
  for (const item of NAV_ITEMS) {
    if (item.type === "link" && item.href === pathname) return item.label;
    if (item.type === "group") {
      const found = item.items.find((sub) => sub.href === pathname);
      if (found) return found.label;
    }
  }
  return "Dashboard";
}

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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeOwnerId, setActiveOwnerIdState] = useState<string | null>(() => getActiveWorkspaceOwnerId());

  // Menu per grup jadi collapsible (permintaan langsung pengguna) --
  // sidebar sudah terlalu panjang (~21 item nav di 3 grup + 5 tautan
  // lepas) untuk selalu tampil terbuka semua. Grup yang berisi halaman
  // aktif saat pertama kali layout ini dimuat otomatis terbuka (dihitung
  // sekali lewat initializer useState, memakai pathname yang sudah
  // tersedia saat render pertama), grup lain mulai tertutup. Sesudahnya
  // sepenuhnya dikendalikan manual oleh klik pengguna -- SENGAJA tidak
  // dipaksa terbuka ulang lewat effect setiap pathname berubah (selain
  // menghindari pola setState-di-dalam-effect yang anti-pola React, itu
  // juga akan membuat tombol tutup terasa "rusak" -- diklik tapi grup
  // yang berisi halaman aktif tidak pernah benar-benar tertutup).
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of NAV_ITEMS) {
      if (item.type === "group" && item.items.some((sub) => sub.href === pathname)) {
        initial.add(item.label);
      }
    }
    return initial;
  });

  function toggleGroup(label: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

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
        <Link href="/dashboard" className="font-heading text-lg font-extrabold text-gradient">
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

        {/* Redesain "Card-Based Layout" (permintaan langsung pengguna,
            referensi tangkapan layar dashboard SQUARE): item aktif
            SEBELUMNYA blok solid bg-primary+teks putih (berat, kontras
            keras dengan sisa sidebar) -- sekarang pil lembut
            (bg-primary-subtle+teks primary) dengan garis aksen tipis di
            sisi kiri (inset shadow, bukan border-l supaya rounded-xl tetap
            utuh di semua sisi) supaya senada dengan gaya kartu di seluruh
            dashboard, bukan lagi elemen yang terasa terpisah gayanya. */}
        <nav className="mt-6 flex flex-col gap-1 text-xs">
          {NAV_ITEMS.map((item) => {
            if (item.type === "link") {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 font-semibold transition-colors ${
                    active
                      ? "bg-primary-subtle font-bold text-primary shadow-[inset_3px_0_0_0_#1B4D3E]"
                      : "text-muted hover:bg-primary-subtle/60 hover:text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              );
            }

            const groupHasActive = item.items.some((sub) => sub.href === pathname);
            const expanded = expandedGroups.has(item.label);
            return (
              <div key={item.label} className="mt-3 first:mt-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(item.label)}
                  className="flex w-full items-center justify-between rounded-lg px-3.5 py-1.5 text-left hover:bg-primary-subtle/50"
                >
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider ${groupHasActive ? "text-primary" : "text-muted/70"}`}
                  >
                    {item.label}
                  </span>
                  <IconChevronRight
                    className={`h-3.5 w-3.5 flex-shrink-0 text-muted/50 transition-transform ${expanded ? "rotate-90" : ""}`}
                  />
                </button>
                {expanded && (
                  <div className="mt-1 flex flex-col gap-1">
                    {item.items.map((sub) => {
                      const active = pathname === sub.href;
                      const Icon = sub.icon;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 font-semibold transition-colors ${
                            active
                              ? "bg-primary-subtle font-bold text-primary shadow-[inset_3px_0_0_0_#1B4D3E]"
                              : "text-muted hover:bg-primary-subtle/60 hover:text-primary"
                          }`}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          <IconLogout className="h-4 w-4" />
          Keluar
        </button>
      </div>
    </>
  );

  return (
    <AuthGuard>
      <ToastProvider>
        <AccountDeletionBanner />
        <OnboardingBanner />
        <TwoFactorPrompt />
        <div className="flex min-h-screen bg-primary-subtle/50">
          {/* Sidebar desktop */}
          <aside className="sticky top-0 hidden h-screen w-64 flex-col justify-between border-r border-border bg-white p-5 md:flex">
            {sidebarContent}
          </aside>

          {/* Kolom konten: top bar (mobile & desktop, beda isi) + drawer
              mobile + main. SEBELUMNYA "md:contents" (menghilangkan kotak
              div ini di desktop, karena dulu tidak ada top bar desktop --
              hanya "main" yang perlu jadi flex item lebar penuh di samping
              sidebar). Sekarang ada top bar desktop juga (permintaan
              pengguna) -- "contents" dihapus karena membuatnya ikut
              "terangkat" jadi flex item SEJAJAR (searah baris) dengan aside
              & main, bukan menumpuk di ATAS main seperti yang dimaksud. */}
          {/* Bug ditemukan (5 Agustus 2026, audit responsif): min-w-0 WAJIB
              di sini -- tanpanya, flex item defaultnya min-width:auto (tidak
              mau menyusut di bawah lebar konten alaminya). Begitu SATU
              halaman punya baris yang tidak menyusut (mis. input+tombol
              sejajar), SELURUH shell (termasuk header & sidebar drawer)
              ikut melebar mengikuti kolom ini, bukan cuma baris yang
              bersangkutan -- inilah kenapa overflow ~12px selalu muncul di
              SEMUA halaman, bukan cuma yang kontennya sendiri "salah". */}
          <div className="flex min-w-0 flex-1 flex-col">
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

            {/* Top bar desktop -- permintaan langsung pengguna (tangkapan
                layar top bar Linktree): notifikasi, akses cepat ke halaman
                publik/Pengaturan, & tautan publik supaya tidak perlu buka
                sidebar tiap kali. "Enhance" (AI) SENGAJA tidak dibuat --
                Jeonme belum punya fitur AI enhance apa pun (lihat keputusan
                yang disepakati). */}
            <header className="sticky top-0 z-20 hidden items-center justify-between gap-3 border-b border-border bg-white/90 px-6 py-2.5 backdrop-blur md:flex">
              {/* Bug ditemukan (5 Agustus 2026, audit responsif): judul
                  DAN grup ikon di kanan sebelumnya sama-sama tidak bisa
                  menyusut -- di lebar tablet (768-1023px) totalnya melebihi
                  lebar layar, memaksa SELURUH halaman melebar horizontal.
                  min-w-0+truncate di judul membiarkan JUDUL yang mengalah
                  duluan (konten paling tidak krusial di baris ini) supaya
                  grup ikon (fungsional) tetap utuh. */}
              <p className="min-w-0 flex-1 truncate font-heading text-base font-bold text-ink">{currentPageLabel(pathname)}</p>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <GlobalSearch />
                {username && (
                  <a
                    href={`https://jeonme.com/${username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Lihat halaman publik"
                    aria-label="Lihat halaman publik"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-ink hover:border-primary hover:text-primary"
                  >
                    <IconExternal className="h-4 w-4" />
                  </a>
                )}
                <Link
                  href="/dashboard/settings"
                  title="Pengaturan"
                  aria-label="Pengaturan"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-ink hover:border-primary hover:text-primary"
                >
                  <IconSettings className="h-4 w-4" />
                </Link>
                <NotificationBell />
                {username && (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    title="Salin tautan halaman publik"
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-ink hover:border-primary hover:text-primary"
                  >
                    {/* Teks domain penuh cuma tampil mulai lg: (>=1024px,
                        sama seperti label GlobalSearch) -- di rentang
                        tablet cukup ikon salin saja supaya baris ini tidak
                        ikut memaksa halaman melebar horizontal. */}
                    <span className="hidden lg:inline">jeonme.com/{username}</span>
                    <IconCopy className="h-3 w-3" />
                    {copied && <span className="text-primary">Tersalin!</span>}
                  </button>
                )}
              </div>
            </header>

            <main className="flex-1 p-4 sm:p-6">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </AuthGuard>
  );
}
