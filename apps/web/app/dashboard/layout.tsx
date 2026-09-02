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
import { dashRedesignEnabled } from "@/lib/dashboard-flags";
import DashboardSidebarNav, { SidebarFooterV2, buildRailItemsV2 } from "@/components/dashboard/shell/DashboardSidebarNav";
import { getDashboardPageMeta } from "@/components/dashboard/shell/page-registry";
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
  IconFileText,
  IconGift,
  IconGlobe,
  IconGrid,
  IconHeart,
  IconInbox,
  IconLink,
  IconLock,
  IconLogout,
  IconMail,
  IconMenu,
  IconPaintbrush,
  IconPhone,
  IconPlayCircle,
  IconSearch,
  IconSettings,
  IconShield,
  IconShoppingBag,
  IconSparkle,
  IconStar,
  IconTag,
  IconTarget,
  IconUpload,
  IconUsers,
  IconWallet,
  IconWhatsapp,
} from "@/components/icons";

// badge -- "baru"/"segera" (opsional). "segera" menandai sub-item yang
// backend-nya BELUM ada (restrukturisasi IA per DASHBOARD-DESIGN-JEONID.md
// §3.4/§29.8, keputusan user 31 Agustus 2026: fitur belum ada tampil
// dengan badge "Segera", BUKAN tombol fungsional). Leaf ber-badge "segera"
// dirender non-tautan & tidak bisa diklik (href tetap ada utk pemetaan
// tapi diabaikan render-nya).
type NavLeaf = { href: string; label: string; icon: typeof IconChart; badge?: "baru" | "segera" };
type NavEntry =
  | ({ type: "link" } & NavLeaf)
  | { type: "group"; label: string; icon: typeof IconChart; items: NavLeaf[] }
  | { type: "divider" };

