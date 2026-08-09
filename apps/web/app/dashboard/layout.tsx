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
  IconBox,
  IconChart,
  IconChevronRight,
  IconClose,
  IconCopy,
  IconExternal,
  IconGift,
  IconGlobe,
  IconInbox,
  IconLink,
  IconLogout,
  IconMenu,
  IconPhone,
  IconPlayCircle,
  IconSettings,
  IconSparkle,
  IconWallet,
} from "@/components/icons";

type NavLeaf = { href: string; label: string; icon: typeof IconChart };
type NavEntry = ({ type: "link" } & NavLeaf) | { type: "group"; label: string; items: NavLeaf[] };

// Konsolidasi sidebar (permintaan langsung pengguna, benchmark vs
// Linktree/Lynk.id, 8 Agustus 2026): sidebar SEBELUMNYA 23 baris nav --
// jauh lebih berat dari kompetitor, yang menyamaratakan "Home/Shop/
// Analytics/Appearance" sebagai satu-satunya menu inti yang SELALU
// tampil. Akar masalahnya BUKAN jumlah fitur (Jeonme memang lebih
// lengkap), tapi 8 dari 23 baris itu cuma VARIAN TIPE PRODUK (Voucher/
// Bundel/Dukungan/Afiliasi/Loyalitas/Event/Kelas/Booking) yang di
// kompetitor cuma PILIHAN dalam satu alur "Tambah Produk", bukan 8 menu
// terpisah. Perubahan di sini MURNI kedalaman navigasi -- TIDAK ADA
// fitur/halaman yang dihapus:
// - 8 baris "Produk & Monetisasi" -> 1 baris ke hub kartu
//   /dashboard/monetisasi (pola sama seperti /dashboard/settings).
// - Verifikasi KYC, Tim & Kolaborator, Domain Kustom -> pindah jadi
//   kartu di dalam /dashboard/settings (Tim malah SUDAH lama ada di
//   sana juga, cuma dobel-tampil di sidebar utama sebelumnya).
// - Tutorial -> bukan lagi baris sidebar permanen, jadi ikon bantuan
//   bulat di top bar (lihat header desktop di bawah), sejalan dengan
//   pola Linktree/Lynk.id yang taruh onboarding di ikon "?", bukan slot
//   menu tetap.
// Hasil: 23 baris jadi ~14 baris, "Halaman Saya" mengelompokkan
// Tautan/Produk/Desain jadi satu bagian karena ketiganya sama-sama
// menentukan apa yang tampil di halaman publik kreator & berbagi satu
// panel pratinjau langsung (lihat LivePreviewPanel).
const NAV_ITEMS: NavEntry[] = [
  { type: "link", href: "/dashboard", label: "Ringkasan", icon: IconChart },
  {
    type: "group",
    label: "Halaman Saya",
    items: [
      { href: "/dashboard/links", label: "Link Bio", icon: IconLink },
      { href: "/dashboard/products", label: "Toko", icon: IconBox },
      { href: "/dashboard/statistik", label: "Statistik", icon: IconChart },
      { href: "/dashboard/design", label: "Desain", icon: IconSparkle },
      { href: "/dashboard/pages", label: "Halaman Tambahan", icon: IconGlobe },
    ],
  },
  { type: "link", href: "/dashboard/monetisasi", label: "Produk & Monetisasi", icon: IconGift },
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
  { type: "link", href: "/dashboard/settings", label: "Pengaturan", icon: IconSettings },
];

