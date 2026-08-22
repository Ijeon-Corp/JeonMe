const points = [
  { title: "Analitik Pengunjung", desc: "Lihat dari mana traffic-mu datang dan siapa yang mengunjungi halamanmu.", color: "primary", icon: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" /> },
  { title: "Analitik Klik", desc: "Pantau tautan dan tombol mana yang paling banyak mendapat interaksi.", color: "accent", icon: <path d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /> },
  { title: "Pelacakan Konversi", desc: "Pahami apa yang mengubah pengunjung menjadi pelanggan berbayar.", color: "secondary", icon: <path d="M18 20V10M12 20V4M6 20v-6" /> },
  { title: "Analitik Pendapatan", desc: "Pantau penghasilan dari setiap produk, kelas, dan booking.", color: "primary", icon: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /> },
];

const colorMap: Record<string, { bg: string; icon: string }> = {
  primary: { bg: "bg-primary-subtle", icon: "#1B4D3E" },
  accent: { bg: "bg-accent-subtle", icon: "#C9A24B" },
  secondary: { bg: "bg-secondary-subtle", icon: "#1F7A6C" },
};

export default function Analytics() {
  return (
    <section className="relative overflow-hidden bg-white py-20 md:py-28" aria-label="Analitik">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="reveal order-2 lg:order-1">
            {/* Mockup "Ringkasan Performa" -- permintaan langsung pengguna,
                23 Agustus 2026: "di section analytics ganti dengan gambar
                analytics.png". SEBELUMNYA dibangun manual dari puluhan
                div/SVG (lihat riwayat git kalau perlu versi lama itu) --
                diganti satu file gambar (public/homepage/analytics.png),
                pola yang SAMA seperti penggantian mockup Hero.tsx (hero.png)
                & Monetization.tsx (monetization.png). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/homepage/analytics.png" alt="Dashboard analitik Jeon.id" className="w-full rounded-2xl object-contain shadow-hero" />
          </div>

          <div className="reveal order-1 lg:order-2" style={{ transitionDelay: "0.1s" }}>
            <h2 className="mb-5 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Tahu Persis
              <br />
              <span className="text-gradient">Apa yang Berhasil</span>
            </h2>
            <p className="mb-8 text-lg leading-relaxed text-muted">
              Dapatkan visibilitas real-time yang jelas tentang bagaimana audiensmu berinteraksi dengan halamanmu — dan ubah insight menjadi pertumbuhan.
            </p>
            <div className="space-y-4">
              {points.map((p) => {
                const c = colorMap[p.color];
                return (
                  <div key={p.title} className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${c.bg}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.icon} strokeWidth="2" aria-hidden="true">
                        {p.icon}
                      </svg>
                    </div>
                    <div>
                      <h3 className="mb-0.5 font-heading text-sm font-bold text-ink">{p.title}</h3>
                      <p className="text-xs leading-relaxed text-muted">{p.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
