const features = [
  {
    title: "Tautan Tanpa Batas",
    desc: "Tambahkan tautan sebanyak yang kamu mau dan atur sesuai keinginanmu.",
    color: "primary",
    icon: (
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    ),
  },
  {
    title: "Tema yang Indah",
    desc: "Sesuaikan warna, font, background, dan tombol agar sesuai brand-mu.",
    color: "accent",
    icon: (
      <path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586M11 11a2 2 0 1 0 0 .01" />
    ),
  },
  {
    title: "Dashboard Analitik",
    desc: "Pantau klik, pengunjung, konversi, dan engagement secara real-time.",
    color: "secondary",
    icon: <path d="M18 20V10M12 20V4M6 20v-6" />,
  },
  {
    title: "Produk Digital",
    desc: "Jual ebook, template, kelas, dan file langsung dari halamanmu.",
    color: "primary",
    icon: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />,
  },
  {
    title: "Booking Konsultasi",
    desc: "Terima konsultasi berbayar langsung melalui halaman bio-mu.",
    color: "accent",
    icon: <path d="M3 4h18c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H3c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" />,
  },
  {
    title: "Kumpulkan Email",
    desc: "Bangun dan kembangkan audiensmu dengan form pengumpulan email.",
    color: "secondary",
    icon: <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6" />,
  },
  {
    title: "Domain Kustom",
    desc: "Gunakan domainmu sendiri agar brand-mu tetap menjadi sorotan utama.",
    color: "primary",
    icon: <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z M2 12h20" />,
  },
  {
    title: "Generator Kode QR",
    desc: "Buat kode QR secara instan untuk bagikan halamanmu di mana saja.",
    color: "accent",
    icon: <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />,
  },
];

const colorMap: Record<string, { bg: string; icon: string; hoverBg: string }> = {
  primary: { bg: "bg-primary-subtle", icon: "#1B4D3E", hoverBg: "group-hover:bg-primary" },
  accent: { bg: "bg-accent-subtle", icon: "#C9A24B", hoverBg: "group-hover:bg-accent" },
  secondary: { bg: "bg-secondary-subtle", icon: "#1F7A6C", hoverBg: "group-hover:bg-secondary" },
};

// showHeading -- default true (homepage). false dipakai HANYA oleh
// app/features/page.tsx, yang sudah punya <h1> + intro sendiri di
// atasnya -- lihat komentar sama di Pricing.tsx soal kenapa (menghindari
// judul yang sama tampil dua kali berurutan).
export default function Features({ showHeading = true }: { showHeading?: boolean }) {
  return (
    <section id="features" className="relative overflow-hidden bg-white py-20 md:py-28" aria-label="Fitur">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {showHeading && (
          <div className="reveal mx-auto mb-14 max-w-2xl text-center">
            <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Semua yang Dibutuhkan Kreator,
              <br />
              <span className="text-gradient">Ada di Satu Halaman</span>
            </h2>
            <p className="text-lg leading-relaxed text-muted">
              Dari manajemen tautan hingga monetisasi — Jeon.id memberimu toolkit lengkap untuk bertumbuh.
            </p>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => {
            const c = colorMap[f.color];
            return (
              <div
                key={f.title}
                className="pop-card reveal group cursor-pointer rounded-2xl border border-border bg-white p-6 shadow-card"
                style={{ transitionDelay: `${0.05 + (i % 4) * 0.05}s` }}
              >
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl transition-colors duration-250 ${c.bg} ${c.hoverBg}`}>
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
                <h3 className="mb-2 font-heading font-bold text-ink">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
