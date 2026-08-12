"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  IconBook,
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconGift,
  IconHeart,
  IconSearch,
  IconStar,
  IconTag,
  IconUsers,
} from "@/components/icons";

// DashboardMonetisasiPage -- konsolidasi sidebar (permintaan langsung
// pengguna, benchmark vs Linktree/Lynk.id, 8 Agustus 2026): 8 tipe
// produk/monetisasi ini SEBELUMNYA masing-masing jadi baris sidebar
// TERPISAH ("Produk & Monetisasi" 8 item) -- di kompetitor, semua ini
// cuma PILIHAN TIPE PRODUK dalam satu alur "Tambah Produk", bukan 8 menu
// sendiri-sendiri. Halaman/route masing-masing di bawah ini TIDAK
// berubah sama sekali (fungsional identik, tetap halaman penuh dengan
// pengaturan lengkap) -- yang berubah CUMA cara masuknya: dari sidebar
// sekarang cuma 1 baris ("Produk & Monetisasi") ke hub kartu ini.
// Semua badge ikon kartu SATU warna hijau tema (bg-primary-subtle
// text-primary) -- permintaan langsung pengguna, 10 Agustus 2026,
// menggantikan tint pop warna-warni per kartu era "Playful Creator" yang
// sudah tidak dipakai lagi sejak redesain "Premium Refined".
//
// Rombak tata letak (permintaan langsung pengguna, 12 Agustus 2026):
// "ganti juga bagian produk dan monetisasi" -- susulan langsung dari
// perombakan /dashboard/settings yang sama persis ("terlalu menumpuk dan
// terlihat jelek"), pola grid berkelompok DIPAKAI ULANG di sini APA
// ADANYA (bukan didesain ulang dari nol) supaya kedua hub tetap
// konsisten satu sama lain, bukan cuma /dashboard/settings saja yang
// dirapikan.
type MonetisasiItem = {
  href: string;
  title: string;
  description: string;
  icon: (props: { className?: string }) => React.ReactElement;
};

const MONETISASI_GROUPS: { label: string; items: MonetisasiItem[] }[] = [
  {
    label: "Harga & Paket",
    items: [
      {
        href: "/dashboard/vouchers",
        title: "Voucher",
        description: "Kode diskon untuk produkmu.",
        icon: IconTag,
      },
      {
        href: "/dashboard/bundles",
        title: "Bundel",
        description: "Gabungkan beberapa produk jadi satu paket harga.",
        icon: IconGift,
      },
    ],
  },
  {
    label: "Jadwal & Konten",
    items: [
      {
        href: "/dashboard/events",
        title: "Event",
        description: "Jual tiket acara online maupun offline.",
        icon: IconCalendar,
      },
      {
        href: "/dashboard/courses",
        title: "Kelas & Kursus",
        description: "Jual kelas online dengan beberapa bab/modul.",
        icon: IconBook,
      },
      {
        href: "/dashboard/bookings",
        title: "Booking Konsultasi",
        description: "Jadwal konsultasi berbayar dengan slot waktu.",
        icon: IconClock,
      },
    ],
  },
  {
    label: "Dukungan & Pertumbuhan",
    items: [
      {
        href: "/dashboard/donation",
        title: "Dukungan",
        description: "Blok donasi/support di halaman publikmu.",
        icon: IconHeart,
      },
      {
        href: "/dashboard/affiliates",
        title: "Afiliasi",
        description: "Ajak orang lain menjualkan produkmu, bagi komisi.",
        icon: IconUsers,
      },
      {
        href: "/dashboard/loyalty",
        title: "Loyalitas",
        description: "Program poin untuk pembeli berulang.",
        icon: IconStar,
      },
    ],
  },
];

function MonetisasiCard({ item }: { item: MonetisasiItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3.5 transition-colors hover:border-primary"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink">{item.title}</span>
        <span className="block truncate text-xs text-muted">{item.description}</span>
      </span>
      <IconChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
    </Link>
  );
}

export default function DashboardMonetisasiPage() {
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MONETISASI_GROUPS;
    return MONETISASI_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mt-1 text-sm text-muted">Tipe produk & alat monetisasi tambahan di luar produk digital biasa.</p>

      <div className="relative mt-5">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari tipe produk..."
          className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm text-ink focus:border-primary focus:outline-none"
        />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {filteredGroups.map((g) => (
          <div key={g.label}>
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted">{g.label}</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {g.items.map((s) => (
                <MonetisasiCard key={s.href} item={s} />
              ))}
            </div>
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
            Tidak ada tipe produk yang cocok dengan &quot;{query}&quot;.
          </p>
        )}
      </div>
    </div>
  );
}
