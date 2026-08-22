// Ikon ilustrasi 3D yang disediakan pengguna langsung (permintaan 23
// Agustus 2026: "ganti semua icon di analytic dengan gambar yang sudah
// saya samakan namanya"), public/homepage/icon/*.png -- pola sama seperti
// Features.tsx/Monetization.tsx sebelumnya. "pelacakan konversi.png"
// SENGAJA pakai spasi (bukan tanda hubung) apa adanya sesuai nama file
// yang disediakan -- di-encode %20 di src supaya valid sebagai URL.
const points = [
  { title: "Analitik Pengunjung", desc: "Lihat dari mana traffic-mu datang dan siapa yang mengunjungi halamanmu.", image: "/homepage/icon/analitik-pengunjung.png" },
  { title: "Analitik Klik", desc: "Pantau tautan dan tombol mana yang paling banyak mendapat interaksi.", image: "/homepage/icon/analitik-klik.png" },
  { title: "Pelacakan Konversi", desc: "Pahami apa yang mengubah pengunjung menjadi pelanggan berbayar.", image: "/homepage/icon/pelacakan%20konversi.png" },
  { title: "Analitik Pendapatan", desc: "Pantau penghasilan dari setiap produk, kelas, dan booking.", image: "/homepage/icon/analitik-pendapatan.png" },
];

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
              {points.map((p) => (
                <div key={p.title} className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
                  <div>
                    <h3 className="mb-0.5 font-heading text-sm font-bold text-ink">{p.title}</h3>
                    <p className="text-xs leading-relaxed text-muted">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
