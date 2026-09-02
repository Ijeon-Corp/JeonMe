"use client";

import IconBadge, { accentForIndex, type IconBadgeAccent } from "@/components/IconBadge";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getMyPage } from "@/lib/api-client";
import { useLocale } from "@/lib/locale-context";
import {
  IconChart,
  IconChevronRight,
  IconExternal,
  IconPencil,
  IconSearch,
  IconShield,
  IconStar,
  IconTrash,
  IconUsers,
  IconWallet,
} from "@/components/icons";

// Modul Settings §1: search box di atas daftar menu settings, filter
// client-side atas label + deskripsi -- fitur yang TIDAK ada di Lynk.id,
// jangan dilewati walau daftarnya masih pendek di fase awal ini.
//
// Konsolidasi sidebar (permintaan langsung pengguna, benchmark vs
// Linktree/Lynk.id, 8 Agustus 2026): "Verifikasi KYC" SEBELUMNYA baris
// sidebar utama TERSENDIRI -- termasuk pengaturan akun/teknis yang dibuka
// jarang (sekali di awal, bukan harian), sama seperti "Tim & Kolaborator"
// yang MEMANG SUDAH lama ada di sini juga (dulu dobel-tampil, sekarang
// cuma di sini). Rutenya TIDAK berubah, cuma jalur masuknya lewat hub ini.
//
// Rombak tata letak (permintaan langsung pengguna, 12 Agustus 2026:
// "terlalu menumpuk dan terlihat jelek dari segi ui dan ux nya") --
// SEBELUMNYA satu kolom vertikal 8 kartu penuh-lebar berturut-turut
// (butuh scroll panjang, semua kartu bobot visual SAMA walau
// urgensi/frekuensi aksesnya beda jauh -- ganti password vs hapus akun
// sama-sama kartu putih polos). Diganti jadi GRID 2 kolom + dikelompokkan
// per kategori (Akun, Uang & Verifikasi, Pertumbuhan) supaya lebih
// scannable & lebih pendek total tingginya, "Zona Berbahaya" dipisah
// jadi grup sendiri di paling bawah (bukan ikut campur di grid biasa)
// supaya area destruktif tetap terasa terpisah secara struktural, bukan
// cuma lewat warna kartu seperti sebelumnya.
type SettingsItem = {
  href: string;
  title: string;
  description: string;
  icon: (props: { className?: string }) => React.ReactElement;
  // accent -- SEBELUMNYA `badgeClass: string` berisi kelas Tailwind mentah
  // ("bg-jeon-purple/10 text-jeon-purple"). Diganti nama aksen supaya
  // presentasinya satu pintu lewat <IconBadge> dan ikut bahasa visual
  // homepage (permintaan pengguna 1 September 2026). Kosong = ikut rotasi
  // warna per posisi kartu, seperti kartu fitur homepage.
  accent?: IconBadgeAccent;
  // statusPill -- opsional, ditambahkan lewat resolveItem() di bawah untuk
  // menandai status YANG SEDANG AKTIF (bukan cuma deskripsi statis) --
  // permintaan langsung pengguna, 28 Agustus 2026: "akun saya kan sudah
  // berlangganan premium tapi gada informasi nya, harusnya ada info
  // tentang langganan premium nya di setting akun". Sebelum ini kartu
  // "Langganan Premium" SELALU menampilkan teks upsell yang sama persis
  // baik untuk kreator gratis MAUPUN yang sudah Premium.
  statusPill?: string;
};

// SettingsGroup.id -- pengenal STABIL (tidak ikut berganti bahasa), dipakai
// untuk logika (mis. styling merah grup "Zona Berbahaya") supaya tidak
// bergantung pada isi `label` yang sekarang lewat t() dan berubah per
// locale.
type SettingsGroup = { id: string; label: string; items: SettingsItem[] };

