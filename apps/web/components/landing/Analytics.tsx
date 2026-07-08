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
            <div className="shadow-hero rounded-2xl border border-border bg-white p-6">
              <div className="mb-5 flex items-center justify-between">
                <p className="font-heading font-bold text-ink">Ringkasan Performa</p>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-muted">30 hari terakhir</span>
              </div>
              <div className="mb-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-primary/10 bg-primary-subtle p-4">
                  <p className="mb-1 text-[11px] text-muted">Pengunjung</p>
                  <p className="font-heading text-xl font-extrabold text-ink">48,2K</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-green-600">↑ 18% dari bulan lalu</p>
                </div>
                <div className="rounded-xl border border-secondary/10 bg-secondary-subtle p-4">
                  <p className="mb-1 text-[11px] text-muted">Rasio Klik</p>
                  <p className="font-heading text-xl font-extrabold text-ink">32,4%</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-green-600">↑ 6% dari bulan lalu</p>
                </div>
              </div>
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-ink">Pelacakan Konversi</p>
                  <span className="text-[10px] font-semibold text-secondary-dark">rata-rata 12,8%</span>
                </div>
                <svg viewBox="0 0 300 60" className="h-14 w-full" preserveAspectRatio="none">
                  <polyline points="0,45 30,40 60,42 90,30 120,32 150,18 180,22 210,12 240,15 270,6 300,8" fill="none" stroke="#1B4D3E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="0,45 30,40 60,42 90,30 120,32 150,18 180,22 210,12 240,15 270,6 300,8 300,60 0,60" fill="url(#analyticsGrad)" opacity="0.18" stroke="none" />
                  <defs>
                    <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1B4D3E" />
                      <stop offset="100%" stopColor="#1B4D3E" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="space-y-2">
                <p className="mb-2 text-xs font-semibold text-ink">Tautan Berperforma Terbaik</p>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-medium text-ink">Beli Ebook</p>
                  <span className="text-[11px] font-bold text-primary">3.204 klik</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-medium text-ink">Gabung Kelas</p>
                  <span className="text-[11px] font-bold text-primary">2.118 klik</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-medium text-ink">Booking Konsultasi</p>
                  <span className="text-[11px] font-bold text-primary">1.540 klik</span>
                </div>
              </div>
            </div>
          </div>

          <div className="reveal order-1 lg:order-2" style={{ transitionDelay: "0.1s" }}>
            <span className="mb-4 inline-block rounded-full border border-secondary/15 bg-secondary-subtle px-3 py-1.5 text-xs font-semibold text-secondary-dark">
              Analitik
            </span>
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