// EXTRA_PAGE_LABELS -- halaman yang TIDAK (lagi) muncul sebagai baris
// NAV_ITEMS langsung (dipindah ke dalam hub /dashboard/monetisasi atau
// /dashboard/settings, lihat catatan konsolidasi di atas) tapi rute-nya
// TETAP ada persis seperti sebelumnya -- didaftar di sini supaya judul
// top bar desktop tidak jatuh balik ke "Dashboard" generik saat halaman
// ini dibuka langsung.
const EXTRA_PAGE_LABELS: Record<string, string> = {
  "/dashboard/tutorial": "Tutorial",
  "/dashboard/custom-domain": "Domain Kustom",
  "/dashboard/kyc": "Verifikasi KYC",
  "/dashboard/team": "Tim & Kolaborator",
  "/dashboard/vouchers": "Voucher",
  "/dashboard/bundles": "Bundel",
  "/dashboard/donation": "Dukungan",
  "/dashboard/affiliates": "Afiliasi",
  "/dashboard/loyalty": "Loyalitas",
  "/dashboard/events": "Event",
  "/dashboard/courses": "Kelas & Kursus",
  "/dashboard/bookings": "Booking Konsultasi",
  "/dashboard/settings/profile": "Profil & Akun",
  "/dashboard/settings/security": "Keamanan",
  "/dashboard/settings/payment": "Pembayaran & Penarikan",
  "/dashboard/settings/subscription": "Langganan Premium",
  "/dashboard/settings/danger-zone": "Zona Berbahaya",
};