// buildSettingsGroups -- FUNGSI (bukan konstanta modul) mengikuti pola
// buildNavItems di dashboard/layout.tsx: dipanggil ulang tiap render supaya
// label & deskripsi ikut berganti begitu locale berubah.
function buildSettingsGroups(t: (key: string) => string): SettingsGroup[] {
  return [
    {
      id: "account",
      label: t("dashboard.pages.settings.groups.account"),
      items: [
        {
          href: "/dashboard/settings/profile",
          title: t("dashboard.pages.settings.items.profileTitle"),
          description: t("dashboard.pages.settings.items.profileDescription"),
          icon: IconPencil,
        },
        {
          href: "/dashboard/settings/security",
          title: t("dashboard.pages.settings.items.securityTitle"),
          description: t("dashboard.pages.settings.items.securityDescription"),
          icon: IconShield,
        },
        {
          href: "/dashboard/settings/seo",
          title: t("dashboard.pages.settings.items.seoTitle"),
          description: t("dashboard.pages.settings.items.seoDescription"),
          icon: IconSearch,
        },
      ],
    },
    {
      id: "moneyVerification",
      label: t("dashboard.pages.settings.groups.moneyVerification"),
      items: [
        {
          href: "/dashboard/settings/payment",
          title: t("dashboard.pages.settings.items.paymentTitle"),
          description: t("dashboard.pages.settings.items.paymentDescription"),
          icon: IconWallet,
        },
        {
          href: "/dashboard/kyc",
          title: t("dashboard.pages.settings.items.kycTitle"),
          description: t("dashboard.pages.settings.items.kycDescription"),
          icon: IconShield,
        },
      ],
    },
    {
      id: "growth",
      label: t("dashboard.pages.settings.groups.growth"),
      items: [
        {
          href: "/dashboard/settings/subscription",
          title: t("dashboard.pages.settings.items.subscriptionTitle"),
          description: t("dashboard.pages.settings.items.subscriptionDescription"),
          icon: IconStar,
        },
        {
          href: "/dashboard/team",
          title: t("dashboard.pages.settings.items.teamTitle"),
          description: t("dashboard.pages.settings.items.teamDescription"),
          icon: IconUsers,
        },
        {
          href: "/dashboard/analytics",
          title: t("dashboard.pages.settings.items.analyticsTitle"),
          description: t("dashboard.pages.settings.items.analyticsDescription"),
          icon: IconChart,
        },
        // Modul Koneksi Sosial -- permintaan langsung pengguna, 17 Agustus
        // 2026: "saya mau jeonme ini bisa connect ke akun kita contoh nya
        // instagram tiktok" (diriset dulu vs Linktree -- profil + postingan/
        // video terbaru tampil otomatis di halaman publik, beda dari tautan
        // Instagram/TikTok biasa yang sudah ada di menu Link Bio).
        {
          href: "/dashboard/social-connect",
          title: t("dashboard.pages.settings.items.socialConnectTitle"),
          description: t("dashboard.pages.settings.items.socialConnectDescription"),
          icon: IconExternal,
        },
      ],
    },
    {
      id: "dangerZone",
      label: t("dashboard.pages.settings.groups.dangerZone"),
      items: [
        {
          href: "/dashboard/settings/danger-zone",
          title: t("dashboard.pages.settings.items.dangerZoneTitle"),
          description: t("dashboard.pages.settings.items.dangerZoneDescription"),
          icon: IconTrash,
          accent: "coral",
        },
      ],
    },
  ];
}

function SettingsCard({ item, index }: { item: SettingsItem; index: number }) {
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 rounded-jmd border border-app-border bg-app-surface p-3.5 transition-colors hover:border-jeon-purple"
    >
      <IconBadge icon={item.icon} accent={item.accent ?? accentForIndex(index)} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-sm font-bold text-app-ink">{item.title}</span>
          {item.statusPill && (
            <span className="flex-shrink-0 rounded-full bg-jeon-purple/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-jeon-purple">
              {item.statusPill}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-app-muted">{item.description}</span>
      </span>
      <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted" />
    </Link>
  );
}

export default function DashboardSettingsPage() {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    getMyPage()
      .then((p) => setIsPremium(p.is_premium))
      .catch(() => {
        // Cuma penanda status di kartu -- kalau gagal dimuat, biarkan
        // kartu tampil dengan teks upsell bawaan, jangan ganggu halaman
        // dengan pesan error untuk hal sekunder ini.
      });
  }, []);

  const settingsGroups = buildSettingsGroups(t);

  // resolveItem -- menimpa description/statusPill kartu "Langganan
  // Premium" kalau kreator ini SUDAH Premium, supaya kartu itu sendiri
  // langsung menunjukkan status aktif (bukan cuma teks upsell generik yang
  // sama untuk semua orang) tanpa perlu buka halamannya.
  function resolveItem(item: SettingsItem): SettingsItem {
    if (item.href !== "/dashboard/settings/subscription" || !isPremium) return item;
    return {
      ...item,
      description: t("dashboard.pages.settings.items.subscriptionActiveDescription"),
      statusPill: t("dashboard.pages.settings.items.subscriptionActiveBadge"),
    };
  }

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return settingsGroups;
    return settingsGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settingsGroups dibangun ulang tiap render dari `t`, cukup ikuti `query` sebagai pemicu (menambah settingsGroups ke deps akan membuat memo ini tidak pernah "stabil" karena referensinya baru tiap render).
  }, [query]);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.settings.subtitle")}</p>

      <div className="relative mt-5">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("dashboard.pages.settings.searchPlaceholder")}
          className="w-full rounded-xl border border-app-border bg-app-surface py-2.5 pl-9 pr-3 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
        />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {filteredGroups.map((g) => (
          <div key={g.id}>
            <p className={`mb-2.5 text-xs font-bold uppercase tracking-wider ${g.id === "dangerZone" ? "text-red-500" : "text-app-muted"}`}>
              {g.label}
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {g.items.map((s, i) => (
                <SettingsCard key={s.href} item={resolveItem(s)} index={i} />
              ))}
            </div>
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <p className="rounded-xl border border-dashed border-app-border p-4 text-center text-sm text-app-muted">
            {t("dashboard.pages.settings.noResults").replace("{query}", query)}
          </p>
        )}
      </div>
    </div>
  );
}