// buildNavItems/buildExtraPageLabels -- FUNGSI (bukan konstanta modul)
// supaya label ikut locale (dipanggil ulang tiap render). Struktur nav =
// IA 7-menu-bisnis dari DASHBOARD-DESIGN-JEONID.md §5 (rombak 31 Agustus
// 2026, menggantikan konsolidasi 23->14 baris sebelumnya). Catatan
// lengkap keputusan & pemetaan route ada di OLD_TO_NEW_MAPPING.md.
// buildNavItems -- REORGANISASI PENUH ke IA 7-menu-bisnis
// (DASHBOARD-DESIGN-JEONID.md §5, keputusan user 31 Agustus 2026). Struktur
// lama (Beranda/QuickSetup/Import/[Link Saya]/Statistik/Monetisasi/[Audiens]
// /Saldo/Pengaturan) diganti 7 menu bisnis + pemisah + 3 menu sekunder
// (Integrasi/Tim/Pengaturan), progressive-disclosure lewat expandable group.
// ROUTE LAMA DIPERTAHANKAN SEMUA (§18) -- yang berubah cuma pengelompokan &
// label; nol perubahan URL, nol fitur dihapus. Sub-item yang backend-nya
// BELUM ada diberi badge "segera" (non-tautan, lihat pemetaan lengkap di
// OLD_TO_NEW_MAPPING.md). Fitur nyata yang tak disebut dokumen (Quick Setup/
// Import/Kartu Kontak/Social Proof/KYC/Loyalitas) tetap punya jalur masuk
// (§5.4: fitur existing tidak boleh disembunyikan).
function buildNavItems(t: (key: string) => string): NavEntry[] {
  return [
    { type: "link", href: "/dashboard", label: t("dashboard.nav.overview"), icon: IconChart },
    {
      type: "group",
      label: t("dashboard.nav.myPageGroup"),
      icon: IconGrid,
      items: [
        { href: "/dashboard/links", label: t("dashboard.nav.linkBlock"), icon: IconLink },
        { href: "/dashboard/design", label: t("dashboard.nav.design"), icon: IconPaintbrush },
        { href: "/dashboard/quick-setup", label: t("dashboard.nav.quickSetup"), icon: IconSparkle },
        { href: "/dashboard/import", label: t("dashboard.nav.import"), icon: IconUpload },
        { href: "/dashboard/settings/seo", label: t("dashboard.nav.seoSharing"), icon: IconSearch },
      ],
    },
    {
      type: "group",
      label: t("dashboard.nav.salesGroup"),
      icon: IconShoppingBag,
      items: [
        { href: "/dashboard/products", label: t("dashboard.nav.productsOrders"), icon: IconBox },
        { href: "/dashboard/courses", label: t("dashboard.extraPages.courses"), icon: IconBook },
        { href: "/dashboard/bookings", label: t("dashboard.extraPages.bookings"), icon: IconClock },
        { href: "/dashboard/events", label: t("dashboard.extraPages.events"), icon: IconCalendar },
        { href: "/dashboard/donation", label: t("dashboard.extraPages.donation"), icon: IconHeart },
        { href: "/dashboard/affiliates", label: t("dashboard.extraPages.affiliates"), icon: IconUsers },
        { href: "/dashboard/vouchers", label: t("dashboard.extraPages.vouchers"), icon: IconTag },
        { href: "/dashboard/bundles", label: t("dashboard.extraPages.bundles"), icon: IconGift },
        { href: "/dashboard/loyalty", label: t("dashboard.extraPages.loyalty"), icon: IconStar },
        { href: "#", label: t("dashboard.nav.memberArea"), icon: IconLock, badge: "segera" },
      ],
    },
    {
      type: "group",
      label: t("dashboard.nav.audience"),
      icon: IconInbox,
      items: [
        { href: "/dashboard/audience", label: t("dashboard.nav.contacts"), icon: IconInbox },
        { href: "/dashboard/business-card", label: t("dashboard.nav.contactCard"), icon: IconPhone },
        { href: "#", label: t("dashboard.nav.segments"), icon: IconTarget, badge: "segera" },
      ],
    },
    {
      type: "group",
      label: t("dashboard.nav.promotion"),
      icon: IconTarget,
      items: [
        { href: "/dashboard/social-proof", label: t("dashboard.nav.socialProof"), icon: IconBell },
        { href: "/dashboard/audience", label: t("dashboard.nav.emailBroadcast"), icon: IconMail },
        { href: "#", label: t("dashboard.nav.whatsappBroadcast"), icon: IconWhatsapp, badge: "segera" },
        { href: "#", label: t("dashboard.nav.autoDm"), icon: IconSparkle, badge: "segera" },
        { href: "#", label: t("dashboard.nav.automation"), icon: IconSparkle, badge: "segera" },
      ],
    },
    { type: "link", href: "/dashboard/statistik", label: t("dashboard.nav.analytics"), icon: IconChart },
    {
      type: "group",
      label: t("dashboard.nav.finance"),
      icon: IconWallet,
      items: [
        { href: "/dashboard/balance", label: t("dashboard.nav.balance"), icon: IconWallet },
        { href: "/dashboard/settings/payment", label: t("dashboard.nav.bankAccounts"), icon: IconWallet },
        { href: "/dashboard/kyc", label: t("dashboard.extraPages.kycVerification"), icon: IconShield },
        { href: "#", label: t("dashboard.nav.invoiceTax"), icon: IconFileText, badge: "segera" },
      ],
    },
    { type: "divider" },
    {
      type: "group",
      label: t("dashboard.nav.integrations"),
      icon: IconGlobe,
      items: [
        { href: "/dashboard/analytics", label: t("dashboard.nav.analyticsPixels"), icon: IconChart },
        { href: "/dashboard/social-connect", label: t("dashboard.nav.socialConnect"), icon: IconExternal },
        { href: "#", label: t("dashboard.nav.apiKeys"), icon: IconGlobe, badge: "segera" },
      ],
    },
    {
      type: "group",
      label: t("dashboard.nav.team"),
      icon: IconUsers,
      items: [
        { href: "/dashboard/team", label: t("dashboard.nav.membersRoles"), icon: IconUsers },
        { href: "#", label: t("dashboard.nav.activityLog"), icon: IconClock, badge: "segera" },
      ],
    },
    { type: "link", href: "/dashboard/settings", label: t("dashboard.nav.settings"), icon: IconSettings },
  ];
}

