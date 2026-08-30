"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/locale-context";
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
// Semua badge ikon kartu SATU warna hijau tema (bg-jeon-purple/10
// text-jeon-purple) -- permintaan langsung pengguna, 10 Agustus 2026,
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

function buildGroups(t: (key: string) => string): { label: string; items: MonetisasiItem[] }[] {
  return [
    {
      label: t("dashboard.pages.monetisasi.groups.pricing.label"),
      items: [
        {
          href: "/dashboard/vouchers",
          title: t("dashboard.pages.monetisasi.groups.pricing.vouchers.title"),
          description: t("dashboard.pages.monetisasi.groups.pricing.vouchers.description"),
          icon: IconTag,
        },
        {
          href: "/dashboard/bundles",
          title: t("dashboard.pages.monetisasi.groups.pricing.bundles.title"),
          description: t("dashboard.pages.monetisasi.groups.pricing.bundles.description"),
          icon: IconGift,
        },
      ],
    },
    {
      label: t("dashboard.pages.monetisasi.groups.schedule.label"),
      items: [
        {
          href: "/dashboard/events",
          title: t("dashboard.pages.monetisasi.groups.schedule.events.title"),
          description: t("dashboard.pages.monetisasi.groups.schedule.events.description"),
          icon: IconCalendar,
        },
        {
          href: "/dashboard/courses",
          title: t("dashboard.pages.monetisasi.groups.schedule.courses.title"),
          description: t("dashboard.pages.monetisasi.groups.schedule.courses.description"),
          icon: IconBook,
        },
        {
          href: "/dashboard/bookings",
          title: t("dashboard.pages.monetisasi.groups.schedule.bookings.title"),
          description: t("dashboard.pages.monetisasi.groups.schedule.bookings.description"),
          icon: IconClock,
        },
      ],
    },
    {
      label: t("dashboard.pages.monetisasi.groups.growth.label"),
      items: [
        {
          href: "/dashboard/donation",
          title: t("dashboard.pages.monetisasi.groups.growth.donation.title"),
          description: t("dashboard.pages.monetisasi.groups.growth.donation.description"),
          icon: IconHeart,
        },
        {
          href: "/dashboard/affiliates",
          title: t("dashboard.pages.monetisasi.groups.growth.affiliates.title"),
          description: t("dashboard.pages.monetisasi.groups.growth.affiliates.description"),
          icon: IconUsers,
        },
        {
          href: "/dashboard/loyalty",
          title: t("dashboard.pages.monetisasi.groups.growth.loyalty.title"),
          description: t("dashboard.pages.monetisasi.groups.growth.loyalty.description"),
          icon: IconStar,
        },
      ],
    },
  ];
}

function MonetisasiCard({ item }: { item: MonetisasiItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 rounded-jmd border border-app-border bg-app-surface p-3.5 transition-colors hover:border-jeon-purple"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-jeon-purple/10 text-jeon-purple">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-app-ink">{item.title}</span>
        <span className="block truncate text-xs text-app-muted">{item.description}</span>
      </span>
      <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted" />
    </Link>
  );
}

export default function DashboardMonetisasiPage() {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => buildGroups(t), [t]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.monetisasi.subtitle")}</p>

      <div className="relative mt-5">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("dashboard.pages.monetisasi.searchPlaceholder")}
          className="w-full rounded-xl border border-app-border bg-app-surface py-2.5 pl-9 pr-3 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
        />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {filteredGroups.map((g) => (
          <div key={g.label}>
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-app-muted">{g.label}</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {g.items.map((s) => (
                <MonetisasiCard key={s.href} item={s} />
              ))}
            </div>
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <p className="rounded-xl border border-dashed border-app-border p-4 text-center text-sm text-app-muted">
            {t("dashboard.pages.monetisasi.noResults").replace("{query}", query)}
          </p>
        )}
      </div>
    </div>
  );
}
