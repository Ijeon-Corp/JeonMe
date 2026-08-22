// Dipersempit jadi 3 item -- permintaan langsung pengguna, 23 Agustus 2026:
// "hanya tampilkan ini saja di sebelah kiri nya Jual Produk Digital,
// Membership, Affiliator".
const items = [
  { label: "Jual Produk Digital", color: "primary", icon: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /> },
  { label: "Membership", color: "primary", icon: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /> },
  { label: "Affiliator", color: "accent", icon: <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z M2 12h20" /> },
];

const colorMap: Record<string, { bg: string; icon: string }> = {
  primary: { bg: "bg-primary-subtle", icon: "#1B4D3E" },
  accent: { bg: "bg-accent-subtle", icon: "#C9A24B" },
  secondary: { bg: "bg-secondary-subtle", icon: "#1F7A6C" },
};

export default function Monetization() {
  return (
    <section id="monetization" className="relative overflow-hidden bg-white py-20 md:py-28" aria-label="Monetisasi">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="reveal">
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
            {/* Mockup dashboard pendapatan -- permintaan langsung pengguna,
                23 Agustus 2026: "ganti gambar disampingnya dengan gambar
                monetization.png". SEBELUMNYA dashboard pendapatan dibangun
                manual dari puluhan div/SVG (lihat riwayat git kalau perlu
                versi lama itu) -- diganti satu file gambar
                (public/homepage/monetization.png), pola yang SAMA seperti
                penggantian mockup Hero.tsx (hero.png, lihat catatan sama di
                sana). */}
            <div className="w-full max-w-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/homepage/monetization.png" alt="Dashboard pendapatan & monetisasi Jeon.id" className="w-full rounded-2xl object-contain shadow-hero" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
