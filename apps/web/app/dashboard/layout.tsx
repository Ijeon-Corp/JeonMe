"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { ToastProvider } from "@/components/Toast";
import TwoFactorPrompt from "@/components/TwoFactorPrompt";
import AccountDeletionBanner from "@/components/AccountDeletionBanner";
import OnboardingBanner from "@/components/OnboardingBanner";
import NotificationBell from "@/components/NotificationBell";
import GlobalSearch from "@/components/GlobalSearch";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/locale-context";
import { SITE_URL } from "@/lib/site";
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
  IconGift,
  IconInbox,
  IconLink,
  IconLogout,
  IconMenu,
  IconPaintbrush,
  IconPhone,
  IconPlayCircle,
  IconSettings,
  IconSparkle,
  IconStar,
  IconUpload,
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
// buildNavItems/buildExtraPageLabels -- FUNGSI (bukan konstanta modul lagi)
// permintaan langsung pengguna, 29 Agustus 2026: "harusnya berfungsi di
// semua page termasuk dashboard dll ... untuk ... pilihan bahasa id/en" --
// label-nya sekarang lewat t() supaya ikut berganti begitu locale
// berubah, dipanggil ULANG tiap render (bukan dihitung sekali di level
// modul) di dalam komponen di bawah. Struktur/href/urutan/ikon TIDAK
// berubah sama sekali dari sebelumnya, cuma sumber teksnya.
function buildNavItems(t: (key: string) => string): NavEntry[] {
  return [
    { type: "link", href: "/dashboard", label: t("dashboard.nav.overview"), icon: IconChart },
    // Quick Setup -- permintaan langsung pengguna, 11 Agustus 2026: menu
    // template siap-pakai (tema+bio+tautan starter sekaligus). Sempat di
    // dalam grup "Halaman Saya" -- dipindah jadi baris lepas (susulan
    // permintaan pengguna, 30 Agustus 2026: "menu My Link isinya link bio,
    // shop dan design" -- grup itu dipersempit khusus 3 halaman yang
    // sungguh-sungguh membentuk halaman publik, Quick Setup sifatnya
    // wizard sekali-pakai di awal, bukan halaman yang dikelola terus).
    { type: "link", href: "/dashboard/quick-setup", label: t("dashboard.nav.quickSetup"), icon: IconSparkle },
    // Import -- permintaan langsung pengguna, 31 Agustus 2026: generate
    // halaman dari screenshot + URL link-in-bio lama (Linktree/Lynk.id/
    // dst). Baris lepas TERPISAH dari Quick Setup (bukan salah satu
    // kategorinya) -- bentuk interaksinya beda total (unggah file + URL,
    // bukan pilih dari galeri template), lihat app/dashboard/import/page.tsx.
    { type: "link", href: "/dashboard/import", label: t("dashboard.nav.import"), icon: IconUpload },
    {
      type: "group",
      label: t("dashboard.nav.myPageGroup"),
      items: [
        { href: "/dashboard/links", label: t("dashboard.nav.linkBio"), icon: IconLink },
        { href: "/dashboard/products", label: t("dashboard.nav.shop"), icon: IconBox },
        { href: "/dashboard/design", label: t("dashboard.nav.design"), icon: IconPaintbrush },
      ],
    },
    { type: "link", href: "/dashboard/statistik", label: t("dashboard.nav.statistics"), icon: IconChart },
    { type: "link", href: "/dashboard/monetisasi", label: t("dashboard.nav.productsMonetization"), icon: IconGift },
    {
      type: "group",
      label: t("dashboard.nav.audienceMarketingGroup"),
      items: [
        { href: "/dashboard/audience", label: t("dashboard.nav.audience"), icon: IconInbox },
        { href: "/dashboard/social-proof", label: t("dashboard.nav.socialProof"), icon: IconBell },
        { href: "/dashboard/business-card", label: t("dashboard.nav.contactCard"), icon: IconPhone },
      ],
    },
    { type: "link", href: "/dashboard/balance", label: t("dashboard.nav.balance"), icon: IconWallet },
    { type: "link", href: "/dashboard/settings", label: t("dashboard.nav.settings"), icon: IconSettings },
  ];
}

