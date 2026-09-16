"use client";

import { useLocale } from "@/lib/locale-context";

const features = [
  {
    key: "unlimitedLinks",
    color: "primary",
    icon: (
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    ),
  },
  {
    key: "beautifulThemes",
    color: "accent",
    icon: (
      <path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586M11 11a2 2 0 1 0 0 .01" />
    ),
  },
  {
    key: "analyticsDashboard",
    color: "secondary",
    icon: <path d="M18 20V10M12 20V4M6 20v-6" />,
  },
  {
    key: "digitalProducts",
    color: "primary",
    icon: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />,
  },
  {
    key: "collectEmail",
    color: "secondary",
    icon: <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6" />,
  },
  {
    key: "qrGenerator",
    color: "accent",
    icon: <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />,
  },
  // 4 fitur berikut ditambahkan permintaan langsung pengguna, 23 Agustus
  // 2026: "tambahkan fitur fiturnya benchmark dari linktree dan lynk id" --
  // dipilih fitur yang SUNGGUHAN sudah ada di backend (bukan janji kosong,
  // lihat handler terkait per item) yang jadi jualan utama dua kompetitor
  // itu tapi belum ditonjolkan di grid ini.
  {
    key: "socialFeeds",
    color: "secondary",
    icon: (
      <path d="M17 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM17.5 6.5h.01" />
    ),
  },
  {
    key: "contentLocks",
    color: "primary",
    icon: (
      <path d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 11V7a6 6 0 0 1 12 0v4M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
    ),
  },
  {
    key: "multiPage",
    color: "accent",
    icon: <path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
  },
  {
    key: "socialProof",
    color: "secondary",
    icon: (
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 0 1-3.46 0" />
    ),
  },
] as const;

// colorMap -- redesign Fase 2 (DESIGN-JEONID-REDESIGN.md §6): warna cerah
// sebagai pemisah fungsi -- chip ikon bergantian lavender/lime/blue,
// stroke ikon SELALU ink konstan #111 (chip-nya warna terang konstan di
// kedua mode, teks/ikon di atasnya tidak boleh ikut flip dark mode).
const colorMap: Record<string, { bg: string; icon: string; hoverBg: string }> = {
  primary: { bg: "bg-jeon-lavender", icon: "#111111", hoverBg: "group-hover:bg-jeon-purple" },
  accent: { bg: "bg-jeon-lime", icon: "#111111", hoverBg: "group-hover:bg-jeon-purple" },
  secondary: { bg: "bg-jeon-blue", icon: "#111111", hoverBg: "group-hover:bg-jeon-purple" },
};

// compact -- permintaan langsung pengguna, 23 Agustus 2026: "Di section
// features hanya tampilkan ini saja" (Tautan Tanpa Batas/Tema yang
// Indah/Produk Digital/Multi-Halaman & Toko) -- KHUSUS homepage, supaya
// section itu ringkas 1 baris 4 kartu. app/features/page.tsx (halaman
// SEO berdiri sendiri, metadata-nya menjanjikan daftar fitur LENGKAP)
// TETAP menampilkan semua item -- compact default false di sana. Dicocokkan
// lewat `key` (STABIL lintas locale) -- SEBELUMNYA lewat `title` string
// Indonesia langsung, yang sekarang berubah-ubah ikut locale aktif (t()),
// jadi tidak bisa lagi jadi identitas pencocokan.
const COMPACT_KEYS = ["unlimitedLinks", "beautifulThemes", "digitalProducts", "multiPage"];

// showHeading -- default true (homepage). false dipakai HANYA oleh
// app/features/page.tsx, yang sudah punya <h1> + intro sendiri di
// atasnya -- lihat komentar sama di Pricing.tsx soal kenapa (menghindari
// judul yang sama tampil dua kali berurutan).
export default function Features({ showHeading = true, compact = false }: { showHeading?: boolean; compact?: boolean }) {
  const { t } = useLocale();
  const visibleFeatures = compact ? features.filter((f) => COMPACT_KEYS.includes(f.key)) : features;

  return (
    <section id="features" className="relative overflow-hidden bg-jeon-paper py-20 md:py-28" aria-label="Fitur">
      <div className="relative mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        {showHeading ? (
          <div className="reveal mx-auto mb-14 max-w-3xl text-center">
            <h2 className="mb-4 font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-jeon-ink sm:text-5xl md:text-6xl">
              {t("features.heading1")}
              <br />
              <span className="text-jeon-purple">{t("features.headingGradient")}</span>
            </h2>
            <p className="text-lg leading-relaxed text-jeon-muted">{t("features.subtitle")}</p>
          </div>
        ) : (
          // sr-only h2 -- audit Lighthouse 17 September 2026, pola sama
          // persis PricingCards.tsx (lihat catatan lengkap di sana):
          // app/features/page.tsx showHeading=false supaya judul tidak
          // dobel dgn h1 halaman, tapi itu membuat h3 kartu fitur langsung
          // menyusul h1 tanpa h2 -- urutan heading jadi tidak berurutan.
          <h2 className="sr-only">{t("features.heading1")} {t("features.headingGradient")}</h2>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visibleFeatures.map((f, i) => {
            const c = colorMap[f.color];
            return (
              <div
                key={f.key}
                className="reveal group cursor-pointer rounded-jlg border-2 border-jeon-ink bg-jeon-surface p-6 text-center shadow-brutal transition-transform duration-150 hover:-translate-y-1"
                style={{ transitionDelay: `${0.05 + (i % 4) * 0.05}s` }}
              >
                {/* Ikon ilustrasi 3D PNG lama DIHAPUS (permintaan langsung
                    pengguna, 31 Agustus 2026: "tidak usah pakai image dan
                    icon yang sudah ada dari lama tapi sesuaikan dengan isi
                    tiap section nya") -- semua item sekarang seragam pakai
                    ikon garis SVG di chip warna token redesign. */}
                <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-jmd border-2 border-[#111111] transition-colors duration-250 ${c.bg} ${c.hoverBg}`}>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={c.icon}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    className="transition-colors duration-250 group-hover:stroke-white"
                    aria-hidden="true"
                  >
                    {f.icon}
                  </svg>
                </div>
                <h3 className="mb-2 font-display font-bold text-jeon-ink">{t(`features.items.${f.key}.title`)}</h3>
                <p className="text-sm leading-relaxed text-jeon-muted">{t(`features.items.${f.key}.desc`)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