// buildExtraPageLabels -- judul top bar utk halaman yang rutenya ADA tapi
// TIDAK muncul sbg item nav langsung (sub-halaman settings, sub-rute
// desain, hub monetisasi, tutorial). Sebagian besar route lain sudah
// resolve otomatis lewat currentPageLabel yang memindai grup nav.
function buildExtraPageLabels(t: (key: string) => string): Record<string, string> {
  return {
    "/dashboard/tutorial": t("dashboard.extraPages.tutorial"),
    "/dashboard/monetisasi": t("dashboard.nav.productsMonetization"),
    "/dashboard/design/theme": t("dashboard.nav.design"),
    "/dashboard/design/header": t("dashboard.nav.design"),
    "/dashboard/design/tombol": t("dashboard.nav.design"),
    "/dashboard/design/font": t("dashboard.nav.design"),
    "/dashboard/design/sticker": t("dashboard.nav.design"),
    "/dashboard/settings/profile": t("dashboard.extraPages.profileAccount"),
    "/dashboard/settings/security": t("dashboard.extraPages.security"),
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
  // Shell v2 (JEONID-DASHBOARD-REDESIGN-SPEC §5-6, Phase 2) di balik flag --
  // OFF (env NEXT_PUBLIC_DASH_REDESIGN_OFF="shell") mengembalikan IA lama
  // utuh. Konstanta build-time, aman dipakai untuk cabang render.
  const shellV2 = dashRedesignEnabled("shell");
  const navItems = buildNavItems(t);
  const extraPageLabels = buildExtraPageLabels(t);
  const pageMeta = shellV2 ? getDashboardPageMeta(pathname) : undefined;
  // Bottom nav mobile (DASHBOARD-DESIGN-JEONID.md §21 "Mobile priority
  // navigation"): 5 tujuan penting + "Menu" yang membuka drawer berisi
  // SEMUA sisanya (Pesanan ada di dalam Produk, Audiens/Keuangan/Integrasi
  // dst di drawer) -- doc merekomendasikan Beranda|Halaman|Produk|Pesanan|
  // Menu; "Pesanan" dipetakan ke Produk (tab Transaksi hidup di /products,
  // tidak ada route /orders terpisah), diganti Statistik yang lebih sering
  // dibuka harian. Semua href = route nyata yang sudah ada. `match`
  // menyalakan tab aktif termasuk untuk sub-rute (mis. /design & /settings/
  // seo ikut menyalakan "Halaman", sesuai HalamanSayaTabs).
  // Bottom nav v2 (spec §6.3): Beranda | Halaman | Jualan | Analitik | Menu.
  // Legacy (Produk/Statistik) di cabang else.
  const bottomNav: { key: string; href: string; icon: typeof IconChart; match: (p: string) => boolean; isMenu?: boolean }[] = shellV2
    ? [
        { key: "bottomHome", href: "/dashboard", icon: IconGrid, match: (p) => p === "/dashboard" },
        {
          key: "bottomPage",
          href: "/dashboard/links",
          icon: IconLink,
          match: (p) => p === "/dashboard/links" || p.startsWith("/dashboard/design") || p === "/dashboard/settings/seo",
        },
        {
          key: "bottomSales",
          href: "/dashboard/products",
          icon: IconShoppingBag,
          match: (p) =>
            ["/dashboard/products", "/dashboard/courses", "/dashboard/bookings", "/dashboard/events", "/dashboard/donation"].some(
              (b) => p === b || p.startsWith(`${b}/`)
            ),
        },
        { key: "bottomAnalytics", href: "/dashboard/statistik", icon: IconChart, match: (p) => p === "/dashboard/statistik" },
        { key: "bottomMore", href: "#", icon: IconMenu, match: () => false, isMenu: true },
      ]
    : [
        { key: "bottomHome", href: "/dashboard", icon: IconGrid, match: (p) => p === "/dashboard" },
        {
          key: "bottomPage",
          href: "/dashboard/links",
          icon: IconLink,
          match: (p) => p === "/dashboard/links" || p.startsWith("/dashboard/design") || p === "/dashboard/settings/seo",
        },
        { key: "bottomProducts", href: "/dashboard/products", icon: IconShoppingBag, match: (p) => p.startsWith("/dashboard/products") },
        { key: "bottomStats", href: "/dashboard/statistik", icon: IconChart, match: (p) => p === "/dashboard/statistik" },
        { key: "bottomMore", href: "#", icon: IconMenu, match: () => false, isMenu: true },
      ];
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
  // isPublished -- redesign Fase 3 (spec §12.3: top bar menampilkan status
  // Live/Draft DARI DATA BACKEND). null = belum termuat (pil tidak
  // dirender sama sekali, bukan menebak status). Murni DISPLAY -- toggle
  // publish tetap di halaman Link Bio (updateMyPage), bukan aksi baru di
  // topbar.
  const [isPublished, setIsPublished] = useState<boolean | null>(null);
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
    if (shellV2) {
      // v2: cocokkan pathname ke leaf grup IA baru (label grup beda dari
      // legacy, jadi tidak bisa pakai navItems lama). Satu grup saja (§6.4).
      const railGroups = buildRailItemsV2(t).filter((r) => r.matchPrefixes.length > 1);
      for (const g of railGroups) {
        if (g.matchPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
          initial.add(g.label);
          break;
        }
      }
      return initial;
    }
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
          // GABUNG grup dari localStorage dengan grup halaman aktif.
          // SEBELUMNYA v2 melakukan `if (prev.size > 0) return prev` --
          // artinya begitu URL cocok satu grup, grup yang SENGAJA dibuka
          // pengguna dibuang. Efeknya: setiap reload keras (mis. klik
          // sebelum hydration selesai) menu yang sedang terbuka menutup --
          // keluhan langsung pengguna 1 September 2026. Merge mengembalikan
          // perilaku tahan-reload seperti sebelum Phase 2.
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
      // MULTI-OPEN (permintaan langsung pengguna, 1 September 2026: "menu
      // yang sedang terbuka jangan tertutup"). SEBELUMNYA shell v2 memakai
      // aturan satu-accordion SPEC §6.4 -- membuka grup lain menutup grup
      // yang sedang dibuka, dan itu persis yang dikeluhkan. Instruksi
      // pengguna menang atas spec; perilaku kembali seperti legacy: tiap
      // grup buka/tutup independen. Key localStorage tetap sama.
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
        setIsPublished(p.is_published);
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
      {/* min-h-0 + overflow-y-auto -- IA baru punya 7 grup expandable;
          kalau beberapa dibuka sekaligus tingginya bisa melebihi viewport,
          jadi area logo+nav ini di-scroll sendiri (scrollbar disembunyikan)
          alih-alih terpotong. Blok kontrol bawah (tema/bahasa mobile) tetap
          di luar area scroll ini, menempel di bawah lewat justify-between
          aside. */}
      <div className="min-h-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        {/* Logo baru (permintaan langsung pengguna, 31 Agustus 2026) --
            sidebar gelap KONSTAN, langsung pakai varian -dark (wordmark
            putih), bukan pasangan brand-logo-light/dark. */}
        <Link href="/dashboard" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jeon-logo-new-dark.png" alt="jeon.id" className="h-8 w-auto" />
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
              className="mt-1 w-full rounded-lg border border-app-border bg-app-surface px-2.5 py-2 text-xs font-semibold text-app-ink focus:border-jeon-purple focus:outline-none"
            >
              {workspaces.map((w) => (
                <option key={w.owner_user_id} value={w.owner_user_id}>
                  {w.is_self ? "Akun saya" : `@${w.owner_username}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Nav IA 7-menu (restrukturisasi DASHBOARD-DESIGN-JEONID.md §5-6):
            menu bisnis utama = baris ikon+label (grup dengan chevron,
            expandable progressive-disclosure); item aktif = garis + latar
            ungu. Pemisah membagi 7 menu bisnis dari 3 menu sekunder
            (Integrasi/Tim/Pengaturan). Badge "Segera" = fitur roadmap yang
            backend-nya belum ada (non-tautan). */}
        {shellV2 ? (
          /* Nav v2: IA Jualan/Marketing (spec §5), satu-accordion, tanpa
             badge Segera; komponen terpisah + Suspense utk useSearchParams
             (leaf ?tab=/?view=). Legacy di cabang else, utuh. */
          <DashboardSidebarNav
            pathname={pathname}
            expandedGroups={expandedGroups}
            onToggleGroup={toggleGroup}
            onNavigate={() => setMobileOpen(false)}
          />
        ) : (
        <nav className="mt-6 flex flex-col gap-0.5 text-xs">
          {navItems.map((item, idx) => {
            if (item.type === "divider") {
              return <div key={`div-${idx}`} className="my-2.5 h-px bg-white/10" aria-hidden="true" />;
            }
            if (item.type === "link") {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 font-semibold transition-all ${
                    active
                      ? "border-jeon-purple bg-jeon-purple/25 text-white"
                      : "border-transparent text-white/55 hover:bg-white/5 hover:text-white/85"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              );
            }

            const groupHasActive = item.items.some((sub) => sub.href !== "#" && sub.href === pathname);
            const expanded = expandedGroups.has(item.label);
            const GroupIcon = item.icon;
            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(item.label)}
                  aria-expanded={expanded}
                  className={`flex w-full items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left font-semibold transition-all ${
                    groupHasActive && !expanded
                      ? "border-jeon-purple bg-jeon-purple/15 text-white"
                      : "border-transparent text-white/60 hover:bg-white/5 hover:text-white/90"
                  }`}
                >
                  <GroupIcon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <IconChevronRight
                    className={`h-3.5 w-3.5 flex-shrink-0 text-white/40 transition-transform ${expanded ? "rotate-90" : ""}`}
                  />
                </button>
                {expanded && (
                  <div className="mb-1 ml-3.5 mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-2">
                    {item.items.map((sub) => {
                      const Icon = sub.icon;
                      if (sub.badge === "segera") {
                        return (
                          <div
                            key={sub.label}
                            className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-1.5 font-semibold text-white/30"
                            title={t("dashboard.nav.comingSoonTitle")}
                          >
                            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="flex-1">{sub.label}</span>
                            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/45">
                              {t("dashboard.nav.comingSoonBadge")}
                            </span>
                          </div>
                        );
                      }
                      const active = pathname === sub.href;
                      return (
                        <Link
                          key={sub.href + sub.label}
                          href={sub.href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-1.5 font-semibold transition-all ${
                            active
                              ? "border-jeon-purple bg-jeon-purple/25 text-white"
                              : "border-transparent text-white/50 hover:bg-white/5 hover:text-white/85"
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
        )}
      </div>

      <div className="flex flex-col gap-3">
        {shellV2 && <SidebarFooterV2 isPremium={isPremium} onNavigate={() => setMobileOpen(false)} />}
        {/* Dark/light + bahasa (mobile SAJA) -- permintaan langsung pengguna,
            29 Agustus 2026. Gaya di sini SENGAJA beda dari topbar desktop
            (border/teks putih transparan, bukan border-app-border/bg-app-
            surface) -- sidebar mobile punya latar HIJAU GELAP TETAP
            (bg-jeon-purple-dark, tidak ikut toggle terang/gelap sama sekali,
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

  // railContent -- sidebar RINGKAS ikon-saja untuk rentang tablet/desktop
  // kecil (md..xl, 768-1279px) sesuai DASHBOARD-DESIGN-JEONID.md §21
  // ("collapsed sidebar 72-80px"). Tiap entri jadi satu ikon: tautan lepas
  // -> ke href-nya, GRUP -> ke halaman pertama seksi-nya (landing default,
  // mis. ikon "Produk & Penjualan" -> /products) dengan tooltip nama grup.
  // Navigasi DALAM seksi tetap lewat secondary-nav tiap halaman
  // (HalamanSayaTabs, tab produk, hub monetisasi) -- progressive disclosure
  // §5.3. Sidebar PENUH (label + grup expandable) tetap dipakai di >=xl dan
  // di drawer mobile; rail ini TAMBAHAN, bukan pengganti. Item ber-badge
  // "segera" tidak muncul di rail (bukan tautan).
  const railContent = (
    <>
      <Link href="/dashboard" className="mb-3 flex flex-shrink-0 justify-center" aria-label="jeon.id" title="jeon.id">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon-new.png" alt="jeon.id" className="h-9 w-9" />
      </Link>
      <nav
        aria-label={t("dashboard.nav.overview")}
        className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shellV2
          ? (() => {
              // Rail v2 (§6.2): grup -> landing default domain; item aktif =
              // FIRST-match prefix (mis. /settings/seo milik Halaman Saya,
              // bukan Pengaturan).
              const rail = buildRailItemsV2(t);
              const activeIdx = rail.findIndex((r) =>
                r.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : r.matchPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
              );
              return rail.map((item, idx) => {
                const Icon = item.icon;
                const active = idx === activeIdx;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                      active ? "bg-brand-500 text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </Link>
                );
              });
            })()
          : navItems.map((item, idx) => {
          if (item.type === "divider") {
            return <div key={`rdiv-${idx}`} className="my-1.5 h-px w-7 flex-shrink-0 bg-white/10" aria-hidden="true" />;
          }
          const Icon = item.icon;
          const href = item.type === "link" ? item.href : item.items.find((s) => s.href !== "#")?.href ?? "/dashboard";
          const active =
            item.type === "link"
              ? pathname === item.href
              : item.items.some((s) => s.href !== "#" && s.href === pathname);
          return (
            <Link
              key={item.type === "link" ? item.href : item.label}
              href={href}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                active ? "bg-jeon-purple text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <AuthGuard>
      <ToastProvider>
        {/* Skip-to-content (DASHBOARD-DESIGN-JEONID.md §22 "landmarks" +
            keyboard nav): tautan pertama yang bisa difokus keyboard, tak
            terlihat sampai difokus (sr-only -> not-sr-only saat :focus).
            Melompati sidebar/topbar langsung ke <main>. */}
        <a
          href="#dashboard-main"
          className="sr-only z-50 rounded-lg bg-jeon-purple px-4 py-2 text-sm font-bold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
        >
          {t("dashboard.skipToContent")}
        </a>
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
          {/* Sidebar desktop: RAIL ikon (md..xl, 72px) vs PENUH (>=xl, 226px)
              -- §21. Lebar & isi ditukar di breakpoint xl; keduanya dirender
              lalu satu disembunyikan via CSS (bukan JS) supaya bebas
              hydration-mismatch & tanpa flicker. Di bawah md sidebar ini
              hidden total (drawer + bottom nav yang ambil alih). */}
          <aside className="sticky top-0 hidden h-screen w-[72px] flex-col bg-jeon-sidebar shadow-refined-lg md:flex xl:w-[var(--dashboard-sidebar)]">
            {/* Penuh -- hanya >=xl */}
            <div className="hidden min-h-0 flex-1 flex-col justify-between p-5 xl:flex">{sidebarContent}</div>
            {/* Rail ikon -- md..xl */}
            <div className="flex min-h-0 flex-1 flex-col items-center px-2 py-5 xl:hidden">{railContent}</div>
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
              <Link href="/dashboard" className="flex items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/jeon-logo-new.png" alt="jeon.id" className="brand-logo-light h-7 w-auto" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/jeon-logo-new-dark.png" alt="jeon.id" className="brand-logo-dark h-7 w-auto" />
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

            {/* Top bar desktop -- permintaan langsung pengguna (tangkapan
                layar top bar Linktree): notifikasi, akses cepat ke halaman
                publik/Pengaturan, & tautan publik supaya tidak perlu buka
                sidebar tiap kali. "Enhance" (AI) SENGAJA tidak dibuat --
                Jeonme belum punya fitur AI enhance apa pun (lihat keputusan
                yang disepakati). */}
            <header className="nav-glass sticky top-0 z-20 hidden h-[72px] items-center justify-between gap-3 px-6 md:flex">
              {/* Bug ditemukan (5 Agustus 2026, audit responsif): judul
                  DAN grup ikon di kanan sebelumnya sama-sama tidak bisa
                  menyusut -- di lebar tablet (768-1023px) totalnya melebihi
                  lebar layar, memaksa SELURUH halaman melebar horizontal.
                  min-w-0+truncate di judul membiarkan JUDUL yang mengalah
                  duluan (konten paling tidak krusial di baris ini) supaya
                  grup ikon (fungsional) tetap utuh. */}
              {/* v2: judul dari page-registry (§6.6) + breadcrumb induk pada
                  kedalaman >1 (§6.5); fallback ke resolusi label legacy. */}
              <p className="min-w-0 flex-1 truncate font-display text-base font-bold text-app-ink">
                {shellV2 && pageMeta ? (
                  <>
                    {pageMeta.parentKey && (
                      <span className="font-semibold text-app-muted">{t(pageMeta.parentKey)} / </span>
                    )}
                    {t(pageMeta.titleKey)}
                  </>
                ) : (
                  currentPageLabel(pathname, navItems, extraPageLabels, t("dashboard.dashboardFallback"))
                )}
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
                {/* v2 (§6.5): di bawah lg tema pindah ke dropdown akun
                    (mengurangi kepadatan topbar); legacy tetap selalu tampil. */}
                <ThemeToggle
                  className={`${shellV2 ? "hidden lg:flex" : "flex"} h-8 w-8 items-center justify-center rounded-full border-2 border-jeon-ink bg-app-surface text-app-ink hover:border-jeon-purple hover:text-jeon-purple`}
                />
                {/* Tutorial -- konsolidasi sidebar (lihat catatan panjang
                    di NAV_ITEMS): bukan lagi baris menu permanen, jadi ikon
                    bantuan bulat di sini, pola sama seperti ikon bantuan
                    "?" di Linktree/Lynk.id -- ada kapan pun dibutuhkan
                    tanpa merebut tempat di sidebar sepanjang waktu. */}
                <Link
                  href="/dashboard/tutorial"
                  title={t("dashboard.extraPages.tutorial")}
                  aria-label={t("dashboard.extraPages.tutorial")}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-jeon-ink bg-app-surface text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
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
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-jeon-ink bg-app-surface text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
                >
                  <IconSettings className="h-4 w-4" />
                </Link>
                <NotificationBell />
                {/* Pil status Live/Draft (redesign spec §12.3): status
                    publish halaman utama DARI DATA BACKEND (pages.is_published,
                    ikut fetch getMyPage yang sudah ada -- nol request baru).
                    Murni DISPLAY: toggle publish tetap di halaman Link Bio,
                    bukan aksi baru di topbar. Tidak dirender sama sekali
                    sebelum datanya termuat (bukan menebak status). */}
                {/* v2 (§6.5): pil Live/Draf & chip URL publik KONTEKSTUAL --
                    hanya di domain Halaman Saya, bukan semua halaman. */}
                {isPublished !== null && (!shellV2 || pageMeta?.domain === "page") && (
                  <span
                    className={`hidden flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider lg:flex ${
                      isPublished ? "border-jeon-success/40 text-jeon-success" : "border-app-border text-app-muted"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${isPublished ? "bg-jeon-success" : "bg-app-muted"}`} aria-hidden="true" />
                    {isPublished ? t("dashboard.statusLive") : t("dashboard.statusDraft")}
                  </span>
                )}
                {username && (!shellV2 || pageMeta?.domain === "page") && (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    title={t("dashboard.copyLink")}
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-full border-2 border-jeon-ink bg-app-surface px-3 py-1.5 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
                  >
                    {/* Teks domain penuh cuma tampil mulai lg: (>=1024px,
                        sama seperti label GlobalSearch) -- di rentang
                        tablet cukup ikon salin saja supaya baris ini tidak
                        ikut memaksa halaman melebar horizontal. */}
                    <span className="hidden lg:inline">jeon.id/{username}</span>
                    <IconCopy className="h-3 w-3" />
                    {copied && <span className="text-jeon-purple">{t("dashboard.linkCopied")}</span>}
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
                      className="flex items-center gap-2 rounded-full border-2 border-jeon-ink bg-app-surface py-1 pl-1 pr-2.5 hover:border-jeon-purple"
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
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-jeon-lavender font-display text-[11px] font-bold text-[#111111]">
                            {username.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        {isPremium && (
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-jeon-purple text-white ring-2 ring-white"
                          >
                            <IconStar className="h-2 w-2" />
                          </span>
                        )}
                      </span>
                      <span className="hidden items-center gap-1 text-[11px] font-semibold text-app-ink lg:flex">
                        @{username}
                        {isPremium && (
                          <span className="rounded-full bg-jeon-lavender px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#111111]">
                            Premium
                          </span>
                        )}
                      </span>
                    </button>
                    {profileMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-48 overflow-hidden rounded-jmd border-2 border-jeon-ink bg-app-surface py-1.5 shadow-card"
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
                        {/* v2 (§6.5): bahasa & tema masuk dropdown akun di
                            bawah lg (inline-nya disembunyikan di lebar itu). */}
                        {shellV2 && (
                          <div className="flex items-center justify-between gap-2 border-t border-app-border px-4 py-2 lg:hidden">
                            <LanguageSwitcher className="flex items-center gap-0.5 rounded-full border border-app-border p-0.5 text-[11px] font-bold" />
                            <ThemeToggle className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-jeon-ink bg-app-surface text-app-ink hover:border-jeon-purple hover:text-jeon-purple" />
                          </div>
                        )}
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

            {/* pb-24 s/d md -- ruang supaya konten tidak tertutup bottom nav
                mobile (fixed) di bawah; md ke atas bottom nav hilang & padding
                kembali normal. */}
            <main id="dashboard-main" tabIndex={-1} className="flex-1 p-4 pb-24 outline-none sm:p-6 sm:pb-24 md:pb-6">{children}</main>
          </div>

          {/* Bottom navigation mobile (§21) -- fixed di bawah, < md saja.
              Sidebar desktop & drawer mobile tidak berubah; ini navigasi
              prioritas tambahan supaya tujuan utama terjangkau satu ketukan
              tanpa membuka drawer. pb env(safe-area) menghormati notch iOS. */}
          <nav
            aria-label={t("dashboard.nav.overview")}
            className="nav-glass fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-app-border pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {bottomNav.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              const inner = (
                <>
                  <Icon className="h-5 w-5" />
                  <span>{t(`dashboard.nav.${item.key}`)}</span>
                </>
              );
              const cls = `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
                active ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"
              }`;
              if (item.isMenu) {
                return (
                  <button key={item.key} type="button" onClick={() => setMobileOpen(true)} className={cls} aria-label={t(`dashboard.nav.${item.key}`)}>
                    {inner}
                  </button>
                );
              }
              return (
                <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </nav>
        </div>
      </ToastProvider>
    </AuthGuard>
  );
}