// buildExtraPageLabels -- halaman yang TIDAK (lagi) muncul sebagai baris
// nav langsung (dipindah ke dalam hub /dashboard/monetisasi atau
// /dashboard/settings, lihat catatan konsolidasi di atas) tapi rute-nya
// TETAP ada persis seperti sebelumnya -- didaftar di sini supaya judul
// top bar desktop tidak jatuh balik ke "Dashboard" generik saat halaman
// ini dibuka langsung.
function buildExtraPageLabels(t: (key: string) => string): Record<string, string> {
  return {
    "/dashboard/tutorial": t("dashboard.extraPages.tutorial"),
    "/dashboard/custom-domain": t("dashboard.extraPages.customDomain"),
    "/dashboard/kyc": t("dashboard.extraPages.kycVerification"),
    "/dashboard/team": t("dashboard.extraPages.team"),
    "/dashboard/vouchers": t("dashboard.extraPages.vouchers"),
    "/dashboard/bundles": t("dashboard.extraPages.bundles"),
    "/dashboard/donation": t("dashboard.extraPages.donation"),
    "/dashboard/affiliates": t("dashboard.extraPages.affiliates"),
    "/dashboard/loyalty": t("dashboard.extraPages.loyalty"),
    "/dashboard/events": t("dashboard.extraPages.events"),
    "/dashboard/courses": t("dashboard.extraPages.courses"),
    "/dashboard/bookings": t("dashboard.extraPages.bookings"),
    "/dashboard/settings/profile": t("dashboard.extraPages.profileAccount"),
    "/dashboard/settings/security": t("dashboard.extraPages.security"),
    "/dashboard/settings/payment": t("dashboard.extraPages.payment"),
    "/dashboard/settings/subscription": t("dashboard.extraPages.subscription"),
    "/dashboard/settings/danger-zone": t("dashboard.extraPages.dangerZone"),
  };
}

// currentPageLabel -- judul top bar desktop (di bawah) mengikuti label item
// nav yang sedang aktif, termasuk yang berada di dalam grup collapsible,
// jatuh balik ke EXTRA_PAGE_LABELS untuk halaman yang sengaja tidak lagi
// muncul di sidebar utama (lihat catatan konsolidasi di atas).
function currentPageLabel(pathname: string, navItems: NavEntry[], extraPageLabels: Record<string, string>, fallback: string): string {
  for (const item of navItems) {
    if (item.type === "link" && item.href === pathname) return item.label;
    if (item.type === "group") {
      const found = item.items.find((sub) => sub.href === pathname);
      if (found) return found.label;
    }
  }
  return extraPageLabels[pathname] ?? fallback;
}

