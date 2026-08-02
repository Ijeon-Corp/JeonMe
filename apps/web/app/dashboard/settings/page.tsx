"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconChevronRight, IconPencil, IconSearch, IconShield, IconTrash, IconUsers, IconWallet } from "@/components/icons";

// Modul Settings §1: search box di atas daftar menu settings, filter
// client-side atas label + deskripsi -- fitur yang TIDAK ada di Lynk.id,
// jangan dilewati walau daftarnya masih pendek di fase awal ini.
const SETTINGS_SECTIONS = [
  {
    href: "/dashboard/settings/profile",
    title: "Profil & Akun",
    description: "Nama tampilan, bio, username, kategori kreator.",
    icon: IconPencil,
  },
  {
    href: "/dashboard/settings/security",
    title: "Keamanan",
    description: "Ganti password, verifikasi dua langkah (2FA), sesi aktif.",
    icon: IconShield,
  },
  {
    href: "/dashboard/settings/payment",
    title: "Pembayaran & Penarikan",
    description: "Rekening/e-wallet, verifikasi, jadwal auto-withdraw.",
    icon: IconWallet,
  },
  {
    href: "/dashboard/team",
    title: "Tim & Kolaborator",
    description: "Undang admin dengan akses tautan/produk/desain.",
    icon: IconUsers,
  },
  {
    href: "/dashboard/settings/danger-zone",
    title: "Zona Berbahaya",
    description: "Nonaktifkan atau hapus akun.",
    icon: IconTrash,
  },
];

export default function DashboardSettingsPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SETTINGS_SECTIONS;
    return SETTINGS_SECTIONS.filter(
      (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mt-1 text-sm text-muted">Kelola akun, pembayaran, tim, dan keamananmu.</p>

      <div className="relative mt-5">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari pengaturan..."
          className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm text-ink focus:border-primary focus:outline-none"
        />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {filtered.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 transition-colors hover:border-primary"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-ink">{s.title}</span>
                <span className="block text-xs text-muted">{s.description}</span>
              </span>
              <IconChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
            Tidak ada pengaturan yang cocok dengan &quot;{query}&quot;.
          </p>
        )}
      </div>
    </div>
  );
}
