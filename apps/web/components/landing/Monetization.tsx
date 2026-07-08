const items = [
  { label: "Jual Produk Digital", color: "primary", icon: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /> },
  { label: "Jual Kelas Online", color: "accent", icon: <path d="M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5" /> },
  { label: "Konsultasi Berbayar", color: "secondary", icon: <path d="M3 4h18c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H3c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /> },
  { label: "Donasi", color: "rose", icon: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /> },
  { label: "Membership", color: "primary", icon: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /> },
  { label: "Tautan Afiliasi", color: "accent", icon: <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z M2 12h20" /> },
];

const colorMap: Record<string, { bg: string; icon: string }> = {
  primary: { bg: "bg-primary-subtle", icon: "#1B4D3E" },
  accent: { bg: "bg-accent-subtle", icon: "#C9A24B" },
  secondary: { bg: "bg-secondary-subtle", icon: "#1F7A6C" },
  rose: { bg: "bg-rose-50", icon: "#E11D48" },
};

export default function Monetization() {
  return (
    <section id="monetization" className="relative overflow-hidden bg-white py-20 md:py-28" aria-label="Monetisasi">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="reveal">
            <span className="mb-4 inline-block rounded-full border border-accent/15 bg-accent-subtle px-3 py-1.5 text-xs font-semibold text-accent-dark">
              Monetisasi
            </span>
            <h2 className="mb-5 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Ubah Audiensmu
              <br />
              <span className="text-gradient">Menjadi Penghasilan</span>
            </h2>
            <p className="mb-8 text-lg leading-relaxed text-muted">
              Aktifkan tools monetisasi yang kamu butuhkan — tanpa aplikasi tambahan, tanpa login berulang.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => {
                const c = colorMap[item.color];
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-white p-3.5 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-card"
                  >
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${c.bg}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.icon} strokeWidth="2" aria-hidden="true">
                        {item.icon}
                      </svg>
                    </div>
                    <p className="text-xs font-bold leading-snug text-ink">{item.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="reveal flex justify-center lg:justify-end" style={{ transitionDelay: "0.15s" }}>
            <div className="relative w-full max-w-sm">
              <div className="shadow-hero overflow-hidden rounded-2xl border border-border bg-white">
                <div className="gradient-cta relative p-6 text-center">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/80">Total Pendapatan Bulan Ini</p>
                  <p className="font-heading text-3xl font-extrabold text-white">Rp142,4jt</p>
                  <p className="mt-1 flex items-center justify-center gap-1 text-xs text-white/70">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
                    +41% dari bulan lalu
                  </p>
                </div>
                <div className="p-5">
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-primary/10 bg-primary-subtle p-3">
                      <p className="mb-1 text-[10px] text-muted">Produk</p>
                      <p className="font-heading text-lg font-extrabold leading-none text-primary">24</p>
                    </div>
                    <div className="rounded-xl border border-accent/10 bg-accent-subtle p-3">
                      <p className="mb-1 text-[10px] text-muted">Kelas</p>
                      <p className="font-heading text-lg font-extrabold leading-none text-accent">6</p>
                    </div>
                    <div className="rounded-xl border border-secondary/10 bg-secondary-subtle p-3">
                      <p className="mb-1 text-[10px] text-muted">Booking</p>
                      <p className="font-heading text-lg font-extrabold leading-none text-secondary-dark">38</p>
                    </div>
                  </div>
                  <div className="mb-3 rounded-xl border border-border bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-semibold text-ink">Pendapatan — 6 Bulan</p>
                      <span className="flex items-center gap-0.5 rounded bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold text-green-600">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>41%
                      </span>
                    </div>
                    <div className="flex h-12 items-end gap-1.5">
                      <div className="mock-bar flex-1 rounded-sm bg-emerald-100" style={{ height: "35%" }} />
                      <div className="mock-bar flex-1 rounded-sm bg-emerald-200" style={{ height: "55%", animationDelay: "0.2s" }} />
                      <div className="mock-bar flex-1 rounded-sm bg-teal-300" style={{ height: "48%", animationDelay: "0.4s" }} />
                      <div className="mock-bar flex-1 rounded-sm bg-primary" style={{ height: "75%", animationDelay: "0.6s" }} />
                      <div className="mock-bar flex-1 rounded-sm bg-accent" style={{ height: "65%", animationDelay: "0.8s" }} />
                      <div className="mock-bar flex-1 rounded-sm bg-secondary" style={{ height: "95%", animationDelay: "1s" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 shadow-sm">
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary-subtle">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1B4D3E" strokeWidth="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-semibold text-ink">Ebook &quot;Design Systems&quot;</p>
                        <p className="text-[9px] text-muted">312 terjual</p>
                      </div>
                      <span className="flex-shrink-0 rounded bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold text-green-600">Laris</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 shadow-sm">
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-accent-subtle">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C9A24B" strokeWidth="2" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5" /></svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-semibold text-ink">Cohort Mentoring UX</p>
                        <p className="text-[9px] text-muted">86 terdaftar</p>
                      </div>
                      <span className="flex-shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-accent-dark">Kelas</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="glass absolute -right-4 -top-4 rounded-xl px-3 py-2.5 shadow-card">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted">Pencairan hari ini</p>
                    <p className="font-heading text-xs font-extrabold text-green-600">+Rp9,3jt</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