const EXPANDED_GROUPS_STORAGE_KEY = "jeonme-sidebar-expanded-groups";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const navItems = buildNavItems(t);
  const extraPageLabels = buildExtraPageLabels(t);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  // profileMenuOpen -- permintaan langsung pengguna, 30 Agustus 2026: "saat
  // klik profile di dashboard navbar muncul langsung pilihan profile atau
  // logout". Dropdown ini HANYA relevan di top bar desktop (avatar tidak
  // pernah dirender di top bar mobile, lihat catatan di handleLogout
  // profile/page.tsx) -- Keluar tetap ada juga di halaman Profil & Akun
  // supaya mobile (yang tidak punya dropdown ini) tetap bisa logout.
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  // isPremium -- permintaan langsung pengguna, 28 Agustus 2026: "akun saya
  // kan sudah berlangganan premium tapi gada informasi nya ... kasih badge
  // di profile". Sebelum ini status Premium HANYA terlihat kalau kreator
  // sengaja membuka /dashboard/settings/subscription -- tidak ada penanda
  // apa pun di chip akun top bar (terlihat di SEMUA halaman dashboard).
  const [isPremium, setIsPremium] = useState(false);
  const [copied, setCopied] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeOwnerId, setActiveOwnerIdState] = useState<string | null>(() => getActiveWorkspaceOwnerId());

  // Menu per grup jadi collapsible (permintaan langsung pengguna) --
  // sidebar sudah terlalu panjang (~21 item nav di 3 grup + 5 tautan
  // lepas) untuk selalu tampil terbuka semua. Grup yang berisi halaman
  // aktif saat pertama kali layout ini dimuat otomatis terbuka (dihitung
  // sekali lewat initializer useState, memakai pathname yang sudah
  // tersedia saat render pertama, SSR-aman -- tidak baca localStorage di
  // sini supaya render pertama di server & klien identik), grup lain
  // mulai tertutup. Sesudahnya sepenuhnya dikendalikan manual oleh klik
  // pengguna.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of navItems) {
      if (item.type === "group" && item.items.some((sub) => sub.href === pathname)) {
        initial.add(item.label);
      }
    }
    return initial;
  });

  // Persist ke localStorage (susulan permintaan pengguna, 30 Agustus 2026:
  // "kadang ketika klik menu itu normal kadang juga ketika klik menu
  // seperti merefresh gitu jadinya menu link collapse yang sedang terbuka
  // jadi ketutup semua"). Akar masalah SEBENARNYA: <Link> Next.js baru
  // mencegat klik & pindah halaman lewat client-side routing SETELAH
  // hydration React selesai -- HTML dari server sudah terlihat "siap"
  // duluan padahal listener klik React-nya belum terpasang. Kalau
  // pengguna sempat klik link sidebar SEBELUM hydration selesai (lebih
  // sering di device/koneksi lambat, makanya "kadang" bukan selalu),
  // browser jatuh balik ke perilaku <a href> NATIF -- navigasi keras
  // sungguhan (reload penuh, PERSIS seperti laporan "seperti merefresh"),
  // me-remount DashboardLayout dari nol sehingga expandedGroups kembali
  // ke initializer di atas (grup lain yang SEMPAT dibuka manual ikut
  // tertutup). Race hydration itu sendiri di luar kendali kode di sini
  // (butuh bundle JS lebih kecil/cepat untuk benar-benar dihilangkan) --
  // yang BISA dikendalikan adalah membuat expandedGroups TAHAN terhadap
  // reload keras apa pun, dengan menyimpannya ke localStorage dan
  // membaca baliknya SETELAH mount (bukan di initializer -- pola sama
  // seperti AuthGuard.tsx: baca localStorage di effect, bukan langsung
  // saat initial state, supaya tidak memicu hydration mismatch SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY);
      if (raw) {
        const persisted: unknown = JSON.parse(raw);
        if (Array.isArray(persisted)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setExpandedGroups((prev) => new Set([...prev, ...persisted]));
        }
      }
    } catch {
      // localStorage tidak tersedia (mode private dst) atau data korup --
      // abaikan, ini cuma kemudahan tambahan, bukan fitur inti.
    }
  }, []);

  function toggleGroup(label: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        localStorage.setItem(EXPANDED_GROUPS_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Sama seperti di atas -- kemudahan tambahan, gagal simpan diamkan saja.
      }
      return next;
    });
  }

  useEffect(() => {
    getMyPage()
      .then((p) => {
        setUsername(p.username);
        setAvatarUrl(p.avatar_url);
        setIsPremium(p.is_premium);
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
    navigator.clipboard.writeText(`${SITE_URL}/${username}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  // Tutup dropdown profil saat klik di luar area tombol/panelnya -- pola
  // dropdown standar, satu-satunya menu popover di top bar ini (yang lain
  // semua navigasi langsung/tautan).
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

  const sidebarContent = (
    <>
      <div>
        {/* Redesain "Premium Refined" (permintaan langsung pengguna, 9
            Agustus 2026, menggantikan arah "Playful Creator" sore
            harinya): sidebar jadi hijau tua PEKAT (bukan lagi glass
            terang) -- satu pernyataan warna percaya diri, bukan latar
            netral. .text-gradient (hijau->emas) TIDAK dipakai di sini --
            porsi hijau gradiennya nyaris tak kelihatan di atas latar
            sidebar yang SAMA-SAMA hijau tua, jadi logo diganti putih
            polos + aksen berlian emas kecil (pola sama seperti mockup).
            Logo gambar (logo-baru.png) SENGAJA DIKECUALIKAN di dashboard
            -- permintaan langsung pengguna, 10 Agustus 2026: khusus area
            dashboard tetap teks "Jeon.id" polos, bukan gambar. */}
        <Link href="/dashboard" className="flex items-center gap-1.5 font-heading text-lg font-extrabold text-white">
          Jeon.id<span className="text-xs text-accent-light" aria-hidden="true">&#9670;</span>
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
              className="mt-1 w-full rounded-lg border border-app-border bg-app-surface px-2.5 py-2 text-xs font-semibold text-app-ink focus:border-primary focus:outline-none"
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
          {navItems.map((item) => {
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
        {/* Dark/light + bahasa (mobile SAJA) -- permintaan langsung pengguna,
            29 Agustus 2026. Gaya di sini SENGAJA beda dari topbar desktop
            (border/teks putih transparan, bukan border-app-border/bg-app-
            surface) -- sidebar mobile punya latar HIJAU GELAP TETAP
            (bg-primary-dark, tidak ikut toggle terang/gelap sama sekali,
            lihat catatan lengkap di project memory soal batas ini), jadi
            kontrol di dalamnya harus tetap kontras terhadap latar gelap
            tetap itu.
            `md:hidden` -- susulan pengguna: "hilangkan menu bahasa dan dark
            mode di sidebar dashboard untuk desktop". sidebarContent ini
            dipakai BERSAMA oleh <aside> desktop (md:flex, selalu tampil) dan
            drawer mobile (md:hidden, cuma tampil di layar sempit) -- topbar
            desktop SUDAH punya kontrol bahasa/tema sendiri (lihat di bawah),
            jadi versi sidebar ini sekarang cuma perlu tampil di mobile (yang
            tidak punya topbar dengan kontrol itu).
            Tombol Keluar SEBELUMNYA ada di sini -- dipindah ke halaman Profil
            & Akun (susulan permintaan pengguna, 30 Agustus 2026: "fitur
            logout pindah ke profile hilangkan dari sidebar"), lihat
            app/dashboard/settings/profile/page.tsx. Sengaja BUKAN dropdown
            baru di avatar topbar desktop -- itu tidak terjangkau di mobile
            (topbar mobile cuma logo+hamburger), sedangkan halaman Profil &
            Akun tetap bisa dibuka dari kedua sisi (avatar topbar desktop,
            atau menu Pengaturan di drawer mobile). */}
        <div className="flex items-center justify-between gap-2 px-3 md:hidden">
          <LanguageSwitcher className="flex items-center gap-0.5 rounded-full border border-white/20 p-0.5 text-[11px] font-bold text-white/70" />
          <ThemeToggle className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/70 hover:bg-white/10 hover:text-white" />
        </div>
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
        <div className="app-shell flex min-h-screen">
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
              <Link href="/dashboard" className="font-heading text-lg font-extrabold text-gradient">
                Jeon.id
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-2 text-app-ink hover:bg-primary-subtle"
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
              <p className="min-w-0 flex-1 truncate font-heading text-base font-bold text-app-ink">
                {currentPageLabel(pathname, navItems, extraPageLabels, t("dashboard.dashboardFallback"))}
              </p>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <GlobalSearch />
                {/* Dark/light + bahasa -- permintaan langsung pengguna, 29
                    Agustus 2026: "harusnya berfungsi di semua page termasuk
                    dashboard dll". Sama seperti Navbar pemasaran, ThemeToggle
                    className dioper eksplisit di sini supaya cocok gaya
                    tombol ikon bulat topbar dashboard (border+bg-app-surface),
                    bukan gaya bawaannya sendiri. */}
                <LanguageSwitcher className="hidden items-center gap-0.5 rounded-full border border-app-border p-0.5 text-[11px] font-bold lg:flex" />
                <ThemeToggle className="flex h-8 w-8 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-ink hover:border-primary hover:text-primary" />
                {/* Tutorial -- konsolidasi sidebar (lihat catatan panjang
                    di NAV_ITEMS): bukan lagi baris menu permanen, jadi ikon
                    bantuan bulat di sini, pola sama seperti ikon bantuan
                    "?" di Linktree/Lynk.id -- ada kapan pun dibutuhkan
                    tanpa merebut tempat di sidebar sepanjang waktu. */}
                <Link
                  href="/dashboard/tutorial"
                  title={t("dashboard.extraPages.tutorial")}
                  aria-label={t("dashboard.extraPages.tutorial")}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-ink hover:border-primary hover:text-primary"
                >
                  <IconPlayCircle className="h-4 w-4" />
                </Link>
                {/* "Lihat halaman publik" & "Kode QR profil" SEBELUMNYA ada
                    di sini -- dihapus dari top bar (susulan permintaan
                    pengguna, 30 Agustus 2026: "di navbar hilangkan view
                    public sites dan juga qrcode"). Bukan fitur yang hilang:
                    kode QR sudah bisa dibuka dari halaman Profil & Akun
                    (lihat tombol "Lihat Kode QR" di
                    app/dashboard/settings/profile/page.tsx), dan tautan
                    halaman publik tetap ada lewat chip "jeon.id/{username}"
                    di sebelah kanan top bar ini (klik = salin tautan). */}
                <Link
                  href="/dashboard/settings"
                  title={t("dashboard.nav.settings")}
                  aria-label={t("dashboard.nav.settings")}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-ink hover:border-primary hover:text-primary"
                >
                  <IconSettings className="h-4 w-4" />
                </Link>
                <NotificationBell />
                {username && (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    title={t("dashboard.copyLink")}
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-app-border bg-app-surface px-3 py-1.5 text-[11px] font-semibold text-app-ink hover:border-primary hover:text-primary"
                  >
                    {/* Teks domain penuh cuma tampil mulai lg: (>=1024px,
                        sama seperti label GlobalSearch) -- di rentang
                        tablet cukup ikon salin saja supaya baris ini tidak
                        ikut memaksa halaman melebar horizontal. */}
                    <span className="hidden lg:inline">jeon.id/{username}</span>
                    <IconCopy className="h-3 w-3" />
                    {copied && <span className="text-primary">{t("dashboard.linkCopied")}</span>}
                  </button>
                )}
                {/* Avatar akun (redesain premium, permintaan langsung
                    pengguna): SEBELUMNYA top bar cuma ikon-ikon generik,
                    tidak ada penanda akun siapa yang sedang login sama
                    sekali -- foto/inisial kreator di sini. Fallback
                    lingkaran inisial (bukan ikon generik) kalau belum
                    upload foto, pola yang sama dipakai di
                    dashboard/design/page.tsx.

                    Dropdown (bukan lagi tautan langsung) -- permintaan
                    langsung pengguna, 30 Agustus 2026: "saat klik profile
                    di dashboard navbar muncul langsung pilihan profile
                    atau logout". */}
                {username && (
                  <div className="relative ml-0.5 flex-shrink-0" ref={profileMenuRef}>
                    <button
                      type="button"
                      onClick={() => setProfileMenuOpen((v) => !v)}
                      title={isPremium ? "Profil & Akun -- Premium" : "Profil & Akun"}
                      aria-haspopup="menu"
                      aria-expanded={profileMenuOpen}
                      className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface py-1 pl-1 pr-2.5 hover:border-primary"
                    >
                      {/* Lencana bintang di sudut avatar + pil "Premium" di
                          sebelah @username -- permintaan langsung pengguna:
                          "kasih badge di profile". Chip ini terlihat di SEMUA
                          halaman dashboard (bukan cuma /settings/subscription),
                          jadi status Premium langsung kelihatan tanpa perlu
                          buka menu Langganan sama sekali. */}
                      <span className="relative flex-shrink-0">
                        {avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarUrl} alt={username} className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle font-heading text-[11px] font-bold text-primary">
                            {username.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        {isPremium && (
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-white ring-2 ring-white"
                          >
                            <IconStar className="h-2 w-2" />
                          </span>
                        )}
                      </span>
                      <span className="hidden items-center gap-1 text-[11px] font-semibold text-app-ink lg:flex">
                        @{username}
                        {isPremium && (
                          <span className="rounded-full bg-primary-subtle px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                            Premium
                          </span>
                        )}
                      </span>
                    </button>
                    {profileMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-48 overflow-hidden rounded-2xl border border-app-border bg-app-surface py-1.5 shadow-card"
                      >
                        <Link
                          href="/dashboard/settings/profile"
                          role="menuitem"
                          onClick={() => setProfileMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-app-ink hover:bg-app-surface-2"
                        >
                          <IconSettings className="h-4 w-4" />
                          {t("dashboard.extraPages.profileAccount")}
                        </Link>
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
                          {t("dashboard.logout")}
                        </button>
                      </div>
                    )}
                  </div>
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