// currentPageLabel -- judul top bar desktop (di bawah) mengikuti label item
// nav yang sedang aktif, termasuk yang berada di dalam grup collapsible,
// jatuh balik ke EXTRA_PAGE_LABELS untuk halaman yang sengaja tidak lagi
// muncul di sidebar utama (lihat catatan konsolidasi di atas).
function currentPageLabel(pathname: string): string {
  for (const item of NAV_ITEMS) {
    if (item.type === "link" && item.href === pathname) return item.label;
    if (item.type === "group") {
      const found = item.items.find((sub) => sub.href === pathname);
      if (found) return found.label;
    }
  }
  return EXTRA_PAGE_LABELS[pathname] ?? "Dashboard";
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
  const [avatarUrl, setAvatarUrl] = useState("");
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
      .then((p) => {
        setUsername(p.username);
        setAvatarUrl(p.avatar_url);
      })
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
        {/* Redesain "Premium Refined" (permintaan langsung pengguna, 9
            Agustus 2026, menggantikan arah "Playful Creator" sore
            harinya): sidebar jadi hijau tua PEKAT (bukan lagi glass
            terang) -- satu pernyataan warna percaya diri, bukan latar
            netral.
            Logo -- permintaan langsung pengguna, 10 Agustus 2026: pakai
            logo-baru.png. Warna glyph-nya sendiri hijau tua (nyaris sama
            dengan latar sidebar ini, kontras diukur cuma ~1.4:1, nyaris
            tak kebaca kalau ditaruh langsung) -- jadi DIBUNGKUS chip
            putih supaya tetap kebaca di atas latar hijau pekat, BEDA
            dengan pemasangan di tempat lain (landing/auth, semuanya
            berlatar putih) yang tidak butuh chip ini. */}
        <Link href="/dashboard" className="flex items-center gap-1.5">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-baru.png" alt="Jeonme" className="h-full w-full object-contain" />
          </span>
        </Link>

        {workspaces.length > 1 && (
          <div className="mt-4">
            <label className="px-0.5 text-[10px] font-bold uppercase tracking-wider text-white/40">
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

        {/* Item aktif: garis emas tipis di kiri (bukan lagi pil solid
            warna brand -- di atas latar sidebar yang SUDAH hijau tua,
            pil bg-primary nyaris tidak kontras) + latar putih transparan
            samar. Ikon TANPA badge bulat lagi -- lebih tenang/quiet,
            sesuai prinsip "satu aksen berani (emas), sisanya netral". */}
        <nav className="mt-6 flex flex-col gap-0.5 text-xs">
          {NAV_ITEMS.map((item) => {
            if (item.type === "link") {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 font-semibold transition-all ${
                    active
                      ? "border-accent bg-white/5 text-white"
                      : "border-transparent text-white/55 hover:bg-white/5 hover:text-white/85"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
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
                  className="flex w-full items-center justify-between rounded-lg px-3.5 py-1.5 text-left hover:bg-white/5"
                >
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider ${groupHasActive ? "text-accent-light" : "text-white/35"}`}
                  >
                    {item.label}
                  </span>
                  <IconChevronRight
                    className={`h-3.5 w-3.5 flex-shrink-0 text-white/30 transition-transform ${expanded ? "rotate-90" : ""}`}
                  />
                </button>
                {expanded && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {item.items.map((sub) => {
                      const active = pathname === sub.href;
                      const Icon = sub.icon;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 font-semibold transition-all ${
                            active
                              ? "border-accent bg-white/5 text-white"
                              : "border-transparent text-white/55 hover:bg-white/5 hover:text-white/85"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
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
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-300 hover:bg-white/5"
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
        {/* Latar dekoratif "Soft Glass" (permintaan langsung pengguna, tema
            dashboard premium -- benchmark glassmorphism): dipisah jadi
            LAYER TERSENDIRI (fixed, bukan pembungkus shell di bawah) yang
            SENGAJA punya overflow-hidden sendiri -- overflow-hidden di
            ANCESTOR mana pun dari elemen `sticky` akan mematikan efek
            sticky-nya (bug klasik CSS), dan sidebar/top-bar di bawah
            memang sticky. `.bg-mesh` dipinjam APA ADANYA dari komponen
            landing (Hero.tsx) supaya bahasa visual app & situs pemasaran
            konsisten. Efek "bubble" (`.blob` mengambang beranimasi)
            SEMPAT ditambahkan lalu diminta dihapus lagi (permintaan
            langsung pengguna) -- mesh gradient polos saja tanpa
            bubble/blob. pointer-events-none supaya tidak menghalangi
            klik ke konten. */}
        <div className="bg-mesh pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
        <div className="flex min-h-screen">
          {/* Sidebar desktop -- "glass" (dipinjam dari landing, lihat
              globals.css) menggantikan border+bg putih polos, supaya
              sidebar terasa mengambang tipis di atas latar bg-mesh di
              atas, bukan blok solid buram. */}
          <aside className="bg-primary-dark sticky top-0 hidden h-screen w-64 flex-col justify-between p-5 shadow-refined-lg md:flex">
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
            <header className="nav-glass sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden">
              <Link href="/dashboard">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-baru.png" alt="Jeonme" className="h-8 w-auto" />
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
                <aside className="bg-primary-dark absolute left-0 top-0 flex h-full w-72 flex-col justify-between p-5 shadow-hero">
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

            {/* Top bar desktop -- permintaan langsung pengguna (tangkapan
                layar top bar Linktree): notifikasi, akses cepat ke halaman
                publik/Pengaturan, & tautan publik supaya tidak perlu buka
                sidebar tiap kali. "Enhance" (AI) SENGAJA tidak dibuat --
                Jeonme belum punya fitur AI enhance apa pun (lihat keputusan
                yang disepakati). */}
            <header className="nav-glass sticky top-0 z-20 hidden items-center justify-between gap-3 px-6 py-2.5 md:flex">
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
                {/* Tutorial -- konsolidasi sidebar (lihat catatan panjang
                    di NAV_ITEMS): bukan lagi baris menu permanen, jadi ikon
                    bantuan bulat di sini, pola sama seperti ikon bantuan
                    "?" di Linktree/Lynk.id -- ada kapan pun dibutuhkan
                    tanpa merebut tempat di sidebar sepanjang waktu. */}
                <Link
                  href="/dashboard/tutorial"
                  title="Tutorial"
                  aria-label="Tutorial"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-ink hover:border-primary hover:text-primary"
                >
                  <IconPlayCircle className="h-4 w-4" />
                </Link>
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
                {/* Avatar akun (redesain premium, permintaan langsung
                    pengguna): SEBELUMNYA top bar cuma ikon-ikon generik,
                    tidak ada penanda akun siapa yang sedang login sama
                    sekali -- foto/inisial kreator di sini, tautan ke
                    Profil & Akun. Fallback lingkaran inisial (bukan ikon
                    generik) kalau belum upload foto, pola yang sama
                    dipakai di dashboard/design/page.tsx. */}
                {username && (
                  <Link
                    href="/dashboard/settings/profile"
                    title="Profil & Akun"
                    className="ml-0.5 flex flex-shrink-0 items-center gap-2 rounded-full border border-border bg-white py-1 pl-1 pr-2.5 hover:border-primary"
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt={username} className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle font-heading text-[11px] font-bold text-primary">
                        {username.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="hidden text-[11px] font-semibold text-ink lg:inline">@{username}</span>
                  </Link>
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
