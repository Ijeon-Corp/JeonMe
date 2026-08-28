"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getMyPage } from "@/lib/api-client";
import {
  IconChart,
  IconChevronRight,
  IconExternal,
  IconGlobe,
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
// Linktree/Lynk.id, 8 Agustus 2026): "Verifikasi KYC" & "Domain Kustom"
// SEBELUMNYA baris sidebar utama TERSENDIRI -- keduanya termasuk
// pengaturan akun/teknis yang dibuka jarang (sekali di awal, bukan
// harian), sama seperti "Tim & Kolaborator" yang MEMANG SUDAH lama ada
// di sini juga (dulu dobel-tampil, sekarang cuma di sini). Rute
// masing-masing TIDAK berubah, cuma jalur masuknya lewat hub ini.
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
  badgeClass: string;
  // statusPill -- opsional, ditambahkan lewat resolveItem() di bawah untuk
  // menandai status YANG SEDANG AKTIF (bukan cuma deskripsi statis) --
  // permintaan langsung pengguna, 28 Agustus 2026: "akun saya kan sudah
  // berlangganan premium tapi gada informasi nya, harusnya ada info
  // tentang langganan premium nya di setting akun". Sebelum ini kartu
  // "Langganan Premium" SELALU menampilkan teks upsell yang sama persis
  // baik untuk kreator gratis MAUPUN yang sudah Premium.
  statusPill?: string;
};

const SETTINGS_GROUPS: { label: string; items: SettingsItem[] }[] = [
  {
    label: "Akun",
    items: [
      {
        href: "/dashboard/settings/profile",
        title: "Profil & Akun",
        description: "Nama tampilan, bio, username, kategori kreator.",
        icon: IconPencil,
        badgeClass: "bg-primary-subtle text-primary",
      },
      {
        href: "/dashboard/settings/security",
        title: "Keamanan",
        description: "Ganti password, verifikasi dua langkah (2FA), sesi aktif.",
        icon: IconShield,
        badgeClass: "bg-primary-subtle text-primary",
      },
      {
        href: "/dashboard/settings/seo",
        title: "SEO",
        description: "Judul/deskripsi pencarian, sembunyikan dari mesin pencari.",
        icon: IconSearch,
        badgeClass: "bg-primary-subtle text-primary",
      },
    ],
  },
  {
    label: "Uang & Verifikasi",
    items: [
      {
        href: "/dashboard/settings/payment",
        title: "Pembayaran & Penarikan",
        description: "Rekening/e-wallet, verifikasi, jadwal auto-withdraw.",
        icon: IconWallet,
        badgeClass: "bg-primary-subtle text-primary",
      },
      {
        href: "/dashboard/kyc",
        title: "Verifikasi KYC",
        description: "Upload identitas untuk membuka penarikan dana.",
        icon: IconShield,
        badgeClass: "bg-primary-subtle text-primary",
      },
    ],
  },
  {
    label: "Pertumbuhan",
    items: [
      {
        href: "/dashboard/settings/subscription",
        title: "Langganan Premium",
        description: "Hilangkan watermark, latar belakang kustom.",
        icon: IconStar,
        badgeClass: "bg-primary-subtle text-primary",
      },
      {
        href: "/dashboard/custom-domain",
        title: "Domain Kustom",
        description: "Pakai domainmu sendiri untuk halaman publik.",
        icon: IconGlobe,
        badgeClass: "bg-primary-subtle text-primary",
      },
      {
        href: "/dashboard/team",
        title: "Tim & Kolaborator",
        description: "Undang admin dengan akses tautan/produk/desain.",
        icon: IconUsers,
        badgeClass: "bg-primary-subtle text-primary",
      },
      {
        href: "/dashboard/analytics",
        title: "Analitik",
        description: "Facebook Pixel, Google Analytics, parameter UTM.",
        icon: IconChart,
        badgeClass: "bg-primary-subtle text-primary",
      },
      // Modul Koneksi Sosial -- permintaan langsung pengguna, 17 Agustus
      // 2026: "saya mau jeonme ini bisa connect ke akun kita contoh nya
      // instagram tiktok" (diriset dulu vs Linktree -- profil + postingan/
      // video terbaru tampil otomatis di halaman publik, beda dari tautan
      // Instagram/TikTok biasa yang sudah ada di menu Link Bio).
      {
        href: "/dashboard/social-connect",
        title: "Koneksi Sosial",
        description: "Sambungkan Instagram/TikTok, tampilkan postingan terbaru otomatis.",
        icon: IconExternal,
        badgeClass: "bg-primary-subtle text-primary",
      },
    ],
  },
  {
    label: "Zona Berbahaya",
    items: [
      {
        href: "/dashboard/settings/danger-zone",
        title: "Zona Berbahaya",
        description: "Nonaktifkan atau hapus akun.",
        icon: IconTrash,
        badgeClass: "bg-red-50 text-red-600",
      },
    ],
  },
];

function SettingsCard({ item }: { item: SettingsItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface p-3.5 transition-colors hover:border-primary"
    >
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${item.badgeClass}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-sm font-bold text-app-ink">{item.title}</span>
          {item.statusPill && (
            <span className="flex-shrink-0 rounded-full bg-secondary-subtle px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-secondary-dark">
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

  // resolveItem -- menimpa description/statusPill kartu "Langganan
  // Premium" kalau kreator ini SUDAH Premium, supaya kartu itu sendiri
  // langsung menunjukkan status aktif (bukan cuma teks upsell generik yang
  // sama untuk semua orang) tanpa perlu buka halamannya.
  function resolveItem(item: SettingsItem): SettingsItem {
    if (item.href !== "/dashboard/settings/subscription" || !isPremium) return item;
    return { ...item, description: "Watermark disembunyikan, latar kustom aktif.", statusPill: "Aktif" };
  }

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SETTINGS_GROUPS;
    return SETTINGS_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mt-1 text-sm text-app-muted">Kelola akun, pembayaran, tim, dan keamananmu.</p>

      <div className="relative mt-5">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari pengaturan..."
          className="w-full rounded-xl border border-app-border bg-app-surface py-2.5 pl-9 pr-3 text-sm text-app-ink focus:border-primary focus:outline-none"
        />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {filteredGroups.map((g) => (
          <div key={g.label}>
            <p className={`mb-2.5 text-xs font-bold uppercase tracking-wider ${g.label === "Zona Berbahaya" ? "text-red-500" : "text-app-muted"}`}>
              {g.label}
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {g.items.map((s) => (
                <SettingsCard key={s.href} item={resolveItem(s)} />
              ))}
            </div>
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <p className="rounded-xl border border-dashed border-app-border p-4 text-center text-sm text-app-muted">
            Tidak ada pengaturan yang cocok dengan &quot;{query}&quot;.
          </p>
        )}
      </div>
    </div>
  );
}
